package dev.arc.ep133.features

import dev.arc.ep133.formats.fx.clamp01
import dev.arc.ep133.text.ClaudeText
import java.util.Locale
import kotlin.math.roundToInt

/**
 * A beat as an ARC BEAT text card (skill/arc-beats/references/beat-card.md):
 * an optional [name] (up to 40 characters), the [tempo] it is meant for (40
 * to 240 BPM), the [swing] of its grid rows (50..75, 50 straight, as the
 * device's TIMING) and its [scenes]. [fx] is the project's effect lines, null
 * when the card has none; they are project-wide, so they apply to every scene.
 *
 * [scenes] is never empty. A card with no `scene` line has one implicit scene
 * with no name, which holds the card's sections, one for each group at most;
 * [sections] is that first scene's sections, so code written for single-scene
 * cards keeps working (on a multi-scene card it is the first scene only: use
 * [allSections] or [scenes]). [sceneLines] is set when the card's text had a
 * `scene` line (or is to be written with them), even for one scene: a card
 * with `scene` lines imports as new scenes ([BeatCards.plan]), one without as
 * patterns. [chain] is the `chain` line, null when the card has none: its
 * steps as (card scene number from 1, passes 1..8).
 *
 * `BeatCard(name, tempo, swing, sections, fx)` builds a single-scene card
 * from its sections.
 */
data class BeatCard(
    val name: String? = null,
    val tempo: Double? = null,
    val swing: Int = TimingSettings.SWING_MIN,
    val scenes: List<CardScene> = listOf(CardScene()),
    val fx: CardFx? = null,
    val chain: List<Pair<Int, Int>>? = null,
    val sceneLines: Boolean = false,
    /** The card's lesson, its `lesson` lines in order ([LessonStep]): what PRACTICE runs a step at a time. */
    val lesson: List<LessonStep> = emptyList(),
) {
    init {
        require(scenes.isNotEmpty()) { "A card has at least one scene." }
    }

    /** The first scene's sections: all of a single-scene card's. */
    val sections: List<CardSection> get() = scenes[0].sections

    /** The sections of every scene, in order. */
    val allSections: List<CardSection> get() = scenes.flatMap { it.sections }

    /** Whether the card is written, and imported, as scenes: it has `scene` lines, more than one scene or a chain. */
    val multiScene: Boolean get() = sceneLines || scenes.size > 1 || chain != null

    /** The same card with [sections] as its (only) scene. */
    fun withSections(sections: List<CardSection>): BeatCard = copy(scenes = listOf(scenes[0].copy(sections = sections)) + scenes.drop(1))

    companion object {
        /** A single-scene card of [sections] (what `BeatCard(...)` was before scenes). */
        operator fun invoke(name: String?, tempo: Double?, swing: Int, sections: List<CardSection>, fx: CardFx? = null): BeatCard =
            BeatCard(name, tempo, swing, listOf(CardScene(null, sections)), fx)
    }
}

/**
 * One scene of a card (a `scene` line and what follows it): its optional
 * [name] (up to 40 characters; Arc keeps no scene names) and its [sections],
 * one for each group at most. A group the scene leaves out plays the previous
 * scene's pattern; in the first scene, the pattern the scene playing gives it.
 */
data class CardScene(val name: String? = null, val sections: List<CardSection> = emptyList())

/**
 * The effect lines of a card (the spec's "Effects"), each kind apart and null
 * when the card has no such line, so a card sets only what it says. Knobs are
 * 0..1 floats (the card's percent / 100). [type] is the `fx` line's effect
 * with its [x] and [y] (0.5 when the line gave none); [sends] is the `send`
 * lines' groups (0..3) with their sends, the groups left out being 0 once
 * applied; [comp] is the `comp` line (off is `Comp(on = false)`); [sidechain]
 * is the `sidechain` line (off is `Sidechain(on = false)`).
 */
data class CardFx(
    val type: FxType? = null,
    val x: Float? = null,
    val y: Float? = null,
    val sends: Map<Int, Float>? = null,
    val comp: Comp? = null,
    val sidechain: Sidechain? = null,
)

/**
 * A `pad` line of a card (the spec's "Pad shaping"): the settings it gave,
 * null for the rest. [pitch] is in semitones (-12..12), [level] 0..100, [pan]
 * -16..16, [attack] and [release] envelope ticks 0..255 and [mode] the play
 * mode, all as the pad sheet has them ([PadSettings]).
 */
data class CardPad(
    val pitch: Double? = null,
    val level: Int? = null,
    val pan: Int? = null,
    val attack: Int? = null,
    val release: Int? = null,
    val mode: PlayMode? = null,
) {
    /** Whether the line gave no setting at all. */
    val isEmpty: Boolean get() = pitch == null && level == null && pan == null && attack == null && release == null && mode == null

    /** These settings, with [later]'s over them where it gives one. */
    fun merged(later: CardPad): CardPad = CardPad(
        pitch = later.pitch ?: pitch,
        level = later.level ?: level,
        pan = later.pan ?: pan,
        attack = later.attack ?: attack,
        release = later.release ?: release,
        mode = later.mode ?: mode,
    )
}

/**
 * One group's pattern on a card: [group] 0..3 (A..D), the pattern [number]
 * 1..99 it was written as (a hint, null when the card gave none), the
 * [pattern] itself, the [sounds] its pads should play, the [pads]' shaping
 * (a `pad` line each) and the [synths] Arc makes for them (a `synth` line
 * each), all by pad offset.
 */
data class CardSection(
    val group: Int,
    val number: Int?,
    val pattern: Pattern,
    val sounds: Map<Int, CardSound> = emptyMap(),
    val pads: Map<Int, CardPad> = emptyMap(),
    val synths: Map<Int, CardSynth> = emptyMap(),
)

/**
 * A sound line of a card: the EP-133 sound [slot] (1..999) a pad should play
 * and, when the card gave it, the sound's [name] as the user's list has it,
 * which lets Arc check that the slot still holds that sound.
 */
data class CardSound(val slot: Int, val name: String? = null)

/** The sound types of a synth line, in the order of their ordinal (which seeds the noise, [SynthVoice]). */
enum class SynthType(val id: String) {
    KICK("kick"), SNARE("snare"), CLAP("clap"), HAT("hat"), OPENHAT("openhat"), TOM("tom"), RIM("rim"), COWBELL("cowbell"), SUB("sub"),
    BASS("bass"), PLUCK("pluck"), STAB("stab"), BELL("bell"), ZAP("zap"), LEAD("lead"), PAD("pad"), RISER("riser"),
}

/** A synth line's oscillator: `metal` is six square partials (an 808 hat), `none` is noise only. */
enum class SynthWave(val id: String) { SINE("sine"), TRI("tri"), SAW("saw"), SQUARE("square"), METAL("metal"), NONE("none") }

/** A synth line's chord: the notes stacked on the root, in semitones. */
enum class SynthChord(val id: String, val intervals: List<Int>) {
    ONE("one", listOf(0)),
    MIN("min", listOf(0, 3, 7)),
    MAJ("maj", listOf(0, 4, 7)),
    MIN7("min7", listOf(0, 3, 7, 10)),
    MAJ7("maj7", listOf(0, 4, 7, 11)),
    DOM7("dom7", listOf(0, 4, 7, 10)),
    SUS2("sus2", listOf(0, 2, 7)),
    SUS4("sus4", listOf(0, 5, 7)),
    FIFTH("fifth", listOf(0, 7)),
    OCT("oct", listOf(0, 12)),
}

/**
 * A synth line: only what the line gave (null: not written; the renderer fills in its type's default). length is in
 * hundredths of a second. [note] is MIDI (C4 = 60), the knobs 0..100, [level] 1..100, [seed] 0..999 and [name] one
 * word of at most [NAME_MAX] characters. [SynthVoice] makes the sound.
 */
data class CardSynth(
    val type: SynthType,
    val note: Int? = null,
    val wave: SynthWave? = null,
    val chord: SynthChord? = null,
    val attack: Int? = null,
    val decay: Int? = null,
    val length: Int? = null,
    val tone: Int? = null,
    val reso: Int? = null,
    val sweep: Int? = null,
    val bend: Int? = null,
    val click: Int? = null,
    val noise: Int? = null,
    val snap: Int? = null,
    val drive: Int? = null,
    val detune: Int? = null,
    val level: Int? = null,
    val seed: Int? = null,
    val name: String? = null,
) {
    companion object {
        const val NAME_MAX = 13
    }
}

/** What [BeatCards.resolveSounds] makes of a sound line. */
enum class SoundStatus {
    /** The sound is on the slot to put on the pad: a change. */
    CHANGE,

    /** The pad already plays the sound: nothing to do. */
    SAME,

    /** The line's slot didn't hold the named sound (or was empty), but another slot does: still a change, to that slot. */
    FOUND_BY_NAME,

    /** Neither the slot nor the name is among the sounds: the line is skipped. */
    MISSING,
}

/**
 * A sound line matched to the user's sounds: the [pad] and what the card
 * [wanted], the [slot] and [name] to put on it (null for both when [status]
 * is [SoundStatus.MISSING]), the slot the pad plays now ([currentSlot], null
 * when not known) and the [status]. [unverified] is set when the slot is a
 * factory sound the EP-133 lists without a name ("200.pcm", see
 * [FactorySounds.unnamed]): it is used by its slot, as its name can't be checked.
 * [synth] is set when the pick is the pad's synth line: [wanted] then names
 * its device name ([SynthVoice.deviceName]), and MISSING means Arc makes it.
 */
data class SoundPick(
    val pad: PhysicalPad,
    val wanted: CardSound,
    val slot: Int?,
    val name: String?,
    val currentSlot: Int?,
    val status: SoundStatus,
    val unverified: Boolean = false,
    val synth: CardSynth? = null,
)

/**
 * A step of a card's lesson (`lesson Kick alone | A7 | 50 | Count out loud`): its [title], the [group] and [pads]
 * (offsets; null: all the group's) the player plays, at [speed] percent of the tempo, and a [tip]. It is played on the
 * first scene's pattern of that group.
 */
data class LessonStep(val title: String, val group: Int, val pads: Set<Int>?, val speed: Int = 100, val tip: String? = null) {
    companion object {
        const val MAX = 12
        const val MIN_SPEED = 25
        const val MAX_SPEED = 100
    }
}

/** Something wrong with a card, at [line] (counted from 1 in the text read): an [error] stops the card being read, a warning doesn't. */
data class CardProblem(val line: Int, val message: String, val error: Boolean)

/** A card as read: the [card], or null when any problem is an error, and all the [problems] by line. */
data class CardRead(
    val card: BeatCard?,
    val problems: List<CardProblem>,
    /** Each pad's row name as the card writes it ("A7 kick" gives kick), the first row's for a pad with several: for [BeatCards.suggestSound]. */
    val names: Map<PhysicalPad, String> = emptyMap(),
)

/**
 * A card planned into a project's sequencer: the [seq] after it, the
 * (group, pattern number) slots it filled ([placed], in the card's order: for
 * a card of scenes, scene by scene), and whether it added a scene
 * ([newScene]). [scenes] are the indices of the scenes it added, in the card's
 * order (empty when [newScene] is false); [chain] is the card's chain mapped to
 * them, as steps of those scene indices (null when the card has no chain or
 * added no scenes). [fullGroup] is the group whose bank had no free pattern
 * when nothing could be placed: then [seq] is the very one given and [placed]
 * is empty. It is null otherwise.
 */
data class CardImport(
    val seq: ProjectSeq,
    val placed: List<Pair<Int, Int>>,
    val newScene: Boolean,
    val fullGroup: Int? = null,
    val scenes: List<Int> = emptyList(),
    val chain: List<ChainStep>? = null,
)

/**
 * The ARC BEAT text card, version 1: reading it, writing it and planning it
 * into a project. Pure. The text is the spec's: grid rows for what sits on a
 * step, a notes list for what doesn't, so a card Arc wrote reads back to the
 * same patterns and writes out as the same text.
 */
object BeatCards {
    const val VERSION = 1
    const val MAX_NAME = 40

    /** The most scenes a card holds. */
    const val MAX_SCENES = 16

    /** The comment a tidied card carries. */
    const val TIDY_COMMENT = "# tidied: velocities and short gates rounded"

    private const val TEMPO_MIN = 40.0
    private const val TEMPO_MAX = 240.0

    /** The sound slots of the EP-133. */
    private const val SLOT_MIN = 1
    private const val SLOT_MAX = 999

    /** A note's gate when it gives none: a 1/16. */
    private const val DEFAULT_GATE = 24

    /** The least width of the sound name column, when any row has a name. */
    private const val NAME_WIDTH = 9

    /** The steps a card may read in, and those it writes in (first that fits). */
    private val READ_STEPS = listOf(Timing.EIGHTH, Timing.SIXTEENTH, Timing.THIRTY_SECOND, Timing.EIGHTH_T, Timing.SIXTEENTH_T)
    private val WRITE_STEPS = listOf(Timing.SIXTEENTH, Timing.SIXTEENTH_T, Timing.THIRTY_SECOND)

