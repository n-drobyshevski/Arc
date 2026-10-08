package dev.arc.ep133.features

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlin.math.abs
import kotlin.math.floor

/** The EP-133's sequencer, as its guide gives it: 96 ticks a beat, 1 to 99 bars a group. */
object Seq {
    const val PPQN = 96
    const val TICKS_PER_BAR = PPQN * Tempo.BEATS_PER_BAR
    const val DEFAULT_BARS = 1
    const val MAX_BARS = 99
    /** The longest a pattern grows to while recording with AUTO length (an addition). */
    const val MAX_AUTO_BARS = 8
    /** Notes a group's pattern holds; more are ignored. */
    const val MAX_NOTES = 2048
    /** The lengths offered first, as bars. */
    val LENGTHS = listOf(1, 2, 4, 8)
}

/**
 * A note in a group's pattern: at [tick] from the pattern's start, on the
 * pad at [offset] (0..11, as in [PhysicalPad]), for [gate] ticks (at least
 * 1). [semitones] is null for a pad hit and the note's distance from
 * [Keys.ROOT_NOTE] for a KEYS note played on that pad. [id] tells notes
 * apart while arc runs (a held note's release, a pass to skip); it isn't
 * saved, and notes read back have 0.
 */
data class PatternNote(
    val tick: Int,
    val offset: Int,
    val gate: Int,
    val semitones: Int? = null,
    val velocity: Int = 127,
    val id: Int = 0,
)

/**
 * A group's pattern: [bars] long, looping, with its [notes] in the order
 * they were recorded. Notes past the end (the length made shorter) are kept
 * but not played, as on the device. [open] while it is recorded with AUTO
 * length and its end isn't known yet: it doesn't loop, and grows as the
 * recording goes on. A pattern plays whatever sound is on its pads.
 */
data class Pattern(val bars: Int = Seq.DEFAULT_BARS, val notes: List<PatternNote> = emptyList(), val open: Boolean = false) {
    val lengthTicks: Int get() = bars * Seq.TICKS_PER_BAR
    val isEmpty: Boolean get() = notes.isEmpty()

    /** The notes that play, in tick order. */
    fun playable(): List<PatternNote> = notes.filter { it.tick < lengthTicks }.sortedBy { it.tick }
}

/** A project's patterns, one for each group A..D (the device keeps 99 a group; arc one). */
data class ProjectPatterns(val groups: List<Pattern> = List(4) { Pattern() }) {
    fun group(g: Int): Pattern = groups[g]

    fun with(g: Int, p: Pattern): ProjectPatterns = ProjectPatterns(groups.mapIndexed { i, old -> if (i == g) p else old })

    /** The longest group's length: what a resample of the pattern records. */
    val longestTicks: Int get() = groups.maxOf { it.lengthTicks }

    val isEmpty: Boolean get() = groups.all { it.isEmpty }

    /** The pads the notes that play are on: the sounds playback needs. */
    fun usedPads(): Set<PhysicalPad> = groups.flatMapIndexed { g, p -> p.playable().map { PhysicalPad(g, it.offset) } }.toSet()
}

/**
 * Every project's patterns, by project number (1..99; 0 while no project is
 * known, offline with nothing read). Patterns stay in arc: they aren't
 * written to the EP-133.
 */
data class Patterns(val projects: Map<Int, ProjectPatterns> = emptyMap()) {
    fun of(project: Int): ProjectPatterns = projects[project] ?: ProjectPatterns()

    /** [p] for [project]; a project with nothing in it (no notes, default lengths) is dropped. */
    fun put(project: Int, p: ProjectPatterns): Patterns =
        Patterns(if (blank(p)) projects - project else projects + (project to p))

    /** Groups with notes or another length only; the open flag and the notes' ids aren't written. */
    fun toJson(): String = buildJsonObject {
        put("v", 1)
        putJsonArray("projects") {
            for ((project, p) in projects.entries.sortedBy { it.key }) {
                if (blank(p)) continue
                add(buildJsonObject {
                    put("project", project)
                    putJsonArray("groups") {
                        p.groups.forEachIndexed { g, pattern ->
                            if (blank(pattern)) return@forEachIndexed
                            add(buildJsonObject {
                                put("group", g)
                                put("bars", pattern.bars)
                                putJsonArray("notes") {
                                    for (n in pattern.notes) add(buildJsonObject {
                                        put("t", n.tick)
                                        put("pad", n.offset)
                                        put("gate", n.gate)
                                        n.semitones?.let { put("semi", it) }
                                        if (n.velocity != 127) put("vel", n.velocity)
                                    })
                                }
                            })
                        }
                    }
                })
            }
        }
    }.toString()

