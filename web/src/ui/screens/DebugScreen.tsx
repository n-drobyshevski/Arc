// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/DebugScreen.kt
//
// Hidden debug screen (long-press the wordmark, or Settings > Debug log):
// every SysEx message in and out, for diagnosing the first runs on real
// hardware. Export gives the full bytes as a text file.
//
// Web deltas:
// - log.version (a StateFlow) is log.subscribe(); bursts of messages are
//   drawn once per animation frame.
// - LazyColumn is a plain scrolling list: each line is memoised by entry and
//   keyed by a stable id (the ring buffer drops its oldest entries, so an index
//   key would redraw every line).
import { Component, type JSX } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { describe, type TrafficEntry, type TrafficLog } from '../../core/protocol/trafficLog'
import { Strings } from '../../core/text/strings'
import { toHex } from '../../core/util/bytes'
import { ChoiceRow } from '../components/ChoiceRow'
import { Key } from '../components/Key'
import './DebugScreen.css'

export interface DebugScreenProps {
  log: TrafficLog
  /** These three need the tap's user activation. */
  onShare: () => void
  onSave: () => void
  onCopy: () => void
  onBack: () => void
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