    /** The gate words, in ticks. */
    private val GATES = mapOf("1/4" to 96, "1/8" to 48, "1/16" to 24, "1/32" to 12, "1/8T" to 32, "1/16T" to 16)

    /** The pads in the order rows go: the keypad from top to bottom (7 8 9 4 5 6 1 2 3 . 0 E). */
    private val KEYPAD = PadNotes.ROWS.flatten()

    private val NOTE_KEYS = setOf("at", "t", "vel", "gate", "note", "semi")
    private val HEADER_KEYS = setOf("name", "tempo", "swing")

    /** The effect lines: header only. */
    private val FX_KEYS = setOf("fx", "send", "comp", "sidechain")
    private val PAD_KEYS = setOf("pitch", "level", "pan", "attack", "release", "mode")

    /** A synth line's settings, in the order a card writes them. No key is a type, wave, chord or line word. */
    private val SYNTH_KEYS = listOf(
        "note", "wave", "chord", "attack", "decay", "length", "tone", "reso", "sweep", "bend", "click", "noise", "snap", "drive", "detune", "level", "seed", "name",
    )

    /** A synth line's values: ASCII digits only, never \d. */
    private val SYNTH_INT = Regex("^[0-9]{1,3}$")
    private val SYNTH_NOTE = Regex("^[A-G]#?[0-9]$")
    private val SYNTH_LENGTH = Regex("^([0-9])(?:\\.([0-9]{1,2}))?$")
    private val SYNTH_NAME = Regex("^[A-Za-z0-9][A-Za-z0-9_-]*$")
    private const val FX_WORDS = "none, delay, reverb, distortion, chorus, filter or compressor"

    /** A knob value as a card writes it: 0 to 100, whole or with one decimal. */
    private val PERCENT = Regex("^\\d{1,3}(\\.\\d)?$")
    private const val PERCENT_TEXT = "0 to 100, whole or with one decimal"
    private val PITCH_TEXT = Regex("^[+-]?\\d{1,2}(\\.\\d{1,2})?$")
    private val GROUP_LIST = Regex("^[A-D]+$")

    private val CARD_START = Regex("^ARC[ \\t\\u00A0]+BEAT(?:[ \\t\\u00A0]|$)", RegexOption.IGNORE_CASE)
    private val PAD = Regex("^([A-D])(ENTER|[E.0-9])$")
    private val SECTION = Regex("^([A-D])(\\d*)$")
    private val AT = Regex("^(\\d{1,6})\\.(\\d{1,6})\\.(\\d{1,6})([+-]\\d{1,6})?$")
    private val NOTE_NAME = Regex("^[A-G]#?(?:-1|\\d)$")
    private val CHAIN_STEP = Regex("^(\\d{1,6})(?:[xX](\\d{1,6}))?$")
    private val TEXT_BREAKS = Regex("[#|\\t\\r\\n\\u00A0 ]+")

    /** MIDI note by name, C-1 (0) to G9 (127), as [PadNotes.noteName] names them. */
    private val NOTE_NUMBERS: Map<String, Int> by lazy { (0..127).associateBy { PadNotes.noteName(it) } }

    // ---- Reading ----

    /**
     * The card in [text]. What comes before the first ARC BEAT line is
     * ignored, and reading stops at a line that is just ``` or END; see the
     * spec for the rest. A # starts a comment at the start of a line or after
     * a space, so a sharp in a note name (C#3) stays. Lines count from 1 in
     * [text]. The card is null when any problem is an error; warnings leave
     * it readable.
     */
    fun read(text: String): CardRead = Reader(text.removePrefix("\uFEFF").lines()).run()

    /** Whether a file named [name] may hold a beat card as text, shared to Arc, opened with it or picked under PASTE: .txt, .md or .markdown. */
    fun isCardFile(name: String): Boolean = CARD_FILE.containsMatchIn(name)

    /** The most of a card file Arc reads: a longer one is no card (the text is checked by [hasCard] all the same). */
    const val MAX_CARD_FILE = 1 shl 20

    private val CARD_FILE = Regex("\\.(txt|md|markdown)$", RegexOption.IGNORE_CASE)

    /** Whether [text] has an ARC BEAT line: what [read] starts from, so a text without one is no card at all (not a card with a mistake). */
    fun hasCard(text: String): Boolean = text.removePrefix("\uFEFF").lines().any { CARD_START.containsMatchIn(trim(it)) }

    private class Draft(
        val line: Int,
        val group: Int,
        val number: Int?,
        val bars: Int,
        val step: Timing,
        /** The section's own line was wrong: its body is skipped, as it would only repeat the fault. */
        val skip: Boolean,
        /** A second section of a group already read: read for its problems, then dropped. */
        val dropped: Boolean,
    ) {
        /** The notes read, with the line each came from. */
        val hits = ArrayList<Pair<PatternNote, Int>>()

        /** The sound lines read, by pad offset. */
        val sounds = LinkedHashMap<Int, CardSound>()

        /** The pad lines read (merged when a pad has more than one), by pad offset. */
        val pads = LinkedHashMap<Int, CardPad>()

        /** The synth lines read (the later wins, in the place of the first), by pad offset. */
        val synths = LinkedHashMap<Int, CardSynth>()
        var inNotes = false
    }

    private class Reader(private val lines: List<String>) {
        // Each pad's first row name, for CardRead.names.
        private val names = LinkedHashMap<PhysicalPad, String>()
        private val problems = ArrayList<CardProblem>()
        private var name: String? = null
        private var tempo: Double? = null
        private var swing = TimingSettings.SWING_MIN
        private var fxType: FxType? = null
        private var fxX: Float? = null
        private var fxY: Float? = null
        private var fxSends: LinkedHashMap<Int, Float>? = null
        private var fxComp: Comp? = null
        private var fxSidechain: Sidechain? = null
        // The sections of the scene being read (of the one implicit scene when the card has no scene line).
        private val sections = ArrayList<CardSection>()
        private val groups = HashSet<Int>()
        private var draft: Draft? = null
        private var sectionLines = 0

        // The scenes read, the scene line count, the name of the scene being read, and the line of the first section when no scene line came before it.
        private val scenes = ArrayList<CardScene>()
        private var sceneLines = 0
        private var sceneName: String? = null
        private var firstSection = 0

        // The chain line read (card scene numbers from 1, passes) and its line.
        private var chain: List<Pair<Int, Int>>? = null
        private var chainAt = 0

        fun run(): CardRead {
            val start = lines.indexOfFirst { CARD_START.containsMatchIn(trim(it)) }
            if (start < 0) {
                error(1, "No ARC BEAT line found.")
                return result()
            }
            if (!version(start + 1, tokens(stripComment(lines[start])))) return result()
            for (i in start + 1 until lines.size) {
                val line = trim(stripComment(lines[i]))
                if (line == "```" || line.equals("END", ignoreCase = true)) break
                if (line.isEmpty()) continue
                lineAt(i + 1, line)
            }
            close()
            scenes += CardScene(if (sceneLines > 0) sceneName else null, sections.toList())
            if (sectionLines == 0) error(start + 1, "The card has no section, such as [A].")
            checkChain()
            checkLesson()
            return result()
        }

        private fun result(): CardRead {
            val sorted = problems.sortedBy { it.line }
            val card = if (sorted.any { it.error }) null else BeatCard(name, tempo, swing, scenes.toList(), cardFx(), chain, sceneLines > 0, lesson.map { it.second })
            return CardRead(card, sorted, names.toMap())
        }

        // The chain names scenes the card has, and the card has scenes at all.
        private fun checkChain() {
            val c = chain ?: return
            if (sceneLines == 0) {
                error(chainAt, "A chain needs scenes: start each scene with a scene line.")
                return
            }
            val i = c.indexOfFirst { it.first > sceneLines }
            if (i >= 0) error(chainAt, "chain step ${i + 1} names scene ${c[i].first}, but the card has $sceneLines ${if (sceneLines == 1) "scene" else "scenes"}.")
        }

        // The effect lines read, or null when the card has none.
        private fun cardFx(): CardFx? {
            val fx = CardFx(fxType, fxX, fxY, fxSends?.toMap(), fxComp, fxSidechain)
            return fx.takeUnless { it == CardFx() }
        }

        private fun error(line: Int, message: String) {
            problems += CardProblem(line, message, true)
        }

        private fun warn(line: Int, message: String) {
            problems += CardProblem(line, message, false)
        }

        // The version after ARC BEAT; false when the card can't be read at all.
        private fun version(no: Int, t: List<String>): Boolean {
            val v = t.getOrNull(2)
            if (v == null || !v.all { it in '0'..'9' } || v.length > 6 || v.toInt() < 1) {
                error(no, "ARC BEAT needs a version, as in ARC BEAT $VERSION.")
                return false
            }
            if (v.toInt() > VERSION) {
                error(no, "This card was made by a newer Arc (version ${v.toInt()}).")
                return false
            }
            return true
        }

        private fun lineAt(no: Int, line: String) {
            val first = tokens(line)[0].lowercase()
            // A lesson line may come anywhere: it names no section's pads but its own.
            if (first == "lesson") {
                lessonLine(no, line)
                return
            }
            if (first == "scene") {
                scene(no, line)
                return
            }
            if (first == "chain") {
                chainLine(no, line)
                return
            }
            if (line.startsWith("[")) {
                section(no, line)
                return
            }
            val d = draft
            if (d == null) {
                header(no, line)
                return
            }
            if (d.skip) return
            when {
                line.equals("notes", ignoreCase = true) -> d.inNotes = true
                tokens(line)[0].equals("sound", ignoreCase = true) -> sound(d, no, line)
                tokens(line)[0].equals("pad", ignoreCase = true) -> padLine(d, no, line)
                tokens(line)[0].equals("synth", ignoreCase = true) -> synthLine(d, no, line)
                tokens(line)[0].lowercase() in FX_KEYS -> error(no, "'${tokens(line)[0]}' belongs before the first section.")
                d.inNotes -> note(d, no, line)
                '|' in line -> row(d, no, line)
                firstIsPad(line) -> error(no, "${tokens(line)[0]} needs a | before its steps.")
                else -> {
                    val word = tokens(line)[0]
                    if (word.lowercase() in HEADER_KEYS) warn(no, "'$word' belongs before the first section, ignored.")
                    else warn(no, "Unknown word '$word', ignored.")
                }
            }
        }

        // ---- scenes and chain ----

        // scene [name]: starts a scene; the sections up to the next scene line are its.
        private fun scene(no: Int, line: String) {
            close()
            if (sceneLines > 0) scenes += CardScene(sceneName, sections.toList())
            else if (firstSection != 0) error(firstSection, "A section comes before the first scene line: once a card has scenes, every section belongs to one.")
            sections.clear()
            groups.clear()
            sceneLines++
            if (sceneLines == MAX_SCENES + 1) error(no, "The card has more than $MAX_SCENES scenes, the most is $MAX_SCENES.")
            val rest = trim(line.substring(tokens(line)[0].length))
            sceneName = when {
                rest.isEmpty() -> null
                rest.codePointCount(0, rest.length) > MAX_NAME -> {
                    warn(no, "Scene name is longer than $MAX_NAME characters, shortened.")
                    trim(cut(rest, MAX_NAME))
                }
                else -> rest
            }
        }

        // chain <step> ...: a step is a scene number from 1, with its passes as in 2x4 (1..8, default 1). A line with a fault changes nothing.
        private fun chainLine(no: Int, line: String) {
            val word = tokens(line)[0]
            if (sectionLines > 0 || sceneLines > 0) {
                error(no, "'$word' belongs before the first scene.")
                return
            }
            val t = tokens(line.substring(word.length))
            if (t.isEmpty()) {
                error(no, "chain needs at least one scene, as in chain 1 2x2 3.")
                return
            }
            val steps = ArrayList<Pair<Int, Int>>()
            for (tok in t) {
                val m = CHAIN_STEP.find(tok)
                if (m == null) {
                    error(no, "'$tok' isn't a chain step. Write a scene number, and its passes after an x, as in 2 or 2x4.")
                    return
                }
                val scene = m.groupValues[1].toInt()
                val passes = m.groupValues[2].ifEmpty { "1" }.toInt()
                if (scene < 1) {
                    error(no, "chain step '$tok': scenes count from 1.")
                    return
                }
                if (passes !in Chain.MIN_PASSES..Chain.MAX_PASSES) {
                    error(no, "chain step '$tok': passes must be ${Chain.MIN_PASSES} to ${Chain.MAX_PASSES}.")
                    return
                }
                steps += scene to passes
            }
            if (steps.size > Chain.MAX_STEPS) {
                error(no, "The chain has ${steps.size} steps, the most is ${Chain.MAX_STEPS}.")
                return
            }
            if (chain != null) warn(no, "Two chain lines, kept the later.")
            chain = steps
            chainAt = no
        }

