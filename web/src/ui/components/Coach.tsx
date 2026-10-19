// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Coach.kt
//
// The guide overlay, after the pocket operator app's tutorial: the page fades,
// and every marked control gets a coloured tag with an arrow pointing at it.
// Tags above the middle of the screen hang below their control and the others
// stand above it; neighbours on one line take turns at two heights so they
// don't overlap. In a short window (a phone on its side, the top bar's tags
// crowding the row of words under it) no tag sits on another control or on
// another tag's arrow: it goes to the other side of its control, beside it or
// further out (the placement is the pure layoutTags in ui/coachPlace.ts).
// A narrow control on the screen's edge (the GUIDE tab, the more-tools strip)
// gets the PO tutorial's side tag: a vertical tab on that edge, its word
// turned, with a hooked arrow above pointing at the edge.
// Tap anywhere (or Escape) to close.
//
// A control scrolled out of view, mostly cut off by a scrolling panel it is in
// (the docked tools), or under a layer marked data-coach-cover (the open Live tools
// panel), gets no tag. Where a marked element's touch area
// reaches past what shows (a word), its data-coach-box part is pointed at.
//
// Marking a control, two ways:
// - useCoachMark(id, label, face, ink) returns a ref callback (Kotlin's
//   Modifier.coachMark): <button ref={useCoachMark('side.more', ...)}>.
// - a data-coach="<id>" attribute on the element; its tag then comes from
//   COACH_MARKS (the Kotlin call sites' labels and colours), or from
//   data-coach-label / data-coach-face / data-coach-ink when present.
//   A hook registration wins over an attribute with the same id.
// A control with no tag that the tags should still keep off (Kotlin's
// Modifier.coachClear: the octave's − and +) carries data-coach-clear.
//
// The overlay measures the tags with the real font (after document.fonts.ready),
// reads the controls' bounds and places everything before the first paint; it
// recomputes on resize, scroll and when the marked controls change.
//
// Web delta: outside a short window too, a placement that leaves a tag on a
// control or an arrow across one gives way to the short window's rules when
// they fit better (layoutTags): Device's keys under the top bar, upright.
//
// Try arc (the first-run tour) uses the same overlay with a [CoachMode]: no
// close hint, and the veil does nothing when tapped. It shows the step card
// ([CoachOverlayProps.card], placed by ui/tourPlace.ts) and, with a spotlight,
// a hole in the veil (clip-path: path(evenodd …)) ringed in orange around the
// control the step is about, tagged unless it is a tall area (the card's
// heading names the pads) or on the screen's edge (a side tag would cover it). Only the veil and the card take pointer events;
// the page under the hole stays inert except with passThrough (HEAR and the
// offline steps), where the marked control (the pads, the more-tools strip,
// the GUIDE tab, the section tag) takes touches and everything else on the
// page is inert (a mark that is a box over its controls, the desk's pads,
// names them with data-coach-pass). Without a mode the overlay is the "?"
// guide, unchanged.
import { createContext, type ComponentChildren, type JSX, type RefObject } from 'preact'
import { signal, type Signal } from '@preact/signals'
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { CoachText } from '../../core/text/coachText'
import { WebText } from '../../core/text/webText'
import {
  COACH_METRICS,
  NO_INSETS,
  arrowHead,
  edgeOf,
  hintTop,
  isTall,
  layoutTags,
  sideHook,
  type Box,
  type CoachMarkInput,
  type Insets,
  type PlacedTag,
  type Size,
} from '../coachPlace'
import { holeOf, placeTourCard, tourCardWidth, veilPath, type TourPlacement } from '../tourPlace'
import './Coach.css'

/** The pocket operator app's yellow tip tags, for hints that aren't one key (Kotlin CoachYellow). */
export const COACH_YELLOW = 'var(--coach-yellow)'
export const COACH_YELLOW_INK = 'var(--coach-yellow-ink)'

/** Every control the overlay knows, by screen. */
export const COACH_IDS = [
  'top.sections',
  'top.bluetooth',
  'top.connection',
  'top.sample',
  'top.help',
  'top.theme',
  'edge.guide',
  'backups.backup',
  'backups.search',
  'backups.import',
  'backups.open',
  'live.pads',
  'live.keys',
  'live.record',
  'live.erase',
  'live.step',
  'live.scene',
  'live.sound',
  'live.project',
  'live.tempo',
  'live.mode',
  'live.arp',
  'live.claude',
  'live.scale',
  'live.octave',
  'live.key',
  'live.view',
  'live.groups',
  'live.sounds',
  'side.more',
  'tools.settings',
  'device.refresh',
  'device.add',
  'device.switch',
  'device.play',
] as const
export type CoachId = (typeof COACH_IDS)[number]