    companion object {
        val EMPTY = Patterns()

        private fun blank(p: Pattern) = p.isEmpty && p.bars == Seq.DEFAULT_BARS
        private fun blank(p: ProjectPatterns) = p.groups.all(::blank)

        /**
         * Null when the text is not a version this one can read; entries it
         * can't read are skipped (as [OfflinePads.fromJson]): a project, a
         * group or a note. A later entry for the same project or group wins.
         */
        fun fromJson(text: String): Patterns? = runCatching {
            val o = Json.parseToJsonElement(text).jsonObject
            if (int(o, "v") != 1) return null
            var out = EMPTY
            for (e in (o["projects"] as? JsonArray).orEmpty()) {
                val f = e as? JsonObject ?: continue
                val project = int(f, "project")?.takeIf { it in 0..99 } ?: continue
                var p = out.of(project)
                for (ge in (f["groups"] as? JsonArray).orEmpty()) {
                    val gf = ge as? JsonObject ?: continue
                    val g = int(gf, "group")?.takeIf { it in 0..3 } ?: continue
                    val bars = int(gf, "bars")?.takeIf { it in 1..Seq.MAX_BARS } ?: continue
                    val notes = ArrayList<PatternNote>()
                    for (ne in (gf["notes"] as? JsonArray).orEmpty()) {
                        if (notes.size >= Seq.MAX_NOTES) break
                        val nf = ne as? JsonObject ?: continue
                        val t = int(nf, "t")?.takeIf { it >= 0 } ?: continue
                        val pad = int(nf, "pad")?.takeIf { it in 0..11 } ?: continue
                        val gate = int(nf, "gate")?.takeIf { it >= 1 } ?: continue
                        // Absent is a pad hit and full velocity; present but unreadable skips the note.
                        val semi = if ("semi" in nf) int(nf, "semi")?.takeIf { it in -127..127 } ?: continue else null
                        val vel = if ("vel" in nf) int(nf, "vel")?.takeIf { it in 1..127 } ?: continue else 127
                        notes += PatternNote(t, pad, gate, semi, vel)
                    }
                    p = p.with(g, Pattern(bars, notes))
                }
                out = out.put(project, p)
            }
            out
        }.getOrNull()

        /** A whole number written as a number (not a string). */
        private fun int(o: JsonObject, k: String) = (o[k] as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull
    }
}

/**
 * TIMING (the device's quantize and note interval): the grid recorded notes
 * snap to and the arp and note repeat step at, in ticks, or OFF for free
 * time (the tick played). 1/16 by default, as on the device; swing bends the
 * off-beats of 1/8 and 1/16 only ([swings]). [id] is the word kept in
 * settings.
 */
enum class Timing(val id: String, val ticks: Int) {
    OFF("off", 0),
    WHOLE("1/1", 384),
    HALF("1/2", 192),
    QUARTER("1/4", 96),
    EIGHTH("1/8", 48),
    EIGHTH_T("1/8T", 32),
    SIXTEENTH("1/16", 24),
    SIXTEENTH_T("1/16T", 16),
    THIRTY_SECOND("1/32", 12);

    /** Whether swing applies: 1/8 and 1/16 only, as on the device. */
    val swings: Boolean get() = this == EIGHTH || this == SIXTEENTH

    /**
     * [tick] on the grid: the nearest grid tick, ties rounding up; OFF the
     * nearest tick. It can land on the pattern's length (the caller wraps it).
     */
    fun quantize(tick: Double): Long =
        if (ticks == 0) floor(tick + 0.5).toLong() else floor(tick / ticks + 0.5).toLong() * ticks

    /**
     * How late step [stepIndex] of the grid plays at [swing] (50..75): 0 for
     * the even steps, and for the odd ones (swing - 50) / 50 of a step,
     * rounded to the tick (ticks / 2 at 75). 0 where it doesn't [swings].
     */
    fun swingOffset(stepIndex: Long, swing: Int): Int {
        if (!swings || (stepIndex and 1L) == 0L) return 0
        return ((TimingSettings.clampSwing(swing) - TimingSettings.SWING_MIN) * ticks + 25) / 50
    }

    /**
     * [tick] on the grid swung by [swing]: the nearest of its points
     * (k * ticks + [swingOffset] of k), ties rounding up, as [quantize]
     * (which it is, straight); OFF the nearest tick.
     */
    fun quantize(tick: Double, swing: Int): Long {
        if (ticks == 0 || swingOffset(1, swing) == 0) return quantize(tick)
        val k0 = floor(tick / ticks).toLong()
        var best = 0L
        var bestDistance = Double.POSITIVE_INFINITY
        for (k in k0 - 1..k0 + 1) {
            val point = k * ticks + swingOffset(k, swing)
            val d = abs(tick - point)
            if (d <= bestDistance) {
                best = point
                bestDistance = d
            }
        }
        return best
    }

    companion object {
        val DEFAULT = SIXTEENTH

        /** The note intervals KNOB X offers: every entry but OFF, in order. */
        val intervals: List<Timing> = entries.filter { it != OFF }

        fun of(id: String): Timing? = entries.firstOrNull { it.id == id }
    }
}

/**
 * The TIMING settings: the note [interval] (never OFF; OFF is read as 1/16),
 * its [swing] (50..75, 50 straight) and whether recording snaps to the grid
 * ([quantize]) or keeps free time (the device's - and +).
 */
data class TimingSettings private constructor(val interval: Timing, val swing: Int, val quantize: Boolean) {
    /** The grid recording snaps to: the interval, or OFF for free time. */
    val record: Timing get() = if (quantize) interval else Timing.OFF

    fun withInterval(t: Timing): TimingSettings = of(t, swing, quantize)

    /** Another swing, held to 50..75. */
    fun withSwing(s: Int): TimingSettings = of(interval, s, quantize)

    fun withQuantize(q: Boolean): TimingSettings = of(interval, swing, q)

    companion object {
        /** Swing, as a percent: 50 is straight, 75 puts the off-beats halfway to the next step. */
        const val SWING_MIN = 50
        const val SWING_MAX = 75

        val DEFAULT = of()

        /** Settings with OFF read as 1/16 and the swing held to 50..75 (`TimingSettings(...)` is this). */
        fun of(interval: Timing = Timing.DEFAULT, swing: Int = SWING_MIN, quantize: Boolean = true): TimingSettings =
            TimingSettings(if (interval == Timing.OFF) Timing.SIXTEENTH else interval, clampSwing(swing), quantize)

        operator fun invoke(interval: Timing = Timing.DEFAULT, swing: Int = SWING_MIN, quantize: Boolean = true): TimingSettings =
            of(interval, swing, quantize)

        fun clampSwing(s: Int): Int = s.coerceIn(SWING_MIN, SWING_MAX)
    }
}