        // ---- lesson ----

        private val lesson = ArrayList<Pair<Int, LessonStep>>()

        // lesson <title> | <pads> | <speed> | <tip>: a step of the lesson. A line with a fault is left out.
        private fun lessonLine(no: Int, line: String) {
            val parts = line.substring(tokens(line)[0].length).split('|').map { trim(it) }
            var title = parts.getOrNull(0).orEmpty()
            val padsText = parts.getOrNull(1).orEmpty()
            if (title.isEmpty() || padsText.isEmpty()) {
                error(no, "A lesson line needs a title and the pads to play, as in lesson Kick alone | A7 | 50.")
                return
            }
            if (lesson.size == LessonStep.MAX) {
                error(no, "The lesson has more than ${LessonStep.MAX} steps, the most is ${LessonStep.MAX}.")
                return
            }
            if (title.codePointCount(0, title.length) > MAX_NAME) {
                warn(no, "Lesson step title is longer than $MAX_NAME characters, shortened.")
                title = trim(cut(title, MAX_NAME))
            }
            var group: Int? = null
            var pads: MutableSet<Int>? = HashSet()
            for (tok in tokens(padsText)) {
                val whole = tok.length == 1 && tok[0] in 'A'..'D'
                val pad = if (whole) null else parsePad(tok)
                val g = if (whole) tok[0] - 'A' else pad?.group
                if (g == null) {
                    error(no, "'$tok' isn't a pad or a group: write pads such as A7 A9, or A for the whole group.")
                    return
                }
                if (group != null && g != group) {
                    error(no, "A lesson step's pads are all in one group.")
                    return
                }
                group = g
                if (whole) pads = null else pads?.add(pad!!.offset)
            }
            val speedText = parts.getOrNull(2)?.removeSuffix("%")?.let { trim(it) }.orEmpty()
            val speed = if (speedText.isEmpty()) LessonStep.MAX_SPEED else speedText.takeIf { it.length <= 3 && it.all { c -> c in '0'..'9' } }?.toInt()
            if (speed == null || speed !in LessonStep.MIN_SPEED..LessonStep.MAX_SPEED) {
                error(no, "A lesson step's speed is ${LessonStep.MIN_SPEED} to ${LessonStep.MAX_SPEED} percent of the tempo.")
                return
            }
            val tip = parts.drop(3).joinToString(" | ").let { trim(it) }.takeIf { it.isNotEmpty() }
            lesson += no to LessonStep(title, group!!, pads, speed, tip)
        }

        // Each step's pads have pad hits in the first scene's pattern of its group.
        private fun checkLesson() {
            val first = scenes.firstOrNull()?.sections.orEmpty()
            for ((no, step) in lesson) {
                val notes = first.firstOrNull { it.group == step.group }?.pattern?.playable().orEmpty().filter { it.semitones == null }
                val played = notes.map { it.offset }.toSet()
                val missing = step.pads?.filter { it !in played }.orEmpty()
                when {
                    notes.isEmpty() -> error(no, "Lesson step '${step.title}': the card's first scene has no pad hits in group ${'A' + step.group}.")
                    missing.isNotEmpty() -> error(no, "Lesson step '${step.title}': ${missing.joinToString(" ") { padText(step.group, it) }} has no hits in the first scene's [${'A' + step.group}].")
                }
            }
        }

        // ---- header ----

        private fun header(no: Int, line: String) {
            val word = tokens(line)[0]
            val key = word.lowercase()
            val rest = trim(line.substring(word.length))
            when {
                sceneLines > 0 && key in HEADER_KEYS -> warn(no, "'$word' belongs before the first scene, ignored.")
                sceneLines > 0 && key in FX_KEYS -> error(no, "'$word' belongs before the first scene.")
                '|' in line || firstIsPad(line) || key == "notes" || key == "sound" || key == "pad" || key == "synth" -> error(no, "'$word' needs a section first, such as [A].")
                key in FX_KEYS -> fxLine(no, word, key, tokens(rest))
                key == "name" -> when {
                    rest.isEmpty() -> warn(no, "Name is empty, ignored.")
                    rest.codePointCount(0, rest.length) > MAX_NAME -> {
                        warn(no, "Name is longer than $MAX_NAME characters, shortened.")
                        name = trim(cut(rest, MAX_NAME))
                    }
                    else -> name = rest
                }
                key == "tempo" -> {
                    val t = tokens(rest)
                    val v = if (t.size == 1 && Regex("^\\d{1,3}(\\.\\d)?$").matches(t[0])) t[0].toDouble() else null
                    if (v == null || v < TEMPO_MIN || v > TEMPO_MAX) error(no, "Tempo must be 40 to 240, whole or with one decimal.")
                    else tempo = v
                }
                key == "swing" -> {
                    val t = tokens(rest)
                    val v = if (t.size == 1 && Regex("^\\d{1,3}$").matches(t[0])) t[0].toInt() else null
                    if (v == null || v < TimingSettings.SWING_MIN || v > TimingSettings.SWING_MAX) error(no, "Swing must be a whole number from 50 to 75.")
                    else swing = v
                }
                else -> warn(no, "Unknown header word '$word', ignored.")
            }
        }

        // ---- sections ----

        private fun section(no: Int, line: String) {
            close()
            sectionLines++
            if (sceneLines == 0 && firstSection == 0) firstSection = no
            val end = line.indexOf(']')
            if (end < 0) {
                skipped(no, "A section needs a closing ], as in [A].")
                return
            }
            val m = SECTION.find(trim(line.substring(1, end)))
            if (m == null) {
                skipped(no, "A section needs a group A to D, as in [A] or [A07].")
                return
            }
            val group = m.groupValues[1][0] - 'A'
            val digits = m.groupValues[2]
            val number = if (digits.isEmpty()) null else digits.toIntOrNull()?.takeIf { digits.length <= 2 && it in 1..Seq.MAX_PATTERNS }
            if (digits.isNotEmpty() && number == null) {
                skipped(no, "The pattern number in [${m.groupValues[1]}$digits] must be 1 to ${Seq.MAX_PATTERNS}.")
                return
            }
            val t = tokens(line.substring(end + 1))
            var bars = Seq.DEFAULT_BARS
            var step = Timing.SIXTEENTH
            var bad = false
            var i = 0
            while (i < t.size) {
                val key = t[i].lowercase()
                val v = t.getOrNull(i + 1)
                when (key) {
                    "bars" -> {
                        val n = v?.takeIf { it.length <= 3 && it.all { c -> c in '0'..'9' } }?.toInt()
                        if (n == null || n !in 1..Seq.MAX_BARS) {
                            error(no, "bars must be a whole number from 1 to ${Seq.MAX_BARS}.")
                            bad = true
                        } else bars = n
                        i += 2
                    }
                    "step" -> {
                        val s = READ_STEPS.firstOrNull { it.id.equals(v, ignoreCase = true) }
                        if (s == null) {
                            error(no, "step must be one of ${READ_STEPS.joinToString(" ") { it.id }}.")
                            bad = true
                        } else step = s
                        i += 2
                    }
                    else -> {
                        warn(no, "Unknown option '${t[i]}' on [${m.groupValues[1]}], ignored.")
                        i += if (v != null && v.lowercase() !in setOf("bars", "step")) 2 else 1
                    }
                }
            }
            val dropped = !groups.add(group)
            if (dropped) error(no, "Group ${'A' + group} has two sections.")
            draft = Draft(no, group, number, bars, step, skip = bad, dropped = dropped)
        }

        // A section line that can't be used: its body is skipped.
        private fun skipped(no: Int, message: String) {
            error(no, message)
            draft = Draft(no, 0, null, Seq.DEFAULT_BARS, Timing.SIXTEENTH, skip = true, dropped = true)
        }

        // The section's pattern: duplicates folded, the limit checked.
        private fun close() {
            val d = draft ?: return
            draft = null
            if (d.skip) return
            val kept = ArrayList<PatternNote>()
            val at = HashMap<Triple<Int, Int, Int?>, Int>()
            for ((n, no) in d.hits) {
                val key = Triple(n.offset, n.tick, n.semitones)
                val j = at[key]
                if (j == null) {
                    at[key] = kept.size
                    kept += n
                } else {
                    warn(no, "${padText(d.group, n.offset)} has two hits at ${atText(n.tick)}, kept the louder.")
                    if (n.velocity > kept[j].velocity) kept[j] = n
                }
            }
            if (kept.size > Seq.MAX_NOTES) error(d.line, "Group ${'A' + d.group} has ${kept.size} notes, the most is ${Seq.MAX_NOTES}.")
            if (!d.dropped) sections += CardSection(d.group, d.number, Pattern(d.bars, kept.sortedWith(NOTE_ORDER)), d.sounds, d.pads, d.synths)
        }

        // ---- grid rows ----

        private fun row(d: Draft, no: Int, line: String) {
            val bar = line.indexOf('|')
            val head = tokens(line.substring(0, bar))
            val pad = head.firstOrNull()?.let { parsePad(it) }
            if (pad == null) {
                error(no, if (head.isEmpty()) "A row needs a pad before its first |." else "'${head[0]}' isn't a pad. Use A to D, then . 0 E or 1 to 9.")
                return
            }
            val label = padText(pad.group, pad.offset)
            if (pad.group != d.group) {
                error(no, "$label is in group ${'A' + pad.group}, but the section is [${'A' + d.group}].")
                return
            }
            if (head.size > 1) names.putIfAbsent(PhysicalPad(pad.group, pad.offset), head.drop(1).joinToString(" "))
            val per = Seq.TICKS_PER_BAR / d.step.ticks
            val total = d.bars * per
            val steps = line.substring(bar + 1).filter { !isSpace(it) && it != '|' }
            val hits = ArrayList<IntArray>() // step, velocity, steps held
            var open = false
            for ((k, c) in steps.withIndex()) {
                val v = velocityOf(c)
                when {
                    v != null -> {
                        hits += intArrayOf(k, v, 1)
                        open = true
                    }
                    c == '-' -> {
                        if (!open) {
                            error(no, "$label bar ${k / per + 1} has a - with no hit before it.")
                            return
                        }
                        hits.last()[2]++
                    }
                    c == '.' -> open = false
                    else -> {
                        error(no, "$label bar ${k / per + 1} has '$c', which isn't one of X x o 1-9 - or .")
                        return
                    }
                }
            }
            if (steps.length < total) {
                val has = steps.length % per
                error(no, "$label bar ${steps.length / per + 1} has $has ${if (has == 1) "step" else "steps"}, needs $per.")
                return
            }
            if (steps.length > total) {
                error(no, "$label has ${steps.length} steps, needs $total.")
                return
            }
            for ((k, v, held) in hits) d.hits += PatternNote(Steps.tickOf(k, d.step, swing), pad.offset, held * d.step.ticks, null, v) to no
        }

        // ---- sound lines ----

        // sound <pad> <slot> [name], anywhere in a section (after notes too). A second line for a pad replaces the first.
        private fun sound(d: Draft, no: Int, line: String) {
            var rest = trim(line.substring(tokens(line)[0].length))
            val padToken = tokens(rest).firstOrNull()
            if (padToken == null) {
                error(no, "A sound line needs a pad and a slot, as in sound A7 12 Kick.")
                return
            }
            val pad = parsePad(padToken)
            if (pad == null) {
                error(no, "'$padToken' isn't a pad. Use A to D, then . 0 E or 1 to 9.")
                return
            }
            val label = padText(pad.group, pad.offset)
            if (pad.group != d.group) {
                error(no, "$label is in group ${'A' + pad.group}, but the section is [${'A' + d.group}].")
                return
            }
            rest = trim(rest.substring(padToken.length))
            val slotToken = tokens(rest).firstOrNull()
            val slot = slotToken?.takeIf { INT.matches(it) }?.toInt()?.takeIf { it in SLOT_MIN..SLOT_MAX }
            if (slot == null) {
                error(no, "$label sound: the slot must be a whole number from $SLOT_MIN to $SLOT_MAX.")
                return
            }
            val name = cleanText(rest.substring(slotToken.length), Int.MAX_VALUE).ifEmpty { null }
            if (pad.offset in d.sounds) warn(no, "$label has two sound lines, kept the later.")
            d.sounds[pad.offset] = CardSound(slot, name)
        }

        // ---- synth lines ----

