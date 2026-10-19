package dev.arc.ep133.text

import dev.arc.ep133.features.ClaudePrompt
import dev.arc.ep133.features.FactoryKit
import dev.arc.ep133.features.Feel
import dev.arc.ep133.features.Genre
import dev.arc.ep133.features.GenreFamily
import dev.arc.ep133.features.Genres
import dev.arc.ep133.features.PlayLevel
import dev.arc.ep133.features.PlayWay
import dev.arc.ep133.features.PromptGoal
import dev.arc.ep133.features.PromptPart
import dev.arc.ep133.features.PromptSlot
import dev.arc.ep133.features.PromptTask
import dev.arc.ep133.features.SavedPrompt
import dev.arc.ep133.features.SharePick

/** A piece of the prompt's sentence on the glass: plain words, or the words of a [slot] that a tap changes. */
data class PromptPiece(val text: String, val slot: PromptSlot? = null)

/**
 * The Claude page's prompt builder (an addition): the glass's sentence ([sentence]), the answers under it, and the
 * prompt it builds ([prompt]) for the arc-beats skill. An IMPROVE as it starts asks what the plain share always has
 * ([ClaudeText.SHARE_PROMPT], [ClaudeText.SHARE_CHAIN_PROMPT]); the kit goes after the prompt as [ClaudeText.kitLine].
 */
object PromptText {
    /** The glass's tabs, and for screen readers. */
    fun task(t: PromptTask) = when (t) {
        PromptTask.BEAT -> "New beat"
        PromptTask.IMPROVE -> "Improve"
        PromptTask.TRACK -> "Track"
        PromptTask.PLAY -> "Play"
        PromptTask.LEARN -> "Learn"
    }

    /** The glass's tab: as [task], but NEW BEAT is NEW, so five fit. */
    fun tab(t: PromptTask) = if (t == PromptTask.BEAT) "New" else task(t)

    /** A slot's name: over its answers, and for screen readers. */
    fun slot(s: PromptSlot) = when (s) {
        PromptSlot.BARS -> "Length"
        PromptSlot.FEEL -> "Feel"
        PromptSlot.GENRE -> "Genre"
        PromptSlot.TEMPO -> "Tempo"
        PromptSlot.KIT -> "Kit"
        PromptSlot.PARTS -> "Parts"
        PromptSlot.GOAL -> "Ask"
        PromptSlot.EDITS -> "Edits"
        PromptSlot.LENGTH -> "Length"
        PromptSlot.START -> "Start"
        PromptSlot.LESSON -> "Lesson"
        PromptSlot.WAY -> "How"
        PromptSlot.LEVEL -> "Level"
        PromptSlot.SPEED -> "Start at"
    }

    fun family(f: GenreFamily) = when (f) {
        GenreFamily.HOUSE -> "House"
        GenreFamily.BASS -> "Bass"
        GenreFamily.CHILL -> "Chill"
        GenreFamily.CLUB -> "Club"
        GenreFamily.TECHNO -> "Techno"
        GenreFamily.HIP_HOP -> "Hip-hop"
        GenreFamily.BREAKS -> "Breaks"
        GenreFamily.RIDDIM -> "Riddim"
    }

    // ---------- The sentence's words ----------
    fun feel(f: Feel) = when (f) {
        Feel.DREAMY -> "dreamy"
        Feel.DARK -> "dark"
        Feel.UPLIFTING -> "uplifting"
        Feel.LAID_BACK -> "laid-back"
        Feel.DRIVING -> "driving"
        Feel.AGGRESSIVE -> "aggressive"
        Feel.DUSTY -> "dusty"
        Feel.GRITTY -> "gritty"
        Feel.SPACIOUS -> "spacious"
        Feel.MINIMAL -> "minimal"
        Feel.BOUNCY -> "bouncy"
        Feel.HYPNOTIC -> "hypnotic"
    }

