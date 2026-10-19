// Perf counters for ?demo (no Android counterpart): what test/e2e/perf.spec.ts reads.
//
// main.tsx calls installPerf(window, controller, deps) under ?demo only, before the
// first render. It comes in the demo's chunk (demo.ts re-exports it), so normal
// use never loads it.
//
// `window.__arcPerf`:
//   renders    Preact renders by component name. Taken from Preact's render hook
//              (options._render, mangled __r): options.diffed also runs for a
//              component that skipped its render (memo), which would count it.
//              Preact's own Fragment and context providers are named here (its
//              build mangles them); a minified build mangles the app's too.
//   publishes  mirror publishes (UiState.mirror replaced); keysPad, its changes;
//              states, every UiState change
//   voices     changes of the voices sounding (liveAudio.voices)
//   mixer      what Live sends its mixer, by `t` (worklet or ScriptProcessor alike),
//              with the bytes of the 'load's in loadBytes; engine, the link's kind
//   heard      press-to-sound per voice: liveAudio.onStarted, the number the debug
//              log's latency note shows (MirrorText.latencyNote)
//   reset()    zeroes them all (engine stays)

import { Fragment, options, type VNode } from 'preact'
import type { LiveBackend, MixerLink } from '../platform/audio/liveAudio'
import type { ArcController } from '../state/controller'
import type { Deps } from '../state/deps'

/** What `window.__arcPerf` holds. */
export interface ArcPerf {
  readonly renders: Record<string, number>
  publishes: number
  keysPad: number
  states: number
  voices: number
  readonly mixer: Record<string, number>
  loadBytes: number
  /** The mixer link's kind: 'AudioWorklet' or 'ScriptProcessor'; null before Live's output opens. */
  engine: string | null
  /** [at] is performance.now() when the report came. */
  readonly heard: { id: string; ms: number; at: number }[]
  reset(): void
}

declare global {
  interface Window {
    __arcPerf?: ArcPerf
  }
}

/** Preact's render hook, left out of its public types. */
type RenderHooks = typeof options & { __r?: (vnode: VNode) => void }

const add = (counts: Record<string, number>, key: string, n = 1): void => {
  counts[key] = (counts[key] ?? 0) + n
}

/** A component's name for the counts. */
function nameOf(f: { displayName?: string; name: string; Provider?: unknown }): string {
  if (f === (Fragment as unknown)) return 'Fragment'
  if (f.displayName) return f.displayName
  // createContext's Provider is the context itself.
  if (f.Provider === f) return 'Provider'
  return f.name || '?'
}

const clear = (counts: Record<string, number>): void => {
  for (const k of Object.keys(counts)) delete counts[k]
}

/** Installs the counters on [win] and returns them (also set as `win.__arcPerf`). Calling it again returns the installed ones. */
export function installPerf(win: Window, c: ArcController, deps: Deps): ArcPerf {
  if (win.__arcPerf) return win.__arcPerf
  const perf: ArcPerf = {
    renders: {},
    publishes: 0,
    keysPad: 0,
    states: 0,
    voices: 0,
    mixer: {},
    loadBytes: 0,
    engine: null,
    heard: [],
    reset() {
      clear(perf.renders)
      clear(perf.mixer)
      perf.publishes = 0
      perf.keysPad = 0
      perf.states = 0
      perf.voices = 0
      perf.loadBytes = 0
      perf.heard.length = 0
    },
  }

  const hooks = options as RenderHooks
  const render = hooks.__r
  hooks.__r = (vnode) => {
    const type: unknown = vnode.type
    if (typeof type === 'function') add(perf.renders, nameOf(type as { name: string }))
    render?.(vnode)
  }

  let mirror = c.state.peek().mirror
  let keysPad = c.state.peek().keysPad
  c.state.subscribe((s) => {
    perf.states++
    if (s.mirror !== mirror) perf.publishes++
    if (s.keysPad !== keysPad) perf.keysPad++
    mirror = s.mirror
    keysPad = s.keysPad
  })
  let voices = deps.liveAudio.voices.peek()
  deps.liveAudio.voices.subscribe((v) => {
    if (v !== voices) perf.voices++
    voices = v
  })
  deps.liveAudio.onStarted((id, ms) => perf.heard.push({ id, ms, at: performance.now() }))

  // The link to the mixer, from LiveAudio's backend (a private field: this is dev tooling).
  const backend = (deps.liveAudio as unknown as { backend?: LiveBackend }).backend
  if (backend) {
    const connect = backend.connect.bind(backend)
    backend.connect = async (ctx, onMessage): Promise<MixerLink> => {
      const link = await connect(ctx, onMessage)
      perf.engine = link.kind
      const send = link.send.bind(link)
      return {
        ...link,
        send: (m) => {
          add(perf.mixer, m.t)
          if (m.t === 'load') perf.loadBytes += m.pcm.byteLength
          send(m)
        },
      }
    }
  }

  win.__arcPerf = perf
  return perf
}