        // synth <pad> <type> [<key> <value>]...: a sound Arc makes. A line with an error is left out, and an earlier line for the pad stays.
        private fun synthLine(d: Draft, no: Int, line: String) {
            if (d.inNotes) warn(no, "Put synth lines before notes, so older Arc can read the card.")
            if ('|' in line) {
                error(no, "A synth line can't hold a |.")
                return
            }
            val t = tokens(line)
            if (t.size < 3) {
                error(no, "A synth line needs a pad and a sound type, as in synth A7 kick.")
                return
            }
            val pad = parsePad(t[1])
            if (pad == null) {
                error(no, "'${t[1]}' isn't a pad. Use A to D, then . 0 E or 1 to 9.")
                return
            }
            val label = padText(pad.group, pad.offset)
            if (pad.group != d.group) {
                error(no, "$label is in group ${'A' + pad.group}, but the section is [${'A' + d.group}].")
                return
            }
            val type = SynthType.entries.firstOrNull { it.id == t[2].lowercase() }
            if (type == null) {
                warn(no, "Unknown sound type '${t[2]}' on $label synth, line ignored.")
                return
            }
            var s = CardSynth(type)
            var i = 3
            while (i < t.size) {
                val key = t[i].lowercase()
                val v = t.getOrNull(i + 1)
                if (key !in SYNTH_KEYS) {
                    warn(no, "Unknown setting '${t[i]}' on $label synth, ignored.")
                    i += if (v != null && v.lowercase() !in SYNTH_KEYS) 2 else 1
                    continue
                }
                if (v == null) {
                    error(no, "$label synth: $key needs a value.")
                    return
                }
                s = when (key) {
                    "note" -> {
                        val n = (if (SYNTH_NOTE.matches(v)) NOTE_NUMBERS[v] else null)?.takeIf { it in SYNTH_NOTE_MIN..SYNTH_NOTE_MAX }
                            ?: return error(no, "$label synth: note must be C0 to C7, such as C2 or F#1.")
                        s.copy(note = n)
                    }
                    "length" -> {
                        val m = SYNTH_LENGTH.matchEntire(v)
                        val cs = m?.let {
                            val frac = it.groupValues[2]
                            it.groupValues[1].toInt() * 100 + if (frac.isEmpty()) 0 else if (frac.length == 1) frac.toInt() * 10 else frac.toInt()
                        }?.takeIf { it in SYNTH_LENGTH_MIN..SYNTH_LENGTH_MAX }
                            ?: return error(no, "$label synth: length must be 0.05 to 4 seconds, with up to two decimals.")
                        s.copy(length = cs)
                    }
                    "wave" -> SynthWave.entries.firstOrNull { it.id == v.lowercase() }?.let { s.copy(wave = it) } ?: run {
                        warn(no, "$label synth: unknown wave '$v', ignored.")
                        s
                    }
                    "chord" -> SynthChord.entries.firstOrNull { it.id == v.lowercase() }?.let { s.copy(chord = it) } ?: run {
                        warn(no, "$label synth: unknown chord '$v', ignored.")
                        s
                    }
                    "name" -> {
                        if (!SYNTH_NAME.matches(v)) return error(no, "$label synth: name must be one word of letters, digits, _ or -, starting with a letter or digit.")
                        if (v.length > CardSynth.NAME_MAX) warn(no, "$label synth: name cut to ${CardSynth.NAME_MAX} characters.")
                        s.copy(name = v.take(CardSynth.NAME_MAX))
                    }
                    else -> {
                        val (lo, hi) = when (key) {
                            "level" -> 1 to 100
                            "seed" -> 0 to 999
                            else -> 0 to 100
                        }
                        val n = v.takeIf { SYNTH_INT.matches(it) }?.toInt()?.takeIf { it in lo..hi }
                            ?: return error(no, "$label synth: $key must be a whole number from $lo to $hi.")
                        when (key) {
                            "attack" -> s.copy(attack = n)
                            "decay" -> s.copy(decay = n)
                            "tone" -> s.copy(tone = n)
                            "reso" -> s.copy(reso = n)
                            "sweep" -> s.copy(sweep = n)
                            "bend" -> s.copy(bend = n)
                            "click" -> s.copy(click = n)
                            "noise" -> s.copy(noise = n)
                            "snap" -> s.copy(snap = n)
                            "drive" -> s.copy(drive = n)
                            "detune" -> s.copy(detune = n)
                            "level" -> s.copy(level = n)
                            else -> s.copy(seed = n)
                        }
                    }
                }
                i += 2
            }
            if (pad.offset in d.synths) warn(no, "$label has two synth lines, kept the later.")
            d.synths[pad.offset] = s
        }

        // ---- effect lines (header only) ----

        // fx / send / comp / sidechain: [t] are the words after [word]. A line with a fault changes nothing.
        private fun fxLine(no: Int, word: String, key: String, t: List<String>) {
            when (key) {
                "fx" -> {
                    val type = t.firstOrNull()?.let { w -> FxType.entries.firstOrNull { it.name.equals(w, ignoreCase = true) } }
                    if (type == null) {
                        error(no, if (t.isEmpty()) "fx needs an effect: $FX_WORDS." else "'${t[0]}' isn't an effect. Use $FX_WORDS.")
                        return
                    }
                    val x = if (t.size > 1) percent(t[1]) ?: return error(no, "fx x must be $PERCENT_TEXT.") else 0.5f
                    val y = if (t.size > 2) percent(t[2]) ?: return error(no, "fx y must be $PERCENT_TEXT.") else 0.5f
                    extra(no, word, t, 3)
                    if (fxType != null) warn(no, "Two fx lines, kept the later.")
                    fxType = type
                    fxX = x
                    fxY = y
                }
                "send" -> {
                    if (t.isEmpty()) {
                        error(no, "send needs a group and a value, as in send A 40 B 20.")
                        return
                    }
                    val line = LinkedHashMap<Int, Float>()
                    var i = 0
                    while (i < t.size) {
                        val g = t[i]
                        if (g.length != 1 || g[0] !in 'A'..'D') {
                            error(no, "'$g' isn't a group. Use A to D.")
                            return
                        }
                        val v = t.getOrNull(i + 1)
                        if (v == null) {
                            error(no, "send $g needs a value, $PERCENT_TEXT.")
                            return
                        }
                        line[g[0] - 'A'] = percent(v) ?: return error(no, "send $g must be $PERCENT_TEXT.")
                        i += 2
                    }
                    fxSends = (fxSends ?: LinkedHashMap()).also { it.putAll(line) }
                }
                "comp" -> {
                    if (t.isEmpty()) {
                        error(no, "comp needs off, or a drive and a speed, as in comp 40 60.")
                        return
                    }
                    val c = if (t[0].equals("off", ignoreCase = true)) {
                        extra(no, word, t, 1)
                        Comp(false)
                    } else {
                        val drive = percent(t[0]) ?: return error(no, "comp drive must be $PERCENT_TEXT, or use comp off.")
                        val speed = t.getOrNull(1)?.let { percent(it) ?: return error(no, "comp speed must be $PERCENT_TEXT.") }
                            ?: return error(no, "comp needs a speed after the drive, as in comp 40 60.")
                        extra(no, word, t, 2)
                        Comp(true, drive, speed)
                    }
                    if (fxComp != null) warn(no, "Two comp lines, kept the later.")
                    fxComp = c
                }
                else -> {
                    if (t.isEmpty()) {
                        error(no, "sidechain needs off, or a pad and the groups it ducks, as in sidechain A7 BC.")
                        return
                    }
                    val sc = if (t[0].equals("off", ignoreCase = true)) {
                        extra(no, word, t, 1)
                        Sidechain(on = false)
                    } else {
                        val pad = parsePad(t[0]) ?: return error(no, "'${t[0]}' isn't a pad. Use A to D, then . 0 E or 1 to 9.")
                        val groups = t.getOrNull(1) ?: return error(no, "sidechain ${t[0]} needs the groups it ducks, as in sidechain A7 BC.")
                        if (!GROUP_LIST.matches(groups)) return error(no, "'$groups' isn't a list of groups. Use the letters A to D, as in BC.")
                        val length = if (t.size > 2) percent(t[2]) ?: return error(no, "sidechain length must be $PERCENT_TEXT.") else 0.3f
                        val shape = if (t.size > 3) percent(t[3]) ?: return error(no, "sidechain shape must be $PERCENT_TEXT.") else 0.5f
                        extra(no, word, t, 4)
                        Sidechain(true, pad.group, pad.offset, groups.fold(0) { m, c -> m or (1 shl (c - 'A')) }, length, shape)
                    }
                    if (fxSidechain != null) warn(no, "Two sidechain lines, kept the later.")
                    fxSidechain = sc
                }
            }
        }

        // Words left over after the line's last value ([t] from index [from]) are ignored, with a warning.
        private fun extra(no: Int, word: String, t: List<String>, from: Int) {
            if (t.size > from) warn(no, "The $word line has extra words from '${t[from]}', ignored.")
        }

        // A knob value, 0 to 100 as a card writes it, as 0..1; null when it isn't one.
        private fun percent(token: String): Float? =
            token.takeIf { PERCENT.matches(it) }?.toDouble()?.takeIf { it <= 100.0 }?.let { (it / 100.0).toFloat() }

        // ---- pad lines ----

        // pad <pad> [pitch n] [level n] [pan n] [attack n] [release n] [mode m], anywhere in a section. A second line for a pad merges into the first.
        private fun padLine(d: Draft, no: Int, line: String) {
            val t = tokens(line)
            val padToken = t.getOrNull(1)
            if (padToken == null) {
                error(no, "A pad line needs a pad and a setting, as in pad A7 pitch -7 level 90.")
                return
            }
            val pad = parsePad(padToken)
            if (pad == null) {
                error(no, "'$padToken' isn't a pad. Use A to D, then . 0 E or 1 to 9.")
                return
            }
            val label = padText(pad.group, pad.offset)
            if (pad.group != d.group) {
                error(no, "$label is in group ${'A' + pad.group}, but the section is [${'A' + d.group}].")
                return
            }
            var shaping = CardPad()
            var i = 2
            while (i < t.size) {
                val key = t[i].lowercase()
                val v = t.getOrNull(i + 1)
                if (key !in PAD_KEYS) {
                    warn(no, "Unknown setting '${t[i]}' on $label pad, ignored.")
                    i += if (v != null && v.lowercase() !in PAD_KEYS) 2 else 1
                    continue
                }
                if (v == null) {
                    error(no, "$label pad: $key needs a value.")
                    return
                }
                shaping = when (key) {
                    "pitch" -> {
                        val n = v.takeIf { PITCH_TEXT.matches(it) }?.toDouble()?.takeIf { it in -PadSettings.PITCH_MAX..PadSettings.PITCH_MAX }
                            ?: return error(no, "$label pad: pitch must be -12 to 12 semitones, whole or with up to two decimals.")
                        shaping.copy(pitch = n + 0.0)
                    }
                    "level" -> shaping.copy(level = padInt(v, 0, PadSettings.LEVEL_MAX) ?: return error(no, "$label pad: level must be a whole number from 0 to ${PadSettings.LEVEL_MAX}."))
                    "pan" -> shaping.copy(pan = padInt(v, -PadSettings.PAN_MAX, PadSettings.PAN_MAX) ?: return error(no, "$label pad: pan must be a whole number from -${PadSettings.PAN_MAX} to ${PadSettings.PAN_MAX}, negative is left."))
                    "attack" -> shaping.copy(attack = padInt(v, 0, PadSettings.ENV_MAX) ?: return error(no, "$label pad: attack must be a whole number from 0 to ${PadSettings.ENV_MAX}."))
                    "release" -> shaping.copy(release = padInt(v, 0, PadSettings.ENV_MAX) ?: return error(no, "$label pad: release must be a whole number from 0 to ${PadSettings.ENV_MAX}."))
                    else -> shaping.copy(mode = PlayMode.of(v.lowercase()) ?: return error(no, "$label pad: mode must be oneshot, key or legato."))
                }
                i += 2
            }
            if (shaping.isEmpty) {
                error(no, "$label pad: give at least one of pitch, level, pan, attack, release or mode.")
                return
            }
            val before = d.pads[pad.offset]
            if (before != null) warn(no, "$label has two pad lines, merged, the later settings win.")
            d.pads[pad.offset] = before?.merged(shaping) ?: shaping
        }

        // A whole number (a + or - allowed) from [lo] to [hi]; null when it isn't one.
        private fun padInt(v: String, lo: Int, hi: Int): Int? = v.takeIf { SIGNED.matches(it) }?.toIntOrNull()?.takeIf { it in lo..hi }

        // ---- notes list ----

