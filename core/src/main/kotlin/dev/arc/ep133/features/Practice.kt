package dev.arc.ep133.features

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.roundToInt

/**
 * PRACTICE on Live (an addition): what the player plays along with. They play [group]'s pad hits on [pads] (offsets;
 * null: all its pads), over the first [bars] bars (null: the whole pattern), at [speed] percent of the tempo, while the
 * rest of the scene plays underneath ([backing] off: only what they play is left out, and nothing else plays). In
 * [wait] the beat stands still and waits for each hit in turn.
 */
data class PracticeSpec(
    val group: Int,
    val pads: Set<Int>? = null,
    val bars: Int? = null,
    val speed: Int = 100,
    val wait: Boolean = false,
    val backing: Boolean = true,
) {
    companion object {
        /** SPEED's steps, in percent of the tempo. */
        val SPEEDS = listOf(50, 75, 100)
    }
}

/** A hit to play: the pad at [offset], [tick] into the pattern, as hard as [velocity]. */
data class PracticeTarget(val offset: Int, val tick: Int, val velocity: Int)

/** How a press went: in time, early, late; a target let go by; a press on no target. */
enum class HitMark { ON_TIME, EARLY, LATE, MISSED, EXTRA }

/** The counts so far, the passes played and how many in a row were clean (nothing missed or extra). */
data class PracticeCounts(
    val onTime: Int = 0,
    val early: Int = 0,
    val late: Int = 0,
    val missed: Int = 0,
    val extra: Int = 0,
    val passes: Int = 0,
    val cleanRun: Int = 0,
) {
    /** The hits played or let go by. */
    val hits: Int get() = onTime + early + late + missed

    /** The share of them in time, in percent (0 before any). */
    val percent: Int get() = if (hits == 0) 0 else (onTime * 100.0 / hits).roundToInt()
}

object Practice {
    /** The touch is late on a phone, and the ear forgives: a press this close to its hit is in time. */
    const val ON_TIME_MS = 60.0

    /** A press counts for the nearest hit of its pad no further than a sixteenth either side. */
    const val MATCH_TICKS = Seq.PPQN / 4

    /** The hits [spec] has the player play in [p]: its pad hits (KEYS notes are left to the backing) in the bars played, in time order. */
    fun targets(p: Pattern, spec: PracticeSpec): List<PracticeTarget> {
        val end = length(p, spec)
        return p.playable().filter { it.semitones == null && it.tick < end && (spec.pads == null || it.offset in spec.pads) }
            .map { PracticeTarget(it.offset, it.tick, it.velocity) }
    }

    /** The ticks practice loops over: the pattern's, or the [PracticeSpec.bars] played when that is shorter. */
    fun length(p: Pattern, spec: PracticeSpec): Int =
        minOf(p.lengthTicks, (spec.bars ?: p.bars) * Seq.TICKS_PER_BAR).coerceAtLeast(Seq.TICKS_PER_BAR)

    /**
     * What the sequencer plays while [spec] is practised in [all]: each pattern cut to the bars played, the player's
     * hits taken out of theirs, and with [PracticeSpec.backing] off the other groups and pads silent too. In
     * [PracticeSpec.wait] nothing plays.
     */
    fun patterns(all: ProjectPatterns, spec: PracticeSpec): ProjectPatterns = ProjectPatterns(
        all.groups.mapIndexed { g, p ->
            val bars = spec.bars?.let { minOf(it, p.bars) } ?: p.bars
            val notes = when {
                spec.wait -> emptyList()
                g != spec.group -> if (spec.backing) p.notes else emptyList()
                !spec.backing -> emptyList()
                else -> p.notes.filterNot { it.semitones == null && (spec.pads == null || it.offset in spec.pads) }
            }
            Pattern(bars, notes.filter { it.tick < bars * Seq.TICKS_PER_BAR })
        },
    )

    /** [ms] as ticks at [bpm]. */
    fun ticksOf(ms: Double, bpm: Double): Double = ms * bpm * Seq.PPQN / 60_000.0

    /** [ticks] as milliseconds at [bpm]. */
    fun msOf(ticks: Double, bpm: Double): Double = ticks * 60_000.0 / (bpm * Seq.PPQN)
}

/**
 * The score of a practice playing along, [targets] looping every [length] ticks at [bpm]. A press is told its tick
 * from the loop's first start ([press]); it counts for the nearest hit of its pad not yet played, within a sixteenth
 * ([Practice.MATCH_TICKS]), in time within [Practice.ON_TIME_MS] (and a third of a sixteenth), else early or late; one
 * with no hit near is EXTRA. [advance] lets go of the hits passed by, missed, and closes each pass: clean when nothing
 * in it was missed or extra.
 */
class PracticeScore(val targets: List<PracticeTarget>, val length: Int, val bpm: Double) {
    private val played = HashSet<Long>()
    private var cursor = 0L
    private var extraIn = HashMap<Long, Int>()
    private var missedIn = HashMap<Long, Int>()
    var counts = PracticeCounts()
        private set

    /** Each pad's marks so far, for "the kick came early". */
    val byPad = HashMap<Int, IntArray>()

    private val inTime = minOf(Practice.ticksOf(Practice.ON_TIME_MS, bpm), Practice.MATCH_TICKS / 3.0).coerceAtLeast(1.0)

    private fun key(pass: Long, i: Int) = pass * targets.size + i

    private fun at(pass: Long, i: Int) = pass * length + targets[i].tick

