package dev.arc.ep133.controller

import dev.arc.ep133.features.Clip
import dev.arc.ep133.features.Pattern
import dev.arc.ep133.features.PatternRecorder
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.ProjectSeq
import dev.arc.ep133.features.SceneErase
import dev.arc.ep133.features.SceneErased
import dev.arc.ep133.features.SceneOps
import dev.arc.ep133.features.Seq
import dev.arc.ep133.features.SwitchTime
import dev.arc.ep133.text.MirrorText
import kotlin.math.ceil

// ---------- SCENES: the pattern each group plays, switched while playing, and copy and paste (the device's GROUP, MAIN, SHIFT + C / D) ----------

/** What the CLIP row copies and pastes: a whole pattern, one bar of it, or one pad's notes. */
enum class ClipMode { PTN, BAR, PAD }

/**
 * Where the PAD clip is: nothing waits ([NONE]), COPY waits for the pad to
 * copy ([SOURCE]), or PASTE waits for the pad to paste onto ([TARGET]). A
 * pad tapped while one waits is the clip's: it neither plays nor records.
 */
enum class PadStage { NONE, SOURCE, TARGET }

/** What the clipboard holds as the CLIP row names it: its [mode] and [what] ("A01", "bar 2", "KICK"). */
data class ClipUi(val mode: ClipMode, val what: String)

/**
 * A group's column in the scene panel: the pattern it plays ([number], 1..99),
 * the one waiting to take over ([queued]; null for none), the numbers with
 * notes ([filled], for the 1–99 grid), the next free one after the number
 * shown ([nextFree]) and the pattern's length ([bars]).
 */
data class SceneGroupUi(val number: Int, val queued: Int?, val filled: Set<Int>, val nextFree: Int, val bars: Int)

/**
 * Scenes as Live shows them (an addition: the device's GROUP and MAIN with
 * −, + and a number, COMMIT, ERASE + MAIN, and SHIFT + C / D): the panel
 * [open] on the scene at [index] of [count] ([label] "S01"), the focused
 * column ([group], whose pattern and bars the CLIP row works on) and the
 * four columns ([groups]), the scene waiting to take over ([sceneQueued],
 * as shown from 1; null for none), whether the CLR hold key is DEL
 * ([canDelete]: the scene is empty and not the only one), the setting for
 * when a pick takes over ([switchTime]), the clipboard ([clip]) and the
 * CLIP row ([clipMode], the bar page shown for BAR [bar] from 0, and the
 * PAD flow's [padStage]), the 1–99 grid open for a group ([gridGroup]), the
 * status line ([status]: "B → 05 at bar end", "S03 committed", "Tap a pad";
 * null shows the scene), and what a screen reader says of the last change
 * ([said]: "Group B, pattern 5, 4 bars").
 */
data class SceneUi(
    val open: Boolean = false,
    val index: Int = 0,
    val count: Int = 1,
    val label: String = MirrorText.sceneLabel(0),
    val group: Int = 0,
    val groups: List<SceneGroupUi> = List(4) { SceneGroupUi(1, null, emptySet(), 2, Seq.DEFAULT_BARS) },
    val sceneQueued: Int? = null,
    val canDelete: Boolean = false,
    val switchTime: SwitchTime = SwitchTime.DEFAULT,
    val clip: ClipUi? = null,
    val clipMode: ClipMode = ClipMode.PTN,
    val padStage: PadStage = PadStage.NONE,
    val bar: Int = 0,
    val gridGroup: Int? = null,
    val status: String? = null,
    val said: String? = null,
)

/** A pattern change waiting: its group goes to pattern [to] at global tick [at] ([time], the setting it was made at). */
internal data class QueuedPick(val to: Int, val at: Long, val time: SwitchTime)

/** A scene change waiting: every group goes to scene [to] (an index; the number of scenes is a new one) at global tick [at]. */
internal data class QueuedScene(val to: Int, val at: Long, val time: SwitchTime)

/** The global tick at which a pick made at [tick] takes over ([SceneOps.switchTick]), no earlier than bar 1 (a pick in the count-in). */
internal fun queueTick(time: SwitchTime, tick: Double, lengthTicks: Int): Long = SceneOps.switchTick(time, tick, lengthTicks).coerceAtLeast(0L)

