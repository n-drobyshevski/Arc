package dev.arc.ep133.controller

import dev.arc.ep133.features.BeatCard
import dev.arc.ep133.features.BeatCards
import dev.arc.ep133.features.CardProblem
import dev.arc.ep133.features.CardRead
import dev.arc.ep133.features.CardSection
import dev.arc.ep133.features.PadNotes
import dev.arc.ep133.features.PatternRecorder
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.ProjectSeq
import dev.arc.ep133.features.SceneOps
import dev.arc.ep133.features.Seq
import dev.arc.ep133.features.Steps
import dev.arc.ep133.features.Tempo
import dev.arc.ep133.features.Timing
import dev.arc.ep133.features.TimingSettings
import dev.arc.ep133.text.ClaudeText
import dev.arc.ep133.text.MirrorText

// ---------- BEAT CARDS: sharing a pattern or scene to Claude, and pasting Claude's card back (an addition) ----------

/** What a share sends: the [subject] and the [text] (the prompt, then the card in a fenced block). */
class BeatShare(val subject: String, val text: String)

/**
 * The text [group]'s playing pattern in [seq] shares (null [group]: the scene playing, its four patterns, the blank ones
 * left out), as an ARC BEAT card tidied and written with the pads' [names], at [tempo] and the TIMING [swing]
 * ([BeatCards.fromPatterns] keeps the swing only where every hit sits on it). Null when there is nothing to share:
 * no notes in it.
 */
internal fun beatShare(seq: ProjectSeq, group: Int?, tempo: Double, swing: Int, names: (PhysicalPad) -> String?): BeatShare? {
    val groups = if (group == null) 0..3 else group..group
    val sections = groups.map { g -> CardSection(g, seq.selected(g), seq.pattern(g, seq.selected(g))) }
    if (sections.all { it.pattern.isEmpty }) return null
    val name = if (group == null) ClaudeText.sceneCardName(seq.scene) else ClaudeText.patternCardName(seq.selected(group), seq.scene)
    val card = BeatCards.fromPatterns(name, tempo, swing, sections)
    return BeatShare(ClaudeText.shareSubject(name), ClaudeText.shareText(ClaudeText.SHARE_PROMPT, BeatCards.write(card, names, tidy = true)))
}

/** How strong a hit is drawn on the sheet's grid: the ghost, normal and accent tints (the card's x, o and X rounding, as TIDY has it). */
enum class Weight {
    GHOST,
    NORMAL,
    ACCENT,
    ;

    companion object {
        fun of(velocity: Int): Weight = if (velocity >= 114) ACCENT else if (velocity >= 82) NORMAL else GHOST
    }
}

/** A pad's row in a section's grid: the [pad], its sound [name], all its [hits] and its [cells], one for each step of the bars shown (null where nothing sits). */
class BeatRowUi(val pad: PhysicalPad, val name: String?, val hits: Int, val cells: List<Weight?>)

/**
 * A card's section as the sheet draws it: [group]'s pattern of [bars], read in [step]s ([perBar] to a bar), the
 * first [shownBars] bars as [rows] (a pad with notes each, in keypad order), and where it goes ([goesTo]: the
 * pattern number it fills; null when the card can't be imported).
 */
class BeatGridUi(val group: Int, val bars: Int, val step: Timing, val perBar: Int, val shownBars: Int, val rows: List<BeatRowUi>, val goesTo: Int?) {
    /** The bars not drawn ("+3 bars"). */
    val moreBars: Int get() = bars - shownBars
}

/**
 * The beat card sheet's state: what was [read] (the card, or its problems), its [grids], the title and [summary]
 * (null for a card that can't be read), where it would go ([placed]: group and pattern number; [scene]: the index of
 * the scene it adds), the [tempo] it offers (null when it has none or Arc's is the same; [tempoNow] is Arc's), the
 * [swing] it says (null when straight) and why IMPORT is off ([blocked]; null when it isn't).
 */
class BeatImportUi(
    val read: CardRead,
    val title: String,
    val summary: String?,
    val grids: List<BeatGridUi>,
    val placed: List<Pair<Int, Int>>,
    val scene: Int?,
    val tempo: Int?,
    val tempoNow: Int,
    val swing: Int?,
    val blocked: String?,
) {
    val card: BeatCard? get() = read.card

    val problems: List<CardProblem> get() = read.problems
}

/** The bars drawn of a long pattern. */
internal const val BEAT_BARS_SHOWN = 2

// The steps a grid reads in, as the card is written: the first on which every pad hit sits.
private val BEAT_STEPS = listOf(Timing.SIXTEENTH, Timing.SIXTEENTH_T, Timing.THIRTY_SECOND)

// The keypad from top to bottom, as the card's rows go.
private val KEYPAD = PadNotes.ROWS.flatten()

