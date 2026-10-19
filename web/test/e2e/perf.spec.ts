// Performance harness for the desk (web only, tagged @perf): the default run leaves
// it out (playwright.config.ts). Run it with
//
//   PERF=1 CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test perf.spec.ts
//
// Each scenario (S1..S7) runs in ?demo at 1440x900, on the drawn EP-133 and on the
// grid (gridOnDesk), unthrottled and at 4x CPU throttling (CDP), and writes its
// JSON summary to PERF_OUT (default <tmp>/arc-perf) as <id>-<view>-<cpu>x.json;
// summary.json then gathers every run in that folder (a fresh folder per run).
// Setup runs unthrottled; only the measured windows are throttled (S5's whole cold
// start is).
//
// Collected before the app loads ([collectors]): Event Timing (pointerdown,
// pointerup and keydown over 16 ms), long animation frames and long tasks, every
// press's input delay (its timeStamp to the first listener), its handling and the
// time to the frame after it, MessagePort posts by `t`, setItem, rAF, setTimeout
// (the app's and the demo device's apart) and clearTimeout calls, and IndexedDB
// gets by store (a 'files' get is a whole .pak read, as each openPak needs). The
// app's own (dev/perf.ts, `window.__arcPerf`): renders by component, mirror
// publishes, voice changes, what goes to Live's mixer, press-to-sound. S1 and S2
// also take a Chrome trace (PERF_TRACE=0: none).
//
// Each summary names the mixer's engine: the AudioWorklet, or the ScriptProcessor
// fallback, which mixes on the main thread and sends no MessagePort posts (the
// mixer counts are taken at Live's link to it, so they hold for both). Headless
// Chromium plays to a fake output: press-to-sound is not a speaker's time, but
// before and after compare.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Browser, CDPSession, Page } from '@playwright/test'
import { FeatureText } from '../../src/core/text/featureText'
import { LatencyText } from '../../src/core/text/latencyText'
import type { ArcPerf } from '../../src/dev/perf'
import { NUMPAD_OFFSET } from '../../src/ui/live/liveKeyboard'
import { SAMPLE_PAK, demo, expect, gridOnDesk, importPak, openSettings, test } from './fixtures'

const OUT = process.env.PERF_OUT || path.join(os.tmpdir(), 'arc-perf')
const TRACE = process.env.PERF_TRACE !== '0'
/** PERF_TRACES=1 also keeps each raw trace beside the summaries (<id>-<view>-<cpu>x-<window>.trace.json), to open in DevTools. */
const KEEP_TRACES = process.env.PERF_TRACES === '1'
const VIEWS = ['device', 'grid'] as const
const CPUS = [1, 4] as const

type View = (typeof VIEWS)[number]

interface Run {
  readonly page: Page
  readonly browser: Browser
  readonly cdp: CDPSession
  readonly view: View
  readonly cpu: number
  readonly id: string
}

// ---------- in the page ----------

interface InputRec {
  type: string
  /** The event's timeStamp, from the window's start. */
  at: number
  /** timeStamp to the first listener. */
  delay: number
  /** The first listener to the last (window, bubbling); -1 when propagation stopped. */
  proc: number
  /** timeStamp to the task after the next frame. */
  frame: number
}

interface PageStats {
  t0: number
  events: { name: string; at: number; delay: number; proc: number; dur: number }[]
  inputs: InputRec[]
  loafs: { at: number; dur: number; blocking: number; scripts: string[] }[]
  longtasks: { at: number; dur: number }[]
  ports: Record<string, number>
  portLoadBytes: number
  calls: { setItem: number; raf: number; setTimeout: number; demoTimeout: number; clearTimeout: number }
  idbGets: Record<string, number>
}

interface PageHandle {
  readonly stats: PageStats
  readonly raw: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
  reset(): void
  snapshot(): PageStats & { marks: string[] }
}

declare global {
  interface Window {
    __arcPage?: PageHandle
    __arcPerfLoop?: ReturnType<typeof setTimeout>
  }
}

