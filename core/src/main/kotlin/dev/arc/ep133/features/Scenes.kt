package dev.arc.ep133.features

import kotlin.math.ceil

/**
 * What the clipboard holds, as SHIFT + C copies it on the device and
 * SHIFT + D pastes it (kept in memory, never saved). The notes' ids are 0.
 */
sealed interface Clip {
    /** A whole pattern: its bars and notes. */
    data class PatternClip(val pattern: Pattern) : Clip

    /** A bar's notes, their ticks from the bar's start (0 until 384). */
    data class BarClip(val notes: List<PatternNote>) : Clip

    /** One pad's notes, every pitch, at their ticks in the pattern, which was [sourceLength] ticks long. */
    data class PadClip(val notes: List<PatternNote>, val sourceLength: Int) : Clip
}

/** What ERASE + MAIN did: emptied the scene's patterns (CLR) or deleted the scene (DEL). */
enum class SceneErase { CLEARED, DELETED }

/** A scene erased: the [seq] after it, and which it was. */
data class SceneErased(val seq: ProjectSeq, val erase: SceneErase)

/**
 * When a pattern or scene picked while the sequencer plays takes over (the
 * device's 410 to 412): at once, at the end of the bar, or at the end of the
 * group's pattern. [id] is the word kept in settings.
 */
enum class SwitchTime(val id: String) {
    IMMEDIATE("now"),
    BAR("bar"),
    PATTERN("ptn");

    companion object {
        val DEFAULT = IMMEDIATE

        fun of(id: String): SwitchTime? = entries.firstOrNull { it.id == id }
    }
}

/**
 * Patterns and scenes, as MAIN and GROUP pick them on the device, and copy
 * and paste: each operation is pure, taking a project's sequencer and giving
 * the new one (the very one when nothing changes). Picking a pattern or a
 * scene is not an edit; the rest are ([PatternRecorder.editSeq]).
 */
object SceneOps {
    /** GROUP + − / + or a number: the scene playing gives [group] pattern [n] (held to 1..99). */
    fun selectPattern(seq: ProjectSeq, group: Int, n: Int): ProjectSeq {
        val k = n.coerceIn(1, Seq.MAX_PATTERNS)
        if (seq.selected(group) == k) return seq
        return seq.withScenes(seq.scenes.mapIndexed { i, s -> if (i == seq.scene) s.with(group, k) else s })
    }

    /**
     * SHIFT + A: the first pattern of [group] after the one selected, round
     * 1..99, with no notes; the one selected when every pattern has notes.
     */
    fun nextFree(seq: ProjectSeq, group: Int): Int {
        val from = seq.selected(group)
        for (i in 1 until Seq.MAX_PATTERNS) {
            val n = (from - 1 + i) % Seq.MAX_PATTERNS + 1
            if (seq.pattern(group, n).isEmpty) return n
        }
        return from
    }

    /** MAIN + − / + or a number: scene [index] (held to those there are). */
    fun selectScene(seq: ProjectSeq, index: Int): ProjectSeq {
        val i = index.coerceIn(0, seq.scenes.lastIndex)
        return if (i == seq.scene) seq else seq.withScenes(seq.scenes, i)
    }

    /** + past the last scene: a new one at the end, each group on its next free pattern (a blank canvas), selected. None past 99. */
    fun newScene(seq: ProjectSeq): ProjectSeq {
        if (seq.scenes.size >= Seq.MAX_SCENES) return seq
        val s = Scene(List(4) { g -> nextFree(seq, g) })
        return seq.withScenes(seq.scenes + s, seq.scenes.size)
    }

    /**
     * COMMIT (SHIFT + MAIN): a copy of the scene, right after it, selected.
     * Each group's pattern with notes is copied into the group's next free
     * pattern, which the new scene plays; an empty one is shared as it is.
     * A group with no free pattern left shares its pattern too. None past
     * 99 scenes.
     */
    fun commit(seq: ProjectSeq): ProjectSeq {
        if (seq.scenes.size >= Seq.MAX_SCENES) return seq
        var out = seq
        val numbers = List(4) { g ->
            val from = seq.selected(g)
            val pat = seq.pattern(g, from)
            val to = if (pat.isEmpty) from else nextFree(seq, g)
            if (to != from) out = out.withPattern(g, to, copyOf(pat))
            to
        }
        val at = seq.scene + 1
        return out.withScenes(seq.scenes.take(at) + Scene(numbers) + seq.scenes.drop(at), at)
    }

    /** CLR: the scene's four patterns lose their notes; the lengths stay, as [PatternRecorder.clear] keeps them. */
    fun clearScene(seq: ProjectSeq): ProjectSeq =
        seq.withPlaying(ProjectPatterns(seq.playing().groups.map { it.copy(notes = emptyList()) }))

    /**
     * DEL: the scene goes, when its four patterns have no notes and it isn't
     * the only one; the later ones move down and the index stays (on the
     * last one when it was the last).
     */
    fun deleteScene(seq: ProjectSeq): ProjectSeq {
        if (!seq.playing().isEmpty || seq.scenes.size <= 1) return seq
        return seq.withScenes(seq.scenes.filterIndexed { i, _ -> i != seq.scene }, seq.scene)
    }