/** A tag: its text and colours (CSS colours). */
export interface CoachMarkSpec {
  readonly label: string
  readonly face: string
  readonly ink: string
}

const navyTag = (label: string): CoachMarkSpec => ({ label, face: 'var(--navy)', ink: 'var(--on-navy)' })
const yellowTag = (label: string): CoachMarkSpec => ({ label, face: COACH_YELLOW, ink: COACH_YELLOW_INK })
const signalTag = (label: string): CoachMarkSpec => ({ label, face: 'var(--signal)', ink: 'var(--on-signal)' })

/**
 * The tags of the Kotlin coachMark call sites (Chrome.kt, MainScreen.kt,
 * MirrorScreen.kt, DeviceScreen.kt, SideZone.kt), for controls marked with a
 * data-coach attribute. top.connection is navy here; [coachSpecFor] makes it
 * green while the connection key says connected.
 */
export const COACH_MARKS: Readonly<Record<CoachId, CoachMarkSpec>> = Object.freeze({
  'top.sections': navyTag(CoachText.SECTIONS),
  // Live's amber key while the sound plays late (the face of the key itself; Chrome.kt's TagInk).
  'top.bluetooth': { label: CoachText.BLUETOOTH, face: 'var(--warn)', ink: 'var(--tag-ink)' },
  'top.connection': navyTag(CoachText.CONNECTION),
  // Live's mic key (Chrome.kt: the signal tag).
  'top.sample': signalTag(CoachText.SAMPLE),
  'top.help': { label: CoachText.HELP, face: 'var(--ink)', ink: 'var(--shell)' },
  // Web: the desk's theme switch, after the ? key (the nav rail's Settings key
  // says Settings in words).
  'top.theme': navyTag(CoachText.THEME),
  'edge.guide': navyTag(CoachText.GUIDE_TAB),
  'backups.backup': { label: CoachText.BACK_UP, face: 'var(--signal)', ink: 'var(--on-signal)' },
  'backups.search': navyTag(CoachText.SEARCH),
  'backups.import': navyTag(CoachText.IMPORT),
  'backups.open': yellowTag(CoachText.OPEN_BACKUP),
  'live.pads': yellowTag(CoachText.PADS),
  // The KEYS grid: the same tip as the pads (MirrorScreen.kt).
  'live.keys': yellowTag(CoachText.PADS),
  // The display line's keys (PatternLine.kt): signal tags.
  'live.record': signalTag(CoachText.RECORD),
  'live.erase': signalTag(CoachText.ERASE),
  'live.step': signalTag(CoachText.STEP),
  'live.scene': signalTag(CoachText.SCENE),
  // The function keys (LiveFunctionKeys.kt): SOUND says what EDIT does, in signal; PROJECT and TEMPO navy.
  'live.sound': signalTag(CoachText.EDIT),
  'live.project': navyTag(CoachText.PROJECT),
  'live.tempo': navyTag(CoachText.TEMPO),
  'live.mode': navyTag(CoachText.MODE),
  // ARP / RPT and LATCH after the mode word (LiveArp.kt).
  'live.arp': navyTag(CoachText.ARP),
  // Live tools' CLAUDE card (LiveClaude.kt).
  'live.claude': navyTag(CoachText.CLAUDE),
  'live.scale': navyTag(CoachText.SCALE),
  'live.octave': navyTag(CoachText.OCTAVE),
  // The row over the piano: the key word, and the Pads ⇄ Piano switch.
  'live.key': navyTag(CoachText.KEY),
  'live.view': navyTag(CoachText.KEYS_VIEW),
  'live.groups': navyTag(CoachText.GROUPS),
  // The desk's Sounds tab, beside the K.O. II.
  'live.sounds': yellowTag(CoachText.SOUNDS_TAB),
  'side.more': { label: CoachText.MORE_TOOLS, face: 'var(--ink)', ink: 'var(--shell)' },
  // Live tools' first row (an addition), tagged while the tools are open.
  'tools.settings': { label: CoachText.SETTINGS, face: 'var(--graphite)', ink: 'var(--shell)' },
  'device.refresh': navyTag(CoachText.REFRESH),
  'device.add': { label: CoachText.ADD_SAMPLES, face: 'var(--signal)', ink: 'var(--on-signal)' },
  'device.switch': yellowTag(CoachText.SOUNDS_PROJECTS),
  // Web: "Play it here" replaces CoachText.PLAY "Play on the phone".
  'device.play': yellowTag(WebText.COACH_PLAY),
})

/**
 * The attributes marking a control [id] (data-coach), or, [clear] (Kotlin
 * coachClear: the line's keys while compact, in the top bar), none but tags
 * keep off it (data-coach-clear).
 */
