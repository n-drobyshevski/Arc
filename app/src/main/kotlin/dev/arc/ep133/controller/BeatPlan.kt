package dev.arc.ep133.controller

import dev.arc.ep133.features.BeatCard
import dev.arc.ep133.features.BeatCards
import dev.arc.ep133.features.CardPad
import dev.arc.ep133.features.ChainStep
import dev.arc.ep133.features.CardProblem
import dev.arc.ep133.features.CardRead
import dev.arc.ep133.features.CardSection
import dev.arc.ep133.features.CardSound
import dev.arc.ep133.features.FactorySounds
import dev.arc.ep133.features.FxSettings
import dev.arc.ep133.features.OfflinePads
import dev.arc.ep133.features.PadSettings
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
import dev.arc.ep133.protocol.SoundEntry
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
 * with the slot and name [sounds] knows for it. The project's [fx] and each used pad's settings ([pads]; null when not
 * known) are written as the card's effect and `pad` lines ([BeatCards.fromPatterns] leaves out what is at the defaults).
 * With a [list], the sounds Arc knows follow the card's closing fence
 * ([BeatCards.soundList]), for Claude to choose from. When the pads are [padsKnown], the pads the notes use that have no
 * sound ([held] gives a pad's slot, null for none; [BeatCards.silentPads]) are named in a comment after the header
 * ([ClaudeText.noSoundOn]). A [kit] other than the EP-133's is named before the card ([ClaudeText.kitLine]); the
 * [prompt] goes first (the Claude page's, [dev.arc.ep133.text.PromptText.prompt]). Null when there is nothing to share:
 * no notes in it.
 */
internal fun beatShare(
    seq: ProjectSeq,
    group: Int?,
    tempo: Double,
    swing: Int,
    names: (PhysicalPad) -> String?,
    sounds: (PhysicalPad) -> CardSound? = { null },
    list: SoundSet? = null,
    fx: FxSettings? = null,
    pads: (PhysicalPad) -> PadSettings? = { null },
    held: (PhysicalPad) -> Int? = { null },
    padsKnown: Boolean = false,
    kit: dev.arc.ep133.features.FactoryKit = dev.arc.ep133.features.FactoryKit.EP133,
    prompt: String = ClaudeText.SHARE_PROMPT,
): BeatShare? {
    val groups = if (group == null) 0..3 else group..group
    val sections = groups.map { g -> CardSection(g, seq.selected(g), seq.pattern(g, seq.selected(g))) }
    if (sections.all { it.pattern.isEmpty }) return null
    val name = if (group == null) ClaudeText.sceneCardName(seq.scene) else ClaudeText.patternCardName(seq.selected(group), seq.scene)
    val card = BeatCards.fromPatterns(name, tempo, swing, sections, sounds, fx, pads)
    val silent = BeatCards.silentPads(card, held, padsKnown)
    val text = ClaudeText.shareText(prompt, BeatCards.write(card, names, tidy = true, silent = silent), kit)
    // The list follows the closing fence after a blank line (the card's text ends in a newline); readers stop at the fence.
    return BeatShare(ClaudeText.shareSubject(name), if (list == null) text else text + "\n" + BeatCards.soundList(list.source, list.names))
}

/**
 * The steps of [steps] a card holds: from the first, up to the step that would bring in more distinct scenes than a card has
 * ([BeatCards.MAX_SCENES]) (a card with more is one Arc itself would refuse to read).
 */
internal fun chainForCard(steps: List<ChainStep>): List<ChainStep> {
    val seen = LinkedHashSet<Int>()
    val out = ArrayList<ChainStep>()
    for (step in steps) {
        if (step.scene !in seen && seen.size == BeatCards.MAX_SCENES) break
        seen += step.scene
        out += step
    }
    return out
}

/** The distinct scenes [chainForCard] shares: the card's scenes ("SHARE CHAIN · 3 SCENES"). */
internal fun chainSceneCount(steps: List<ChainStep>): Int = chainForCard(steps).mapTo(HashSet()) { it.scene }.size

/**
 * The text the project's chain shares: as [beatShare], a card ([BeatCards.fromScenes]: the chain's scenes in the order they first play,
 * each with its patterns, and the `chain` line with the passes) with the prompt for an arrangement, at [tempo] and the TIMING
 * [swing], the pads' [names], the sounds, FX and pad settings the other shares carry, the sound list after it, and the pads with no sound
 * named in a comment, after the [prompt]. Null when the chain has no step (or none naming a scene of [seq]).
 */
internal fun beatShareChain(
    seq: ProjectSeq,
    tempo: Double,
    swing: Int,
    names: (PhysicalPad) -> String?,
    sounds: (PhysicalPad) -> CardSound? = { null },
    list: SoundSet? = null,
    fx: FxSettings? = null,
    pads: (PhysicalPad) -> PadSettings? = { null },
    held: (PhysicalPad) -> Int? = { null },
    padsKnown: Boolean = false,
    kit: dev.arc.ep133.features.FactoryKit = dev.arc.ep133.features.FactoryKit.EP133,
    prompt: String = ClaudeText.SHARE_CHAIN_PROMPT,
): BeatShare? {
    val name = ClaudeText.CHAIN_CARD_NAME
    val card = BeatCards.fromScenes(name, tempo, swing, seq, chainForCard(seq.chain.steps), sounds, fx, pads) ?: return null
    val silent = BeatCards.silentPads(card, held, padsKnown)
    val text = ClaudeText.shareText(prompt, BeatCards.write(card, names, tidy = true, silent = silent), kit)
    return BeatShare(ClaudeText.shareSubject(name), if (list == null) text else text + "\n" + BeatCards.soundList(list.source, list.names))
}

/**
 * A prompt that goes without a card (a new beat, a track from scratch, a lesson), named [what] in the subject: the
 * [prompt], the [kit] when it isn't the EP-133's ([ClaudeText.kitLine]) and, with a [list], the sounds Arc knows after a
 * blank line.
 */
internal fun promptShare(what: String, prompt: String, kit: dev.arc.ep133.features.FactoryKit, list: SoundSet? = null): BeatShare {
    val text = prompt + (ClaudeText.kitLine(kit)?.let { "\n\n$it" } ?: "") + "\n"
    return BeatShare(dev.arc.ep133.text.PromptText.subject(what), if (list == null) text else text + "\n" + BeatCards.soundList(list.source, list.names))
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
 * A card scene on the sheet: its [number] (from 1) and [name], its [grids], where it goes ([index]: the new scene it becomes; null
 * when none can be added), the pattern each of its groups gets ([patterns]: the new scene's) and [parts], what its row says: the
 * groups the card has in any scene, each with the pattern number this scene's section takes, or null where it leaves the group out ("B (same)").
 */
class BeatSceneUi(val number: Int, val name: String?, val grids: List<BeatGridUi>, val index: Int?, val patterns: List<Int>?, val parts: List<Pair<Int, Int?>>)

/** The chain a card sets, as steps on the new scenes ([steps]): the CHAIN row and its SET CHAIN chip. */
class BeatChainUi(val steps: List<ChainStep>)

/**
 * A card's sound line on the sheet: the [pick] ([BeatCards.resolveSounds]) and the name the pad plays now ([oldName], null when unknown).
 * A [picked] row is not the card's: the user chose its sound for a silent pad ([pickedRow]).
 */
class SoundRowUi(val pick: SoundPick, val oldName: String?, val picked: Boolean = false) {
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
    if (card.allSections.all { it.sounds.isEmpty() }) return null
    val rows = BeatCards.resolveSounds(card, set?.names.orEmpty(), current).map { SoundRowUi(it, names(it.pad)) }
    return SoundsUi(rows, offline, project)
}

/**
 * The sounds PICK SOUND lists, the ones the card's SOUNDS block and IMPORT choose from ([soundSetOf]): [entries] of one
 * list, the EP-133's while connected, offline the view's ([source]: the last read's or the factory pack's); [unavailable]
 * are the device's slots Arc has no audio for offline (dimmed, not pickable). The names are [BeatCards.soundNames]'.
 */
class SoundChoices(val source: SoundSource, val entries: List<SoundEntry>, val unavailable: Set<Int>) {
    /** Slot to name. */
    val names: Map<Int, String> = entries.associate { it.slot to it.name }
}

/** The sounds [m] (Live's mirror) offers a pick, as [soundSetOf] has them, with the sizes the list carries; null when none is known. */
internal fun soundChoicesOf(m: MirrorUi?, factory: Map<Int, String>? = null): SoundChoices? {
    if (m == null) return null
    fun named(list: List<SoundEntry>): List<SoundEntry> {
        val names = BeatCards.soundNames(list.associate { it.slot to it.name }, factory)
        return list.map { it.copy(name = names.getValue(it.slot)) }
    }
    if (m.offline == null) return m.sounds.takeIf { it.isNotEmpty() }?.let { SoundChoices(SoundSource.DEVICE, named(it), emptySet()) }
    val o = m.offlineSounds ?: return null
    val fromPack = o.base == SoundSource.FACTORY
    val list = (if (fromPack) o.factory else o.device)?.takeIf { it.isNotEmpty() } ?: return null
    return SoundChoices(if (fromPack) SoundSource.FACTORY else SoundSource.DEVICE, named(list), if (fromPack) emptySet() else o.unavailable)
}

/** A pad the card plays that has no sound: the [pad] and the [notes] of the card that play on it. */
class SilentRowUi(val pad: PhysicalPad, val notes: Int)

/**
 * The sheet's SILENT PADS block: a [rows] for each used pad with no sound now and none from the card ([BeatCards.silentPads]),
 * the [choices] PICK SOUND lists (null when no sound is known: the rows then have no key), and whether the pads change in
 * Arc only until the EP-133 connects ([offline]) and the [project] they are written in, for the SOUNDS block a pick joins.
 */
class SilentUi(
    val rows: List<SilentRowUi>,
    val choices: SoundChoices?,
    val offline: Boolean,
    val project: Int?,
    /** A sound Arc suggests for each pad it could find one for ([suggestedSounds]): the sheet starts with them picked. */
    val suggested: Map<PhysicalPad, Int> = emptyMap(),
)

/**
 * A sound for each of [silent]'s pads from the sounds PICK SOUND lists ([BeatCards.suggestSound]: by the pad's row name in
 * [names], its kind, or its notes), each a different one, in the rows' order; the ones not available to play are passed over.
 */
internal fun suggestedSounds(silent: SilentUi, card: BeatCard, names: Map<PhysicalPad, String>, kit: dev.arc.ep133.features.FactoryKit): Map<PhysicalPad, Int> {
    val choices = silent.choices ?: return emptyMap()
    val list = choices.names.filterKeys { it !in choices.unavailable }
    val taken = HashSet<Int>()
    val out = LinkedHashMap<PhysicalPad, Int>()
    for (row in silent.rows) {
        val slot = BeatCards.suggestSound(card, row.pad, names[row.pad], list, taken, kit) ?: continue
        out[row.pad] = slot
        taken += slot
    }
    return out
}

/**
 * [card]'s silent pads ([BeatCards.silentPads]: [held] gives a pad's slot, null for none, and [known] says the pads were
 * read) as the sheet's rows with their note counts; null when there are none (or the pads aren't known).
 */
internal fun silentUi(card: BeatCard, held: (PhysicalPad) -> Int?, known: Boolean, choices: SoundChoices?, offline: Boolean, project: Int?): SilentUi? {
    val pads = BeatCards.silentPads(card, held, known)
    if (pads.isEmpty()) return null
    val counts = HashMap<PhysicalPad, Int>()
    for (s in card.allSections) for ((offset, n) in BeatCards.notesByPad(s)) counts.merge(PhysicalPad(s.group, offset), n, Int::plus)
    return SilentUi(pads.map { SilentRowUi(it, counts[it] ?: 0) }, choices, offline, project)
}

/**
 * The SOUNDS row for a sound the user picked for a silent [pad]: [slot] named [name] (as the list has it), replacing
 * "No sound": a change like any sound line of the card, ticked to be put on the pad with the others.
 */
internal fun pickedRow(pad: PhysicalPad, slot: Int, name: String?): SoundRowUi {
    val unverified = name != null && FactorySounds.unnamed(slot, name)
    return SoundRowUi(SoundPick(pad, CardSound(slot, name), slot, name, null, SoundStatus.CHANGE, unverified), ClaudeText.NO_SOUND, picked = true)
}

/**
 * The sounds picked for silent pads ([picked]: pad to slot) as picks IMPORT puts on the pads, like a card's sound lines
 * ([BeatCards.resolveSounds]): each is matched to the sounds as they are now ([names]) and is a change unless the pad
 * has it already ([current]); a slot no longer listed is left out.
 */
internal fun pickedSounds(picked: Map<PhysicalPad, Int>, names: Map<Int, String>, current: (PhysicalPad) -> Int?): List<SoundPick> =
    picked.mapNotNull { (pad, slot) ->
        val name = names[slot] ?: return@mapNotNull null
        val now = current(pad)
        if (now == slot) return@mapNotNull null
        SoundPick(pad, CardSound(slot, name), slot, name, now, SoundStatus.CHANGE, FactorySounds.unnamed(slot, name))
    }

/**
 * The sheet's FX block: a row for each kind of FX the card has a line for (effect, sends, comp, duck), the project's
 * FX now and what they become ([ClaudeText.fxRows]); a row the project has already says so ([ClaudeText.Change.same]).
 */
class BeatFxUi(val rows: List<ClaudeText.Change>) {
    /** Whether some row changes the project's FX (APPLY FX has something to do). */
    val changes: Boolean get() = rows.any { !it.same }
}

/** [card]'s FX line(s) against the project's FX [now] ([BeatCards.applyFx]); null when the card has none. */
internal fun beatFxUi(card: BeatCard, now: FxSettings): BeatFxUi? {
    val fx = card.fx ?: return null
    return ClaudeText.fxRows(now, BeatCards.applyFx(now, fx), fx).takeIf { it.isNotEmpty() }?.let(::BeatFxUi)
}

/**
 * A card's `pad` line on the sheet: the [pad], its sound [name], what the card says ([card]) and the pad's settings
 * [now] ([hasSound]: it plays a sound now, which its settings shape). A pad whose sound is changed by the same import starts
 * from the defaults, because a new sound resets its settings ([base]).
 */
class PadShapeRowUi(val pad: PhysicalPad, val name: String?, val card: CardPad, val now: PadSettings, val hasSound: Boolean) {
    /** What the card is applied to: the pad's settings, or the defaults when a new sound is going onto it ([soundChanges]). */
    fun base(soundChanges: Boolean): PadSettings = if (soundChanges) PadSettings.DEFAULT else now

    /** The settings after the card's line ([BeatCards.applyPad]). */
    fun after(soundChanges: Boolean): PadSettings = BeatCards.applyPad(base(soundChanges), card)

    /** The settings that change, old to new ([ClaudeText.padParts]); empty when the pad has them already. */
    fun parts(soundChanges: Boolean): List<ClaudeText.PadPart> = ClaudeText.padParts(base(soundChanges), after(soundChanges))

    /** Whether the row can be ticked: there is a sound to shape (or one going on) and something to change. */
    fun changes(soundChanges: Boolean): Boolean = (hasSound || soundChanges) && parts(soundChanges).isNotEmpty()
}

/** The sheet's PAD SHAPING block: a [rows] for each pad line of the card, [offline] when the settings stay in Arc until the EP-133 connects. */
class PadShapingUi(val rows: List<PadShapeRowUi>, val offline: Boolean)

/**
 * [card]'s pad lines as the sheet's rows, in keypad order for each section: each pad's settings [now] (the defaults when
 * not known), whether it has a sound ([hasSound]) and its sound's name [names]. Null when the card has no pad line.
 */
internal fun padShapingUi(
    card: BeatCard,
    now: (PhysicalPad) -> PadSettings?,
    hasSound: (PhysicalPad) -> Boolean,
    names: (PhysicalPad) -> String?,
    offline: Boolean,
): PadShapingUi? {
    val rows = card.allSections.flatMap { s ->
        KEYPAD.mapNotNull { offset ->
            val line = s.pads[offset]?.takeUnless { it.isEmpty } ?: return@mapNotNull null
            val pad = PhysicalPad(s.group, offset)
            PadShapeRowUi(pad, names(pad), line, now(pad) ?: PadSettings.DEFAULT, hasSound(pad))
        }
    }
    return rows.takeIf { it.isNotEmpty() }?.let { PadShapingUi(it, offline) }
}

/** [card]'s pad lines for the pads in [pads], in section and keypad order: what IMPORT shapes. */
internal fun padShapes(card: BeatCard, pads: Set<PhysicalPad>): List<Pair<PhysicalPad, CardPad>> =
    card.allSections.flatMap { s ->
        KEYPAD.mapNotNull { offset ->
            val line = s.pads[offset]?.takeUnless { it.isEmpty } ?: return@mapNotNull null
            PhysicalPad(s.group, offset).takeIf { it in pads }?.let { it to line }
        }
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
 * [swing] it says (null when straight), why IMPORT is off ([blocked]; null when it isn't), the [sounds] its sound
 * lines choose (null when it has none), its [fx] against the project's and the [shaping] its pad lines give (null when
 * it has none), and the [silent] pads it plays that have no sound (null when it has none, or the pads aren't known).
 * A card of scenes also has its [scenes] (each with its grids; empty for a card without `scene` lines, whose [grids] are
 * all), its [chain] on the new scenes (null when it has none or no scene can be added) and [noRoom]: the project has too many
 * scenes for the card's, which only place their patterns.
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
    val fx: BeatFxUi? = null,
    val shaping: PadShapingUi? = null,
    val silent: SilentUi? = null,
    val scenes: List<BeatSceneUi> = emptyList(),
    val chain: BeatChainUi? = null,
    val noRoom: Boolean = false,
    /** How many scenes the project has, for the REPLACE row ("Replace S01–S05"). */
    val projectScenes: Int = 1,
    /** Where the card goes with REPLACE on (its scenes from S01): null when the card adds no scene. */
    val replace: BeatReplaceUi? = null,
) {
    val card: BeatCard? get() = read.card

    val problems: List<CardProblem> get() = read.problems
}

/**
 * A card's scenes with REPLACE on: they become the project's from S01. [scene] is the one new scene of a card of
 * several groups (0), [scenes] the rows of a card of scenes and [chain] its chain on them.
 */
class BeatReplaceUi(val scene: Int?, val scenes: List<BeatSceneUi>, val chain: BeatChainUi?)

/** The bars drawn of a long pattern. */
internal const val BEAT_BARS_SHOWN = 2

// The steps a grid reads in, as the card is written: the first on which every pad hit sits.
private val BEAT_STEPS = listOf(Timing.SIXTEENTH, Timing.SIXTEENTH_T, Timing.THIRTY_SECOND)

// The keypad from top to bottom, as the card's rows go.
private val KEYPAD = PadNotes.ROWS.flatten()

/**
 * [read] (a card read from [text], say) planned into [seq] ([BeatCards.plan]) and drawn for the sheet: the pads of
 * each section by [names], Arc's tempo [now]. The tempo is offered as a whole number, which is what Arc keeps. [sounds] are
 * the card's sound lines matched ([soundsUi]), [fx] its FX against the project's ([beatFxUi]) and [shaping] its pad lines
 * ([padShapingUi]) and [silent] its pads with no sound ([silentUi]).
 */
internal fun beatImportUi(
    read: CardRead,
    seq: ProjectSeq,
    now: Double,
    names: (PhysicalPad) -> String?,
    /** The factory kit Arc plays: the EP-40's chord stabs are where its suggestions look for chords. */
    kit: dev.arc.ep133.features.FactoryKit = dev.arc.ep133.features.FactoryKit.EP133,
    fx: (BeatCard) -> BeatFxUi? = { null },
    shaping: (BeatCard) -> PadShapingUi? = { null },
    silent: (BeatCard) -> SilentUi? = { null },
    sounds: (BeatCard) -> SoundsUi? = { null },
): BeatImportUi {
    val card = read.card
    val nowBpm = Tempo.round(now)
    if (card == null) return BeatImportUi(read, ClaudeText.CARD, null, emptyList(), emptyList(), null, null, nowBpm, null, ClaudeText.FIX_ERRORS)
    val plan = BeatCards.plan(seq, card)
    // The plan places the sections in the card's order (scene by scene), or none when a group is full.
    val grids = card.allSections.mapIndexed { i, s -> beatGrid(s, card.swing, names, plan.placed.getOrNull(i)?.second) }
    val pads = grids.flatMap { g -> g.rows.map { it.pad } }.toSet().size
    val summary = ClaudeText.summary(grids.maxOfOrNull { it.bars } ?: 0, pads, grids.sumOf { g -> g.rows.sumOf { it.hits } })
    val tempo = card.tempo?.let { Tempo.round(it) }?.takeIf { it != nowBpm }
    val scenes = if (card.multiScene) sceneRows(card, grids, plan) else emptyList()
    // The same card with REPLACE on: the patterns go where they go either way, the scenes from S01.
    val replaced = BeatCards.plan(seq, card, replace = true).takeIf { it.newScene && it.fullGroup == null }
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
        fx = fx(card),
        shaping = shaping(card),
        silent = silent(card)?.let { s -> SilentUi(s.rows, s.choices, s.offline, s.project, suggestedSounds(s, card, read.names, kit)) },
        scenes = scenes,
        chain = plan.chain?.takeIf { plan.newScene }?.let(::BeatChainUi),
        noRoom = card.multiScene && plan.fullGroup == null && !plan.newScene,
        projectScenes = seq.scenes.size,
        replace = replaced?.let { r ->
            BeatReplaceUi(
                scene = if (card.multiScene) null else r.seq.scene,
                scenes = if (card.multiScene) sceneRows(card, grids, r) else emptyList(),
                chain = r.chain?.let(::BeatChainUi),
            )
        },
    )
}

// The card's scenes as the sheet draws them: each with its slice of [grids] and, where [plan] adds the scenes, the new scene it becomes and the pattern each section took.
private fun sceneRows(card: BeatCard, grids: List<BeatGridUi>, plan: dev.arc.ep133.features.CardImport): List<BeatSceneUi> {
    val groups = card.allSections.map { it.group }.distinct().sorted()
    var at = 0
    return card.scenes.mapIndexed { i, sc ->
        val mine = grids.subList(at, at + sc.sections.size)
        val taken = sc.sections.indices.associate { j -> sc.sections[j].group to plan.placed.getOrNull(at + j)?.second }
        at += sc.sections.size
        val index = plan.scenes.getOrNull(i)
        BeatSceneUi(
            number = i + 1,
            name = sc.name,
            grids = mine,
            index = index,
            patterns = index?.let { plan.seq.scenes[it].patterns },
            parts = groups.map { g -> g to taken[g] },
        )
    }
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

/**
 * A card applied: the sequencer [seq] after it, where the patterns went ([placed]), the index of the scene it added ([scene]; the first of
 * them for a card of scenes, which added [scenes] of them), whether it set the project's chain ([chainSet]) and the group with no free
 * pattern ([fullGroup]: nothing was done).
 */
internal class BeatApplied(
    val seq: ProjectSeq,
    val placed: List<Pair<Int, Int>>,
    val scene: Int?,
    val fullGroup: Int?,
    val scenes: Int = if (scene != null) 1 else 0,
    val chainSet: Boolean = false,
)

/**
 * IMPORT: [card] planned into [seq] ([BeatCards.plan]: next free patterns, a new scene for a card of several groups),
 * and the patterns picked in the scene that plays when there is no new scene (a card of one group, or 99 scenes
 * already), all as ONE checkpoint of [recorder] ([PatternRecorder.editSeq]): a single UNDO puts back the banks, the
 * scenes and the picks as they were. [BeatApplied.seq] is [seq] itself when a group is full.
 *
 * A card of scenes adds one scene for each of its own after the project's, the first selected, and with [setChain] on (and a chain in
 * the card) the project's chain becomes the card's on the new scenes, turned on: all in the same one checkpoint. With [replace] (the
 * sheet's REPLACE) the new scenes take the place of the project's, from S01, the project's patterns kept in the banks; with no room for the
 * scenes (the project has too many) the patterns are placed, and the first scene's picked in the scene playing.
 */
internal fun applyBeat(seq: ProjectSeq, card: BeatCard, recorder: PatternRecorder, setChain: Boolean = true, replace: Boolean = false): BeatApplied {
    val plan = BeatCards.plan(seq, card, setChain, replace)
    if (plan.fullGroup != null) return BeatApplied(seq, emptyList(), null, plan.fullGroup)
    var after = plan.seq
    if (!plan.newScene) {
        // A card of scenes names a group's pattern in each scene: the first scene's is the one picked.
        val picks = if (card.multiScene) plan.placed.take(card.scenes.first().sections.size) else plan.placed
        for ((g, n) in picks) after = SceneOps.selectPattern(after, g, n)
    }
    val out = recorder.editSeq(seq, after)
    val chainSet = plan.newScene && setChain && plan.chain != null
    return BeatApplied(out, plan.placed, if (plan.newScene) plan.scenes.firstOrNull() ?: out.scene else null, null, plan.scenes.size.takeIf { plan.newScene } ?: 0, chainSet)
}

/**
 * IMPORT's toast for [applied], with the [sounds] put on pads and the [skipped] ones that had no pad to go on, the card's
 * [fx] put on, and the [pads] shaped and the [padsSkipped] that could not be.
 */
internal fun beatImported(applied: BeatApplied, sounds: Int = 0, skipped: Int = 0, fx: Boolean = false, pads: Int = 0, padsSkipped: Int = 0): String {
    // A card of scenes names the scenes it made: "S04–S06".
    val scene = applied.scene?.let { first ->
        if (applied.scenes > 1) MirrorText.sceneLabel(first) + "\u2013" + MirrorText.sceneLabel(first + applied.scenes - 1) else MirrorText.sceneLabel(first)
    }
    return ClaudeText.imported(applied.placed, scene, sounds, skipped, fx, pads, padsSkipped, maxOf(applied.scenes, 1), applied.chainSet)
}