/** Installed with addInitScript, before any of the page's scripts (self-contained: it is sent as text). */
function collectors(): void {
  const raw = {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    raf: window.requestAnimationFrame.bind(window),
    post: MessagePort.prototype.postMessage,
  }
  const fresh = (): PageStats => ({
    t0: performance.now(),
    events: [],
    inputs: [],
    loafs: [],
    longtasks: [],
    ports: {},
    portLoadBytes: 0,
    calls: { setItem: 0, raf: 0, setTimeout: 0, demoTimeout: 0, clearTimeout: 0 },
    idbGets: {},
  })
  let s = fresh()
  // From navigation: S5 reads the cold start as it loaded.
  s.t0 = 0
  const handle: PageHandle = {
    get stats() {
      return s
    },
    raw: { setTimeout: raw.setTimeout as typeof setTimeout, clearTimeout: raw.clearTimeout },
    reset() {
      s = fresh()
    },
    snapshot() {
      const marks = performance
        .getEntriesByType('mark')
        .filter((m) => m.startTime >= s.t0)
        .map((m) => m.name)
      return JSON.parse(JSON.stringify({ ...s, marks })) as PageStats & { marks: string[] }
    },
  }
  window.__arcPage = handle

  const timed = new Set(['pointerdown', 'pointerup', 'keydown'])
  const observe = (type: string, opts: Record<string, unknown>, fn: (e: PerformanceEntry) => void): void => {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) return
    new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({ type, ...opts } as PerformanceObserverInit)
  }
  observe('event', { durationThreshold: 16, buffered: true }, (e) => {
    const t = e as PerformanceEventTiming
    if (!timed.has(t.name) || t.startTime < s.t0) return
    s.events.push({ name: t.name, at: t.startTime - s.t0, delay: t.processingStart - t.startTime, proc: t.processingEnd - t.processingStart, dur: t.duration })
  })
  observe('long-animation-frame', { buffered: true }, (e) => {
    if (e.startTime < s.t0) return
    const f = e as PerformanceEntry & { blockingDuration: number; scripts: { sourceFunctionName: string; invoker: string; duration: number }[] }
    const scripts = f.scripts.filter((x) => x.duration >= 5).map((x) => x.sourceFunctionName || x.invoker || '?')
    s.loafs.push({ at: e.startTime - s.t0, dur: e.duration, blocking: f.blockingDuration, scripts })
  })
  observe('longtask', { buffered: true }, (e) => {
    if (e.startTime >= s.t0) s.longtasks.push({ at: e.startTime - s.t0, dur: e.duration })
  })

  // Presses: before any of the app's listeners, and after them (bubbling to the window).
  const pending = new WeakMap<Event, { rec: InputRec; start: number }>()
  for (const type of ['pointerdown', 'keydown']) {
    window.addEventListener(
      type,
      (e) => {
        const start = performance.now()
        const rec: InputRec = { type, at: e.timeStamp - s.t0, delay: start - e.timeStamp, proc: -1, frame: -1 }
        s.inputs.push(rec)
        pending.set(e, { rec, start })
        raw.raf(() => {
          const ch = new MessageChannel()
          ch.port1.onmessage = () => {
            rec.frame = performance.now() - e.timeStamp
            ch.port1.close()
          }
          raw.post.call(ch.port2, 0)
        })
      },
      { capture: true },
    )
    window.addEventListener(type, (e) => {
      const p = pending.get(e)
      if (p) p.rec.proc = performance.now() - p.start
    })
  }

  // What goes over MessagePorts (the worklet node's port among them), by `t`.
  MessagePort.prototype.postMessage = function (this: MessagePort, message: unknown, ...rest: unknown[]) {
    const m = message as { t?: unknown; pcm?: { byteLength?: number } } | null
    const t = m !== null && typeof m === 'object' && typeof m.t === 'string' ? m.t : '?'
    s.ports[t] = (s.ports[t] ?? 0) + 1
    if (t === 'load') s.portLoadBytes += m?.pcm?.byteLength ?? 0
    return (raw.post as (this: MessagePort, ...a: unknown[]) => void).call(this, message, ...rest)
  } as typeof MessagePort.prototype.postMessage

  const setItem = Storage.prototype.setItem
  Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
    s.calls.setItem++
    setItem.call(this, key, value)
  }
  window.requestAnimationFrame = (cb) => {
    s.calls.raf++
    return raw.raf(cb)
  }
  // The demo device's timers (its clock ticks, its message queue) apart from the app's.
  const demoChunk = /\/demo-[\w-]+\.js/
  window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    if (demoChunk.test(new Error().stack ?? '')) s.calls.demoTimeout++
    else s.calls.setTimeout++
    return raw.setTimeout(handler, timeout, ...args)
  }) as typeof setTimeout
  window.clearTimeout = (id) => {
    s.calls.clearTimeout++
    raw.clearTimeout(id)
  }
  const get = IDBObjectStore.prototype.get
  IDBObjectStore.prototype.get = function (this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
    s.idbGets[this.name] = (s.idbGets[this.name] ?? 0) + 1
    return get.call(this, query)
  }
}

