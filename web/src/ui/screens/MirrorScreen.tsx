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
//   Compose's lerp). Renders set it (at most ~30 a second: the controller
//   publishes a mirror state every 33 ms at most, and only when it changed),
//   and while a released pad or note is fading a requestAnimationFrame loop
//   updates it in the DOM without rendering (Kotlin's withFrameNanos loop),
//   stopping once the fade is over.
// - The tools side panel is a navigation layer (overlay 'side'), so Back closes
//   it: [toolsOpen] / [onTools] replace Kotlin's rememberSaveable toolsOpen
//   (and initialToolsOpen). The Live tab has no BackHandler of its own; a Back
//   key, when given, is the CloseKey only.
// - The four-or-two groups per row is a container query (BoxWithConstraints).
// - holdToPlay is live/press.ts fed by pointer events (a finger per pad or
//   key; on the scrolling all-groups page the press waits PRESS_DELAY_MS and
//   a scroll plays nothing). A screen reader's / keyboard's Play is a click
//   with detail 0: it plays the whole sound (hold = false).
// - The offline note's fold is a button with aria-expanded (Kotlin's
//   stateDescription NOTE_SHOWN / NOTE_HIDDEN).
// - The scale and octave lists (Kotlin's focusable Popups, which Back
//   dismisses) are navigation layers too: [picker] / [onPicker] (dialog
//   'pick:scale' / 'pick:octave'); without them each word keeps its own state.
// - The tools (the Step 1c redesign) are SettingRow cards: the View as small
//   caps with a Follow row and its LED toggle, the last note in a small dark
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
// grid. On a desktop (or with a fine pointer) the computer keyboard plays it.
// Piano keys carry [data-note] (their MIDI note) for the glow, by exact pitch.
//
// EDIT (giving a pad another sound, Kotlin's EditEdgeTab and pad sheet): with
// it on, the display line says so, the pads get a signal outline and a ⇄
// badge, and a tap opens the pad sheet ([EditUi.onPad]); a long press still
// plays the pad while held.
import { type ButtonHTMLAttributes, type ComponentChildren, type JSX, type TargetedDragEvent } from 'preact'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Keys, MAX_OCTAVE, MIN_OCTAVE, SCALES, type NoteNames, type Scale } from '../../core/features/keys'
import type { MirrorState, PadLight } from '../../core/features/liveMirror'
import { KeysView, type NoteRange } from '../../core/features/piano'
import type { SoundEntry } from '../../core/protocol/device'
import { PadOrder } from '../../core/features/padPush'
import { ROWS, noteName, padKey, physicalPad, type PhysicalPad } from '../../core/features/padNotes'
import { CoachText } from '../../core/text/coachText'
import { CLOSE as GUIDE_CLOSE } from '../../core/text/guideText'
import { MirrorText } from '../../core/text/mirrorText'
import { FeatureText } from '../../core/text/featureText'
import { WebText } from '../../core/text/webText'
import { emptyMirrorState, type MirrorUi } from '../../state/types'
import { Caption } from '../components/Caption'
import { COACH_YELLOW, COACH_YELLOW_INK } from '../components/Coach'
import { DisplayPanel } from '../components/DisplayPanel'
import { CloseKey } from '../components/GuideKeys'
import { HwToggle } from '../components/HwToggle'
import { EditEdgeTab } from '../components/EditEdgeTab'
import { MiniPiano } from '../components/MiniPiano'
import { Segmented, handleRovingKey } from '../components/Segmented'
import { Disclosure, RowCard, SettingRow } from '../components/SettingRow'
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
import { rowPadSize } from '../live/desk'
import { chosenView, pianoFor, type PianoPlan } from '../live/keyboard'
import { DEFAULT_KEYS, keysLit, keysNoteText, octaves, upperOctave, type KeysPicker, type KeysUi } from '../live/keys'
import { PianoKeyboard } from '../live/PianoKeyboard'
import { PressTracker, type PressTarget } from '../live/press'
import { SLOT_MIME, SoundPicker } from '../live/SoundPicker'
import { dragMayHaveAudio, isAudioFile } from '../../platform/files/pick'
import { PickWord, WordButton } from '../live/Words'
import { useDesk, useFinePointer, useWindowSize } from '../useDesk'
import './MirrorScreen.css'

