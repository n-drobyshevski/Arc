// The beat-card view: header (name, tempo, swing), the card's effect lines
// with the FX switch, Play/Stop, the scene strip of a card of scenes (a chip
// per scene, Chain or Scene play mode, where the chain is), group tabs, the
// step grid with mute and solo per row (and a badge on each pad a pad line
// shapes), the card's problems by line, Copy card, and Regenerate, Improve
// (Fix errors on a broken card) and "Ask Claude to change this" with quick
// changes. It only draws and plays; main.tsx talks to the host.
//
// Scenes: the grid shows the selected scene's patterns, a group it carries
// from an earlier scene marked "from scene N". Chain plays the chain (each
// scene once, in order, without a chain line), and the selection follows the
// scene heard; Scene loops the selected scene. Picking a scene while the
// chain plays switches to Scene, as Arc does. The lit chip, the position line
// and the playhead follow the audio clock (Player.position), so a scene cued
// for the next bar lights when it is heard.

import type { CSSProperties, JSX } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  SWING_MAX,
  SWING_MIN,
  TEMPO_MAX,
  TEMPO_MIN,
  TICKS_PER_BEAT,
  cardScenes,
  scenePatterns,
  type BeatCardProblem,
  type BeatCardResult,
  type BeatCardScene,
} from '../../../web/src/core/formats/beatCard'
import { BeatText } from '../../src/text'
import {
  audible,
  cardFx,
  chainSteps,
  firstStepOf,
  hasFx,
  sceneCard,
  sceneSteps,
  viewGroups,
  type ViewGroup,
  type ViewRow,
} from './model'
import { Player } from './player'
import { Synth } from './synth'

/** A card without a tempo line plays at this one. */
const DEFAULT_TEMPO = 120

type Mode = 'chain' | 'scene'

/** Chain when the card has a chain line and scenes to play it with, else Scene. */
const defaultMode = (result: BeatCardResult): Mode =>
  result.chain != null && cardScenes(result).length > 1 ? 'chain' : 'scene'

export interface BeatViewProps {
  readonly card: string | null
  readonly result: BeatCardResult
  readonly canMessage: boolean
  readonly sendMessage: (text: string) => Promise<boolean>
  readonly copyText: (text: string) => Promise<boolean>
}

