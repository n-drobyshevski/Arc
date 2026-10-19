package dev.arc.ep133.controller

import dev.arc.ep133.features.HitMark
import dev.arc.ep133.features.PadNotes
import dev.arc.ep133.features.PracticeCounts
import dev.arc.ep133.features.PracticeSpec
import dev.arc.ep133.features.PracticeTarget

/**
 * PRACTICE on Live as the panel shows it (an addition): what is practised ([spec], [place] "A · 01"), the pads played
 * ([pads], keypad order, top row first) and their names for the lane ([names]), the tempo it plays at ([bpm], [speed]
 * percent of Live's), the bars it loops ([bars]), whether it runs, the counts so far and the pad most often off
 * ([worst]); in WAIT, the pads the step waits for ([waiting]) and which step of how many.
 */
data class PracticeUi(
    val spec: PracticeSpec,
    val place: String,
    val pads: List<Int>,
    val names: Map<Int, String>,
    val bpm: Int,
    val bars: Int,
    val running: Boolean = false,
    val counts: PracticeCounts = PracticeCounts(),
    val worst: Pair<Int, HitMark>? = null,
    val waiting: Set<Int> = emptySet(),
    val waitStep: Int = 0,
    val waitSteps: Int = 0,
    /** The step a lesson card runs (from 1), of how many, its title; null outside one. */
    val lesson: LessonPlace? = null,
) {
    val speed: Int get() = spec.speed
}

/**
 * Where a lesson is: [step] (from 1) of [steps], called [title], its [tip] if any, and the clean passes that open the
 * next; each step's [records] so far (null: not played), and whether every step is [done].
 */
data class LessonPlace(
    val step: Int,
    val steps: Int,
    val title: String,
    val tip: String?,
    val passesToGo: Int,
    val records: List<LessonRecord?> = emptyList(),
    val done: Boolean = false,
)

/** How a lesson's step went the last time it played: the [percent] in time over [passes], whether it was [done] (its clean passes), the pad most often off by name. */
data class LessonRecord(val percent: Int, val passes: Int, val done: Boolean, val worst: Pair<String, HitMark>? = null)

/**
 * A frame of a practice running: the [tick] heard into the loop (negative counting in), each pad's next hits not yet
 * played ([upcoming]: ticks from now), and the counts so far.
 */
class PracticeFrame(val tick: Double, val upcoming: List<Pair<PracticeTarget, Double>>, val counts: PracticeCounts)

/** [pads] in the keypad's order, top row first (7 8 9, 4 5 6, 1 2 3, . 0 ENTER), as the lane lists them. */
internal fun keypadOrder(pads: Collection<Int>): List<Int> = PadNotes.ROWS.flatten().filter { it in pads }

/** The group a practice of the scene takes: [shown] when it has pad hits, else the first that has. */
internal fun practiceGroup(p: dev.arc.ep133.features.ProjectPatterns, shown: Int): Int {
    fun hits(g: Int) = p.group(g).playable().any { it.semitones == null }
    return if (hits(shown.coerceIn(0, 3))) shown.coerceIn(0, 3) else (0..3).firstOrNull(::hits) ?: shown.coerceIn(0, 3)
}