    /** What a feel word does to the recipe, in a line under the answers (the skill's genres.md has it all). */
    fun feelHint(f: Feel) = when (f) {
        Feel.DREAMY -> "Dreamy: long chords, softer hits, an echo on the chords."
        Feel.DARK -> "Dark: minor or Phrygian, a low bass, a sparse top."
        Feel.UPLIFTING -> "Uplifting: major chords, a rising lead, open hats."
        Feel.LAID_BACK -> "Laid-back: slower, more swing, the snare a little late."
        Feel.DRIVING -> "Driving: faster, straight hats, the bass pumping with the kick."
        Feel.AGGRESSIVE -> "Aggressive: accents, rolls, distortion and compression."
        Feel.DUSTY -> "Dusty: swing, uneven hits, a low-pass on everything."
        Feel.GRITTY -> "Gritty: hard accents, crushed sounds, distorted drums."
        Feel.SPACIOUS -> "Spacious: few hits, long notes, a dotted delay."
        Feel.MINIMAL -> "Minimal: three or four pads, small changes."
        Feel.BOUNCY -> "Bouncy: a syncopated kick, swing, an octave-jumping bass."
        Feel.HYPNOTIC -> "Hypnotic: a repeating one-bar motif, three against four."
    }

    const val PLAIN = "plain"
    const val HINT_FEEL = "Up to two words. Each changes the recipe: tempo in its range, swing, how busy, the chords, the FX."
    fun feels(list: List<Feel>) = if (list.isEmpty()) PLAIN else list.joinToString(", ") { feel(it) }

    fun bars(n: Int) = "$n-bar"
    fun barsKey(n: Int) = Format.plural(n, "bar")
    const val ANY_STYLE = "any style"
    const val OWN_STYLE = "in its own style"
    fun toward(g: Genre) = "toward ${g.words}"
    fun tempo(bpm: Int) = "$bpm BPM"
    const val ANY_TEMPO = "any tempo"
    fun kit(k: FactoryKit) = k.model

    fun part(p: PromptPart) = when (p) {
        PromptPart.BASS -> "bass"
        PromptPart.CHORDS -> "chords"
        PromptPart.LEAD -> "lead"
        PromptPart.FILL -> "fill"
        PromptPart.FX -> "FX"
    }

    const val DRUMS_ONLY = "drums only"
    fun parts(set: Set<PromptPart>) = if (set.isEmpty()) DRUMS_ONLY else PromptPart.entries.filter { it in set }.joinToString(" · ") { part(it) }

    fun goal(g: PromptGoal) = when (g) {
        PromptGoal.BETTER -> "make it better"
        PromptGoal.DRIVE -> "give it more drive"
        PromptGoal.LAID_BACK -> "make it laid-back"
        PromptGoal.BUSIER -> "make it busier"
        PromptGoal.SPARSER -> "strip it back"
        PromptGoal.SWING -> "give it more swing"
        PromptGoal.FILL -> "add a fill"
        PromptGoal.BASS -> "add a bassline"
        PromptGoal.MELODY -> "add chords or a melody"
    }

    /** The goal's key: its words without the verb. */
    fun goalKey(g: PromptGoal) = when (g) {
        PromptGoal.BETTER -> "Better"
        PromptGoal.DRIVE -> "More drive"
        PromptGoal.LAID_BACK -> "Laid-back"
        PromptGoal.BUSIER -> "Busier"
        PromptGoal.SPARSER -> "Sparser"
        PromptGoal.SWING -> "More swing"
        PromptGoal.FILL -> "A fill"
        PromptGoal.BASS -> "A bassline"
        PromptGoal.MELODY -> "Chords, melody"
    }

    fun edits(n: Int) = when (n) {
        1 -> "one edit"
        3 -> "2-3 edits"
        else -> "4-5 edits"
    }

    fun way(w: PlayWay) = when (w) {
        PlayWay.FINGERS -> "by finger drumming"
        PlayWay.STEPS -> "by step entry"
        PlayWay.PERFORM -> "as a live set"
        PlayWay.KEYS -> "its KEYS parts"
    }

    /** The way's key, and the line under it. */
    fun wayKey(w: PlayWay) = when (w) {
        PlayWay.FINGERS -> "Fingers"
        PlayWay.STEPS -> "Steps"
        PlayWay.PERFORM -> "Perform"
        PlayWay.KEYS -> "Keys"
    }