/** CHANGE's chip: the next choice, Immediate → Bar end → Pattern end → Immediate. */
internal fun SwitchTime.cycled(): SwitchTime = SwitchTime.entries[(ordinal + 1) % SwitchTime.entries.size]

/** − / + on a pattern number, wrapping round 1..99. */
internal fun wrapPattern(n: Int, dir: Int): Int = Math.floorMod(n - 1 + dir, Seq.MAX_PATTERNS) + 1

/** The pattern numbers of [group] that have notes (filled in the grid). */
internal fun filledPatterns(seq: ProjectSeq, group: Int): Set<Int> = seq.banks[group].filterValues { !it.isEmpty }.keys.toSet()

/**
 * [pat] as punch-out closes a pattern recorded with AUTO length, at global
 * [tick]: 1, 2, 4 or 8 bars, by the bars gone by and its notes. One with
 * none is a bar; one that is closed already is as it is. A pattern left
 * while it is open (the pick takes over before its first pass ends) closes
 * so it loops when it is picked again.
 */
internal fun closedAt(pat: Pattern, tick: Double): Pattern {
    if (!pat.open) return pat
    if (pat.isEmpty) return Pattern(Seq.DEFAULT_BARS, pat.notes)
    val elapsed = maxOf(ceil(tick / Seq.TICKS_PER_BAR).toInt(), pat.notes.maxOf { it.tick } / Seq.TICKS_PER_BAR + 1)
    return Pattern(Seq.LENGTHS.firstOrNull { it >= elapsed } ?: Seq.MAX_AUTO_BARS, pat.notes)
}

/**
 * Scenes as the controller keeps them (an addition): the panel open or not,
 * the focused column, the 1–99 grid, the CLIP row and its clipboard (in
 * memory while arc runs, never saved), the pad flow's stage, the picks
 * waiting for their tick, and the status line. The picks and edits are
 * [SceneOps] on the sequencer handed in, and give it back: a pick while the
 * sequencer plays ([at] a tick, else it is stopped) is queued instead, the
 * sequencer handed back as it was, until [due] finds the playhead past it.
 * The edits (COMMIT, CLR / DEL, the pastes) go through [PatternRecorder.editSeq],
 * one UNDO step each. Main thread only.
 *
 * A group's pick replaces that group's queue and cancels a scene's; a
 * scene's cancels every group's. A pick of what already plays cancels the
 * queue it would have replaced. A scene change queues all four groups at
 * one tick: the next bar line under BAR, and under PATTERN the end of the
 * longest pattern playing.
 */
internal class SceneDesk(private val word: (PhysicalPad) -> String) {
    /** The panel is shown. */
    var open = false
        private set

    /** The focused column: the group the CLIP row's pattern and bar copy and paste work on. */
    var group = 0
        private set

    /** The 1–99 grid is open over the pads for this group; null for none. */
    var gridGroup: Int? = null
        private set

    /** The CLIP row's choice. */
    var clipMode = ClipMode.PTN
        private set

    /** The PAD flow: nothing, COPY waiting for a pad, or PASTE waiting for one. */
    var padStage = PadStage.NONE
        private set

    /** The bar page BAR copies and pastes, from 0 (held to the focused group's length as it is shown). */
    var bar = 0
        private set

    /** The panel's status line (null: the queue, the grid or the scene shows). */
    var status: String? = null
        private set

    /** What a screen reader says of the last change. */
    var said: String? = null
        private set

    // The clipboard, and its name as the CLIP row shows it ("A01", "bar 2", "KICK") and the pad's the PAD flow's line says.
    private var clip: Clip? = null
    private var clipWhat: String? = null

    // The picks waiting for their tick: a group's by group, and a scene's.
    private val picks = LinkedHashMap<Int, QueuedPick>()
    private var scene: QueuedScene? = null

    /** How many picks wait for their tick: a group's each, or the scene's. */
    val waiting: Int get() = picks.size + if (scene != null) 1 else 0

