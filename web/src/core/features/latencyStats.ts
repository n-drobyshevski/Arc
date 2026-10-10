// Port of core/src/main/kotlin/dev/arc/ep133/features/LatencyStats.kt
//
// Live's press-to-sound times for the debug screen's latency test (an
// addition): for each audio engine tried this session, by its label (as
// "latencyHint 0, 48000 Hz"), the last [KEEP] measured
// times from the touch to the first frame leaving the output. Engines keep
// the order they were first measured in, so the rows read as tried.
//
// Immutable: [add] and [reset] give a new value, so the app can hold it in
// one signal that the output's callbacks update and the screen reads.
//
// Web deltas: the data class LatencySummary is an interface with a
// constructor function; Kotlin's structural equals is [equals] (Map
// equality ignores order, as LinkedHashMap's does); `reset(engine?)`
// takes undefined or null for "all"; the constructor that takes the map is
// private in Kotlin; KEEP is also a module export. The label example is the
// web's (Kotlin's is "AAudio exclusive (MMAP), 96-frame bursts").

/** How many of each engine's latest presses count. */
export const KEEP = 20

/** One engine's numbers in [LatencyStats], in milliseconds, over its last [count] presses. */
export interface LatencySummary {
  readonly engine: string
  readonly count: number
  readonly median: number
  readonly best: number
  readonly worst: number
}

export function LatencySummary(engine: string, count: number, median: number, best: number, worst: number): LatencySummary {
  return { engine, count, median, best, worst }
}

export class LatencyStats {
  static readonly KEEP = KEEP

  // Insertion order is first measured first (a LinkedHashMap).
  private readonly recent: ReadonlyMap<string, readonly number[]>

  constructor(recent: ReadonlyMap<string, readonly number[]> = new Map()) {
    this.recent = recent
  }

  /** The engines measured, first measured first. */
  get engines(): string[] {
    return [...this.recent.keys()]
  }

  /** Whether nothing has been measured (since the last [reset]). */
  get isEmpty(): boolean {
    return this.recent.size === 0
  }

  /**
   * With [ms] measured on [engine]; the oldest of its times drops out past
   * [KEEP]. A time that isn't a finite number of zero or more (clocks that
   * don't agree) is left out.
   */
  add(engine: string, ms: number): LatencyStats {
    if (!Number.isFinite(ms) || ms < 0) return this
    const times = [...(this.recent.get(engine) ?? []), ms].slice(-KEEP)
    return new LatencyStats(new Map(this.recent).set(engine, times))
  }

  /** [engine]'s numbers, or null before its first press. */
  summary(engine: string): LatencySummary | null {
    const times = this.recent.get(engine)
    if (times === undefined) return null
    const sorted = [...times].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
    return LatencySummary(engine, sorted.length, median, sorted[0]!, sorted[sorted.length - 1]!)
  }

  /** Every engine's numbers, first measured first. */
  summaries(): LatencySummary[] {
    return this.engines.map((e) => this.summary(e)).filter((s): s is LatencySummary => s !== null)
  }

  /** Without [engine]'s times, or (none given) without any. */
  reset(engine?: string | null): LatencyStats {
    if (engine == null) return new LatencyStats()
    const next = new Map(this.recent)
    next.delete(engine)
    return new LatencyStats(next)
  }

  /** Kotlin's equals: the same times for the same engines. */
  equals(other: LatencyStats): boolean {
    if (other.recent.size !== this.recent.size) return false
    for (const [engine, times] of this.recent) {
      const theirs = other.recent.get(engine)
      if (theirs === undefined || theirs.length !== times.length || theirs.some((t, i) => t !== times[i])) return false
    }
    return true
  }
}
