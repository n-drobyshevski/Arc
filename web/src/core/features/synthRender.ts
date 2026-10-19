// Port of core/src/main/kotlin/dev/arc/ep133/features/SynthVoice.kt (its render, pcmBytes and wav)
//
// Web addition: SynthVoice's making of a sound, split from synthVoice.ts so it
// is a chunk of its own (the controller loads it with import() when a synth
// row is played or IMPORT makes one). The maths is the Kotlin's, step for
// step, as synthVoice.ts' header says: doubles only, in the order written,
// the noise a 32-bit LCG (Math.imul, |0 and >>> for Kotlin's Int wrap and
// ushr). The samples are an Int16Array where the Kotlin has a ShortArray.

import { SYNTH_CHORD_INTERVALS, type CardSynth, type SynthWave } from './beatCard'
import { toWavBytes } from './sampleEdit'
import { SEMI, SynthVoice } from './synthVoice'

const R = 46875.0
const MS = 46.875

/** The six square partials of `metal`, as the 808's hat has them. */
const METAL: readonly number[] = [1.0, 1.48271, 1.80029, 2.54603, 2.6303, 3.89674]

// A one-pole step that settles over about [ms].
function coef(ms: number): number {
  return 1.0 / (1.0 + ms * MS)
}

// About sin(2 pi p) for p in [0, 1), within about 0.001: a parabola, corrected.
function sine(p: number): number {
  const t = p < 0.5 ? 2.0 * p : 2.0 * p - 2.0
  const a = Math.abs(t)
  const y = 4.0 * t * (1.0 - a)
  return 0.225 * (y * Math.abs(y) - y) + y
}

function tri(p: number): number {
  if (p < 0.25) return 4.0 * p
  if (p < 0.75) return 2.0 - 4.0 * p
  return 4.0 * p - 4.0
}

// The band-limited step's correction near a jump, so a saw or square doesn't alias.
function blep(p: number, dt: number): number {
  if (p < dt) {
    const x = p / dt
    return x + x - x * x - 1.0
  }
  if (p > 1.0 - dt) {
    const x = (p - 1.0) / dt
    return x * x + x + x + 1.0
  }
  return 0.0
}

// One sample of a sine, tri, saw or square at phase [p].
function waveAt(w: SynthWave, p: number, dt: number): number {
  if (w === 'sine') return sine(p)
  if (w === 'tri') return tri(p)
  if (w === 'saw') return 2.0 * p - 1.0 - blep(p, dt)
  let q = p + 0.5
  if (q >= 1.0) q = q - 1.0
  return (p < 0.5 ? 1.0 : -1.0) + blep(p, dt) - blep(q, dt)
}

function softClip(x: number): number {
  if (x > 3.0) return 1.0
  if (x < -3.0) return -1.0
  return (x * (27.0 + x * x)) / (27.0 + 9.0 * (x * x))
}