    /** The global tick the first pick waiting takes over at; null for none. */
    fun dueTick(): Long? = listOfNotNull(scene?.at, picks.values.minOfOrNull { it.at }).minOrNull()

    /** The panel opens with column [group] focused. */
    fun open(group: Int) {
        open = true
        this.group = group.coerceIn(0, 3)
        status = null
        said = null
    }

    /** The panel closes (✕, another panel): the grid, the PAD flow, the status and what was said go; the picks waiting and the clipboard stay. */
    fun close() {
        open = false
        gridGroup = null
        padStage = PadStage.NONE
        status = null
        said = null
    }

    /** Another project: the panel closes, and the picks waiting, the clipboard and the CLIP row go. */
    fun reset() {
        close()
        picks.clear()
        scene = null
        clip = null
        clipWhat = null
        clipMode = ClipMode.PTN
        bar = 0
    }

    /** Live shows [group] now (or its column was tapped): the CLIP row works on it. */
    fun focus(group: Int) {
        if (group == this.group || group !in 0..3) return
        this.group = group
        status = null
    }

    /** The 1–99 grid opens over the pads for [group], or closes (null). */
    fun grid(group: Int?) {
        gridGroup = group?.takeIf { it in 0..3 }
        padStage = PadStage.NONE
        status = null
    }

    /** The picks waiting are dropped (an UNDO, or an edit that moves the scenes). */
    fun cancel() {
        picks.clear()
        scene = null
    }

    /**
     * [group]'s pattern picked, [n] (1..99): at once while stopped ([at]
     * null), else queued for the tick [time] gives from [at], the global tick
     * heard now. It replaces the group's queue, and cancels a scene's; the
     * pattern playing picked cancels the queue. The grid closes.
     */
    fun pickPattern(seq: ProjectSeq, group: Int, n: Int, at: Double?, time: SwitchTime): ProjectSeq {
        gridGroup = null
        status = null
        val k = n.coerceIn(1, Seq.MAX_PATTERNS)
        scene = null
        if (at == null || k == seq.selected(group)) {
            picks.remove(group)
            val out = SceneOps.selectPattern(seq, group, k)
            said = patternSaid(out, group)
            return out
        }
        picks[group] = QueuedPick(k, queueTick(time, at, seq.pattern(group, seq.selected(group)).lengthTicks), time)
        said = if (time == SwitchTime.IMMEDIATE) MirrorText.patternSpoken(group, k, seq.pattern(group, k).bars) else MirrorText.patternQueuedSpoken(group, k, time)
        return seq
    }

    /** − or + ([dir] -1 or +1) on [group]'s number as shown (the queued one, if any), wrapping round 1..99: a pick. */
    fun stepPattern(seq: ProjectSeq, group: Int, dir: Int, at: Double?, time: SwitchTime): ProjectSeq =
        pickPattern(seq, group, wrapPattern(shown(seq, group), dir), at, time)

    /** NEXT FREE: the first pattern after the number shown with no notes, picked. */
    fun pickNextFree(seq: ProjectSeq, group: Int, at: Double?, time: SwitchTime): ProjectSeq =
        pickPattern(seq, group, SceneOps.nextFree(SceneOps.selectPattern(seq, group, shown(seq, group)), group), at, time)

    /**
     * Scene [to] picked (an index; the number of scenes is a new one, [SceneOps.newScene]; held to what there is, and to
     * no new one at 99): at once while stopped ([at] null), else queued for all four groups at one tick, from [at]. It
     * cancels every group's queue, and the scene playing picked cancels the scene's.
     */
    fun pickScene(seq: ProjectSeq, to: Int, at: Double?, time: SwitchTime): ProjectSeq {
        status = null
        picks.clear()
        val count = seq.scenes.size
        val k = to.coerceIn(0, if (count < Seq.MAX_SCENES) count else count - 1)
        if (at == null || k == seq.scene) {
            scene = null
            val out = pickedScene(seq, k)
            said = sceneSaid(out)
            return out
        }
        scene = QueuedScene(k, queueTick(time, at, seq.playing().longestTicks), time)
        said = if (time == SwitchTime.IMMEDIATE) sceneSaid(pickedScene(seq, k)) else MirrorText.sceneQueuedSpoken(k, time)
        return seq
    }

