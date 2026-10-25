// Stand-in drum and bass voices made with Web Audio (no samples: the view runs
// with no network, and these are not the EP-133's sounds anyway). Each voice
// is a few oscillators or a noise burst with a short envelope, played at an
// exact AudioContext time so the player can schedule ahead.
//
// Every voice goes through a bus, a gain node of its own for each Play: Stop
// (cut) fades that bus out at once, which silences the voices already handed
// over for the lookahead and the long bass and keys notes still ringing, and
// the next Play gets a new bus.
//
// The bus is the end of a graph built for each Play from the card's effect
// lines (Graph): voice → its pad's shaping (a gain for level, attack, gate
// and release, and a StereoPanner for pan) → its group's bus, A-D → dry gain
// → the Play's bus. Each group bus also feeds a send gain (send / 100) → the
// master effect → wet gain → the Play's bus, so the effect's tail fades with
// the bus too. Then the bus → the comp line's compressor (when on) → out →
// the safety limiter → destination. The sidechain ducks the group buses. Cut
// lets go of the whole graph once it has faded. The FX switch crossfades the
// wet, dry and comp gains and stops the ducks; it never rebuilds the graph.
//
// The effects are an approximation of arc's, made of stock nodes; each knob's
// mapping is at its builder. A browser without a node an effect needs
// (ConvolverNode, StereoPanner) plays that part dry.

import type { BeatCardFx, BeatCardSidechain } from '../../../web/src/core/formats/beatCard'
import { OWN_MIDI, type CardFx, type Hit, type Shape, type Voice } from './model'

const midiHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12)

/** How long cut() takes to fade a bus out: short, without a click. */
const FADE_S = 0.015
/** How long the FX switch takes to cross over. */
const SWITCH_S = 0.03
/** How long a monophonic pad's voice takes to fade when the next one chokes it. */
const CHOKE_S = 0.005
/** The sidechain pulls a group down by about 18 dB, this fast. */
const DUCK_GAIN = 10 ** (-18 / 20)
const DUCK_ATTACK_S = 0.005
/** A reverb's generated impulse is never longer than this. */
const REVERB_MAX_S = 4

const GROUPS = ['A', 'B', 'C', 'D'] as const

/** Effects that take the dry sound's place as the send rises; delay, reverb and chorus add to it (analysis.md). */
const INSERTS: readonly string[] = ['distortion', 'filter', 'compressor']

const NO_FX: CardFx = { fx: null, sends: null, comp: null, sidechain: null }

/**
 * An AudioParam moved only by steps and linear ramps, with a copy of its
 * course so hold() can stop it anywhere without a jump: cancel, then a ramp
 * to the value the course has there when a ramp is under way (exact, since
 * every segment is a straight line), else a step to it. Not
 * cancelAndHoldAtTime: with nothing scheduled after the time it adds no
 * event, and the next ramp would start from the last one before.
 */
class Course {
  private points: { t: number; v: number; ramp: boolean }[]

  constructor(
    private readonly param: AudioParam,
    v: number,
  ) {
    this.points = [{ t: 0, v, ramp: false }]
  }

  set(v: number, t: number): void {
    this.param.setValueAtTime(v, t)
    this.points.push({ t, v, ramp: false })
  }

  ramp(v: number, t: number): void {
    this.param.linearRampToValueAtTime(v, t)
    this.points.push({ t, v, ramp: true })
  }

  valueAt(t: number): number {
    let v = this.points[0]!.v
    let at = this.points[0]!.t
    for (const p of this.points) {
      if (p.t > t) return p.ramp ? v + ((p.v - v) * (t - at)) / (p.t - at) : v
      v = p.v
      at = p.t
    }
    return v
  }

  /** Drops the course from [t] on, staying at its value there. */
  hold(t: number): void {
    const v = this.valueAt(t)
    const ramp = this.points.find((p) => p.t >= t)?.ramp ?? false
    this.param.cancelScheduledValues(t)
    if (ramp) this.param.linearRampToValueAtTime(v, t)
    else this.param.setValueAtTime(v, t)
    this.points = [...this.points.filter((p) => p.t < t).slice(-1), { t, v, ramp }]
  }
}