    fun waySub(w: PlayWay) = when (w) {
        PlayWay.FINGERS -> "live, part by part"
        PlayWay.STEPS -> "on the sequencer"
        PlayWay.PERFORM -> "scenes, FX, punch-ins"
        PlayWay.KEYS -> "bass and melody"
    }

    fun level(l: PlayLevel) = when (l) {
        PlayLevel.NEW -> "a beginner"
        PlayLevel.SOME -> "an improver"
        PlayLevel.SURE -> "a sure hand"
    }

    /** The level's key: its words without the article. */
    fun levelKey(l: PlayLevel) = level(l).substringAfter(' ')

    fun speed(percent: Int) = when (percent) {
        50 -> "half tempo"
        75 -> "three-quarter tempo"
        else -> "full tempo"
    }

    fun speedKey(percent: Int) = "$percent%"

    const val FROM_SCRATCH = "from scratch"
    const val FROM_PICK = "from this beat"
    fun lesson(n: Int) = "lesson $n: ${ClaudePrompt.LESSONS[n - 1].lowercase()}"

    /** The words a slot of [p] shows, the kit as [kit] (the prompt's, or the one Live plays). */
    fun value(p: ClaudePrompt, s: PromptSlot, kit: FactoryKit): String {
        val g = Genres.of(p.genre)
        return when (s) {
            PromptSlot.BARS -> bars(p.bars)
            PromptSlot.FEEL -> feels(p.feels)
            PromptSlot.GENRE -> if (p.task == PromptTask.IMPROVE) g?.let(::toward) ?: OWN_STYLE else g?.words ?: ANY_STYLE
            PromptSlot.TEMPO -> p.tempo?.let(::tempo) ?: ANY_TEMPO
            PromptSlot.KIT -> kit(kit)
            PromptSlot.PARTS -> parts(p.parts)
            PromptSlot.GOAL -> goal(p.goal)
            PromptSlot.EDITS -> edits(p.edits)
            PromptSlot.LENGTH -> bars(p.length)
            PromptSlot.START -> if (p.fromPick) FROM_PICK else FROM_SCRATCH
            PromptSlot.LESSON -> lesson(p.lesson)
            PromptSlot.WAY -> way(p.way)
            PromptSlot.LEVEL -> level(p.level)
            PromptSlot.SPEED -> speed(p.speed)
        }
    }

    /**
     * The glass's sentence for [p]: "Write a [4-bar] beat in [dub techno] at [122 BPM] for the [EP-133] kit with
     * [bass · FX]", each bracket a slot.
     */
    fun sentence(p: ClaudePrompt, kit: FactoryKit): List<PromptPiece> {
        fun s(slot: PromptSlot) = PromptPiece(value(p, slot, kit), slot)
        fun w(text: String) = PromptPiece(text)
        return when (p.task) {
            PromptTask.BEAT -> listOf(w("Write a"), s(PromptSlot.BARS), w("beat in"), s(PromptSlot.FEEL), s(PromptSlot.GENRE), w("at"), s(PromptSlot.TEMPO), w("for the"), s(PromptSlot.KIT), w("kit with"), s(PromptSlot.PARTS))
            PromptTask.IMPROVE -> listOf(w("Improve it:"), s(PromptSlot.GOAL), s(PromptSlot.GENRE), w("in"), s(PromptSlot.EDITS), w("on the"), s(PromptSlot.KIT), w("kit"))
            PromptTask.TRACK -> listOf(w("Write a"), s(PromptSlot.LENGTH), w("track in"), s(PromptSlot.FEEL), s(PromptSlot.GENRE), w("at"), s(PromptSlot.TEMPO), w("for the"), s(PromptSlot.KIT), w("kit"), s(PromptSlot.START))
            PromptTask.PLAY -> listOf(w("Teach me to play it"), s(PromptSlot.WAY), w("as"), s(PromptSlot.LEVEL), w("starting at"), s(PromptSlot.SPEED))
            PromptTask.LEARN -> listOf(w("Teach me"), s(PromptSlot.LESSON), w("one step at a time"))
        }
    }

