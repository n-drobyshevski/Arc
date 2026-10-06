// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/DebugScreen.kt
//
// Hidden debug screen (long-press the section tag, or Settings > Debug log):
// every SysEx message in and out, for diagnosing the first runs on real
// hardware. Export gives the full bytes as a text file.
//
// Web deltas:
// - log.version (a StateFlow) is log.subscribe(); bursts of messages are
//   drawn once per animation frame.
// - LazyColumn is a plain scrolling list: each line is memoised by entry and
//   keyed by a stable id (the ring buffer drops its oldest entries, so an index
//   key would redraw every line).
// - The latency test ([LatencyPanel], LatencyText) folds under a disclosure
//   above the log switch, so the log keeps its room (Android: a header row
//   that swaps the log for the panel); it opens as it was last left in this
//   page, with the how-to (Android's header note) at its top. Its choice is
//   the output's latencyHint (Android: the audio engine), and each row's
//   estimate is the base plus output delay the browser reported
//   (LatencyText.webEstimate; Android: buffer ÷ rate).
// - Each engine's row is a small display panel, and "In use" a signal-coloured
//   tag on it (Android: plain rows on one plate, the caps in signal ink).
import { Component, type JSX } from 'preact'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { LatencySummary } from '../../core/features/latencyStats'
import { describe, type TrafficEntry, type TrafficLog } from '../../core/protocol/trafficLog'
import { LatencyText, WEB_LATENCY_HINTS, type WebLatencyHint } from '../../core/text/latencyText'
import { Strings } from '../../core/text/strings'
import { toHex } from '../../core/util/bytes'
import type { LiveEngineInfo } from '../../state/deps'
import { latencyRows, type LiveLatency } from '../../state/live'
import { ChoiceRow } from '../components/ChoiceRow'
import { Key } from '../components/Key'
import { Disclosure } from '../components/SettingRow'
import './DebugScreen.css'

/** The latency test's numbers and controls (the controller's liveLatency, liveEngine and liveLatencyHint). */
export interface LatencyPanelProps {
  latency: LiveLatency
  /** The row of the output Live plays through now, once it is set up. */
  inUse: string | null
  /** The latencyHint choice; null where the output has none (no choice shown). */
  hint: WebLatencyHint | null
  onHint: (hint: WebLatencyHint) => void
  onReset: () => void
}

export interface DebugScreenProps {
  log: TrafficLog
  /** These three need the tap's user activation. */
  onShare: () => void
  onSave: () => void
  onCopy: () => void
  onBack: () => void
  /** The latency test; absent, none. */
  latency?: LatencyPanelProps
}

/** Bytes shown per message before " … (+n)". */
export const SHOWN_BYTES = 64

const two = (n: number): string => String(n).padStart(2, '0')

/** DateTimeFormatter "HH:mm:ss.SSS" in the local zone. */
export function clockTime(ms: number): string {
  const d = new Date(ms)
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

/** One list line: "HH:mm:ss.SSS OUT|IN |--  body" (a message's body is its summary, a newline, its hex). */
export function logLine(e: TrafficEntry, time: (ms: number) => string = clockTime): string {
  const head = e.dir === 'OUT' ? 'OUT' : e.dir === 'IN' ? 'IN ' : '-- '
  let body: string
  if (e.dir === 'NOTE') {
    body = e.note ?? ''
  } else {
    const b = e.bytes
    const shown = b.length > SHOWN_BYTES
      ? `${toHex(b.subarray(0, SHOWN_BYTES))} … (+${b.length - SHOWN_BYTES})`
      : toHex(b)
    body = `${describe(b)}\n${shown}`
  }
  return `${time(e.time)} ${head} ${body}`
}

/** Stable keys for entries (they carry no id of their own). */
const ids = new WeakMap<TrafficEntry, number>()
let nextId = 1
function idOf(e: TrafficEntry): number {
  let id = ids.get(e)
  if (id === undefined) {
    id = nextId++
    ids.set(e, id)
  }
  return id
}

export function DebugScreen(props: DebugScreenProps): JSX.Element {
  const { log } = props
  const [version, setVersion] = useState(log.version)
  const [logging, setLogging] = useState(log.enabled)
  const list = useRef<HTMLDivElement | null>(null)
  const root = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let frame = 0
    const off = log.subscribe(() => {
      if (frame !== 0) return
      const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f: () => void) => setTimeout(f, 16) as unknown as number
      frame = raf(() => {
        frame = 0
        setVersion(log.version)
      })
    })
    // Anything logged between the first render and the subscription.
    setVersion(log.version)
    return () => {
      off()
      if (frame !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
    }
  }, [log])

  const entries = useMemo(() => log.snapshot(), [log, version])

  // Focus moves onto the screen when it opens (no ring: nothing was picked yet).
  useLayoutEffect(() => {
    root.current?.focus({ preventScroll: true })
  }, [])

  // LaunchedEffect(entries.size): keep the newest line in view. A full ring
  // keeps its size, so then it follows only while the list was at the bottom.
  const seen = useRef({ length: -1, height: 0 })
  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    const prev = seen.current
    const atBottom = el.scrollTop + el.clientHeight >= prev.height - 8
    if (entries.length > 0 && (entries.length !== prev.length || atBottom)) el.scrollTop = el.scrollHeight
    seen.current = { length: entries.length, height: el.scrollHeight }
  }, [entries])

  return (
    <div ref={root} class="debug" data-screen="debug" tabIndex={-1} aria-labelledby="debug-title">
      <div class="debug__head">
        <h1 id="debug-title" class="t-heading debug__title">{Strings.DEBUG_TITLE}</h1>
        <Key text={Strings.DONE} size="small" variant="quiet" onClick={props.onBack} />
      </div>
      {props.latency && <LatencyPanel {...props.latency} />}
      <ChoiceRow
        text={Strings.DEBUG_TOGGLE}
        selected={logging}
        radio={false}
        trailing={String(entries.length)}
        onClick={() => {
          const on = !logging
          setLogging(on)
          log.enabled = on
        }}
      />
      <div class="debug__keys">
        <Key text={Strings.DEBUG_SHARE} size="small" block onClick={props.onShare} />
        <Key text={Strings.DEBUG_SAVE} size="small" block onClick={props.onSave} />
      </div>
      <div class="debug__keys">
        <Key text={Strings.DEBUG_COPY} size="small" block onClick={props.onCopy} />
        <Key text={Strings.DEBUG_CLEAR} size="small" block onClick={() => log.clear()} />
      </div>
      <div
        ref={list}
        class="debug__list"
        role="log"
        aria-label={Strings.DEBUG_TITLE}
        aria-live="off"
        tabIndex={0}
      >
        {entries.length === 0 && <p class="t-small debug__empty">{Strings.DEBUG_EMPTY}</p>}
        {entries.map((e) => <Line key={idOf(e)} entry={e} />)}
      </div>
    </div>
  )
}

