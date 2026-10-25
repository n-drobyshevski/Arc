// Stand-in drum and bass voices made with Web Audio (no samples: the view runs
// with no network, and these are not the EP-133's sounds anyway). Each voice
// is a few oscillators or a noise burst with a short envelope, played at an
// exact AudioContext time so the player can schedule ahead.
//
// Every voice goes through a bus, a gain node of its own for each Play: Stop
// (cut) fades that bus out at once, which silences the voices already handed
// over for the lookahead and the long bass and keys notes still ringing, and
// the next Play gets a new bus.

import type { Voice } from './model'

const midiHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12)

/** How long cut() takes to fade a bus out: short, without a click. */
const FADE_S = 0.015

export class Synth {
  readonly ctx: AudioContext
  private readonly out: GainNode
  private readonly noise: AudioBuffer
  /** Where this Play's voices go (see cut). */
  private bus: GainNode

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    comp.connect(ctx.destination)
    this.out = ctx.createGain()
    this.out.gain.value = 0.7
    this.out.connect(comp)
    this.bus = this.newBus()
    // One second of white noise, shared by the noisy voices.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }

  private newBus(): GainNode {
    const bus = this.ctx.createGain()
    bus.connect(this.out)
    return bus
  }

  /** Silences every voice played so far, sounding or still to start: fades their bus out, then lets it go. */
  cut(): void {
    const bus = this.bus
    const now = this.ctx.currentTime
    bus.gain.cancelScheduledValues(now)
    bus.gain.setValueAtTime(1, now)
    bus.gain.linearRampToValueAtTime(0, now + FADE_S)
    setTimeout(() => bus.disconnect(), FADE_S * 1000 + 50)
    this.bus = this.newBus()
  }

  /** Plays [voice] at [time] (AudioContext seconds), velocity 1-127, for [gate] seconds where the voice holds. */
  play(voice: Voice, time: number, vel: number, gate: number, midi: number | null): void {
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
        return this.bass(time, level, gate, midi ?? 36)
      case 'keys':
        return this.keys(time, level, gate, midi ?? 60)
    }
  }

  /** A gain node that rises at [time] to [peak] and decays to silence over [decay] seconds. */
  private env(time: number, peak: number, decay: number, attack = 0.002): GainNode {
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, time)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay)
    g.connect(this.bus)
    return g
  }

  private osc(type: OscillatorType, freq: number, time: number, stop: number, to: AudioNode): OscillatorNode {
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, time)
    o.connect(to)
    o.start(time)
    o.stop(stop)
    return o
  }

  private noiseBurst(time: number, length: number, to: AudioNode): void {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    src.connect(to)
    src.start(time, Math.random() * 0.5)
    src.stop(time + length)
  }

  private filter(type: BiquadFilterType, freq: number, q: number, to: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    f.connect(to)
    return f
  }

  private kick(t: number, level: number): void {
    const g = this.env(t, level * 1.1, 0.42)
    const o = this.osc('sine', 155, t, t + 0.5, g)
    o.frequency.exponentialRampToValueAtTime(48, t + 0.13)
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
    o.frequency.exponentialRampToValueAtTime(110, t + 0.3)
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
