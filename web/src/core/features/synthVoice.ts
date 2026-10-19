// Port of core/src/main/kotlin/dev/arc/ep133/features/SynthVoice.kt
//
// The sound a card's synth line makes (an addition), so that Arc and the
// skill's script (skill/arc-beats/scripts/beatcard.py, render_synth) make the
// same bytes, bit for bit. Everything is a double, one rounding a step, in the
// order written here, with standard precedence left to right: never
// reordered, factored or fused. Only + - * /, comparisons, Math.abs,
// Math.floor, Int maths (a 32-bit LCG for the noise, through Math.imul and
// |0) and min/max: no sin, exp, pow, tanh or other library function whose
// last bit can differ between runtimes, and no float32 (so not fxMath or its
// filters). The literals are written as the shortest text that reads back to
// the same double in Kotlin, Python and JS.
//
// The golden file (skill/arc-beats/scripts/test_synth_golden.txt) pins the
// frames, the PCM's CRC and the device name of every case; synthVoice.test.ts,
// SynthVoiceTest and the script's test all check it. Any change to a byte must
// bump VERSION, which renames every made sound.
//
// Web deltas:
// - The object is split in two: this file names a sound (resolve, canonical,
//   tag, deviceName, fileName, silent, frames) and is read as the beat card
//   sheet plans; synthRender.ts makes it (render, pcmBytes, wav), a chunk of
//   its own that the controller loads with import() when a sound is made or
//   played, so it stays out of the first load.
// - SynthShape and SynthFilter are string unions; SynthSpec is a readonly
//   interface, its [snap] and [length] null where the Kotlin has null.
// - crc is an unsigned number (Kotlin's Long).

import { crc32 } from '../formats/crc32'
import { SYNTH_TYPES, type CardSynth, type SynthChord, type SynthType, type SynthWave } from './beatCard'

/** How a synth's level moves: a hit that decays, a clap's bursts then a decay, or a held note with an end fade. */
export type SynthShape = 'PERC' | 'CLAP' | 'SUSTAIN'

/** A synth's filter: low pass, band pass, high pass or none (bell). */
export type SynthFilter = 'LP' | 'BP' | 'HP' | 'NONE'

/**
 * A synth line with every setting filled in (SynthVoice.resolve): what the
 * line gave, else its type's default. The knobs are 0..100; [dLo]..[dHi] is
 * the decay's range in ms, [cLo]..[cHi] the filter cutoff's in Hz and
 * [bendMs] how fast the pitch bend falls. [snap] is null when the noise has
 * no decay of its own, and [length] (hundredths of a second) when the length
 * follows the decay.
 */
export interface SynthSpec {
  readonly type: SynthType
  readonly shape: SynthShape
  readonly note: number
  readonly wave: SynthWave
  readonly chord: SynthChord
  readonly attack: number
  readonly decay: number
  readonly dLo: number
  readonly dHi: number
  readonly tone: number
  readonly cLo: number
  readonly cHi: number
  readonly filter: SynthFilter
  readonly reso: number
  readonly bend: number
  readonly bendMs: number
  readonly click: number
  readonly noise: number
  readonly snap: number | null
  readonly drive: number
  readonly detune: number
  readonly sweep: number
  readonly level: number
  readonly seed: number
  readonly length: number | null
  readonly name: string | null
}

const VERSION = 1
const RATE = 46875
const MAX_FRAMES = 187_500
const MIN_AUTO_FRAMES = 2_344

/** Semitone ratios 2^(i/12), as their shortest double text. */
export const SEMI: readonly number[] = [
  1.0, 1.0594630943592953, 1.122462048309373, 1.189207115002721, 1.2599210498948732, 1.3348398541700344,
  1.4142135623730951, 1.4983070768766815, 1.5874010519681994, 1.681792830507429, 1.7817974362806785, 1.8877486253633868,
]

// A type's defaults: the columns of the spec's table.
type Preset = Omit<SynthSpec, 'type' | 'seed' | 'name'>

function preset(
  shape: SynthShape, note: number, wave: SynthWave, chord: SynthChord, attack: number,
  decay: number, dLo: number, dHi: number, tone: number, cLo: number, cHi: number, filter: SynthFilter,
  reso: number, bend: number, bendMs: number, click: number, noise: number, snap: number | null,
  drive: number, detune: number, sweep: number, level: number, length: number | null,
): Preset {
  return { shape, note, wave, chord, attack, decay, dLo, dHi, tone, cLo, cHi, filter, reso, bend, bendMs, click, noise, snap, drive, detune, sweep, level, length }
}