interface GroupBus {
  /** The group's bus: the sidechain ducks its gain. */
  readonly bus: GainNode
  readonly duck: Course
  /** To the Play's bus; less of it as an insert effect's send rises. */
  readonly dry: GainNode
  /** The dry gain with the FX on. */
  readonly dryOn: number
}

/** A voice of a monophonic pad (oneshot, legato), for the next hit to choke. */
interface MonoVoice {
  readonly gain: Course
  readonly time: number
  /** When its gate ends. */
  readonly until: number
}

/** One Play's nodes (see the top of the file). */
interface Graph {
  readonly bus: GainNode
  readonly groups: ReadonlyMap<string, GroupBus>
  /** The master effect's return; null without one. */
  readonly wet: GainNode | null
  /** The comp line's compressor's output and the way round it; null without one. */
  readonly comp: { readonly on: GainNode; readonly off: GainNode } | null
  readonly sidechain: BeatCardSidechain | null
  /** Every node above, let go of after cut. */
  readonly nodes: AudioNode[]
  /** The chorus's LFOs, stopped after cut. */
  readonly sources: AudioScheduledSourceNode[]
  /** By pad. */
  readonly mono: Map<string, MonoVoice[]>
}

/** What an effect builder makes: where the sends go in and where the wet sound comes out. */
interface Unit {
  readonly input: AudioNode
  readonly output: AudioNode
}

/** Keeps a node in the Play's graph (to let go of after cut) and hands it back. */
type Keep = <T extends AudioNode>(node: T) => T

export class Synth {
  readonly ctx: AudioContext
  private readonly out: GainNode
  private readonly noise: AudioBuffer
  /** This Play's graph, built at its first hit (or begin); null after cut. */
  private graph: Graph | null = null
  private fx: CardFx = NO_FX
  private fxOn = true
  /** The voice being made: its frequency factor (a drum pad's pitch) and where it goes. */
  private rate = 1
  private dest: AudioNode

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    comp.connect(ctx.destination)
    this.out = ctx.createGain()
    this.out.gain.value = 0.7
    this.out.connect(comp)
    this.dest = this.out
    // One second of white noise, shared by the noisy voices.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }

  /** The card's effect lines. A Play built with other ones is cut; the next hit builds the new graph. */
  setFx(fx: CardFx): void {
    if (JSON.stringify(fx) === JSON.stringify(this.fx)) return
    this.fx = fx
    this.cut()
  }

  /** The FX switch: off plays every group dry, with no comp and no sidechain. Crossfades while playing. */
  setFxOn(on: boolean): void {
    if (on === this.fxOn) return
    this.fxOn = on
    const graph = this.graph
    if (graph === null) return
    const now = this.ctx.currentTime
    const fade = (node: GainNode, v: number): void => {
      node.gain.cancelScheduledValues(now)
      node.gain.setTargetAtTime(v, now, SWITCH_S / 3)
    }
    if (graph.wet) fade(graph.wet, on ? 1 : 0)
    if (graph.comp) {
      fade(graph.comp.on, on ? 1 : 0)
      fade(graph.comp.off, on ? 0 : 1)
    }
    for (const g of graph.groups.values()) {
      fade(g.dry, on ? g.dryOn : 1)
      if (!on) {
        // Ducks already scheduled for the lookahead are dropped.
        g.duck.hold(now)
        g.duck.ramp(1, now + SWITCH_S)
      }
    }
  }

  /** Builds this Play's graph now, so the first hit doesn't wait for it (a reverb's impulse takes a moment). */
  begin(): void {
    this.live()
  }

  private live(): Graph {
    return (this.graph ??= this.build())
  }

  /** Silences every voice played so far, sounding or still to start: fades their bus out, then lets it go. */
  cut(): void {
    const graph = this.graph
    if (graph === null) return
    this.graph = null
    const bus = graph.bus
    const now = this.ctx.currentTime
    bus.gain.cancelScheduledValues(now)
    bus.gain.setValueAtTime(1, now)
    bus.gain.linearRampToValueAtTime(0, now + FADE_S)
    // The effect's tail too, though it goes through the bus.
    if (graph.wet) {
      graph.wet.gain.cancelScheduledValues(now)
      graph.wet.gain.setValueAtTime(graph.wet.gain.value, now)
      graph.wet.gain.linearRampToValueAtTime(0, now + FADE_S)
    }
    setTimeout(() => {
      for (const s of graph.sources) {
        try {
          s.stop()
        } catch {
          // Already stopped.
        }
      }
      for (const n of graph.nodes) n.disconnect()
    }, FADE_S * 1000 + 50)
  }

