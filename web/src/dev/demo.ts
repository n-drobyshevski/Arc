// Demo mode (no Android counterpart): the app without an EP-133.
//
// `?demo` in the page URL makes main.tsx load this module (dynamically, so it
// is its own chunk and never part of normal use) and call installDemo(window)
// BEFORE createBrowserDeps():
//
//   if (new URLSearchParams(location.search).has('demo')) {
//     const { installDemo } = await import('./dev/demo')
//     installDemo(window)
//   }
//
// installDemo puts a fake `navigator.requestMIDIAccess` on the page, backed by
// the test simulator (MockEP133 holding the demo sounds and projects), and makes
// `navigator.permissions.query({name: 'midi'})` answer 'granted'. The device is
// plugged in from the start, so the controller's silent auto-connect finds it.
//
// Device replies and live-mirror messages arrive as separate tasks (setTimeout),
// like real Web MIDI events, so the UI renders between them and progress shows.
//
// `window.__arcDemo` drives it from the console, screenshots and Playwright:
//   __arcDemo.unplug() / plug()                  the USB cable
//   __arcDemo.pushPadActive(project, group, pad) the device's "pad selected" FILE push
//   __arcDemo.noteOn(note, vel) / noteOff(note)  pad notes (36..83 are the pads)
//   __arcDemo.clock('start' | 'stop' | 'continue' | 'tick' | bpm)
//   __arcDemo.mock / access                      the simulator and the fake MIDIAccess

import type { MidiAccessLike, NavigatorLike } from '../platform/midi/webmidi'
import { demoDevice } from '../../test/helpers/demoData'
import { FakeMidiAccess, fakePair, type FakeMidiInput, type FakeMidiOutput } from '../../test/helpers/fakeMidiAccess'
import { MockEP133 } from '../../test/helpers/mockDevice'

export type ClockCommand = 'start' | 'stop' | 'continue' | 'tick' | number

/** What `window.__arcDemo` holds. */
export interface ArcDemo {
  /** The simulated EP-133 (its sounds, projects and knobs such as `silent`). */
  readonly mock: MockEP133
  /** The fake MIDIAccess requestMIDIAccess resolves with. */
  readonly access: FakeMidiAccess
  readonly input: FakeMidiInput
  readonly output: FakeMidiOutput
  /** Whether the cable is in. */
  readonly plugged: boolean
  /** Pulls the cable: both ports go 'disconnected' (one statechange each). */
  unplug(): void
  /** Plugs it back in. */
  plug(): void
  /** The device's FILE push telling which pad is selected (project 1.., group 0..3 = A..D, pad 1..12). */
  pushPadActive(project: number, group: number, pad: number): void
  /** A note-on from the device; [channel] is 1..16. */
  noteOn(note: number, velocity?: number, channel?: number): void
  /** A note-off (sent as note-off status 0x8n). */
  noteOff(note: number, channel?: number): void
  /**
   * MIDI clock: 'start' / 'continue' send FA / FB and tick at the tempo,
   * 'stop' sends FC and stops ticking, 'tick' sends one F8, a number sets the BPM.
   */
  clock(cmd: ClockCommand): void
  /** The current clock tempo. */
  readonly bpm: number
  /** Extra delay before each device message reaches the page (default 0: next task). */
  setLatency(ms: number): void
  /** Restores the navigator and stops the clock (tests). */
  uninstall(): void
}

/** The bits of `window` installDemo touches (a real Window fits). */
export interface DemoWindow {
  navigator: object
  __arcDemo?: ArcDemo
}

export interface DemoOptions {
  /** Delay before each device message is delivered, ms (default 0). */
  latencyMs?: number
  /** The simulator to use (default: a MockEP133 with the demo contents). */
  mock?: MockEP133
}

