// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/LiveScene.kt (LiveScene, worthSaying,
// sceneReadout, sceneSaid, SceneHeader, SceneDeck, GroupColumn, EraseKey, ClipModes, PatternGrid)
// and PatternLine.kt's SceneChip (a cell of the scene and STEP's key)
//
// Scenes on Live (an addition, after the EP-133's own patterns and scenes:
// GROUP + − / +, MAIN + − / +, COMMIT, ERASE + MAIN held, SHIFT + C / D and
// the scene change setting). An S01 chip on the display line (the scene's
// readout while the pattern plays) opens the SCENE panel in the function
// keys' place, on the line's dark screen: ▶ / ■, the scene's − and + and the
// status, ✕; then the four groups' columns, each its pattern's number with
// − / + and NEXT FREE, COMMIT, CLR (held 2 s; DEL on an empty scene) and
// CHANGE, and the CLIP row with its bar pages. The panel stays open while the
// pattern plays: a pick made on it waits for its bar or pattern end, blinking
// where it will show. A tap on a number opens the 1–99 grid.
//
// Web deltas:
// - The panel takes the function keys' place (Kotlin's SLOT hosting, with
//   its own header); the 1–99 grid opens inside the panel, under its rows,
//   rather than over the pads. Not in the desk's Device view yet, and the
//   group keys don't carry the numbers.
// - The readout while the pattern plays is in the scene's cell (Android: in
//   the line's words, beside the counter).
// - CLR / DEL's 2 s hold is a pointer (or Enter / Space) held on the key, its
//   fill moved by CSS; a screen reader's click (no hold) acts at once.

import { createContext, type JSX } from 'preact'
import { useContext, useEffect, useRef, useState } from 'preact/hooks'
import { Seq } from '../../core/features/pattern'
import type { SwitchTime } from '../../core/features/scenes'
import { FeatureText } from '../../core/text/featureText'
import { MirrorText } from '../../core/text/mirrorText'
import { CLIP_MODES, cycledSwitch, type ClipMode, type SceneUi } from '../../state/scenePlan'
import './ScenePanel.css'

/** How long CLR / DEL is held (ERASE + MAIN on the device) before it acts. */
export const SCENE_HOLD_MS = 2000

/**
 * Scenes for Live's page (Kotlin LiveScene): [ui] as the controller has it,
 * whether the pattern [running] (the panel's ▶ reads ■), and what the chip
 * and the panel's keys do.
 */
export interface SceneActions {
  readonly ui: SceneUi
  readonly running: boolean
  /** The S01 chip: the panel opens on the group Live shows. */
  onOpen(): void
  onClose(): void
  onGroup(group: number): void
  onPlay(): void
  onScene(dir: number): void
  onPatternStep(group: number, dir: number): void
  onPatternPick(group: number, n: number): void
  onNextFree(group: number): void
  onGrid(group: number | null): void
  onCommit(): void
  onErase(): void
  onSwitch(t: SwitchTime): void
  onClipMode(m: ClipMode): void
  onBar(bar: number): void
  onCopy(): void
  onPaste(): void
}

/** SCENES on Live; null where Live has no pattern. */
export const SceneContext = createContext<SceneActions | null>(null)

export function useScene(): SceneActions | null {
  return useContext(SceneContext)
}

/** Whether the scene is worth saying: more than one scene, or a group on a pattern other than 1. */
export function worthSaying(ui: SceneUi): boolean {
  return ui.count > 1 || ui.groups.some((g) => g.number !== 1)
}

/** The scene as the line reads it while the pattern plays: "S02 · A01 B03→05 C01 D02", its parts apart. */
export function sceneReadout(ui: SceneUi): string[] {
  return [ui.label, '·', ...ui.groups.map((c, g) => MirrorText.groupPattern(g, c.number) + (c.queued !== null ? '→' + MirrorText.patternNumber(c.queued) : ''))]
}

/** The scene's readout for screen readers: the scene and its patterns, and each change waiting. */
export function sceneSaid(ui: SceneUi): string {
  return (
    MirrorText.sceneSpoken(
      ui.index,
      ui.count,
      ui.groups.map((c) => c.number),
    ) + ui.groups.map((c, g) => (c.queued !== null ? '. ' + MirrorText.patternQueuedSpoken(g, c.queued, ui.switchTime) : '')).join('')
  )
}