  private build(): Graph {
    const ctx = this.ctx
    const nodes: AudioNode[] = []
    const sources: AudioScheduledSourceNode[] = []
    const keep: Keep = (node) => {
      nodes.push(node)
      return node
    }
    const gain = (v: number, to: AudioNode): GainNode => {
      const g = keep(ctx.createGain())
      g.gain.value = v
      g.connect(to)
      return g
    }
    const on = this.fxOn
    const bus = keep(ctx.createGain())

    let comp: Graph['comp'] = null
    const c = this.fx.comp
    if (c !== null && c !== 'off') {
      const k = keep(compressor(ctx, c.drive, c.speed))
      comp = { on: gain(on ? 1 : 0, this.out), off: gain(on ? 0 : 1, this.out) }
      k.connect(comp.on)
      bus.connect(k)
      bus.connect(comp.off)
    } else bus.connect(this.out)

    const fx = this.fx.fx
    const unit = fx !== null && fx.type !== 'none' ? effect(ctx, fx, keep, sources) : null
    const wet = unit ? gain(on ? 1 : 0, bus) : null
    if (unit && wet) unit.output.connect(wet)
    const insert = fx !== null && INSERTS.includes(fx.type)

    const groups = new Map<string, GroupBus>()
    for (const letter of GROUPS) {
      const send = unit ? (this.fx.sends?.[letter] ?? 0) / 100 : 0
      const dryOn = insert ? 1 - send : 1
      const dry = gain(on ? dryOn : 1, bus)
      const g = gain(1, dry)
      if (unit && send > 0) g.connect(gain(send, unit.input))
      groups.set(letter, { bus: g, duck: new Course(g.gain, 1), dry, dryOn })
    }
    const side = this.fx.sidechain
    return {
      bus,
      groups,
      wet,
      comp,
      sidechain: side !== null && side !== 'off' ? side : null,
      nodes,
      sources,
      mono: new Map(),
    }
  }

  /** Plays [hit] at [time] (AudioContext seconds) for [gate] seconds where the voice holds, through its pad's shaping. */
  play(hit: Hit, time: number, gate: number): void {
    const graph = this.live()
    const group = graph.groups.get(hit.pad[0] ?? '')
    const to = group?.bus ?? graph.bus
    const side = graph.sidechain
    if (side !== null && this.fxOn && side.pad === hit.pad) {
      for (const g of side.groups) {
        const ducked = graph.groups.get(g)
        if (ducked) duck(ducked.duck, time, side)
      }
    }
    const shape = hit.shape
    // In key and legato the sound goes on through the release, which the shaping gain fades.
    const held = shape && shape.mode !== 'oneshot' ? gate + shape.release : gate
    this.rate = shape?.rate ?? 1
    this.dest = shape ? this.shaping(graph, hit.pad, shape, time, gate, to) : to
    try {
      this.voice(hit.voice, time, hit.vel, held, hit.midi)
    } finally {
      this.rate = 1
      this.dest = this.out
    }
  }

