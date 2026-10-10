package dev.arc.ep133.controller

import dev.arc.ep133.features.BeatCard
import dev.arc.ep133.features.BeatCards
import dev.arc.ep133.features.CardProblem
import dev.arc.ep133.features.CardRead
import dev.arc.ep133.features.CardSection
import dev.arc.ep133.features.CardSound
import dev.arc.ep133.features.OfflinePads
import dev.arc.ep133.features.PadSoundCache
import dev.arc.ep133.features.PadNotes
import dev.arc.ep133.features.PatternRecorder
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.ProjectSeq
import dev.arc.ep133.features.PadTarget
import dev.arc.ep133.features.SceneOps
import dev.arc.ep133.features.Seq
import dev.arc.ep133.features.SoundPick
import dev.arc.ep133.features.SoundSource
import dev.arc.ep133.features.SoundStatus
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
 * The sounds Arc can name to Claude and look cards up in: [names] by slot, and the [source] they came from as the
 * sound list words it ([ClaudeText.SOUNDS_FROM_DEVICE], [ClaudeText.SOUNDS_FROM_LAST_READ] or
 * [ClaudeText.SOUNDS_FROM_FACTORY]).
 */
internal class SoundSet(val source: String, val names: Map<Int, String>) {
    val size: Int get() = names.size
}

/**
 * The sounds [m] (Live's mirror) can choose from: the EP-133's, read, while connected; offline the list the view shows,
 * the last read's or the factory pack's ([OfflineSounds.base]). Null when none is known (nothing read, or no pack). A
 * sound the EP-133 lists unnamed ("200.pcm") has the name [factory] (the pack's, by slot; null without the pack) gives it
 * ([BeatCards.soundNames]).
 */
internal fun soundSetOf(m: MirrorUi?, factory: Map<Int, String>? = null): SoundSet? {
    if (m == null) return null
    if (m.offline == null) return m.sounds.takeIf { it.isNotEmpty() }?.let { SoundSet(ClaudeText.SOUNDS_FROM_DEVICE, BeatCards.soundNames(it.associate { e -> e.slot to e.name }, factory)) }
    val o = m.offlineSounds ?: return null
    val fromPack = o.base == SoundSource.FACTORY
    val list = (if (fromPack) o.factory else o.device)?.takeIf { it.isNotEmpty() } ?: return null
    return SoundSet(
        if (fromPack) ClaudeText.SOUNDS_FROM_FACTORY else ClaudeText.SOUNDS_FROM_LAST_READ,
        BeatCards.soundNames(list.associate { e -> e.slot to e.name }, factory),
    )
}

/**
 * The text [group]'s playing pattern in [seq] shares (null [group]: the scene playing, its four patterns, the blank ones
 * left out), as an ARC BEAT card tidied and written with the pads' [names], at [tempo] and the TIMING [swing]
 * ([BeatCards.fromPatterns] keeps the swing only where every hit sits on it). Each pad the notes use gets a sound line
 * with the slot and name [sounds] knows for it. With a [list], the sounds Arc knows follow the card's closing fence
 * ([BeatCards.soundList]), for Claude to choose from. Null when there is nothing to share: no notes in it.
 */