        private fun note(d: Draft, no: Int, line: String) {
            val t = tokens(line)
            val pad = parsePad(t[0])
            if (pad == null) {
                error(no, "'${t[0]}' isn't a pad. Use A to D, then . 0 E or 1 to 9.")
                return
            }
            val label = padText(pad.group, pad.offset)
            if (pad.group != d.group) {
                error(no, "$label is in group ${'A' + pad.group}, but the section is [${'A' + d.group}].")
                return
            }
            var tick: Int? = null
            var tickKey = ""
            var vel = 127
            var gate = DEFAULT_GATE
            var semi: Int? = null
            var semiKey = ""
            var i = 1
            while (i < t.size) {
                val key = t[i].lowercase()
                val v = t.getOrNull(i + 1)
                if (key !in NOTE_KEYS) {
                    warn(no, "Unknown option '${t[i]}' on $label note, ignored.")
                    i += if (v != null && v.lowercase() !in NOTE_KEYS) 2 else 1
                    continue
                }
                if (v == null) {
                    error(no, "$label note: $key needs a value.")
                    return
                }
                when (key) {
                    "at", "t" -> {
                        if (tickKey.isNotEmpty() && tickKey != key) {
                            error(no, "$label note has both at and t.")
                            return
                        }
                        tickKey = key
                        tick = if (key == "t") v.toIntOrNull()?.takeIf { INT.matches(v) } else atTick(v)
                        if (tick == null) {
                            error(no, if (key == "t") "$label note: t needs a whole tick number." else "$label note: at needs bar.beat.sixteenth, with beat and sixteenth 1 to 4, as in 1.2.3 or 1.2.3+6.")
                            return
                        }
                    }
                    "vel" -> {
                        vel = v.toIntOrNull()?.takeIf { INT.matches(v) && it in 1..127 } ?: run {
                            error(no, "$label note: vel must be 1 to 127.")
                            return
                        }
                    }
                    "gate" -> {
                        gate = GATES[v.uppercase()] ?: v.toIntOrNull()?.takeIf { INT.matches(v) && it >= 1 } ?: run {
                            error(no, "$label note: gate must be a tick count or one of ${GATES.keys.joinToString(" ")}.")
                            return
                        }
                    }
                    "note" -> {
                        if (semiKey == "semi") {
                            error(no, "$label note has both note and semi.")
                            return
                        }
                        semiKey = "note"
                        semi = (if (NOTE_NAME.matches(v)) NOTE_NUMBERS[v] else null)?.minus(Keys.ROOT_NOTE) ?: run {
                            error(no, "$label note: note must be a name from C-1 to G9, such as C4.")
                            return
                        }
                    }
                    else -> {
                        if (semiKey == "note") {
                            error(no, "$label note has both note and semi.")
                            return
                        }
                        semiKey = "semi"
                        semi = v.toIntOrNull()?.takeIf { SIGNED.matches(v) && it in -127..127 } ?: run {
                            error(no, "$label note: semi must be -127 to 127.")
                            return
                        }
                    }
                }
                i += 2
            }
            if (tick == null) {
                error(no, "$label note needs at or t to place it.")
                return
            }
            val length = d.bars * Seq.TICKS_PER_BAR
            if (tick !in 0 until length) {
                error(no, "$label note at tick $tick is outside the pattern (0 to ${length - 1}).")
                return
            }
            d.hits += PatternNote(tick, pad.offset, gate, semi, vel) to no
        }

        // bar.beat.sixteenth with its leftover ticks, as a tick; null when it isn't one.
        private fun atTick(v: String): Int? {
            val m = AT.find(v) ?: return null
            val (bar, beat, six) = m.groupValues.drop(1).take(3).map { it.toInt() }
            if (bar < 1 || beat !in 1..Tempo.BEATS_PER_BAR || six !in 1..4) return null
            val adjust = m.groupValues[4].let { if (it.isEmpty()) 0 else it.toInt() }
            return (bar - 1) * Seq.TICKS_PER_BAR + (beat - 1) * Seq.PPQN + (six - 1) * 24 + adjust
        }
    }

    private val INT = Regex("^\\d{1,9}$")

    /** A synth line's note (C0..C7, MIDI) and length (hundredths of a second, 0.05..4 s). */
    private const val SYNTH_NOTE_MIN = 12
    private const val SYNTH_NOTE_MAX = 96
    private const val SYNTH_LENGTH_MIN = 5
    private const val SYNTH_LENGTH_MAX = 400
    private val SIGNED = Regex("^[+-]?\\d{1,9}$")
    private val NOTE_ORDER = compareBy<PatternNote>({ it.tick }, { it.offset }, { it.semitones ?: Int.MIN_VALUE })

    private fun isSpace(c: Char) = c == ' ' || c == '\t' || c == '\u00A0'

    private fun trim(s: String) = s.trim { isSpace(it) }

    // A # starts a comment at the start of a line or after a space; one inside a word is a sharp (note C#3).
    private fun stripComment(s: String): String {
        for (i in s.indices) if (s[i] == '#' && (i == 0 || isSpace(s[i - 1]))) return s.substring(0, i)
        return s
    }

    private fun tokens(s: String) = s.split(' ', '\t', '\u00A0').filter { it.isNotEmpty() }

    // [s] cut to at most [max] characters, a surrogate pair counting as one so it is never split.
    private fun cut(s: String, max: Int): String =
        if (s.codePointCount(0, s.length) <= max) s else s.substring(0, s.offsetByCodePoints(0, max))

    private fun firstIsPad(line: String) = parsePad(tokens(line)[0]) != null

    // "A7", "A." or "AENTER" (or "AE") as a pad; null when it isn't one. Case counts.
    private fun parsePad(token: String): PhysicalPad? {
        val m = PAD.find(token) ?: return null
        val label = if (m.groupValues[2] == "E") "ENTER" else m.groupValues[2]
        return PhysicalPad(m.groupValues[1][0] - 'A', PadNotes.LABELS.indexOf(label))
    }

    /** A pad as a card writes it: its group letter and label, ENTER as E. */
    private fun padText(group: Int, offset: Int): String = "${'A' + group}${if (offset == 2) "E" else PadNotes.LABELS[offset]}"

    // The velocity a step character plays at; null when it isn't a hit.
    private fun velocityOf(c: Char): Int? = when (c) {
        'X' -> 127
        'x' -> 100
        'o' -> 64
        in '1'..'9' -> 14 * (c - '0')
        else -> null
    }

    // The step character for a velocity; null when no character gives it.
    private fun charOf(velocity: Int): Char? = when {
        velocity == 127 -> 'X'
        velocity == 100 -> 'x'
        velocity == 64 -> 'o'
        velocity in 14..126 && velocity % 14 == 0 -> '0' + velocity / 14
        else -> null
    }

    /** [tick] as the notes list gives it: bar.beat.sixteenth, and the ticks left over as +n (or -n before the next sixteenth). */
    private fun atText(tick: Int): String {
        val bar = tick / Seq.TICKS_PER_BAR
        val within = tick % Seq.TICKS_PER_BAR
        var sixteenth = within / 24
        var left = within % 24
        // Past halfway the next sixteenth is nearer; the last of a bar keeps its +n.
        if (left > 12 && sixteenth < 15) {
            sixteenth++
            left -= 24
        }
        val suffix = if (left > 0) "+$left" else if (left < 0) "$left" else ""
        return "${bar + 1}.${sixteenth / 4 + 1}.${sixteenth % 4 + 1}$suffix"
    }

    // ---- Writing ----

    /**
     * [card] as text, as the spec's writing rules have it. [names] gives the
     * sound name a row shows after its pad (null for none). A section's
     * sound lines come right after its line, in keypad order, each with its
     * name when it has one; then its synth lines ([synthText]), in keypad
     * order, before its pad lines, rows and notes list, so older Arc reads
     * the card. With [tidy],
     * velocities are rounded to 127, 100 or 64 (ties up) and gates under a
     * step become a step, for every note, and the card says so in a comment.
     * The [silent] pads ([silentPads]) are listed in a comment of their own
     * right after the header ([ClaudeText.noSoundOn]); readers ignore it.
     * A card of scenes ([BeatCard.multiScene]) is written as the spec's
     * writing rule has it: the `chain` line after the effect lines (steps
     * that name no scene are left out), then each scene as a `scene` line
     * with its name if it has one, followed by its sections in group order. A
     * section that only repeats the previous scene's pattern for its group
     * (the same pattern, sounds, pad shaping and synth lines) is left out. The text ends in
     * a newline.
     */
    fun write(card: BeatCard, names: (PhysicalPad) -> String? = { null }, tidy: Boolean = false, silent: List<PhysicalPad> = emptyList()): String {
        val swing = TimingSettings.clampSwing(card.swing)
        val out = ArrayList<String>()
        out += "ARC BEAT $VERSION"
        card.name?.let { cleanText(it, MAX_NAME) }?.takeIf { it.isNotEmpty() }?.let { out += "name $it" }
        card.tempo?.let { out += "tempo ${tempoText(it)}" }
        out += "swing $swing"
        card.fx?.let { writeFx(out, it) }
        if (card.multiScene) card.chain?.let { writeChain(out, it, card.scenes.size) }
        for (step in card.lesson.take(LessonStep.MAX)) out += lessonText(step)
        if (silent.isNotEmpty()) out += ClaudeText.noSoundOn(silent)
        if (tidy) out += TIDY_COMMENT
        if (!card.multiScene) {
            for (s in card.sections.sortedBy { it.group }) {
                out += ""
                writeSection(out, s, swing, names, tidy)
            }
            return out.joinToString("\n", postfix = "\n")
        }
        val before = arrayOfNulls<CardSection>(4)
        for (sc in card.scenes) {
            out += ""
            out += "scene" + (sc.name?.let { cleanText(it, MAX_NAME) }?.takeIf { it.isNotEmpty() }?.let { " $it" } ?: "")
            var first = true
            for (s in sc.sections.sortedBy { it.group }) {
                val prev = before.getOrNull(s.group)
                if (prev != null && repeats(prev, s)) continue
                if (!first) out += ""
                first = false
                writeSection(out, s, swing, names, tidy)
                if (s.group in 0..3) before[s.group] = s
            }
        }
        return out.joinToString("\n", postfix = "\n")
    }

    /** A lesson step as its line: "lesson Kick alone | A7 | 50 | Count out loud" (the speed left out at 100, A for the whole group). */
    fun lessonText(step: LessonStep): String {
        val parts = listOf(cleanText(step.title, MAX_NAME), lessonPads(step)) +
            listOfNotNull(if (step.speed != LessonStep.MAX_SPEED || step.tip != null) "${step.speed}" else null, step.tip?.let { cleanText(it, Int.MAX_VALUE) })
        return "lesson " + parts.joinToString(" | ")
    }

    /** A lesson step's pads as a card writes them, in keypad order ("A7 A9"), or the group's letter for all its pads. */
    fun lessonPads(step: LessonStep): String =
        step.pads?.let { set -> PadNotes.ROWS.flatten().filter { it in set }.joinToString(" ") { padText(step.group, it) } } ?: "${'A' + step.group}"

    // The chain line: steps as 2 or 2x4; those naming a scene the card hasn't, or passes out of range, are left out, and so is a chain left with none.
    private fun writeChain(out: MutableList<String>, chain: List<Pair<Int, Int>>, sceneCount: Int) {
        val steps = chain.filter { (scene, passes) -> scene in 1..sceneCount && passes in Chain.MIN_PASSES..Chain.MAX_PASSES }.take(Chain.MAX_STEPS)
        if (steps.isEmpty()) return
        out += "chain " + steps.joinToString(" ") { (scene, passes) -> if (passes == 1) "$scene" else "${scene}x$passes" }
    }

    // Whether section [s] only repeats [prev], the previous scene's for its group: the same pattern as written (not the notes' ids), sounds, pad shaping and synth lines.
    private fun repeats(prev: CardSection, s: CardSection): Boolean =
        s.sounds == prev.sounds && s.pads == prev.pads && s.synths == prev.synths && samePattern(prev.pattern, s.pattern)

    // Whether two patterns are written the same: the bars and the notes that play, in order, whatever their ids.
    private fun samePattern(a: Pattern, b: Pattern): Boolean = a.bars == b.bars && keyed(a) == keyed(b)

    private fun keyed(p: Pattern): List<PatternNote> =
        unique(p.notes.filter { it.tick in 0 until p.lengthTicks }).map { it.copy(id = 0) }
            .sortedWith(compareBy<PatternNote>({ it.tick }, { it.offset }, { it.semitones ?: Int.MIN_VALUE }, { it.velocity }, { it.gate }))

    // The effect lines: fx (when there is an effect line), send, comp, sidechain; knobs as whole percents.
    private fun writeFx(out: MutableList<String>, fx: CardFx) {
        fx.type?.let { type ->
            out += "fx ${type.name.lowercase()}" + if (type == FxType.NONE) "" else " ${percentText(fx.x ?: 0.5f)} ${percentText(fx.y ?: 0.5f)}"
        }
        fx.sends?.entries?.filter { it.key in 0..3 }?.sortedBy { it.key }?.takeIf { it.isNotEmpty() }?.let { sends ->
            out += "send " + sends.joinToString(" ") { "${'A' + it.key} ${percentText(it.value)}" }
        }
        fx.comp?.let { out += if (it.on) "comp ${percentText(it.x)} ${percentText(it.y)}" else "comp off" }
        fx.sidechain?.let { sc ->
            val dests = sc.dests and FxSettings.ALL_GROUPS
            out += if (sc.on && dests != 0) {
                "sidechain ${padText(sc.group.coerceIn(0, 3), sc.pad.coerceIn(0, 11))} " +
                    (0..3).filter { dests and (1 shl it) != 0 }.joinToString("") { "${'A' + it}" } +
                    " ${percentText(sc.x)} ${percentText(sc.y)}"
            } else {
                "sidechain off"
            }
        }
    }

