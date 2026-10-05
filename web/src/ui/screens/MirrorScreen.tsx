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
//   no strip.
import { type ButtonHTMLAttributes, type ComponentChildren, type JSX } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Keys, SCALES, type NoteNames, type Scale } from '../../core/features/keys'
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
import { rowPadSize } from '../live/desk'
import { DEFAULT_KEYS, keysDisplayNote, keysLit, octaves, upperOctave, type KeysPicker, type KeysUi } from '../live/keys'
import { PressTracker, type PressTarget } from '../live/press'
import { PickWord, WordButton } from '../live/Words'
import { useDesk } from '../useDesk'
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
  const { mirror, nameOf, onPadOrder, onBack = null, fixedNow = null, oneGroup, follow } = props
  const keys = props.keys ?? DEFAULT_KEYS
  const actions = props.keysActions ?? {}
  const onPad = props.onPad ?? null
  const playingPads = props.playingPads ?? NO_PADS
  const st = mirror?.state ?? emptyMirrorState()
  const root = useRef<HTMLDivElement | null>(null)
  const now = fixedNow ?? perfNow()
  const desk = useDesk()
  // The desk's room for the page (beside the docked tools): whether all four groups fit in one row.
  const box = useRef<HTMLDivElement | null>(null)
  const room = useBoxSize(box, desk)
  const rowPad = desk && !oneGroup && !keys.on ? rowPadSize(room.width, room.height) : null

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

  const panel = keys.on ? (
    <KeysPanel keys={keys} actions={actions} />
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
      <Notes st={st} mirror={mirror} onPadOrder={onPadOrder} tapToPlay={onPad !== null} />
    </>
  )

  const padPress = (pad: PhysicalPad): PressTarget | null =>
    onPad === null
      ? null
      : {
          press: (hold) => onPad(pad, hold),
          release: () => props.onPadUp?.(pad),
        }

  const modeRow = (
    <ModeRow keys={keys} actions={actions} picker={props.onPicker ? picker : undefined} onPicker={props.onPicker} />
  )
  const allGroups = (
    <div class="live__all">
      <div class="live__head">
        <Caption text={MirrorText.TITLE} as="h1" />
        {onBack && <CloseKey class="live__close" onClick={onBack} description={GUIDE_CLOSE} />}
      </div>
      <Display st={st} mirror={mirror} initialNoteOpen={props.initialNoteOpen ?? false} />
      {modeRow}
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
  )

  let page: JSX.Element
  if (desk) {
    // The desk: the K.O. II (or the row of groups) in the room left of the docked tools.
    let body: JSX.Element
    if (keys.on && keyNotes) {
      body = (
        <div class="live-ko live-ko--keys">
          <KeysDisplay st={st} mirror={mirror} keys={keys} />
          {modeRow}
          <div class="live-ko__body">
            <KeysGrid st={st} keys={keys} keyNotes={keyNotes} now={now} actions={actions} tracker={tracker} />
          </div>
        </div>
      )
    } else if (oneGroup) {
      body = (
        <div class="live-ko">
          <DisplayStrip st={st} mirror={mirror} />
          {modeRow}
          <div class="live-ko__body">
            <GroupKeys group={group} st={st} now={now} onSelect={setGroup} vertical />
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
          </div>
        </div>
      )
    } else if (rowPad !== null) {
      // All four in one row, nothing to scroll, so a press plays at once.
      body = (
        <div class="live-row desk-paper" style={{ '--row-pad': `${rowPad}px` }}>
          <DisplayStrip st={st} mirror={mirror} />
          {modeRow}
          <div class="live-row__groups">
            {[0, 1, 2, 3].map((g) => (
              <Group
                key={g}
                group={g}
                st={st}
                nameOf={nameOf}
                now={now}
                fill
                press={padPress}
                playingPads={playingPads}
                tracker={tracker}
              />
            ))}
          </div>
        </div>
      )
    } else {
      body = <div class="live-scroll desk-paper">{allGroups}</div>
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
      <div class="live__one">
        {onBack && (
          <div class="live__head">
            <Caption text={MirrorText.TITLE} />
            <CloseKey class="live__close" onClick={onBack} description={GUIDE_CLOSE} />
          </div>
        )}
        {keys.on && keyNotes ? (
          <>
            <KeysDisplay st={st} mirror={mirror} keys={keys} />
            <KeysGrid st={st} keys={keys} keyNotes={keyNotes} now={now} actions={actions} tracker={tracker} />
            {modeRow}
          </>
        ) : (
          <>
            <DisplayStrip st={st} mirror={mirror} />
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
        docked={desk}
      >
        {page}
      </SideZone>
    </div>
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
  /** What a press on a pad plays (null: the pads stay still). */
  press: (pad: PhysicalPad) => PressTarget | null
  playingPads: ReadonlySet<number>
  tracker: PressTracker
}

function Group(props: GroupProps): JSX.Element {
  const { group, st, nameOf, now, big = false, fill = false, press, playingPads, tracker } = props
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
 * of its pads sounds. [vertical] (the desk): a column beside the grid, each key
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
  press: PressTarget | null
  /** Playing on the phone: a signal-orange ring inside the pad. */
  playing: boolean
  tracker: PressTracker
}

function Pad(props: PadProps): JSX.Element {
  const { pad, light, name, big, scroll, press, playing, tracker } = props
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
  // The big grid (and the desk's row) doesn't scroll: it plays on touch-down. The
  // all-groups page scrolls, so there a drag across the pads must not play them.
  return (
    <button
      type="button"
      class={`${cls} live-pad--press${scroll ? ' live-pad--scroll' : ''}`}
      aria-label={label}
      aria-description={MirrorText.PLAY}
      data-pad={padKey(pad)}
      style={{ '--glow': glowCss(g) }}
      {...holdHandlers(tracker, press, scroll)}
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
}): JSX.Element {
  const { st, mirror, onPadOrder } = props
  const orders: readonly [PadOrder, string][] = [
    [PadOrder.FROM_TOP, MirrorText.FROM_TOP],
    [PadOrder.FROM_BOTTOM, MirrorText.FROM_BOTTOM],
  ]
  return (
    <div class="live-tools__notes">
      {props.tapToPlay && <p class="t-small live-tools__note">{WebText.LIVE_TAP_NOTE}</p>}
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
 * octave, a tap on either of which lists the choices.
 */
function ModeRow(props: {
  keys: KeysUi
  actions: KeysActions
  /** Kept by the caller when given (undefined: each word keeps its own). */
  picker?: KeysPicker | null
  onPicker?: (picker: KeysPicker | null) => void
}): JSX.Element {
  const { keys, actions, picker, onPicker } = props
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
  return (
    // Spread across the row: mode at the start, octave at the end, scale between; pulled
    // up close under the grid (the words keep their full touch height).
    <div class="live-mode">
      <WordButton
        label={keys.on ? MirrorText.MODE_KEYS : MirrorText.MODE_PADS}
        onClick={() => actions.onMode?.(!keys.on)}
        mark
        description={MirrorText.modeSwitch(keys.on)}
        top
        data-coach="live.mode"
        data-coach-label={CoachText.MODE}
        data-coach-face="var(--navy)"
        data-coach-ink="var(--on-navy)"
      />
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

/** The KEYS display line: KEYS and the last note on the left, the sound it plays on the right. */
function KeysDisplay(props: { st: MirrorState; mirror: MirrorUi | null; keys: KeysUi }): JSX.Element {
  const { st, mirror, keys } = props
  const note = keysDisplayNote(keys, st.lastNote)
  return (
    <div class="live-strip" aria-live="polite">
      <span class="live-strip__sub live-strip__dim">{MirrorText.MODE_KEYS.toUpperCase()}</span>
      {note !== null && <span class="live-strip__sub live-strip__ink">{MirrorText.noteName(note, keys.names)}</span>}
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

/** The KEYS tools: the key (fixed-do names) and the scale. */
function KeysPanel(props: { keys: KeysUi; actions: KeysActions }): JSX.Element {
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
      <KeysLegend names={keys.showNames ? keys.names : null} />
    </>
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
      <Caption text={MirrorText.LEGEND} align="start" />
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