const PRESETS: Readonly<Record<SynthType, Preset>> = {
  kick: preset('PERC', 31, 'sine', 'one', 0, 40, 20.0, 600.0, 30, 100.0, 12000.0, 'LP', 0, 50, 30.0, 30, 0, null, 10, 0, 0, 100, null),
  snare: preset('PERC', 54, 'sine', 'one', 0, 30, 20.0, 400.0, 70, 500.0, 16000.0, 'LP', 0, 20, 15.0, 20, 70, 40, 0, 0, 0, 100, null),
  clap: preset('CLAP', 60, 'none', 'one', 0, 35, 30.0, 500.0, 55, 400.0, 6000.0, 'BP', 20, 0, 30.0, 0, 100, null, 0, 0, 0, 80, null),
  hat: preset('PERC', 56, 'metal', 'one', 0, 15, 10.0, 300.0, 70, 2000.0, 14000.0, 'HP', 10, 0, 30.0, 0, 40, null, 0, 0, 0, 60, null),
  openhat: preset('PERC', 56, 'metal', 'one', 0, 50, 10.0, 500.0, 70, 2000.0, 14000.0, 'HP', 10, 0, 30.0, 0, 40, null, 0, 0, 0, 55, null),
  tom: preset('PERC', 43, 'sine', 'one', 0, 40, 30.0, 800.0, 30, 100.0, 8000.0, 'LP', 0, 30, 60.0, 15, 5, null, 0, 0, 0, 100, null),
  rim: preset('PERC', 81, 'tri', 'one', 0, 10, 3.0, 60.0, 60, 500.0, 8000.0, 'BP', 30, 0, 30.0, 50, 20, null, 0, 0, 0, 70, null),
  cowbell: preset('PERC', 73, 'square', 'fifth', 0, 25, 20.0, 600.0, 50, 300.0, 8000.0, 'BP', 30, 0, 30.0, 0, 0, null, 0, 0, 0, 70, null),
  sub: preset('PERC', 36, 'sine', 'one', 0, 30, 100.0, 3000.0, 40, 100.0, 8000.0, 'LP', 0, 10, 40.0, 10, 0, null, 20, 0, 0, 100, null),
  bass: preset('PERC', 36, 'saw', 'one', 0, 30, 50.0, 2000.0, 40, 80.0, 12000.0, 'LP', 20, 0, 30.0, 0, 0, null, 0, 0, 40, 100, null),
  pluck: preset('PERC', 60, 'saw', 'one', 0, 30, 30.0, 1500.0, 50, 100.0, 16000.0, 'LP', 10, 0, 30.0, 0, 0, null, 0, 0, 50, 100, null),
  stab: preset('PERC', 60, 'saw', 'min', 0, 25, 30.0, 1500.0, 55, 100.0, 16000.0, 'LP', 10, 0, 30.0, 0, 0, null, 0, 20, 40, 100, null),
  // Bell has no filter: its tone is the FM depth, so its cutoff range is unused.
  bell: preset('PERC', 72, 'sine', 'one', 0, 35, 100.0, 3000.0, 40, 0.0, 0.0, 'NONE', 0, 0, 30.0, 0, 0, null, 0, 0, 0, 100, null),
  zap: preset('PERC', 48, 'sine', 'one', 0, 25, 20.0, 600.0, 100, 200.0, 16000.0, 'LP', 0, 100, 40.0, 0, 0, null, 0, 0, 0, 100, null),
  lead: preset('SUSTAIN', 60, 'saw', 'one', 5, 30, 10.0, 1500.0, 60, 100.0, 16000.0, 'LP', 10, 0, 30.0, 0, 0, null, 0, 15, 0, 100, 100),
  pad: preset('SUSTAIN', 48, 'saw', 'min', 60, 50, 50.0, 3000.0, 45, 100.0, 12000.0, 'LP', 5, 0, 30.0, 0, 0, null, 0, 40, 0, 100, 300),
  // Riser's cutoff also rises with the attack ramp.
  riser: preset('SUSTAIN', 60, 'none', 'one', 100, 5, 10.0, 1500.0, 70, 500.0, 12000.0, 'BP', 40, 0, 30.0, 0, 100, null, 0, 0, 0, 100, 200),
}

/** [s] with every setting filled in: what the line gave, else its type's default. */
function resolve(s: CardSynth): SynthSpec {
  const p = PRESETS[s.type]
  return {
    type: s.type,
    shape: p.shape,
    note: s.note ?? p.note,
    wave: s.wave ?? p.wave,
    chord: s.chord ?? p.chord,
    attack: s.attack ?? p.attack,
    decay: s.decay ?? p.decay,
    dLo: p.dLo,
    dHi: p.dHi,
    tone: s.tone ?? p.tone,
    cLo: p.cLo,
    cHi: p.cHi,
    filter: p.filter,
    reso: s.reso ?? p.reso,
    bend: s.bend ?? p.bend,
    bendMs: p.bendMs,
    click: s.click ?? p.click,
    noise: s.noise ?? p.noise,
    snap: s.snap ?? p.snap,
    drive: s.drive ?? p.drive,
    detune: s.detune ?? p.detune,
    sweep: s.sweep ?? p.sweep,
    level: s.level ?? p.level,
    seed: s.seed ?? 0,
    length: s.length ?? p.length,
    name: s.name ?? null,
  }
}