    private fun mark(offset: Int, m: HitMark) {
        byPad.getOrPut(offset) { IntArray(HitMark.entries.size) }[m.ordinal]++
        counts = when (m) {
            HitMark.ON_TIME -> counts.copy(onTime = counts.onTime + 1)
            HitMark.EARLY -> counts.copy(early = counts.early + 1)
            HitMark.LATE -> counts.copy(late = counts.late + 1)
            HitMark.MISSED -> counts.copy(missed = counts.missed + 1)
            HitMark.EXTRA -> counts.copy(extra = counts.extra + 1)
        }
    }

    /** A press on the pad at [offset], [tick] ticks after the loop first started (the count-in before it is negative). */
    fun press(offset: Int, tick: Double): HitMark {
        val pass = floor(tick / length).toLong()
        var best: Pair<Long, Int>? = null
        var bestDist = Double.MAX_VALUE
        for (p in pass - 1..pass + 1) {
            if (p < 0) continue
            for ((i, t) in targets.withIndex()) {
                // A hit already let go by (missed, behind the cursor) or played can't be played again.
                if (t.offset != offset || key(p, i) < cursor || key(p, i) in played) continue
                val d = abs(tick - at(p, i))
                if (d <= Practice.MATCH_TICKS && d < bestDist) {
                    bestDist = d
                    best = p to i
                }
            }
        }
        val m = best?.let { (p, i) ->
            played += key(p, i)
            val d = tick - at(p, i)
            if (abs(d) <= inTime) HitMark.ON_TIME else if (d < 0) HitMark.EARLY else HitMark.LATE
        } ?: HitMark.EXTRA
        if (m == HitMark.EXTRA) extraIn[maxOf(pass, 0)] = (extraIn[maxOf(pass, 0)] ?: 0) + 1
        mark(offset, m)
        return m
    }

    /** The beat has got to [tick]: the hits more than a sixteenth behind it and not played are missed, and each pass behind closes. */
    fun advance(tick: Double) {
        if (targets.isEmpty()) return
        while (true) {
            val pass = cursor / targets.size
            val i = (cursor % targets.size).toInt()
            if (at(pass, i) + Practice.MATCH_TICKS >= tick) return
            if (key(pass, i) !in played) {
                missedIn[pass] = (missedIn[pass] ?: 0) + 1
                mark(targets[i].offset, HitMark.MISSED)
            }
            cursor++
            if (i == targets.size - 1) {
                val clean = (missedIn[pass] ?: 0) == 0 && (extraIn[pass] ?: 0) == 0
                counts = counts.copy(passes = counts.passes + 1, cleanRun = if (clean) counts.cleanRun + 1 else 0)
                played.removeAll { it < cursor }
            }
        }
    }

    /**
     * Each pad's next hit not yet played, as ticks from [tick] (negative while it is still in time to play), looking
     * [ahead] ticks on: what lights the pads and fills the lane.
     */
    fun upcoming(tick: Double, ahead: Int = Seq.TICKS_PER_BAR): List<Pair<PracticeTarget, Double>> {
        if (targets.isEmpty()) return emptyList()
        val out = ArrayList<Pair<PracticeTarget, Double>>()
        val first = floor((tick - Practice.MATCH_TICKS) / length).toLong().coerceAtLeast(0)
        var p = first
        while (p * length <= tick + ahead) {
            for ((i, t) in targets.withIndex()) {
                val d = at(p, i) - tick
                if (d < -Practice.MATCH_TICKS || d >= ahead || key(p, i) < cursor || key(p, i) in played) continue
                out += t to d
            }
            p++
        }
        return out.sortedBy { it.second }
    }

    /** The pad most often off ([HitMark]: missed, early or late), and how, when it was off more than once. */
    fun worst(): Pair<Int, HitMark>? = byPad.flatMap { (pad, n) ->
        listOf(HitMark.MISSED, HitMark.EARLY, HitMark.LATE).map { Triple(pad, it, n[it.ordinal]) }
    }.filter { it.third > 1 }.maxByOrNull { it.third }?.let { it.first to it.second }
}

/**
 * WAIT: the beat stands still at each step of [targets] until every pad on it is played, then goes on to the next
 * (round again after the last). A press on a pad not on the step is EXTRA.
 */
class PracticeWait(val targets: List<PracticeTarget>) {
    /** The steps: the hits at each tick, in time order. */
    val steps: List<List<PracticeTarget>> = targets.groupBy { it.tick }.toSortedMap().values.toList()
    var step = 0
        private set
    private val done = HashSet<Int>()
    var counts = PracticeCounts()
        private set
    private var extraThisPass = 0

    /** The pads still to play on this step. */
    val waiting: Set<Int> get() = steps.getOrNull(step)?.map { it.offset }?.toSet()?.minus(done) ?: emptySet()

    /** The step's tick into the pattern, where the lane stands. */
    val tick: Int get() = steps.getOrNull(step)?.firstOrNull()?.tick ?: 0

    fun press(offset: Int): HitMark {
        if (offset !in waiting) {
            extraThisPass++
            counts = counts.copy(extra = counts.extra + 1)
            return HitMark.EXTRA
        }
        done += offset
        counts = counts.copy(onTime = counts.onTime + 1)
        if (waiting.isEmpty()) {
            done.clear()
            step++
            if (step >= steps.size) {
                step = 0
                counts = counts.copy(passes = counts.passes + 1, cleanRun = if (extraThisPass == 0) counts.cleanRun + 1 else 0)
                extraThisPass = 0
            }
        }
        return HitMark.ON_TIME
    }
}