// ---------- the numbers ----------

const round = (n: number, d = 1): number => Math.round(n * 10 ** d) / 10 ** d

function pct(xs: readonly number[], p: number): number | null {
  if (xs.length === 0) return null
  const a = [...xs].sort((x, y) => x - y)
  return round(a[Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1))]!)
}

const spread = (xs: readonly number[]) => ({ n: xs.length, p50: pct(xs, 50), p95: pct(xs, 95), max: pct(xs, 100) })

function top(counts: Record<string, number>, n: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n),
  )
}

/** The components the plan follows, whether they rendered or not. */
const FOLLOWED = ['Root', 'NavRail', 'TopBar', 'TabScreen', 'MirrorScreen', 'DeviceView', 'PianoKeyboard', 'SoundPicker', 'Sheet']

/** The followed components and the dozen that rendered most, for the rates. */
const rated = (renders: Record<string, number>): Record<string, number> => ({
  ...Object.fromEntries(FOLLOWED.map((k) => [k, renders[k] ?? 0])),
  ...top(renders, 12),
})

const per = (counts: Record<string, number>, by: number): Record<string, number> =>
  Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, round(v / by, 2)]))

interface Snapshot {
  /** performance.now() when it was taken. */
  at: number
  page: PageStats & { marks: string[] }
  app: Omit<ArcPerf, 'reset'>
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => ({
    at: performance.now(),
    page: window.__arcPage!.snapshot(),
    app: JSON.parse(JSON.stringify(window.__arcPerf)) as Omit<ArcPerf, 'reset'>,
  }))
}

/** One measured window's summary. [hits]: the presses made in it, for per-hit numbers. */
function summary(s: Snapshot, seconds: number, hits = 0, trace: TraceSummary | null = null) {
  const { page: p, app } = s
  const presses = p.inputs.filter((i) => i.type === 'pointerdown' || i.type === 'keydown')
  const slow = (name: string) => {
    const es = p.events.filter((e) => e.name === name)
    return { n: es.length, dur: spread(es.map((e) => e.dur)), delayMax: pct(es.map((e) => e.delay), 100) }
  }
  const scripts: Record<string, number> = {}
  for (const f of p.loafs) for (const x of f.scripts) scripts[x] = (scripts[x] ?? 0) + 1
  const marks: Record<string, number> = {}
  for (const m of p.marks) marks[m] = (marks[m] ?? 0) + 1
  return {
    seconds: round(seconds, 2),
    engine: app.engine,
    hits,
    publishes: app.publishes,
    publishesPerSec: round(app.publishes / seconds, 2),
    keysPadChanges: app.keysPad,
    voiceChanges: app.voices,
    stateChanges: app.states,
    renders: top(app.renders, 40),
    rendersPerSec: per(rated(app.renders), seconds),
    rendersPerPublish: app.publishes > 0 ? per(rated(app.renders), app.publishes) : null,
    rendersPerHit: hits > 0 ? per(rated(app.renders), hits) : null,
    rendersPerVoiceChange: app.voices > 0 ? per(rated(app.renders), app.voices) : null,
    input: {
      delay: spread(presses.map((i) => i.delay)),
      proc: spread(presses.filter((i) => i.proc >= 0).map((i) => i.proc)),
      frame: spread(presses.filter((i) => i.frame >= 0).map((i) => i.frame)),
      each: presses.slice(0, 6).map((i) => ({ type: i.type, at: round(i.at), delay: round(i.delay), proc: round(i.proc), frame: round(i.frame) })),
    },
    eventTiming: { pointerdown: slow('pointerdown'), pointerup: slow('pointerup'), keydown: slow('keydown') },
    longFrames: {
      n: p.loafs.length,
      blockingMs: round(p.loafs.reduce((a, f) => a + f.blocking, 0)),
      maxMs: pct(p.loafs.map((f) => f.dur), 100),
      scripts: top(scripts, 8),
    },
    longTasks: { n: p.longtasks.length, totalMs: round(p.longtasks.reduce((a, t) => a + t.dur, 0)), maxMs: pct(p.longtasks.map((t) => t.dur), 100) },
    mixer: { perSec: per(app.mixer, seconds), counts: app.mixer, loadBytes: app.loadBytes },
    ports: { perSec: per(p.ports, seconds), loadBytes: p.portLoadBytes },
    callsPerSec: per(p.calls, seconds),
    idbGets: p.idbGets,
    marks,
    pressToSound: spread(app.heard.map((h) => h.ms)),
    trace,
  }
}

