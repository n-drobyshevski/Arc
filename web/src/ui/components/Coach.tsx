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
// A control scrolled out of view, or under a layer marked data-coach-cover (the
// open Live tools panel), gets no tag. Where a marked element's touch area
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
import { createContext, type ComponentChildren, type JSX } from 'preact'
import { signal, type Signal } from '@preact/signals'
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { CoachText } from '../../core/text/coachText'
import { WebText } from '../../core/text/webText'
import {
  COACH_METRICS,
  NO_INSETS,
  arrowHead,
  hintTop,
  layoutTags,
  sideHook,
  type Box,
  type CoachMarkInput,
  type Insets,
  type PlacedTag,
  type Size,
} from '../coachPlace'
import './Coach.css'

/** The pocket operator app's yellow tip tags, for hints that aren't one key (Kotlin CoachYellow). */
export const COACH_YELLOW = 'var(--coach-yellow)'
export const COACH_YELLOW_INK = 'var(--coach-yellow-ink)'

/** Every control the overlay knows, by screen. */
export const COACH_IDS = [
  'top.sections',
  'top.connection',
  'top.help',
  'top.theme',
  'edge.guide',
  'edge.edit',
  'backups.backup',
  'backups.search',
  'backups.import',
  'backups.open',
  'live.pads',
  'live.keys',
  'live.mode',
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

/**
 * The tags of the Kotlin coachMark call sites (Chrome.kt, MainScreen.kt,
 * MirrorScreen.kt, DeviceScreen.kt, SideZone.kt), for controls marked with a
 * data-coach attribute. top.connection is navy here; [coachSpecFor] makes it
 * green while the connection key says connected.
 */
export const COACH_MARKS: Readonly<Record<CoachId, CoachMarkSpec>> = Object.freeze({
  'top.sections': navyTag(CoachText.SECTIONS),
  'top.connection': navyTag(CoachText.CONNECTION),
  'top.help': { label: CoachText.HELP, face: 'var(--ink)', ink: 'var(--shell)' },
  // Web: the desk's theme switch, after the ? key (the nav rail's Settings key
  // says Settings in words).
  'top.theme': navyTag(CoachText.THEME),
  'edge.guide': navyTag(CoachText.GUIDE_TAB),
  // Live's EDIT tab (under GUIDE): an edge-hook side tag on the phone.
  'edge.edit': navyTag(CoachText.EDIT),
  'backups.backup': { label: CoachText.BACK_UP, face: 'var(--signal)', ink: 'var(--on-signal)' },
  'backups.search': navyTag(CoachText.SEARCH),
  'backups.import': navyTag(CoachText.IMPORT),
  'backups.open': yellowTag(CoachText.OPEN_BACKUP),
  'live.pads': yellowTag(CoachText.PADS),
  // The KEYS grid: the same tip as the pads (MirrorScreen.kt).
  'live.keys': yellowTag(CoachText.PADS),
  'live.mode': navyTag(CoachText.MODE),
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

const isCoachId = (id: string): id is CoachId => (COACH_IDS as readonly string[]).includes(id)

/** The tag for an element marked with data-coach="<id>"; null for an unknown id without its own label. */
export function coachSpecFor(id: string, el: Element): CoachMarkSpec | null {
  const base: CoachMarkSpec | null = isCoachId(id) ? COACH_MARKS[id] : null
  let spec = base
  // Chrome.kt: the connection tag is green (ok) while connected, navy while not.
  if (id === 'top.connection') {
    const label = CoachText.CONNECTED.replace(/"/g, '\\"')
    const on = el.getAttribute('aria-label') === CoachText.CONNECTED || el.querySelector(`[aria-label="${label}"]`) !== null
    if (on) spec = { label: CoachText.CONNECTION, face: 'var(--ok)', ink: 'var(--on-ok)' }
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
function collectMarks(root: Element | null, reg: CoachRegistry, origin: DOMRect): CoachMarkInput[] {
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
    if (!el.isConnected) continue
    // A word's touch area reaches past its letters: its data-coach-box part is what shows.
    const part = el.querySelector('[data-coach-box]')
    const r = (part && part.closest('[data-coach]') === el ? part : el).getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    // Scrolled out of view, or under a panel: no tag pointing at what can't be seen.
    if (r.bottom <= origin.top || r.top >= origin.bottom || r.right <= origin.left || r.left >= origin.right) continue
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
}

export interface CoachOverlayProps {
  registry: CoachRegistry
  /** The element whose data-coach descendants are marks. */
  root: { readonly current: Element | null }
  visible: boolean
  onDismiss: () => void
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

  // What the last placement was made from: a pad's light changing its style every frame
  // moves nothing, and placing again (tens of ms on a phone) would only stall the page.
  const placedFrom = useRef('')
  /** Places the tags again if anything they depend on moved; [force]: the font changed. */
  const recompute = useCallback((force = false) => {
    const ov = overlay.current
    if (!ov) return
    const origin = ov.getBoundingClientRect()
    const vp = { width: origin.width, height: origin.height }
    const marks = collectMarks(root.current, registry, origin)
    const clear = collectClear(root.current, origin)
    const safe = readInsets(insets.current)
    const from = JSON.stringify([vp, safe, clear, marks])
    if (!force && from === placedFrom.current) return
    placedFrom.current = from
    const placed = layoutTags(marks, vp, (text, max) => measureWith(measurer.current, text, max), { clear, safe })
    const h = hint.current?.getBoundingClientRect()
    const hintSize = h && h.width > 0 ? { width: h.width, height: h.height } : undefined
    setLayout({ placed, vp, hint: hintTop(vp, placed, hintSize, safe) })
  }, [registry, root])

  // Place before the first paint, and again whenever something moves.
  const version = registry.version.value
  useLayoutEffect(() => {
    if (mounted && visible) recompute()
  }, [mounted, visible, version, recompute])

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
  useEffect(() => {
    if (!visible || !mounted) return
    const before = document.activeElement as HTMLElement | null
    // Opened from the keyboard (or a key pressed since): show where focus is.
    setKeyed(keyboardLast)
    closeKey.current?.focus({ preventScroll: true })
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
  }, [visible, mounted])

  if (!mounted) return null
  const vp = layout?.vp
  return (
    <div
      ref={overlay}
      class={`coach${shown && visible ? ' is-shown' : ''}${keyed ? ' is-keyed' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={CoachText.HELP}
      aria-hidden={visible ? undefined : 'true'}
    >
      <button
        ref={closeKey}
        type="button"
        class="coach__veil"
        aria-label={CoachText.CLOSE_HINT}
        onClick={() => props.onDismiss()}
      />
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
      <p ref={hint} class="coach__hint" style={layout ? { top: `${layout.hint}px` } : undefined} aria-hidden="true">
        {CoachText.CLOSE_HINT}
      </p>
      <span ref={measurer} class="coach__tag-text coach__measure" aria-hidden="true" />
      <span ref={insets} class="coach__insets" aria-hidden="true" />
    </div>
  )
}

export interface CoachHostProps {
  visible: boolean
  onDismiss: () => void
  children?: ComponentChildren
}

/** Holds the marks for a screen and shows the overlay over [children] (Kotlin CoachHost). */
export function CoachHost(props: CoachHostProps): JSX.Element {
  const [registry] = useState(() => new CoachRegistry())
  const root = useRef<HTMLDivElement | null>(null)
  return (
    <CoachContext.Provider value={registry}>
      <div ref={root} class="coach-host" inert={props.visible || undefined}>
        {props.children}
      </div>
      <CoachOverlay registry={registry} root={root} visible={props.visible} onDismiss={props.onDismiss} />
    </CoachContext.Provider>
  )
}

/** The first-run preference (state: controller.coach). */
export interface CoachSeenPrefs {
  readonly seen: boolean
  markSeen(): void
}

/**
 * Opens the overlay by itself once, on the first start (MainActivity's
 * coach_seen): calls [open] on mount while [prefs] is unseen, and marks it seen
 * when the overlay closes, so a reload before reading it shows it again.
 */
export function useCoachFirstRun(prefs: CoachSeenPrefs, visible: boolean, open: () => void): void {
  const wasVisible = useRef(false)
  const openRef = useRef(open)
  openRef.current = open
  useEffect(() => {
    if (!prefs.seen) openRef.current()
    // Once per mount, as LaunchedEffect(Unit).
  }, [])
  useEffect(() => {
    if (wasVisible.current && !visible && !prefs.seen) prefs.markSeen()
    wasVisible.current = visible
  }, [visible, prefs])
}
