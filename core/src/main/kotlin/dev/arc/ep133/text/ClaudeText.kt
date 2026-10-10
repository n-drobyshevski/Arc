package dev.arc.ep133.text

import dev.arc.ep133.features.CardProblem
import dev.arc.ep133.features.PhysicalPad

/**
 * Live tools' CLAUDE section and the beat card sheet (an addition): sharing a
 * pattern or a scene to Claude as an ARC BEAT card, and pasting Claude's card
 * back in. The card's own text is the spec's (skill/arc-beats); these are the
 * words around it.
 */
object ClaudeText {
    // ---------- Live tools: the CLAUDE section ----------
    const val CLAUDE = "Claude"

    /** The notes behind the info key after CLAUDE: what a beat card is, and how to give Claude the skill. */
    const val INFO_CARDS =
        "A beat card is a beat as plain text: the tempo, the swing and a row of steps for each pad, named by its sound. " +
            "Claude reads one to analyse or improve it, and writes one back. Pasting it brings it into Arc as a new pattern."
    const val INFO_SKILL =
        "Claude knows the cards through the arc-beats skill. In the Claude app, download its zip below, then open " +
            "claude.ai → Settings → Capabilities → Skills and upload it. In Claude Code, put the arc-beats folder in ~/.claude/skills."

    /** The card's title and its one-line hint. */
    const val BEAT_CARDS = "Beat cards"
    const val BEAT_HINT = "Share a beat to Claude to analyse or improve it. Paste Claude's card to get it back as a new pattern."

    /** SHARE SCENE S02: the scene playing, its four patterns (the blank ones left out). [scene] is its label, "S02". */
    fun shareScene(scene: String) = "Share scene $scene"

    /** SHARE A · 01: the playing pattern of the group shown. */
    fun sharePattern(group: Int, n: Int) = "Share ${place(group, n)}"

    const val PASTE_BEAT = "Paste beat"

    /** The keys for screen readers: what they share, or that there is nothing to. */
    fun shareSceneName(scene: String, empty: Boolean) = "Share scene $scene with Claude" + if (empty) NOTHING_TO_SHARE else ""
    fun sharePatternName(group: Int, n: Int, empty: Boolean) = "Share ${place(group, n)} with Claude" + if (empty) NOTHING_TO_SHARE else ""
    const val PASTE_BEAT_NAME = "Paste a beat card from the clipboard"
    const val NOTHING_TO_SHARE = ", no notes yet"

    /** The two links under the card. */
    const val GET_SKILL = "Get the arc-beats skill"
    const val LEARN = "Learn with Claude"

    /** Where the skill's zip is (the web app's public folder). */
    const val SKILL_URL = "https://arc-pi-mauve.vercel.app/arc-beats-skill.zip"

    /** What Learn with Claude shares, to be sent to the Claude app as the first message. */
    const val LEARN_PROMPT =
        "Use the arc-beats skill. Teach me the EP-133 K.O. II from lesson 1, one step at a time. I use the Arc app on Android."
    const val LEARN_TITLE = "Learn the EP-133 with Claude"

    /** Said when no app can take the link or the text. */
    const val NO_APP = "No app can open that."

    // ---------- Sharing ----------
    /** The line before the card in the shared text. */
    const val SHARE_PROMPT =
        "Analyse this EP-133 beat from Arc with the arc-beats skill, then suggest 2-3 edits as a new card. " +
            "Keep its sound lines, or choose sounds from my sound list if one follows the card:"
    const val SHARE_TITLE = "Share beat card"

    /** "P01 S02": pattern [n] (1..99) of the scene at [scene] (from 0), a card's name. */
    fun patternCardName(n: Int, scene: Int) = "P${twoDigits(n)} S${twoDigits(scene + 1)}"

    /** "S02": a scene's card, whose patterns have numbers of their own. */
    fun sceneCardName(scene: Int) = "S${twoDigits(scene + 1)}"

    /** The share's subject: "Arc beat P01 S02". */
    fun shareSubject(cardName: String) = "Arc beat $cardName"

    /** The shared text: [prompt], a blank line and [card] (which ends in a newline) in a fenced block. */
    fun shareText(prompt: String, card: String) = prompt + "\n\n```\n" + card + "```\n"

    // ---------- The sound list ----------
    /** Where the sound list Arc adds after a shared card came from: the EP-133 itself, its last read, or the factory pack. */
    const val SOUNDS_FROM_DEVICE = "the EP-133"
    const val SOUNDS_FROM_LAST_READ = "the last read"
    const val SOUNDS_FROM_FACTORY = "the factory pack"

    /** The line before the sound list (the spec's): "My EP-133's sounds (slot name), from the EP-133:". [source] is one of the three above. */
    fun soundListHeader(source: String) = "My EP-133's sounds (slot name), from $source:"