    /** − or + ([dir]) on the scene as shown (the queued one, if any); past the last scene is a new one. */
    fun stepScene(seq: ProjectSeq, dir: Int, at: Double?, time: SwitchTime): ProjectSeq =
        pickScene(seq, (scene?.to ?: seq.scene) + dir, at, time)

    /**
     * COMMIT: [SceneOps.commit], one UNDO step, at once (the copies play what plays, so
     * a switch is seamless), and the picks waiting go with the scenes that moved.
     */
    fun commit(seq: ProjectSeq, recorder: PatternRecorder): ProjectSeq {
        status = null
        gridGroup = null
        val out = recorder.editSeq(seq, SceneOps.commit(seq))
        if (out === seq) {
            if (seq.scenes.size >= Seq.MAX_SCENES) status = MirrorText.SCENES_FULL
            return seq
        }
        cancel()
        status = MirrorText.sceneCommitted(out.scene)
        said = MirrorText.sceneCommittedSpoken(out.scene)
        return out
    }

    /**
     * The CLR / DEL hold done: [SceneOps.eraseScene] (DEL when the scene is
     * empty and not the only one, else CLR), one UNDO step, at once, and the
     * picks waiting go. The sequencer after it and what it did, or null when
     * nothing changed.
     */
    fun erase(seq: ProjectSeq, recorder: PatternRecorder): SceneErased? {
        status = null
        gridGroup = null
        val r = SceneOps.eraseScene(seq)
        val out = recorder.editSeq(seq, r.seq)
        if (out === seq) return null
        cancel()
        when (r.erase) {
            SceneErase.CLEARED -> {
                status = MirrorText.sceneCleared(seq.scene)
                said = MirrorText.CLEARED_SCENE
            }
            SceneErase.DELETED -> {
                status = MirrorText.sceneDeleted(seq.scene)
                said = MirrorText.DELETED_SCENE
            }
        }
        return SceneErased(out, r.erase)
    }

    /** The CLIP row's PTN, BAR or PAD: the PAD flow in progress is dropped. */
    fun mode(mode: ClipMode) {
        clipMode = mode
        padStage = PadStage.NONE
        status = null
    }

    /** The bar page (from 0) BAR copies and pastes. */
    fun page(bar: Int) {
        this.bar = bar.coerceIn(0, Seq.MAX_BARS - 1)
        status = null
    }

    /**
     * COPY: in PTN the focused group's pattern is the clipboard, in BAR its
     * bar page; in PAD it waits for the pad to copy (COPY again drops it).
     */
    fun copy(seq: ProjectSeq) {
        status = null
        gridGroup = null
        val n = seq.selected(group)
        when (clipMode) {
            ClipMode.PTN -> {
                clip = SceneOps.copyPattern(seq, group)
                clipWhat = MirrorText.groupPattern(group, n)
                status = MirrorText.clipCopied(clipWhat!!)
                said = MirrorText.copiedPattern(n)
            }
            ClipMode.BAR -> {
                val b = barOf(seq)
                clip = SceneOps.copyBar(seq, group, b)
                clipWhat = "bar ${b + 1}"
                status = MirrorText.clipCopied("${'A' + group} $clipWhat")
                said = MirrorText.copiedBar(b + 1)
            }
            ClipMode.PAD -> padStage = if (padStage == PadStage.SOURCE) PadStage.NONE else PadStage.SOURCE
        }
    }