    // ---------- The prompt ----------
    // Written as Anthropic's prompting guide has it: the skill and the task first, why (the card goes back into Arc), the
    // choices as a list, then what the reply should be; the card or the sound list, the data, follows the words.
    private const val KEEP = "Keep its sound, FX and pad lines unless an edit needs to change them, or choose sounds from my sound list if one follows the card."
    private const val FROM_LIST = "Choose the sounds from my sound list, which follows:"
    private const val THE_CARD = "The card:"
    private const val REPLY = "Reply with the card in one code block, then 2-4 lines on the feel and one thing to try changing."

    /** "a, b and c". */
    private fun list(words: List<String>) = if (words.size < 2) words.joinToString("") else words.dropLast(1).joinToString(", ") + " and " + words.last()

    private fun partWords(p: PromptPart) = when (p) {
        PromptPart.BASS -> "a bassline"
        PromptPart.CHORDS -> "chords"
        PromptPart.LEAD -> "a lead"
        PromptPart.FILL -> "a fill in the last bar"
        PromptPart.FX -> "FX that suit it"
    }

    private fun lines(vararg l: String?) = l.filterNotNull().joinToString("\n")

    /**
     * The prompt [p] builds: the words before its card when it has one ([pick] says which), else the whole message
     * before the sound list ([sounds]: one follows). A hand-edited [ClaudePrompt.text] goes as it is.
     */
    fun prompt(p: ClaudePrompt, pick: SharePick, sounds: Boolean): String {
        p.text?.let { return it }
        val g = Genres.of(p.genre)
        val chain = pick == SharePick.CHAIN
        val style = "- Style: " + (g?.let { "${it.words} (start from the skill's recipe)" } ?: "any style you like")
        val tempo = p.tempo?.let { "- Tempo: $it BPM" }
        // The feel words: the skill's genres.md turns each into changes to the recipe.
        val feel = p.feels.takeIf { it.isNotEmpty() }?.let { f -> "- Feel: ${list(f.map(::feel))} (the skill's feel words: change the recipe the way they say)" }
        val choose = if (sounds) FROM_LIST else null
        return when (p.task) {
            PromptTask.BEAT -> lines(
                "Use the arc-beats skill to write a new beat for my EP-133. I'll paste your card into the Arc app and play it, so give one complete ARC BEAT card that passes the skill's check.",
                style,
                feel,
                tempo,
                "- Length: ${p.bars} ${if (p.bars == 1) "bar" else "bars"}",
                "- Parts: " + (if (p.parts.isEmpty()) "drums only" else "drums, " + list(PromptPart.entries.filter { it in p.parts }.map(::partWords))),
                REPLY,
                choose,
            )
            PromptTask.IMPROVE -> {
                val what = if (chain) "arrangement" else "beat"
                lines(
                    "Use the arc-beats skill to improve this EP-133 $what from Arc. I'll paste your new card back into Arc next to mine, so give it a short new name.",
                    "- First: analyse it, " + if (chain) "its energy curve, contrast, length and transitions" else "its groove, its energy and what makes it work",
                    goal(p.goal).takeIf { p.goal != PromptGoal.BETTER }?.let { "- Ask: $it" },
                    g?.let { "- Direction: toward ${it.words}" },
                    "- Edits: ${edits(p.edits).removeSuffix(" edits").removeSuffix(" edit")}, as one new card" + if (chain) " of scenes with a chain line" else "",
                    "$KEEP $THE_CARD",
                )
            }
            PromptTask.TRACK -> {
                val length = "- Length: about ${p.length} bars"
                if (p.fromPick) {
                    val what = if (chain) "arrangement" else "beat"
                    lines(
                        "Use the arc-beats skill to continue this EP-133 $what from Arc into a track idea: a card of scenes with a chain line that I'll paste into Arc and play.",
                        style,
                        feel,
                        tempo,
                        length,
                        "- Start: this $what as its first ${if (chain) "scenes" else "scene"}, then change one or two things from scene to scene",
                        "$KEEP $THE_CARD",
                    )
                } else {
                    lines(
                        "Use the arc-beats skill to write a track idea for my EP-133: a card of scenes with a chain line that I'll paste into Arc and play.",
                        style,
                        feel,
                        tempo,
                        length,
                        "- Shape: an intro, a drop, a breakdown and a second drop, changing one or two things from scene to scene",
                        "Reply with the card in one code block, then a line for each scene saying what changes.",
                        choose,
                    )
                }
            }
            PromptTask.PLAY -> {
                val what = if (chain) "arrangement" else "beat"
                lines(
                    "Use the arc-beats skill to teach me to play this EP-133 $what from Arc myself, on the device, not just import it.",
                    "- Way: " + when (p.way) {
                        PlayWay.FINGERS -> "finger drumming, one part at a time, saying which hand and finger plays each pad"
                        PlayWay.STEPS -> "step entry on the EP-133's sequencer, with the key combos of the official guide"
                        PlayWay.PERFORM -> "performing it live, bar by bar: when to switch scenes, play fills and punch in FX"
                        PlayWay.KEYS -> "its bass and melody parts in KEYS, note by note"
                    },
                    "- Me: " + when (p.level) {
                        PlayLevel.NEW -> "a beginner"
                        PlayLevel.SOME -> "I've had some practice"
                        PlayLevel.SURE -> "I'm sure on the pads"
                    },
                    "- Start: " + if (p.speed >= 100) "at its own tempo" else "at ${p.speed}% of its tempo, then work up to it",
                    "Go one step at a time: explain the step, give me something to play, and wait for me before the next one. $THE_CARD",
                )
            }
            PromptTask.LEARN -> learn(p.lesson)
        }
    }

