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
//   'pick:scale' / 'pick:octave' / 'pick:key'); without them each word keeps its own state.
// - Landscape (Kotlin's ArcWindow): the window's size (live/window.ts) and
//   the screen's own box decide whether KEYS is the piano (live/PianoKeyboard)
//   or stays the grid; in a short landscape window the display line is in the
//   top bar ([inBar], LivePill) instead of on the page.
import { type ButtonHTMLAttributes, type ComponentChildren, type JSX } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Keys, MAX_OCTAVE, MIN_OCTAVE, SCALES, type Scale } from '../../core/features/keys'
import { NoteTouches, type NoteEvent } from '../../core/features/noteTouches'
import { Piano, inRange, type NoteRange } from '../../core/features/piano'
import type { MirrorState, PadLight } from '../../core/features/liveMirror'
import { PadOrder } from '../../core/features/padPush'
import { ROWS, noteName, padKey, physicalPad, type PhysicalPad } from '../../core/features/padNotes'
import { CoachText } from '../../core/text/coachText'
import { CLOSE as GUIDE_CLOSE } from '../../core/text/guideText'
import { MirrorText } from '../../core/text/mirrorText'
import { WebText } from '../../core/text/webText'
import { emptyMirrorState, type MirrorUi } from '../../state/types'
import { Caption } from '../components/Caption'
import { COACH_YELLOW, COACH_YELLOW_INK } from '../components/Coach'
import { DisplayPanel } from '../components/DisplayPanel'
import { GridPlate } from '../components/GridPlate'
import { CloseKey } from '../components/GuideKeys'
import { Key } from '../components/Key'
import { Segmented, handleRovingKey } from '../components/Segmented'
import { SideZone } from '../components/SideZone'
import { SwitchRow } from '../components/SwitchRow'
import { TextToggle } from '../components/TextToggle'
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
import { DEFAULT_KEYS, keysDisplayNote, keysLit, octaves, rootKey, type KeysPicker, type KeysUi } from '../live/keys'
import { MAX_PIANO_HEIGHT, pianoLit, pianoWhites } from '../live/piano'
import { PianoKeyboard } from '../live/PianoKeyboard'
import { landscape, short, useArcWindow } from '../live/window'
import { PressTracker, type PressTarget } from '../live/press'
import { PickWord, WordButton } from '../live/Words'
import './MirrorScreen.css'

export type { KeysPicker, KeysUi } from '../live/keys'

/** What the KEYS controls do (Kotlin KeysActions). */
export interface KeysActions {
  onMode?: (on: boolean) => void
  onRoot?: (root: number) => void
  onScale?: (scale: Scale) => void
  onOctave?: (octave: number) => void
  /** A note pressed (on the grid or the piano); it sounds until [onNoteUp]. A screen reader's Play passes hold = false. */
  onNote?: (note: number, hold: boolean) => void
  onNoteUp?: (note: number) => void
  /** A pad played on the device in the pads view becomes the KEYS sound. */
  onSelect?: (pad: PhysicalPad) => void
}

export interface MirrorScreenProps {
  mirror: MirrorUi | null
  nameOf: (pad: PhysicalPad) => string | null
  onPadOrder: (order: PadOrder) => void
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
  /** The display line is in the top bar (a phone on its side, LivePill), so the page leaves it out. */
  inBar?: boolean
  /** The piano's notes while it shows (KEYS in a landscape window), null otherwise: the line in the bar names a device note it doesn't reach. */
  onPianoRange?: (range: NoteRange | null) => void
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
  piano: NoteRange | null,
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
  }
  if (piano) {
    const lit = pianoLit(notes, piano, now)
    for (const el of root.querySelectorAll<HTMLElement>('[data-note]')) {
      el.style.setProperty('--glow', glowCss(lit.get(Number(el.dataset.note)) ?? 0))
    }
  }
}

