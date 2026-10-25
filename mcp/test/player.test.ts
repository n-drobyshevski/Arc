// views/beat/player.ts and synth.ts against a fake AudioContext: Stop silences
// what the lookahead already handed to the synth, not only what comes next.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseBeatCard } from '../../web/src/core/formats/beatCard'
import { groupHits, viewGroups } from '../views/beat/model'
import { Player } from '../views/beat/player'
import { Synth } from '../views/beat/synth'

/** An AudioParam that records its calls. */
class FakeParam {
  value = 1
  readonly calls: [string, ...number[]][] = []
  setValueAtTime(v: number, t: number): void {
    this.calls.push(['set', v, t])
  }
  linearRampToValueAtTime(v: number, t: number): void {
    this.calls.push(['linear', v, t])
  }
  exponentialRampToValueAtTime(v: number, t: number): void {
    this.calls.push(['exp', v, t])
  }
  cancelScheduledValues(t: number): void {
    this.calls.push(['cancel', t])
  }
}

/** Any node: connections, start and stop, and whatever params a voice sets. */
class FakeNode {
  readonly to: FakeNode[] = []
  disconnected = false
  started: number | null = null
  readonly gain = new FakeParam()
  readonly frequency = new FakeParam()
  readonly detune = new FakeParam()
  readonly Q = new FakeParam()
  readonly threshold = new FakeParam()
  readonly ratio = new FakeParam()
  type = ''
  buffer: unknown = null
  constructor(readonly kind: string) {}
  connect(node: FakeNode): FakeNode {
    this.to.push(node)
    return node
  }
  disconnect(): void {
    this.disconnected = true
  }
  start(t = 0): void {
    this.started = t
  }
  stop(): void {}
}

class FakeContext {
  currentTime = 0
  readonly sampleRate = 8000
  readonly destination = new FakeNode('destination')
  readonly nodes: FakeNode[] = []
  private make(kind: string): FakeNode {
    const n = new FakeNode(kind)
    this.nodes.push(n)
    return n
  }
  createGain = (): FakeNode => this.make('gain')
  createDynamicsCompressor = (): FakeNode => this.make('compressor')
  createOscillator = (): FakeNode => this.make('osc')
  createBiquadFilter = (): FakeNode => this.make('filter')
  createBufferSource = (): FakeNode => this.make('source')
  createBuffer = (_c: number, length: number): { getChannelData: () => Float32Array } => {
    const data = new Float32Array(length)
    return { getChannelData: () => data }
  }
  resume = (): Promise<void> => Promise.resolve()
}

/** The gain node a voice's oscillator ends up in before the synth's out: its bus. */
function busOf(node: FakeNode, out: FakeNode): FakeNode {
  let at = node
  for (;;) {
    const next = at.to[0]!
    if (next === out) return at
    at = next
  }
}

describe('Player.stop', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('cuts the voices already scheduled and still ringing, and the next Play gets a new bus', () => {
    // A held bass note at tempo 40: it starts inside the lookahead and would ring 1.5 s.
    const card = parseBeatCard(['ARC BEAT 1', 'tempo 40', '[B] bars 1 step 1/16', 'B7 bass | X--- ---- ---- ---- |'].join('\n'))
    const view = viewGroups(card)[0]!
    const ctx = new FakeContext()
    const synth = new Synth(ctx as unknown as AudioContext)
    const out = ctx.nodes.find((n) => n.kind === 'gain')!
    const player = new Player(synth)
    player.setTempo(40)
    player.setLoops([{ length: view.group.length, hits: groupHits(card, view, 50) }])

    player.start()
    const osc = ctx.nodes.find((n) => n.kind === 'osc')
    expect(osc?.started).toBeCloseTo(0.06)
    const bus = busOf(osc!, out)
    expect(bus.kind).toBe('gain')

    ctx.currentTime = 0.03
    player.stop()
    expect(player.playing).toBe(false)
    // Faded out from now on, then let go.
    expect(bus.gain.calls.slice(-2)).toEqual([
      ['set', 1, 0.03],
      ['linear', 0, 0.045],
    ])
    vi.runAllTimers()
    expect(bus.disconnected).toBe(true)

    ctx.currentTime = 1
    player.start()
    const again = ctx.nodes.filter((n) => n.kind === 'osc').at(-1)!
    expect(again.started).toBeCloseTo(1.06)
    const next = busOf(again, out)
    expect(next).not.toBe(bus)
    expect(next.disconnected).toBe(false)
    player.stop()
  })

  it('does nothing when not playing', () => {
    const ctx = new FakeContext()
    const player = new Player(new Synth(ctx as unknown as AudioContext))
    const before = ctx.nodes.length
    player.stop()
    expect(ctx.nodes.length).toBe(before)
  })
})