type Phase = ReturnType<typeof summary>

// ---------- the trace ----------

interface TraceEvent {
  name: string
  ph: string
  pid: number
  tid: number
  ts: number
  dur?: number
  args?: { name?: string; data?: { functionName?: string; url?: string; lineNumber?: number } }
}

const CATEGORIES = [
  'toplevel',
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'blink.user_timing',
  'v8',
  'disabled-by-default-v8.gc',
  'audio',
]

/** The main thread's tasks, its scripts' self time, paint and raster, and GC by thread. */
function traceSummary(buf: Buffer, seconds: number) {
  const events = (JSON.parse(buf.toString('utf8')) as { traceEvents: TraceEvent[] }).traceEvents
  const thread = (e: TraceEvent): string => `${e.pid}:${e.tid}`
  const names = new Map<string, string>()
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name' && e.args?.name) names.set(thread(e), e.args.name)
  // The page's main thread: the renderer main with the most tasks.
  const tasks = new Map<string, number>()
  for (const e of events) if (e.name === 'RunTask' && names.get(thread(e)) === 'CrRendererMain') tasks.set(thread(e), (tasks.get(thread(e)) ?? 0) + 1)
  const main = [...tasks.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const ms = (e: TraceEvent): number => (e.dur ?? 0) / 1000
  const onMain = events.filter((e) => e.ph === 'X' && thread(e) === main).sort((a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0))
  const run = onMain.filter((e) => e.name === 'RunTask').map(ms)

  // Self time: each event's duration less its children's, on the main thread.
  const self: Record<string, number> = {}
  const stack: { end: number; e: TraceEvent; child: number }[] = []
  const done = (f: { e: TraceEvent; child: number }): void => {
    if (f.e.name !== 'FunctionCall') return
    const d = f.e.args?.data
    const url = (d?.url ?? '').replace(/^.*\//, '')
    const key = `${d?.functionName || '(anonymous)'} ${url}:${d?.lineNumber ?? '?'}`
    self[key] = (self[key] ?? 0) + Math.max(0, (f.e.dur ?? 0) - f.child) / 1000
  }
  for (const e of onMain) {
    while (stack.length > 0 && stack[stack.length - 1]!.end <= e.ts) done(stack.pop()!)
    const parent = stack[stack.length - 1]
    if (parent) parent.child += e.dur ?? 0
    stack.push({ end: e.ts + (e.dur ?? 0), e, child: 0 })
  }
  while (stack.length > 0) done(stack.pop()!)

  const sum = (name: string, where: (e: TraceEvent) => boolean = () => true) => {
    const es = events.filter((e) => e.ph === 'X' && e.name === name && where(e))
    return { n: es.length, ms: round(es.reduce((a, e) => a + ms(e), 0)) }
  }
  // Frames: the main thread's commits to the compositor.
  const frames = onMain.filter((e) => e.name === 'Commit').length
  const gc: Record<string, number> = {}
  for (const e of events) {
    if (!/^(MinorGC|MajorGC|V8\.GC_SCAVENGER|V8\.GC_MARK_COMPACTOR)$/.test(e.name) || (e.ph !== 'X' && e.ph !== 'B')) continue
    const key = `${names.get(thread(e)) ?? thread(e)} ${e.name}`
    gc[key] = (gc[key] ?? 0) + 1
  }
  const worklet = [...new Set(names.values())].filter((n) => /worklet/i.test(n))
  const paint = sum('Paint', (e) => thread(e) === main)
  const raster = sum('RasterTask')
  return {
    seconds: round(seconds, 2),
    tasksOver16: run.filter((d) => d > 16).length,
    tasksOver50: run.filter((d) => d > 50).length,
    taskMaxMs: pct(run, 100),
    busyMs: round(run.reduce((a, d) => a + d, 0)),
    selfMs: Object.fromEntries(
      Object.entries(self)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([k, v]) => [k, round(v)]),
    ),
    frames,
    paint,
    raster,
    paintMsPerFrame: frames > 0 ? round(paint.ms / frames, 2) : null,
    rasterMsPerFrame: frames > 0 ? round(raster.ms / frames, 2) : null,
    gc,
    workletThreads: worklet,
  }
}

type TraceSummary = ReturnType<typeof traceSummary>

// ---------- driving ----------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface Point {
  x: number
  y: number
}

/** Live's pads the scenarios press: the kick on A "." and the clap (A p05), with their number pad keys. */
interface Pads {
  kick: Point
  clap: Point
  kickKey: string
  clapKey: string
}

