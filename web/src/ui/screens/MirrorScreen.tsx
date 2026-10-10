// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/MirrorScreen.kt
//
// A live mirror of the EP-133 (an addition to the web version): the four
// groups' pads light as the device plays them, with the sample on each once
// it is known, plus play state, tempo and KEYS notes. Holding a pad plays its
// sample on the phone; KEYS turns the 12 pads into notes of one sound. Not
// connected, it shows the last read ("Offline").
//
// Pads are drawn as the K.O. II itself: dark caps on the device's grey body
// with the label top left, pale group keys under LEDs (theme/cap.css). A lit
// pad turns the signal orange, brighter with velocity, and fades on release.
//
// Web deltas:
// - The glow is a CSS custom property (--glow, 0..1) on each pad, key, group
//   caption and group key; the colours are color-mix()es of it in Oklab (as
//   Compose's lerp). Renders set it (at most once a frame: the controller
//   publishes a mirror state at the next frame after a note, and only when it
//   changed), and while a released pad or note is fading a
//   requestAnimationFrame loop updates it in the DOM without rendering
//   (Kotlin's withFrameNanos loop), writing only the values that changed and
//   stopping once the fade is over.
// - What plays on the phone comes as signals ([LivePlaying]): each pad and
//   KEYS key reads its own ring from them, so a voice starting or ending
//   re-renders only the pads and keys it rings, not the screen. KEYS plays
//   by MIDI note (Kotlin's playingNotes), on the grid and the piano alike.
// - Pads and KEYS keys are memoized ([memo], the props compared by value,
//   their handlers read from the latest props through a ref): a note from
//   the device re-renders the pads and keys whose light changed, not all 48.
// - The tools side panel is a navigation layer (overlay 'side'), so Back closes
//   it: [toolsOpen] / [onTools] replace Kotlin's rememberSaveable toolsOpen
//   (and initialToolsOpen). The Live tab has no BackHandler of its own; a Back
//   key, when given, is the CloseKey only.
// - The four-or-two groups per row is a container query (BoxWithConstraints).
// - holdToPlay is live/press.ts fed by pointer events (a finger per pad or
//   key; on the scrolling all-groups page the press sounds at once and a
//   scroll that starts within PRESS_DELAY_MS cuts it, [onPadCut]). A screen
//   reader's / keyboard's Play is a click with detail 0: it plays the whole
//   sound (hold = false).
// - Where the browser sends pointerrawupdate (Chrome), the scroll-cut check
//   reads each move as it arrives, not at the next frame's pointermove
//   (PressTracker.move's raw moves; one listener on the document, there only
//   while a press's scroll window is open: PressTracker.onWindows).
// - The haptic tick ([haptics]) is navigator.vibrate (platform/haptics.ts),
//   after a finger's press only: not for a screen reader's Play.
// - A finger's press hands on its pointerdown's timeStamp (onPad's, onKey's
//   and onNote's [at]; Kotlin's uptimeMillis) for the latency note; EDIT's
//   long press, the moment the hold became a press (that timeStamp plus
//   EDIT_HOLD_MS).
// - The offline note's fold is a button with aria-expanded (Kotlin's
//   stateDescription NOTE_SHOWN / NOTE_HIDDEN).
// - The scale, octave and key lists (Kotlin's focusable Popups, which Back
//   dismisses) are navigation layers too: [picker] / [onPicker] (dialog
//   'pick:scale' / 'pick:octave' / 'pick:key'); without them each word keeps its own state.
// - The tools (the Step 1c redesign) are SettingRow cards: the View as small
//   caps with a Follow row and its LED toggle (its note behind the row's ⓘ
//   key), the last note in a small dark
//   display, and the long notes under one "How Live reads the EP-133"
//   disclosure. The pad numbering lives in Settings only (no onPadOrder here).
//   KEYS: a one-octave MiniPiano picks the key; the colours are chips (the
//   long legend rows are under "How Keys works", with KEYS_NOTE). The chips
//   say "Playing here" (WebText.CHIP_HERE); the piano's two (root, outside
//   the scale) show only with the piano.
//
// Web only, the desktop layout (from 1024px wide, ui/useDesk.ts), after the
// EP-133 Sample Tool's K.O. II and Android's sideways layout:
// - One group (and KEYS) is a K.O. II panel on the desk: the device's body
//   with the display line on top, the mode row above the grid (Android's
//   sideways order) and the pads as near square as the window allows, the
//   panel sized by the room's height (container units, MirrorScreen.css) so
//   nothing scrolls. The A-D group keys are a vertical column LEFT of the
//   pads, as the Sample Tool draws them (Android's sideways column is on the
//   right: a deliberate web delta); arrow keys up / down move along it.
// - All groups: the four in one row that doesn't scroll while every pad keeps
//   40 px (Android's allGroupsSideways, live/desk.ts rowPadSize, measured with
//   a ResizeObserver); in a room too small for that, the phone's scrolling grid
//   on a paper card.
// - The tools panel is docked: a column beside the panel (SideZone docked),
//   no strip; in KEYS the tools go back behind the edge strip, so the keys
//   get the page's width. With EDIT available the docked column has two tabs,
//   TOOLS and SOUNDS: the device's sounds, dragged onto a pad (HTML5 drag and
//   drop; the pad shows "old → new"), and a WAV dropped on a pad or on the
//   drop zone under the list. A right-click on a pad opens its pad sheet.
// - EDIT's tab hangs on the left side of the K.O. II panel (on a phone or
//   tablet the shell draws it on the window's edge, under GUIDE: app.tsx).
//
// Web only, the piano (Kotlin PianoKeyboard, live/PianoKeyboard.tsx): in
// KEYS, on any window where it fits ([pianoFor], live/keyboard.ts: Android's
// rule, the view switch remembered per window shape), the display line and
// the row over the keys (Android's SidewaysRow: mode, view switch, scale,
// key, − OCT +) over a piano across the page; on the desk on the device's
// body with the colours' legend under it. The view switch (two icon caps
// after the KEYS word) is not shown on a portrait phone, which plays on the
// grid; its KEYS tools say a turn of the screen gives the piano
// (WebText.LIVE_PIANO_HINT). On a desktop (or with a fine pointer) the
// computer keyboard plays it. Piano keys carry [data-note] (their MIDI note)
// for the glow, by exact pitch.
//
// On a phone on its side (ui/live/window.ts liveInBar, never the desk) the
// display line is in the top bar ([inBar], [LivePill]) and the page leaves it
// out; the tools then say what clock out is for (MirrorText.NO_TRANSPORT).
//
// EDIT (giving a pad another sound, Kotlin's EditEdgeTab and pad sheet): with
// it on, the display line says so, the pads get a signal outline and a ⇄
// badge, and a tap opens the pad sheet ([EditUi.onPad]); a long press still
// plays the pad while held. Offline (an addition) it changes the pads in arc
// only, from the last read's sounds or the factory pack's ([EditUi.offline]);
// the tools then count those changes, with Reset pads ([offlinePads]).
import { Fragment, h, type ButtonHTMLAttributes, type Component, type ComponentChildren, type FunctionComponent, type JSX, type TargetedDragEvent } from 'preact'
import { useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { computed, signal, useComputed, type ReadonlySignal } from '@preact/signals'
import { Keys, MAX_OCTAVE, MIN_OCTAVE, SCALES, type NoteNames, type Scale } from '../../core/features/keys'
import type { MirrorState, PadLight } from '../../core/features/liveMirror'
import { KeysView, type NoteRange } from '../../core/features/piano'
import { NoteTouches, type NoteEvent } from '../../core/features/noteTouches'
import type { SoundEntry } from '../../core/protocol/device'
import { SoundSource } from '../../core/features/offlinePads'
import { PadOrder } from '../../core/features/padPush'
import { ROWS, noteName, padKey, physicalPad, type PhysicalPad } from '../../core/features/padNotes'
import { CoachText } from '../../core/text/coachText'
import { CLOSE as GUIDE_CLOSE, LED_ROWS } from '../../core/text/guideText'
import { MirrorText } from '../../core/text/mirrorText'
import { FeatureText } from '../../core/text/featureText'
import { WebText } from '../../core/text/webText'
import { emptyMirrorState, type MirrorUi, type OfflineSounds } from '../../state/types'
import { Caption } from '../components/Caption'
import { COACH_YELLOW, COACH_YELLOW_INK } from '../components/Coach'
import { DisplayPanel } from '../components/DisplayPanel'
import { CloseKey } from '../components/GuideKeys'
import { HwToggle } from '../components/HwToggle'
import { EditEdgeTab } from '../components/EditEdgeTab'
import { MiniPiano } from '../components/MiniPiano'
import { Segmented, handleRovingKey } from '../components/Segmented'
import { ArcIcon } from '../components/Icons'
import { Disclosure, LinkRow, RowAction, RowCard, SettingRow } from '../components/SettingRow'
import { SideZone } from '../components/SideZone'
import {
  displayLine,
  displayLineSmall,
  fading,
  glow,
  glowCss,
  groupGlow,
  keysLayout,
  showNoPushes,
  showOffline,
  transportText,
} from '../live/glow'
import { GLYPHS } from '../components/KoPanel'
import { capDown, capUp } from '../live/capDown'
import { rowPadSize } from '../live/desk'
import { chosenView, pianoFor, type PianoPlan } from '../live/keyboard'
import { holdCap, releaseCap, useLiveKeys } from '../live/useLiveKeys'
import { computerKeys } from '../keyPrefs'
import { DEFAULT_KEYS, keysLit, keysNoteText, octaves, upperOctave, type KeysPicker, type KeysShown } from '../live/keys'
import { PianoKeyboard } from '../live/PianoKeyboard'
import { PressTracker, rawMovesSupported, ticking, type PressTarget } from '../live/press'
import { SLOT_MIME, SOURCE_MIME, SoundPicker } from '../live/SoundPicker'
import { dragMayHaveAudio, isAudioFile } from '../../platform/files/pick'
import { tick } from '../../platform/haptics'
import { PickWord, WordButton } from '../live/Words'
import { TakeBadge, TakesSection, type TakeUi, type TakesUi } from '../live/Takes'
import { PatternLine, TransportContext } from '../live/PatternLine'
import { DeviceView } from '../live/DeviceView'
import { useDesk, useFinePointer, useWindowSize } from '../useDesk'
import './MirrorScreen.css'

export type { KeysPicker, KeysShown, KeysUi } from '../live/keys'

/**
 * What sounds on the phone, as signals (the controller's playingPads and
 * playingNotes): the pads as padKey(), the KEYS notes (grid and piano) as
 * MIDI notes, first pressed first. Each pad and key reads its own ring from them.
 */
export interface LivePlaying {
  readonly pads: ReadonlySignal<ReadonlySet<number>>
  readonly notes: ReadonlySignal<ReadonlySet<number>>
}

/** What the KEYS controls do (Kotlin KeysActions). */
export interface KeysActions {
  onMode?: (on: boolean) => void
  onRoot?: (root: number) => void
  onScale?: (scale: Scale) => void
  onOctave?: (octave: number) => void
  /**
   * A note pressed (MIDI), on the grid or the piano; it sounds until
   * [onNoteUp]. A screen reader's Play passes hold = false. [at]: the
   * press's event timeStamp (absent for a screen reader's Play).
   */
  onNote?: (note: number, hold: boolean, at?: number) => void
  onNoteUp?: (note: number) => void
  /** The Pads ⇄ Piano switch, for a wide window ([wide]) or a tall one. */
  onView?: (wide: boolean, view: KeysView) => void
  /** A pad played on the device in the pads view becomes the KEYS sound. */
  onSelect?: (pad: PhysicalPad) => void
}

/** Live's EDIT: giving a pad another sound (an addition; the controller's assignPad). */
export interface EditUi {
  readonly on: boolean
  /** The EP-133 is connected (the pads can be written; else the Sounds tab says to connect, or works offline). */
  readonly connected: boolean
  /** Not connected, showing the last read: the sounds to put on the pads in arc only; else null. */
  readonly offline: OfflineSounds | null
  onChange: (on: boolean) => void
  /** Opens [pad]'s pad sheet (a tap in EDIT, a right-click on the desk). */
  onPad: (pad: PhysicalPad) => void
  /** The desk: a sound of [source]'s list dragged from the Sounds tab onto [pad]. */
  onDropSlot: (pad: PhysicalPad, slot: number, source: SoundSource) => void
  /** The desk: a WAV dropped on [pad] (uploaded to a free slot, then put on it). */
  onDropFile: (pad: PhysicalPad, file: File) => void
  /** The Sounds tab: the device's sounds, their preview and the drop zone's files (a plain upload). */
  readonly sounds: readonly SoundEntry[]
  readonly playing: string | null
  onPlay: (slot: number, source: SoundSource) => void
  onStop: () => void
  onUpload: (files: File[]) => void
  /** The sound on [pad] now by its pad record, when the mirror can't name it yet (for "old → new"). */
  nameNow: (pad: PhysicalPad) => string | null
}

export interface MirrorScreenProps {
  mirror: MirrorUi | null
  nameOf: (pad: PhysicalPad) => string | null
  /** Null on the Live tab, which has no close key. */
  onBack?: (() => void) | null
  /** A fixed time for screenshots; normally the frame clock drives the fade. */
  fixedNow?: number | null
  /** One group at a time, large, with A–D keys to switch (like the pocket operator app's grid). */
  oneGroup: boolean
  onOneGroup: (on: boolean) => void
  /** In that view, switch to the group of the pad just played. */
  follow: boolean
  onFollow: (on: boolean) => void
  initialGroup?: number
  /** The tools side panel (a navigation layer). */
  toolsOpen: boolean
  onTools: (open: boolean) => void
  /** For screenshots: start with the offline note unfolded. */
  initialNoteOpen?: boolean
  /** Esc in Live (out of EDIT): stops what plays (the controller's stopPlayback). */
  onStop?: () => void
  /** Not connected: download the factory sounds (FactorySounds); null when they can't be, or are in the library. */
  onGetFactory?: (() => void) | null
  /**
   * Opens Settings, from the first row of Live tools (an addition; the caller
   * closes the tools with it). Not on the desk, where the nav rail has the
   * key. Null hides the row.
   */
  onSettings?: (() => void) | null
  /** The pad changes made offline, counted in the tools with Reset pads; null (or a count of 0) when none. */
  offlinePads?: { readonly count: number; readonly onReset: () => void } | null
  /**
   * Pressing a pad plays its sample on the phone until [onPadUp] (hold is
   * false for a screen reader's Play, which plays to the end); null leaves
   * the pads still. Called from pointerdown (it wakes the audio output).
   * [unsure]: a press on the scrolling all-groups page, which [onPadKept] or
   * [onPadCut] settles. [at]: the press's event timeStamp, for the latency
   * note (absent for a screen reader's Play).
   */
  onPad?: ((pad: PhysicalPad, hold: boolean, unsure?: boolean, at?: number) => void) | null
  /** The unsure press on a pad was a press after all (no scroll within PRESS_DELAY_MS, or a lift inside it). */
  onPadKept?: (pad: PhysicalPad) => void
  onPadUp?: (pad: PhysicalPad) => void
  /** The press on a pad turned into a scroll (the all-groups page): its sound ends at once (default: [onPadUp]). */
  onPadCut?: (pad: PhysicalPad) => void
  /** What sounds on the phone (several pads at once for a chord), ringed; none by default. */
  playing?: LivePlaying | null
  /** A light tick (navigator.vibrate) when a finger presses a pad or key (Settings → Haptics). */
  haptics?: boolean
  /** KEYS: the pads become notes of one sound, like the EP-133's KEYS mode. */
  keys?: KeysShown
  keysActions?: KeysActions
  /** The KEYS list open over the grid (a navigation layer, so Back closes it); see [KeysPicker]. */
  picker?: KeysPicker | null
  onPicker?: (picker: KeysPicker | null) => void
  /** KEYS on the pads or the piano, remembered for a wide window and a tall one (AUTO by default). */
  keysViewWide?: KeysView
  keysViewTall?: KeysView
  /** Live's EDIT; null (screenshots, tests): no editing. */
  edit?: EditUi | null
  /** The display line is in the top bar (a phone on its side, [LivePill]), so the page leaves it out. */
  inBar?: boolean
  /** The piano's notes while it shows, null otherwise: the line in the top bar names a device note past them. */
  onPianoRange?: (range: NoteRange | null) => void
  /** TAKE: its key and the takes in Live tools, its badge on the display; none, no TAKE (Kotlin's null TakeUi). */
  take?: TakeUi | null
  takes?: TakesUi
  /** Web only, on the desk: the EP-133 K.O. II drawn whole (live/DeviceView), else main's layouts. */
  deviceView?: boolean
  onDeviceView?: (on: boolean) => void
  /** Opens the shortcut guide searched for [query] (the device view's key cards). */
  onGuide?: (query: string) => void
}


/** The MIDI event clock the mirror's times are on (MIDIMessageEvent.timeStamp). */
const perfNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

const NOTHING: ReadonlySignal<ReadonlySet<number>> = signal<ReadonlySet<number>>(new Set())
const NOTHING_PLAYS: LivePlaying = { pads: NOTHING, notes: NOTHING }

/** Whether [key] is in [set], read so that only a change of that answer re-renders the caller. */
function useHas(set: ReadonlySignal<ReadonlySet<number>>, key: number): boolean {
  return useMemo(() => computed(() => set.value.has(key)), [set, key]).value
}

/**
 * [render] as a component that renders again only when [same] says its props
 * changed (preact/compat's memo, without the rest of compat).
 */
function memo<P extends object>(render: FunctionComponent<P>, same: (a: P, b: P) => boolean): FunctionComponent<P> {
  function shouldUpdate(this: Component<P>, next: P): boolean {
    return !same(this.props, next)
  }
  function Memoed(this: Component<P>, props: P): JSX.Element {
    this.shouldComponentUpdate = shouldUpdate
    return h(render, props)
  }
  return Memoed as FunctionComponent<P>
}

/** Sets [el]'s --glow to [value] unless it already has it (the frame loop runs 60 times a second). */
function setGlow(el: HTMLElement, value: string): void {
  if (el.style.getPropertyValue('--glow') !== value) el.style.setProperty('--glow', value)
}

/** Writes every pad's, key's and group's glow at [now] straight into the DOM (the frame loop's step), only where it changed. */
function applyGlow(
  root: HTMLElement,
  pads: ReadonlyMap<number, PadLight>,
  notes: ReadonlyMap<number, PadLight>,
  keyNotes: readonly number[] | null,
  now: number,
): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-pad]')) {
    const l = pads.get(Number(el.dataset.pad))
    setGlow(el, glowCss(l ? glow(l, now) : 0))
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-group]')) {
    setGlow(el, glowCss(groupGlow(pads, Number(el.dataset.group), now)))
  }
  if (keyNotes) {
    const lit = keysLit(notes, keyNotes, now)
    for (const el of root.querySelectorAll<HTMLElement>('[data-key]')) {
      setGlow(el, glowCss(lit.get(Number(el.dataset.key)) ?? 0))
    }
    // The piano: each key by its own note.
    for (const el of root.querySelectorAll<HTMLElement>('[data-note]')) {
      const l = notes.get(Number(el.dataset.note))
      setGlow(el, glowCss(l ? glow(l, now) : 0))
    }
  }
}