  /**
   * The gain (and panner) a shaped pad's voice goes through: its level, its
   * attack, and in key and legato the gate and release. A oneshot or legato
   * pad is monophonic: its new voice chokes the ones before (notes of one
   * chord, at one time, all play). Legato continues: a note that comes while
   * the one before is held starts without its attack.
   */
  private shaping(graph: Graph, pad: string, s: Shape, t: number, gate: number, to: AudioNode): AudioNode {
    let out = to
    if (s.pan !== 0 && typeof this.ctx.createStereoPanner === 'function') {
      try {
        const p = this.ctx.createStereoPanner()
        p.pan.value = s.pan
        p.connect(to)
        out = p
      } catch {
        // Plays in the centre.
      }
    }
    const g = this.ctx.createGain()
    g.connect(out)
    const course = new Course(g.gain, 1)
    const before = graph.mono.get(pad) ?? []
    const earlier = before.filter((v) => v.time < t - 1e-4)
    const attack = s.mode === 'legato' && earlier.some((v) => v.until > t) ? 0 : s.attack
    const end = s.mode === 'oneshot' ? Infinity : gate
    const peak = attack > 0 ? s.level * Math.min(1, end / attack) : s.level
    if (attack > 0) {
      course.set(0, t)
      course.ramp(peak, t + Math.min(attack, end))
    } else course.set(peak, t)
    if (end !== Infinity) {
      course.set(peak, t + end)
      course.ramp(0, t + end + Math.max(CHOKE_S, s.release))
    }
    if (s.mode !== 'key') {
      for (const v of earlier) {
        v.gain.hold(t)
        v.gain.ramp(0, t + CHOKE_S)
      }
      graph.mono.set(pad, [...before.filter((v) => v.time >= t - 1e-4), { gain: course, time: t, until: t + gate }])
    }
    return g
  }

  /** Plays [voice] at [time], velocity 1-127, for [gate] seconds where the voice holds. */
  private voice(voice: Voice, time: number, vel: number, gate: number, midi: number | null): void {
    const level = Math.max(0.05, vel / 127) ** 1.4
    switch (voice) {
      case 'kick':
        return this.kick(time, level)
      case 'snare':
        return this.snare(time, level)
      case 'clap':
        return this.clap(time, level)
      case 'hat':
        return this.hat(time, level, 0.05)
      case 'openhat':
        return this.hat(time, level, Math.min(0.6, Math.max(0.22, gate)))
      case 'perc':
        return this.perc(time, level)
      case 'tom':
        return this.tom(time, level)
      case 'bass':
        return this.bass(time, level, gate, midi ?? OWN_MIDI.bass)
      case 'keys':
        return this.keys(time, level, gate, midi ?? OWN_MIDI.keys)
    }
  }

  /** A gain node that rises at [time] to [peak] and decays to silence over [decay] seconds. */
  private env(time: number, peak: number, decay: number, attack = 0.002): GainNode {
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, time)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay)
    g.connect(this.dest)
    return g
  }

  private osc(type: OscillatorType, freq: number, time: number, stop: number, to: AudioNode): OscillatorNode {
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq * this.rate, time)
    o.connect(to)
    o.start(time)
    o.stop(stop)
    return o
  }

  private noiseBurst(time: number, length: number, to: AudioNode): void {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    if (this.rate !== 1) src.playbackRate.value = this.rate
    src.connect(to)
    src.start(time, Math.random() * 0.5)
    src.stop(time + length)
  }

  private filter(type: BiquadFilterType, freq: number, q: number, to: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq * this.rate
    f.Q.value = q
    f.connect(to)
    return f
  }

  private kick(t: number, level: number): void {
    const g = this.env(t, level * 1.1, 0.42)
    const o = this.osc('sine', 155, t, t + 0.5, g)
    o.frequency.exponentialRampToValueAtTime(48 * this.rate, t + 0.13)
    // The beater's click.
    this.osc('triangle', 900, t, t + 0.012, this.env(t, level * 0.25, 0.01))
  }

  private snare(t: number, level: number): void {
    this.osc('triangle', 190, t, t + 0.15, this.env(t, level * 0.55, 0.11))
    this.noiseBurst(t, 0.25, this.filter('highpass', 1200, 0.7, this.env(t, level * 0.7, 0.2)))
  }

  private clap(t: number, level: number): void {
    // Three quick bursts, then the room.
    for (const d of [0, 0.011, 0.022]) {
      this.noiseBurst(t + d, 0.02, this.filter('bandpass', 1300, 1.2, this.env(t + d, level * 0.7, 0.012)))
    }
    this.noiseBurst(t + 0.03, 0.25, this.filter('bandpass', 1100, 0.9, this.env(t + 0.03, level * 0.6, 0.18)))
  }

  private hat(t: number, level: number, decay: number): void {
    this.noiseBurst(t, decay + 0.05, this.filter('highpass', 7200, 0.8, this.env(t, level * 0.45, decay)))
  }

  private perc(t: number, level: number): void {
    const g = this.env(t, level * 0.5, 0.07)
    this.osc('square', 820, t, t + 0.1, this.filter('bandpass', 1700, 3, g))
    this.osc('triangle', 520, t, t + 0.1, g)
  }

  private tom(t: number, level: number): void {
    const o = this.osc('sine', 210, t, t + 0.45, this.env(t, level * 0.9, 0.36))
    o.frequency.exponentialRampToValueAtTime(110 * this.rate, t + 0.3)
  }

  private bass(t: number, level: number, gate: number, midi: number): void {
    const hold = Math.min(1.5, Math.max(0.12, gate))
    const g = this.env(t, level * 0.6, hold, 0.004)
    const lp = this.filter('lowpass', 520, 4, g)
    lp.frequency.setValueAtTime(900, t)
    lp.frequency.exponentialRampToValueAtTime(260, t + hold)
    const hz = midiHz(midi)
    this.osc('sawtooth', hz, t, t + hold + 0.05, lp)
    this.osc('sine', hz / 2, t, t + hold + 0.05, g)
  }

  private keys(t: number, level: number, gate: number, midi: number): void {
    const hold = Math.min(2, Math.max(0.15, gate))
    const g = this.env(t, level * 0.3, hold, 0.006)
    const lp = this.filter('lowpass', 2400, 0.7, g)
    const hz = midiHz(midi)
    this.osc('triangle', hz, t, t + hold + 0.05, lp).detune.value = -6
    this.osc('triangle', hz, t, t + hold + 0.05, lp).detune.value = 6
  }
}