async function center(page: Page, selector: string): Promise<Point> {
  const b = await page.locator(selector).boundingBox()
  if (b === null) throw new Error(`${selector} has no box`)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

async function tap(page: Page, p: Point, holdMs = 40): Promise<void> {
  await page.mouse.move(p.x, p.y)
  await page.mouse.down()
  await sleep(holdMs)
  await page.mouse.up()
}

async function key(page: Page, code: string, holdMs = 40): Promise<void> {
  await page.keyboard.down(code)
  await sleep(holdMs)
  await page.keyboard.up(code)
}

/** [n] presses [periodMs] apart, by the clock (a slow press doesn't push the rest back). */
async function drum(n: number, periodMs: number, press: (i: number) => Promise<void>): Promise<void> {
  const t0 = Date.now()
  for (let i = 0; i < n; i++) {
    const wait = t0 + i * periodMs - Date.now()
    if (wait > 0) await sleep(wait)
    await press(i)
  }
}

const heard = (page: Page): Promise<number> => page.evaluate(() => window.__arcPerf?.heard.length ?? 0)

/** How many of the demo device's sounds arc has copied (Live's background copy; offlinePads.spec). */
function copies(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('arc-demo')
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains('padSounds')) return resolve(0)
          const keys = db.transaction('padSounds').objectStore('padSounds').getAllKeys()
          keys.onsuccess = () => resolve(keys.result.filter((k) => /^s\d+\.wav$/.test(String(k))).length)
          keys.onerror = () => resolve(0)
        }
        open.onerror = () => resolve(0)
      }),
  )
}

/** The page with the collectors, on the desk's Live in [view]. */
async function openLive(run: Run, hash = '#/live'): Promise<void> {
  if (run.view === 'grid') await gridOnDesk(run.page)
  await run.page.addInitScript(collectors)
  await run.page.goto(`/?demo${hash}`)
  await run.page.waitForFunction(() => '__arcDemo' in window && '__arcPerf' in window)
}

/**
 * Live's read of the demo EP-133, its pads named as it plays them (latency.spec's
 * pressPad), the pads' sounds copied, and the kick and the clap played once
 * each, so later presses play from memory.
 */