    // A knob (0..1) as a card's whole percent.
    private fun percentOf(v: Float): Int = (clamp01(v) * 100f).roundToInt()

    private fun percentText(v: Float): String = percentOf(v).toString()

    // A pad line: the settings given, in the spec's order.
    private fun padLineText(group: Int, offset: Int, p: CardPad): String {
        val sb = StringBuilder("pad ${padText(group, offset)}")
        p.pitch?.let { sb.append(" pitch ").append(pitchText(it)) }
        p.level?.let { sb.append(" level $it") }
        p.pan?.let { sb.append(" pan $it") }
        p.attack?.let { sb.append(" attack $it") }
        p.release?.let { sb.append(" release $it") }
        p.mode?.let { sb.append(" mode ${it.id}") }
        return sb.toString()
    }

    /**
     * A synth line as a card writes it: `synth`, the pad and the type, then the settings the line gave, in the order of
     * [SYNTH_KEYS] ("synth B9 bass note C2 wave square decay 25 name acid"). The note is a name (C2, F#1) and the length
     * in seconds, as few decimals as needed (4, 0.5, 1.25).
     */
    fun synthText(group: Int, offset: Int, s: CardSynth): String {
        val sb = StringBuilder("synth ${padText(group, offset)} ${s.type.id}")
        fun put(key: String, value: Any?) {
            if (value != null) sb.append(' ').append(key).append(' ').append(value)
        }
        put("note", s.note?.let { PadNotes.noteName(it) })
        put("wave", s.wave?.id)
        put("chord", s.chord?.id)
        put("attack", s.attack)
        put("decay", s.decay)
        put("length", s.length?.let { lengthText(it) })
        put("tone", s.tone)
        put("reso", s.reso)
        put("sweep", s.sweep)
        put("bend", s.bend)
        put("click", s.click)
        put("noise", s.noise)
        put("snap", s.snap)
        put("drive", s.drive)
        put("detune", s.detune)
        put("level", s.level)
        put("seed", s.seed)
        put("name", s.name)
        return sb.toString()
    }

    // Hundredths of a second as seconds, as few decimals as needed: 400 is 4, 50 is 0.5, 5 is 0.05, 125 is 1.25.
    private fun lengthText(cs: Int): String =
        "${cs / 100}" + (if (cs % 100 == 0) "" else "." + (cs % 100).toString().padStart(2, '0').trimEnd('0'))

    // Semitones to two decimals, as few as needed: 7, -7.5, 0.25.
    private fun pitchText(v: Double): String {
        val h = Math.round(v.coerceIn(-PadSettings.PITCH_MAX, PadSettings.PITCH_MAX) * 100).toInt()
        val a = Math.abs(h)
        val frac = if (a % 100 == 0) "" else "." + (a % 100).toString().padStart(2, '0').trimEnd('0')
        return (if (h < 0) "-" else "") + (a / 100) + frac
    }

    private fun writeSection(out: MutableList<String>, s: CardSection, swing: Int, names: (PhysicalPad) -> String?, tidy: Boolean) {
        val p = s.pattern
        val g = s.group
        var notes = unique(p.notes.filter { it.tick in 0 until p.lengthTicks })
        val step = stepFor(p, notes, swing)
        if (tidy) notes = notes.map { tidied(it, step.ticks) }
        val per = Seq.TICKS_PER_BAR / step.ticks
        val count = p.bars * per
        val stepOf = rowSteps(notes, step, swing, count)
        out += "[${'A' + g}${s.number?.let { "%02d".format(Locale.ROOT, it) } ?: ""}] bars ${p.bars} step ${step.id}"
        for (offset in KEYPAD) {
            val sound = s.sounds[offset]?.takeIf { it.slot in SLOT_MIN..SLOT_MAX } ?: continue
            val name = sound.name?.let { cleanText(it, Int.MAX_VALUE) }.orEmpty()
            out += "sound ${padText(g, offset)} ${sound.slot}" + if (name.isEmpty()) "" else " $name"
        }
        for (offset in KEYPAD) s.synths[offset]?.let { out += synthText(g, offset, it) }
        for (offset in KEYPAD) {
            val pad = s.pads[offset]?.takeUnless { it.isEmpty } ?: continue
            out += padLineText(g, offset, pad)
        }
        val rows = KEYPAD.filter { offset -> notes.indices.any { stepOf[it] >= 0 && notes[it].offset == offset } }
        val nameOf = rows.associateWith { names(PhysicalPad(g, it))?.let { n -> cleanText(n, Int.MAX_VALUE) }.orEmpty() }
        val longest = nameOf.values.maxOfOrNull { it.length } ?: 0
        val width = if (longest > 0) maxOf(NAME_WIDTH, longest) else 0
        for (offset in rows) {
            val chars = CharArray(count) { '.' }
            for (i in notes.indices) {
                if (stepOf[i] < 0 || notes[i].offset != offset) continue
                val k = stepOf[i]
                chars[k] = charOf(notes[i].velocity)!!
                for (j in 1 until notes[i].gate / step.ticks) chars[k + j] = '-'
            }
            val label = padText(g, offset)
            val head = if (width > 0) "$label ${nameOf.getValue(offset).padEnd(width)}" else label
            val bars = chars.concatToString().chunked(per).joinToString(" | ") { it.chunked(4).joinToString(" ") }
            out += "$head | $bars |"
        }
        val rest = notes.indices.filter { stepOf[it] < 0 }.map { notes[it] }
            .sortedWith(compareBy<PatternNote>({ KEYPAD.indexOf(it.offset) }, { it.tick }, { it.semitones ?: Int.MIN_VALUE }))
        if (rest.isEmpty()) return
        out += "notes"
        for (n in rest) out += noteText(g, n)
    }

    // The notes with the same pad, tick and pitch folded into the louder (the first when level), as reading folds them.
    private fun unique(notes: List<PatternNote>): List<PatternNote> {
        val kept = ArrayList<PatternNote>()
        val at = HashMap<Triple<Int, Int, Int?>, Int>()
        for (n in notes) {
            val key = Triple(n.offset, n.tick, n.semitones)
            val j = at[key]
            if (j == null) {
                at[key] = kept.size
                kept += n
            } else if (n.velocity > kept[j].velocity) kept[j] = n
        }
        return kept
    }

    // The first of 1/16, 1/16T, 1/32 that puts every pad hit on its grid; 1/16 when none does.
    private fun stepFor(p: Pattern, notes: List<PatternNote>, swing: Int): Timing =
        WRITE_STEPS.firstOrNull { t ->
            val count = p.lengthTicks / t.ticks
            notes.all { it.semitones != null || gridStep(it.tick, t, swing, count) != null }
        } ?: Timing.SIXTEENTH

    // The step [tick] is on at [t], or null when it is between steps.
    private fun gridStep(tick: Int, t: Timing, swing: Int, count: Int): Int? {
        val k = Steps.indexOf(tick, t, swing, count)
        return k.takeIf { Steps.tickOf(it, t, swing) == tick }
    }

    // For each note, its step when it goes on a row (-1 when it goes in the notes list).
    private fun rowSteps(notes: List<PatternNote>, step: Timing, swing: Int, count: Int): IntArray {
        val stepOf = IntArray(notes.size) { -1 }
        for (offset in 0..11) {
            val onPad = notes.indices
                .filter { notes[it].semitones == null && notes[it].offset == offset }
                .mapNotNull { i -> gridStep(notes[i].tick, step, swing, count)?.let { i to it } }
                .sortedBy { it.second }
            // From the last hit back, so a hold is checked against the next hit that is on the row.
            var next = count
            for ((i, k) in onPad.asReversed()) {
                val n = notes[i]
                if (charOf(n.velocity) == null || n.gate < step.ticks || n.gate % step.ticks != 0) continue
                if (k + n.gate / step.ticks > next) continue
                stepOf[i] = k
                next = k
            }
        }
        return stepOf
    }

    private fun tidied(n: PatternNote, stepTicks: Int): PatternNote =
        n.copy(velocity = roundVelocity(n.velocity), gate = maxOf(n.gate, stepTicks))

    // The nearest of 127, 100 and 64; halfway goes up.
    private fun roundVelocity(v: Int): Int = if (v >= 114) 127 else if (v >= 82) 100 else 64

    // One line of the notes list.
    private fun noteText(group: Int, n: PatternNote): String {
        val sb = StringBuilder("${padText(group, n.offset)} at ${atText(n.tick)}")
        if (n.velocity != 127) sb.append(" vel ${n.velocity}")
        n.semitones?.let { sb.append(if (Keys.ROOT_NOTE + it in 0..127) " note ${PadNotes.noteName(Keys.ROOT_NOTE + it)}" else " semi $it") }
        if (n.gate != DEFAULT_GATE) sb.append(" gate ${GATES.entries.firstOrNull { it.value == n.gate }?.key ?: n.gate}")
        return sb.toString()
    }

    // Text for the header or a row: no #, | or line breaks (they would end it), single spaces, at most [max] characters.
    private fun cleanText(s: String, max: Int): String = cut(s.replace(TEXT_BREAKS, " ").trim(), max).trim()

    // 92 for 92.0, 92.5 for 92.5: whole or one decimal.
    private fun tempoText(t: Double): String {
        val r = Math.round(t * 10) / 10.0
        return if (r == Math.floor(r)) r.toLong().toString() else String.format(Locale.ROOT, "%.1f", r)
    }

    // ---- From patterns ----

    /**
     * A card for [sections] (an export): the sections with notes, in group
     * order (all of them when none has notes), and the swing [timingSwing]
     * when every pad hit of every section sits on the swung 1/16 grid, else
     * 50, so a card never loses a hit's place to a swing it doesn't fit.
     * [sounds] gives the sound a pad plays (null when not known): each
     * section gets a sound for every pad its notes use that has one. [fx] is
     * the project's FX, written as effect lines unless they leave the sound
     * as it is ([fxOf]); [pads] gives a pad's settings (null when not known):
     * each section gets a `pad` line for every pad its notes use whose
     * settings differ from the defaults ([padOf]).
     */
    fun fromPatterns(
        name: String?,
        tempo: Double?,
        timingSwing: Int,
        sections: List<CardSection>,
        sounds: (PhysicalPad) -> CardSound? = { null },
        fx: FxSettings? = null,
        pads: (PhysicalPad) -> PadSettings? = { null },
    ): BeatCard {
        val kept = sections.filter { !it.pattern.isEmpty }.ifEmpty { sections }.sortedBy { it.group }
            .map { s -> s.copy(sounds = s.sounds + soundsUsed(s, sounds), pads = s.pads + padsUsed(s, pads)) }
        val s = TimingSettings.clampSwing(timingSwing)
        val swing = if (s > TimingSettings.SWING_MIN && kept.all { fitsSwung(it.pattern, s) }) s else TimingSettings.SWING_MIN
        return BeatCard(name, tempo, swing, kept, fx?.let(::fxOf))
    }

    /**
     * A card for a project's chain (a share of the arrangement): the chain's
     * distinct scenes in the order they first play become the card's scenes
     * (with `scene` lines, no names), and the chain, mapped to the card's
     * scene numbers, its `chain` line. Null when [chain] has no step that
     * names a scene of [seq].
     *
     * Each scene's sections come from the patterns [seq] gives it, as
     * [fromPatterns] has them. The first scene has the groups with notes (all
     * four when none has); a later scene has a group only when its pattern
     * differs from the one the group last had in the card's earlier scenes
     * (one it left out counts as blank), so a card never repeats a pattern
     * ([write] leaves such a section out in any case). The swing is
     * [timingSwing] when every pad hit of every section sits on the swung
     * 1/16 grid, else 50. [sounds], [fx] and [pads] are as in [fromPatterns]
     * for the whole card: a pad's sound line and `pad` line are written once,
     * in the first section whose notes use the pad, and again only when they
     * change.
     */
    fun fromScenes(
        name: String?,
        tempo: Double?,
        timingSwing: Int,
        seq: ProjectSeq,
        chain: List<ChainStep> = seq.chain.steps,
        sounds: (PhysicalPad) -> CardSound? = { null },
        fx: FxSettings? = null,
        pads: (PhysicalPad) -> PadSettings? = { null },
    ): BeatCard? {
        val steps = chain.filter { it.scene in seq.scenes.indices }.take(Chain.MAX_STEPS)
        if (steps.isEmpty()) return null
        val order = steps.map { it.scene }.distinct()
        val given = HashMap<PhysicalPad, CardSound>()
        val shaped = HashMap<PhysicalPad, CardPad>()
        // The pattern each group last had in the card; null before it has a section.
        val last = arrayOfNulls<Pattern>(4)
        val scenes = order.mapIndexed { k, index ->
            val numbers = seq.scenes[index].patterns
            val all = List(4) { g -> CardSection(g, numbers[g], seq.pattern(g, numbers[g])) }
            val chosen = if (k == 0) all.filter { !it.pattern.isEmpty }.ifEmpty { all } else all.filter { s -> last[s.group]?.let { !samePattern(it, s.pattern) } ?: !s.pattern.isEmpty }
            CardScene(null, chosen.map { s ->
                last[s.group] = s.pattern
                val own = soundsUsed(s, sounds).filter { (offset, snd) -> given.put(PhysicalPad(s.group, offset), snd) != snd }
                val shaping = padsUsed(s, pads).filter { (offset, pad) -> shaped.put(PhysicalPad(s.group, offset), pad) != pad }
                s.copy(sounds = own, pads = shaping)
            })
        }
        val s = TimingSettings.clampSwing(timingSwing)
        val swing = if (s > TimingSettings.SWING_MIN && scenes.all { sc -> sc.sections.all { fitsSwung(it.pattern, s) } }) s else TimingSettings.SWING_MIN
        val mapped = steps.map { order.indexOf(it.scene) + 1 to it.passes.coerceIn(Chain.MIN_PASSES, Chain.MAX_PASSES) }
        return BeatCard(name, tempo, swing, scenes, fx?.let(::fxOf), mapped, sceneLines = true)
    }