export function coachAttrs(id: CoachId, clear = false): { 'data-coach'?: CoachId; 'data-coach-clear'?: '' } {
  return clear ? { 'data-coach-clear': '' } : { 'data-coach': id }
}

/**
 * The tags that give way, the first first, where not every tag can stand clear (a web delta:
 * a 360 phone with Live's Bluetooth key): the display line's and the function keys', the
 * scene's and STEP's first, SOUND's (EDIT's only tag) last.
 */
export const COACH_SPARE: readonly CoachId[] = ['live.scene', 'live.step', 'live.erase', 'live.tempo', 'live.project', 'live.record', 'live.sound']

const isCoachId = (id: string): id is CoachId => (COACH_IDS as readonly string[]).includes(id)

/** The tag for an element marked with data-coach="<id>"; null for an unknown id without its own label. */
export function coachSpecFor(id: string, el: Element): CoachMarkSpec | null {
  const base: CoachMarkSpec | null = isCoachId(id) ? COACH_MARKS[id] : null
  let spec = base
  // Chrome.kt: the connection tag is green (ok) and says to hold while connected, navy while not.
  if (id === 'top.connection') {
    const label = CoachText.CONNECTED_NAME.replace(/"/g, '\\"')
    const on = el.getAttribute('aria-label') === CoachText.CONNECTED_NAME || el.querySelector(`[aria-label="${label}"]`) !== null
    if (on) spec = { label: CoachText.CONNECTION_HOLD, face: 'var(--ok)', ink: 'var(--on-ok)' }
  }
  const label = el.getAttribute('data-coach-label') ?? spec?.label
  if (!label) return null
  return {
    label,
    face: el.getAttribute('data-coach-face') ?? spec?.face ?? 'var(--navy)',
    ink: el.getAttribute('data-coach-ink') ?? spec?.ink ?? 'var(--on-navy)',
  }
}

// ---------- the registry (Kotlin CoachMarks + LocalCoachMarks) ----------

interface Entry {
  readonly el: Element
  readonly spec: CoachMarkSpec
}

/**
 * The tour's card sits in the lower half of the screen (MainActivity's
 * tourCardLow): the toast then shows at the top, else at the bottom.
 */
export const tourCardLow: Signal<boolean> = signal(false)

/** The marks registered by useCoachMark under one CoachHost. */
export class CoachRegistry {
  private readonly entries = new Map<string, Entry>()
  /** Bumped on every change, so an open overlay recomputes. */
  readonly version: Signal<number> = signal(0)

  set(id: string, el: Element, spec: CoachMarkSpec): void {
    const old = this.entries.get(id)
    if (old && old.el === el && old.spec.label === spec.label && old.spec.face === spec.face && old.spec.ink === spec.ink) return
    this.entries.set(id, { el, spec })
    this.version.value++
  }

  /** Removes [id] if [el] still holds it (a newer control with the same id stays). */
  remove(id: string, el: Element): void {
    if (this.entries.get(id)?.el !== el) return
    this.entries.delete(id)
    this.version.value++
  }

  list(): [string, Entry][] {
    return [...this.entries]
  }

  /** The control registered as [id], if any. */
  get(id: string): Element | null {
    return this.entries.get(id)?.el ?? null
  }
}

const CoachContext = createContext<CoachRegistry | null>(null)

/**
 * Registers a control for the guide overlay (Kotlin Modifier.coachMark); a
 * no-op outside a CoachHost. Returns the ref callback to put on the element.
 */
export function useCoachMark(id: string, label: string, face: string, ink: string): (el: Element | null) => void {
  const reg = useContext(CoachContext)
  const el = useRef<Element | null>(null)
  const spec = useRef<CoachMarkSpec>({ label, face, ink })
  spec.current = { label, face, ink }
  useLayoutEffect(() => {
    if (reg && el.current) reg.set(id, el.current, spec.current)
  }, [reg, id, label, face, ink])
  useEffect(() => () => {
    if (reg && el.current) reg.remove(id, el.current)
  }, [reg, id])
  return useCallback((node: Element | null) => {
    if (reg && el.current && el.current !== node) reg.remove(id, el.current)
    el.current = node
    if (reg && node) reg.set(id, node, spec.current)
  }, [reg, id])
}

// ---------- reading the page ----------

/** The marks on screen now: data-coach elements under [root], then hook registrations. */
function collectMarks(root: Element | null, reg: CoachRegistry, origin: DOMRect, keep?: (id: string) => boolean): CoachMarkInput[] {
  // Layers over the page (an open side panel): a control whose middle they cover is out of view.
  const covers = root ? Array.from(root.querySelectorAll('[data-coach-cover]')) : []
  const covered = (el: Element, r: DOMRect): boolean => {
    const x = (r.left + r.right) / 2
    const y = (r.top + r.bottom) / 2
    return covers.some((c) => {
      if (c.contains(el)) return false
      const b = c.getBoundingClientRect()
      return x >= b.left && x < b.right && y >= b.top && y < b.bottom
    })
  }
  const byId = new Map<string, Entry>()
  if (root) {
    for (const el of Array.from(root.querySelectorAll('[data-coach]'))) {
      const id = el.getAttribute('data-coach')
      if (!id || byId.has(id)) continue
      const spec = coachSpecFor(id, el)
      if (spec) byId.set(id, { el, spec })
    }
  }
  for (const [id, e] of reg.list()) byId.set(id, e)
  const out: CoachMarkInput[] = []
  for (const [id, { el, spec }] of byId) {
    if (keep && !keep(id)) continue
    if (!el.isConnected) continue
    // A word's touch area reaches past its letters: its data-coach-box part is what shows.
    const part = el.querySelector('[data-coach-box]')
    const r = (part && part.closest('[data-coach]') === el ? part : el).getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    // Scrolled out of view, or under a panel: no tag pointing at what can't be seen.
    if (r.bottom <= origin.top || r.top >= origin.bottom || r.right <= origin.left || r.left >= origin.right) continue
    // Mostly scrolled away in a panel (the docked tools): its tag would have nowhere to go.
    if (cutByScroller(el, r)) continue
    if (covered(el, r)) continue
    out.push({
      id,
      bounds: { left: r.left - origin.left, top: r.top - origin.top, right: r.right - origin.left, bottom: r.bottom - origin.top },
      label: spec.label,
      face: spec.face,
      ink: spec.ink,
    })
  }
  return out
}

/** Whether a scrolling ancestor of [el] shows less than half of its box [r] (the rest scrolled out of the scroller's view). */
function cutByScroller(el: Element, r: DOMRect): boolean {
  if (typeof getComputedStyle !== 'function') return false
  for (let a = el.parentElement; a !== null && a !== document.body; a = a.parentElement) {
    if (a.scrollHeight <= a.clientHeight + 1 && a.scrollWidth <= a.clientWidth + 1) continue
    const s = getComputedStyle(a)
    if (!/(auto|scroll)/.test(s.overflowY + s.overflowX)) continue
    const b = a.getBoundingClientRect()
    const shownH = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top)
    const shownW = Math.min(r.right, b.right) - Math.max(r.left, b.left)
    if (shownH < r.height / 2 || shownW < r.width / 2) return true
  }
  return false
}