internal fun beatShare(
    seq: ProjectSeq,
    group: Int?,
    tempo: Double,
    swing: Int,
    names: (PhysicalPad) -> String?,
    sounds: (PhysicalPad) -> CardSound? = { null },
    list: SoundSet? = null,
): BeatShare? {
    val groups = if (group == null) 0..3 else group..group
    val sections = groups.map { g -> CardSection(g, seq.selected(g), seq.pattern(g, seq.selected(g))) }
    if (sections.all { it.pattern.isEmpty }) return null
    val name = if (group == null) ClaudeText.sceneCardName(seq.scene) else ClaudeText.patternCardName(seq.selected(group), seq.scene)
    val card = BeatCards.fromPatterns(name, tempo, swing, sections, sounds)
    val text = ClaudeText.shareText(ClaudeText.SHARE_PROMPT, BeatCards.write(card, names, tidy = true))
    // The list follows the closing fence after a blank line (the card's text ends in a newline); readers stop at the fence.
    return BeatShare(ClaudeText.shareSubject(name), if (list == null) text else text + "\n" + BeatCards.soundList(list.source, list.names))
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

/** A card's sound line on the sheet: the [pick] ([BeatCards.resolveSounds]) and the name the pad plays now ([oldName], null when unknown). */
class SoundRowUi(val pick: SoundPick, val oldName: String?) {
    val pad: PhysicalPad get() = pick.pad

    /** Whether the row can be ticked: the sound is somewhere in the list and not on the pad yet. */
    val changes: Boolean get() = pick.status == SoundStatus.CHANGE || pick.status == SoundStatus.FOUND_BY_NAME

    /**
     * The name the card gave a sound used by its slot because the EP-133 lists it unnamed ("200.pcm"), for the line
     * "Card says HH CLOSED". Null for any other row, and when the card named no other sound than the one shown.
     */
    val cardSays: String?
        get() = pick.takeIf { it.unverified }?.wanted?.name?.takeIf { it.isNotBlank() && !PadSoundCache.sameName(it, pick.name.orEmpty()) }
}

/**
 * The sheet's SOUNDS block: a [rows] for each sound line of the card, [offline] when the pads change in Arc only until
 * the EP-133 connects, and the [project] they are written in (connected; null when not known).
 */
class SoundsUi(val rows: List<SoundRowUi>, val offline: Boolean, val project: Int?) {
    /** The rows that can be ticked. */
    val changes: List<SoundRowUi> get() = rows.filter { it.changes }

    /** Whether no sound line is on the user's EP-133 (every row is missing): the sheet says to share with the sound list. */
    val noneFound: Boolean get() = rows.isNotEmpty() && rows.all { it.pick.status == SoundStatus.MISSING }
}

/**
 * [card]'s sound lines matched to [set] ([BeatCards.resolveSounds]) as the sheet's rows, each with the name the pad plays
 * now ([names]), the slot it plays now being [current]; null when the card has no sound line. With no [set] every line
 * is missing.
 */
internal fun soundsUi(
    card: BeatCard,
    set: SoundSet?,
    current: (PhysicalPad) -> Int?,
    names: (PhysicalPad) -> String?,
    offline: Boolean,
    project: Int?,
): SoundsUi? {
    if (card.sections.all { it.sounds.isEmpty() }) return null
    val rows = BeatCards.resolveSounds(card, set?.names.orEmpty(), current).map { SoundRowUi(it, names(it.pad)) }
    return SoundsUi(rows, offline, project)
}

/**
 * The pad changes [after] an import put on [targets] offline, taken back: each pad has the change it had [before]
 * (none: the read's sound again). A recording that was on a pad went to Takes when the import replaced it, so its change
 * isn't put back.
 */
internal fun offlineRestore(after: OfflinePads, before: OfflinePads, targets: List<PadTarget>): OfflinePads =
    targets.fold(after) { pads, t ->
        val was = before.at(t.project, t.group, t.pad)?.takeIf { it.source != SoundSource.RECORDED }
        if (was != null) pads.put(was) else pads.drop(t.project, t.group, t.pad)
    }

/**
 * Whether [c], the sequencer UNDO gave back, is the one before an import made at [before] (open groups come back closed,
 * so only the sequencer around the playing patterns is compared when they differ).
 */
internal fun isBefore(c: ProjectSeq, before: ProjectSeq): Boolean = c == before || c.withPlaying(before.playing()) == before

/**
 * The beat card sheet's state: what was [read] (the card, or its problems), its [grids], the title and [summary]
 * (null for a card that can't be read), where it would go ([placed]: group and pattern number; [scene]: the index of
 * the scene it adds), the [tempo] it offers (null when it has none or Arc's is the same; [tempoNow] is Arc's), the
 * [swing] it says (null when straight), why IMPORT is off ([blocked]; null when it isn't) and the [sounds] its sound
 * lines choose (null when it has none).
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
    val sounds: SoundsUi? = null,
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
 * each section by [names], Arc's tempo [now]. The tempo is offered as a whole number, which is what Arc keeps. [sounds] are
 * the card's sound lines matched ([soundsUi]).
 */
internal fun beatImportUi(read: CardRead, seq: ProjectSeq, now: Double, names: (PhysicalPad) -> String?, sounds: (BeatCard) -> SoundsUi? = { null }): BeatImportUi {
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
        sounds = sounds(card),
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

/** IMPORT's toast for [applied], with the [sounds] put on pads and the [skipped] ones that had no pad to go on. */
internal fun beatImported(applied: BeatApplied, sounds: Int = 0, skipped: Int = 0): String =
    ClaudeText.imported(applied.placed, applied.scene?.let(MirrorText::sceneLabel), sounds, skipped)