/**
 * The sidechain on one group's bus: down about 18 dB at [t], then back over
 * the length, 40 to 600 ms. The shape bends the way back: 0 is a straight
 * line, 100 nearly exponential (80% back after 15% of the length). A duck
 * that comes while one is still on holds where that one is and starts from
 * there, and every duck ends back at 1.
 */
function duck(c: Course, t: number, side: BeatCardSidechain): void {
  const length = 0.04 + (0.56 * side.length) / 100
  const bend = side.shape / 100
  const down = t + DUCK_ATTACK_S
  c.hold(t)
  c.ramp(DUCK_GAIN, down)
  c.ramp(DUCK_GAIN + (0.5 + 0.3 * bend) * (1 - DUCK_GAIN), down + (0.5 - 0.35 * bend) * length)
  c.ramp(1, down + length)
}

/** The compressor of a comp line or an fx compressor: drive sets threshold -6 to -40 dB and ratio 2 to 12, speed attack 30 to 1 ms and release 600 to 50 ms. */
function compressor(ctx: BaseAudioContext, drive: number, speed: number): DynamicsCompressorNode {
  const c = ctx.createDynamicsCompressor()
  const d = drive / 100
  const s = speed / 100
  c.threshold.value = -6 - 34 * d
  c.ratio.value = 2 + 10 * d
  c.attack.value = 0.03 - 0.029 * s
  c.release.value = 0.6 - 0.55 * s
  return c
}