/** The controls with no tag that the tags keep off (data-coach-clear under [root]), in the overlay's coordinates. */
function collectClear(root: Element | null, origin: DOMRect): Box[] {
  if (!root) return []
  const out: Box[] = []
  for (const el of Array.from(root.querySelectorAll('[data-coach-clear]'))) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    out.push({ left: r.left - origin.left, top: r.top - origin.top, right: r.right - origin.left, bottom: r.bottom - origin.top })
  }
  return out
}

/** The safe area's insets, read off an element padded by env(safe-area-inset-*). */
function readInsets(el: HTMLElement | null): Insets {
  if (!el || typeof getComputedStyle !== 'function') return NO_INSETS
  const s = getComputedStyle(el)
  const px = (v: string): number => {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : 0
  }
  return { left: px(s.paddingLeft), top: px(s.paddingTop), right: px(s.paddingRight), bottom: px(s.paddingBottom) }
}

/**
 * Lays [text] out in the measuring element and returns its size. The element is
 * `width: max-content` under a max-width, so the width is the one-line width
 * capped at [maxWidth] and the text wraps beyond: Compose's text layout size
 * (maxIntrinsicWidth.coerceIn(0, maxWidth)).
 */
function measureWith(el: HTMLElement | null, text: string, maxWidth: number): Size {
  if (!el) return { width: Math.min(text.length * 9, maxWidth), height: 15 }
  // A side tag's word: one line, however long.
  el.style.maxWidth = Number.isFinite(maxWidth) ? `${maxWidth}px` : 'none'
  el.textContent = text
  const box = el.getBoundingClientRect()
  return { width: Math.min(Math.ceil(box.width), maxWidth), height: Math.ceil(box.height) }
}

// The last input was a key (not a pointer): the overlay then shows its focus ring.
let keyboardLast = false
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (!e.metaKey && !e.ctrlKey && !e.altKey) keyboardLast = true
  }, true)
  document.addEventListener('pointerdown', () => {
    keyboardLast = false
  }, true)
}

// ---------- the overlay ----------

/** Compose fadeIn/fadeOut, roughly. */
export const COACH_FADE_MS = 200