    // The sound of each pad the section's notes use, for those [sounds] knows.
    private fun soundsUsed(s: CardSection, sounds: (PhysicalPad) -> CardSound?): Map<Int, CardSound> {
        val out = LinkedHashMap<Int, CardSound>()
        for (offset in KEYPAD) {
            if (s.pattern.notes.none { it.offset == offset }) continue
            sounds(PhysicalPad(s.group, offset))?.let { out[offset] = it }
        }
        return out
    }

    // The shaping of each pad the section's notes use that has any, for those [pads] knows.
    private fun padsUsed(s: CardSection, pads: (PhysicalPad) -> PadSettings?): Map<Int, CardPad> {
        val out = LinkedHashMap<Int, CardPad>()
        for (offset in KEYPAD) {
            if (s.pattern.notes.none { it.offset == offset }) continue
            pads(PhysicalPad(s.group, offset))?.let(::padOf)?.let { out[offset] = it }
        }
        return out
    }

    /**
     * The effect lines for a project's [fx], as a share writes them, with the
     * knobs in whole percents (so the card reads back as this one): the
     * effect and its knobs, the groups sending above 0, the compressor and
     * the sidechain when they are on. Null when none of that makes a sound
     * (no effect, no send, compressor and sidechain off).
     */
    fun fxOf(fx: FxSettings): CardFx? {
        val c = fx.clamped()
        val sends = c.sends.withIndex().filter { percentOf(it.value) > 0 }.associate { it.index to knob(it.value) }
        val comp = c.comp.takeIf { it.on }?.let { Comp(true, knob(it.x), knob(it.y)) }
        val sc = c.sidechain.takeIf { it.on && it.dests != 0 }?.copy(x = knob(c.sidechain.x), y = knob(c.sidechain.y))
        if (c.type == FxType.NONE && sends.isEmpty() && comp == null && sc == null) return null
        val none = c.type == FxType.NONE
        return CardFx(c.type, if (none) 0.5f else knob(c.x), if (none) 0.5f else knob(c.y), sends.ifEmpty { null }, comp, sc)
    }

    // A knob at its whole percent, as a card holds it.
    private fun knob(v: Float): Float = (percentOf(v) / 100.0).toFloat()

    /**
     * A pad's [settings] as a `pad` line holds them: only what differs from the
     * defaults (pitch not 0, level not 100, pan not 0, attack not 0, mode not
     * oneshot, and release when it isn't what the mode starts with: 255 for
     * oneshot, [PadSettings.KEY_RELEASE] for the others). Null when none does.
     * Only the fields the card format carries.
     */
    fun padOf(settings: PadSettings): CardPad? {
        val c = settings.clamped(null)
        val d = PadSettings.DEFAULT
        val release = if (c.mode == PlayMode.ONESHOT) PadSettings.ENV_MAX else PadSettings.KEY_RELEASE
        val pad = CardPad(
            pitch = c.pitch.takeIf { it != d.pitch }?.plus(0.0),
            level = c.level.takeIf { it != d.level },
            pan = c.pan.takeIf { it != d.pan },
            attack = c.attack.takeIf { it != d.attack },
            release = c.release.takeIf { it != release },
            mode = c.mode.takeIf { it != d.mode },
        )
        return pad.takeUnless { it.isEmpty }
    }

    // ---- Applying ----

    /**
     * [current] with the card's effect lines on it, each kind apart: the `fx`
     * line sets the effect (and its knobs, unless it is none, which leaves
     * them where they are); the `send` lines set the groups they name and
     * every other group to 0; `comp` sets the compressor (off keeps its
     * knobs); `sidechain` sets the sidechain (off keeps its source and
     * groups). A kind the card has no line for stays as it is. Every value is
     * held in range.
     */
    fun applyFx(current: FxSettings, fx: CardFx): FxSettings {
        var out = current
        fx.type?.let { out = out.withType(it) }
        if (fx.type != FxType.NONE && (fx.x != null || fx.y != null)) out = out.withXY(fx.x ?: out.x, fx.y ?: out.y)
        fx.sends?.let { sends -> for (g in 0 until FxSettings.GROUPS) out = out.withSend(g, sends[g] ?: 0f) }
        fx.comp?.let { out = out.withComp(if (it.on) it else out.comp.copy(on = false)) }
        fx.sidechain?.let { out = out.withSidechain(if (it.on) it else out.sidechain.copy(on = false)) }
        return out.clamped()
    }

    /**
     * [current] with the card's `pad` line on it, the settings it gives and
     * no others. The mode goes first, as the pad sheet's MODE knob does
     * ([PadSettings.withMode]: leaving oneshot sets the release to the key
     * default), so a release the line gives is the one that stays. Every
     * value is clamped as the sheet does.
     */
    fun applyPad(current: PadSettings, pad: CardPad): PadSettings {
        var out = current
        pad.mode?.let { out = out.withMode(it) }
        pad.pitch?.let { out = out.copy(pitch = it) }
        pad.level?.let { out = out.copy(level = it) }
        pad.pan?.let { out = out.copy(pan = it) }
        pad.attack?.let { out = out.copy(attack = it) }
        pad.release?.let { out = out.copy(release = it) }
        return out.clamped(null)
    }

    private fun fitsSwung(p: Pattern, swing: Int): Boolean {
        val count = p.lengthTicks / Timing.SIXTEENTH.ticks
        return p.notes.all { it.semitones != null || it.tick >= p.lengthTicks || gridStep(it.tick, Timing.SIXTEENTH, swing, count) != null }
    }

    // ---- Sounds ----

    /**
     * A sound to suggest for a silent [pad] of [card] (an addition): one of [names] (slot to name, the sounds Arc knows) by
     * the pad's row name in the card ([label], "shaker"). First a sound whose name has one of the label's words ("shaker"),
     * then one whose name is of the label's kind (a hat for "closed hat", a bass for "sub"), then the first sound in the
     * factory block of that kind (kicks 1-99 ... melodic 500-599; with the EP-40 kit, chords 600-699). A pad the card plays
     * only in KEYS, with no telling name, takes a melodic sound, or a bass when its notes sit below C3. The EP-40's loops
     * ("jammy bass a 85") are never suggested, nor a slot in [taken] (picked for another pad). Null when nothing fits.
     */
    fun suggestSound(
        card: BeatCard,
        pad: PhysicalPad,
        label: String?,
        names: Map<Int, String>,
        taken: Set<Int> = emptySet(),
        kit: FactoryKit = FactoryKit.EP133,
    ): Int? {
        val low = label.orEmpty().lowercase(Locale.ROOT)
        val keys = card.allSections.filter { it.group == pad.group }.flatMap { s -> s.pattern.notes.filter { it.offset == pad.offset } }
        val kind = SOUND_KINDS.firstOrNull { it.label.containsMatchIn(low) }
            ?: if (keys.isNotEmpty() && keys.all { it.semitones != null }) SOUND_KINDS.first { it.name == if (keys.map { it.semitones!! }.average() < -12) "bass" else "melodic" } else null
        val open = names.filter { (slot, name) -> slot in SLOT_MIN..SLOT_MAX && slot !in taken && !LOOP_NAME.containsMatchIn(name) }.toSortedMap()
        val block = kind?.let { if (it.name == "chord" && kit == FactoryKit.EP40) 600..699 else it.block }
        fun first(ok: (Int, String) -> Boolean): Int? {
            val all = open.filter { (slot, name) -> ok(slot, name.lowercase(Locale.ROOT)) }.keys
            return all.firstOrNull { block == null || it in block } ?: all.firstOrNull()
        }
        val words = WORD.findAll(low).map { it.value }.filter { it.length >= 3 && it !in STOP_WORDS }.toList()
        if (words.isNotEmpty()) first { _, name -> words.any { w -> Regex("\\b${Regex.escape(w)}").containsMatchIn(name) } }?.let { return it }
        if (kind == null) return null
        return first { _, name -> kind.sound.containsMatchIn(name) } ?: open.keys.firstOrNull { it in block!! }
    }

    // A kind of sound: what a row's name says ([label]), what a sound's name says ([sound]) and its factory [block].
    private class SoundKind(val name: String, val label: Regex, val sound: Regex, val block: IntRange)

    // In the order they are tried: "open hat" before "hat", "bass drum" (a kick) before "bass".
    private val SOUND_KINDS = listOf(
        SoundKind("kick", Regex("\\b(kick|kik|bd|bass ?drum)\\b"), Regex("\\b(kick|kik|bd)"), 1..99),
        SoundKind("snare", Regex("\\b(snare|sd|rim ?shot)\\b"), Regex("\\b(snare|sn|sd)\\b"), 100..199),
        SoundKind("clap", Regex("\\b(clap|snap)\\b"), Regex("\\b(clap|snap)"), 100..199),
        SoundKind("rim", Regex("\\b(rim|stick|clave)\\b"), Regex("\\b(rim|stick|clave)"), 100..199),
        SoundKind("open hat", Regex("\\b(open ?(hat|hh|hi.?hat)|oh)\\b"), Regex("\\b(oh|open)\\b"), 200..299),
        SoundKind("hat", Regex("\\b(hi.?hats?|hh|hats?|ch)\\b"), Regex("\\b(hh|hats?|hihat|ch)\\b"), 200..299),
        SoundKind("cymbal", Regex("\\b(crash|ride|cymbal|splash)\\b"), Regex("\\b(crash|ride|cym)"), 200..299),
        SoundKind("tom", Regex("\\btoms?\\b"), Regex("\\btom"), 300..399),
        SoundKind("perc", Regex("\\b(shaker|shak\\w*|tamb\\w*|conga|bongo|cowbell|cow|perc\\w*|triangle)\\b"), Regex("\\b(shak|tamb|perc|conga|bongo|cow|tri)"), 300..399),
        SoundKind("bass", Regex("\\b(bass|sub|808|reese)\\b"), Regex("\\b(bass|sub|808|synbaz|baz)"), 400..499),
        SoundKind("chord", Regex("\\b(chords?|stabs?)\\b"), Regex("\\b(chrd|chord|stab|skank)"), 500..599),
        SoundKind("melodic", Regex("\\b(lead|keys?|piano|pads?|pluck|synth|organ|mel\\w*|bell|strings?|arp)\\b"), Regex("\\b(lead|piano|pad|pluc?k|pluk|synth|organ|keys|bell|string|mel)"), 500..599),
    )

    // Words of a row's name too general to look for in a sound's name.
    private val STOP_WORDS = setOf("closed", "open", "loop", "sound", "the", "and", "new", "drum", "hit", "low", "high", "main")
    private val WORD = Regex("[a-z0-9]+")
    // An EP-40 loop's name ("jammy bass a 85"): tempo-locked, never a one-shot to suggest.
    private val LOOP_NAME = Regex("\\b(drms|fill|bass|mel|melo)\\s+[a-d]\\s+[0-9]{2,3}\\s*$", RegexOption.IGNORE_CASE)

    /**
     * The pads [card]'s notes use (pad hits and KEYS notes alike; a note past its pattern's end doesn't play) that would
     * be silent: [slotOf] gives no sound for them now (null) and no sound or synth line of the card (in any scene) puts one on them.
     * In keypad order for each group, scene by scene. Empty when the pads are not [known] (nothing read yet): then a pad with no slot is not
     * known to be empty.
     */
    fun silentPads(card: BeatCard, slotOf: (PhysicalPad) -> Int?, known: Boolean): List<PhysicalPad> {
        if (!known) return emptyList()
        val out = ArrayList<PhysicalPad>()
        // A sound or synth line in any scene puts a sound on its pad: the sounds are the project's.
        val given = card.allSections.flatMap { s ->
            (s.sounds.filterValues { it.slot in SLOT_MIN..SLOT_MAX }.keys + s.synths.keys).map { PhysicalPad(s.group, it) }
        }.toSet()
        for (scene in card.scenes) {
            for (s in scene.sections.sortedBy { it.group }) {
                val used = usedOffsets(s)
                for (offset in KEYPAD) {
                    val pad = PhysicalPad(s.group, offset)
                    if (offset !in used || pad in given) continue
                    if (slotOf(pad) == null && pad !in out) out += pad
                }
            }
        }
        return out
    }