/**
 * The sound's settings as text, every one resolved and in a fixed order: what
 * its tag is made from. The name is not in it, so renaming a sound doesn't
 * make a new one, and `synth A1 kick` is the same sound as `synth A1 kick decay 40`.
 */
function canonical(s: CardSynth): string {
  const r = resolve(s)
  return (
    `arc synth ${VERSION} ${r.type} note ${r.note} wave ${r.wave} chord ${r.chord} attack ${r.attack} decay ${r.decay}` +
    ` length ${r.length ?? 'auto'} tone ${r.tone} reso ${r.reso} sweep ${r.sweep} bend ${r.bend} click ${r.click} noise ${r.noise}` +
    ` snap ${r.snap ?? 'off'} drive ${r.drive} detune ${r.detune} level ${r.level} seed ${r.seed}`
  )
}

/** The CRC-32 of [canonical]'s ASCII bytes. */
function crc(s: CardSynth): number {
  const text = canonical(s)
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0x7f
  return crc32(bytes)
}

const hex = (n: number, digits: number): string => n.toString(16).padStart(digits, '0')

/** Six hex digits of [crc] (its top 24 bits): the tag after the device name. */
function tag(s: CardSynth): string {
  return hex(crc(s) >>> 8, 6)
}

/** The name to show: the line's name, else its type, `_` as a space ("808 kick"). */
function shownName(s: CardSynth): string {
  return (s.name ?? s.type).replaceAll('_', ' ')
}

/** The sound's name on the EP-133: [shownName] and [tag] ("808 kick 29f789"), at most 20 characters. */
function deviceName(s: CardSynth): string {
  return shownName(s) + ' ' + tag(s)
}

/** The file Arc keeps the sound in offline, one for each pad: "syn-<crc>-<project>-<group>-<pad>.wav". */
function fileName(s: CardSynth, project: number, group: number, pad: number): string {
  return `syn-${hex(crc(s), 8)}-${project}-${group}-${pad}.wav`
}

/** Whether the sound is all silence: no oscillator, no noise and no click. Arc never offers one; it still renders, as zeros. */
function silent(s: CardSynth): boolean {
  const r = resolve(s)
  return r.wave === 'none' && r.noise === 0 && r.click === 0
}

/** How many frames the sound has: its length when it has one, else the attack and five times the decay (0.05 to 4 s). */
function frames(s: CardSynth): number {
  return framesOf(resolve(s))
}

/** [frames] of a resolved line (the Kotlin's private overload). */
function framesOf(r: SynthSpec): number {
  if (r.length !== null) return Math.trunc((r.length * 1875) / 4)
  const ka = r.attack / 100.0
  const kd = r.decay / 100.0
  const attackMs = 2000.0 * (ka * ka * ka)
  const decayMs = r.dLo + (r.dHi - r.dLo) * (kd * kd)
  let tail = decayMs
  if (r.snap !== null) {
    const ks = r.snap / 100.0
    const snapMs = 10.0 + 990.0 * (ks * ks)
    if (snapMs > tail) tail = snapMs
  }
  const n = Math.floor((attackMs + 5.0 * tail + (r.shape === 'CLAP' ? 30.0 : 0.0)) * 46.875)
  return Math.min(Math.max(n, MIN_AUTO_FRAMES), MAX_FRAMES)
}

/** MIDI [midi] in Hz, from A4 = 440 by the semitone table and octave doublings. */
function noteHz(midi: number): number {
  const d = midi - 69
  const o = Math.floor(d / 12)
  const s = d - 12 * o
  let h = 440.0 * SEMI[s]!
  for (let i = 0; i < o; i++) h = h * 2.0
  for (let i = 0; i < -o; i++) h = h * 0.5
  return h
}

/**
 * Makes a card's synth line into a sound: 46875 Hz, mono, 16 bits, at most
 * 4 s, peak normalised to -1 dBFS times its level. The same line always makes
 * the same bytes, and its device name ("808 kick 29f789") carries a tag of its
 * settings, so Arc finds a sound it made before. The making is synthRender.ts'.
 */
export const SynthVoice = {
  VERSION,
  RATE,
  MAX_FRAMES,
  MIN_AUTO_FRAMES,
  resolve,
  canonical,
  crc,
  tag,
  shownName,
  deviceName,
  fileName,
  silent,
  frames,
  framesOf,
  noteHz,
  /** A type's ordinal, as the noise's seed counts it. */
  ordinal: (t: SynthType): number => SYNTH_TYPES.indexOf(t),
} as const