    /**
     * PASTE: in PTN the clipboard's pattern replaces the focused group's, in
     * BAR the bar page's notes are the clipboard's (one UNDO step each); in
     * PAD it waits for the pad to paste onto (PASTE again drops it). With
     * nothing of the mode's kind copied, the status says so.
     */
    fun paste(seq: ProjectSeq, recorder: PatternRecorder): ProjectSeq {
        status = null
        gridGroup = null
        val n = seq.selected(group)
        when (clipMode) {
            ClipMode.PTN -> {
                val c = clip as? Clip.PatternClip ?: return none(MirrorText.NO_PATTERN_COPIED, seq)
                status = MirrorText.clipPasted(MirrorText.groupPattern(group, n))
                said = MirrorText.pastedPattern(n)
                return recorder.editSeq(seq, SceneOps.pastePattern(seq, group, c))
            }
            ClipMode.BAR -> {
                val c = clip as? Clip.BarClip ?: return none(MirrorText.NO_BAR_COPIED, seq)
                val b = barOf(seq)
                status = MirrorText.clipPasted("${'A' + group} bar ${b + 1}")
                said = MirrorText.pastedBar(b + 1)
                return recorder.editSeq(seq, SceneOps.pasteBar(seq, group, b, c))
            }
            ClipMode.PAD -> {
                if (clip !is Clip.PadClip) return none(MirrorText.NO_PAD_COPIED, seq)
                padStage = if (padStage == PadStage.TARGET) PadStage.NONE else PadStage.TARGET
                return seq
            }
        }
    }

    /**
     * [pad] tapped while the PAD flow waits: it is the pad COPY took, or the
     * pad PASTE puts the clipboard's notes on (the pad's own pitches go,
     * ticks kept; one UNDO step). The flow ends either way; the clipboard stays.
     */
    fun padTap(pad: PhysicalPad, seq: ProjectSeq, recorder: PatternRecorder): ProjectSeq {
        val stage = padStage
        padStage = PadStage.NONE
        status = null
        val name = word(pad)
        when (stage) {
            PadStage.NONE -> return seq
            PadStage.SOURCE -> {
                clip = SceneOps.copyPad(seq, pad)
                clipWhat = name
                status = MirrorText.clipCopied(name)
                said = MirrorText.copiedPad(name)
                return seq
            }
            PadStage.TARGET -> {
                val c = clip as? Clip.PadClip ?: return seq
                status = MirrorText.clipPasted(name)
                said = MirrorText.pastedPad(name)
                return recorder.editSeq(seq, SceneOps.pastePad(seq, pad, c))
            }
        }
    }

    /** The PAD flow is dropped (ERASE came on). */
    fun endStage() {
        if (padStage == PadStage.NONE) return
        padStage = PadStage.NONE
        status = null
    }

    /**
     * The picks whose tick the playhead has passed ([tick], as heard now) take over, in the order of their ticks. A
     * pattern left while it is open closes ([closedAt]) at the pick's tick, where it stopped playing. What was said is
     * the last of them.
     */
    fun due(seq: ProjectSeq, tick: Double): ProjectSeq = takeOver(seq, tick) { it <= tick }

    /** Every pick waiting takes over now (STOP: while stopped every change is at once). */
    fun flush(seq: ProjectSeq): ProjectSeq = takeOver(seq, null) { true }

    /**
     * What waits for its tick on [seq], by group: the pattern each group goes to and when. A group's own pick, or
     * the scene's pattern for each group it changes (a group whose pattern is the same goes on playing it).
     */
    fun targets(seq: ProjectSeq): Map<Int, QueuedPick> {
        val s = scene
        if (s != null) {
            val to = pickedScene(seq, s.to)
            return (0 until 4).filter { to.selected(it) != seq.selected(it) }.associateWith { QueuedPick(to.selected(it), s.at, s.time) }
        }
        return picks.filter { (g, q) -> q.to != seq.selected(g) }
    }

    /** What Live shows: the panel and the scene of [seq], with [time] the setting for when a pick takes over. */
    fun ui(seq: ProjectSeq, time: SwitchTime): SceneUi {
        val targets = targets(seq)
        val groups = List(4) { g ->
            val n = seq.selected(g)
            SceneGroupUi(
                number = n,
                queued = targets[g]?.to,
                filled = filledPatterns(seq, g),
                nextFree = SceneOps.nextFree(SceneOps.selectPattern(seq, g, shown(seq, g)), g),
                bars = seq.pattern(g, n).bars,
            )
        }
        val c = clip
        return SceneUi(
            open = open,
            index = seq.scene,
            count = seq.scenes.size,
            label = MirrorText.sceneLabel(seq.scene),
            group = group,
            groups = groups,
            sceneQueued = scene?.let { it.to + 1 },
            canDelete = SceneOps.deleteScene(seq) !== seq,
            switchTime = time,
            clip = c?.let { ClipUi(modeOf(it), clipWhat.orEmpty()) },
            clipMode = clipMode,
            padStage = padStage,
            bar = barOf(seq),
            gridGroup = gridGroup,
            status = status ?: stageStatus() ?: gridGroup?.let(MirrorText::gridStatus) ?: queueStatus(),
            said = said,
        )
    }