export function BeatView(props: BeatViewProps): JSX.Element {
  const { result } = props
  const scenes = useMemo(() => cardScenes(result), [result])
  const many = scenes.length > 1
  const [selected, setSelected] = useState(0)
  const [mode, setMode] = useState<Mode>(() => defaultMode(result))
  const scene = Math.min(selected, scenes.length - 1)
  const chain = many && mode === 'chain'
  const shownCard = useMemo(() => sceneCard(result, scene), [result, scene])
  const groups = useMemo(() => viewGroups(shownCard), [shownCard])
  // The scene each group's pattern comes from, for the groups the scene carries.
  const carried = useMemo(() => {
    const from = new Map<string, number>()
    for (const p of scenePatterns(result, scene)) if (p.scene !== scene) from.set(p.group.group, p.scene)
    return from
  }, [result, scene])
  const playable = useMemo(() => scenes.some((s) => scenePatterns(result, s.index).length > 0), [result, scenes])
  const fx = useMemo(() => cardFx(result), [result])
  const [tab, setTab] = useState('')
  const [tempo, setTempo] = useState(result.tempo ?? DEFAULT_TEMPO)
  const [swing, setSwing] = useState(result.swing)
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set())
  const [soloed, setSoloed] = useState<ReadonlySet<string>>(new Set())
  const [fxOn, setFxOn] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [audioError, setAudioError] = useState(false)
  const [nowStep, setNowStep] = useState<number | null>(null)
  /** The scene heard now and where the chain is, while playing. */
  const [heardScene, setHeardScene] = useState<number | null>(null)
  const [where, setWhere] = useState<string | null>(null)
  const player = useRef<Player | null>(null)

  // A new card starts over.
  useEffect(() => {
    setSelected(0)
    setMode(defaultMode(result))
    setTab('')
    setTempo(result.tempo ?? DEFAULT_TEMPO)
    setSwing(result.swing)
    setMuted(new Set())
    setSoloed(new Set())
    setFxOn(true)
  }, [result])

  // What plays: the chain, or the selected scene looped (all a card without scenes has). The chain's
  // steps don't depend on the selection, which follows the scene heard.
  const loopScene = chain ? -1 : scene
  const steps = useMemo(
    () => (loopScene < 0 ? chainSteps(result, swing) : sceneSteps(result, loopScene, swing)),
    [result, swing, loopScene],
  )
  // The chain starts from the first step with the scene showing.
  const from = chain ? firstStepOf(steps, scene) : 0
  useEffect(() => player.current?.setSteps(steps, from), [steps])
  useEffect(() => player.current?.setTempo(tempo), [tempo])
  useEffect(() => player.current?.setFx(fx), [fx])
  useEffect(() => player.current?.setFxOn(fxOn), [fxOn])
  useEffect(() => {
    if (player.current) player.current.audible = (pad) => audible(pad, muted, soloed)
  }, [muted, soloed])
  useEffect(() => () => player.current?.stop(), [])

  const shown = groups.find((v) => v.group.group === tab) ?? groups[0]
  /** The scene the shown group's pattern comes from, when the scene carries it. */
  const shownFrom = shown ? carried.get(shown.group.group) : undefined
  const sceneName = scenes[scene]!.name

  // The playhead of the shown section, the scene heard and where the chain is, once a frame while playing.
  useEffect(() => {
    if (!playing) {
      setNowStep(null)
      setHeardScene(null)
      setWhere(null)
      return
    }
    let frame = 0
    const draw = (): void => {
      const at = player.current?.position() ?? null
      setHeardScene(at?.scene ?? null)
      if (at === null) setWhere(null)
      else {
        const name = scenes[at.scene]?.name ?? ''
        setWhere(
          at.pass === null
            ? BeatText.scenePosition(at.scene, name)
            : BeatText.chainPosition(at.scene, name, at.pass, at.passes ?? 1, at.step, at.steps),
        )
      }
      const g = shown?.group
      const here = at !== null && g !== undefined && at.scene === scene && at.tick >= 0
      setNowStep(here ? Math.floor((at.tick % g.length) / g.stepTicks) : null)
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [playing, shown, scene, scenes])

  // The chain playing: the grid follows the scene heard.
  useEffect(() => {
    if (chain && playing && heardScene !== null) setSelected(heardScene)
  }, [chain, playing, heardScene])

  /** A scene picked by hand: shown, and looped instead of the chain while it plays (as Arc turns its chain off). */
  function pick(i: number): void {
    setSelected(i)
    if (chain && playing) setMode('scene')
  }

  async function togglePlay(): Promise<void> {
    if (player.current?.playing) {
      player.current.stop()
      setPlaying(false)
      return
    }
    try {
      if (!player.current) {
        // Created on the tap: browsers only let a page start sound from a user gesture.
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctx) throw new Error('no Web Audio')
        player.current = new Player(new Synth(new Ctx({ latencyHint: 'interactive' })))
      }
      const p = player.current
      await p.resume()
      p.setSteps(steps, from)
      p.setTempo(tempo)
      p.setFx(fx)
      p.setFxOn(fxOn)
      p.audible = (pad) => audible(pad, muted, soloed)
      p.start()
      setAudioError(false)
      setPlaying(true)
    } catch {
      setAudioError(true)
    }
  }

  const toggle = (set: ReadonlySet<string>, pad: string): Set<string> => {
    const next = new Set(set)
    if (next.has(pad)) next.delete(pad)
    else next.add(pad)
    return next
  }

  const heard: string[] = []
  if (tempo !== (result.tempo ?? DEFAULT_TEMPO)) heard.push(BeatText.heardTempo(tempo))
  if (swing !== result.swing) heard.push(BeatText.heardSwing(swing))
  if (muted.size > 0) heard.push(BeatText.heardMuted([...muted]))
  if (soloed.size > 0) heard.push(BeatText.heardSolo([...soloed]))
  if (!fxOn && hasFx(fx)) heard.push(BeatText.HEARD_FX_OFF)
  if (many && !chain) heard.push(BeatText.heardScene(scene, sceneName))
  else if (chain && playing && heardScene !== null) {
    heard.push(BeatText.heardChain(heardScene, scenes[heardScene]?.name ?? ''))
  }

  return (
    <main class="beat" aria-label={BeatText.APP_NAME}>
      <header class="beat-head">
        <h1 class="beat-name">{result.name || BeatText.NO_NAME}</h1>
        <p class="beat-meta">
          {result.tempo !== null ? BeatText.bpm(result.tempo) : BeatText.NO_TEMPO}
          {' · '}
          {BeatText.SWING.toLowerCase()} {result.swing}
        </p>
      </header>

      {hasFx(fx) && (
        <div class={`beat-fx${fxOn ? '' : ' is-off'}`}>
          <button
            type="button"
            class={`beat-fx-switch${fxOn ? ' is-on' : ''}`}
            aria-pressed={fxOn}
            title={BeatText.FX_SWITCH}
            onClick={() => setFxOn(!fxOn)}
          >
            {BeatText.FX}
          </button>
          <p class="beat-fx-text">{BeatText.fxSummary(fx)}</p>
        </div>
      )}

      {!result.valid && <p class="beat-invalid" role="alert">{BeatText.INVALID}</p>}

      {playable && (
        <>
          <div class="beat-controls">
            <button
              type="button"
              class={`beat-play${playing ? ' is-on' : ''}`}
              aria-pressed={playing}
              onClick={() => void togglePlay()}
            >
              <span aria-hidden="true">{playing ? '■' : '▶'}</span> {playing ? BeatText.STOP : BeatText.PLAY}
            </button>
            <Slider
              id="beat-tempo"
              label={BeatText.TEMPO}
              min={TEMPO_MIN}
              max={TEMPO_MAX}
              value={tempo}
              text={BeatText.bpm(tempo)}
              onInput={setTempo}
            />
            <Slider
              id="beat-swing"
              label={BeatText.SWING}
              min={SWING_MIN}
              max={SWING_MAX}
              value={swing}
              text={String(swing)}
              onInput={setSwing}
            />
          </div>
          {audioError && <p class="beat-note" role="alert">{BeatText.NO_AUDIO}</p>}

          {many && (
            <Scenes
              scenes={scenes}
              selected={scene}
              heard={playing ? heardScene : null}
              mode={mode}
              where={where ?? (chain ? BeatText.chainOrder(result.chain) : BeatText.scenePosition(scene, sceneName))}
              onMode={setMode}
              onPick={pick}
            />
          )}

          {shown ? (
            <>
              <Tabs
                groups={groups}
                selected={groups.indexOf(shown)}
                carried={carried}
                onSelect={(i) => setTab(groups[i]!.group.group)}
              />
              <div
                class="beat-panel"
                role="tabpanel"
                id={`beat-panel-${shown.group.group}`}
                aria-labelledby={`beat-tab-${shown.group.group}`}
              >
                {shownFrom !== undefined && (
                  <p class="beat-note">
                    {BeatText.carried(shown.group.group, shownFrom, scenes[shownFrom]?.name ?? '')}
                  </p>
                )}
                <Grid
                  view={shown}
                  nowStep={nowStep}
                  muted={muted}
                  soloed={soloed}
                  onMute={(pad) => setMuted((m) => toggle(m, pad))}
                  onSolo={(pad) => setSoloed((s) => toggle(s, pad))}
                />
                {shown.notes > 0 && <p class="beat-note">{BeatText.notesPlayed(shown.notes)}</p>}
                {shownCard.notes.some((n) => n.group === shown.group.group && n.semi !== null) && (
                  <p class="beat-note">{BeatText.KEYS_NOTES}</p>
                )}
              </div>
            </>
          ) : (
            <p class="beat-note">{BeatText.EMPTY_SCENE}</p>
          )}
        </>
      )}

      <Problems title={BeatText.ERRORS} kind="error" problems={result.errors} open />
      <Problems title={BeatText.WARNINGS} kind="warning" problems={result.warnings} open={!result.valid} />

      <Actions
        card={props.card}
        name={result.name}
        errors={result.valid ? null : result.errors}
        heard={heard}
        canMessage={props.canMessage}
        sendMessage={props.sendMessage}
        copyText={props.copyText}
      />

      <p class="beat-foot">
        {BeatText.PREVIEW_NOTE}
        {hasFx(fx) && ` ${BeatText.FX_NOTE}`}
      </p>
    </main>
  )
}

