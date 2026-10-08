// Port of core/src/main/kotlin/dev/arc/ep133/features/PeakMeter.kt
//
// SAMPLE mode's input meter (an addition): the loudest sample of each block
// goes in through [onBlock], and it reads out in dBFS, or 0..1 across
// [FLOOR_DB]..0 dB for drawing. A peak holds for 300 ms, then falls at 20 dB
// a second, so a short hit stays readable on a phone screen; a peak at full
// scale lights [clip] for a second. The web has no SAMPLE mode; this is the
// core logic only.
//
// Time is counted in input frames at [rate], not on a clock, so the meter
// moves with the audio it was fed.
//
// Web deltas:
// - The companion object's constants and functions are static members
//   (PeakMeter.FLOOR_DB, PeakMeter.toDb, ...).
// - Kotlin's Float arguments and results go through Math.fround, so the
//   readings match the Kotlin's bit for bit; the level itself is a double in
//   both.
// - No @Volatile: one thread.

const f = Math.fround

export class PeakMeter {
  /** The bottom of the meter: quieter reads as this, and as 0 on the 0..1 scale. */
  static readonly FLOOR_DB = -60

  /** How long a peak holds before it falls, in milliseconds. */
  static readonly HOLD_MS = 300

  /** How fast the level falls after the hold, in dB a second. */
  static readonly DECAY_DB_PER_S = 20

  /** A peak at or above this (0..1 of full scale) counts as clipping. */
  static readonly CLIP = f(0.999)

  /** A linear level, 0..1 of full scale, in dBFS; silence reads [FLOOR_DB]. */
  static toDb(linear: number): number {
    const l = f(linear)
    return l <= 0 ? PeakMeter.FLOOR_DB : f(Math.max(PeakMeter.FLOOR_DB, 20 * Math.log10(l)))
  }

  /** A level in dBFS as linear, 0..1 of full scale: what a threshold set in dB compares samples against. */
  static fromDb(db: number): number {
    return f(Math.pow(10, f(db) / 20))
  }

  /** Where [thresholdDb] sits on the 0..1 scale of [level01], for the meter's threshold mark. */
  static markOf(thresholdDb: number): number {
    return scale(f(thresholdDb))
  }

  private readonly holdFrames: number

  // Kept as a double so slow decays don't round away.
  private levelDb = PeakMeter.FLOOR_DB
  private clipLeft = 0
  private holdLeft = 0

  constructor(readonly rate: number) {
    this.holdFrames = Math.floor((rate * PeakMeter.HOLD_MS) / 1000)
  }

  /** Whether a peak at full scale came in during the last second of input. */
  get clip(): boolean {
    return this.clipLeft > 0
  }

  /**
   * A block of [frames] frames whose loudest sample was [peak] (0..1 of full
   * scale). The block's time passes first, then its peak is taken as if at
   * its end, so a peak always holds for the full 300 ms.
   */
  onBlock(peak: number, frames: number): void {
    const p = f(peak)
    const n = Math.max(0, frames)
    let level = this.levelDb
    if (this.holdLeft >= n) {
      this.holdLeft -= n
    } else {
      const falling = n - this.holdLeft
      this.holdLeft = 0
      level = Math.max(PeakMeter.FLOOR_DB, level - (PeakMeter.DECAY_DB_PER_S * falling) / this.rate)
    }
    const db = PeakMeter.toDb(p)
    if (db >= level) {
      level = db
      this.holdLeft = this.holdFrames
    }
    this.levelDb = level
    this.clipLeft = p >= PeakMeter.CLIP ? this.rate : Math.max(0, this.clipLeft - n)
  }

  /** The held or falling level in dBFS, [FLOOR_DB] for silence. */
  dbfs(): number {
    return f(this.levelDb)
  }

  /** [dbfs] on a 0..1 scale across [FLOOR_DB]..0 dB, as the meter draws it; the same scale as [markOf]. */
  level01(): number {
    return scale(this.levelDb)
  }

  /** Back to silence, with no clip lit: for a new input or a new take. */
  reset(): void {
    this.levelDb = PeakMeter.FLOOR_DB
    this.holdLeft = 0
    this.clipLeft = 0
  }
}

function scale(db: number): number {
  const v = (db - PeakMeter.FLOOR_DB) / -PeakMeter.FLOOR_DB
  return f(v < 0 ? 0 : v > 1 ? 1 : v)
}