export type { KeysPicker, KeysUi } from '../live/keys'

/** What the KEYS controls do (Kotlin KeysActions). */
export interface KeysActions {
  onMode?: (on: boolean) => void
  onRoot?: (root: number) => void
  onScale?: (scale: Scale) => void
  onOctave?: (octave: number) => void
  /** A key pressed; it sounds until [onKeyUp]. A screen reader's Play passes hold = false. */
  onKey?: (index: number, hold: boolean) => void
  onKeyUp?: (index: number) => void
  /** A piano note pressed (MIDI); it sounds until [onNoteUp]. A screen reader's Play passes hold = false. */
  onNote?: (note: number, hold: boolean) => void
  onNoteUp?: (note: number) => void
  /** The Pads ⇄ Piano switch, for a wide window ([wide]) or a tall one. */
  onView?: (wide: boolean, view: KeysView) => void
  /** A pad played on the device in the pads view becomes the KEYS sound. */
  onSelect?: (pad: PhysicalPad) => void
}

/** Live's EDIT: giving a pad another sound (an addition; the controller's assignPad). */
export interface EditUi {
  readonly on: boolean
  /** The EP-133 is connected (the pads can be written; else the Sounds tab says to connect). */
  readonly connected: boolean
  onChange: (on: boolean) => void
  /** Opens [pad]'s pad sheet (a tap in EDIT, a right-click on the desk). */
  onPad: (pad: PhysicalPad) => void
  /** The desk: a device sound dragged from the Sounds tab onto [pad]. */
  onDropSlot: (pad: PhysicalPad, slot: number) => void
  /** The desk: a WAV dropped on [pad] (uploaded to a free slot, then put on it). */
  onDropFile: (pad: PhysicalPad, file: File) => void
  /** The Sounds tab: the device's sounds, their preview and the drop zone's files (a plain upload). */
  readonly sounds: readonly SoundEntry[]
  readonly playing: string | null
  onPlay: (slot: number) => void
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
  /**
   * Pressing a pad plays its sample on the phone until [onPadUp] (hold is
   * false for a screen reader's Play, which plays to the end); null leaves
   * the pads still. Called from pointerdown (it wakes the audio output).
   */
  onPad?: ((pad: PhysicalPad, hold: boolean) => void) | null
  onPadUp?: (pad: PhysicalPad) => void
  /** The pads whose samples are playing on the phone (several at once for a chord), as padKey(), ringed. */
  playingPads?: ReadonlySet<number>
  /** KEYS: the pads become notes of one sound, like the EP-133's KEYS mode. */
  keys?: KeysUi
  keysActions?: KeysActions
  /** The KEYS list open over the grid (a navigation layer, so Back closes it); see [KeysPicker]. */
  picker?: KeysPicker | null
  onPicker?: (picker: KeysPicker | null) => void
  /** KEYS on the pads or the piano, remembered for a wide window and a tall one (AUTO by default). */
  keysViewWide?: KeysView
  keysViewTall?: KeysView
  /** Live's EDIT; null (screenshots, tests): no editing. */
  edit?: EditUi | null
}


/** The MIDI event clock the mirror's times are on (MIDIMessageEvent.timeStamp). */
const perfNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

const NO_PADS: ReadonlySet<number> = new Set()