/**
 * The scene's cell on the line (in one key with STEP's, PatternLine.tsx's
 * SceneStepKeys): S01, a tap opens the panel; while the pattern plays and the
 * scene is worth saying, its [readout] instead (a change waiting blinks).
 */
export function SceneCell(props: { readout: readonly string[] | null }): JSX.Element | null {
  const s = useScene()
  if (s === null) return null
  const ui = s.ui
  const readout = props.readout
  return (
    <button
      type="button"
      class="transport-key scene-chip"
      aria-label={MirrorText.sceneChipName(ui.index, ui.count)}
      aria-description={readout !== null ? sceneSaid(ui) : undefined}
      onClick={() => s.onOpen()}
    >
      {readout === null ? (
        <span aria-hidden="true">{ui.label}</span>
      ) : (
        <span class="scene-chip__readout" aria-hidden="true">
          {readout.map((part, i) => (
            <span key={i} class={part.includes('→') ? 'is-queued' : undefined}>
              {part}
            </span>
          ))}
        </span>
      )}
    </button>
  )
}

/** The SCENE panel, on the line's dark screen: its header, the groups' columns, COMMIT / CLR / CHANGE, the CLIP row, the grid. */
export function ScenePanel(props: { class?: string }): JSX.Element | null {
  const s = useScene()
  const [hold, setHold] = useState(false)
  if (s === null || !s.ui.open) return null
  return (
    <section class={`scene-panel${props.class ? ` ${props.class}` : ''}`} aria-label={MirrorText.SCENE_NAME}>
      <SceneHeader s={s} holding={hold} />
      <SceneDeck s={s} onHold={setHold} />
      {s.ui.gridGroup !== null && <PatternGrid s={s} group={s.ui.gridGroup} />}
    </section>
  )
}

/** ▶ (■ while the pattern runs), the scene's − and +, the status ("B → 05 AT BAR END", "HOLD · DEL S05" while CLR / DEL is held), ✕. */
function SceneHeader(props: { s: SceneActions; holding: boolean }): JSX.Element {
  const { s } = props
  const ui = s.ui
  const status = props.holding ? MirrorText.eraseHolding(ui.canDelete, ui.label) : ui.status
  return (
    <div class="scene-panel__head">
      <button type="button" class={`step-chip${s.running ? ' is-on' : ''}`} aria-label={s.running ? FeatureText.STOP : MirrorText.PLAY} onClick={() => s.onPlay()}>
        <span class={s.running ? 'scene-chip__stop' : 'step-chip__play'} aria-hidden="true" />
      </button>
      <button type="button" class="scene-key scene-key--step" aria-label={MirrorText.PREV_SCENE} onClick={() => s.onScene(-1)}>
        −
      </button>
      <span class="scene-panel__label">{ui.label}</span>
      <button
        type="button"
        class="scene-key scene-key--step"
        aria-label={ui.index === ui.count - 1 ? MirrorText.NEW_SCENE : MirrorText.NEXT_SCENE}
        onClick={() => s.onScene(1)}
      >
        +
      </button>
      <span class={`step-panel__status${status !== null ? ' is-signal' : ' is-dim'}`} aria-hidden="true">
        {(status ?? MirrorText.sceneStatus(ui.index, ui.count)).toUpperCase()}
      </span>
      <span class="sr-only" aria-live="polite">
        {ui.said ?? status ?? MirrorText.sceneStatus(ui.index, ui.count)}
      </span>
      <button type="button" class="step-panel__close" aria-label={MirrorText.CLOSE_SCENE} onClick={() => s.onClose()}>
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  )
}