    /** A lesson's prompt: from lesson [n] of the skill's lessons.md, a step at a time, waiting for the user between them. */
    fun learn(n: Int) =
        "Use the arc-beats skill to teach me the EP-133 K.O. II, starting at lesson $n (${ClaudePrompt.LESSONS[n - 1]}). I use the Arc app on Android. " +
            "Go one step at a time: explain the step, give me something to try on the device, and wait for me before the next one."

    /** What a share without a card is named by while its reply is awaited, and its subject ("Arc · New beat"). */
    const val NEW_BEAT = "New beat"
    const val TRACK_IDEA = "Track idea"
    fun subject(what: String) = "Arc · $what"

    // ---------- The page ----------
    const val HINT = "Tap an orange word to change it. SHARE or COPY takes the prompt to Claude; PASTE CARD brings its card back."
    const val HINT_CARD = "Tap an orange word to change it. SCENE, the pattern or CHAIN picks the card that goes with the prompt."
    const val HINT_EDITED = "Your own words go as they are. EDIT changes them, REBUILD brings the sentence back."
    const val HINT_EDITING = "Write the prompt your way. The card, the kit and the sound list still follow it."
    const val HINT_PICK = "Pick one, then DONE. NEXT goes on to the next word."
    const val HINT_PARTS = "Tap the parts to add or drop them; none is drums only."
    const val HINT_KIT = "The kit Live plays is picked at first. Another one goes with this prompt only."
    const val HINT_START = "From this beat sends the card SCENE, the pattern or CHAIN picks, as the track's first scene."
    fun hintGenre(g: Genre?) = g?.let { "${it.name}: ${it.tempo.first}-${it.tempo.last} BPM. Picking a genre sets its tempo." } ?: "Pick a genre and its recipe's tempo comes with it."
    fun hintTempo(g: Genre?) = g?.let { "${it.name} runs at ${it.tempo.first}-${it.tempo.last} BPM." } ?: "LIVE takes the tempo Live plays at."

    /** The glass's head while the prompt is edited, or was. */
    const val PROMPT = "Prompt"
    const val EDITED = "Edited"
    /** The tabs for screen readers: "Task: New beat". */
    fun taskName(t: PromptTask) = "Task: ${task(t)}"
    /** A slot for screen readers: "Genre: dub techno". */
    fun slotName(s: PromptSlot, value: String) = "${slot(s)}: $value"
    const val CHANGE = "Change"

