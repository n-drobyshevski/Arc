// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/LivePunch.kt (PUNCH_FLOOR, PRESSURE_SPREAD,
// yDepth, PressureSense)
//
// What the screen makes of a touch's pressure: a punch-in's depth (LivePunch)
// and a note's velocity placed in the STEP panel (stepPlan). Web delta: apart
// from LivePunch.tsx, so the controller's STEP desk can use it.

/** The lightest a punch-in goes by where the finger is: the pad's foot (its top is 1). */
export const PUNCH_FLOOR = 0.15

/** How far apart a device's pressures must be before they count as pressure: a constant (or a jitter round it) is none. */
export const PRESSURE_SPREAD = 0.05

/** A punch-in's depth from where the finger is on its pad, [y] down a pad [height] tall: 1 at the top, [PUNCH_FLOOR] at the foot. */
export function yDepth(y: number, height: number): number {
  if (!(height > 0)) return 1
  const down = Math.min(Math.max(y / height, 0), 1)
  return 1 - down * (1 - PUNCH_FLOOR)
}

/**
 * What the screen makes of a touch's pressure: the lowest and highest it
 * has reported. A device that reports the same pressure for every touch
 * (a mouse's 0.5, many screens' 1) has none to play with, and the depth
 * comes from where the finger is ([yDepth]); once they have spread at least
 * [PRESSURE_SPREAD], a touch's pressure in that range is its depth, from
 * [PUNCH_FLOOR] to 1, as the finger presses harder or lighter.
 */
export class PressureSense {
  private low = Number.NaN
  private high = Number.NaN

  /** Whether the pressures seen vary enough to play with. */
  get varies(): boolean {
    return this.high - this.low >= PRESSURE_SPREAD
  }

  /** A touch's [pressure] seen (one that isn't a number is left out). */
  see(pressure: number): void {
    if (!Number.isFinite(pressure)) return
    this.low = Number.isNaN(this.low) ? pressure : Math.min(this.low, pressure)
    this.high = Number.isNaN(this.high) ? pressure : Math.max(this.high, pressure)
  }

  /** A touch's depth: its [pressure] (seen first) while pressures vary, else where it is, [y] down a pad [height] tall. */
  depth(pressure: number, y: number, height: number): number {
    const at = this.level(pressure)
    return at === null ? yDepth(y, height) : PUNCH_FLOOR + at * (1 - PUNCH_FLOOR)
  }

  /** Where [pressure] (seen first) is in the range seen, 0..1, while pressures vary; null while they don't. */
  level(pressure: number): number | null {
    this.see(pressure)
    if (!this.varies || !Number.isFinite(pressure)) return null
    return Math.min(Math.max((pressure - this.low) / (this.high - this.low), 0), 1)
  }
}