async function readDevice(page: Page): Promise<Pads> {
  await expect(page.locator('[data-pad]')).toHaveCount(12)
  const named: Record<string, string> = {}
  for (const [note, pad, name] of [
    [36, 1, 'kick'],
    [40, 5, 'clap'],
  ] as const) {
    const el = page.locator('[data-pad]', { hasText: name }).first()
    await expect(async () => {
      await page.evaluate(([n, p]) => {
        window.__arcDemo!.noteOn(n, 127)
        window.__arcDemo!.pushPadActive(1, 0, p)
      }, [note, pad] as const)
      await page.evaluate((n) => window.__arcDemo!.noteOff(n), note)
      await expect(el).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 30_000 })
    named[name] = (await el.getAttribute('data-pad')) ?? ''
  }
  await expect.poll(() => copies(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(5)
  const keyOf = (offset: string): string => Object.entries(NUMPAD_OFFSET).find(([, o]) => String(o) === offset)![0]
  const pads: Pads = {
    kick: await center(page, `[data-pad="${named.kick}"]`),
    clap: await center(page, `[data-pad="${named.clap}"]`),
    kickKey: keyOf(named.kick!),
    clapKey: keyOf(named.clap!),
  }
  for (const p of [pads.kick, pads.clap]) {
    await expect(async () => {
      const before = await heard(page)
      await tap(page, p)
      await expect.poll(() => heard(page), { timeout: 2_000 }).toBeGreaterThan(before)
    }).toPass({ timeout: 30_000 })
  }
  await sleep(500)
  return pads
}

/** The device playing 16ths at the clock's tempo over four pads of group A, each with its pad push (S2). */
async function devicePlays(page: Page, on: boolean): Promise<void> {
  await page.evaluate((start) => {
    const raw = window.__arcPage!.raw
    if (window.__arcPerfLoop !== undefined) raw.clearTimeout(window.__arcPerfLoop)
    window.__arcPerfLoop = undefined
    if (!start) return
    const d = window.__arcDemo!
    const hits = [
      [36, 1],
      [37, 2],
      [40, 5],
      [38, 3],
    ] as const
    let i = 0
    const step = (): void => {
      const [note, pad] = hits[i++ % hits.length]!
      d.noteOn(note, 100)
      d.pushPadActive(1, 0, pad)
      raw.setTimeout(() => d.noteOff(note), 60)
      window.__arcPerfLoop = raw.setTimeout(step, 60000 / d.bpm / 4)
    }
    step()
  }, on)
}

/** Runs [work] as one measured window: counters reset, the CPU throttled, S1/S2 traced. */
async function measure(run: Run, name: string, work: () => Promise<number | void>, trace = false): Promise<Phase> {
  const { page, browser, cdp } = run
  await page.evaluate(() => {
    window.__arcPage!.reset()
    window.__arcPerf!.reset()
  })
  if (run.cpu !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: run.cpu })
  const tracing = trace && TRACE
  if (tracing) await browser.startTracing(page, { categories: CATEGORIES })
  const t0 = Date.now()
  const hits = (await work()) ?? 0
  const seconds = (Date.now() - t0) / 1000
  const buf = tracing ? await browser.stopTracing() : null
  if (buf && KEEP_TRACES) {
    fs.mkdirSync(OUT, { recursive: true })
    fs.writeFileSync(path.join(OUT, `${run.id}-${run.view}-${run.cpu}x-${name}.trace.json`), buf)
  }
  // The last reports (heard, Event Timing) come a frame or two later.
  await sleep(300)
  const snap = await snapshot(page)
  if (run.cpu !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  return summary(snap, seconds, hits, buf ? traceSummary(buf, seconds) : null)
}

function write(run: Run, phases: Record<string, unknown>): void {
  fs.mkdirSync(OUT, { recursive: true })
  const out = { id: run.id, view: run.view, cpu: run.cpu, at: new Date().toISOString(), phases }
  fs.writeFileSync(path.join(OUT, `${run.id}-${run.view}-${run.cpu}x.json`), JSON.stringify(out, null, 2) + '\n')
}

/** A small factory pack at teenage engineering's place (/te/), as factorySounds.spec serves it. */
async function factorySite(page: Page): Promise<void> {
  const { encodeWav } = await import('../../src/core/formats/wav')
  const { writeZip } = await import('../../src/core/formats/zip')
  const { pad, tarFile } = await import('../helpers/bytes')
  const { tone } = await import('../helpers/demoData')
  const wav = encodeWav(tone(4000, 220), 1, 46875)
  const json = (o: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(o))
  const zip = await writeZip(
    [
      { path: 'meta.json', data: json({ pak_type: 'factory', device_name: 'EP-133', generated_at: '2023-11-24T00:00:00.000Z' }), compress: false },
      { path: 'sounds/001 micro kick.wav', data: wav, compress: false },
      { path: 'sounds/100 nt snare.wav', data: wav, compress: false },
      { path: 'projects/P01.tar', data: tarFile([['pads/a/p01', pad(100)], ['pads/a/p10', pad(1)]]), compress: false },
    ],
    { date: 0, offsetMin: 0 },
  )
  const body = Buffer.from(zip)
  await page.route('**/te/apps/ep-sample-tool**', async (route) => {
    const p = new URL(route.request().url()).pathname
    if (p.endsWith('.pak')) return route.fulfill({ body, contentType: 'binary/octet-stream' })
    if (p.endsWith('.js')) return route.fulfill({ body: 'x="/apps/ep-sample-tool/assets/ep-133-factory-content-E2e.pak"', contentType: 'text/javascript' })
    return route.fulfill({ body: '<script type="module" src="/apps/ep-sample-tool/assets/index-E2e.js"></script>', contentType: 'text/html' })
  })
}

// ---------- the scenarios ----------

test.use({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })

test.afterAll(() => {
  if (!fs.existsSync(OUT)) return
  const runs = fs
    .readdirSync(OUT)
    .filter((f) => /^S\d-[a-z]+-\d+x\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')) as unknown)
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ at: new Date().toISOString(), runs }, null, 2) + '\n')
})