    /** How many notes of [s] play on each pad (pad offset to count; a note past the pattern's end doesn't play). */
    fun notesByPad(s: CardSection): Map<Int, Int> =
        s.pattern.notes.filter { it.tick in 0 until s.pattern.lengthTicks }.groupingBy { it.offset }.eachCount()

    // The offsets of the pads [s]'s notes play on.
    private fun usedOffsets(s: CardSection): Set<Int> = notesByPad(s).keys

    /**
     * The names to show and match for the device's sounds ([device], slot to
     * name): a slot the device lists unnamed ([FactorySounds.unnamed], "200.pcm")
     * takes the name the [factory] pack has for that slot when it has one
     * (not blank, and not unnamed itself); every other slot is as the device
     * has it.
     */
    fun soundNames(device: Map<Int, String>, factory: Map<Int, String>?): Map<Int, String> {
        if (factory == null) return device
        return device.mapValues { (slot, name) ->
            val named = factory[slot]
            if (named != null && FactorySounds.unnamed(slot, name) && named.isNotBlank() && !FactorySounds.unnamed(slot, named)) named else name
        }
    }

    /**
     * The card's sound lines matched to the user's sounds, in the card's
     * order (sections as given, pads in keypad order). [available] is slot to
     * name ([soundNames]), [current] the slot a pad plays now (null when not
     * known). A line with a name is matched like this: the slot is used when
     * it holds a sound of that name ([PadSoundCache.sameName]: ignoring case,
     * spaces and ".wav"); otherwise the sound is looked up by name and the
     * slot that holds it is used (the pad's own slot first, then the lowest);
     * failing that, a slot that is there but unnamed ("200.pcm", a factory
     * sound whose name can't be checked) is used all the same, as a pick
     * that is [SoundPick.unverified]; else the line is [SoundStatus.MISSING].
     * A line without a name uses its slot when [available] has it. A pick
     * whose slot is already on the pad is [SoundStatus.SAME], found by name
     * or not. The sounds are the project's, not a scene's: the lines of all
     * the card's scenes are matched, and a pad given a line in more than one
     * scene takes the last (one pick, in the place of its first). A line that is [foreign] (another kit's sound, by its
     * slot and name) is never used by an unnamed slot: that slot holds another sound.
     */
    fun resolveSounds(
        card: BeatCard,
        available: Map<Int, String>,
        foreign: (CardSound) -> Boolean = { false },
        current: (PhysicalPad) -> Int?,
    ): List<SoundPick> {
        val picks = LinkedHashMap<PhysicalPad, SoundPick>()
        for (s in card.allSections) {
            for (offset in KEYPAD) {
                val wanted = s.sounds[offset] ?: continue
                val pad = PhysicalPad(s.group, offset)
                val now = current(pad)
                // The device's own file name for the slot ("200.pcm") says nothing about the sound: it counts as no name.
                val name = wanted.name?.takeIf { it.isNotBlank() && !FactorySounds.unnamed(wanted.slot, it) }
                val direct = wanted.slot.takeIf { it in available && (name == null || holds(available[it], name)) }
                val byName = if (direct == null && name != null) lookUp(available, name, now) else null
                val slot = direct ?: byName ?: wanted.slot.takeIf { unnamedIn(available, it) && !foreign(wanted) }
                val unverified = slot != null && unnamedIn(available, slot)
                picks[pad] = when {
                    slot == null -> SoundPick(pad, wanted, null, null, now, SoundStatus.MISSING)
                    slot == now -> SoundPick(pad, wanted, slot, available[slot], now, SoundStatus.SAME, unverified)
                    else -> SoundPick(pad, wanted, slot, available[slot], now, if (byName != null) SoundStatus.FOUND_BY_NAME else SoundStatus.CHANGE, unverified)
                }
            }
        }
        return picks.values.toList()
    }

    /**
     * The card's synth lines by pad, in the card's order (sections as given, pads in keypad order). The sounds are the
     * project's: a pad given a synth line in more than one scene takes the last, in the place of its first.
     */
    fun synthsByPad(card: BeatCard): Map<PhysicalPad, CardSynth> {
        val out = LinkedHashMap<PhysicalPad, CardSynth>()
        for (s in card.allSections) {
            for (offset in KEYPAD) s.synths[offset]?.let { out[PhysicalPad(s.group, offset)] = it }
        }
        return out
    }

    /** The slot of [available] (slot to name) that holds a sound called [name], as [resolveSounds] looks one up: the pad's own ([now]) when it does, else the lowest; null when none. */
    fun slotNamed(available: Map<Int, String>, name: String, now: Int?): Int? = lookUp(available, name, now)

    // Whether [slot] is in [available] under the name the EP-133 gives a sound nobody named ("200.pcm").
    private fun unnamedIn(available: Map<Int, String>, slot: Int): Boolean = available[slot]?.let { FactorySounds.unnamed(slot, it) } == true

    // The slot holding a sound called [name]: the pad's own ([now]) when it does, else the lowest; null when none.
    private fun lookUp(available: Map<Int, String>, name: String, now: Int?): Int? {
        val same = available.filter { holds(it.value, name) }.keys
        return if (now != null && now in same) now else same.minOrNull()
    }

    // Whether a sound named [have] is the one called [name] (the card's name is cleaned, so the list's is too).
    private fun holds(have: String?, name: String): Boolean = have != null && PadSoundCache.sameName(cleanText(have, Int.MAX_VALUE), name)

    /**
     * The sound list Arc adds after a shared card: [ClaudeText.soundListHeader]
     * for [source] (the EP-133, the last read or the factory pack, as
     * [ClaudeText] words them), then one line "slot name" for each sound of
     * [available] from slot 1 to 999, in slot order. Names are cleaned as the
     * card's are, so a name read from the list reads back the same. When any
     * listed name is unnamed ("200.pcm"), [ClaudeText.UNNAMED_SOUNDS_NOTE]
     * follows the header. The text ends in a newline.
     */
    fun soundList(source: String, available: Map<Int, String>): String {
        val out = ArrayList<String>()
        out += ClaudeText.soundListHeader(source)
        val lines = available.keys.filter { it in SLOT_MIN..SLOT_MAX }.sorted().map { slot -> slot to cleanText(available.getValue(slot), Int.MAX_VALUE) }
        if (lines.any { (slot, name) -> FactorySounds.unnamed(slot, name) }) out += ClaudeText.UNNAMED_SOUNDS_NOTE
        for ((slot, name) in lines) out += if (name.isEmpty()) "$slot" else "$slot $name"
        return out.joinToString("\n", postfix = "\n")
    }

    // ---- Import ----

    /**
     * [card] planned into [seq]: each section's pattern goes into its
     * group's next free pattern ([SceneOps.nextFree]), and nothing is
     * overwritten. A card of more than one section also adds a new scene
     * ([SceneOps.newScene], selected) that plays the new patterns, the
     * groups the card doesn't have keeping the numbers of the scene
     * playing; there is none when the project already has 99 scenes
     * ([CardImport.newScene] false, the patterns still placed). A card of
     * one section leaves the scene alone: the caller picks the pattern from
     * [CardImport.placed]. When a group has no free pattern (all 99 hold
     * notes), nothing is placed: the result has [seq] as it was, no
     * [CardImport.placed] and that group in [CardImport.fullGroup].
     *
     * A card of scenes ([BeatCard.multiScene], from `scene` lines) is planned
     * by [planScenes] instead, which also takes [setChain].
     */
    fun plan(seq: ProjectSeq, card: BeatCard, setChain: Boolean = true, replace: Boolean = false): CardImport {
        if (card.multiScene) return planScenes(seq, card, setChain, replace)
        var out = seq
        val placed = ArrayList<Pair<Int, Int>>()
        for (s in card.sections) {
            if (s.group !in 0..3) continue
            val n = SceneOps.nextFree(out, s.group)
            if (!out.pattern(s.group, n).isEmpty) return CardImport(seq, emptyList(), false, s.group)
            val p = s.pattern
            out = out.withPattern(s.group, n, Pattern(p.bars, p.notes.take(Seq.MAX_NOTES).map { it.copy(id = 0) }))
            placed += s.group to n
        }
        if (placed.size < 2) return CardImport(out, placed, false)
        val numbers = List(4) { g -> placed.lastOrNull { it.first == g }?.second ?: seq.selected(g) }
        // Replacing, the new scene is the project's only one, and a chain of the old scenes goes with them.
        if (replace) return CardImport(out.withScenes(listOf(Scene(numbers)), 0, Chain()), placed, true, scenes = listOf(0))
        val withScene = SceneOps.newScene(out)
        if (withScene.scenes.size == out.scenes.size) return CardImport(out, placed, false)
        val scenes = withScene.scenes.dropLast(1) + Scene(numbers)
        return CardImport(withScene.withScenes(scenes, withScene.scene), placed, true, scenes = listOf(withScene.scenes.lastIndex))
    }

    /**
     * A card of scenes planned into [seq]: one new scene for each card scene,
     * appended after the project's scenes, in the card's order. Each section's
     * pattern goes into its group's next free pattern (after the ones the
     * card has placed already, so no two sections share one, and nothing is
     * overwritten); a group a scene leaves out takes the pattern number of the
     * scene before it (the first scene: the numbers of the scene playing). The
     * first new scene is selected. [CardImport.placed] lists the sections in
     * the card's order, [CardImport.scenes] the new scenes' indices.
     *
     * [CardImport.chain] is the card's chain mapped to the new scenes (null
     * when the card has none). With [setChain] on (the default) and a chain,
     * [CardImport.seq] has it as the project's chain, replacing the one there
     * and turned on; with it off the project's chain is left alone.
     *
     * With [replace] the new scenes take the place of the project's: the card's
     * scenes become S01 on, the first selected, and the project's chain is
     * cleared unless the card's is set (its steps then name the new scenes
     * from 0). The project's patterns are kept in the banks; only the scenes
     * that named them go. [plan] does the same for a card of several groups
     * and no scenes: its one new scene is the project's only one.
     *
     * Limits, as for the card without scenes: when a group has no free
     * pattern for a section, nothing is placed ([CardImport.fullGroup], [seq]
     * as it was). When the new scenes don't all fit in 99, none is added
     * ([CardImport.newScene] false, no scenes, no chain), and the patterns are
     * still placed.
     */
    fun planScenes(seq: ProjectSeq, card: BeatCard, setChain: Boolean = true, replace: Boolean = false): CardImport {
        var out = seq
        val placed = ArrayList<Pair<Int, Int>>()
        val taken = HashSet<Pair<Int, Int>>()
        var numbers = List(4) { g -> seq.selected(g) }
        val made = ArrayList<Scene>()
        for (sc in card.scenes) {
            val now = numbers.toMutableList()
            for (s in sc.sections) {
                if (s.group !in 0..3) continue
                val n = freePattern(out, s.group, taken) ?: return CardImport(seq, emptyList(), false, s.group)
                val p = s.pattern
                out = out.withPattern(s.group, n, Pattern(p.bars, p.notes.take(Seq.MAX_NOTES).map { it.copy(id = 0) }))
                taken += s.group to n
                placed += s.group to n
                now[s.group] = n
            }
            numbers = now
            made += Scene(now)
        }
        if (!replace && seq.scenes.size + made.size > Seq.MAX_SCENES) return CardImport(out, placed, false)
        // Replacing, the card's scenes are the project's from S01 (its patterns stay in the banks), else they follow its scenes.
        val first = if (replace) 0 else seq.scenes.size
        val indices = made.indices.map { first + it }
        val steps = card.chain?.filter { it.first in 1..card.scenes.size }?.take(Chain.MAX_STEPS)
            ?.map { (scene, passes) -> ChainStep(first + scene - 1, passes.coerceIn(Chain.MIN_PASSES, Chain.MAX_PASSES)) }?.ifEmpty { null }
        // A chain of the old scenes would name the new ones: replacing, it goes unless the card's takes its place.
        val chain = if (setChain && steps != null) Chain(steps, true) else if (replace) Chain() else seq.chain
        return CardImport(out.withScenes(if (replace) made else seq.scenes + made, first, chain), placed, true, scenes = indices, chain = steps)
    }

    // The first pattern of [group] after the one selected that has no notes and isn't in [taken], round 1..99; null when there is none.
    private fun freePattern(seq: ProjectSeq, group: Int, taken: Set<Pair<Int, Int>>): Int? {
        val from = seq.selected(group)
        for (i in 1 until Seq.MAX_PATTERNS) {
            val n = (from - 1 + i) % Seq.MAX_PATTERNS + 1
            if (seq.pattern(group, n).isEmpty && (group to n) !in taken) return n
        }
        return null
    }
}