/** Writes every pad's, key's and group's glow at [now] straight into the DOM (the frame loop's step). */
function applyGlow(
  root: HTMLElement,
  pads: ReadonlyMap<number, PadLight>,
  notes: ReadonlyMap<number, PadLight>,
  keyNotes: readonly number[] | null,
  now: number,
): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-pad]')) {
    const l = pads.get(Number(el.dataset.pad))
    el.style.setProperty('--glow', glowCss(l ? glow(l, now) : 0))
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-group]')) {
    el.style.setProperty('--glow', glowCss(groupGlow(pads, Number(el.dataset.group), now)))
  }
  if (keyNotes) {
    const lit = keysLit(notes, keyNotes, now)
    for (const el of root.querySelectorAll<HTMLElement>('[data-key]')) {
      el.style.setProperty('--glow', glowCss(lit.get(Number(el.dataset.key)) ?? 0))
    }
    // The piano: each key by its own note.
    for (const el of root.querySelectorAll<HTMLElement>('[data-note]')) {
      const l = notes.get(Number(el.dataset.note))
      el.style.setProperty('--glow', glowCss(l ? glow(l, now) : 0))
    }
  }
}

/**
 * The pointer handlers of a pad or key that sounds while held (Kotlin
 * holdToPlay). [inScroll]: the all-groups page scrolls, so a press waits a
 * moment and a drag plays nothing.
 */