/**
 * The pointer handlers of a pad or key that sounds while held (Kotlin
 * holdToPlay). [inScroll]: the all-groups page scrolls, so a drag that
 * starts at once cuts the sound. [haptic]: a tick after each finger's press.
 */
function holdHandlers(
  tracker: PressTracker,
  target: PressTarget,
  inScroll: boolean,
  haptic: boolean,
  /** Where the pad keeps the pointers it gave the tracker, to end them when EDIT turns on. */
  ids?: Set<number>,
): ButtonHTMLAttributes<HTMLButtonElement> {
  // Web: the cap stays down while a finger holds it (data-down, theme/cap.css), as
  // :active is not reliable for several fingers or with touch-action: none.
  // An attribute, not a class, so a re-render's class string leaves it alone;
  // a quick tap keeps it a moment (live/capDown.ts).
  const lift = (el: HTMLElement): void => capUp(el)
  // The tick comes after the press is handed on, so the sound never waits for it.
  const pressed = ticking(target, haptic, tick)
  return {
    onPointerDown: (e) => {
      // The mouse's other buttons (and a pen's barrel button) don't play.
      if (e.pointerType === 'mouse' && e.button !== 0) return
      capDown(e.currentTarget)
      ids?.add(e.pointerId)
      tracker.down(e.pointerId, e.clientX, e.clientY, pressed, inScroll, e.timeStamp)
    },
    onPointerMove: (e) => {
      tracker.move(e.pointerId, e.clientX, e.clientY)
      // A press the drag turned into a scroll lets the cap up.
      if (!tracker.has(e.pointerId) && ids?.delete(e.pointerId)) lift(e.currentTarget)
    },
    onPointerUp: (e) => {
      lift(e.currentTarget)
      ids?.delete(e.pointerId)
      tracker.up(e.pointerId)
    },
    // The browser took the pointer for a scroll.
    onPointerCancel: (e) => {
      lift(e.currentTarget)
      ids?.delete(e.pointerId)
      tracker.cancel(e.pointerId, true)
    },
    onPointerLeave: (e) => {
      lift(e.currentTarget)
      ids?.delete(e.pointerId)
      tracker.cancel(e.pointerId)
    },
    // A screen reader's or the keyboard's Play: the whole sound.
    onClick: (e) => {
      if (e.detail === 0) target.press(false)
    },
    // A long press is a held note, not a context menu.
    onContextMenu: (e) => e.preventDefault(),
  }
}

/** The size of [el]'s box, kept up to date (web: the desk's BoxWithConstraints); 0 x 0 while [on] is false. */
function useBoxSize(el: { readonly current: HTMLElement | null }, on: boolean): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const node = el.current
    if (!on || !node) return
    const read = (): void => {
      const r = node.getBoundingClientRect()
      setSize((s) => (s.width === r.width && s.height === r.height ? s : { width: r.width, height: r.height }))
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(node)
    return () => ro.disconnect()
  }, [on])
  return size
}