/**
 * [read] (a card read from [text], say) planned into [seq] ([BeatCards.plan]) and drawn for the sheet: the pads of
 * each section by [names], Arc's tempo [now]. The tempo is offered as a whole number, which is what Arc keeps.
 */
internal fun beatImportUi(read: CardRead, seq: ProjectSeq, now: Double, names: (PhysicalPad) -> String?): BeatImportUi {
    val card = read.card
    val nowBpm = Tempo.round(now)
    if (card == null) return BeatImportUi(read, ClaudeText.CARD, null, emptyList(), emptyList(), null, null, nowBpm, null, ClaudeText.FIX_ERRORS)
    val plan = BeatCards.plan(seq, card)
    // The plan places the sections in the card's order, or none when a group is full.
    val grids = card.sections.mapIndexed { i, s -> beatGrid(s, card.swing, names, plan.placed.getOrNull(i)?.second) }
    val pads = grids.flatMap { g -> g.rows.map { it.pad } }.toSet().size
    val summary = ClaudeText.summary(grids.maxOfOrNull { it.bars } ?: 0, pads, grids.sumOf { g -> g.rows.sumOf { it.hits } })
    val tempo = card.tempo?.let { Tempo.round(it) }?.takeIf { it != nowBpm }
    return BeatImportUi(
        read = read,
        title = card.name ?: ClaudeText.CARD,
        summary = summary,
        grids = grids,
        placed = plan.placed,
        scene = if (plan.newScene) plan.seq.scene else null,
        tempo = tempo,
        tempoNow = nowBpm,
        swing = card.swing.takeIf { it > TimingSettings.SWING_MIN },
        blocked = plan.fullGroup?.let(ClaudeText::groupFull),
    )
}

/**
 * [s] as a grid: the first of 1/16, 1/16T and 1/32 on which every pad hit sits at [swing] (1/16 when none), and a row
 * for each pad with notes, its hits placed on the step they sit on (the nearest, for one between steps), the louder
 * where two share one. Notes past the pattern's end don't play and aren't drawn or counted.
 */
internal fun beatGrid(s: CardSection, swing: Int, names: (PhysicalPad) -> String?, goesTo: Int?): BeatGridUi {
    val p = s.pattern
    val notes = p.notes.filter { it.tick in 0 until p.lengthTicks }
    val step = BEAT_STEPS.firstOrNull { t ->
        val count = Steps.count(p, t)
        notes.all { it.semitones != null || Steps.tickOf(Steps.indexOf(it.tick, t, swing, count), t, swing) == it.tick }
    } ?: Timing.SIXTEENTH
    val perBar = Seq.TICKS_PER_BAR / step.ticks
    val shown = minOf(p.bars, BEAT_BARS_SHOWN)
    val count = Steps.count(p, step)
    val rows = KEYPAD.mapNotNull { offset ->
        val on = notes.filter { it.offset == offset }
        if (on.isEmpty()) return@mapNotNull null
        val cells = arrayOfNulls<Weight>(shown * perBar)
        for (n in on) {
            val k = Steps.indexOf(n.tick, step, swing, count)
            if (k >= cells.size) continue
            val w = Weight.of(n.velocity)
            if (cells[k] == null || w > cells[k]!!) cells[k] = w
        }
        val pad = PhysicalPad(s.group, offset)
        BeatRowUi(pad, names(pad), on.size, cells.toList())
    }
    return BeatGridUi(s.group, p.bars, step, perBar, shown, rows, goesTo)
}

/** A card applied: the sequencer [seq] after it, where the patterns went ([placed]), the index of the scene it added ([scene]) and the group with no free pattern ([fullGroup]: nothing was done). */
internal class BeatApplied(val seq: ProjectSeq, val placed: List<Pair<Int, Int>>, val scene: Int?, val fullGroup: Int?)

/**
 * IMPORT: [card] planned into [seq] ([BeatCards.plan]: next free patterns, a new scene for a card of several groups),
 * and the patterns picked in the scene that plays when there is no new scene (a card of one group, or 99 scenes
 * already), all as ONE checkpoint of [recorder] ([PatternRecorder.editSeq]): a single UNDO puts back the banks, the
 * scenes and the picks as they were. [BeatApplied.seq] is [seq] itself when a group is full.
 */
internal fun applyBeat(seq: ProjectSeq, card: BeatCard, recorder: PatternRecorder): BeatApplied {
    val plan = BeatCards.plan(seq, card)
    if (plan.fullGroup != null) return BeatApplied(seq, emptyList(), null, plan.fullGroup)
    var after = plan.seq
    if (!plan.newScene) for ((g, n) in plan.placed) after = SceneOps.selectPattern(after, g, n)
    val out = recorder.editSeq(seq, after)
    return BeatApplied(out, plan.placed, if (plan.newScene) out.scene else null, null)
}

/** IMPORT's toast for [applied]. */
internal fun beatImported(applied: BeatApplied): String =
    ClaudeText.imported(applied.placed, applied.scene?.let(MirrorText::sceneLabel))