    // The number [group] shows: the one waiting for its tick, else the one playing.
    private fun shown(seq: ProjectSeq, group: Int): Int = targets(seq)[group]?.to ?: seq.selected(group)

    // [seq] on scene [to]: an existing one, or (the number of scenes) a new one.
    private fun pickedScene(seq: ProjectSeq, to: Int): ProjectSeq =
        if (to >= seq.scenes.size) SceneOps.newScene(seq) else SceneOps.selectScene(seq, to)

    // The bar page, held to the focused group's pattern.
    private fun barOf(seq: ProjectSeq): Int = bar.coerceIn(0, seq.pattern(group, seq.selected(group)).bars - 1)

    private fun modeOf(c: Clip): ClipMode = when (c) {
        is Clip.PatternClip -> ClipMode.PTN
        is Clip.BarClip -> ClipMode.BAR
        is Clip.PadClip -> ClipMode.PAD
    }

    private fun stageStatus(): String? = when (padStage) {
        PadStage.NONE -> null
        PadStage.SOURCE -> MirrorText.PAD_TAP_SOURCE
        PadStage.TARGET -> MirrorText.padTapTarget(clipWhat.orEmpty())
    }

    // What waits for its tick, as the status says it; nothing for a pick that takes over at once.
    private fun queueStatus(): String? {
        val s = scene
        if (s != null) return s.time.takeIf { it != SwitchTime.IMMEDIATE }?.let { MirrorText.queuedLine(MirrorText.sceneMove(s.to), it) }
        val last = picks.values.lastOrNull()?.time?.takeIf { it != SwitchTime.IMMEDIATE } ?: return null
        return MirrorText.queuedLine(picks.entries.sortedBy { it.key }.joinToString(", ") { (g, q) -> MirrorText.groupMove(g, q.to) }, last)
    }

    private fun none(why: String, seq: ProjectSeq): ProjectSeq {
        status = why
        said = why
        return seq
    }

    private fun patternSaid(seq: ProjectSeq, group: Int): String =
        MirrorText.patternSpoken(group, seq.selected(group), seq.pattern(group, seq.selected(group)).bars)

    private fun sceneSaid(seq: ProjectSeq): String = MirrorText.sceneSpoken(seq.scene, seq.scenes.size, (0 until 4).map(seq::selected))

    // The picks passed take over, the scene's first; a pattern left while open is closed at the pick's tick (none with [tick] null: STOP, where none is open).
    private inline fun takeOver(seq: ProjectSeq, tick: Double?, passed: (Long) -> Boolean): ProjectSeq {
        var out = seq
        val s = scene
        if (s != null && passed(s.at)) {
            scene = null
            out = leaving(out, pickedScene(out, s.to), tick?.let { s.at.toDouble() })
            said = sceneSaid(out)
            status = null
        }
        for ((g, q) in picks.entries.sortedBy { it.value.at }) {
            if (!passed(q.at)) continue
            picks.remove(g)
            out = leaving(out, SceneOps.selectPattern(out, g, q.to), tick?.let { q.at.toDouble() })
            said = patternSaid(out, g)
            status = null
        }
        return out
    }

    // [to] (the pick made on [from]) with the patterns [from] plays that it leaves closed, if one was open.
    private fun leaving(from: ProjectSeq, to: ProjectSeq, tick: Double?): ProjectSeq {
        if (tick == null) return to
        var out = to
        for (g in 0 until 4) {
            val n = from.selected(g)
            if (to.selected(g) == n) continue
            val pat = from.pattern(g, n)
            if (pat.open) out = out.withPattern(g, n, closedAt(pat, tick))
        }
        return out
    }
}
