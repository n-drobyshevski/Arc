package dev.arc.ep133.text

import dev.arc.ep133.features.CardProblem
import dev.arc.ep133.features.CardFx
import dev.arc.ep133.features.FxSettings
import dev.arc.ep133.features.FxType
import dev.arc.ep133.features.PadSettings
import dev.arc.ep133.features.PhysicalPad
import kotlin.math.roundToInt

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
            "Keep its sound, FX and pad lines, or choose sounds from my sound list if one follows the card:"
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

    /**
     * The note under the rows, connected: [pads] ticked, in [project] (null while it isn't known). With [keeps] some
     * ticked pad has no sound yet, and UNDO can't empty it again: it keeps the new one.
     */
    fun soundsNote(pads: Int, project: Int?, keeps: Boolean = false) =
        "Writes ${Format.plural(pads, "pad")} in ${project?.let { "project $it" } ?: "the active project"} on the EP-133. " +
            "Their pitch, level and other settings reset to the sound's. UNDO puts the old sounds back" +
            (if (keeps) ", but a pad that had none keeps its new one." else ".")

    /** The same, offline: the changes are Arc's own until the EP-133 connects. */
    const val SOUNDS_OFFLINE_NOTE = "Saved as offline pad changes; they go to the EP-133 when you reconnect."

    // ---------- Silent pads ----------
    /**
     * The comment a share carries right after the card's header when Arc knows the pads: the pads the card uses that have no
     * sound, in keypad order for each group ("# no sound on: C7 D7"). Readers ignore comments; Claude reads it.
     */
    fun noSoundOn(pads: List<PhysicalPad>) = "# no sound on: " + pads.joinToString(" ") { padLabel(it) }

    /** The SILENT PADS block's header, and its row: "D7 \u00B7 12 notes, no sound: they will be silent". */
    const val SILENT_PADS = "Silent pads"
    fun silentRow(pad: PhysicalPad, notes: Int) =
        "${padLabel(pad)} \u00B7 ${Format.plural(notes, "note")}, no sound: ${if (notes == 1) "it" else "they"} will be silent"

    /** The row's keys: PICK SOUND opens the picker, CHANGE (once a sound is picked) opens it again. */
    const val PICK_SOUND = "Pick sound"
    const val CHANGE_PICK = "Change"

    /** Under the block: what a sound picked here does. */
    const val SILENT_NOTE = "A pad with no sound plays nothing. Pick a sound for it: it goes on the pad with IMPORT, with the card's other sounds."

    /** A silent row for screen readers: "D7: 12 notes, no sound, they will be silent", and once picked "D7: will get 512 PIANO". */
    fun silentRowName(pad: PhysicalPad, notes: Int) =
        "${padLabel(pad)}: ${Format.plural(notes, "note")}, no sound, ${if (notes == 1) "it" else "they"} will be silent"
    fun pickedRowName(pad: PhysicalPad, sound: String) = "${padLabel(pad)}: will get $sound"
    fun pickSoundName(pad: PhysicalPad) = "Pick a sound for ${padLabel(pad)}"
    fun changePickName(pad: PhysicalPad, sound: String) = "Pick another sound for ${padLabel(pad)}, now $sound"

    /** The picker's title, the line under it, the note under the list, and the key back to the card. */
    fun pickTitle(pad: PhysicalPad) = "Sound for ${padLabel(pad)}"
    fun pickLine(notes: Int) = "${Format.plural(notes, "note")} of the card play on this pad."
    const val PICK_NOTE = "The sound goes on the pad with IMPORT, in the same step as the card. UNDO takes the patterns back; connected, the pad keeps the sound."
    const val PICK_BACK = "Back to the card"

    /** A picked sound's row in SOUNDS: what the pad has now ("No sound", struck through) and the small line that says who chose it. */
    const val NO_SOUND = "No sound"
    const val PICKED_HERE = "Picked here"

    // ---------- The sheet: FX and pad shaping ----------
    /** The FX block's header, and the switch beside it that decides whether the card's FX replace the project's (on to begin with). */
    const val FX = "FX"
    const val APPLY_FX = "Apply FX"
    fun applyFxName(on: Boolean) = if (on) "Apply the card's FX to this project" else "Leave this project's FX as they are"

    /** Under the FX rows: they replace this project's FX in Arc, which play on the phone. */
    const val FX_BLOCK_NOTE = "Replaces this project's FX on the phone (the EP-133's own FX don't change). UNDO puts the old FX back."

    /** The pad shaping rows' header: each pad's pitch, level, pan, attack, release or mode, old to new, ticked to be applied. */
    const val PAD_SHAPING = "Pad shaping"

    /** Under the pad shaping rows, connected and offline. */
    const val PAD_SHAPING_NOTE = "Writes the ticked pads' settings on the EP-133. UNDO puts the old ones back."
    const val PAD_SHAPING_OFFLINE_NOTE = "Saved as offline pad settings; they go to the EP-133 when you reconnect."

    /** A row of the FX or pad shaping blocks: what it is ([label]), and its value [old] and [new]. */
    data class Change(val label: String, val old: String, val new: String) {
        /** Whether the card leaves it as it is: the row says [ALREADY_SET] and has no tick box. */
        val same: Boolean get() = old == new
    }

    /** What a row says when the project has the card's value already. */
    const val ALREADY_SET = "Already set"

    /** What a pad shaping row says when the pad has no sound to shape (and no sound row of the card is going onto it). */
    const val PAD_NO_SOUND = "No sound on this pad"

    /** A pad shaping row for screen readers: "A9: Pitch 0 becomes Pitch 2", "A9: already set", "A9: no sound on this pad". */
    fun padRowName(c: Change?, pad: PhysicalPad, noSound: Boolean) =
        if (noSound) "${padLabel(pad)}: ${PAD_NO_SOUND.lowercase()}" else if (c == null) "${padLabel(pad)}: ${ALREADY_SET.lowercase()}" else changeName(c)

    /** The FX rows' labels. */
    const val FX_EFFECT = "Effect"
    const val FX_SENDS = "Sends"
    const val FX_COMP = "Comp"
    const val FX_DUCK = "Duck"

    /** The master effect as a row says it: "DISTORTION \u00B7 DRIVE 12.3x \u00B7 LP 20", "OFF" for none. */
    fun fxEffectText(s: FxSettings): String =
        if (s.type == FxType.NONE) MirrorText.fxName(FxType.NONE).uppercase()
        else "${MirrorText.fxName(s.type).uppercase()} \u00B7 ${FxSettings.xLabel(s.type)} ${FxSettings.xReadout(s.type, s.x)} \u00B7 ${FxSettings.yReadout(s.type, s.y)}"

    /** The four sends as a row says them, the groups above 0 in percent: "A 80% \u00B7 B 20% \u00B7 C 0 \u00B7 D 0". */
    fun fxSendsText(s: FxSettings): String =
        s.sends.withIndex().joinToString(" \u00B7 ") { (g, v) ->
            val p = (v * 100f).roundToInt()
            "${'A' + g} " + if (p > 0) "$p%" else "0"
        }

    /** The master compressor: "OFF", or "ON \u00B7 DRIVE 2.1x \u00B7 5/150" (drive and speed as the XY pad reads them). */
    fun fxCompText(s: FxSettings): String =
        if (!s.comp.on) MirrorText.onOff(false).uppercase()
        else "${MirrorText.onOff(true).uppercase()} \u00B7 ${FxSettings.xLabel(FxType.COMPRESSOR)} ${FxSettings.xReadout(FxType.COMPRESSOR, s.comp.x)} \u00B7 ${FxSettings.yReadout(FxType.COMPRESSOR, s.comp.y)}"

    /** The sidechain, in words: "OFF", or "A7 ducks B C \u00B7 180 ms \u00B7 SNAP 40" (the FX sheet's length and shape). */
    fun fxSidechainText(s: FxSettings): String {
        val sc = s.sidechain
        if (!sc.on || sc.dests and FxSettings.ALL_GROUPS == 0) return MirrorText.onOff(false).uppercase()
        val groups = (0 until FxSettings.GROUPS).filter { sc.dests and (1 shl it) != 0 }.joinToString(" ") { "${'A' + it}" }
        return "${padLabel(PhysicalPad(sc.group, sc.pad))} ducks $groups \u00B7 ${MirrorText.sidechainLength(sc.x)} \u00B7 ${MirrorText.sidechainShape(sc.y)}"
    }

    /**
     * The FX rows for a card that sets the kinds [fx] gives, from the project's [old] FX to [now] (the card applied,
     * [dev.arc.ep133.features.BeatCards.applyFx]): the effect, sends, comp and duck, in that order, each only when the card has
     * a line for it. A row the project has already ([Change.same]) is kept, to say so.
     */
    fun fxRows(old: FxSettings, now: FxSettings, fx: CardFx): List<Change> = listOfNotNull(
        if (fx.type != null) Change(FX_EFFECT, fxEffectText(old), fxEffectText(now)) else null,
        if (fx.sends != null) Change(FX_SENDS, fxSendsText(old), fxSendsText(now)) else null,
        if (fx.comp != null) Change(FX_COMP, fxCompText(old), fxCompText(now)) else null,
        if (fx.sidechain != null) Change(FX_DUCK, fxSidechainText(old), fxSidechainText(now)) else null,
    )

    /** One setting of a pad's shaping row: its [name] ("Pitch"), and its value [old] and [new] ("0", "+2"). */
    data class PadPart(val name: String, val old: String, val new: String)

    /**
     * The settings of a pad that differ from [old] to [new], as the pad sheet reads them, in the sheet's order. Only
     * pitch, level, pan, attack, release and mode count (the card carries no more). Empty when none differs.
     */
    fun padParts(old: PadSettings, new: PadSettings): List<PadPart> = listOfNotNull(
        if (old.pitch != new.pitch) PadPart(MirrorText.PITCH, MirrorText.pitchLabel(old.pitch), MirrorText.pitchLabel(new.pitch)) else null,
        if (old.level != new.level) PadPart(MirrorText.LEVEL, MirrorText.levelLabel(old.level), MirrorText.levelLabel(new.level)) else null,
        if (old.pan != new.pan) PadPart(MirrorText.PAN, MirrorText.panLabel(old.pan), MirrorText.panLabel(new.pan)) else null,
        if (old.attack != new.attack) PadPart(MirrorText.ATTACK, MirrorText.envLabel(old.attack), MirrorText.envLabel(new.attack)) else null,
        if (old.release != new.release) PadPart(MirrorText.RELEASE, MirrorText.envLabel(old.release), MirrorText.envLabel(new.release)) else null,
        if (old.mode != new.mode) PadPart(MirrorText.MODE, MirrorText.modeLabel(old.mode), MirrorText.modeLabel(new.mode)) else null,
    )

    /** A pad's shaping row as text, if the card changes it: the pad ("A7"), "Pitch 0 \u00B7 Level 100" to "Pitch -7 \u00B7 Level 90". */
    fun padChange(pad: PhysicalPad, old: PadSettings, new: PadSettings): Change? {
        val parts = padParts(old, new)
        if (parts.isEmpty()) return null
        return Change(padLabel(pad), parts.joinToString(" \u00B7 ") { "${it.name} ${it.old}" }, parts.joinToString(" \u00B7 ") { "${it.name} ${it.new}" })
    }

    /** A row for screen readers: "Effect: OFF becomes REVERB \u00B7 SIZE 50% \u00B7 FLAT", "A7: Pitch 0 becomes Pitch -7", or "Comp: OFF, already set". */
    fun changeName(c: Change) = if (c.same) "${c.label}: ${c.new}, ${ALREADY_SET.lowercase()}" else "${c.label}: ${c.old} becomes ${c.new}"

    // CANCEL is [Strings.CANCEL].
    const val IMPORT = "Import"

    /** The reason IMPORT is off when the card can't be read (its errors are listed), and when a group is full. */
    const val FIX_ERRORS = "Fix the errors to import this card."
    fun groupFull(group: Int) = "Group ${'A' + group} has no free pattern."

    /**
     * IMPORT's toast: where it went, and how to take it back. One pattern is
     * named; several go in the scene they made ([scene], "S03"), or are listed
     * where there was no room for a scene. [sounds] put on pads are counted,
     * and so are the [skipped] ones that had no pad to go on. The card's [fx]
     * applied and the [pads] shaped are named after them.
     */
    fun imported(places: List<Pair<Int, Int>>, scene: String?, sounds: Int = 0, skipped: Int = 0, fx: Boolean = false, pads: Int = 0, padsSkipped: Int = 0): String {
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
        val applied = listOfNotNull(if (fx) FX else null, if (pads > 0) Format.plural(pads, "pad setting") else null).joinToString(" and ")
        val shaping = listOfNotNull(
            applied.takeIf { it.isNotEmpty() }?.let { "$it applied" },
            if (padsSkipped > 0) "${Format.plural(padsSkipped, "pad setting")} skipped" else null,
        )
        return "Imported to $where$extra." + (if (shaping.isEmpty()) "" else " " + shaping.joinToString(", ") + ".") + " UNDO takes it back."
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

    /**
     * After UNDO took an import back, what was put back: the old sounds on [back] pads, with the [empty] ones that had none
     * before (they can't be emptied again), the old settings on [shaped] pads, and the old FX ([fx]). Sounds first. When
     * nothing of that was put back (the shaped pads were turned since), it only says the import is taken back.
     */
    fun importUndone(back: Int, empty: Int, shaped: Int, fx: Boolean): String {
        val parts = listOfNotNull(
            if (back > 0 || empty > 0) soundsRestored(back, empty).removeSuffix(".") else null,
            if (shaped > 0) "old settings back on ${Format.plural(shaped, "pad")}" else null,
            if (fx) "old FX back" else null,
        )
        if (parts.isEmpty()) return "Import taken back."
        return parts.joinToString(", ").replaceFirstChar { it.uppercase() } + "."
    }

    /**
     * IMPORT's toast when a pad's settings couldn't be written: [reason], then what stays: the patterns, the pads
     * [written] so far, and the FX if they went on.
     */
    fun shapingFailed(reason: String, written: Int, fx: Boolean) =
        MirrorText.padSettingsFailed(reason) + ". The patterns stay imported" +
            (if (fx) ", the FX applied" else "") + (if (written > 0) " and ${Format.plural(written, "pad")} shaped" else "") + ". UNDO takes it back."

    private fun twoDigits(n: Int) = n.toString().padStart(2, '0')
}
