// views/beat/player.ts and synth.ts against a fake AudioContext: Stop silences
// what the lookahead already handed to the synth, not only what comes next;
// each effect's graph, the sends, the sidechain's ducks, pad shaping and the
// FX switch, and a browser without the nodes an effect needs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseBeatCard } from '../../web/src/core/formats/beatCard'
import { cardFx, groupHits, viewGroups, type CardFx, type Hit, type Shape } from '../views/beat/model'
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
  setTargetAtTime(v: number, t: number, tau: number): void {
    this.calls.push(['target', v, t, tau])
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
  readonly attack = new FakeParam()
  readonly release = new FakeParam()
  readonly delayTime = new FakeParam()
  readonly pan = new FakeParam()
  readonly playbackRate = new FakeParam()
  type = ''
  buffer: unknown = null
  curve: Float32Array | null = null
  oversample = 'none'
  stopped = false
  constructor(readonly kind: string) {}
  connect(node: FakeNode | FakeParam): FakeNode | FakeParam {
    if (node instanceof FakeNode) this.to.push(node)
    return node
  }
  disconnect(): void {
    this.disconnected = true
  }
  start(t = 0): void {
    this.started = t
  }
  stop(): void {
    this.stopped = true
  }
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
  createDelay = (): FakeNode => this.make('delay')
  createWaveShaper = (): FakeNode => this.make('shaper')
  createConvolver: (() => FakeNode) | undefined = () => this.make('convolver')
  createStereoPanner: (() => FakeNode) | undefined = () => this.make('panner')
  buffers = 0
  createBuffer = (channels: number, length: number): { length: number; numberOfChannels: number; getChannelData: () => Float32Array } => {
    this.buffers++
    const data = new Float32Array(length)
    return { length, numberOfChannels: channels, getChannelData: () => data }
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

/** The nodes [node] feeds, following its first connection to the destination (or round to a node again). */
function chain(node: FakeNode): FakeNode[] {
  const out = [node]
  for (let at = node; at.to[0] && !out.includes(at.to[0]); at = at.to[0]) out.push(at.to[0])
  return out
}

/** Does [from] reach [to] by any of its connections? */
function reaches(from: FakeNode, to: FakeNode, seen = new Set<FakeNode>()): boolean {
  if (from === to) return true
  if (seen.has(from)) return false
  seen.add(from)
  return from.to.some((n) => reaches(n, to, seen))
}

const hit = (pad: string, shape?: Shape): Hit => ({
  tick: 0,
  pad,
  voice: 'kick',
  vel: 127,
  gate: 24,
  semi: null,
  midi: null,
  ...(shape ? { shape } : {}),
})

const fxOf = (...lines: string[]): CardFx => cardFx(parseBeatCard(['ARC BEAT 1', ...lines, '[A] bars 1'].join('\n')))

/** A synth on a fake context with the card's effect lines, and where a kick on [pad] goes. */
function setup(fx: CardFx, ctx = new FakeContext()) {
  const synth = new Synth(ctx as unknown as AudioContext)
  const out = ctx.nodes.find((n) => n.kind === 'gain')!
  synth.setFx(fx)
  synth.begin()
  /** The kick's nodes from its oscillator on, after playing it at [t]. */
  const kick = (pad: string, t = 0.1, shape?: Shape): FakeNode[] => {
    const before = ctx.nodes.length
    synth.play(hit(pad, shape), t, 0.1)
    return chain(ctx.nodes.slice(before).find((n) => n.kind === 'osc')!)
  }
  /** A group's bus: an unshaped kick goes oscillator → envelope → its group's bus. */
  const group = (letter: string): FakeNode => kick(`${letter}1`)[2]!
  const made = (kind: string): FakeNode[] => ctx.nodes.filter((n) => n.kind === kind)
  return { ctx, synth, out, kick, group, made }
}

describe('Synth graph', () => {
  it('plays a card without effect lines as before: voice → group bus → dry → the Play’s bus → out', () => {
    const { out, kick } = setup(fxOf())
    const path = kick('A7')
    expect(path.map((n) => n.kind)).toEqual(['osc', 'gain', 'gain', 'gain', 'gain', 'gain', 'compressor', 'destination'])
    expect(path[5]).toBe(out)
    // Nothing on the way changes the level.
    for (const n of path.slice(2, 5)) {
      expect(n.gain.value).toBe(1)
      expect(n.gain.calls).toEqual([])
    }
  })

  it('builds each effect and joins its return to the bus', () => {
    for (const type of ['delay', 'reverb', 'distortion', 'chorus', 'filter', 'compressor']) {
      const { out, group, made, ctx } = setup(fxOf(`fx ${type} 60 40`, 'send A 20 B 40'))
      const a = group('A')
      const send = a.to[1]!
      expect(send.gain.value).toBeCloseTo(0.2)
      // The send's effect comes back to the bus, then out.
      expect(reaches(send, out)).toBe(true)
      const inputs = { delay: 'delay', reverb: 'convolver', distortion: 'shaper', chorus: 'gain', filter: 'filter', compressor: 'compressor' }
      expect(send.to[0]!.kind).toBe(inputs[type as keyof typeof inputs])
      if (type === 'delay') {
        const [d] = made('delay')
        expect(d!.delayTime.value).toBeCloseTo(0.04 * 25 ** 0.6)
        // The feedback loop.
        const fb = d!.to.find((n) => n.kind === 'gain' && n.to.includes(d!))!
        expect(fb.gain.value).toBeCloseTo(0.85 * 0.4)
      } else if (type === 'reverb') {
        const buffer = made('convolver')[0]!.buffer as { length: number; numberOfChannels: number }
        expect(buffer.length).toBe(Math.round((0.3 + 3.7 * 0.6) * ctx.sampleRate))
        expect(buffer.numberOfChannels).toBe(2)
      } else if (type === 'distortion') {
        const shaper = made('shaper')[0]!
        expect(shaper.curve).toHaveLength(1024)
        expect(shaper.oversample).toBe('2x')
        // An insert: the dry sound gives way to the send.
        expect(a.to[0]!.gain.value).toBeCloseTo(0.8)
      } else if (type === 'chorus') {
        expect(made('delay')).toHaveLength(2)
        const lfos = made('osc').filter((n) => n.started !== null && n.to[0]?.to.length === 0)
        expect(lfos).toHaveLength(2)
        expect(made('panner')).toHaveLength(2)
      } else if (type === 'filter') {
        expect(made('filter').some((n) => n.type === 'highpass')).toBe(true)
      } else {
        const c = made('compressor').at(-1)!
        expect(c.threshold.value).toBeCloseTo(-6 - 34 * 0.6)
        expect(c.ratio.value).toBeCloseTo(8)
        expect(c.attack.value).toBeCloseTo(0.03 - 0.029 * 0.4)
      }
      // Groups without a send stay dry.
      const c = group('C')
      expect(c.to).toHaveLength(1)
      expect(c.to[0]!.gain.value).toBe(1)
    }
  })

  it('reads the filter knob both ways from 50, open at 50', () => {
    const at = (x: number): FakeNode => {
      const { made } = setup(fxOf(`fx filter ${x} 80`, 'send A 100'))
      return made('filter')[0]!
    }
    expect(at(20)).toMatchObject({ type: 'lowpass' })
    expect(at(20).frequency.value).toBeLessThan(2000)
    expect(at(80).type).toBe('highpass')
    expect(at(50).Q.value).toBeCloseTo(Math.SQRT1_2)
  })

  it('caps a reverb’s impulse at 4 s and builds it once a Play, not per hit', () => {
    const { ctx, synth, kick, made } = setup(fxOf('fx reverb 100 50', 'send A 50'))
    kick('A1', 0.1)
    kick('A2', 0.2)
    kick('A3', 0.3)
    expect(made('convolver')).toHaveLength(1)
    // The voices' noise and the one impulse.
    expect(ctx.buffers).toBe(2)
    expect((made('convolver')[0]!.buffer as { length: number }).length).toBe(4 * ctx.sampleRate)
    synth.cut()
    kick('A1', 1)
    expect(made('convolver')).toHaveLength(2)
  })

  it('puts the comp line’s compressor after the bus', () => {
    const { out, kick, made } = setup(fxOf('comp 40 60'))
    const path = kick('A7')
    const comp = made('compressor').at(-1)!
    expect(path).toContain(comp)
    expect(comp.threshold.value).toBeCloseTo(-6 - 34 * 0.4)
    expect(comp.release.value).toBeCloseTo(0.6 - 0.55 * 0.6)
    expect(reaches(comp, out)).toBe(true)
  })

  it('plays dry where the browser lacks a node, and never throws', () => {
    const ctx = new FakeContext()
    ctx.createConvolver = undefined
    ctx.createStereoPanner = undefined
    const { kick, group } = setup(fxOf('fx reverb 60 40', 'send A 50'), ctx)
    expect(group('A').to).toHaveLength(1)
    const shaped = kick('A2', 0.2, { rate: 1, level: 1, pan: -0.5, attack: 0, release: 0, mode: 'oneshot' })
    expect(shaped.some((n) => n.kind === 'panner')).toBe(false)

    const broken = new FakeContext()
    broken.createWaveShaper = () => {
      throw new Error('no WaveShaper')
    }
    const { group: g2 } = setup(fxOf('fx distortion 60 40', 'send A 50'), broken)
    expect(g2('A').to).toHaveLength(1)
    expect(g2('A').to[0]!.gain.value).toBe(1)
  })
})

describe('Synth pad shaping', () => {
  const shape = (s: Partial<Shape>): Shape => ({ rate: 1, level: 1, pan: 0, attack: 0, release: 0, mode: 'oneshot', ...s })

  it('plays level, pan, pitch, and in key mode the gate and the release', () => {
    const { kick } = setup(fxOf())
    const path = kick('A1', 1, shape({ rate: 0.5, level: 0.8, pan: -0.5, mode: 'key', release: 0.15 }))
    expect(path.map((n) => n.kind).slice(0, 5)).toEqual(['osc', 'gain', 'gain', 'panner', 'gain'])
    const [osc, , g, pan] = path
    expect(osc!.frequency.calls[0]).toEqual(['set', 155 * 0.5, 1])
    expect(pan!.pan.value).toBe(-0.5)
    // Gate 0.1 s, then the release.
    expect(g!.gain.calls).toEqual([
      ['set', 0.8, 1],
      ['set', 0.8, 1.1],
      ['linear', 0, 1.25],
    ])
  })

  it('fades in by the attack', () => {
    const { kick } = setup(fxOf())
    const g = kick('A1', 1, shape({ attack: 0.05 }))[2]!
    expect(g.gain.calls).toEqual([
      ['set', 0, 1],
      ['linear', 1, 1.05],
    ])
  })

  it('chokes a oneshot pad’s voice at its next hit, but not a chord’s notes', () => {
    const { kick } = setup(fxOf())
    const s = shape({})
    const first = kick('A1', 1, s)[2]!
    const chord = kick('A1', 1, s)[2]!
    kick('A1', 1.5, s)
    for (const g of [first, chord]) {
      expect(g.gain.calls).toEqual([
        ['set', 1, 1],
        ['cancel', 1.5],
        ['set', 1, 1.5],
        ['linear', 0, 1.505],
      ])
    }
  })

  it('lets a key pad’s voices overlap', () => {
    const { kick } = setup(fxOf())
    const s = shape({ mode: 'key', release: 0.5 })
    const first = kick('A1', 1, s)[2]!
    kick('A1', 1.05, s)
    expect(first.gain.calls.map((c) => c[0])).toEqual(['set', 'set', 'linear'])
  })
})

describe('Synth sidechain', () => {
  it('ducks the groups it names on each hit of its pad, and every duck ends back at 1', () => {
    const { kick, group } = setup(fxOf('sidechain A7 BC 30 50'))
    const a = group('A')
    const b = group('B')
    const c = group('C')
    kick('A7', 1)
    const duck = 10 ** (-18 / 20)
    // 30% is 208 ms; shape 50 is 65% back after 32.5% of it.
    const length = 0.04 + 0.56 * 0.3
    expect(b.gain.calls).toEqual([
      ['cancel', 1],
      ['set', 1, 1],
      ['linear', duck, 1.005],
      ['linear', expect.closeTo(duck + 0.65 * (1 - duck)) as unknown as number, expect.closeTo(1.005 + 0.325 * length) as unknown as number],
      ['linear', 1, expect.closeTo(1.005 + length) as unknown as number],
    ])
    expect(c.gain.calls).toHaveLength(5)
    expect(a.gain.calls).toEqual([])
    // A second duck before the first is back: it starts where the first is, and ends at 1.
    kick('A7', 1.1)
    const again = b.gain.calls.slice(5)
    expect(again[0]).toEqual(['cancel', 1.1])
    expect(again[1]![0]).toBe('linear')
    expect(again[1]![2]).toBe(1.1)
    const held = again[1]![1]!
    expect(held).toBeGreaterThan(duck)
    expect(held).toBeLessThan(1)
    expect(b.gain.calls.at(-1)).toEqual(['linear', 1, expect.closeTo(1.105 + length)])
  })

  it('starts a duck from 1 when the one before is over, not from that one’s start', () => {
    const { kick, group } = setup(fxOf('sidechain A7 B'))
    const b = group('B')
    kick('A7', 1)
    // Over by about 1.35 s: a step to 1 at the new hit pins the next ramp there.
    kick('A7', 2)
    expect(b.gain.calls.slice(5, 8)).toEqual([
      ['cancel', 2],
      ['set', 1, 2],
      ['linear', 10 ** (-18 / 20), 2.005],
    ])
  })
})

describe('Synth FX switch and cut', () => {
  it('crossfades to dry and stops the ducks, then back', () => {
    const { ctx, synth, kick, group, made } = setup(fxOf('fx distortion 50 50', 'send A 40', 'comp 50 50', 'sidechain A7 B'))
    const a = group('A')
    const b = group('B')
    const dry = a.to[0]!
    // shaper → tone → level → wet → bus.
    const wet = chain(made('shaper')[0]!)[3]!
    expect(wet.to[0]).toBe(dry.to[0])
    expect(dry.gain.value).toBeCloseTo(0.6)
    kick('A7', 1)
    ctx.currentTime = 0.5
    synth.setFxOn(false)
    expect(wet.gain.calls).toEqual([
      ['cancel', 0.5],
      ['target', 0, 0.5, 0.01],
    ])
    expect(dry.gain.calls.at(-1)).toEqual(['target', 1, 0.5, 0.01])
    // The duck scheduled for 1 s is dropped: back to 1 now.
    expect(b.gain.calls.at(-1)).toEqual(['linear', 1, 0.53])
    const n = b.gain.calls.length
    kick('A7', 2)
    expect(b.gain.calls).toHaveLength(n)
    synth.setFxOn(true)
    expect(wet.gain.calls.at(-1)).toEqual(['target', 1, 0.5, 0.01])
    expect(dry.gain.calls.at(-1)).toEqual(['target', expect.closeTo(0.6), 0.5, 0.01])
  })

  it('a new graph starts dry while the switch is off', () => {
    const { synth, group } = setup(fxOf('fx distortion 50 50', 'send A 40'))
    synth.setFxOn(false)
    synth.cut()
    expect(group('A').to[0]!.gain.value).toBe(1)
  })

  describe('cut', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('fades the bus and the wet return, then lets go of the whole graph and stops the LFOs', () => {
      const { ctx, synth, kick, made, out } = setup(fxOf('fx chorus 60 40', 'send A 50', 'comp 40 60', 'sidechain A7 A'))
      // The Play's graph, built in setup: everything after the synth's own limiter and out.
      const graph = ctx.nodes.slice(2)
      const path = kick('A7', 0.1)
      const bus = path[4]!
      const wet = made('gain').find((n) => n.to[0] === bus && reaches(made('delay')[0]!, n))!
      expect(wet).toBeDefined()
      ctx.currentTime = 0.2
      synth.cut()
      const faded = [
        ['set', 1, 0.2],
        ['linear', 0, expect.closeTo(0.215)],
      ]
      expect(bus.gain.calls.slice(-2)).toEqual(faded)
      expect(wet.gain.calls.slice(-2)).toEqual(faded)
      vi.runAllTimers()
      const lfos = made('osc').filter((n) => n.started === 0)
      expect(lfos).toHaveLength(2)
      expect(lfos.every((n) => n.stopped)).toBe(true)
      // The voices' own nodes end by themselves once the bus is gone.
      for (const n of graph) expect(n.disconnected, n.kind).toBe(true)
      expect(out.disconnected).toBe(false)
    })
  })
})

describe('Player with effect lines', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('builds the graph at Play, before the first hit, and Stop tears it down', () => {
    const card = parseBeatCard(['ARC BEAT 1', 'fx reverb 60 40', 'send A 30', '[A] bars 1 step 1/16', 'A7 kick | X... .... .... .... |'].join('\n'))
    const view = viewGroups(card)[0]!
    const ctx = new FakeContext()
    const player = new Player(new Synth(ctx as unknown as AudioContext))
    player.setFx(cardFx(card))
    player.setLoops([{ length: view.group.length, hits: groupHits(card, view, 50) }])
    player.start()
    const conv = ctx.nodes.find((n) => n.kind === 'convolver')!
    const firstOsc = ctx.nodes.findIndex((n) => n.kind === 'osc')
    expect(ctx.nodes.indexOf(conv)).toBeLessThan(firstOsc)
    player.stop()
    vi.runAllTimers()
    expect(conv.disconnected).toBe(true)
  })
})
