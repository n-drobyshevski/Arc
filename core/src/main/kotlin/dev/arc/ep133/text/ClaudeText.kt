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
    const val SHARE_PROMPT = "Analyse this EP-133 beat from Arc with the arc-beats skill, then suggest 2-3 edits as a new card:"
    const val SHARE_TITLE = "Share beat card"

    /** "P01 S02": pattern [n] (1..99) of the scene at [scene] (from 0), a card's name. */
    fun patternCardName(n: Int, scene: Int) = "P${twoDigits(n)} S${twoDigits(scene + 1)}"

    /** "S02": a scene's card, whose patterns have numbers of their own. */
    fun sceneCardName(scene: Int) = "S${twoDigits(scene + 1)}"

    /** The share's subject: "Arc beat P01 S02". */
    fun shareSubject(cardName: String) = "Arc beat $cardName"

    /** The shared text: [prompt], a blank line and [card] (which ends in a newline) in a fenced block. */
    fun shareText(prompt: String, card: String) = prompt + "\n\n```\n" + card + "```\n"

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

    // CANCEL is [Strings.CANCEL].
    const val IMPORT = "Import"

    /** The reason IMPORT is off when the card can't be read (its errors are listed), and when a group is full. */
    const val FIX_ERRORS = "Fix the errors to import this card."
    fun groupFull(group: Int) = "Group ${'A' + group} has no free pattern."

    /**
     * IMPORT's toast: where it went, and how to take it back. One pattern is
     * named; several go in the scene they made ([scene], "S03"), or are listed
     * where there was no room for a scene.
     */
    fun imported(places: List<Pair<Int, Int>>, scene: String?): String {
        val where = when {
            scene != null -> "scene $scene"
            else -> places.joinToString(", ") { place(it.first, it.second) }
        }
        return "Imported to $where. UNDO takes it back."
    }

    private fun twoDigits(n: Int) = n.toString().padStart(2, '0')
}