interface Layout {
  readonly placed: readonly PlacedTag[]
  readonly vp: Size
  /** The close hint's top edge. */
  readonly hint: number
  /** Tour mode: where the card goes (null before the card was measured), and the hole in the veil. */
  readonly card: TourPlacement | null
  readonly hole: Box | null
  /** Tour mode: the spotlight's control is not on screen (yet). */
  readonly missing: boolean
}

/**
 * Try arc's overlay (Kotlin CoachMode). Any mode, even an empty one, turns
 * the "?" guide into the tour's veil: no close hint, no close on tap.
 */
export interface CoachMode {
  /** Tags only these marks (Done: "?", GUIDE and the more-tools strip). */
  readonly only?: ReadonlySet<string> | undefined
  /** The mark the step is about: a ringed hole in the veil (its tag too, unless it is a tall area). */
  readonly spotlight?: string | undefined
  /** Touches go through the hole to the page (HEAR: hold a pad). */
  readonly passThrough?: boolean | undefined
}

/** What the step card is drawn for (CoachOverlayProps.card). */
export interface TourCardSlot {
  /** Only the heading fits (beside the pads on a short screen). */
  readonly headingOnly: boolean
  /** The unseen copy that is measured: no ids, no focus. */
  readonly measuring: boolean
  /** The card is placed and shown (it can take focus now). */
  readonly ready: boolean
}

/** How long a spotlight waits for its control before the card shows without one. */
export const SPOTLIGHT_WAIT_MS = 1000

export interface CoachOverlayProps {
  registry: CoachRegistry
  /** The element whose data-coach descendants are marks. */
  root: { readonly current: Element | null }
  visible: boolean
  /** "?": tap anywhere or Escape. Tour: Escape (the app sends it through nav.back()). */
  onDismiss: () => void
  /** Try arc: the tour's veil instead of the guide (see [CoachMode]). */
  mode?: CoachMode | undefined
  /**
   * Try arc: the step card; headingOnly when only its heading fits beside the
   * pads. It is also drawn unseen to be measured (measuring: leave out ids and focus).
   */
  card?: ((place: TourCardSlot) => ComponentChildren) | undefined
  /** Try arc: the dialog's name (TourText.TITLE) and the id of the step's heading. */
  label?: string | undefined
  describedBy?: string | undefined
}

/** Whether a mark gets a tag in [mode] (tall areas under a spotlight don't: the card names them). */
function tagged(mode: CoachMode | undefined, id: string): boolean {
  if (!mode) return true
  if (mode.only) return mode.only.has(id)
  return mode.spotlight === id
}