/** The screen's own box (the page under the top bar), measured as it changes. */
function useBox(el: { current: HTMLElement | null }): { width: number; height: number } | null {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const node = el.current
    if (!node) return
    const measure = (): void => {
      const r = node.getBoundingClientRect()
      setBox((prev) => (prev && prev.width === r.width && prev.height === r.height ? prev : { width: r.width, height: r.height }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(node)
    return () => ro.disconnect()
  }, [])
  return box
}

// The piano's frame (live__piano): the gutters either side, the controls row over it and
// the gaps, so the plate's size can be told from the screen's box before laying it out.
const PIANO_START = 30
const PIANO_END = 24 + 12
const PIANO_ROW = 44 + 6
const PIANO_TOP = 4
const PIANO_BOTTOM = 10
const LINE = 48 + 10

/**
 * The pointer handlers of a pad or key that sounds while held (Kotlin
 * holdToPlay). [inScroll]: the all-groups page scrolls, so a press waits a
 * moment and a drag plays nothing.
 */
function holdHandlers(
  tracker: PressTracker,
  target: PressTarget,
  inScroll: boolean,
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
      tracker.down(e.pointerId, e.clientX, e.clientY, target, inScroll)
    },
    onPointerMove: (e) => tracker.move(e.pointerId, e.clientX, e.clientY),
    onPointerUp: (e) => {
      lift(e.currentTarget)
      tracker.up(e.pointerId)
    },
    onPointerCancel: (e) => {
      lift(e.currentTarget)
      tracker.cancel(e.pointerId)
    },
    onPointerLeave: (e) => {
      lift(e.currentTarget)
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

export function MirrorScreen(props: MirrorScreenProps): JSX.Element {
  const { mirror, nameOf, onPadOrder, onBack = null, fixedNow = null, oneGroup, follow } = props
  const keys = props.keys ?? DEFAULT_KEYS
  const actions = props.keysActions ?? {}
  const onPad = props.onPad ?? null
  const playingPads = props.playingPads ?? NO_PADS
  const st = mirror?.state ?? emptyMirrorState()
  const root = useRef<HTMLDivElement | null>(null)
  const now = fixedNow ?? perfNow()
  const inBar = props.inBar ?? false

  // KEYS in a window wider than tall is a piano, when one octave of 44px keys fits;
  // else (upright, a narrow split screen) the 4×3 grid stays.
  const win = useArcWindow()
  const box = useBox(root) ?? win
  const tall = !short(win)
  const plateW = box.width - PIANO_START - PIANO_END
  const plateH = Math.min(
    box.height - PIANO_TOP - PIANO_BOTTOM - PIANO_ROW - (inBar ? 0 : LINE),
    tall ? MAX_PIANO_HEIGHT : Number.POSITIVE_INFINITY,
  )
  const whites = keys.on ? pianoWhites(landscape(win), plateW, plateH) : 0
  const piano: NoteRange | null = whites > 0 ? Piano.range(keys.octave, whites) : null
  // The pads of one group on a phone on its side: A–D beside the grid, not under it.
  const side = !keys.on && landscape(win) && !tall
  const pianoKey = piano ? `${piano.first}:${piano.last}` : null
  useEffect(() => {
    props.onPianoRange?.(piano)
  }, [pianoKey])
  useEffect(() => () => props.onPianoRange?.(null), [])

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
    if (fixedNow === null && root.current) applyGlow(root.current, pads, notes, keyNotes, piano, perfNow())
  })
  useEffect(() => {
    if (fixedNow !== null || typeof requestAnimationFrame === 'undefined') return
    const running = (t: number): boolean => fading(pads, t) || (keyNotes !== null && fading(notes, t))
    let raf = 0
    const frame = (): void => {
      const t = perfNow()
      if (root.current) applyGlow(root.current, pads, notes, keyNotes, piano, t)
      raf = running(t) ? requestAnimationFrame(frame) : 0
    }
    if (running(perfNow())) raf = requestAnimationFrame(frame)
    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [pads, notes, keyNotes, pianoKey, fixedNow])

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

  const panel = keys.on ? (
    <KeysPanel keys={keys} actions={actions} piano={piano !== null} hint={!landscape(win)} />
  ) : (
    <>
      <Caption text={MirrorText.VIEW} align="start" />
      <TextToggle
        class="live-tools__view"
        options={[MirrorText.ALL_GROUPS, MirrorText.ONE_GROUP]}
        selected={oneGroup ? 1 : 0}
        onSelect={(i) => props.onOneGroup(i === 1)}
        label={MirrorText.VIEW}
      />
      {oneGroup && (
        <GridPlate>
          <SwitchRow title={MirrorText.FOLLOW} note={MirrorText.FOLLOW_NOTE} on={follow} onChange={props.onFollow} />
        </GridPlate>
      )}
      {st.lastKeysNote !== null && <KeysStrip st={st} last={st.lastKeysNote} />}
      <Notes st={st} mirror={mirror} onPadOrder={onPadOrder} tapToPlay={onPad !== null} hint={!landscape(win)} transport={inBar} />
    </>
  )

  const padPress = (pad: PhysicalPad): PressTarget | null =>
    onPad === null
      ? null
      : {
          press: (hold) => onPad(pad, hold),
          release: () => props.onPadUp?.(pad),
        }

  return (
    <div ref={root} class="live" data-screen="live">
      <SideZone
        class={piano ? 'live--piano' : undefined}
        open={props.toolsOpen}
        onOpen={() => props.onTools(true)}
        onClose={() => props.onTools(false)}
        title={MirrorText.TOOLS}
        panel={panel}
      >
        {piano ? (
          // The piano: the controls row over it (the keys' strike zone borders only the
          // screen's edge), the display line over that unless it is in the top bar.
          <div class={`live__piano${tall ? ' live__piano--tall' : ''}`}>
            {!inBar && <KeysDisplay st={st} mirror={mirror} keys={keys} pianoRange={piano} />}
            <ModeRow
              keys={keys}
              actions={actions}
              picker={props.onPicker ? picker : undefined}
              onPicker={props.onPicker}
              landscape
              narrow={plateW < 700}
              tight={plateW < 560}
            />
            <PianoKeyboard range={piano} st={st} keys={keys} now={now} actions={actions} />
          </div>
        ) : oneGroup || keys.on ? (
          // One group (or the keys) fills the screen without scrolling: the display line, the grid
          // (its rows share whatever height is left) and the group keys. On a phone on its side
          // the pads' row is on top and A–D stand in a column beside the grid.
          <div class={`live__one${side ? ' live__one--side' : ''}`}>
            {onBack && (
              <div class="live__head">
                <Caption text={MirrorText.TITLE} />
                <CloseKey class="live__close" onClick={onBack} description={GUIDE_CLOSE} />
              </div>
            )}
            {keys.on && keyNotes ? (
              <>
                {!inBar && <KeysDisplay st={st} mirror={mirror} keys={keys} />}
                <KeysGrid st={st} keys={keys} keyNotes={keyNotes} now={now} actions={actions} tracker={tracker} />
                <ModeRow keys={keys} actions={actions} picker={props.onPicker ? picker : undefined} onPicker={props.onPicker} />
              </>
            ) : (
              <>
                {!inBar && <DisplayStrip st={st} mirror={mirror} />}
                {side && <ModeRow keys={keys} actions={actions} picker={props.onPicker ? picker : undefined} onPicker={props.onPicker} />}
                <div class="live__pads">
                  <Group
                    group={group}
                    st={st}
                    nameOf={nameOf}
                    now={now}
                    big
                    coach
                    press={padPress}
                    playingPads={playingPads}
                    tracker={tracker}
                  />
                  {side && <GroupKeys group={group} st={st} now={now} onSelect={setGroup} column />}
                </div>
                {!side && <ModeRow keys={keys} actions={actions} picker={props.onPicker ? picker : undefined} onPicker={props.onPicker} />}
                {!side && <GroupKeys group={group} st={st} now={now} onSelect={setGroup} />}
              </>
            )}
          </div>
        ) : (
          <div class="live__all">
            <div class="live__head">
              <Caption text={MirrorText.TITLE} as="h1" />
              {onBack && <CloseKey class="live__close" onClick={onBack} description={GUIDE_CLOSE} />}
            </div>
            {!inBar && <Display st={st} mirror={mirror} initialNoteOpen={props.initialNoteOpen ?? false} />}
            <ModeRow keys={keys} actions={actions} picker={props.onPicker ? picker : undefined} onPicker={props.onPicker} />
            {/* Four groups in a row when there is room, two by two on a phone. */}
            <div class="live__groups">
              <div class="live__grid">
                {[0, 1, 2, 3].map((g) => (
                  <Group
                    key={g}
                    group={g}
                    st={st}
                    nameOf={nameOf}
                    now={now}
                    press={padPress}
                    playingPads={playingPads}
                    tracker={tracker}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </SideZone>
    </div>
  )
}

/**
 * The one-group view's display as a single dark line: play state, tempo and
 * project on the left, the pad just played on the right.
 */
function DisplayStrip(props: { st: MirrorState; mirror: MirrorUi | null; compact?: boolean }): JSX.Element {
  const { st, mirror } = props
  return (
    <div class={`live-strip${props.compact ? ' live-strip--bar' : ''}`} aria-live="polite">
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

/**
 * Live's display line in the top bar's middle, on a phone on its side: the
 * KEYS line or the pads' one-line display, one bar tall. [pianoRange] is the
 * piano's notes, to name a device note it doesn't reach.
 */
export function LivePill(props: { mirror: MirrorUi | null; keys: KeysUi; pianoRange: NoteRange | null }): JSX.Element {
  const st = props.mirror?.state ?? emptyMirrorState()
  return props.keys.on ? (
    <KeysDisplay st={st} mirror={props.mirror} keys={props.keys} compact pianoRange={props.pianoRange} />
  ) : (
    <DisplayStrip st={st} mirror={props.mirror} compact />
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

interface GroupProps {
  group: number
  st: MirrorState
  nameOf: (pad: PhysicalPad) => string | null
  now: number
  big?: boolean
  /** The guide overlay's "pads light as you play" tag (the big grid only). */
  coach?: boolean
  /** What a press on a pad plays (null: the pads stay still). */
  press: (pad: PhysicalPad) => PressTarget | null
  playingPads: ReadonlySet<number>
  tracker: PressTracker
}

function Group(props: GroupProps): JSX.Element {
  const { group, st, nameOf, now, big = false, press, playingPads, tracker } = props
  const letter = MirrorText.groupKey(group)
  return (
    <div
      class={`live-group${big ? ' live-group--big' : ''}`}
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
                  press={press(pad)}
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
 * of its pads sounds.
 */
function GroupKeys(props: { group: number; st: MirrorState; now: number; onSelect: (g: number) => void; column?: boolean }): JSX.Element {
  const { group, st, now, onSelect } = props
  const row = useRef<HTMLDivElement | null>(null)
  return (
    <div
      ref={row}
      class={`live-keys${props.column ? ' live-keys--column' : ''}`}
      aria-orientation={props.column ? 'vertical' : undefined}
      role="tablist"
      aria-label={MirrorText.GROUP}
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
              // A's tag points at the row; the guide overlay's tags keep off the others.
              data-coach-clear={g === 0 ? undefined : ''}
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
  press: PressTarget | null
  /** Playing on the phone: a signal-orange ring inside the pad. */
  playing: boolean
  tracker: PressTracker
}

function Pad(props: PadProps): JSX.Element {
  const { pad, light, name, big, press, playing, tracker } = props
  const g = light ? glow(light, props.now) : 0
  const wide = pad.label.length > 1
  const label = `${pad.groupLetter} ${pad.label}` + (name !== null ? `, ${name}` : '')
  const cls = `live-pad cap-3d${big ? ' live-pad--big' : ''}${playing ? ' is-playing' : ''}`
  const content = (
    <>
      {/* The key's own label in the corner (web: top left, where the K.O. II prints it). */}
      <span class={`live-pad__label${wide ? ' live-pad__label--wide' : ''}`}>{pad.label}</span>
      {name !== null && <span class="live-pad__name">{name}</span>}
    </>
  )
  if (press === null) {
    return (
      <div class={cls} role="img" aria-label={label} data-pad={padKey(pad)} style={{ '--glow': glowCss(g) }}>
        {content}
      </div>
    )
  }
  // The big grid doesn't scroll: it plays on touch-down. The all-groups page
  // scrolls, so there a drag across the pads must not play them.
  return (
    <button
      type="button"
      class={`${cls} live-pad--press${big ? '' : ' live-pad--scroll'}`}
      aria-label={label}
      aria-description={MirrorText.PLAY}
      data-pad={padKey(pad)}
      style={{ '--glow': glowCss(g) }}
      {...holdHandlers(tracker, press, !big)}
    >
      {content}
    </button>
  )
}

/** Two octaves around the last note outside the pads, with held notes lit. */
function KeysStrip(props: { st: MirrorState; last: number }): JSX.Element {
  const { st, last } = props
  const ch = st.keysHeld.get(last)
  return (
    <div class="live-tools__keys">
      <p class="t-small live-tools__note">
        {MirrorText.KEYS + ' · ' + noteName(last) + (ch !== undefined ? ' · ' + MirrorText.channel(ch) : '')}
      </p>
      <div class="keys-strip" role="img" aria-label={MirrorText.KEYS + ' ' + noteName(last)}>
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

function Notes(props: {
  st: MirrorState
  mirror: MirrorUi | null
  onPadOrder: (order: PadOrder) => void
  tapToPlay: boolean
  /** Upright: the piano is a turn of the phone away. */
  hint?: boolean
  /** The display line is in the top bar: its clock-out hint moves here. */
  transport?: boolean
}): JSX.Element {
  const { st, mirror, onPadOrder } = props
  const orders: readonly [PadOrder, string][] = [
    [PadOrder.FROM_TOP, MirrorText.FROM_TOP],
    [PadOrder.FROM_BOTTOM, MirrorText.FROM_BOTTOM],
  ]
  return (
    <div class="live-tools__notes">
      {props.tapToPlay && <p class="t-small live-tools__note">{WebText.LIVE_TAP_NOTE}</p>}
      {props.tapToPlay && props.hint && <p class="t-small live-tools__note">{WebText.LIVE_PIANO_HINT}</p>}
      {props.transport && st.playing === null && st.bpm === null && <p class="t-small live-tools__note">{MirrorText.NO_TRANSPORT}</p>}
      {mirror?.offline != null && <p class="t-small live-tools__note">{MirrorText.OFFLINE_NOTE}</p>}
      {st.padOrder === PadOrder.FROM_TOP && (
        <>
          <p class="t-small live-tools__note">{MirrorText.LEARN_NOTE}</p>
          {showNoPushes(st, mirror) && <p class="t-small live-tools__note">{MirrorText.NO_PUSHES}</p>}
        </>
      )}
      <Caption text={MirrorText.PAD_ORDER} align="start" as="h3" class="live-tools__order-caption" />
      <div class="live-tools__orders" role="group" aria-label={MirrorText.PAD_ORDER}>
        {orders.map(([order, label]) => (
          <Key
            key={order}
            text={label}
            size="small"
            variant={st.padOrder === order ? 'navy' : 'normal'}
            aria-pressed={st.padOrder === order}
            onClick={() => onPadOrder(order)}
          />
        ))}
      </div>
      <p class="t-small live-tools__note">{MirrorText.ORDER_NOTE}</p>
      <p class="t-small live-tools__note">{MirrorText.COMMUNITY_NOTE}</p>
      <p class="t-small live-tools__note">{MirrorText.LISTEN_ONLY}</p>
    </div>
  )
}

/**
 * The row right under the grid, as the PO app's DRUMS / KEYPAD: one word for
 * the mode that a tap switches (PADS ⇄ KEYS), and in KEYS the scale and the
 * octave, a tap on either of which lists the choices. Over the piano
 * ([landscape]) it also has the key's own word, and − and + either side of the
 * octave step it as the EP-133's KEYS + − / + do; on a [narrow] plate the key
 * word drops "KEY", and on a [tight] one the scale shortens to its code.
 */
function ModeRow(props: {
  keys: KeysUi
  actions: KeysActions
  /** Kept by the caller when given (undefined: each word keeps its own). */
  picker?: KeysPicker | null
  onPicker?: (picker: KeysPicker | null) => void
  landscape?: boolean
  narrow?: boolean
  tight?: boolean
}): JSX.Element {
  const { keys, actions, picker, onPicker, landscape = false } = props
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
  const octave = (
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
      down={landscape}
      columns={landscape ? 3 : 1}
    />
  )
  return (
    // Spread across the row: mode at the start, octave at the end, scale between; pulled
    // up close under the grid (the words keep their full touch height). Over the piano,
    // the words sit together at the start and the octave with − and + at the end.
    <div class={`live-mode${landscape ? ' live-mode--piano' : ''}`}>
      <WordButton
        label={keys.on ? MirrorText.MODE_KEYS : MirrorText.MODE_PADS}
        onClick={() => actions.onMode?.(!keys.on)}
        mark
        description={MirrorText.modeSwitch(keys.on)}
        top={!landscape}
        data-coach="live.mode"
        data-coach-label={CoachText.MODE}
        data-coach-face="var(--navy)"
        data-coach-ink="var(--on-navy)"
      />
      {keys.on && (
        <>
          <PickWord
            label={props.tight ? MirrorText.scaleCode(keys.scale) : MirrorText.scaleName(keys.scale)}
            options={SCALES}
            selected={keys.scale}
            name={MirrorText.scaleName}
            onPick={(s) => actions.onScale?.(s)}
            description={MirrorText.scaleChoice(keys.scale)}
            coach={{ id: 'live.scale', label: CoachText.SCALE }}
            {...pick('scale')}
            down={landscape}
            columns={landscape ? 2 : 1}
          />
          {landscape && (
            <PickWord
              label={props.narrow ? Keys.name(keys.root, keys.names) : MirrorText.keyWord(keys.root, keys.names)}
              options={ROOTS}
              selected={keys.root}
              name={(r) => Keys.name(r, keys.names)}
              onPick={(r) => actions.onRoot?.(r)}
              description={MirrorText.keyChoice(keys.root, keys.names)}
              coach={{ id: 'live.key', label: CoachText.KEY }}
              {...pick('key')}
              down
              columns={6}
            />
          )}
          {landscape ? (
            <span class="live-mode__octave">
              <StepWord
                glyph="−"
                description={MirrorText.OCTAVE_DOWN}
                enabled={keys.octave > MIN_OCTAVE}
                onClick={() => actions.onOctave?.(keys.octave - 1)}
              />
              {octave}
              <StepWord
                glyph="+"
                description={MirrorText.OCTAVE_UP}
                enabled={keys.octave < MAX_OCTAVE}
                onClick={() => actions.onOctave?.(keys.octave + 1)}
              />
            </span>
          ) : (
            octave
          )}
        </>
      )}
    </div>
  )
}

/** The twelve keys the KEY word lists, DO (C) first. */
const ROOTS: readonly number[] = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])

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
 * The KEYS display line: KEYS and the last note on the left, the sound it
 * plays on the right. [compact]: one bar tall, in the top bar (LivePill),
 * where the word KEYS (right under it) is left out. With the piano
 * ([pianoRange]), a device note it doesn't reach is named as such.
 */
function KeysDisplay(props: {
  st: MirrorState
  mirror: MirrorUi | null
  keys: KeysUi
  compact?: boolean
  pianoRange?: NoteRange | null
}): JSX.Element {
  const { st, mirror, keys, compact = false } = props
  const note = keysDisplayNote(keys, st.lastNote)
  const range = props.pianoRange ?? null
  const noteText =
    note === null
      ? null
      : range !== null && !inRange(range, note) && !keys.playingNotes.has(note)
        ? MirrorText.outOfRange(note, keys.names, note < range.first)
        : MirrorText.noteName(note, keys.names)
  return (
    <div class={`live-strip${compact ? ' live-strip--bar' : ''}`} aria-live="polite">
      <span class={`live-strip__sub live-strip__dim${compact ? ' sr-only' : ''}`}>{MirrorText.MODE_KEYS.toUpperCase()}</span>
      {noteText !== null && <span class="live-strip__sub live-strip__ink live-strip__note">{noteText}</span>}
      {mirror?.offline != null && <span class="live-strip__sub live-strip__dim">{MirrorText.OFFLINE}</span>}
      <span class="live-strip__line">
        {keys.pad !== null ? MirrorText.keysSound(keys.pad, keys.padName) : MirrorText.NO_SOUND}
      </span>
    </div>
  )
}

/**
 * The 12 pads as keys, in the keypad's layout: each shows its note in a ring,
 * orange on the scale's root (the first key of each octave of it) and plain on
 * the rest, as the piano marks them. Notes from the device light their key;
 * the notes playing on the phone are outlined in signal orange. Each key
 * plays the note it showed when pressed, even if the key, scale or octave
 * change while it is held (NoteTouches, with the key as its finger).
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
  const touches = useMemo(() => new NoteTouches(), [])
  const act = useRef(actions)
  act.current = actions
  const play = (events: readonly NoteEvent[]): void => {
    for (const e of events) {
      if (e.kind === 'press') act.current.onNote?.(e.note, true)
      else act.current.onNoteUp?.(e.note)
    }
  }
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
                // A screen reader's Play sounds the whole note, outside the fingers' count.
                press: (hold) => (hold ? play(touches.down(k, note)) : act.current.onNote?.(note, false)),
                release: () => play(touches.up(k)),
              }
              const cls =
                'live-key cap-3d' +
                (rootKey(k, keys.scale) ? ' live-key--root' : '') +
                (keys.playingNotes.has(note) ? ' is-playing' : '')
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
                  <svg class="live-key__ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
                    <circle cx="50" cy="50" r="45.5" fill="none" stroke-width="9" />
                  </svg>
                  <span class="live-key__name">{Keys.name(note, keys.names)}</span>
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
 * The KEYS tools: the key (fixed-do names) and the scale, and what the keys'
 * colours mean (with the piano's own rows while it shows). Upright, a note
 * that a turn of the phone shows the piano ([hint]).
 */
function KeysPanel(props: { keys: KeysUi; actions: KeysActions; piano: boolean; hint: boolean }): JSX.Element {
  const { keys, actions } = props
  const rows = [
    [0, 1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10, 11],
  ]
  return (
    <>
      <Caption text={MirrorText.KEY} align="start" />
      {rows.map((row, i) => (
        <Segmented
          key={i}
          options={row.map((n) => Keys.name(n, keys.names))}
          selected={row.indexOf(keys.root)}
          onSelect={(j) => actions.onRoot?.(row[j]!)}
          label={MirrorText.KEY}
        />
      ))}
      <p class="t-small live-tools__note">{MirrorText.KEYS_NOTE}</p>
      {props.hint && <p class="t-small live-tools__note">{WebText.LIVE_PIANO_HINT}</p>}
      <KeysLegend piano={props.piano} />
    </>
  )
}

/**
 * What the keys' colours mean, each with a small key drawn as the grid (or,
 * with the piano showing, the piano) draws it.
 */
function KeysLegend(props: { piano: boolean }): JSX.Element {
  const piano = props.piano
  return (
    <>
      <Caption text={MirrorText.LEGEND} align="start" />
      <ul class="live-legend">
        <LegendRow text={MirrorText.LEGEND_ROOT}>
          <LegendKey ring="var(--signal)" piano={piano} />
        </LegendRow>
        <LegendRow text={WebText.LIVE_LEGEND_IN_SCALE}>
          <LegendKey ring={piano ? 'var(--navy)' : 'var(--hw-ring)'} piano={piano} />
        </LegendRow>
        {piano && (
          <>
            <LegendRow text={MirrorText.LEGEND_OUT}>
              <LegendKey piano out />
            </LegendRow>
            <LegendRow text={MirrorText.LEGEND_C}>
              <LegendKey piano digit="4" />
            </LegendRow>
          </>
        )}
        <LegendRow text={MirrorText.LEGEND_DEVICE}>
          <LegendKey ring="var(--on-signal)" fill="var(--signal)" piano={piano} />
        </LegendRow>
        <LegendRow text={WebText.LIVE_LEGEND_HERE}>
          <LegendKey ring={piano ? 'var(--navy)' : 'var(--hw-ring)'} outline piano={piano} />
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
 * A key in miniature: its dark cap (on the piano, a white key: dimmed when
 * [out]) lit orange when [fill], its ring, the phone's outline, or a C's octave [digit].
 */
function LegendKey(props: { ring?: string; fill?: string; outline?: boolean; piano?: boolean; out?: boolean; digit?: string }): JSX.Element {
  const face = props.fill ?? (props.piano ? (props.out ? 'var(--key-out)' : 'var(--piano-white)') : 'var(--hw-dark-face)')
  return (
    <span
      class={`live-legend__key${props.outline ? ' live-legend__key--outline' : ''}${props.piano ? ' live-legend__key--piano' : ''}`}
      style={{ background: face }}
    >
      {props.digit !== undefined ? (
        <span class="live-legend__digit">{props.digit}</span>
      ) : (
        props.ring !== undefined && (
          <svg viewBox="0 0 100 100" focusable="false">
            <circle cx="50" cy="50" r="43" fill="none" stroke={props.ring} stroke-width="14" />
          </svg>
        )
      )}
    </span>
  )
}