declare global {
  interface Window {
    __arcDemo?: ArcDemo
  }
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

const clamp7 = (v: number): number => Math.max(0, Math.min(127, Math.round(v)))
const chan = (c: number): number => (Math.max(1, Math.min(16, Math.round(c))) - 1) & 0x0f

/**
 * Installs the demo device on [win] and returns its driver (also set as
 * `win.__arcDemo`). Calling it again returns the installed one.
 */
export function installDemo(win: DemoWindow, options: DemoOptions = {}): ArcDemo {
  if (win.__arcDemo) return win.__arcDemo
  const nav = win.navigator as NavigatorLike & Record<string, unknown>

  const mock = options.mock ?? new MockEP133(demoDevice())
  const access = new FakeMidiAccess()
  const { input, output } = fakePair('EP-133', 'teenage engineering', 'demo-ep')
  access.add(input).add(output)

  // Page -> device: the mock handles each message in a microtask.
  const t = mock.transport()
  output.sink = (b) => t.send(b)

  // Device -> page: one FIFO, flushed in a later task, timestamped on arrival
  // like MIDIMessageEvent.timeStamp. Dropped by the input while unplugged.
  let latency = Math.max(0, options.latencyMs ?? 0)
  const queue: { data: Uint8Array; time: number }[] = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  const flush = (): void => {
    flushTimer = null
    const batch = queue.splice(0)
    for (const m of batch) input.receiveNow(m.data, m.time)
  }
  const deliver = (data: Uint8Array): void => {
    queue.push({ data, time: now() })
    flushTimer ??= setTimeout(flush, latency)
  }
  const offDevice = t.onMessage(deliver)

  // Clock: 24 ticks a beat, each scheduled from the start time so timer
  // rounding does not drift the tempo.
  let bpm = 120
  let ticker: ReturnType<typeof setTimeout> | null = null
  const stopTicking = (): void => {
    if (ticker !== null) clearTimeout(ticker)
    ticker = null
  }
  const startTicking = (): void => {
    stopTicking()
    const period = 60000 / (bpm * 24)
    const t0 = now()
    let n = 0
    const tick = (): void => {
      n++
      deliver(Uint8Array.of(0xf8))
      ticker = setTimeout(tick, Math.max(0, t0 + (n + 1) * period - now()))
    }
    ticker = setTimeout(tick, period)
  }

  // navigator
  const saved = new Map<string, PropertyDescriptor | undefined>()
  const define = (key: string, value: unknown): void => {
    saved.set(key, Object.getOwnPropertyDescriptor(nav, key))
    Object.defineProperty(nav, key, { value, configurable: true, writable: true, enumerable: true })
  }
  const realPermissions = nav.permissions
  define('requestMIDIAccess', (_options?: { sysex?: boolean }): Promise<MidiAccessLike> => Promise.resolve(access))
  define('permissions', {
    query(desc: { name: string; sysex?: boolean }): Promise<{ state: string }> {
      if (desc.name === 'midi') return Promise.resolve({ state: 'granted' })
      if (realPermissions) return realPermissions.query(desc)
      return Promise.reject(new TypeError(`'${desc.name}' is not a valid permission name`))
    },
  })

  const demo: ArcDemo = {
    mock,
    access,
    input,
    output,
    get plugged() {
      return input.state === 'connected' && output.state === 'connected'
    },
    unplug() {
      if (!demo.plugged) return
      access.unplug(input, output)
    },
    plug() {
      if (demo.plugged) return
      // A replugged device starts fresh: nothing half-read, no stale replies.
      queue.length = 0
      mock.needsInit = false
      access.plug(input, output)
    },
    pushPadActive(project, group, pad) {
      mock.pushPadActive(project, group, pad)
    },
    noteOn(note, velocity = 100, channel = 1) {
      deliver(Uint8Array.of(0x90 | chan(channel), clamp7(note), clamp7(velocity)))
    },
    noteOff(note, channel = 1) {
      deliver(Uint8Array.of(0x80 | chan(channel), clamp7(note), 0))
    },
    clock(cmd) {
      if (typeof cmd === 'number') {
        if (!(cmd > 0) || !Number.isFinite(cmd)) return
        bpm = cmd
        if (ticker !== null) startTicking()
        return
      }
      switch (cmd) {
        case 'start':
        case 'continue':
          deliver(Uint8Array.of(cmd === 'start' ? 0xfa : 0xfb))
          startTicking()
          break
        case 'stop':
          stopTicking()
          deliver(Uint8Array.of(0xfc))
          break
        case 'tick':
          deliver(Uint8Array.of(0xf8))
          break
      }
    },
    get bpm() {
      return bpm
    },
    setLatency(ms) {
      latency = Math.max(0, ms)
    },
    uninstall() {
      stopTicking()
      if (flushTimer !== null) clearTimeout(flushTimer)
      flushTimer = null
      queue.length = 0
      offDevice()
      for (const [key, d] of saved) {
        if (d) Object.defineProperty(nav, key, d)
        else delete nav[key]
      }
      saved.clear()
      if (win.__arcDemo === demo) delete win.__arcDemo
    },
  }
  win.__arcDemo = demo
  return demo
}