/** The faded page with the tags and arrows; mounted while visible or fading out. */
export function CoachOverlay(props: CoachOverlayProps): JSX.Element | null {
  const { registry, root, visible } = props
  const [mounted, setMounted] = useState(visible)
  const [shown, setShown] = useState(false)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [keyed, setKeyed] = useState(false)
  const overlay = useRef<HTMLDivElement | null>(null)
  const measurer = useRef<HTMLSpanElement | null>(null)
  const insets = useRef<HTMLSpanElement | null>(null)
  const hint = useRef<HTMLParagraphElement | null>(null)
  const closeKey = useRef<HTMLButtonElement | null>(null)
  const dismiss = useRef(props.onDismiss)
  dismiss.current = props.onDismiss

  // Mount, then fade in on the next frame; fade out, then unmount.
  useEffect(() => {
    if (visible) {
      setMounted(true)
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(raf)
    }
    setShown(false)
    const t = window.setTimeout(() => setMounted(false), COACH_FADE_MS)
    return () => window.clearTimeout(t)
  }, [visible])

  // While it fades out, the overlay keeps the look it had (a closing tour stays the tour).
  const kept = useRef({ mode: props.mode, card: props.card })
  if (visible) kept.current = { mode: props.mode, card: props.card }
  const mode = kept.current.mode
  const cardOf = kept.current.card
  const tour = mode !== undefined
  const modeRef = useRef(mode)
  modeRef.current = mode
  const modeKey = mode ? `${[...(mode.only ?? [])].join(',')}|${mode.spotlight ?? ''}|${mode.passThrough ? 1 : 0}` : ''
  const measureRef = useRef<HTMLDivElement | null>(null)
  // A spotlight whose control isn't on screen waits a moment for it.
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    setWaited(false)
    if (!visible || !mode?.spotlight) return
    const t = window.setTimeout(() => setWaited(true), SPOTLIGHT_WAIT_MS)
    return () => window.clearTimeout(t)
  }, [visible, modeKey])

  // What the last placement was made from: a pad's light changing its style every frame
  // moves nothing, and placing again (tens of ms on a phone) would only stall the page.
  const placedFrom = useRef('')
  /** Places the tags again if anything they depend on moved; [force]: the font or the tour's card changed. */
  const recompute = useCallback((force = false) => {
    const ov = overlay.current
    if (!ov) return
    const origin = ov.getBoundingClientRect()
    const vp = { width: origin.width, height: origin.height }
    const m = modeRef.current
    const marks = collectMarks(root.current, registry, origin, (id) => tagged(m, id) || m?.spotlight === id)
    const clear = collectClear(root.current, origin)
    const safe = readInsets(insets.current)
    const key = m ? `${[...(m.only ?? [])].join(',')}|${m.spotlight ?? ''}|${m.passThrough ? 1 : 0}` : ''
    const from = JSON.stringify([vp, safe, clear, marks, key])
    if (!force && from === placedFrom.current) return
    placedFrom.current = from
    const target = m?.spotlight ? (marks.find((k) => k.id === m.spotlight) ?? null) : null
    // Tall areas (the pads) get no tag under a spotlight: the card's heading names them. Nor
    // does a control on the screen's edge (the GUIDE tab): its side tag would cover what is tapped.
    const tagMarks = marks.filter((k) => tagged(m, k.id) && !(m?.spotlight === k.id && (isTall(k, vp) || edgeOf(k, vp, safe) !== 0)))
    const placed = layoutTags(tagMarks, vp, (text, max) => measureWith(measurer.current, text, max), { clear, safe, spare: COACH_SPARE })
    const h = hint.current?.getBoundingClientRect()
    const hintSize = h && h.width > 0 ? { width: h.width, height: h.height } : undefined
    let card: TourPlacement | null = null
    let hole: Box | null = null
    const el = measureRef.current
    if (m && el) {
      // The whole card's height at a width (an unseen copy), and its heading's, for the last resort.
      const heightAt = (w: number): number => {
        el.style.width = `${w}px`
        return Math.ceil(el.getBoundingClientRect().height)
      }
      const headingAt = (w: number): number => {
        el.style.width = `${w}px`
        const head = el.querySelector<HTMLElement>('[data-tour-head]')
        const inner = el.firstElementChild
        if (!head || !inner) return heightAt(w)
        const pad = parseFloat(getComputedStyle(inner).paddingBottom) || 0
        return Math.ceil(head.getBoundingClientRect().bottom - el.getBoundingClientRect().top + pad)
      }
      // Done tags controls around the middle of the screen: its card docks below them.
      const dockBottom = !m?.spotlight && (m?.only?.size ?? 0) > 0
      card = placeTourCard(vp.width, vp.height, target?.bounds ?? null, heightAt, headingAt, 0, 0, dockBottom)
      el.style.width = `${card.card.right - card.card.left}px`
      hole = target ? holeOf(target.bounds, card.holeClip) : null
      tourCardLow.value = (card.card.top + card.card.bottom) / 2 > vp.height / 2
    }
    setLayout({ placed, vp, hint: hintTop(vp, placed, hintSize, safe), card, hole, missing: !!m?.spotlight && target === null })
  }, [registry, root])

  // Place before the first paint, and again whenever something moves.
  const version = registry.version.value
  useLayoutEffect(() => {
    if (mounted && visible) recompute()
  }, [mounted, visible, version, recompute, modeKey])

  // The card's own size (its step's text, fonts loading) moves it too.
  useEffect(() => {
    const el = measureRef.current
    if (!mounted || !visible || !el || typeof ResizeObserver !== 'function') return
    let raf = 0
    let last = ''
    const ro = new ResizeObserver(() => {
      const size = `${el.offsetWidth}x${el.offsetHeight}`
      if (size === last) return
      last = size
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => recompute(true))
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [mounted, visible, recompute, tour])

  useEffect(() => {
    if (!mounted || !visible) return
    let raf = 0
    let alive = true
    const schedule = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => alive && recompute())
    }
    // The tags' text width changes once Manrope has loaded.
    document.fonts?.ready.then(() => alive && recompute(true), () => undefined)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
    const host = root.current
    if (ro && host) {
      // display: contents has no box: watch its children instead.
      for (const child of Array.from(host.children)) ro.observe(child)
    }
    const mo = typeof MutationObserver === 'function' && host ? new MutationObserver(schedule) : null
    mo?.observe(host as Element, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-coach', 'data-coach-clear', 'data-coach-cover', 'aria-label', 'class', 'style'] })
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      ro?.disconnect()
      mo?.disconnect()
    }
  }, [mounted, visible, recompute, root])

  // Focus: into the overlay while it shows, back where it was after; Escape closes.
  // (The tour's card puts focus on its step's first key itself.)
  useEffect(() => {
    if (!visible || !mounted) return
    const before = document.activeElement as HTMLElement | null
    // Opened from the keyboard (or a key pressed since): show where focus is.
    setKeyed(keyboardLast)
    if (!tour) closeKey.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent): void => {
      setKeyed(true)
      if (e.key === 'Escape') {
        e.preventDefault()
        dismiss.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (before && before.isConnected && overlay.current?.contains(document.activeElement)) before.focus({ preventScroll: true })
    }
  }, [visible, mounted, tour])

  if (!mounted) return null
  const vp = layout?.vp
  const place = layout?.card ?? null
  const hole = layout?.hole ?? null
  // A spotlight still looking for its control keeps the card back (up to SPOTLIGHT_WAIT_MS).
  const cardReady = place !== null && !(layout?.missing && !waited)
  return (
    <div
      ref={overlay}
      class={`coach${tour ? ' coach--tour' : ''}${shown && visible ? ' is-shown' : ''}${keyed ? ' is-keyed' : ''}`}
      role="dialog"
      aria-modal={tour && mode?.passThrough ? undefined : 'true'}
      aria-label={props.label ?? CoachText.HELP}
      aria-describedby={props.describedBy}
      aria-hidden={visible ? undefined : 'true'}
    >
      {tour ? (
        <div
          class="coach__veil"
          aria-hidden="true"
          style={vp ? { clipPath: `path(evenodd, "${veilPath(vp, hole)}")` } : undefined}
        />
      ) : (
        <button
          ref={closeKey}
          type="button"
          class="coach__veil"
          aria-label={CoachText.CLOSE_HINT}
          onClick={() => props.onDismiss()}
        />
      )}
      {tour && hole && (
        <div
          class="coach__hole"
          aria-hidden="true"
          style={{ left: `${hole.left}px`, top: `${hole.top}px`, width: `${hole.right - hole.left}px`, height: `${hole.bottom - hole.top}px` }}
        />
      )}
      {layout && vp && (
        <svg class="coach__arrows" width={vp.width} height={vp.height} viewBox={`0 0 ${vp.width} ${vp.height}`} aria-hidden="true">
          {layout.placed.map((p) => {
            if (p.side !== 0) {
              const hook = sideHook(p.rect, p.side, p.edge ?? (p.side < 0 ? 0 : vp.width))
              const [a, b, c] = hook.head
              return (
                <g key={p.mark.id} data-coach-arrow={p.mark.id} style={{ fill: p.mark.face, stroke: p.mark.face }}>
                  <path d={hook.line} fill="none" stroke-width={COACH_METRICS.hookWidth} stroke-linecap="round" />
                  <polygon points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`} stroke="none" />
                </g>
              )
            }
            if (!p.tip || !p.tail) return null
            const [a, b, c] = arrowHead(p.tip, p.tail)
            return (
              <g key={p.mark.id} data-coach-arrow={p.mark.id} style={{ fill: p.mark.face, stroke: p.mark.face }}>
                <line x1={p.tail.x} y1={p.tail.y} x2={p.tip.x} y2={p.tip.y} stroke-width={COACH_METRICS.arrowWidth} />
                <polygon points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`} stroke="none" />
              </g>
            )
          })}
        </svg>
      )}
      {layout && (
        <ul class="coach__tags" role="list">
          {layout.placed.map((p) => (
            <li
              key={p.mark.id}
              class={p.side === 0 ? 'coach__tag' : `coach__tag coach__tag--side coach__tag--${p.side < 0 ? 'left' : 'right'}`}
              data-coach-tag={p.mark.id}
              style={{
                left: `${p.rect.left}px`,
                top: `${p.rect.top}px`,
                width: `${p.rect.right - p.rect.left}px`,
                height: `${p.rect.bottom - p.rect.top}px`,
                background: p.mark.face,
                color: p.mark.ink,
              }}
            >
              <span class="coach__tag-text" style={{ width: `${p.textSize.width}px` }}>{p.text}</span>
            </li>
          ))}
        </ul>
      )}
      {!tour && (
        <p ref={hint} class="coach__hint" style={layout ? { top: `${layout.hint}px` } : undefined} aria-hidden="true">
          {CoachText.CLOSE_HINT}
        </p>
      )}
      {tour && cardOf && (
        <div
          class={`coach__card${cardReady ? ' is-placed' : ''}`}
          style={
            place
              ? {
                  left: `${place.card.left}px`,
                  top: `${place.card.top}px`,
                  width: `${place.card.right - place.card.left}px`,
                  maxHeight: `${place.card.bottom - place.card.top}px`,
                }
              : { width: vp ? `${tourCardWidth(vp)}px` : undefined }
          }
        >
          {cardOf({ headingOnly: place?.headingOnly ?? false, measuring: false, ready: cardReady })}
        </div>
      )}
      {tour && cardOf && (
        // The whole card, unseen, measured at the widths placeTourCard tries (no style prop: recompute sets its width).
        <div ref={measureRef} class="coach__card coach__card--measure" aria-hidden="true" inert>
          {cardOf({ headingOnly: false, measuring: true, ready: false })}
        </div>
      )}
      <span ref={measurer} class="coach__tag-text coach__measure" aria-hidden="true" />
      <span ref={insets} class="coach__insets" aria-hidden="true" />
    </div>
  )
}

