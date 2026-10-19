package dev.arc.ep133.text

import dev.arc.ep133.features.HitMark

/**
 * PRACTICE on Live (an addition): play along with a pattern, its hits lit on the pads ahead of time, the rest of the
 * scene underneath, and how it went. Its panel grows from the display line as STEP's does.
 */
object PracticeText {
    const val PRACTICE = "Practice"
    /** The panel for screen readers, and its ✕. */
    const val PANE = "Practice panel"
    const val CLOSE = "End practice"

    /** "PRACTICE A · 01": the header's start. */
    fun head(place: String) = "$PRACTICE $place"

    /** The header's status: "12/14 ON TIME", "WAIT 3/8", "READY". */
    fun onTime(onTime: Int, hits: Int) = "$onTime/$hits on time"
    fun waitStep(step: Int, steps: Int) = "Wait ${step + 1}/$steps"
    const val READY = "Ready"
    fun said(onTime: Int, hits: Int) = "$onTime of $hits hits on time"

    /** The keys. */
    const val WAIT = "Wait"
    const val WAIT_NAME = "Wait for each hit"
    fun speed(percent: Int) = "$percent%"
    fun speedName(percent: Int, bpm: Int) = "Speed, $percent percent, $bpm BPM"
    const val LOOP_ALL = "All"
    fun loop(bars: Int?) = bars?.let { Format.plural(it, "bar") } ?: LOOP_ALL
    fun loopName(bars: Int?) = "Loop " + (bars?.let { "the first " + Format.plural(it, "bar") } ?: "the whole pattern")
    const val BACKING = "Backing"
    const val BACKING_NAME = "The rest of the scene plays underneath"
    const val PLAY = "Play"
    const val STOP = "Stop"

    /** The lane's caption, and the result after a stop. */
    fun bpm(bpm: Int, percent: Int) = "$bpm BPM · $percent%"
    fun result(percent: Int) = "$percent% on time"
    fun counts(hits: Int, onTime: Int, early: Int, late: Int, missed: Int, extra: Int) =
        listOfNotNull(
            Format.plural(hits, "hit"),
            "$onTime on time",
            early.takeIf { it > 0 }?.let { "$it early" },
            late.takeIf { it > 0 }?.let { "$it late" },
            missed.takeIf { it > 0 }?.let { "$it missed" },
            extra.takeIf { it > 0 }?.let { "$it extra" },
        ).joinToString(" · ")

    /** "The kick came early most": the pad most often off, by its name. */
    fun worst(name: String, mark: HitMark) = when (mark) {
        HitMark.EARLY -> "$name came early most"
        HitMark.LATE -> "$name came late most"
        else -> "$name was missed most"
    }

    const val WAIT_HINT = "Play the lit pads in turn: the beat waits for each hit."
    const val START_HINT = "Lit pads play next; the number counts the beats to go."
    fun passes(n: Int) = Format.plural(n, "pass", "passes")

    /** A pad lit to play next, for screen readers. */
    const val PLAY_NEXT = ", play next"
    fun inBeats(n: Int) = ", in ${Format.plural(n, "beat")}"

    /** The toast when a group has nothing to practise. */
    fun nothingToPlay(place: String) = "No pad hits in $place to practise."

    /** The beat card sheet's LESSON block: "A7 A9 · 50%" for a step, and what IMPORT AND PRACTISE does with them. */
    const val LESSON = "Lesson"
    fun lessonPads(pads: String, speed: Int) = "$pads · $speed%"
    const val LESSON_NOTE = "IMPORT AND PRACTISE runs these steps on Live's pads, one at a time: four clean passes open the next."

    /** A card's lesson: the header ("STEP 2/4"), the line over the lane, the step keys, the toasts. */
    fun step(step: Int, steps: Int) = "Step $step/$steps"
    fun toGo(n: Int) = Format.plural(n, "clean pass", "clean passes") + " to go"
    const val PREVIOUS = "‹"
    const val NEXT = "›"
    const val PREVIOUS_NAME = "The step before"
    const val NEXT_NAME = "The next step"
    fun stepDone(step: Int, next: String) = "Step $step done. Next: $next"
    const val LESSON_DONE = "Lesson done: every step played clean."
    /** The result's steps: "1 94% ✓ · 2 71% · 3 –". */
    fun steps(records: List<Pair<Int, Boolean>?>) = records.mapIndexed { i, r ->
        "${i + 1} " + (r?.let { (percent, done) -> "$percent%" + if (done) " ✓" else "" } ?: "–")
    }.joinToString(" · ")

    /** COPY HOW IT WENT: a short report to paste back to Claude. */
    const val COPY_REPORT = "Copy"
    const val COPY_REPORT_SUB = "how it went"
    const val COPY_REPORT_NAME = "Copy how it went, to paste to Claude"
    const val REPORT_SUBJECT = "How my practice went"
    fun reportHead(what: String, bpm: Int, percent: Int) =
        "Use the arc-beats skill. I practised $what in Arc's PRACTICE at $bpm BPM ($percent% of its tempo). How it went:"
    fun reportLessonHead(name: String?, bpm: Int) =
        "Use the arc-beats skill. I practised the lesson of " + (if (name.isNullOrBlank()) "the card" else "\"$name\"") +
            " in Arc's PRACTICE, the card at $bpm BPM. How it went:"
    fun reportStep(step: Int, title: String, pads: String, speed: Int, result: String) = "- Step $step, $title ($pads, $speed%): $result"
    fun reportResult(percent: Int, passes: Int, done: Boolean, worst: String?) =
        "$percent% on time over ${passes(passes)}" + (if (done) ", done" else "") + (worst?.let { "; $it" } ?: "")
    const val REPORT_NOT_PLAYED = "not played yet"
    fun reportPlain(counts: String, passes: Int, worst: String?) = "- " + counts + ", " + passes(passes) + (worst?.let { "; $it" } ?: "")
    const val REPORT_ASK = "What should I practise next?"

    /** PRACTICE on Claude's page and on the beat card sheet. */
    const val PRACTICE_NAME = "Practise playing it on Live's pads"
    const val IMPORT_PRACTICE = "Import and practise"
}