for (const cpu of CPUS) {
  for (const view of VIEWS) {
    test.describe(`${view}, ${cpu}x CPU`, { tag: '@perf' }, () => {
      test.describe.configure({ timeout: 300_000 })
      let run: Run

      test.beforeEach(async ({ page, browser }, info) => {
        const id = /^S\d/.exec(info.title)?.[0] ?? info.title
        run = { page, browser, cdp: await page.context().newCDPSession(page), view, cpu, id }
      })

      test('S1 device idle, clock only', async ({ page }) => {
        await openLive(run)
        await readDevice(page)
        await demo(page, (d) => {
          d.clock(120)
          d.clock('start')
        })
        await sleep(1_000)
        const clock = await measure(run, 'clock', () => sleep(10_000), true)
        await demo(page, (d) => d.clock('stop'))
        write(run, { clock })
      })

      test('S2 device plays 16ths, web presses meanwhile', async ({ page }) => {
        await openLive(run)
        const pads = await readDevice(page)
        await demo(page, (d) => {
          d.clock(120)
          d.clock('start')
        })
        await devicePlays(page, true)
        await sleep(1_000)
        const plays = await measure(
          run,
          'plays',
          async () => {
            await drum(20, 500, (i) => tap(page, i % 2 === 0 ? pads.kick : pads.clap))
            await sleep(500)
            return 20
          },
          true,
        )
        await devicePlays(page, false)
        await demo(page, (d) => d.clock('stop'))
        write(run, { plays })
      })

      test('S3 finger drumming: two pads at 8 Hz by click and number pad, one pad as control', async ({ page }) => {
        await openLive(run)
        const pads = await readDevice(page)
        const hits = 40
        const alternateClick = await measure(run, 'alternateClick', async () => {
          await drum(hits, 125, (i) => tap(page, i % 2 === 0 ? pads.kick : pads.clap))
          return hits
        })
        await sleep(1_000)
        const alternateKeys = await measure(run, 'alternateKeys', async () => {
          await drum(hits, 125, (i) => key(page, i % 2 === 0 ? pads.kickKey : pads.clapKey))
          return hits
        })
        await sleep(1_000)
        const singleClick = await measure(run, 'singleClick', async () => {
          await drum(hits, 125, () => tap(page, pads.kick))
          return hits
        })
        write(run, { alternateClick, alternateKeys, singleClick })
      })

      test('S4 KEYS on the piano: a run from the computer keyboard, then a pads-only pattern', async ({ page }) => {
        await openLive(run)
        const pads = await readDevice(page)
        // A pattern of pads only, recorded on the web: RECORD, eight hits over a bar, PLAY to stop.
        const record = page.getByRole('button', { name: /^Record, / }).first()
        const play = page.getByRole('button', { name: /^Play/ }).first()
        await record.click()
        await expect(record).toHaveAccessibleName('Record, armed')
        await drum(8, 250, (i) => tap(page, i % 2 === 0 ? pads.kick : pads.clap, 60))
        await expect(record).toHaveAccessibleName('Record, recording')
        await play.click()
        await expect(record).toHaveAccessibleName('Record, off')
        // KEYS on the piano (M; V when the keys show on the pads).
        await page.keyboard.press('KeyM')
        await page.waitForTimeout(300)
        if ((await page.locator('.piano__key').count()) === 0) await page.keyboard.press('KeyV')
        await expect(page.locator('.piano__key').first()).toBeVisible()
        const codes = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK']
        const run16 = [...codes, ...[...codes].reverse()]
        const keysRun = await measure(run, 'keysRun', async () => {
          await drum(32, 85, (i) => key(page, run16[i % run16.length]!, 50))
          await sleep(500)
          return 32
        })
        await sleep(1_000)
        const padsPattern = await measure(run, 'padsPattern', async () => {
          await play.click()
          await sleep(4_000)
          await play.click()
          await sleep(300)
        })
        write(run, { keysRun, padsPattern })
      })

      test('S5 cold start offline on the factory sounds: a press at once, then a preview', async ({ page }) => {
        await factorySite(page)
        // Unplugged as the demo device is put in, so Live never reads it: it opens on the factory sounds.
        await page.addInitScript(() => {
          let d: Window['__arcDemo']
          Object.defineProperty(window, '__arcDemo', {
            configurable: true,
            get: () => d,
            set: (v: Window['__arcDemo']) => {
              d = v
              v?.unplug()
            },
          })
        })
        await openLive(run)
        await expect(page.locator('.live-strip, .ep-plate__status').first()).toBeVisible()
        await page.getByRole('button', { name: 'Get', exact: true }).click()
        await expect(page.getByText('Factory sounds saved: 2 sounds.', { exact: false })).toBeVisible()

        // Cold: reloaded (throttled from the start), the kick pressed as soon as it shows.
        if (cpu !== 1) await run.cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
        await page.reload()
        const kick = page.locator('[data-pad]', { hasText: 'micro kick' }).first()
        await expect(kick).toBeVisible({ timeout: 30_000 })
        const shownAt = await page.evaluate(() => performance.now())
        let presses = 0
        await expect(async () => {
          presses++
          await tap(page, await center(page, `[data-pad="${await kick.getAttribute('data-pad')}"]`))
          await expect.poll(() => heard(page), { timeout: 3_000 }).toBeGreaterThan(0)
        }).toPass({ timeout: 30_000 })
        await sleep(500)
        const snap = await snapshot(page)
        if (cpu !== 1) await run.cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
        const first = snap.app.heard[0]!
        const coldStart = {
          ...summary(snap, snap.at / 1000, presses),
          shownAtMs: round(shownAt),
          firstHeardAtMs: round(first.at),
          firstPressToSoundMs: round(first.ms),
          presses,
        }

        // A factory sound's preview from the Sounds tab.
        await page.getByRole('tab', { name: 'Sounds' }).click()
        const sources = page.getByRole('radiogroup', { name: 'Sounds from' })
        if (await sources.isVisible()) await sources.getByRole('radio', { name: 'Factory' }).click()
        const row = page.locator('.snd__row').filter({ hasText: 'nt snare' })
        await expect(row).toBeVisible()
        const at = await center(page, '.snd__row:has-text("nt snare") .snd__play')
        let playingAt = 0
        const preview = await measure(run, 'preview', async () => {
          const shown = page.evaluate(
            () =>
              new Promise<number>((resolve) => {
                const el = [...document.querySelectorAll('.snd__row')].find((r) => r.textContent?.includes('nt snare'))!
                new MutationObserver((_, o) => {
                  if (!el.classList.contains('is-playing')) return
                  o.disconnect()
                  resolve(performance.now() - window.__arcPage!.stats.t0)
                }).observe(el, { attributes: true, attributeFilter: ['class'] })
              }),
          )
          await tap(page, at)
          playingAt = await shown
          return 1
        })
        const down = preview.input.each.find((e) => e.type === 'pointerdown')
        write(run, { coldStart, preview: { ...preview, pressToPlayingMs: down ? round(playingAt - down.at) : null } })
      })

      test('S6 output reopened (the latency choice changed), pressed at once', async ({ page }) => {
        await openLive(run)
        const pads = await readDevice(page)
        await openSettings(page)
        await page.getByRole('button', { name: 'Debug log' }).click()
        const panel = page.locator('.debug__latency')
        await panel.getByRole('button', { name: LatencyText.TITLE }).click()
        const choice = panel.getByRole('radiogroup', { name: LatencyText.ENGINE })
        await choice.getByRole('radio', { name: LatencyText.hint('INTERACTIVE') }).click()
        await expect(choice.getByRole('radio', { name: LatencyText.hint('INTERACTIVE') })).toBeChecked()
        // From the way back to Live (its output opens again there) to three presses at once.
        const reopen = await measure(run, 'reopen', async () => {
          await page.goBack()
          await page.goBack()
          await expect(page).toHaveURL(/#\/live$/)
          await drum(3, 150, () => tap(page, pads.kick))
          await sleep(1_500)
          return 3
        })
        write(run, { reopen })
      })

      test('S7 typing in the Sounds tab while the device plays, then on the Search screen', async ({ page }) => {
        // A backup to search (the demo device's own).
        await openLive(run, '#/backups')
        await importPak(page, SAMPLE_PAK)
        await expect(page.getByRole('region', { name: 'Backups' }).getByRole('listitem')).toHaveCount(1)
        await page.evaluate(() => {
          location.hash = '#/live'
        })
        await readDevice(page)
        await demo(page, (d) => {
          d.clock(120)
          d.clock('start')
        })
        await devicePlays(page, true)
        await page.getByRole('tab', { name: 'Sounds' }).click()
        const find = page.locator('.snd__input')
        await find.click()
        const typing = async (): Promise<number> => {
          const keys = ['h', 'a', 't', 'Backspace', 'Backspace', 'Backspace']
          await drum(18, 150, (i) => page.keyboard.press(keys[i % keys.length]!))
          await sleep(300)
          return 18
        }
        const sounds = await measure(run, 'sounds', typing)
        await page.evaluate(() => {
          location.hash = '#/search'
        })
        const field = page.locator('[data-screen="search"] input')
        await expect(field).toBeVisible()
        await expect(page.getByText(FeatureText.INDEXING)).toHaveCount(0, { timeout: 30_000 })
        await field.click()
        const search = await measure(run, 'search', async () => {
          const keys = ['k', 'i', 'c', 'Backspace', 'Backspace', 'Backspace']
          await drum(18, 150, (i) => page.keyboard.press(keys[i % keys.length]!))
          await sleep(300)
          return 18
        })
        await devicePlays(page, false)
        await demo(page, (d) => d.clock('stop'))
        write(run, { sounds, search })
      })
    })
  }
}