function SceneDeck(props: { s: SceneActions; onHold(on: boolean): void }): JSX.Element {
  const { s } = props
  const ui = s.ui
  return (
    <div class="scene-panel__deck">
      <div class="scene-columns">
        {ui.groups.map((_, g) => (
          <GroupColumn key={g} s={s} group={g} />
        ))}
      </div>
      <div class="scene-row">
        <button type="button" class="scene-key" aria-description={MirrorText.COMMIT_NOTE} onClick={() => s.onCommit()}>
          {MirrorText.COMMIT.toUpperCase()}
        </button>
        <EraseKey s={s} onHold={props.onHold} />
        <span class="scene-word" aria-hidden="true">{MirrorText.CHANGE.toUpperCase()}</span>
        <button
          type="button"
          class="scene-key scene-key--change"
          aria-label={MirrorText.changeName(ui.switchTime)}
          aria-description={MirrorText.CHANGE_NOTE}
          onClick={() => s.onSwitch(cycledSwitch(ui.switchTime))}
        >
          {MirrorText.switchName(ui.switchTime).toUpperCase()}
        </button>
      </div>
      <div class="scene-row">
        <span class="scene-word" aria-hidden="true">{MirrorText.CLIP.toUpperCase()}</span>
        <div class="scene-modes" role="radiogroup" aria-label={MirrorText.CLIP}>
          {CLIP_MODES.map((m) => {
            const [word, name] = m === 'PTN' ? [MirrorText.PTN, MirrorText.CLIP_PTN_NAME] : m === 'BAR' ? [MirrorText.BAR, MirrorText.CLIP_BAR_NAME] : [MirrorText.CLIP_PAD, MirrorText.CLIP_PAD_NAME]
            const on = ui.clipMode === m
            return (
              <button key={m} type="button" role="radio" aria-checked={on} aria-label={name} class={`scene-key scene-key--mode${on ? ' is-on' : ''}`} onClick={() => s.onClipMode(m)}>
                {word.toUpperCase()}
              </button>
            )
          })}
        </div>
        <button type="button" class={`scene-key${ui.padStage === 'SOURCE' ? ' is-on' : ''}`} onClick={() => s.onCopy()}>
          {MirrorText.COPY.toUpperCase()}
        </button>
        <button type="button" class={`scene-key${ui.padStage === 'TARGET' ? ' is-on' : ''}`} onClick={() => s.onPaste()}>
          {MirrorText.PASTE.toUpperCase()}
        </button>
      </div>
      {(ui.clipMode === 'BAR' || ui.clip !== null) && (
        <div class="scene-row scene-row--bar">
          {ui.clipMode === 'BAR' && (
            <div class="step-pages" role="tablist" aria-label={MirrorText.barPagesGroup(ui.group)}>
              <span class="step-pages__word" aria-hidden="true">{MirrorText.barPagesGroup(ui.group).toUpperCase()}</span>
              <div class="step-pages__keys">
                {Array.from({ length: ui.groups[ui.group]?.bars ?? 1 }, (_, b) => (
                  <button
                    key={b}
                    type="button"
                    role="tab"
                    aria-selected={b === ui.bar}
                    aria-label={MirrorText.barPage(b + 1)}
                    class={`step-page${b === ui.bar ? ' is-on' : ''}`}
                    onClick={() => s.onBar(b)}
                  >
                    {b + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
          {ui.clip !== null && (
            <span class="scene-word scene-word--held" aria-hidden="true">
              {MirrorText.clipHeld(ui.clip.what).toUpperCase()}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** A group's column: its letter and pattern's number (a tap opens the grid; one waiting blinks after an arrow), − and +, NEXT FREE. */
function GroupColumn(props: { s: SceneActions; group: number }): JSX.Element {
  const { s, group } = props
  const col = s.ui.groups[group]!
  const notes = col.filled.has(col.number)
  const focused = s.ui.group === group
  return (
    <div class={`scene-col${focused ? ' is-focused' : ''}`} role="group" aria-label={MirrorText.groupColumn(group, col.number, notes)}>
      <button
        type="button"
        class={`scene-col__number${s.ui.gridGroup === group ? ' is-on' : ''}`}
        aria-label={MirrorText.groupColumn(group, col.number, notes) + '. ' + MirrorText.PICK_PATTERN}
        aria-expanded={s.ui.gridGroup === group}
        onClick={() => {
          s.onGroup(group)
          s.onGrid(s.ui.gridGroup === group ? null : group)
        }}
      >
        <span class="scene-col__letter" aria-hidden="true">{MirrorText.groupKey(group)}</span>
        <span class={`scene-col__value${col.queued !== null ? ' is-queued' : ''}`} aria-hidden="true">
          {col.queued === null ? MirrorText.patternNumber(col.number) : MirrorText.numberMove(col.number, col.queued)}
        </span>
      </button>
      <div class="scene-col__keys">
        <button type="button" class="scene-key scene-key--step" aria-label={MirrorText.groupPrevious(group)} onClick={() => s.onPatternStep(group, -1)}>
          −
        </button>
        <button type="button" class="scene-key scene-key--step" aria-label={MirrorText.groupNext(group)} onClick={() => s.onPatternStep(group, 1)}>
          +
        </button>
      </div>
      <button type="button" class="scene-col__free" aria-label={MirrorText.groupNextFree(group)} onClick={() => s.onNextFree(group)}>
        {MirrorText.NEXT_FREE.toUpperCase()}
      </button>
    </div>
  )
}

/** CLR (DEL on an empty scene that isn't the only one): held SCENE_HOLD_MS, it acts; let go of sooner, nothing. A click with no pointer acts at once. */
function EraseKey(props: { s: SceneActions; onHold(on: boolean): void }): JSX.Element {
  const { s } = props
  const del = s.ui.canDelete
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [held, setHeld] = useState(false)
  const latest = useRef(s)
  latest.current = s
  const stop = (): void => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    setHeld(false)
    props.onHold(false)
  }
  const start = (): void => {
    stop()
    setHeld(true)
    props.onHold(true)
    timer.current = setTimeout(() => {
      timer.current = null
      setHeld(false)
      props.onHold(false)
      latest.current.onErase()
    }, SCENE_HOLD_MS)
  }
  useEffect(() => stop, [])
  return (
    <button
      type="button"
      class={`scene-key scene-key--erase${held ? ' is-holding' : ''}`}
      aria-label={MirrorText.eraseSceneName(del)}
      aria-description={MirrorText.HOLD_NOTE}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        start()
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault()
          start()
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') stop()
      }}
      onClick={(e) => {
        // A screen reader's click: no hold to give.
        if (e.detail === 0 && timer.current === null && !held) latest.current.onErase()
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span class="scene-key__fill" aria-hidden="true" />
      <span class="scene-key__word">{(del ? MirrorText.DEL : MirrorText.CLR).toUpperCase()}</span>
    </button>
  )
}

/**
 * The 1–99 grid for [group]: ten to a row, a pattern with notes filled, the
 * one playing in signal orange, the next free one outlined; a tap picks it
 * and the grid closes. ✕ closes it without.
 */
function PatternGrid(props: { s: SceneActions; group: number }): JSX.Element {
  const { s, group } = props
  const col = s.ui.groups[group]!
  return (
    <div class="scene-grid" role="group" aria-label={MirrorText.GRID_NAME}>
      <div class="scene-grid__head">
        <span class="scene-grid__title">{MirrorText.gridTitle(group).toUpperCase()}</span>
        <span class="scene-grid__detail">{MirrorText.gridDetail(col.number, col.bars).toUpperCase()}</span>
        <button type="button" class="step-panel__close" aria-label={MirrorText.CLOSE_GRID} onClick={() => s.onGrid(null)}>
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      <div class="scene-grid__cells">
        {Array.from({ length: Seq.MAX_PATTERNS }, (_, i) => {
          const n = i + 1
          const notes = col.filled.has(n)
          const playing = n === col.number
          const free = n === col.nextFree
          return (
            <button
              key={n}
              type="button"
              class={`scene-cell${notes ? ' has-notes' : ''}${playing ? ' is-playing' : ''}${free ? ' is-free' : ''}`}
              aria-label={MirrorText.patternCell(n, notes)}
              aria-description={free ? MirrorText.NEXT_FREE : undefined}
              aria-current={playing ? 'true' : undefined}
              onClick={() => s.onPatternPick(group, n)}
            >
              {MirrorText.patternNumber(n)}
            </button>
          )
        })}
      </div>
      <div class="scene-grid__legend" aria-hidden="true">
        <span class="scene-legend scene-legend--notes">{MirrorText.GRID_HAS_NOTES}</span>
        <span class="scene-legend scene-legend--empty">{MirrorText.GRID_EMPTY}</span>
        <span class="scene-legend scene-legend--playing">{MirrorText.GRID_PLAYING}</span>
        <span class="scene-legend scene-legend--free">{MirrorText.NEXT_FREE}</span>
      </div>
    </div>
  )
}
