package dev.arc.ep133.features

/** One engine's numbers in [LatencyStats], in milliseconds, over its last [count] presses. */
data class LatencySummary(val engine: String, val count: Int, val median: Double, val best: Double, val worst: Double)

/**
 * Live's press-to-sound times for the debug screen's latency test (an
 * addition): for each audio engine tried this session, by its label (as
 * "AAudio exclusive (MMAP), 96-frame bursts"), the last [KEEP] measured
 * times from the touch to the first frame leaving the output. Engines keep
 * the order they were first measured in, so the rows read as tried.
 *
 * Immutable: [add] and [reset] give a new value, so the app can hold it in
 * one state holder that the output's thread updates and the screen reads.
 */
class LatencyStats private constructor(private val recent: Map<String, List<Double>>) {
    constructor() : this(emptyMap())

    companion object {
        /** How many of each engine's latest presses count. */
        const val KEEP = 20
    }

    /** The engines measured, first measured first. */
    val engines: List<String> get() = recent.keys.toList()

    /** Whether nothing has been measured (since the last [reset]). */
    val isEmpty: Boolean get() = recent.isEmpty()

    /**
     * With [ms] measured on [engine]; the oldest of its times drops out past
     * [KEEP]. A time that isn't a finite number of zero or more (clocks that
     * don't agree) is left out.
     */
    fun add(engine: String, ms: Double): LatencyStats {
        if (!ms.isFinite() || ms < 0) return this
        val times = (recent[engine].orEmpty() + ms).takeLast(KEEP)
        return LatencyStats(LinkedHashMap(recent).apply { put(engine, times) })
    }

    /** [engine]'s numbers, or null before its first press. */
    fun summary(engine: String): LatencySummary? {
        val times = recent[engine] ?: return null
        val sorted = times.sorted()
        val mid = sorted.size / 2
        val median = if (sorted.size % 2 == 1) sorted[mid] else (sorted[mid - 1] + sorted[mid]) / 2
        return LatencySummary(engine, sorted.size, median, sorted.first(), sorted.last())
    }

    /** Every engine's numbers, first measured first. */
    fun summaries(): List<LatencySummary> = recent.keys.mapNotNull { summary(it) }

    /** Without [engine]'s times, or (null) without any. */
    fun reset(engine: String? = null): LatencyStats =
        if (engine == null) LatencyStats() else LatencyStats(LinkedHashMap(recent).apply { remove(engine) })

    override fun equals(other: Any?) = other is LatencyStats && other.recent == recent
    override fun hashCode() = recent.hashCode()
    override fun toString() = "LatencyStats($recent)"
}