/** The sound as 16-bit samples: the first and last are 0, and the peak is 29204 times its level (all 0 when silent). */
function render(s: CardSynth): Int16Array {
  const r = SynthVoice.resolve(s)
  const n0 = SynthVoice.framesOf(r)
  const ka = r.attack / 100.0
  const kd = r.decay / 100.0
  const kt = r.tone / 100.0
  const kr = r.reso / 100.0
  const kb = r.bend / 100.0
  const kc = r.click / 100.0
  const kn = r.noise / 100.0
  const kdr = r.drive / 100.0
  const kdt = r.detune / 100.0
  const ksw = r.sweep / 100.0
  const attackMs = 2000.0 * (ka * ka * ka)
  const decayMs = r.dLo + (r.dHi - r.dLo) * (kd * kd)
  const cutoff = r.cLo + (r.cHi - r.cLo) * (kt * kt * kt)
  const q = 0.6 + 7.4 * kr
  const bendMult = 1.0 + 15.0 * (kb * kb)
  const noiseGain = 1.5 * kn
  const driveGain = 1.0 + 9.0 * kdr
  const cents = 40.0 * kdt
  const fmIndex = 0.5 + 7.5 * kt
  const level = r.level / 100.0
  const hz = SynthVoice.noteHz(r.note)
  const c = cents * 0.0005776226504666211
  // The voices: chord notes from the root up, each as -c, 0, +c when detuned.
  const ratios: number[] = []
  for (const i of SYNTH_CHORD_INTERVALS[r.chord]) {
    const iv = SEMI[i % 12]! * (i >= 12 ? 2.0 : 1.0)
    if (cents > 0.0) {
      ratios.push(iv * (1.0 - c))
      ratios.push(iv)
      ratios.push(iv * (1.0 + c))
    } else {
      ratios.push(iv)
    }
  }
  const nv = ratios.length
  const bell = r.type === 'bell'
  const rise = r.type === 'riser'
  const phase = Array.from({ length: nv }, () => new Float64Array(6))
  const mod = new Float64Array(nv)
  // The noise: a 32-bit LCG, wrapping as an Int does; its top 24 bits are the sample.
  let seed = (1592590336 + 7919 * SynthVoice.ordinal(r.type) + 104729 * r.seed) | 0
  const aN = Math.trunc(Math.floor(attackMs * MS))
  const keepD = 1.0 - coef(decayMs)
  const keepBurst = 1.0 - coef(2.0)
  const keepS = r.snap === null ? null : 1.0 - coef(10.0 + 990.0 * ((r.snap / 100.0) * (r.snap / 100.0)))
  const keepF = 1.0 - coef(0.5 * decayMs)
  const keepC = 1.0 - coef(1.0)
  const keepB = 1.0 - coef(r.bendMs)
  const rN = Math.min(Math.trunc(Math.floor(decayMs * MS)), Math.trunc(n0 / 2))
  let d = 1.0
  let e = 1.0
  let ns = 1.0
  let fe = 1.0
  let ec = 1.0
  let bf = 1.0
  let ic1 = 0.0
  let ic2 = 0.0
  const y = new Float64Array(n0)
  for (let n = 0; n < n0; n++) {
    // 1. Noise: exactly one draw a sample, always.
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0
    const w = ((seed >>> 8) / 16777216.0) * 2.0 - 1.0
    // 2. Envelopes, as they are for this sample.
    const ramp = aN > 0 && n < aN ? n / aN : 1.0
    let env: number
    if (r.shape === 'PERC') {
      env = ramp * d
    } else if (r.shape === 'CLAP') {
      if (n < 1407) {
        if (n % 469 === 0) e = 1.0
        env = ramp * e
      } else {
        env = ramp * d
      }
    } else {
      const rel = rN > 0 && n >= n0 - rN ? (n0 - n) / rN : 1.0
      env = ramp * rel
    }
    const envN = keepS === null ? env : ramp * ns
    // 3. Pitch, with the bend falling away.
    const f = hz * (1.0 + (bendMult - 1.0) * bf)
    // 4. Oscillators.
    let o = 0.0
    if (r.wave !== 'none') {
      let acc = 0.0
      for (let v = 0; v < nv; v++) {
        const fv = f * ratios[v]!
        let off = 0.0
        if (bell) off = fmIndex * 0.15915494309189535 * sine(mod[v]!) * env
        const ph = phase[v]!
        if (r.wave === 'metal') {
          let sm = 0.0
          for (let j = 0; j < 6; j++) {
            let dt = (fv * METAL[j]!) / R
            if (dt > 0.45) dt = 0.45
            let pp = ph[j]!
            if (bell) {
              pp = pp + off
              pp = pp - Math.floor(pp)
            }
            sm = sm + (pp < 0.5 ? 1.0 : -1.0)
            ph[j] = ph[j]! + dt
            if (ph[j]! >= 1.0) ph[j] = ph[j]! - 1.0
          }
          acc = acc + sm / 6.0
        } else {
          let dt = fv / R
          if (dt > 0.45) dt = 0.45
          let pp = ph[0]!
          if (bell) {
            pp = pp + off
            pp = pp - Math.floor(pp)
          }
          acc = acc + waveAt(r.wave, pp, dt)
          ph[0] = ph[0]! + dt
          if (ph[0]! >= 1.0) ph[0] = ph[0]! - 1.0
        }
        if (bell) {
          let dm = (fv * 3.5) / R
          if (dm > 0.45) dm = 0.45
          mod[v] = mod[v]! + dm
          if (mod[v]! >= 1.0) mod[v] = mod[v]! - 1.0
        }
      }
      o = acc / nv
    }
    // 5. Mix.
    const x = o * env + w * noiseGain * envN
    // 6. Filter: a state-variable filter (Simper's TPT form) in doubles, retuned every sample.
    let out: number
    if (r.filter !== 'NONE') {
      const base = rise ? cutoff * (0.125 + 0.875 * (ramp * ramp)) : cutoff
      const cut = base + (18000.0 - base) * ksw * fe
      const h = cut > 18750.0 ? 18750.0 : cut
      const w0 = (3.141592653589793 * h) / R
      const w2 = w0 * w0
      const g = (w0 * (15.0 - w2)) / (15.0 - 6.0 * w2)
      const kq = 1.0 / q
      const a1 = 1.0 / (1.0 + g * (g + kq))
      const a2 = g * a1
      const a3 = g * a2
      const v3 = x - ic2
      const v1 = a1 * ic1 + a2 * v3
      const v2 = ic2 + a2 * ic1 + a3 * v3
      ic1 = 2.0 * v1 - ic1
      if (Math.abs(ic1) < 1e-30) ic1 = 0.0
      ic2 = 2.0 * v2 - ic2
      if (Math.abs(ic2) < 1e-30) ic2 = 0.0
      out = r.filter === 'LP' ? v2 : r.filter === 'BP' ? v1 : x - kq * v1 - v2
    } else {
      out = x
    }
    // 7. Click, after the filter.
    y[n] = out + kc * w * ec
    // 8. State updates, in this order.
    if (r.shape === 'PERC' && n >= aN) d = d * keepD
    if (r.shape === 'CLAP') {
      if (n < 1407) e = e * keepBurst
      else d = d * keepD
    }
    if (keepS !== null && n >= aN) ns = ns * keepS
    fe = fe * keepF
    ec = ec * keepC
    bf = bf * keepB
  }
  // Pass 2: normalise, drive, fades.
  let peak = 0.0
  for (const v of y) if (Math.abs(v) > peak) peak = Math.abs(v)
  if (peak > 0.0) {
    const inv = 1.0 / peak
    for (let n = 0; n < n0; n++) y[n] = y[n]! * inv
  }
  if (r.drive > 0) {
    for (let n = 0; n < n0; n++) y[n] = softClip(y[n]! * driveGain)
  }
  for (let n = 0; n < Math.min(8, n0); n++) y[n] = y[n]! * (n / 8.0)
  const fade = Math.min(256, Math.trunc(n0 / 4))
  for (let n = n0 - fade; n < n0; n++) y[n] = y[n]! * ((n0 - 1 - n) / fade)
  // Pass 3: level and 16 bits.
  peak = 0.0
  for (const v of y) if (Math.abs(v) > peak) peak = Math.abs(v)
  const gain = peak > 0.0 ? (0.8912509381337456 * level) / peak : 0.0
  const out = new Int16Array(n0)
  for (let i = 0; i < n0; i++) out[i] = Math.min(Math.max(Math.floor(y[i]! * gain * 32767.0 + 0.5), -32768.0), 32767.0)
  return out
}

/** [pcm] as 16-bit little-endian bytes. */
function pcmBytes(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(pcm.length * 2)
  for (let i = 0; i < pcm.length; i++) {
    const v = pcm[i]!
    out[2 * i] = v & 0xff
    out[2 * i + 1] = (v >> 8) & 0xff
  }
  return out
}

/** The sound as a WAV file: 46875 Hz, mono, 16 bits, no settings chunk. */
function wav(s: CardSynth): Uint8Array {
  return toWavBytes(render(s), 1, SynthVoice.RATE)
}

/** SynthVoice's render, pcmBytes and wav (see the header). */
export const SynthRender = { render, pcmBytes, wav } as const