    /** ERASE + MAIN held: [deleteScene] when it can (the scene empty, and not the only one), else [clearScene]. */
    fun eraseScene(seq: ProjectSeq): SceneErased {
        val deleted = deleteScene(seq)
        return if (deleted !== seq) SceneErased(deleted, SceneErase.DELETED) else SceneErased(clearScene(seq), SceneErase.CLEARED)
    }

    /** SHIFT + C twice: [group]'s selected pattern. */
    fun copyPattern(seq: ProjectSeq, group: Int): Clip.PatternClip = Clip.PatternClip(copyOf(seq.pattern(group, seq.selected(group))))

    /** SHIFT + D: [group]'s selected pattern becomes a copy of the clip's (bars and notes). */
    fun pastePattern(seq: ProjectSeq, group: Int, clip: Clip.PatternClip): ProjectSeq {
        val p = clip.pattern
        return seq.withPattern(group, seq.selected(group), Pattern(p.bars, p.notes.take(Seq.MAX_NOTES).map { it.copy(id = 0) }))
    }

    /** SHIFT + C: the notes in [bar] (from 0) of [group]'s selected pattern, their ticks from the bar's start. */
    fun copyBar(seq: ProjectSeq, group: Int, bar: Int): Clip.BarClip {
        val start = bar * Seq.TICKS_PER_BAR
        val notes = seq.pattern(group, seq.selected(group)).notes.filter { it.tick >= start && it.tick < start + Seq.TICKS_PER_BAR }
        return Clip.BarClip(notes.map { it.copy(tick = it.tick - start, id = 0) })
    }

    /** SHIFT + D: [bar] (from 0) of [group]'s selected pattern holds the clip's notes instead of its own; nothing past the end. */
    fun pasteBar(seq: ProjectSeq, group: Int, bar: Int, clip: Clip.BarClip): ProjectSeq {
        val n = seq.selected(group)
        val pat = seq.pattern(group, n)
        if (bar !in 0 until pat.bars) return seq
        val start = bar * Seq.TICKS_PER_BAR
        val kept = pat.notes.filterNot { it.tick >= start && it.tick < start + Seq.TICKS_PER_BAR }
        val pasted = clip.notes.map { it.copy(tick = it.tick + start, id = 0) }
        return seq.withPattern(group, n, pat.copy(notes = (kept + pasted).take(Seq.MAX_NOTES)))
    }

    /** A pad held + SHIFT + C: every note on [pad] (every pitch) in its group's selected pattern. */
    fun copyPad(seq: ProjectSeq, pad: PhysicalPad): Clip.PadClip {
        val pat = seq.pattern(pad.group, seq.selected(pad.group))
        return Clip.PadClip(pat.notes.filter { it.offset == pad.offset }.map { it.copy(id = 0) }, pat.lengthTicks)
    }

    /**
     * Another pad held + SHIFT + D: [pad]'s notes (every pitch) in its
     * group's selected pattern are the clip's instead, on [pad] at the same
     * ticks; it can be in another group. Notes at or past that pattern's
     * end are left out.
     */
    fun pastePad(seq: ProjectSeq, pad: PhysicalPad, clip: Clip.PadClip): ProjectSeq {
        val n = seq.selected(pad.group)
        val pat = seq.pattern(pad.group, n)
        val kept = pat.notes.filterNot { it.offset == pad.offset }
        val pasted = clip.notes.filter { it.tick < pat.lengthTicks }.map { it.copy(offset = pad.offset, id = 0) }
        return seq.withPattern(pad.group, n, pat.copy(notes = (kept + pasted).take(Seq.MAX_NOTES)))
    }

    /**
     * The global tick at which a change queued at [globalTick] takes over a
     * group whose pattern is [currentLengthTicks] long: at once (the next
     * whole tick), at the next bar line, or at the next end of the group's
     * pattern. A press exactly on a line switches there. Stopped, the caller
     * switches at once whatever [time] is. A scene's change queues each
     * group: under PATTERN each has its own tick, under BAR they share one.
     */
    fun switchTick(time: SwitchTime, globalTick: Double, currentLengthTicks: Int): Long = when (time) {
        SwitchTime.IMMEDIATE -> ceil(globalTick).toLong()
        SwitchTime.BAR -> nextLine(globalTick, Seq.TICKS_PER_BAR)
        SwitchTime.PATTERN -> nextLine(globalTick, currentLengthTicks.coerceAtLeast(1))
    }

    // The first multiple of [every] at or after [tick].
    private fun nextLine(tick: Double, every: Int): Long = ceil(tick / every).toLong() * every

    // [p] as a copy goes in another slot: closed, its notes' ids 0.
    private fun copyOf(p: Pattern): Pattern = Pattern(p.bars, p.notes.map { it.copy(id = 0) })
}