/**
 * HEAR and the offline steps: everything on the page but the marked control
 * (the pads, the strip, the tab, the tag), its ancestors and what is inside
 * it is inert, so touches through the hole reach that control only. Returns
 * the undo.
 */
function inertAround(root: Element, target: Element): () => void {
  const made: Element[] = []
  let node: Element | null = target
  while (node && node !== root) {
    const parent: Element | null = node.parentElement
    if (!parent) break
    for (const sib of Array.from(parent.children)) {
      if (sib === node || sib.hasAttribute('inert')) continue
      sib.setAttribute('inert', '')
      made.push(sib)
    }
    node = parent
  }
  return () => {
    for (const el of made) el.removeAttribute('inert')
  }
}

/** Keeps [inertAround] in place while [on], following the page as it re-renders. */
function usePassThrough(
  root: RefObject<HTMLDivElement | null>,
  registry: CoachRegistry,
  id: string | undefined,
  on: boolean,
  version: number,
): void {
  useLayoutEffect(() => {
    const host = root.current
    if (!on || !host || !id) return
    let undo = (): void => {}
    const apply = (): void => {
      undo()
      // A mark that is only a box over its controls (the desk's pads) names them with data-coach-pass;
      // else a hook registration (the more-tools strip) wins, as in collectMarks.
      const pass = host.querySelector(`[data-coach-pass="${CSS.escape(id)}"]`)
      const registered = registry.get(id)
      const target = pass ?? (registered && registered.isConnected && host.contains(registered)
        ? registered
        : host.querySelector(`[data-coach="${CSS.escape(id)}"]`))
      undo = target ? inertAround(host, target) : () => {}
    }
    apply()
    const mo = typeof MutationObserver === 'function' ? new MutationObserver((records) => {
      // Only new or removed elements can need it again (not the inert attributes set here).
      if (records.some((r) => r.type === 'childList')) apply()
    }) : null
    mo?.observe(host, { subtree: true, childList: true })
    return () => {
      mo?.disconnect()
      undo()
    }
  }, [root, registry, id, on, version])
}