function Slider(props: {
  id: string
  label: string
  min: number
  max: number
  value: number
  text: string
  onInput: (v: number) => void
}): JSX.Element {
  return (
    <div class="beat-slider">
      <label for={props.id}>{props.label}</label>
      <input
        id={props.id}
        type="range"
        min={props.min}
        max={props.max}
        step={1}
        value={props.value}
        aria-valuetext={props.text}
        onInput={(e) => props.onInput(Number((e.currentTarget as HTMLInputElement).value))}
      />
      <output for={props.id}>{props.text}</output>
    </div>
  )
}

/**
 * The scene strip: Chain or Scene, a chip per scene (pressed: shown; current:
 * heard), and where the chain is. Plain toggle buttons, so Tab and
 * Enter or Space reach and pick each one.
 */
function Scenes(props: {
  scenes: readonly BeatCardScene[]
  selected: number
  heard: number | null
  mode: Mode
  where: string
  onMode: (mode: Mode) => void
  onPick: (i: number) => void
}): JSX.Element {
  const modes: [Mode, string, string][] = [
    ['chain', BeatText.CHAIN, BeatText.CHAIN_TITLE],
    ['scene', BeatText.SCENE, BeatText.SCENE_TITLE],
  ]
  return (
    <section class="beat-scenes" aria-label={BeatText.SCENES}>
      <div class="beat-mode" role="group" aria-label={BeatText.PLAY_MODE}>
        {modes.map(([m, label, title]) => (
          <button
            key={m}
            type="button"
            class={`beat-mode-button${props.mode === m ? ' is-on' : ''}`}
            aria-pressed={props.mode === m}
            title={title}
            onClick={() => props.onMode(m)}
          >
            {label}
          </button>
        ))}
      </div>
      <div class="beat-scene-chips" role="group" aria-label={BeatText.SCENES}>
        {props.scenes.map((s) => {
          const on = s.index === props.selected
          const heard = s.index === props.heard
          return (
            <button
              key={s.index}
              type="button"
              class={`beat-scene${on ? ' is-on' : ''}${heard ? ' is-heard' : ''}`}
              aria-pressed={on}
              aria-current={heard ? 'true' : undefined}
              aria-label={BeatText.sceneChip(s.index, s.name)}
              title={BeatText.sceneChip(s.index, s.name)}
              onClick={() => props.onPick(s.index)}
            >
              <span class="beat-scene-number">{s.index + 1}</span>
              {s.name && <span class="beat-scene-name">{s.name}</span>}
            </button>
          )
        })}
      </div>
      <p class="beat-where">{props.where}</p>
    </section>
  )
}