export function MirrorScreen(props: MirrorScreenProps): JSX.Element {
  const { mirror, nameOf, onBack = null, fixedNow = null, oneGroup, follow } = props
  const keys = props.keys ?? DEFAULT_KEYS
  const actions = props.keysActions ?? {}
  const onPad = props.onPad ?? null
  const playing = props.playing ?? NOTHING_PLAYS
  const haptic = props.haptics ?? false
  const edit = props.edit ?? null
  const inBar = props.inBar ?? false
  // The pads and keys are memoized, so what they call must not change with every render
  // (the caller's callbacks do): it reads the latest props instead.
  const latest = useRef(props)
  latest.current = props
  const st = mirror?.state ?? emptyMirrorState()
  const root = useRef<HTMLDivElement | null>(null)
  const now = fixedNow ?? perfNow()
  const desk = useDesk()
  // The device view: chosen in Live tools, on the desk only (web only).
  const device = desk && props.deviceView === true && props.onDeviceView !== undefined
  const fine = useFinePointer()
  const win = useWindowSize()
  // Live's own box: the piano's room comes off it (live/keyboard.ts).
  const live = useBoxSize(root, true)
  // The desk's room for the page (beside the docked tools): whether all four groups fit in one row.
  const box = useRef<HTMLDivElement | null>(null)
  const room = useBoxSize(box, desk)
  const rowPad = desk && !oneGroup && !keys.on ? rowPadSize(room.width, room.height) : null
  // KEYS on the piano or the grid: the view remembered for this window's shape, and the room.
  const shape = pianoFor(
    win.width,
    win.height,
    live.width,
    live.height,
    desk,
    props.keysViewWide ?? KeysView.AUTO,
    props.keysViewTall ?? KeysView.AUTO,
    keys.pianoWhites,
    keys.octave,
    inBar,
  )
  // The device view plays KEYS on its own pads, as the EP-133 does, unless the piano was chosen.
  const plan: PianoPlan = device && shape.view !== KeysView.PIANO ? { ...shape, range: null } : shape
  const pianoRange = keys.on ? plan.range : null
  // The line in the top bar names a device note past the piano's ends.
  const rangeKey = pianoRange ? `${pianoRange.first}:${pianoRange.last}` : null
  useEffect(() => {
    latest.current.onPianoRange?.(pianoRange)
  }, [rangeKey])
  useEffect(() => () => latest.current.onPianoRange?.(null), [])
  // In KEYS the tools go behind the strip, so the keys get the page's width.
  const docked = desk && !keys.on
  // EDIT is for the pads (the tab shows in PADS only).
  const editing = edit !== null && edit.on && !keys.on
  // Web: a computer keyboard is at hand (a desktop, or a fine pointer): its keys play. They say so
  // (hints, aria-keyshortcuts, the target group) only while Settings → Computer keyboard is on.
  const keyboard = desk || fine
  const keyHints = keyboard && computerKeys.value
  // A phone on its side: too short for the upright grid with its group keys under it.
  const sideways = !desk && win.width > win.height && win.height < SIDEWAYS_MAX_HEIGHT

  // Every finger on the pads or keys; all of them end when the screen goes.
  const tracker = useMemo(() => new PressTracker(), [])
  useEffect(() => () => tracker.releaseAll(), [tracker])
  // Chrome: each move as it arrives, so a press that turns into a scroll is cut a frame sooner.
  // The tracker skips pointers it doesn't hold, and those pointers' frame-aligned pointermove.
  // Listened for only while a press's scroll window is open: raw moves come at the device's
  // rate (up to 1000 a second for a mouse), and a hover the rest of the time needs none.
  useEffect(() => {
    if (!rawMovesSupported()) return
    const onRaw = (e: Event): void => {
      const p = e as PointerEvent
      tracker.move(p.pointerId, p.clientX, p.clientY, true)
    }
    tracker.onWindows = (open) => {
      if (open) document.addEventListener('pointerrawupdate', onRaw)
      else document.removeEventListener('pointerrawupdate', onRaw)
    }
    return () => {
      tracker.onWindows = null
      document.removeEventListener('pointerrawupdate', onRaw)
    }
  }, [tracker])

  // The fade runs on the frame clock while a released pad (or, in KEYS, note) is fading,
  // and stops after. Each render writes the glow too, so the DOM never keeps a value from a stopped loop.
  const pads = st.pads
  const notes = st.notes
  const keyNotes = useMemo(
    () => (keys.on ? Keys.notes(keys.root, keys.scale, keys.octave) : null),
    [keys.on, keys.root, keys.scale, keys.octave],
  )
  useLayoutEffect(() => {
    if (fixedNow === null && root.current) applyGlow(root.current, pads, notes, keyNotes, perfNow())
  })
  useEffect(() => {
    if (fixedNow !== null || typeof requestAnimationFrame === 'undefined') return
    const running = (t: number): boolean => fading(pads, t) || (keyNotes !== null && fading(notes, t))
    let raf = 0
    const frame = (): void => {
      const t = perfNow()
      if (root.current) applyGlow(root.current, pads, notes, keyNotes, t)
      raf = running(t) ? requestAnimationFrame(frame) : 0
    }
    if (running(perfNow())) raf = requestAnimationFrame(frame)
    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [pads, notes, keyNotes, fixedNow])

  // The group shown in the one-group view; Follow switches it to the group just played.
  const [group, setGroup] = useState(props.initialGroup ?? 0)
  const hitGroup = st.lastHit?.pad?.group ?? null
  useEffect(() => {
    if ((oneGroup || device) && follow && hitGroup !== null) setGroup(hitGroup)
  }, [hitGroup, st.lastHit, follow, oneGroup, device])

  // In the pads view, the pad just played on the device is the sound KEYS will play.
  // A list left open when KEYS went off (a reload, another tab) closes with it.
  const picker = props.picker ?? null
  useEffect(() => {
    if (!keys.on && picker !== null) props.onPicker?.(null)
  }, [keys.on, picker])

  const hitPad = st.lastHit?.pad ?? null
  useEffect(() => {
    if (!keys.on && hitPad !== null) actions.onSelect?.(hitPad)
  }, [st.lastHit, keys.on])

  // The desk's docked column: TOOLS or SOUNDS (with EDIT available).
  const [toolsTab, setToolsTab] = useState<'tools' | 'sounds'>('tools')
  // A device sound being dragged from the Sounds tab, and the pad it is over (padKey).
  const [dragged, setDragged] = useState<SoundEntry | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const dropOn = edit !== null && desk && !keys.on
  const draggedName = dragged?.name ?? null
  // Kept while nothing about it changes, so the memoized pads don't all re-render (the edit
  // callbacks are read from the latest props).
  const drop: DropUi | null = useMemo(
    () =>
      dropOn
        ? {
            at: dropAt,
            name: draggedName,
            nameNow: (pad) => latest.current.edit?.nameNow(pad) ?? null,
            onOver: setDropAt,
            onDrop: (pad, e) => {
              setDropAt(null)
              setDragged(null)
              const ed = latest.current.edit
              if (!ed) return
              const slot = Number(e.dataTransfer?.getData(SLOT_MIME) ?? '')
              if (Number.isInteger(slot) && slot > 0) {
                ed.onDropSlot(pad, slot, SoundSource.of(e.dataTransfer?.getData(SOURCE_MIME) ?? '') ?? SoundSource.DEVICE)
                return
              }
              const file = e.dataTransfer?.files?.[0]
              if (file) ed.onDropFile(pad, file)
            },
          }
        : null,
    [dropOn, dropAt, draggedName],
  )

  // Settings left the top bar: its way in is here, first in the tools (not on the desk, whose rail has its key).
  const onSettings = desk ? null : (props.onSettings ?? null)
  const settingsRow = onSettings !== null && (
    <RowCard>
      <LinkRow title={CoachText.SETTINGS} icon={ArcIcon.GEAR} coach="tools.settings" onClick={onSettings} />
    </RowCard>
  )
  // Not connected (nothing read, or offline from the last read): the factory sounds to get, after it.
  const getFactory = mirror?.error === MirrorText.NOT_CONNECTED || mirror?.offline != null ? (props.onGetFactory ?? null) : null
  const factoryRow = getFactory !== null && (
    <RowCard>
      <SettingRow
        title={FeatureText.FACTORY_SOUNDS}
        note={FeatureText.FACTORY_NOTE}
        control={(ids) => <RowAction text={FeatureText.GET} describedBy={ids.titleId} onClick={getFactory} />}
      />
    </RowCard>
  )
  // Pads changed offline in arc only: how many, and Reset pads.
  const offlinePads = props.offlinePads ?? null
  const offlinePadsRow = offlinePads !== null && offlinePads.count > 0 && (
    <RowCard>
      <SettingRow
        title={MirrorText.OFFLINE_PADS}
        note={MirrorText.offlinePadsNote(offlinePads.count)}
        control={(ids) => <RowAction text={MirrorText.RESET_PADS} describedBy={ids.titleId} onClick={offlinePads.onReset} />}
      />
    </RowCard>
  )
  const take = props.take ?? null
  const takesSection = take && props.takes ? <TakesSection takes={props.takes} take={take} /> : null
  const tools = keys.on ? (
    <>
      {settingsRow}
      {factoryRow}
      {offlinePadsRow}
      <KeysPanel keys={keys} actions={actions} piano={pianoRange !== null} hint={!plan.switchShown} keyboard={keyHints} />
      {takesSection}
    </>
  ) : (
    <>
      {settingsRow}
      {factoryRow}
      {offlinePadsRow}
      <RowCard>
        <SettingRow
          title={MirrorText.VIEW}
          stack
          control={(ids) => (
            <Segmented
              compact
              fill
              options={desk && props.onDeviceView ? [MirrorText.ALL_GROUPS, MirrorText.ONE_GROUP, WebText.VIEW_DEVICE] : [MirrorText.ALL_GROUPS, MirrorText.ONE_GROUP]}
              selected={device ? 2 : oneGroup ? 1 : 0}
              onSelect={(i) => {
                props.onDeviceView?.(i === 2)
                if (i !== 2) props.onOneGroup(i === 1)
              }}
              labelledBy={ids.titleId}
            />
          )}
        />
        {(oneGroup || device) && (
          <SettingRow
            title={MirrorText.FOLLOW}
            note={MirrorText.FOLLOW_NOTE}
            control={(ids) => (
              <HwToggle on={follow} onChange={props.onFollow} labelledBy={ids.titleId} describedBy={ids.noteId} />
            )}
          />
        )}
      </RowCard>
      {st.lastKeysNote !== null && <KeysStrip st={st} last={st.lastKeysNote} names={keys.names} />}
      {keyHints && <p class="t-small live-tools__note">{WebText.LIVE_PADS_KEYS_HINT}</p>}
      {takesSection}
      <Notes st={st} mirror={mirror} tapToPlay={onPad !== null} hint={!plan.switchShown} transport={inBar} />
    </>
  )
  const tabbed = docked && edit !== null
  const panel = tabbed ? (
    toolsTab === 'tools' ? (
      tools
    ) : (
      <SoundsPanel edit={edit} onDrag={(snd) => {
        setDragged(snd)
        if (snd === null) setDropAt(null)
      }} />
    )
  ) : (
    tools
  )
  const dockHead = tabbed ? <ToolsTabs tab={toolsTab} onTab={setToolsTab} /> : undefined

  const hasPad = onPad !== null
  const padPress = useMemo(
    () =>
      (pad: PhysicalPad): PressTarget | null => {
        if (!hasPad) return null
        return {
          // Unsure only when something will settle it.
          press: (hold, unsure, at) => latest.current.onPad?.(pad, hold, (unsure ?? false) && latest.current.onPadKept !== undefined, at),
          release: () => latest.current.onPadUp?.(pad),
          cut: () => (latest.current.onPadCut ?? latest.current.onPadUp)?.(pad),
          keep: () => latest.current.onPadKept?.(pad),
        }
      },
    [hasPad],
  )
  const hasEdit = edit !== null
  const editPad = useMemo(() => (hasEdit ? (pad: PhysicalPad) => latest.current.edit?.onPad(pad) : null), [hasEdit])
  const padUi: PadUi = useMemo(
    () => ({ press: padPress, edit: editPad, editing, drop, haptic, playing: playing.pads, fixedNow }),
    [padPress, editPad, editing, drop, haptic, playing.pads, fixedNow],
  )
  const keyPress = useMemo(
    () => ({
      onNote: (n: number, hold: boolean, at?: number) => latest.current.keysActions?.onNote?.(n, hold, at),
      onNoteUp: (n: number) => latest.current.keysActions?.onNoteUp?.(n),
    }),
    [],
  )

  // The computer keyboard (web, desktop): the pads, the grid's keys and Live's controls
  // (live/liveKeyboard.ts). The grid hands its keys over here; key changes are announced.
  const gridKeys = useRef<GridKeys | null>(null)
  // The keyboard's fingers on the grid, one per press, below the pointers' ids.
  const nextFinger = useRef(KEYBOARD_FINGER)
  const [spoken, setSpoken] = useState({ text: '', n: 0 })
  const setAnnounce = (text: string): void => setSpoken((a) => ({ text, n: a.n + 1 }))
  const soundsTab = docked && edit !== null
  useLiveKeys(keyboard, {
    root: () => root.current,
    context: () => ({
      keys: keys.on,
      pianoShown: pianoRange !== null,
      editAvailable: edit !== null && !keys.on,
      editOn: editing,
      oneGroup,
      viewSwitchable: keys.on && plan.switchShown && plan.room,
      soundsTab,
    }),
    pad: (offset) => {
      const pad = physicalPad(group, offset)
      const target = padPress(pad)
      if (target === null) return null
      const key = padKey(pad)
      // The cap pressed, kept: a group change reuses the button for another pad meanwhile.
      let el: Element | null = null
      return {
        id: `pad:${key}`,
        down: (at) => {
          target.press(true, false, at)
          el = root.current?.querySelector(`[data-pad="${key}"]`) ?? null
          if (el) holdCap(el, (e) => capDown(e))
        },
        up: () => {
          target.release()
          if (el) releaseCap(el, (e) => capUp(e))
        },
      }
    },
    gridKey: (offset) => {
      const grid = gridKeys.current
      const note = keyNotes?.[offset]
      if (grid === null || pianoRange !== null || note === undefined) return null
      let el: Element | null = null
      // A finger of its own: after an octave or key change the same key is another note, a press of its own.
      const finger = nextFinger.current--
      return {
        id: `key:${offset}:${note}`,
        down: (at) => {
          grid.down(offset, finger, at)
          el = root.current?.querySelector(`.live-kgrid [data-key="${offset}"]`) ?? null
          if (el) holdCap(el, (e) => capDown(e))
        },
        up: () => {
          grid.up(finger)
          if (el) releaseCap(el, (e) => capUp(e))
        },
      }
    },
    run: (cmd) => {
      switch (cmd.kind) {
        case 'group':
          setGroup(cmd.group)
          setAnnounce(`${MirrorText.GROUP} ${MirrorText.groupKey(cmd.group)}`)
          return
        case 'editPad':
          editPad?.(physicalPad(group, cmd.offset))
          return
        case 'edit':
          if (edit === null) return
          edit.onChange(!edit.on)
          setAnnounce(WebText.switched(MirrorText.EDIT_TAB, !edit.on))
          return
        case 'view':
          if (!keys.on) {
            props.onOneGroup(!oneGroup)
            setAnnounce(oneGroup ? MirrorText.ALL_GROUPS : MirrorText.ONE_GROUP)
          } else {
            const piano = pianoRange === null
            actions.onView?.(plan.wide, chosenView(piano))
            setAnnounce(MirrorText.keysView(piano))
          }
          return
        case 'follow':
          props.onFollow(!follow)
          setAnnounce(WebText.switched(MirrorText.FOLLOW, !follow))
          return
        case 'mode':
          actions.onMode?.(!keys.on)
          setAnnounce(keys.on ? MirrorText.MODE_PADS : MirrorText.MODE_KEYS)
          return
        case 'find':
          setToolsTab('sounds')
          setTimeout(() => root.current?.querySelector<HTMLInputElement>('.snd__input')?.focus(), 0)
          return
        case 'octave': {
          const next = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, keys.octave + cmd.step))
          if (next === keys.octave) return
          actions.onOctave?.(next)
          setAnnounce(MirrorText.octave(next))
          return
        }
        case 'root': {
          const next = (keys.root + cmd.step + 12) % 12
          actions.onRoot?.(next)
          setAnnounce(`${MirrorText.KEY} ${Keys.name(next, keys.names)}`)
          return
        }
        case 'scale': {
          const next = SCALES[(SCALES.indexOf(keys.scale) + cmd.step + SCALES.length) % SCALES.length]!
          actions.onScale?.(next)
          setAnnounce(`${MirrorText.SCALE} ${MirrorText.scaleName(next)}`)
          return
        }
        default:
          return
      }
    },
    escape: () => {
      if (editing && edit !== null) {
        edit.onChange(false)
        setAnnounce(WebText.switched(MirrorText.EDIT_TAB, false))
        return true
      }
      if (!props.onStop) return false
      props.onStop()
      return true
    },
  })

  const modeRow = (
    <ModeRow
      keys={keys}
      actions={actions}
      picker={props.onPicker ? picker : undefined}
      onPicker={props.onPicker}
      plan={plan}
    />
  )
  // The KEYS grid on a phone on its side: the row's two halves, either side of the keys.
  const modeLead = <ModeRow keys={keys} actions={actions} picker={props.onPicker ? picker : undefined} onPicker={props.onPicker} plan={plan} part="lead" />
  const modePicks = <ModeRow keys={keys} actions={actions} picker={props.onPicker ? picker : undefined} onPicker={props.onPicker} plan={plan} part="picks" />
  // On a phone on its side the line is in the top bar instead.
  const displayStrip = inBar ? null : editing ? <EditStrip /> : <DisplayStrip st={st} mirror={mirror} take={take} still={fixedNow !== null} />
  const allGroups = (
    <div class="live__all">
      <div class="live__head">
        <Caption text={MirrorText.TITLE} as="h1" />
        {onBack && <CloseKey class="live__close" onClick={onBack} description={GUIDE_CLOSE} />}
      </div>
      {inBar ? null : editing ? <EditStrip /> : <Display st={st} mirror={mirror} initialNoteOpen={props.initialNoteOpen ?? false} onGetFactory={props.onGetFactory ?? null} take={take} still={fixedNow !== null} />}
      {modeRow}
      {/* Four groups in a row when there is room, two by two on a phone. */}
      <div class="live__groups">
        <div class="live__grid">
          {[0, 1, 2, 3].map((g) => (
            <Group key={g} group={g} st={st} nameOf={nameOf} now={now} ui={padUi} tracker={tracker} target={keyHints && g === group} keyHints={keyHints && g === group} />
          ))}
        </div>
      </div>
    </div>
  )
  // On the desk, EDIT's tab on the panel's left side (the shell draws it on a phone).
  const editTab = desk && edit !== null && !keys.on ? (
    <EditEdgeTab class="live-edit-tab" on={edit.on} onChange={edit.onChange} keyShortcut={keyHints ? 'E' : undefined} />
  ) : null

  let page: JSX.Element
  if (pianoRange !== null) {
    // KEYS on the piano: the display line, the row over the keys, the keys across the page
    // (on the desk on the device's body, the colours' legend under it).
    page = (
      <div class={`live-piano${desk ? ' live-piano--desk' : ''}`} style={{ '--piano-h': `${plan.height}px` }}>
        {onBack && (
          <div class="live__head">
            <Caption text={MirrorText.TITLE} />
            <CloseKey class="live__close" onClick={onBack} description={GUIDE_CLOSE} />
          </div>
        )}
        <div class="live-piano__body">
          {!inBar && <KeysDisplay st={st} mirror={mirror} keys={keys} playing={playing} pianoRange={pianoRange} />}
          {modeRow}
          <div
            class="live-piano__keys"
            data-coach="live.keys"
            data-coach-label={CoachText.PIANO}
            data-coach-face={COACH_YELLOW}
            data-coach-ink={COACH_YELLOW_INK}
          >
            <PianoKeyboard
              class={desk ? 'piano--flat' : undefined}
              range={pianoRange}
              st={st}
              keys={keys}
              playingNotes={playing.notes}
              haptics={haptic}
              now={now}
              onNote={(n, hold, at) => actions.onNote?.(n, hold, at)}
              onNoteUp={(n) => actions.onNoteUp?.(n)}
              computer={desk || fine}
              onOctave={(o) => actions.onOctave?.(o)}
            />
          </div>
        </div>
        {desk && <PianoLegend />}
      </div>
    )
  } else if (device) {
    // The device view: the EP-133 K.O. II drawn whole, in the room left of the docked tools (web only).
    page = (
      <div class="live__device">
        <DeviceView
          st={st}
          mirror={mirror}
          keys={keys}
          keyNotes={keyNotes}
          playingNotes={playing.notes.value}
          nameOf={nameOf}
          now={now}
          group={group}
          onGroup={setGroup}
          onMode={actions.onMode}
          onOctave={actions.onOctave}
          press={padPress}
          keyPress={(n) => ({ press: (hold) => keyPress.onNote(n, hold), release: () => keyPress.onNoteUp(n) })}
          playingPads={playing.pads.value}
          tracker={tracker}
          take={take}
          still={fixedNow !== null}
          onGuide={props.onGuide}
          hold={(target) => holdHandlers(tracker, target, false, haptic)}
        />
        {keys.on && modeRow}
      </div>
    )
  } else if (desk) {
    // The desk: the K.O. II (or the row of groups) in the room left of the docked tools.
    let body: JSX.Element
    if (keys.on && keyNotes) {
      body = (
        <div class="live-ko live-ko--keys">
          <KeysDisplay st={st} mirror={mirror} keys={keys} playing={playing} pianoRange={null} />
          {modeRow}
          <div class="live-ko__body">
            <KeysGrid st={st} keys={keys} keyNotes={keyNotes} now={now} actions={keyPress} tracker={tracker} playing={playing.notes} haptic={haptic} keysRef={gridKeys} />
          </div>
        </div>
      )
    } else if (oneGroup) {
      body = (
        <div class="live-ko">
          {editTab}
          {displayStrip}
          {modeRow}
          <div class="live-ko__body">
            <GroupKeys keyboard={keyHints} group={group} st={st} now={now} onSelect={setGroup} vertical />
            <Group group={group} st={st} nameOf={nameOf} now={now} big coach ui={padUi} tracker={tracker} keyHints={keyHints} />
          </div>
        </div>
      )
    } else if (rowPad !== null) {
      // All four in one row, nothing to scroll, so a press plays at once.
      body = (
        <div class="live-row desk-paper" style={{ '--row-pad': `${rowPad}px` }}>
          {editTab}
          {displayStrip}
          {modeRow}
          <div class="live-row__groups">
            {[0, 1, 2, 3].map((g) => (
              <Group key={g} group={g} st={st} nameOf={nameOf} now={now} fill ui={padUi} tracker={tracker} target={keyHints && g === group} keyHints={keyHints && g === group} />
            ))}
          </div>
        </div>
      )
    } else {
      body = (
        <div class="live-scroll-wrap">
          {editTab}
          <div class="live-scroll desk-paper">{allGroups}</div>
        </div>
      )
    }
    page = (
      <div class="live-stage">
        {onBack && (
          <div class="live__head">
            <Caption text={MirrorText.TITLE} />
            <CloseKey class="live__close" onClick={onBack} description={GUIDE_CLOSE} />
          </div>
        )}
        <div ref={box} class="live-stage__box">{body}</div>
      </div>
    )
  } else if (oneGroup || keys.on) {
    page = (
      // One group (or the keys) fills the screen without scrolling: the display line, the grid
      // (its rows share whatever height is left) and the group keys.
      <div class={`live__one${sideways ? ' live__one--side' : ''}`}>
        {onBack && (
          <div class="live__head">
            <Caption text={MirrorText.TITLE} />
            <CloseKey class="live__close" onClick={onBack} description={GUIDE_CLOSE} />
          </div>
        )}
        {keys.on && keyNotes && sideways ? (
          // KEYS on the pads on a phone on its side: the keys on the K.O. II's body as big as the
          // room, the mode word (turned) and the view switch a column on their left, the scale and
          // the octave one on their right.
          <>
            {!inBar && <KeysDisplay st={st} mirror={mirror} keys={keys} playing={playing} pianoRange={null} />}
            <div class="live__side live__side--keys">
              <div class="live__side-tools">{modeLead}</div>
              <KeysGrid st={st} keys={keys} keyNotes={keyNotes} now={now} actions={keyPress} tracker={tracker} playing={playing.notes} haptic={haptic} keysRef={gridKeys} />
              <div class="live__side-end">{modePicks}</div>
            </div>
          </>
        ) : keys.on && keyNotes ? (
          <>
            {!inBar && <KeysDisplay st={st} mirror={mirror} keys={keys} playing={playing} pianoRange={null} />}
            <KeysGrid st={st} keys={keys} keyNotes={keyNotes} now={now} actions={keyPress} tracker={tracker} playing={playing.notes} haptic={haptic} keysRef={gridKeys} />
            {modeRow}
          </>
        ) : sideways ? (
          // A phone on its side (Android's sideways grid): the K.O. II's body as big as the room,
          // the group keys a column left of the pads, as on the device, and the mode word turned
          // a quarter turn left of the body rather than a row under it, so the pads get its height.
          <>
            {displayStrip}
            <div class="live__side">
              <div class="live__side-tools">{modeRow}</div>
              <div class="ko-body">
                <GroupKeys keyboard={keyHints} group={group} st={st} now={now} onSelect={setGroup} vertical />
                <Group group={group} st={st} nameOf={nameOf} now={now} big coach ui={padUi} tracker={tracker} keyHints={keyHints} />
              </div>
            </div>
          </>
        ) : (
          <>
            {displayStrip}
            <Group group={group} st={st} nameOf={nameOf} now={now} big coach ui={padUi} tracker={tracker} keyHints={keyHints} />
            {modeRow}
            <GroupKeys keyboard={keyHints} group={group} st={st} now={now} onSelect={setGroup} />
          </>
        )}
      </div>
    )
  } else {
    page = allGroups
  }

  return (
    <div ref={root} class="live" data-screen="live">
      <SideZone
        open={props.toolsOpen}
        onOpen={() => props.onTools(true)}
        onClose={() => props.onTools(false)}
        title={MirrorText.TOOLS}
        panel={panel}
        docked={docked}
        dockHead={dockHead}
      >
        {page}
      </SideZone>
      {/* What a computer keyboard key just changed, for screen readers. */}
      {keyboard && (
        <span class="sr-only" aria-live="polite">
          {/* A new node for each change, so the same words twice are spoken twice. */}
          <span key={spoken.n}>{spoken.text}</span>
        </span>
      )}
    </div>
  )
}