export interface CoachHostProps {
  visible: boolean
  onDismiss: () => void
  /** Try arc: the tour's veil, card and spotlight (see [CoachMode]); none for the "?" guide. */
  mode?: CoachMode | undefined
  card?: CoachOverlayProps['card']
  label?: string | undefined
  describedBy?: string | undefined
  children?: ComponentChildren
}

/** Holds the marks for a screen and shows the overlay over [children] (Kotlin CoachHost). */
export function CoachHost(props: CoachHostProps): JSX.Element {
  const [registry] = useState(() => new CoachRegistry())
  const root = useRef<HTMLDivElement | null>(null)
  const passThrough = props.visible && props.mode?.passThrough === true && props.mode.spotlight !== undefined
  usePassThrough(root, registry, props.mode?.spotlight, passThrough, registry.version.value)
  return (
    <CoachContext.Provider value={registry}>
      <div ref={root} class="coach-host" inert={(props.visible && !passThrough) || undefined}>
        {props.children}
      </div>
      <CoachOverlay
        registry={registry}
        root={root}
        visible={props.visible}
        onDismiss={props.onDismiss}
        mode={props.mode}
        card={props.card}
        label={props.label}
        describedBy={props.describedBy}
      />
    </CoachContext.Provider>
  )
}

/** The first-run preference (state: controller.coach). */
export interface CoachSeenPrefs {
  readonly seen: boolean
  markSeen(): void
}

/**
 * Marks the guide seen when the overlay closes (MainActivity's coach_seen,
 * saved on close, so a reload before reading it shows it again). Whether it
 * opens by itself on the first start is Try arc's first-run decision
 * (Tour.firstRun, app.tsx's useTourFirstRun).
 */
export function useCoachFirstRun(prefs: CoachSeenPrefs, visible: boolean): void {
  const wasVisible = useRef(false)
  useEffect(() => {
    if (wasVisible.current && !visible && !prefs.seen) prefs.markSeen()
    wasVisible.current = visible
  }, [visible, prefs])
}