    // The words the factory blocks ([FeatureText.FACTORY_BLOCKS], in order) go by in the sound list's note.
    private val FACTORY_WORDS = listOf("kicks", "snares", "hats", "percussion", "bass", "melodic")

    /**
     * The line after the header when some listed name is a slot's file name ("200.pcm"): the EP-133 keeps its factory
     * sounds without names, so the slot says what a sound is. "Names like 200.pcm are factory sounds the EP-133 keeps
     * without a name. By slot: kicks 1-99, snares 100-199, ..., melodic 500-599."
     */
    val UNNAMED_SOUNDS_NOTE: String = "Names like 200.pcm are factory sounds the EP-133 keeps without a name. By slot: " +
        FeatureText.FACTORY_BLOCKS.zip(FACTORY_WORDS) { r, w -> "$w ${r.first}-${r.last}" }.joinToString(", ") + "."

    /**
     * The tick box under the share keys: "With my sound list · 212 sounds" ([count] is how many Arc knows: the EP-133's,
     * the last read's or the factory pack's). Off, the card is shared with its sound lines alone.
     */
    fun withSoundList(count: Int) = "With my sound list \u00B7 ${Format.plural(count, "sound")}"

    // ---------- Receiving ----------
    /** A text with no ARC BEAT line in it: from PASTE BEAT, or shared to Arc. */
    const val NO_CARD = "No beat card in that text."

    // ---------- The sheet ----------
    /** The title when the card has no name. */
    const val CARD = "Beat card"

    /** "Beat card · 4 bars · 5 pads · 23 hits": under the title; [bars] is the longest section's (the scene loops over it). */
    fun summary(bars: Int, pads: Int, hits: Int) =
        "$CARD · ${Format.plural(bars, "bar")} · ${Format.plural(pads, "pad")} · ${Format.plural(hits, "hit")}"

    /** "A · 01": [group]'s pattern [n], as the keys and rows say it. */
    fun place(group: Int, n: Int) = "${'A' + group} · ${twoDigits(n)}"

    /** A section's heading: "Group A · 2 bars · 1/16" (its group, length and the step its grid reads in). */
    fun sectionTitle(group: Int, bars: Int, step: String) = "Group ${'A' + group} · ${Format.plural(bars, "bar")} · $step"

    /** What a long pattern shows: the first bars, and "+3 bars" for the rest. */
    fun moreBars(n: Int) = "+${Format.plural(n, "bar")}"

    /** A pad's row on the grid: "A7", and "AE" for ENTER (as the card writes it). */
    fun padLabel(pad: PhysicalPad) = "${pad.groupLetter}${if (pad.offset == 2) "E" else pad.label}"

    /** That row for screen readers: "A7 kick: 4 hits", "A enter: 1 hit". */
    fun rowName(pad: PhysicalPad, name: String?, hits: Int): String {
        val label = if (pad.offset == 2) "${pad.groupLetter} enter" else padLabel(pad)
        return label + (name?.let { " $it" } ?: "") + ": " + Format.plural(hits, "hit")
    }

    /** The grid for screen readers: "Group A, 2 bars, 1/16, 3 pads". */
    fun gridName(group: Int, bars: Int, step: String, pads: Int) = "Group ${'A' + group}, ${Format.plural(bars, "bar")}, $step, ${Format.plural(pads, "pad")}"

    /** "Goes to  A · 04 (next free)": where a section's pattern lands. */
    const val GOES_TO = "Goes to"
    fun goesTo(group: Int, n: Int) = "${place(group, n)} (next free)"

    // "New scene  S03": the scene a card of several groups adds is [MirrorText.NEW_SCENE] and [MirrorText.sceneLabel].

    /** "Tempo  92": the card's tempo, whole BPM; and the chip that sets it, "SET · NOW 122" ([now] is Arc's). */
    const val TEMPO = "Tempo"
    fun tempoChip(now: Int) = "Set · now $now"
    fun tempoChipName(card: String, now: Int, on: Boolean) =
        if (on) "Set the tempo to $card, now $now" else "Keep the tempo at $now, the card says $card"

    /** "Swing 58 · placed in the notes": the swing is already in where the hits sit, so nothing is set. */
    fun swingLine(swing: Int) = "Swing $swing · placed in the notes"

    /** A problem as listed: "Line 7: Unknown word 'foo', ignored." */
    fun problemLine(p: CardProblem) = "Line ${p.line}: ${p.message}"

    /** A problem for screen readers: "Error, line 7: ..." / "Warning, line 7: ...". */
    fun problemName(p: CardProblem) = (if (p.error) "Error" else "Warning") + ", " + problemLine(p).replaceFirstChar { it.lowercase() }

    const val COPY_PROBLEMS = "Copy problems"
    const val PROBLEMS_COPIED = "Problems copied. Paste them to Claude."

    /** What COPY PROBLEMS copies, for Claude to read: each problem with its line (counted in the card as pasted). */
    fun problemsReport(problems: List<CardProblem>): String =
        "Arc found problems in the beat card:\n" +
            problems.joinToString("") { "- Line ${it.line} (${if (it.error) "error" else "warning"}): ${it.message}\n" } +
            "Please fix them and send the whole card again."