/** The master effect of an fx line, or null where the browser lacks a node it needs (the groups then play dry). */
function effect(ctx: BaseAudioContext, fx: BeatCardFx, keep: Keep, sources: AudioScheduledSourceNode[]): Unit | null {
  const x = fx.x / 100
  const y = fx.y / 100
  try {
    switch (fx.type) {
      case 'delay': {
        // X: the time, 40 ms to 1 s on a log scale (50 is 200 ms). Y: the feedback, 0 to 0.85.
        const d = keep(ctx.createDelay(1))
        d.delayTime.value = 0.04 * 25 ** x
        const fb = keep(ctx.createGain())
        fb.gain.value = 0.85 * y
        d.connect(fb)
        fb.connect(d)
        return { input: d, output: d }
      }
      case 'reverb': {
        // X: the size, an impulse of 0.3 to 4 s. Y: the colour, the impulse low-passed at 1 to 14 kHz.
        if (typeof ctx.createConvolver !== 'function') return null
        const conv = keep(ctx.createConvolver())
        conv.buffer = impulse(ctx, 0.3 + 3.7 * x, 1000 * 14 ** y)
        return { input: conv, output: conv }
      }
      case 'distortion': {
        // X: the drive, a tanh curve from gentle (k 1) to hard (k 50). Y: the colour, a low-pass at 800 Hz to 16 kHz.
        const shaper = keep(ctx.createWaveShaper())
        const k = 1 + 49 * x * x
        const curve = new Float32Array(1024)
        for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(k * ((i / (curve.length - 1)) * 2 - 1)) / Math.tanh(k)
        shaper.curve = curve
        shaper.oversample = '2x'
        const tone = keep(ctx.createBiquadFilter())
        tone.type = 'lowpass'
        tone.frequency.value = 800 * 20 ** y
        // A hard curve is louder: some of it back.
        const level = keep(ctx.createGain())
        level.gain.value = 1 - 0.4 * x
        shaper.connect(tone)
        tone.connect(level)
        return { input: shaper, output: level }
      }
      case 'chorus': {
        // Two delays swinging between 8 and 25 ms, one to each side. X: their LFOs' rate, 0.1 to 6 Hz on a log
        // scale (the second a little faster). Y: the feedback, 0 to 0.6.
        const input = keep(ctx.createGain())
        const output = keep(ctx.createGain())
        for (const [side, faster] of [
          [-0.7, 1],
          [0.7, 1.13],
        ] as const) {
          const d = keep(ctx.createDelay(0.05))
          d.delayTime.value = 0.0165
          const lfo = keep(ctx.createOscillator())
          lfo.frequency.value = 0.1 * 60 ** x * faster
          const depth = keep(ctx.createGain())
          depth.gain.value = 0.0085
          lfo.connect(depth)
          depth.connect(d.delayTime)
          lfo.start()
          sources.push(lfo)
          const fb = keep(ctx.createGain())
          fb.gain.value = 0.6 * y
          d.connect(fb)
          fb.connect(d)
          input.connect(d)
          d.connect(panned(ctx, side, output, keep))
        }
        return { input, output }
      }
      case 'filter': {
        // X: the cutoff. Below 50 a low-pass from 20 kHz down to 80 Hz, above 50 a high-pass from 20 Hz up to
        // 8 kHz, 50 open. Y: the resonance, Q 0.7 to 15 (none when open).
        const f = keep(ctx.createBiquadFilter())
        const d = (fx.x - 50) / 50
        f.type = d > 0 ? 'highpass' : 'lowpass'
        f.frequency.value = d > 0 ? 20 * 400 ** d : Math.min(20000, ctx.sampleRate / 2) * (80 / 20000) ** -d
        f.Q.value = d === 0 ? Math.SQRT1_2 : 0.7 + 14.3 * y * y
        return { input: f, output: f }
      }
      case 'compressor': {
        // X: the drive, Y: the speed, as the comp line's.
        const c = keep(compressor(ctx, fx.x, fx.y))
        return { input: c, output: c }
      }
      case 'none':
        return null
    }
  } catch {
    return null
  }
}

/** [to] behind a StereoPanner at [pan], or [to] itself where the browser has none. */
function panned(ctx: BaseAudioContext, pan: number, to: AudioNode, keep: Keep): AudioNode {
  if (typeof ctx.createStereoPanner !== 'function') return to
  const p = keep(ctx.createStereoPanner())
  p.pan.value = pan
  p.connect(to)
  return p
}

/**
 * A reverb's impulse: stereo noise fading to -60 dB over [seconds] (at most
 * REVERB_MAX_S), through a one-pole low-pass at [cutoff] Hz. The noise is
 * seeded, so a card's reverb is the same on every Play.
 */
export function impulse(ctx: BaseAudioContext, seconds: number, cutoff: number): AudioBuffer {
  const rate = ctx.sampleRate
  const length = Math.max(1, Math.round(Math.min(REVERB_MAX_S, seconds) * rate))
  const buffer = ctx.createBuffer(2, length, rate)
  const a = Math.exp((-2 * Math.PI * cutoff) / rate)
  let seed = 0x2f6b5a1d
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      lp = (1 - a) * (seed / 2 ** 31 - 1) + a * lp
      data[i] = lp * Math.exp((-6.9 * i) / length)
    }
  }
  return buffer
}