function holdHandlers(
  tracker: PressTracker,
  target: PressTarget,
  inScroll: boolean,
  /** Where the pad keeps the pointers it gave the tracker, to end them when EDIT turns on. */
  ids?: Set<number>,
): ButtonHTMLAttributes<HTMLButtonElement> {
  // Web: the cap stays down while a finger holds it (data-down, theme/cap.css), as
  // :active is not reliable for several fingers or with touch-action: none.
  // An attribute, not a class, so a re-render's class string leaves it alone.
  const lift = (el: HTMLElement): void => el.removeAttribute('data-down')
  return {
    onPointerDown: (e) => {
      // The mouse's other buttons (and a pen's barrel button) don't play.
      if (e.pointerType === 'mouse' && e.button !== 0) return
      e.currentTarget.setAttribute('data-down', '')
      ids?.add(e.pointerId)
      tracker.down(e.pointerId, e.clientX, e.clientY, target, inScroll)
    },
    onPointerMove: (e) => tracker.move(e.pointerId, e.clientX, e.clientY),
    onPointerUp: (e) => {
      lift(e.currentTarget)
      ids?.delete(e.pointerId)
      tracker.up(e.pointerId)
    },
    onPointerCancel: (e) => {
      lift(e.currentTarget)
      ids?.delete(e.pointerId)
      tracker.cancel(e.pointerId)
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
  const playingPads = props.playingPads ?? NO_PADS
  const edit = props.edit ?? null
  const st = mirror?.state ?? emptyMirrorState()
  const root = useRef<HTMLDivElement | null>(null)
  const now = fixedNow ?? perfNow()
  const desk = useDesk()
  const fine = useFinePointer()
  const win = useWindowSize()
  // Live's own box: the piano's room comes off it (live/keyboard.ts).
  const live = useBoxSize(root, true)
  // The desk's room for the page (beside the docked tools): whether all four groups fit in one row.
  const box = useRef<HTMLDivElement | null>(null)
  const room = useBoxSize(box, desk)
  const rowPad = desk && !oneGroup && !keys.on ? rowPadSize(room.width, room.height) : null
  // KEYS on the piano or the grid: the view remembered for this window's shape, and the room.
  const plan = pianoFor(
    win.width,
    win.height,
    live.width,
    live.height,
    desk,
    props.keysViewWide ?? KeysView.AUTO,
    props.keysViewTall ?? KeysView.AUTO,
    keys.pianoWhites,
    keys.octave,
  )
  const pianoRange = keys.on ? plan.range : null
  // In KEYS the tools go behind the strip, so the keys get the page's width.
  const docked = desk && !keys.on
  // EDIT is for the pads (the tab shows in PADS only).
  const editing = edit !== null && edit.on && !keys.on
  // A phone on its side: too short for the upright grid with its group keys under it.
  const sideways = !desk && win.width > win.height && win.height < SIDEWAYS_MAX_HEIGHT

  // Every finger on the pads or keys; all of them end when the screen goes.
  const tracker = useMemo(() => new PressTracker(), [])
  useEffect(() => () => tracker.releaseAll(), [tracker])

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
    if (oneGroup && follow && hitGroup !== null) setGroup(hitGroup)
  }, [hitGroup, st.lastHit, follow, oneGroup])

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
  const drop: DropUi | null =
    edit !== null && desk && !keys.on
      ? {
          at: dropAt,
          name: dragged?.name ?? null,
          nameNow: edit.nameNow,
          onOver: setDropAt,
          onDrop: (pad, e) => {
            setDropAt(null)
            setDragged(null)
            const slot = Number(e.dataTransfer?.getData(SLOT_MIME) ?? '')
            if (Number.isInteger(slot) && slot > 0) {
              edit.onDropSlot(pad, slot)
              return
            }
            const file = e.dataTransfer?.files?.[0]
            if (file) edit.onDropFile(pad, file)
          },
        }
      : null

  const tools = keys.on ? (
    <KeysPanel keys={keys} actions={actions} piano={pianoRange !== null} />
  ) : (
    <>
      <RowCard>
        <SettingRow
          title={MirrorText.VIEW}
          stack
          control={(ids) => (
            <Segmented
              compact
              fill
              options={[MirrorText.ALL_GROUPS, MirrorText.ONE_GROUP]}
              selected={oneGroup ? 1 : 0}
              onSelect={(i) => props.onOneGroup(i === 1)}
              labelledBy={ids.titleId}
            />
          )}
        />
        {oneGroup && (
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
      <Notes st={st} mirror={mirror} tapToPlay={onPad !== null} />
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

  const padPress = (pad: PhysicalPad): PressTarget | null =>
    onPad === null
      ? null
      : {
          press: (hold) => onPad(pad, hold),
          release: () => props.onPadUp?.(pad),
        }
  const padUi: PadUi = { press: padPress, edit: edit !== null ? edit.onPad : null, editing, drop }

  const modeRow = (
    <ModeRow
      keys={keys}
      actions={actions}
      picker={props.onPicker ? picker : undefined}
      onPicker={props.onPicker}
      plan={plan}
    />
  )
  const displayStrip = editing ? <EditStrip /> : <DisplayStrip st={st} mirror={mirror} />
  const allGroups = (
    <div class="live__all">
      <div class="live__head">
        <Caption text={MirrorText.TITLE} as="h1" />
        {onBack && <CloseKey class="live__close" onClick={onBack} description={GUIDE_CLOSE} />}
      </div>
      {editing ? <EditStrip /> : <Display st={st} mirror={mirror} initialNoteOpen={props.initialNoteOpen ?? false} />}
      {modeRow}
      {/* Four groups in a row when there is room, two by two on a phone. */}
      <div class="live__groups">
        <div class="live__grid">
          {[0, 1, 2, 3].map((g) => (
            <Group key={g} group={g} st={st} nameOf={nameOf} now={now} ui={padUi} playingPads={playingPads} tracker={tracker} />
          ))}
        </div>
      </div>
    </div>
  )
  // On the desk, EDIT's tab on the panel's left side (the shell draws it on a phone).
  const editTab = desk && edit !== null && !keys.on ? (
    <EditEdgeTab class="live-edit-tab" on={edit.on} onChange={edit.onChange} />
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
          <KeysDisplay st={st} mirror={mirror} keys={keys} pianoRange={pianoRange} />
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
              playingNotes={keys.playingNotes}
              now={now}
              onNote={(n, hold) => actions.onNote?.(n, hold)}
              onNoteUp={(n) => actions.onNoteUp?.(n)}
              computer={desk || fine}
              onOctave={(o) => actions.onOctave?.(o)}
            />
          </div>
        </div>
        {desk && <PianoLegend />}
      </div>
    )
  } else if (desk) {
    // The desk: the K.O. II (or the row of groups) in the room left of the docked tools.
    let body: JSX.Element
    if (keys.on && keyNotes) {
      body = (
        <div class="live-ko live-ko--keys">
          <KeysDisplay st={st} mirror={mirror} keys={keys} pianoRange={null} />
          {modeRow}
          <div class="live-ko__body">
            <KeysGrid st={st} keys={keys} keyNotes={keyNotes} now={now} actions={actions} tracker={tracker} />
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
            <GroupKeys group={group} st={st} now={now} onSelect={setGroup} vertical />
            <Group group={group} st={st} nameOf={nameOf} now={now} big coach ui={padUi} playingPads={playingPads} tracker={tracker} />
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
              <Group key={g} group={g} st={st} nameOf={nameOf} now={now} fill ui={padUi} playingPads={playingPads} tracker={tracker} />
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
      <div class={`live__one${sideways && !keys.on ? ' live__one--side' : ''}`}>
        {onBack && (
          <div class="live__head">
            <Caption text={MirrorText.TITLE} />
            <CloseKey class="live__close" onClick={onBack} description={GUIDE_CLOSE} />
          </div>
        )}
        {keys.on && keyNotes ? (
          <>
            <KeysDisplay st={st} mirror={mirror} keys={keys} pianoRange={null} />
            <KeysGrid st={st} keys={keys} keyNotes={keyNotes} now={now} actions={actions} tracker={tracker} />
            {modeRow}
          </>
        ) : sideways ? (
          // A phone on its side (Android's sideways grid): the grid as tall as the room, the
          // group keys a column on its right.
          <>
            {displayStrip}
            <div class="live__side">
              <Group group={group} st={st} nameOf={nameOf} now={now} big coach ui={padUi} playingPads={playingPads} tracker={tracker} />
              <GroupKeys group={group} st={st} now={now} onSelect={setGroup} vertical />
            </div>
            {modeRow}
          </>
        ) : (
          <>
            {displayStrip}
            <Group group={group} st={st} nameOf={nameOf} now={now} big coach ui={padUi} playingPads={playingPads} tracker={tracker} />
            {modeRow}
            <GroupKeys group={group} st={st} now={now} onSelect={setGroup} />
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
    </div>
  )
}

/** The display line while EDIT is on: EDIT, and what a tap on a pad does now. */
function EditStrip(): JSX.Element {
  return (
    <div class="live-strip live-strip--edit" aria-live="polite">
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
 * and a drop zone for WAV files (uploaded to free slots).
 */
function SoundsPanel(props: { edit: EditUi; onDrag: (snd: SoundEntry | null) => void }): JSX.Element {
  const { edit } = props
  const [over, setOver] = useState(false)
  const files = (e: TargetedDragEvent<HTMLElement>): boolean => dragMayHaveAudio(e.dataTransfer)
  if (!edit.connected) return <p class="t-small live-sounds__hint">{MirrorText.EDIT_OFFLINE}</p>
  return (
    <div class="live-sounds">
      <SoundPicker
        sounds={edit.sounds}
        playing={edit.playing}
        onPlay={edit.onPlay}
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
 * project on the left, the pad just played on the right.
 */
function DisplayStrip(props: { st: MirrorState; mirror: MirrorUi | null }): JSX.Element {
  const { st, mirror } = props
  return (
    <div class="live-strip" aria-live="polite">
      {st.playing === true && <span class="live-strip__sub live-strip__ink" role="img" aria-label={MirrorText.PLAYING}>{'▶'}</span>}
      {st.playing === false && <span class="live-strip__sub live-strip__dim" role="img" aria-label={MirrorText.STOPPED}>{'■'}</span>}
      {st.playing === null && mirror?.offline != null && (
        <span class="live-strip__sub live-strip__dim">{MirrorText.OFFLINE}</span>
      )}
      {st.bpm !== null && <span class="live-strip__sub live-strip__ink">{MirrorText.bpm(st.bpm)}</span>}
      {st.activeProject !== null && (
        <span class="live-strip__sub live-strip__dim">{MirrorText.projectShort(st.activeProject)}</span>
      )}
      <span class="live-strip__line">{displayLine(st, mirror)}</span>
    </div>
  )
}

function Display(props: { st: MirrorState; mirror: MirrorUi | null; initialNoteOpen: boolean }): JSX.Element {
  const { st, mirror } = props
  const offline = showOffline(st, mirror)
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
      </div>
      <p class={`live-display__line t-stat-free${displayLineSmall(st, mirror) ? ' live-display__line--small' : ''}`}>
        {displayLine(st, mirror)}
      </p>
      {/* Offline, the folded note; else the all-groups view explains clock out. */}
      {offline
        ? noteOpen && (
            <p id="live-offline-note" class="live-display__hint live-display__note t-display-hint">
              {MirrorText.OFFLINE_NOTE}
            </p>
          )
        : st.playing === null &&
          st.bpm === null && <p class="live-display__hint t-display-hint">{MirrorText.NO_TRANSPORT}</p>}
    </DisplayPanel>
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
  ui: PadUi
  playingPads: ReadonlySet<number>
  tracker: PressTracker
}

function Group(props: GroupProps): JSX.Element {
  const { group, st, nameOf, now, big = false, fill = false, ui, playingPads, tracker } = props
  const letter = MirrorText.groupKey(group)
  return (
    <div
      class={`live-group${big ? ' live-group--big' : ''}${fill ? ' live-group--fill' : ''}`}
      data-coach={props.coach ? 'live.pads' : undefined}
    >
      {/* The caption turns orange while one of the group's pads sounds (the big grid's
          group shows on its key below instead). */}
      {!big && (
        <div class="live-group__caption" data-group={group} style={{ '--glow': glowCss(groupGlow(st.pads, group, now)) }}>
          <Caption text={`${MirrorText.GROUP} ${letter}`} as="h2" color="var(--live-caption)" />
        </div>
      )}
      {/* The pads are caps sitting in the device's body (Deck). */}
      <div class="live-deck" role="group" aria-label={`${MirrorText.GROUP} ${letter}`}>
        {ROWS.map((offsets, r) => (
          <div class="live-deck__row" key={r}>
            {offsets.map((o) => {
              const pad = physicalPad(group, o)
              return (
                <Pad
                  key={o}
                  pad={pad}
                  light={st.pads.get(padKey(pad))}
                  name={nameOf(pad)}
                  now={now}
                  big={big}
                  scroll={!big && !fill}
                  ui={ui}
                  playing={playingPads.has(padKey(pad))}
                  tracker={tracker}
                />
              )
            })}
          </div>
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
              tabIndex={on ? 0 : -1}
              data-roving=""
              data-coach={g === 0 ? 'live.groups' : undefined}
              class={`live-keys__key cap-3d${on ? ' is-on is-down' : ''}`}
              onClick={() => onSelect(g)}
            >
              {MirrorText.groupKey(g)}
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
  now: number
  big: boolean
  /** On the scrolling all-groups page: a drag across the pads scrolls rather than plays. */
  scroll: boolean
  ui: PadUi
  /** Playing on the phone: a signal-orange ring inside the pad. */
  playing: boolean
  tracker: PressTracker
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
function editHandlers(st: EditPress, press: PressTarget | null, open: () => void): ButtonHTMLAttributes<HTMLButtonElement> {
  const end = (el: HTMLElement, tap: boolean): void => {
    el.removeAttribute('data-down')
    const tapped = st.timer !== null
    stopEditPress(st)
    if (tapped && tap) open()
  }
  return {
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (st.id !== null) return
      st.id = e.pointerId
      st.target = press
      e.currentTarget.setAttribute('data-down', '')
      st.timer = setTimeout(() => {
        st.timer = null
        st.held = st.target !== null
        st.target?.press(true)
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

function Pad(props: PadProps): JSX.Element {
  const { pad, light, name, big, scroll, ui, playing, tracker } = props
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
    btn.current?.removeAttribute('data-down')
  }, [editMode, tracker])
  const g = light ? glow(light, props.now) : 0
  const wide = pad.label.length > 1
  const label = `${pad.groupLetter} ${pad.label}` + (name !== null ? `, ${name}` : '')
  const key = padKey(pad)
  const dropping = ui.drop !== null && ui.drop.at === key
  const cls =
    `live-pad cap-3d${big ? ' live-pad--big' : ''}${playing ? ' is-playing' : ''}` +
    (ui.editing ? ' is-editing' : '') +
    (dropping ? ' is-drop' : '')
  // Over a pad, a dragged sound shows what it would replace: "snare 2 → vox chop".
  const shown = dropping && ui.drop?.name != null ? MirrorText.dropPreview(name ?? ui.drop.nameNow(pad), ui.drop.name) : name
  const content = (
    <>
      {/* The key's own label in the corner (web: top left, where the K.O. II prints it). */}
      <span class={`live-pad__label${wide ? ' live-pad__label--wide' : ''}`}>{pad.label}</span>
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
  const handlers = ui.editing && open ? editHandlers(edit.current, press, () => open(pad)) : holdHandlers(tracker, press!, scroll, holds.current)
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
      aria-description={ui.editing ? MirrorText.EDIT_LINE : MirrorText.PLAY}
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

/** The long notes on how Live reads the device, folded under one disclosure. */
function Notes(props: { st: MirrorState; mirror: MirrorUi | null; tapToPlay: boolean }): JSX.Element {
  const { st, mirror } = props
  return (
    <Disclosure title={MirrorText.HOW_LIVE_READS}>
      {props.tapToPlay && <p>{WebText.LIVE_TAP_NOTE}</p>}
      {mirror?.offline != null && <p>{MirrorText.OFFLINE_NOTE}</p>}
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
  keys: KeysUi
  actions: KeysActions
  /** Kept by the caller when given (undefined: each word keeps its own). */
  picker?: KeysPicker | null
  onPicker?: (picker: KeysPicker | null) => void
  /** Whether the piano shows (and the switch is offered) in this window. */
  plan: PianoPlan
}): JSX.Element {
  const { keys, actions, picker, onPicker, plan } = props
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
    <KeysViewSwitch piano={piano} room={plan.room} onView={(p) => actions.onView?.(plan.wide, chosenView(p))} />
  )
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
  keys: KeysUi
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

/** − or + by the octave word: one octave down or up, greyed (and disabled) at either end. */
function StepWord(props: { glyph: string; description: string; enabled: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      class="live-step"
      aria-label={props.description}
      disabled={!props.enabled}
      onClick={props.onClick}
    >
      <span aria-hidden="true">{props.glyph}</span>
    </button>
  )
}

/**
 * KEYS on the pads or the piano: two small icon caps after the KEYS word, a
 * radio group (the arrows move between them). The piano's is greyed out
 * where it has no room.
 */
function KeysViewSwitch(props: { piano: boolean; room: boolean; onView: (piano: boolean) => void }): JSX.Element {
  const { piano, room } = props
  const group = useRef<HTMLDivElement | null>(null)
  const choose = (p: boolean): void => {
    if (p && !room) return
    if (p !== piano) props.onView(p)
  }
  return (
    <div
      ref={group}
      class="live-view"
      role="radiogroup"
      aria-label={MirrorText.KEYS_VIEW}
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
            title={off ? MirrorText.PIANO_NO_ROOM : MirrorText.keysView(p)}
            disabled={off}
            tabIndex={on ? 0 : -1}
            data-roving=""
            class={`live-view__key cap-3d${on ? ' is-on is-down' : ''}`}
            onClick={() => choose(p)}
          >
            {p ? <PianoIcon /> : <GridIcon />}
          </button>
        )
      })}
    </div>
  )
}

/** The pads: a 3×3 grid of small squares. */
function GridIcon(): JSX.Element {
  return (
    <svg width="20" height="16" viewBox="0 0 20 16" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        {[1, 6, 11].map((y) => [1, 7.5, 14].map((x) => <rect key={`${x}:${y}`} x={x} y={y} width="5" height="4" rx="1" />))}
      </g>
    </svg>
  )
}

/** The piano: an outlined keyboard with three black keys. */
function PianoIcon(): JSX.Element {
  return (
    <svg width="20" height="16" viewBox="0 0 20 16" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="18" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" />
      <g fill="currentColor">
        <rect x="4.5" y="1" width="2.4" height="8" />
        <rect x="9" y="1" width="2.4" height="8" />
        <rect x="13.5" y="1" width="2.4" height="8" />
      </g>
      <path d="M6 9v6M10.2 9v6M14.7 9v6" stroke="currentColor" stroke-width="1.2" />
    </svg>
  )
}

/**
 * The KEYS display line: KEYS and the last note on the left, the sound it
 * plays on the right. A device note past the piano's ends ([pianoRange]) is
 * named as such: there's no key to light for it.
 */
function KeysDisplay(props: { st: MirrorState; mirror: MirrorUi | null; keys: KeysUi; pianoRange: NoteRange | null }): JSX.Element {
  const { st, mirror, keys } = props
  const note = keysNoteText(keys, st.lastNote, props.pianoRange)
  return (
    <div class="live-strip" aria-live="polite">
      <span class="live-strip__sub live-strip__dim">{MirrorText.MODE_KEYS.toUpperCase()}</span>
      {note !== null && <span class="live-strip__sub live-strip__ink live-strip__note">{note}</span>}
      {mirror?.offline != null && <span class="live-strip__sub live-strip__dim">{MirrorText.OFFLINE}</span>}
      <span class="live-strip__line">
        {keys.pad !== null ? MirrorText.keysSound(keys.pad, keys.padName) : MirrorText.NO_SOUND}
      </span>
    </div>
  )
}

/**
 * The 12 pads as keys, in the keypad's layout: each shows its note in a ring,
 * navy for the first octave and orange for the next. Notes from the device
 * light their key; the key playing on the phone is ringed in signal orange.
 */
function KeysGrid(props: {
  st: MirrorState
  keys: KeysUi
  keyNotes: readonly number[]
  now: number
  actions: KeysActions
  tracker: PressTracker
}): JSX.Element {
  const { st, keys, keyNotes, now, actions, tracker } = props
  // How lit each key is: the brightest device note that falls on it.
  const lit = keysLit(st.notes, keyNotes, now)
  return (
    <div
      class="live-kgrid"
      data-coach="live.keys"
      data-coach-label={CoachText.PADS}
      data-coach-face={COACH_YELLOW}
      data-coach-ink={COACH_YELLOW_INK}
    >
      <div class="live-deck live-kgrid__plate" role="group" aria-label={MirrorText.MODE_KEYS}>
        {ROWS.map((offsets, r) => (
          <div class="live-deck__row" key={r}>
            {offsets.map((k) => {
              const note = keyNotes[k]!
              const target: PressTarget = {
                press: (hold) => actions.onKey?.(k, hold),
                release: () => actions.onKeyUp?.(k),
              }
              const cls =
                'live-key cap-3d' +
                (upperOctave(note, keys.octave) ? ' live-key--upper' : '') +
                (keys.playingKeys.has(k) ? ' is-playing' : '')
              return (
                <button
                  key={k}
                  type="button"
                  class={cls}
                  aria-label={MirrorText.noteName(note, keys.names)}
                  aria-description={MirrorText.PLAY}
                  data-key={k}
                  style={{ '--glow': glowCss(lit.get(k) ?? 0) }}
                  {...holdHandlers(tracker, target, false)}
                >
                  {/* Named, the name alone, in the ring's colour; unnamed, the ring. */}
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
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The KEYS tools: the key on a one-octave piano, the colours as chips, and
 * how Keys works (its note and the long legend) under a disclosure.
 * [piano]: the piano is showing, and its two chips with it.
 */
function KeysPanel(props: { keys: KeysUi; actions: KeysActions; piano?: boolean }): JSX.Element {
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