    // ---------- The sheet: sounds ----------
    /** The block's header, and the chip beside it that decides whether the ticked sounds go onto the pads (on to begin with). */
    const val SOUNDS = "Sounds"
    const val PUT_ON_PADS = "Put on pads"
    fun putOnPadsName(on: Boolean, count: Int) =
        if (on) "Put ${Format.plural(count, "sound")} on the pads" else "Leave the pads' sounds as they are"

    /** A sound as the rows write it: "012 Micro kick", just "012" when the card or the list gives no name. */
    fun soundName(slot: Int, name: String?) = FeatureText.slot(slot) + (name?.let { " $it" } ?: "")

    /** What a row says in place of a new sound: the pad plays it already. */
    const val ALREADY_THERE = "Already there"

    /** What a row says when the sound is nowhere in the user's list: "Not on your EP-133: 301 Rim dusty". */
    fun soundMissing(slot: Int, name: String?) = "Not on your EP-133: ${soundName(slot, name)}"

    /**
     * The small line under a sound the EP-133 lists without a name ("200.pcm"), used by its slot: "Card says HH CLOSED \u00B7 name not
     * checked" ([name] is the card's).
     */
    fun cardSays(name: String) = "Card says $name \u00B7 name not checked"

    /** Under the rows when no sound line of the card is on the user's EP-133. */
    const val NONE_ON_DEVICE = "None of these sounds are on your EP-133. Share a beat with your sound list so Claude picks from yours."

    /** A row for screen readers: "A7: Kick dusty becomes 012 Micro kick", "A7: 012 Micro kick, already there", or the missing reason. */
    fun soundRowName(pad: PhysicalPad, old: String?, change: String) = padLabel(pad) + ": " + (old?.let { "$it becomes " } ?: "") + change
    fun soundRowSame(pad: PhysicalPad, sound: String) = "${padLabel(pad)}: $sound, ${ALREADY_THERE.lowercase()}"
    fun soundRowMissing(pad: PhysicalPad, slot: Int, name: String?) = "${padLabel(pad)}: ${soundMissing(slot, name)}"

    /** The note under the rows, connected: [pads] ticked, in [project] (null while it isn't known). */
    fun soundsNote(pads: Int, project: Int?) =
        "Writes ${Format.plural(pads, "pad")} in ${project?.let { "project $it" } ?: "the active project"} on the EP-133. " +
            "Their pitch, level and other settings reset to the sound's. UNDO puts the old sounds back."

    /** The same, offline: the changes are Arc's own until the EP-133 connects. */
    const val SOUNDS_OFFLINE_NOTE = "Saved as offline pad changes; they go to the EP-133 when you reconnect."

    // CANCEL is [Strings.CANCEL].
    const val IMPORT = "Import"

    /** The reason IMPORT is off when the card can't be read (its errors are listed), and when a group is full. */
    const val FIX_ERRORS = "Fix the errors to import this card."
    fun groupFull(group: Int) = "Group ${'A' + group} has no free pattern."

    /**
     * IMPORT's toast: where it went, and how to take it back. One pattern is
     * named; several go in the scene they made ([scene], "S03"), or are listed
     * where there was no room for a scene. [sounds] put on pads are counted,
     * and so are the [skipped] ones that had no pad to go on.
     */
    fun imported(places: List<Pair<Int, Int>>, scene: String?, sounds: Int = 0, skipped: Int = 0): String {
        val where = when {
            scene != null -> "scene $scene"
            else -> places.joinToString(", ") { place(it.first, it.second) }
        }
        val extra = when {
            sounds > 0 && skipped > 0 -> " and ${Format.plural(sounds, "sound")}, $skipped skipped"
            sounds > 0 -> " and ${Format.plural(sounds, "sound")}"
            skipped > 0 -> ", ${Format.plural(skipped, "sound")} skipped"
            else -> ""
        }
        return "Imported to $where$extra. UNDO takes it back."
    }

    /**
     * IMPORT's toast when a pad's sound couldn't be written ([reason]): the patterns stay in, with the [written] pads
     * that did change, and UNDO takes all of it back.
     */
    fun soundsFailed(reason: String, written: Int) =
        MirrorText.assignFailed(reason) + ". The patterns stay imported" + (if (written > 0) " and ${Format.plural(written, "pad")} changed" else "") + ". UNDO takes it back."

    /** After UNDO took an import back: the old sounds on [back] pads again, and the [empty] ones that had none before can't be emptied again. */
    fun soundsRestored(back: Int, empty: Int) =
        "Old sounds back on ${Format.plural(back, "pad")}" + (if (empty > 0) ", $empty had none before" else "") + "."

    private fun twoDigits(n: Int) = n.toString().padStart(2, '0')
}