    /** The keys. */
    const val KEY_EDIT = "Edit"
    const val KEY_COPY = "Copy"
    const val COPY_NAME = "Copy the prompt, to paste into Claude"
    /** Said once COPY has put the prompt (and its card) on the clipboard. */
    const val COPIED = "Prompt copied. Paste it into a chat with Claude."
    /** The wide key under the strip: Claude's reply coming back. Held, it opens a card file. */
    const val KEY_PASTE_CARD = "Paste card"
    const val PASTE_CARD_NAME = "Paste Claude's card from the clipboard"
    const val KEY_REBUILD = "Rebuild"
    const val KEY_DONE = "Done"
    const val KEY_NEXT = "Next"
    const val NEXT_NAME = "The next word"
    const val KEY_ANY = "Any"
    const val KEY_LIVE = "Live"
    const val EDIT_NAME = "Edit the prompt"
    const val REBUILD_NAME = "Drop your words and build the prompt again"
    const val ANY_GENRE_NAME = "Any genre"
    const val ANY_TEMPO_NAME = "Any tempo, Claude's choice"
    fun liveTempoName(bpm: Int) = "Live's tempo, $bpm BPM"
    fun stepTempo(by: Int) = if (by > 0) "+$by" else "−${-by}"
    fun stepTempoName(by: Int) = if (by > 0) "Faster by $by BPM" else "Slower by ${-by} BPM"
    const val FROM_SCRATCH_KEY = "Scratch"
    const val FROM_PICK_KEY = "This beat"
    fun lessonKey(n: Int) = "$n"
    fun lessonSub(n: Int) = ClaudePrompt.LESSONS[n - 1]

    // ---------- Saved prompts ----------
    const val SAVED = "Saved prompts"
    const val SAVE = "Save"
    const val SAVE_NAME = "Save this prompt"
    const val SAVED_FULL = "Hold a saved prompt to delete it, then save this one."
    fun savedName(name: String, current: Boolean) = "Saved prompt $name" + if (current) ", in use" else ""
    const val DELETE = "Delete"
    fun saved(name: String) = "Saved “$name”"
    fun deleted(name: String) = "Deleted “$name”"

    /** A saved prompt's name: "Dub techno 122", "Improve · Busier", "Lesson 5"; one hand-edited ends in "✎". */
    fun name(p: ClaudePrompt): String {
        val g = Genres.of(p.genre)
        val base = when (p.task) {
            PromptTask.BEAT -> (feelsWord(p) + listOfNotNull(g?.name?.let { if (p.feels.isEmpty()) it else it.lowercase() } ?: task(p.task), p.tempo?.toString()).joinToString(" "))
            PromptTask.IMPROVE -> "${task(p.task)} · " + (g?.name ?: goalKey(p.goal))
            PromptTask.TRACK -> "${task(p.task)} · " + listOfNotNull(g?.name, p.tempo?.toString()).joinToString(" ").ifEmpty { barsKey(p.length) }
            PromptTask.PLAY -> "${task(p.task)} \u00B7 ${wayKey(p.way)} ${p.speed}%"
            PromptTask.LEARN -> "Lesson ${p.lesson}"
        }
        return if (p.text != null) "$base ✎" else base
    }

    // "Dreamy " before a saved prompt's genre.
    private fun feelsWord(p: ClaudePrompt) = p.feels.firstOrNull()?.let { feel(it).replaceFirstChar(Char::uppercase) + " " } ?: ""

    /** [name], with " 2", " 3"... when [taken] has it already. */
    fun uniqueName(name: String, taken: Collection<String>): String {
        if (name !in taken) return name
        var n = 2
        while ("$name $n" in taken) n++
        return "$name $n"
    }

    /** The saved prompts with [p] added under its [name] (none when [SavedPrompt.MAX] are kept, or it is kept already). */
    fun withSaved(list: List<SavedPrompt>, p: ClaudePrompt): List<SavedPrompt> =
        if (list.size >= SavedPrompt.MAX || list.any { it.prompt == p }) list else list + SavedPrompt(uniqueName(name(p), list.map { it.name }), p)
}