/** Whether the latency test was left open, for the next time the screen opens (this page only). */
let latencyOpen = false

/**
 * The latency test: how to run it, the latencyHint choice, then one row per
 * engine opened this session (its label, median / best / worst and count, and
 * what its output reported), what the times measure, and Reset.
 */
export function LatencyPanel(props: LatencyPanelProps): JSX.Element {
  const { latency, inUse, hint } = props
  const id = useId()
  const rows = latencyRows(latency)
  return (
    <Disclosure title={LatencyText.TITLE} class="debug__latency" initialOpen={latencyOpen} onToggle={(open) => (latencyOpen = open)}>
      <p>{LatencyText.HOW_TO}</p>
      {hint !== null && (
        <div class="debug__engine-choice" role="radiogroup" aria-labelledby={`${id}-e`} aria-describedby={`${id}-n`}>
          <span id={`${id}-e`} class="debug__label">{LatencyText.ENGINE}</span>
          <span id={`${id}-n`} class="debug__note">{LatencyText.ENGINE_NOTE}</span>
          {WEB_LATENCY_HINTS.map((h) => (
            <ChoiceRow key={h} text={LatencyText.hint(h)} selected={h === hint} radio name={`${id}-hint`} onClick={() => props.onHint(h)} />
          ))}
          <span class="debug__note">{LatencyText.hintNote(hint)}</span>
        </div>
      )}
      {rows.length === 0 ? (
        <p class="debug__empty-rows">{LatencyText.NO_PRESSES}</p>
      ) : (
        <ul class="debug__engines" aria-label={LatencyText.TITLE}>
          {rows.map((label) => (
            <EngineRow
              key={label}
              label={label}
              row={latency.stats.summary(label)}
              info={latency.engines.get(label) ?? null}
              inUse={label === inUse}
            />
          ))}
        </ul>
      )}
      <p>{LatencyText.MEASURES}</p>
      <Key text={LatencyText.RESET} size="small" variant="quiet" disabled={latency.stats.isEmpty} onClick={props.onReset} />
    </Disclosure>
  )
}

/** One engine's row: its label (and "In use"), its numbers (none before a press), and the delay its output reported. */
function EngineRow(props: { label: string; row: LatencySummary | null; info: LiveEngineInfo | null; inUse: boolean }): JSX.Element {
  const { row, info } = props
  return (
    <li class="debug__engine">
      <span class="debug__engine-head">
        <span class="debug__engine-name">{props.label}</span>
        {props.inUse && <span class="debug__tag">{LatencyText.IN_USE}</span>}
      </span>
      {row === null ? (
        <span class="debug__note">{LatencyText.NO_PRESSES}</span>
      ) : (
        <>
          <span class="debug__stats" aria-hidden="true">{LatencyText.stats(row.median, row.best, row.worst, row.count)}</span>
          <span class="sr-only">{LatencyText.statsDescription(row.median, row.best, row.worst, row.count)}</span>
        </>
      )}
      {info && <span class="debug__note">{LatencyText.webEstimate(info.baseMs, info.outputMs)}</span>}
    </li>
  )
}

/** One message; entries never change, so a line is drawn once. */
class Line extends Component<{ entry: TrafficEntry }> {
  override shouldComponentUpdate(next: { entry: TrafficEntry }): boolean {
    return next.entry !== this.props.entry
  }

  override render(): JSX.Element {
    const e = this.props.entry
    return <p class={`debug__line debug__line--${e.dir.toLowerCase()}`}>{logLine(e)}</p>
  }
}