/** The display line while EDIT is on: EDIT, and what a tap on a pad does now. [compact]: in the top bar ([LivePill]). */
function EditStrip(props: { compact?: boolean }): JSX.Element {
  return (
    <div class={`live-strip live-strip--edit${props.compact ? ' live-strip--bar' : ''}`} aria-live="polite">
      <span class="live-strip__sub">{MirrorText.EDIT_TAB}</span>
      <span class="live-strip__line live-strip__line--start">{MirrorText.EDIT_LINE}</span>
    </div>
  )
}

/** The desk's docked column's two tabs: the tools, and the device's sounds (EDIT). */
function ToolsTabs(props: { tab: 'tools' | 'sounds'; onTab: (tab: 'tools' | 'sounds') => void }): JSX.Element {
  const row = useRef<HTMLDivElement | null>(null)
  const tabs = ['tools', 'sounds'] as const
  const at = tabs.indexOf(props.tab)
  return (
    <div
      ref={row}
      class="live-tabs"
      role="tablist"
      aria-label={MirrorText.TOOLS}
      onKeyDown={(e) => handleRovingKey(e, at, 2, row.current, (i) => props.onTab(tabs[i]!))}
    >
      {tabs.map((t, i) => {
        const on = i === at
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            data-roving=""
            data-coach={t === 'sounds' ? 'live.sounds' : undefined}
            class={`live-tabs__tab cap-3d${on ? ' is-on is-down' : ''}`}
            onClick={() => props.onTab(t)}
          >
            {t === 'tools' ? MirrorText.TAB_TOOLS : MirrorText.TAB_SOUNDS}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The desk's Sounds tab: the device's sounds to drag onto a pad, the hint,
 * and a drop zone for WAV files (uploaded to free slots). Offline, the last
 * read's sounds and the factory pack's, to change the pads in arc only (no
 * uploads without the EP-133).
 */
function SoundsPanel(props: { edit: EditUi; onDrag: (snd: SoundEntry | null) => void }): JSX.Element {
  const { edit } = props
  const [over, setOver] = useState(false)
  const files = (e: TargetedDragEvent<HTMLElement>): boolean => dragMayHaveAudio(e.dataTransfer)
  const off = edit.connected ? null : edit.offline
  if (!edit.connected && off === null) return <p class="t-small live-sounds__hint">{MirrorText.EDIT_OFFLINE}</p>
  if (off !== null) {
    return (
      <div class="live-sounds">
        <SoundPicker
          sounds={off.device ?? []}
          factory={off.factory}
          unavailable={off.unavailable}
          padSource={off.base}
          offline
          playing={edit.playing}
          onPlay={edit.onPlay}
          onStop={edit.onStop}
          onDrag={props.onDrag}
          findLabel={FeatureText.FIND_HINT}
          scroll
        />
        <p class="t-small live-sounds__hint">{WebText.DRAG_HINT_OFFLINE}</p>
      </div>
    )
  }
  return (
    <div class="live-sounds">
      <SoundPicker
        sounds={edit.sounds}
        playing={edit.playing}
        onPlay={(slot) => edit.onPlay(slot, SoundSource.DEVICE)}
        onStop={edit.onStop}
        onDrag={props.onDrag}
        findLabel={FeatureText.FIND_HINT}
        scroll
      />
      <p class="t-small live-sounds__hint">{WebText.DRAG_HINT}</p>
      <div
        class={`live-sounds__drop${over ? ' is-over' : ''}`}
        onDragEnter={(e) => {
          if (!files(e)) return
          e.preventDefault()
          setOver(true)
        }}
        onDragOver={(e) => {
          if (!files(e)) return
          e.preventDefault()
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false)
          if (!files(e)) return
          const audio = Array.from(e.dataTransfer?.files ?? []).filter(isAudioFile)
          // Only backups (.pak) or other files: the page's own drop imports them.
          if (audio.length === 0) return
          e.preventDefault()
          // Not the page's own drop (a .pak import).
          e.stopPropagation()
          edit.onUpload(audio)
        }}
      >
        {WebText.DROP_SAMPLE}
      </div>
    </div>
  )
}

/** The piano's colours, under it on the desk: what each mark means, with a small swatch. */
function PianoLegend(): JSX.Element {
  const rows: [string, string][] = [
    ['device', MirrorText.LEGEND_DEVICE],
    ['here', WebText.LIVE_LEGEND_HERE],
    ['root', MirrorText.LEGEND_ROOT_BAR],
    ['out', MirrorText.LEGEND_OUT],
  ]
  return (
    <ul class="live-piano__legend">
      {rows.map(([kind, text]) => (
        <li key={kind}>
          <span class={`live-chips__swatch live-chips__swatch--${kind}`} aria-hidden="true" />
          {text}
        </li>
      ))}
    </ul>
  )
}

/**
 * The one-group view's display as a single dark line: play state, tempo and
 * project on the left, the pad just played on the right. [compact]: one bar
 * tall, in the top bar ([LivePill]).
 */
function DisplayStrip(props: { st: MirrorState; mirror: MirrorUi | null; compact?: boolean; take?: TakeUi | null; still?: boolean }): JSX.Element {
  const { st, mirror } = props
  return (
    <div class={`live-strip${props.compact ? ' live-strip--bar' : ''}`} aria-live="polite">
      <PatternLine compact={props.compact} still={props.still}>
        {st.playing === true && <span class="live-strip__sub live-strip__ink" role="img" aria-label={MirrorText.PLAYING}>{'▶'}</span>}
        {st.playing === false && <span class="live-strip__sub live-strip__dim" role="img" aria-label={MirrorText.STOPPED}>{'■'}</span>}
        {/* Offline and the project are only read out: the top bar and the PROJECT key show them. */}
        {st.playing === null && mirror?.offline != null && <span class="sr-only">{MirrorText.OFFLINE}</span>}
        {st.bpm !== null && <span class="live-strip__sub live-strip__ink">{MirrorText.bpm(st.bpm)}</span>}
        {st.activeProject !== null && <span class="sr-only">{MirrorText.project(st.activeProject)}</span>}
        <span class="live-strip__line">{displayLine(st, mirror)}</span>
      </PatternLine>
      <TakeBadge take={props.take} still={props.still} />
    </div>
  )
}

function Display(props: {
  st: MirrorState
  mirror: MirrorUi | null
  initialNoteOpen: boolean
  onGetFactory: (() => void) | null
  take?: TakeUi | null
  still?: boolean
}): JSX.Element {
  const { st, mirror } = props
  const offline = showOffline(st, mirror)
  const getFactory = mirror?.error === MirrorText.NOT_CONNECTED ? props.onGetFactory : null
  // Why it is offline stays folded under the word until asked for, so the pads keep the room.
  const [noteOpen, setNoteOpen] = useState(props.initialNoteOpen)
  return (
    <DisplayPanel class="live-display">
      <div class="live-display__row">
        {offline ? (
          <button
            type="button"
            class="live-display__fold"
            aria-expanded={noteOpen}
            aria-controls="live-offline-note"
            onClick={() => setNoteOpen(!noteOpen)}
          >
            <span class="t-display-head live-display__ink">{MirrorText.OFFLINE}</span>
            <span class="t-display-sub live-display__dim" aria-hidden="true">{noteOpen ? '▴' : '▾'}</span>
          </button>
        ) : (
          <span class="live-display__transport t-display-head">{transportText(st.playing)}</span>
        )}
        {st.bpm !== null && <span class="t-display-sub live-display__ink">{MirrorText.bpm(st.bpm)}</span>}
        {st.activeProject !== null && (
          <span class="t-display-sub live-display__dim">{MirrorText.project(st.activeProject)}</span>
        )}
        <TakeBadge take={props.take} still={props.still} />
      </div>
      <PatternRow still={props.still} />
      <p class={`live-display__line t-stat-free${displayLineSmall(st, mirror) ? ' live-display__line--small' : ''}`}>
        {displayLine(st, mirror)}
      </p>
      {/* Offline, the folded note; never read, the factory sounds to get; else the all-groups view explains clock out. */}
      {offline ? (
        noteOpen && (
          <p id="live-offline-note" class="live-display__hint live-display__note t-display-hint">
            {MirrorText.offlineNote(mirror?.offline ?? '')}
          </p>
        )
      ) : getFactory !== null ? (
        <button type="button" class="live-display__get t-display-hint" onClick={getFactory}>
          {MirrorText.GET_FACTORY}
        </button>
      ) : (
        st.playing === null && st.bpm === null && <p class="live-display__hint t-display-hint">{MirrorText.NO_TRANSPORT}</p>
      )}
    </DisplayPanel>
  )
}

/**
 * The pattern's row in the all-groups display (Kotlin PatternRow): RECORD
 * and PLAY, and its words while it has some. There while stopped too, so the
 * pads don't move as the pattern starts; none without a pattern.
 */
function PatternRow(props: { still?: boolean }): JSX.Element | null {
  const t = useContext(TransportContext)
  if (t === null) return null
  return (
    <div class="live-display__pattern">
      <PatternLine still={props.still} word />
    </div>
  )
}

/** A pad's long press in EDIT plays it (a tap opens its sheet). */
const EDIT_HOLD_MS = 450

/** What a press on a pad does, for every pad of a screen. */
interface PadUi {
  /** What a press plays (null: the pads stay still). */
  press: (pad: PhysicalPad) => PressTarget | null
  /** Opens a pad's sheet (EDIT, and a right-click with the mouse); null without EDIT. */
  edit: ((pad: PhysicalPad) => void) | null
  /** EDIT is on: a tap opens the sheet, a long press plays. */
  editing: boolean
  /** The desk: sounds and WAVs dropped on the pads; null elsewhere. */
  drop: DropUi | null
  /** A tick after a finger's press. */
  haptic: boolean
  /** The pads sounding on the phone (padKey), each pad reading its own ring. */
  playing: ReadonlySignal<ReadonlySet<number>>
  /** A fixed time for screenshots; null: a pad's glow is taken at the time it renders. */
  fixedNow: number | null
}

/** Dropping on the pads (the desk). */
interface DropUi {
  /** The pad (padKey) something is dragged over, null when none. */
  at: number | null
  /** The device sound being dragged, by name, for "old → new" (null: a file, or from elsewhere). */
  name: string | null
  /** The sound on a pad now, when the mirror can't name it. */
  nameNow: (pad: PhysicalPad) => string | null
  onOver: (pad: number | null) => void
  onDrop: (pad: PhysicalPad, e: TargetedDragEvent<HTMLElement>) => void
}

interface GroupProps {
  group: number
  st: MirrorState
  nameOf: (pad: PhysicalPad) => string | null
  now: number
  big?: boolean
  /** Web (the desk's all-groups row): a small grid that doesn't scroll, its pads [--row-pad] high. */
  fill?: boolean
  /** The guide overlay's "pads light as you play" tag (the big grid only). */
  coach?: boolean
  /** Web: the group the computer keyboard's pad keys play (all groups shown); its caption is marked. */
  target?: boolean
  /** Web: the computer keyboard's pad keys play this group's pads (they say their keys). */
  keyHints?: boolean
  ui: PadUi
  tracker: PressTracker
}

function Group(props: GroupProps): JSX.Element {
  const { group, st, nameOf, now, big = false, fill = false, ui, tracker } = props
  const letter = MirrorText.groupKey(group)
  return (
    <div
      class={`live-group${big ? ' live-group--big' : ''}${fill ? ' live-group--fill' : ''}`}
      data-coach={props.coach ? 'live.pads' : undefined}
    >
      {/* The caption turns orange while one of the group's pads sounds (the big grid's
          group shows on its key below instead). */}
      {!big && (
        <div
          class="live-group__caption"
          data-group={group}
          data-target={props.target ? '' : undefined}
          aria-current={props.target ? 'true' : undefined}
          style={{ '--glow': glowCss(groupGlow(st.pads, group, now)) }}
        >
          <Caption text={`${MirrorText.GROUP} ${letter}`} as="h2" color="var(--live-caption)" />
        </div>
      )}
      {/* The pads are caps sitting in the device's body (Deck). The big grid is the K.O. II's
          own: over each row of pads the words printed on the body, each after its LED. */}
      <div class={`live-deck${big ? ' live-deck--ko' : ''}`} role="group" aria-label={`${MirrorText.GROUP} ${letter}`}>
        {ROWS.map((offsets, r) => (
          <Fragment key={r}>
            {big && (
              <div class="live-deck__print" aria-hidden="true">
                {LED_ROWS[r]!.map((word) => (
                  <span key={word} class="live-deck__word">
                    <span class="ko-led" />
                    {word}
                  </span>
                ))}
              </div>
            )}
            <div class="live-deck__row">
              {offsets.map((o) => {
                const pad = physicalPad(group, o)
                return (
                  <Pad
                    key={o}
                    pad={pad}
                    light={st.pads.get(padKey(pad))}
                    name={nameOf(pad)}
                    big={big}
                    scroll={!big && !fill}
                    ui={ui}
                    tracker={tracker}
                    keyHint={props.keyHints ?? false}
                  />
                )
              })}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

/**
 * The group keys under the single grid, pale caps under LEDs as on the K.O. II:
 * the group shown stays down with its LED lit; a group lights orange while one
 * of its pads sounds. [vertical] (the desk, a phone on its side): a column beside the grid, each key
 * a pad row high (the roving keys take up / down as well as left / right).
 */
function GroupKeys(props: {
  group: number
  st: MirrorState
  now: number
  onSelect: (g: number) => void
  vertical?: boolean
  /** Web: A to D pick the group from the computer keyboard. */
  keyboard?: boolean
}): JSX.Element {
  const { group, st, now, onSelect, vertical = false } = props
  const row = useRef<HTMLDivElement | null>(null)
  return (
    <div
      ref={row}
      class={`live-keys${vertical ? ' live-keys--vertical' : ''}`}
      role="tablist"
      aria-label={MirrorText.GROUP}
      aria-orientation={vertical ? 'vertical' : undefined}
      onKeyDown={(e) => handleRovingKey(e, group, 4, row.current, onSelect)}
    >
      {[0, 1, 2, 3].map((g) => {
        const on = g === group
        return (
          <div
            key={g}
            class={`live-keys__slot${on ? ' is-on' : ''}`}
            data-group={g}
            style={{ '--glow': glowCss(groupGlow(st.pads, g, now)) }}
          >
            <span class="live-keys__led" aria-hidden="true" />
            <button
              type="button"
              role="tab"
              aria-selected={on}
              aria-label={`${MirrorText.GROUP} ${MirrorText.groupKey(g)}`}
              aria-keyshortcuts={props.keyboard ? MirrorText.groupKey(g) : undefined}
              tabIndex={on ? 0 : -1}
              data-roving=""
              data-coach={g === 0 ? 'live.groups' : undefined}
              // A's tag points at the row; the guide overlay's tags keep off the others.
              data-coach-clear={g === 0 ? undefined : ''}
              class={`live-keys__key cap-3d${on ? ' is-on is-down' : ''}`}
              onClick={() => onSelect(g)}
            >
              {/* As printed on the K.O. II: the letter in the corner, its function's glyph under it. */}
              <span class="live-keys__letter">{MirrorText.groupKey(g)}</span>
              <svg class="live-keys__glyph" viewBox="0 0 12 12" aria-hidden="true">
                <path d={GLYPHS[MirrorText.groupKey(g) as 'A' | 'B' | 'C' | 'D']} />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}

interface PadProps {
  pad: PhysicalPad
  light: PadLight | undefined
  name: string | null
  big: boolean
  /** On the scrolling all-groups page: a drag across the pads scrolls rather than plays. */
  scroll: boolean
  ui: PadUi
  tracker: PressTracker
  /** Web: the computer keyboard's pad keys play this pad (it says its key). */
  keyHint: boolean
}

/** A press on a pad in EDIT, kept across renders (the mirror re-renders the pads while a finger is down). */
interface EditPress {
  timer: ReturnType<typeof setTimeout> | null
  /** The long press started the pad's sound. */
  held: boolean
  /** The pointer pressing it, null when none. */
  id: number | null
  /**
   * What the long press plays and lets go, as at pointerdown: a later
   * render's pad may be another one (Follow switched the group).
   */
  target: PressTarget | null
  /** The kind of the last pointer down on the pad ('mouse' makes a right-click open the sheet). */
  pointer: string
}

const newEditPress = (): EditPress => ({ timer: null, held: false, id: null, target: null, pointer: '' })

/** Ends an EDIT press without opening anything: its timer stops, and a held sound is let go. */
function stopEditPress(st: EditPress): void {
  if (st.timer !== null) clearTimeout(st.timer)
  st.timer = null
  if (st.held) st.target?.release()
  st.held = false
  st.id = null
  st.target = null
}

/**
 * A pad's handlers in EDIT: a tap opens its sheet; held past [EDIT_HOLD_MS]
 * it plays until let go, as outside EDIT. A drag that turns into a scroll
 * (the all-groups page) cancels it, opening nothing.
 */
function editHandlers(st: EditPress, press: PressTarget | null, open: () => void, haptic: boolean): ButtonHTMLAttributes<HTMLButtonElement> {
  const end = (el: HTMLElement, tap: boolean): void => {
    capUp(el)
    const tapped = st.timer !== null
    stopEditPress(st)
    if (tapped && tap) open()
  }
  return {
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (st.id !== null) return
      st.id = e.pointerId
      // The long press ticks after its press, as outside EDIT.
      st.target = press !== null ? ticking(press, haptic, tick) : null
      capDown(e.currentTarget)
      // The press is the hold's end, so the latency note counts from there (a late timer included).
      const at = e.timeStamp + EDIT_HOLD_MS
      st.timer = setTimeout(() => {
        st.timer = null
        st.held = st.target !== null
        st.target?.press(true, false, at)
      }, EDIT_HOLD_MS)
    },
    onPointerUp: (e) => {
      if (e.pointerId === st.id) end(e.currentTarget, true)
    },
    onPointerCancel: (e) => {
      if (e.pointerId === st.id) end(e.currentTarget, false)
    },
    onPointerLeave: (e) => {
      if (e.pointerId === st.id) end(e.currentTarget, false)
    },
    // A screen reader's or the keyboard's activation: the sheet.
    onClick: (e) => {
      if (e.detail === 0) open()
    },
  }
}

/** A pad renders again only when what it shows or does changed (not with every mirror state). */
/**
 * A pad's mark while ERASE is on: true when the patterns have notes on it,
 * false when they don't, null with ERASE off. Only a change of the mark
 * re-renders the pad.
 */
function useEraseMark(key: number): boolean | null {
  const t = useContext(TransportContext)
  const mark = useComputed(() => {
    const u = t?.ui
    return u === undefined || !u.erase ? null : u.notePads.has(key)
  })
  return mark.value
}

const Pad = memo(
  PadCap,
  (a: PadProps, b: PadProps) =>
    padKey(a.pad) === padKey(b.pad) &&
    a.light === b.light &&
    a.name === b.name &&
    a.big === b.big &&
    a.scroll === b.scroll &&
    a.ui === b.ui &&
    a.tracker === b.tracker &&
    a.keyHint === b.keyHint,
)

function PadCap(props: PadProps): JSX.Element {
  const { pad, light, name, big, scroll, ui, tracker } = props
  // Playing on the phone: a signal-orange ring inside the pad (only this pad re-renders when it changes).
  const playing = useHas(ui.playing, padKey(pad))
  const press = ui.press(pad)
  const edit = useRef<EditPress>(newEditPress())
  const holds = useRef(new Set<number>())
  const btn = useRef<HTMLButtonElement>(null)
  const editMode = ui.editing && ui.edit !== null
  // EDIT on or off, or the pad gone (another view), with a finger still down: the
  // other handlers won't see its lift, so the press ends here. A long press
  // still waiting plays nothing, a held sound is let go, and so is a pad played
  // outside EDIT.
  useEffect(() => () => {
    stopEditPress(edit.current)
    for (const id of holds.current) tracker.cancel(id)
    holds.current.clear()
    if (btn.current) capUp(btn.current)
  }, [editMode, tracker])
  // The glow at this render (the screen's frame loop keeps it moving while it fades).
  const g = light ? glow(light, ui.fixedNow ?? perfNow()) : 0
  const wide = pad.label.length > 1
  const key = padKey(pad)
  // ERASE on: a dot on the pads with notes, the others dimmed (Kotlin eraseDot).
  const mark = useEraseMark(key)
  const label = `${pad.groupLetter} ${pad.label}` + (name !== null ? `, ${name}` : '') + (mark === true ? MirrorText.PAD_HAS_NOTES : '')
  const dropping = ui.drop !== null && ui.drop.at === key
  const cls =
    `live-pad cap-3d${big ? ' live-pad--big' : ''}${playing ? ' is-playing' : ''}` +
    (ui.editing ? ' is-editing' : '') +
    (dropping ? ' is-drop' : '') +
    (mark === true ? ' is-erase-dot' : mark === false ? ' is-erase-dim' : '')
  // Over a pad, a dragged sound shows what it would replace: "snare 2 → vox chop".
  const shown = dropping && ui.drop?.name != null ? MirrorText.dropPreview(name ?? ui.drop.nameNow(pad), ui.drop.name) : name
  const content = (
    <>
      {/* The key's own label in the corner (web: top left, where the K.O. II prints it). */}
      <span class={`live-pad__label${wide ? ' live-pad__label--wide' : ''}`}>
        {/* The dot key's label is a dot, drawn as the K.O. II prints it. */}
        {pad.label === '.' ? <span class="live-pad__dot" /> : pad.label}
      </span>
      {shown !== null && <span class="live-pad__name">{shown}</span>}
      {ui.editing && !dropping && <span class="live-pad__swap" aria-hidden="true">{'\u21C4'}</span>}
      {dropping && <span class="live-pad__drop" aria-hidden="true">{WebText.DROP}</span>}
    </>
  )
  // The desk: sounds from the Sounds tab and WAV files drop on it.
  const drop = ui.drop
  const accepts = (e: TargetedDragEvent<HTMLElement>): boolean =>
    (e.dataTransfer?.types ?? []).includes(SLOT_MIME) || dragMayHaveAudio(e.dataTransfer)
  const dropHandlers = drop
    ? {
        onDragEnter: (e: TargetedDragEvent<HTMLElement>) => {
          if (!accepts(e)) return
          e.preventDefault()
          drop.onOver(key)
        },
        onDragOver: (e: TargetedDragEvent<HTMLElement>) => {
          if (!accepts(e)) return
          e.preventDefault()
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
          if (drop.at !== key) drop.onOver(key)
        },
        onDragLeave: (e: TargetedDragEvent<HTMLElement>) => {
          const to = e.relatedTarget
          if (to instanceof Node && e.currentTarget.contains(to)) return
          if (drop.at === key) drop.onOver(null)
        },
        onDrop: (e: TargetedDragEvent<HTMLElement>) => {
          if (!accepts(e)) return
          const file = e.dataTransfer?.files?.[0]
          if (!(e.dataTransfer?.types ?? []).includes(SLOT_MIME) && (!file || !isAudioFile(file))) {
            // A backup (.pak) or another file: the page's own drop imports it.
            if (drop.at === key) drop.onOver(null)
            return
          }
          e.preventDefault()
          // Not the page's own drop (a .pak import).
          e.stopPropagation()
          drop.onDrop(pad, e)
        },
      }
    : {}
  const open = ui.edit
  if (press === null && !(ui.editing && open)) {
    return (
      <div class={cls} role="img" aria-label={label} data-pad={key} style={{ '--glow': glowCss(g) }} {...dropHandlers}>
        {content}
      </div>
    )
  }
  const handlers =
    ui.editing && open ? editHandlers(edit.current, press, () => open(pad), ui.haptic) : holdHandlers(tracker, press!, scroll, ui.haptic, holds.current)
  // A right-click with the mouse opens the pad's sheet (a long press on a touch screen still plays).
  const onPointerDown = handlers.onPointerDown
  return (
    // The big grid (and the desk's row) doesn't scroll: it plays on touch-down. The
    // all-groups page scrolls, so there a drag across the pads must not play them.
    <button
      ref={btn}
      type="button"
      class={`${cls} live-pad--press${scroll ? ' live-pad--scroll' : ''}`}
      aria-label={label}
      aria-description={ui.editing ? MirrorText.EDIT_LINE : mark !== null ? MirrorText.ERASE : MirrorText.PLAY}
      aria-keyshortcuts={props.keyHint ? (pad.label === 'ENTER' ? 'Enter' : pad.label) : undefined}
      data-pad={key}
      style={{ '--glow': glowCss(g) }}
      {...handlers}
      {...dropHandlers}
      onPointerDown={(e) => {
        edit.current.pointer = e.pointerType
        onPointerDown?.(e)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        if (open && edit.current.pointer === 'mouse') open(pad)
      }}
    >
      {content}
    </button>
  )
}

/**
 * The last note outside the pads in a small dark display: "KEYS · F5" and its
 * channel while held, over two octaves around it with the held notes lit.
 */
function KeysStrip(props: { st: MirrorState; last: number; names: NoteNames }): JSX.Element {
  const { st, last, names } = props
  const ch = st.keysHeld.get(last)
  return (
    <div class="live-tools__last">
      <p class="live-tools__last-line">
        <span>{MirrorText.lastNote(last, names)}</span>
        {ch !== undefined && <span class="live-tools__last-ch">{MirrorText.channel(ch)}</span>}
      </p>
      <div class="keys-strip" role="img" aria-label={MirrorText.KEYS + ' ' + MirrorText.noteName(last, names)}>
        {keysLayout(last).map((k) => (
          <span
            key={k.note}
            class={`keys-strip__key${k.black ? ' keys-strip__key--black' : ''}${st.keysHeld.has(k.note) ? ' is-on' : ''}`}
            style={{ left: `${k.x * 100}%`, width: `${k.w * 100}%` }}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * The long notes on how Live reads the device, folded under one disclosure.
 * [hint]: no piano in this window (a portrait phone), so a turn of the screen
 * is pointed out; [transport]: the display line is in the top bar, so what
 * clock out is for is told here.
 */
function Notes(props: { st: MirrorState; mirror: MirrorUi | null; tapToPlay: boolean; hint?: boolean; transport?: boolean }): JSX.Element {
  const { st, mirror } = props
  return (
    <>
      {props.transport && mirror?.offline == null && st.playing === null && st.bpm === null && (
        <p class="t-small live-tools__note">{MirrorText.NO_TRANSPORT}</p>
      )}
      <NotesFold st={st} mirror={mirror} tapToPlay={props.tapToPlay} hint={props.hint ?? false} />
    </>
  )
}

/** The notes themselves, under "How Live reads the EP-133". */
function NotesFold(props: { st: MirrorState; mirror: MirrorUi | null; tapToPlay: boolean; hint: boolean }): JSX.Element {
  const { st, mirror } = props
  return (
    <Disclosure title={MirrorText.HOW_LIVE_READS}>
      {props.tapToPlay && <p>{WebText.LIVE_TAP_NOTE}</p>}
      {/* Pads that play here mean keys that do too, and sideways they are a piano. */}
      {props.tapToPlay && props.hint && <p>{WebText.LIVE_PIANO_HINT}</p>}
      {mirror?.offline != null && <p>{MirrorText.offlineNote(mirror.offline)}</p>}
      {st.padOrder === PadOrder.FROM_TOP && (
        <>
          <p>{MirrorText.LEARN_NOTE}</p>
          {showNoPushes(st, mirror) && <p>{MirrorText.NO_PUSHES}</p>}
        </>
      )}
      <p>{MirrorText.COMMUNITY_NOTE}</p>
      <p>{MirrorText.LISTEN_ONLY}</p>
    </Disclosure>
  )
}

/**
 * The row right under the grid, as the PO app's DRUMS / KEYPAD: one word for
 * the mode that a tap switches (PADS ⇄ KEYS), and in KEYS the view switch
 * (where offered), the scale and the octave, a tap on either of which lists
 * the choices. Over the piano it is Android's SidewaysRow ([SidewaysRow]).
 */
function ModeRow(props: {
  keys: KeysShown
  actions: KeysActions
  /** Kept by the caller when given (undefined: each word keeps its own). */
  picker?: KeysPicker | null
  onPicker?: (picker: KeysPicker | null) => void
  /** Whether the piano shows (and the switch is offered) in this window. */
  plan: PianoPlan
  /**
   * The KEYS grid on a phone on its side: only the mode word (turned) and the
   * view switch ('lead', a column left of the keys), or only the scale and the
   * octave, turned too ('picks', a column on their right; the scale's list
   * opens down, the octave's up).
   */
  part?: 'lead' | 'picks'
}): JSX.Element {
  const { keys, actions, picker, onPicker, plan, part } = props
  const pick = (which: KeysPicker): { open?: boolean; onOpen?: (open: boolean) => void } =>
    onPicker
      ? {
          open: picker === which,
          onOpen: (open) => {
            if (open) onPicker(which)
            else if (picker === which) onPicker(null)
          },
        }
      : {}
  const piano = keys.on && plan.range !== null
  const modeWord = (
    <WordButton
      label={keys.on ? MirrorText.MODE_KEYS : MirrorText.MODE_PADS}
      onClick={() => actions.onMode?.(!keys.on)}
      mark
      description={MirrorText.modeSwitch(keys.on)}
      top={!piano}
      data-coach="live.mode"
      data-coach-label={CoachText.MODE}
      data-coach-face="var(--navy)"
      data-coach-ink="var(--on-navy)"
    />
  )
  const viewSwitch = keys.on && plan.switchShown && (
    <KeysViewSwitch piano={piano} room={plan.room} onView={(p) => actions.onView?.(plan.wide, chosenView(p))} vertical={part === 'lead'} />
  )
  if (part === 'lead') {
    return (
      <div class="live-mode live-mode--lead">
        <span class="live-mode__turned">{modeWord}</span>
        {viewSwitch}
      </div>
    )
  }
  if (part === 'picks') {
    return (
      <div class="live-mode live-mode--picks">
        <PickWord
          label={MirrorText.scaleName(keys.scale)}
          options={SCALES}
          selected={keys.scale}
          name={MirrorText.scaleName}
          onPick={(s) => actions.onScale?.(s)}
          description={MirrorText.scaleChoice(keys.scale)}
          coach={{ id: 'live.scale', label: CoachText.SCALE }}
          {...pick('scale')}
          alignEnd
          down
          middle
        />
        <PickWord
          label={MirrorText.octave(keys.octave)}
          options={octaves()}
          selected={keys.octave}
          name={MirrorText.octave}
          onPick={(o) => actions.onOctave?.(o)}
          description={MirrorText.octaveChoice(keys.octave)}
          coach={{ id: 'live.octave', label: CoachText.OCTAVE }}
          {...pick('octave')}
          alignEnd
          middle
        />
      </div>
    )
  }
  if (piano) return <SidewaysRow keys={keys} actions={actions} pick={pick} mode={modeWord} view={viewSwitch} />
  return (
    // Spread across the row: mode at the start, octave at the end, scale between; pulled
    // up close under the grid (the words keep their full touch height).
    <div class="live-mode">
      {viewSwitch ? (
        <span class="live-mode__lead">
          {modeWord}
          {viewSwitch}
        </span>
      ) : (
        modeWord
      )}
      {keys.on && (
        <>
          <PickWord
            label={MirrorText.scaleName(keys.scale)}
            options={SCALES}
            selected={keys.scale}
            name={MirrorText.scaleName}
            onPick={(s) => actions.onScale?.(s)}
            description={MirrorText.scaleChoice(keys.scale)}
            coach={{ id: 'live.scale', label: CoachText.SCALE }}
            {...pick('scale')}
          />
          <PickWord
            label={MirrorText.octave(keys.octave)}
            options={octaves()}
            selected={keys.octave}
            name={MirrorText.octave}
            onPick={(o) => actions.onOctave?.(o)}
            description={MirrorText.octaveChoice(keys.octave)}
            coach={{ id: 'live.octave', label: CoachText.OCTAVE }}
            {...pick('octave')}
            alignEnd
          />
        </>
      )}
    </div>
  )
}

/** Below this window height a landscape window lays one group out sideways (a phone on its side). */
const SIDEWAYS_MAX_HEIGHT = 560

/** The row's widths at which the key word drops its KEY, and the scale shortens to its code (Android measures them). */
const KEY_WORD_ROOM = 560
const SCALE_NAME_ROOM = 470

/**
 * The row over the piano (Android's SidewaysRow): the mode, the view
 * switch, the scale and the key at the start, the octave between − and +
 * at the end; every list opens downward over the keys. Short of room, the
 * key word drops its KEY, then the scale shortens to its code.
 */
function SidewaysRow(props: {
  keys: KeysShown
  actions: KeysActions
  pick: (which: KeysPicker) => { open?: boolean; onOpen?: (open: boolean) => void }
  mode: JSX.Element
  view: JSX.Element | false
}): JSX.Element {
  const { keys, actions, pick } = props
  const row = useRef<HTMLDivElement | null>(null)
  const width = useBoxSize(row, true).width
  const tight = width > 0 && width < KEY_WORD_ROOM
  const key = tight ? Keys.name(keys.root, keys.names) : MirrorText.keyWord(keys.root, keys.names)
  const scale = width > 0 && width < SCALE_NAME_ROOM ? MirrorText.scaleCode(keys.scale) : MirrorText.scaleName(keys.scale)
  return (
    <div ref={row} class="live-mode live-mode--sideways">
      {props.mode}
      {props.view}
      <PickWord
        label={scale}
        options={SCALES}
        selected={keys.scale}
        name={MirrorText.scaleName}
        onPick={(s) => actions.onScale?.(s)}
        description={MirrorText.scaleChoice(keys.scale)}
        coach={{ id: 'live.scale', label: CoachText.SCALE }}
        {...pick('scale')}
        down
        middle
      />
      {/* The key, which upright is in the tools: twelve names in two rows of six, as there. */}
      <PickWord
        label={key}
        options={KEY_ROOTS}
        selected={keys.root}
        name={(r) => Keys.name(r, keys.names)}
        onPick={(r) => actions.onRoot?.(r)}
        description={MirrorText.keyChoice(keys.root, keys.names)}
        coach={{ id: 'live.key', label: CoachText.KEY }}
        {...pick('key')}
        columns={6}
        // Six columns wide: lined up with the word's end, so it stays on a narrow screen.
        alignEnd
        down
        middle
      />
      <span class="live-mode__gap" />
      <StepWord glyph={'\u2212'} description={MirrorText.OCTAVE_DOWN} enabled={keys.octave > MIN_OCTAVE} onClick={() => actions.onOctave?.(keys.octave - 1)} />
      <PickWord
        label={MirrorText.octave(keys.octave)}
        options={octaves()}
        selected={keys.octave}
        name={MirrorText.octave}
        onPick={(o) => actions.onOctave?.(o)}
        description={MirrorText.octaveChoice(keys.octave)}
        coach={{ id: 'live.octave', label: CoachText.OCTAVE }}
        {...pick('octave')}
        alignEnd
        down
        middle
      />
      <StepWord glyph="+" description={MirrorText.OCTAVE_UP} enabled={keys.octave < MAX_OCTAVE} onClick={() => actions.onOctave?.(keys.octave + 1)} />
    </div>
  )
}

const KEY_ROOTS: readonly number[] = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])

/** − or + by the octave word: one octave down or up, greyed (and disabled) at either end. The guide overlay's tags keep off it. */
function StepWord(props: { glyph: string; description: string; enabled: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      class="live-step"
      data-coach-clear=""
      aria-label={props.description}
      disabled={!props.enabled}
      onClick={props.onClick}
    >
      <span aria-hidden="true">{props.glyph}</span>
    </button>
  )
}

/**
 * KEYS on the pads or the piano: no caps, the two words printed as on the
 * K.O. II's body, each after its LED, the LED of the view shown lit. A tap
 * on a word shows that view. A radio group (each word a radio, the arrows
 * move between them). The piano's word is greyed out where it has no room.
 * [vertical]: one word over the other, each turned as the mode word is (a
 * column beside the keys on a phone on its side), else side by side.
 */
function KeysViewSwitch(props: { piano: boolean; room: boolean; onView: (piano: boolean) => void; vertical?: boolean }): JSX.Element {
  const { piano, room, vertical = false } = props
  const group = useRef<HTMLDivElement | null>(null)
  const choose = (p: boolean): void => {
    if (p && !room) return
    if (p !== piano) props.onView(p)
  }
  return (
    <div
      ref={group}
      class={`live-view${vertical ? ' live-view--vertical' : ''}`}
      role="radiogroup"
      aria-label={MirrorText.KEYS_VIEW}
      aria-orientation={vertical ? 'vertical' : undefined}
      data-coach="live.view"
      onKeyDown={(e) => {
        if (!room) return
        handleRovingKey(e, piano ? 1 : 0, 2, group.current, (i) => choose(i === 1))
      }}
    >
      {[false, true].map((p) => {
        const on = p === piano
        const off = p && !room
        return (
          <button
            key={String(p)}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={MirrorText.keysView(p)}
            aria-description={off ? MirrorText.PIANO_NO_ROOM : undefined}
            title={off ? MirrorText.PIANO_NO_ROOM : undefined}
            disabled={off}
            tabIndex={on ? 0 : -1}
            data-roving=""
            class={`live-view__word${on ? ' is-on' : ''}`}
            onClick={() => choose(p)}
          >
            <span class="live-view__led" aria-hidden="true" />
            {p ? MirrorText.VIEW_PIANO : MirrorText.VIEW_PADS}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The KEYS display line: KEYS and the last note on the left, the sound it
 * plays on the right. A device note past the piano's ends ([pianoRange]) is
 * named as such: there's no key to light for it. [compact]: one bar tall, in
 * the top bar ([LivePill]), where the word KEYS (right under it) is left to
 * screen readers.
 */
function KeysDisplay(props: {
  st: MirrorState
  mirror: MirrorUi | null
  keys: KeysShown
  playing: LivePlaying
  pianoRange: NoteRange | null
  compact?: boolean
}): JSX.Element {
  const { st, mirror, keys, playing, compact = false } = props
  // The note last pressed here: this line re-renders with what plays, not the screen.
  const shown = { ...keys, playingNotes: playing.notes.value }
  const note = keysNoteText(shown, st.lastNote, props.pianoRange)
  return (
    <div class={`live-strip${compact ? ' live-strip--bar' : ''}`} aria-live="polite">
      <PatternLine compact={compact}>
        <span class={`live-strip__sub live-strip__dim${compact ? ' sr-only' : ''}`}>{MirrorText.MODE_KEYS.toUpperCase()}</span>
        {note !== null && <span class="live-strip__sub live-strip__ink live-strip__note">{note}</span>}
        {mirror?.offline != null && <span class="sr-only">{MirrorText.OFFLINE}</span>}
        <span class="live-strip__line">
          {keys.pad !== null ? MirrorText.keysSound(keys.pad, keys.padName) : MirrorText.NO_SOUND}
        </span>
      </PatternLine>
    </div>
  )
}

/**
 * Live's display line in the top bar's middle, on a phone on its side
 * (Kotlin LivePill): the KEYS line, EDIT's line or the pads' one-line
 * display, one bar tall. [pianoRange] is the piano's notes, to name a device
 * note it doesn't reach.
 */
export function LivePill(props: {
  mirror: MirrorUi | null
  keys: KeysShown
  playing: LivePlaying
  editing: boolean
  pianoRange: NoteRange | null
}): JSX.Element {
  const { mirror, keys } = props
  const st = mirror?.state ?? emptyMirrorState()
  if (keys.on) return <KeysDisplay st={st} mirror={mirror} keys={keys} playing={props.playing} pianoRange={props.pianoRange} compact />
  if (props.editing) return <EditStrip compact />
  return <DisplayStrip st={st} mirror={mirror} compact />
}

/**
 * The 12 pads as keys, in the keypad's layout and drawn as the big grid's pads
 * are (the K.O. II's body): each shows its name (or a ring) where a pad prints
 * its digit, pale for the first octave and orange for the next, its octave
 * under it. Notes
 * from the device light their key; the notes playing on the phone are ringed
 * in signal orange. Each key plays the note it showed when pressed, even if
 * the key, scale or octave change while it is held (NoteTouches, with the key
 * as its finger), and lets go of that note.
 */
function KeysGrid(props: {
  st: MirrorState
  keys: KeysShown
  keyNotes: readonly number[]
  now: number
  actions: KeysActions
  tracker: PressTracker
  /** The notes sounding on the phone, as MIDI notes. */
  playing: ReadonlySignal<ReadonlySet<number>>
  haptic: boolean
  /** Filled with the computer keyboard's way in (web): its keys are fingers of their own. */
  keysRef?: { current: GridKeys | null }
}): JSX.Element {
  const { st, keys, keyNotes, now, tracker } = props
  // How lit each key is: the brightest device note that falls on it.
  const lit = keysLit(st.notes, keyNotes, now)
  // Each key is a finger of its own: it lets go of the note it pressed, whatever the grid shows by then.
  const touches = useMemo(() => new NoteTouches(), [])
  const act = useRef(props.actions)
  act.current = props.actions
  const press = useMemo(
    () => ({
      down: (k: number, note: number, hold: boolean, at?: number): void => {
        // A screen reader's Play sounds the whole note, outside the fingers' count.
        if (!hold) {
          act.current.onNote?.(note, false)
          return
        }
        play(touches.down(k, note), at)
      },
      up: (k: number): void => play(touches.up(k)),
    }),
    [touches],
  )
  function play(events: readonly NoteEvent[], at?: number): void {
    for (const e of events) {
      if (e.type === 'Press') act.current.onNote?.(e.note, true, at)
      else act.current.onNoteUp?.(e.note)
    }
  }
  // The grid leaves the screen (PADS, the piano) under a finger: its notes go too.
  useEffect(() => () => play(touches.releaseAll()), [touches])
  // The computer keyboard's keys, as fingers below the pointers' ids; a held key keeps its note.
  const notesNow = useRef(keyNotes)
  notesNow.current = keyNotes
  const keysRef = props.keysRef
  // Handed over before the grid is painted: a key pressed as soon as the grid shows (V, then a
  // pad key) finds it ready; after paint, a slow machine dropped that first key.
  useLayoutEffect(() => {
    if (!keysRef) return
    keysRef.current = {
      down: (k, finger, at) => {
        const note = notesNow.current[k]
        if (note !== undefined) press.down(finger, note, true, at)
      },
      up: (finger) => press.up(finger),
    }
    return () => {
      keysRef.current = null
    }
  }, [keysRef, press])
  return (
    <div
      class="live-kgrid"
      data-coach="live.keys"
      data-coach-label={CoachText.PADS}
      data-coach-face={COACH_YELLOW}
      data-coach-ink={COACH_YELLOW_INK}
    >
      {/* On the K.O. II's body as the big grid's pads are (live-deck--ko), the words printed over each row. */}
      <div class="live-deck live-deck--ko live-kgrid__plate" role="group" aria-label={MirrorText.MODE_KEYS}>
        {ROWS.map((offsets, r) => (
          <Fragment key={r}>
            <div class="live-deck__print" aria-hidden="true">
              {LED_ROWS[r]!.map((word) => (
                <span key={word} class="live-deck__word">
                  <span class="ko-led" />
                  {word}
                </span>
              ))}
            </div>
            <div class="live-deck__row">
              {offsets.map((k) => (
                <KeyCap
                  key={k}
                  index={k}
                  note={keyNotes[k]!}
                  keys={keys}
                  lit={lit.get(k) ?? 0}
                  press={press}
                  tracker={tracker}
                  playing={props.playing}
                  haptic={props.haptic}
                />
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

/** The KEYS grid's keys for the computer keyboard (web): key [k] down as [finger], and that finger up. */
interface GridKeys {
  down(k: number, finger: number, at: number): void
  up(finger: number): void
}

/** The computer keyboard's fingers on the grid count down from here, clear of the pointers' ids. */
const KEYBOARD_FINGER = -100

/** A grid key's press and release, through the grid's NoteTouches (kept the same across renders). */
interface KeyPress {
  down: (index: number, note: number, hold: boolean, at?: number) => void
  up: (index: number) => void
}

interface KeyCapProps {
  index: number
  note: number
  keys: KeysShown
  lit: number
  /** Kept the same across renders by the grid (it reads the latest callbacks). */
  press: KeyPress
  tracker: PressTracker
  playing: ReadonlySignal<ReadonlySet<number>>
  haptic: boolean
}

/** A key renders again only when what it shows or does changed (not with every mirror state). */
const KeyCap = memo(
  KeyCapView,
  (a: KeyCapProps, b: KeyCapProps) =>
    a.index === b.index &&
    a.note === b.note &&
    a.lit === b.lit &&
    a.keys.octave === b.keys.octave &&
    a.keys.names === b.keys.names &&
    a.keys.showNames === b.keys.showNames &&
    a.press === b.press &&
    a.tracker === b.tracker &&
    a.playing === b.playing &&
    a.haptic === b.haptic,
)

/** One KEYS key: its note in a ring, ringed in signal orange while its note sounds here (read by the key itself). */
function KeyCapView(props: KeyCapProps): JSX.Element {
  const { index: k, note, keys, press } = props
  const playing = useHas(props.playing, note)
  const target: PressTarget = {
    press: (hold, _unsure, at) => press.down(k, note, hold, at),
    release: () => press.up(k),
  }
  const cls = 'live-key cap-3d' + (upperOctave(note, keys.octave) ? ' live-key--upper' : '') + (playing ? ' is-playing' : '')
  return (
    <button
      type="button"
      class={cls}
      aria-label={MirrorText.noteName(note, keys.names)}
      aria-description={MirrorText.PLAY}
      data-key={k}
      style={{ '--glow': glowCss(props.lit) }}
      {...holdHandlers(props.tracker, target, false, props.haptic)}
    >
      {/* Named, the name alone, in the ring's colour; unnamed, a ring the digit's height. Both where
          a pad prints its digit, the octave where a pad shows its sample. */}
      {keys.showNames ? (
        <span class="live-key__name">{Keys.name(note, keys.names)}</span>
      ) : (
        <svg class="live-key__ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <circle cx="50" cy="50" r="45.5" fill="none" stroke-width="9" />
        </svg>
      )}
      <span class="live-key__octave">{Keys.octaveOf(note)}</span>
    </button>
  )
}

/**
 * The KEYS tools: the key on a one-octave piano, the colours as chips, and
 * how Keys works (its note and the long legend) under a disclosure.
 * [piano]: the piano is showing, and its two chips with it. [hint]: no piano
 * in this window (a portrait phone): a turn of the screen gives one.
 */
function KeysPanel(props: { keys: KeysShown; actions: KeysActions; piano?: boolean; hint?: boolean; keyboard?: boolean }): JSX.Element {
  const { keys, actions, piano = false } = props
  const keyId = useId()
  return (
    <>
      <div class="row-card live-tools__card">
        <p class="live-tools__title">
          <span id={`${keyId}-k`}>{MirrorText.KEY}</span>
          <span class="live-tools__hint" id={`${keyId}-h`}>{MirrorText.KEY_HINT}</span>
        </p>
        <MiniPiano
          selected={keys.root}
          onSelect={(r) => actions.onRoot?.(r)}
          names={keys.names}
          labelledBy={`${keyId}-k`}
          describedBy={`${keyId}-h`}
        />
      </div>
      <div class="row-card live-tools__card">
        <p class="live-tools__title" id={`${keyId}-c`}>{MirrorText.LEGEND}</p>
        <KeysChips piano={piano} labelledBy={`${keyId}-c`} />
      </div>
      {props.hint && <p class="t-small live-tools__note">{WebText.LIVE_PIANO_HINT}</p>}
      {props.keyboard && <p class="t-small live-tools__note">{WebText.LIVE_KEYS_KEYS_HINT}</p>}
      <Disclosure title={MirrorText.HOW_KEYS_WORKS}>
        <p>{MirrorText.KEYS_NOTE}</p>
        <KeysLegend names={keys.showNames ? keys.names : null} />
      </Disclosure>
    </>
  )
}

/** The colours as compact chips: a swatch and a word or two each. */
function KeysChips(props: { piano: boolean; labelledBy: string }): JSX.Element {
  const chips: [string, string][] = [
    ['device', MirrorText.CHIP_DEVICE],
    ['here', WebText.CHIP_HERE],
  ]
  if (props.piano) chips.push(['root', MirrorText.CHIP_ROOT], ['out', MirrorText.CHIP_OUT])
  return (
    <ul class="live-chips" aria-labelledby={props.labelledBy}>
      {chips.map(([kind, text]) => (
        <li key={kind} class="live-chips__chip">
          <span class={`live-chips__swatch live-chips__swatch--${kind}`} aria-hidden="true" />
          {text}
        </li>
      ))}
    </ul>
  )
}

/**
 * What the keys' colours mean, each with a small key drawn as the grid draws it.
 * With [names] (the keys show them), the small keys carry a name in place of a ring.
 */
function KeysLegend(props: { names: NoteNames | null }): JSX.Element {
  const name = props.names === null ? undefined : Keys.name(0, props.names)
  const first = props.names === null ? 'var(--hw-ring)' : 'var(--hw-dark-ink)'
  return (
    <>
      <ul class="live-legend">
        <LegendRow text={props.names === null ? MirrorText.LEGEND_OCTAVE : MirrorText.LEGEND_OCTAVE_NAMED}>
          <LegendKey ring={first} name={name} />
          <LegendKey ring="var(--signal)" name={name} />
        </LegendRow>
        <LegendRow text={MirrorText.LEGEND_DEVICE}>
          <LegendKey ring="var(--on-signal)" fill="var(--signal)" name={name} />
        </LegendRow>
        <LegendRow text={WebText.LIVE_LEGEND_HERE}>
          <LegendKey ring={first} outline name={name} />
        </LegendRow>
      </ul>
    </>
  )
}

function LegendRow(props: { text: string; children: ComponentChildren }): JSX.Element {
  return (
    <li class="live-legend__row">
      {/* The swatches share one width, so the words line up. */}
      <span class="live-legend__keys" aria-hidden="true">{props.children}</span>
      <span class="t-small live-legend__text">{props.text}</span>
    </li>
  )
}

/**
 * A key in miniature: its dark cap (lit orange when [fill]), its ring (or, with
 * a [name], that name in the ring's colour), and the phone's outline.
 */
function LegendKey(props: { ring: string; fill?: string; outline?: boolean; name?: string | undefined }): JSX.Element {
  return (
    <span
      class={`live-legend__key${props.outline ? ' live-legend__key--outline' : ''}`}
      style={{ background: props.fill ?? 'var(--hw-dark-face)' }}
    >
      {props.name !== undefined ? (
        <span class="live-legend__name" style={{ color: props.ring }}>
          {props.name}
        </span>
      ) : (
        <svg viewBox="0 0 100 100" focusable="false">
          <circle cx="50" cy="50" r="43" fill="none" stroke={props.ring} stroke-width="14" />
        </svg>
      )}
    </span>
  )
}