function Tabs(props: {
  groups: readonly ViewGroup[]
  selected: number
  /** The scene, from 0, each carried group's pattern comes from. */
  carried: ReadonlyMap<string, number>
  onSelect: (i: number) => void
}): JSX.Element {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const n = props.groups.length
  const move = (i: number): void => {
    const to = (i + n) % n
    props.onSelect(to)
    refs.current[to]?.focus()
  }
  const onKey = (e: KeyboardEvent): void => {
    const keys: Record<string, number> = {
      ArrowRight: props.selected + 1,
      ArrowLeft: props.selected - 1,
      Home: 0,
      End: n - 1,
    }
    const to = keys[e.key]
    if (to === undefined) return
    e.preventDefault()
    move(to)
  }
  return (
    <div class="beat-tabs" role="tablist" aria-label={BeatText.GROUPS} onKeyDown={onKey}>
      {props.groups.map((v, i) => {
        const g = v.group
        const on = i === props.selected
        return (
          <button
            key={g.group}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`beat-tab-${g.group}`}
            aria-selected={on}
            aria-controls={`beat-panel-${g.group}`}
            tabIndex={on ? 0 : -1}
            class={`beat-tab${on ? ' is-on' : ''}`}
            onClick={() => props.onSelect(i)}
          >
            <span class="beat-tab-letter">{g.group}</span>
            <span class="beat-tab-info">{BeatText.groupTab(g.bars, g.step)}</span>
            {props.carried.has(g.group) && (
              <span class="beat-tab-from">{BeatText.fromScene(props.carried.get(g.group)!)}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** The row as the card writes it (X x o 1-9 - .), for screen readers. */
function rowPattern(view: ViewGroup, row: ViewRow): string {
  const g = view.group
  let text = ''
  let held = 0
  for (let k = 0; k < g.steps; k++) {
    if (k > 0 && k % g.stepsPerBar === 0) text += ' | '
    const v = row.vel[k] ?? 0
    if (v > 0) {
      text += v === 127 ? 'X' : v === 100 ? 'x' : v === 64 ? 'o' : String(Math.max(1, Math.min(9, Math.round(v / 14))))
      held = (row.len[k] ?? 1) - 1
    } else if (held > 0) {
      text += '-'
      held--
    } else text += (row.noteVel[k] ?? 0) > 0 ? 'n' : '.'
  }
  return text
}

function Grid(props: {
  view: ViewGroup
  nowStep: number | null
  muted: ReadonlySet<string>
  soloed: ReadonlySet<string>
  onMute: (pad: string) => void
  onSolo: (pad: string) => void
}): JSX.Element {
  const g = props.view.group
  const perBeat = TICKS_PER_BEAT / g.stepTicks
  const lineClass = (k: number): string =>
    k % g.stepsPerBar === 0 ? ' at-bar' : Number.isInteger(perBeat) && k % perBeat === 0 ? ' at-beat' : ''
  const style = { '--steps': String(g.steps) } as CSSProperties
  const ruler: JSX.Element[] = []
  for (let k = 0; k < g.steps; k++) {
    const bar = k % g.stepsPerBar === 0 ? String(k / g.stepsPerBar + 1) : ''
    ruler.push(
      <span key={k} class={`beat-tick${lineClass(k)}${props.nowStep === k ? ' is-now' : ''}`}>
        {bar}
      </span>,
    )
  }
  return (
    // Focusable so the keyboard can scroll a long pattern sideways.
    <div class="beat-grid-scroll" role="region" tabIndex={0} aria-label={BeatText.GRID}>
      <div class="beat-grid" style={style}>
        <div class="beat-row beat-ruler" aria-hidden="true">
          <span class="beat-row-head" />
          <span class="beat-cells">{ruler}</span>
        </div>
        <ul class="beat-rows">
          {props.view.rows.map((row) => {
            const isMuted = props.muted.has(row.pad)
            const isSolo = props.soloed.has(row.pad)
            const silent = !audible(row.pad, props.muted, props.soloed)
            const label = row.notesOnly ? BeatText.NOTES_ROW : row.label
            return (
              <li key={row.key} class={`beat-row${silent ? ' is-silent' : ''}`} data-pad={row.pad}>
                <span class="beat-row-head">
                  <span class="beat-pad">{row.pad}</span>
                  <span class={`beat-label${row.notesOnly ? ' is-notes' : ''}`} title={label}>
                    {label}
                  </span>
                  {row.shaping && (
                    // After the label for screen readers; on a line of its own under the head (beat.css).
                    <span
                      class="beat-shape"
                      role="img"
                      aria-label={BeatText.shapeText(row.shaping)}
                      title={BeatText.shapeText(row.shaping)}
                    >
                      {BeatText.shapeBadge(row.shaping)}
                    </span>
                  )}
                  <button
                    type="button"
                    class={`beat-ms beat-mute${isMuted ? ' is-on' : ''}`}
                    aria-pressed={isMuted}
                    aria-label={BeatText.mute(row.pad, label)}
                    onClick={() => props.onMute(row.pad)}
                  >
                    {BeatText.MUTE}
                  </button>
                  <button
                    type="button"
                    class={`beat-ms beat-solo${isSolo ? ' is-on' : ''}`}
                    aria-pressed={isSolo}
                    aria-label={BeatText.solo(row.pad, label)}
                    onClick={() => props.onSolo(row.pad)}
                  >
                    {BeatText.SOLO}
                  </button>
                </span>
                <span class="beat-cells" role="img" aria-label={`${row.pad} ${label}: ${rowPattern(props.view, row)}`}>
                  {cells(props.view, row, lineClass)}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

/** A row's cells: a hit spans its held steps; rests and note marks are one step each. */
function cells(view: ViewGroup, row: ViewRow, lineClass: (k: number) => string): JSX.Element[] {
  const g = view.group
  const out: JSX.Element[] = []
  for (let k = 0; k < g.steps; ) {
    const vel = row.vel[k] ?? 0
    if (vel > 0) {
      const span = Math.max(1, Math.min(row.len[k] ?? 1, g.steps - k))
      out.push(
        <span
          key={k}
          class={`beat-cell is-hit${span > 1 ? ' is-held' : ''}${lineClass(k)}`}
          data-step={k}
          style={{ gridColumn: `${k + 1} / span ${span}`, '--v': (vel / 127).toFixed(3) } as CSSProperties}
        />,
      )
      k += span
    } else {
      const note = row.noteVel[k] ?? 0
      out.push(
        <span
          key={k}
          class={`beat-cell${note > 0 ? ' is-note' : ''}${lineClass(k)}`}
          data-step={k}
          style={note > 0 ? ({ '--v': (note / 127).toFixed(3) } as CSSProperties) : undefined}
        />,
      )
      k++
    }
  }
  return out
}

function Problems(props: {
  title: string
  kind: 'error' | 'warning'
  problems: readonly BeatCardProblem[]
  open: boolean
}): JSX.Element | null {
  if (props.problems.length === 0) return null
  return (
    <details class={`beat-problems is-${props.kind}`} open={props.open}>
      <summary>
        {props.title} ({props.problems.length})
      </summary>
      <ul>
        {props.problems.map((p, i) => (
          <li key={i}>
            <span class="beat-line">{BeatText.line(p.line)}</span> {p.msg}
          </li>
        ))}
      </ul>
    </details>
  )
}

function Actions(props: {
  card: string | null
  name: string
  /** The card's errors when it can't be read, else null (Fix errors in place of Improve). */
  errors: readonly BeatCardProblem[] | null
  heard: readonly string[]
  canMessage: boolean
  sendMessage: (text: string) => Promise<boolean>
  copyText: (text: string) => Promise<boolean>
}): JSX.Element {
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle')
  const [asking, setAsking] = useState(false)
  const [request, setRequest] = useState('')
  const [sent, setSent] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle')
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (copy === 'failed') area.current?.select()
  }, [copy])

  async function onCopy(): Promise<void> {
    if (props.card === null) return
    setCopy((await props.copyText(props.card)) ? 'done' : 'failed')
  }

  const sending = sent === 'sending'

  /** Sends one message to Claude; every button waits while one is on its way. */
  async function send(text: string): Promise<boolean> {
    if (sending) return false
    setSent('sending')
    const ok = await props.sendMessage(text)
    setSent(ok ? 'done' : 'failed')
    return ok
  }

  // No <form>: hosts sandbox the view without allow-forms, which blocks submit events.
  async function onSend(): Promise<void> {
    if (!request.trim()) return
    if (await send(BeatText.askMessage(props.name, request, [...props.heard]))) setRequest('')
  }

  const status =
    sent === 'done' ? (
      <p class="beat-note" role="status">
        {BeatText.SENT}
      </p>
    ) : sent === 'failed' ? (
      <p class="beat-note" role="alert">
        {BeatText.ASK_FAILED}
      </p>
    ) : null

  return (
    <section class="beat-actions">
      <div class="beat-buttons">
        {props.canMessage && (
          <>
            <button
              type="button"
              class="beat-button"
              disabled={sending}
              onClick={() => void send(BeatText.regenerateMessage(props.name, [...props.heard]))}
            >
              {BeatText.REGENERATE}
            </button>
            {props.errors !== null ? (
              <button
                type="button"
                class="beat-button"
                disabled={sending}
                onClick={() => void send(BeatText.fixMessage(props.name, props.errors ?? []))}
              >
                {BeatText.FIX}
              </button>
            ) : (
              <button
                type="button"
                class="beat-button"
                disabled={sending}
                onClick={() => void send(BeatText.improveMessage(props.name, [...props.heard]))}
              >
                {BeatText.IMPROVE}
              </button>
            )}
          </>
        )}
        <button
          type="button"
          class="beat-button"
          aria-expanded={asking}
          aria-controls="beat-ask"
          onClick={() => setAsking(!asking)}
        >
          {BeatText.ASK}
        </button>
        <button type="button" class="beat-button" disabled={props.card === null} onClick={() => void onCopy()}>
          {copy === 'done' ? BeatText.COPIED : BeatText.COPY}
        </button>
      </div>
      {!asking && status}
      {copy === 'failed' && props.card !== null && (
        <div class="beat-copy-fallback">
          <p class="beat-note" role="status">
            {BeatText.COPY_FAILED}
          </p>
          <textarea ref={area} readOnly rows={8} aria-label={BeatText.CARD_TEXT} value={props.card} />
        </div>
      )}
      {asking && (
        <div id="beat-ask" class="beat-ask" role="group" aria-label={BeatText.ASK}>
          {props.canMessage ? (
            <>
              <div class="beat-chips" role="group" aria-label={BeatText.TWEAKS_LABEL}>
                {BeatText.TWEAKS.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    class="beat-chip"
                    aria-label={BeatText.tweakAria(t.request)}
                    disabled={sending}
                    onClick={() => void send(BeatText.askMessage(props.name, t.request, [...props.heard]))}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <label for="beat-ask-text">{BeatText.ASK_LABEL}</label>
              <div class="beat-ask-row">
                <input
                  id="beat-ask-text"
                  type="text"
                  value={request}
                  placeholder={BeatText.ASK_PLACEHOLDER}
                  onInput={(e) => setRequest((e.currentTarget as HTMLInputElement).value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void onSend()
                  }}
                />
                <button
                  type="button"
                  class="beat-button"
                  disabled={!request.trim() || sending}
                  onClick={() => void onSend()}
                >
                  {BeatText.SEND}
                </button>
              </div>
              {status}
            </>
          ) : (
            <p class="beat-note">{BeatText.NO_MESSAGE}</p>
          )}
        </div>
      )}
    </section>
  )
}
