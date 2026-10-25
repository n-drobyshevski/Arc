package dev.arc.ep133.text

import dev.arc.ep133.features.ChangeKind
import dev.arc.ep133.features.PadGroup
import dev.arc.ep133.features.PadNotes
import dev.arc.ep133.features.PadOrder
import dev.arc.ep133.features.PakCompareResult
import dev.arc.ep133.text.Format.plural

/**
 * The text "Copy for Claude" puts on the clipboard (an addition to the web
 * version), in the form the arc-beats skill reads:
 *
 * - [kit]: a project's pads as an ARC BEAT card holding only `sound` lines
 *   (`sound A7 12 Kick`, one section per group), with a `# no sound on: …`
 *   comment for the empty pads, then the sound list after the card's fence.
 * - [sounds]: a backup's sound list on its own.
 * - [compare]: what changed between two backups, one `+`, `-` or `~` line each.
 *
 * The sound list is the skill's: a line `My EP-133's sounds (slot name), from
 * …:` and one `slot name` line for each sound, in slot order. Long lists are
 * cut, and a `#` line says how many were left out, so a share stays a few
 * thousand characters (a full EP-133 is under 20k).
 *
 * Pad labels: a project file numbers its pads (pads/a/p01 …), and community
 * notes disagree on how those numbers map to the keys (see [PadOrder]). The
 * labels here follow the same pad order setting as Live, and the share says so.
 */
object ShareText {
    /** The key on the pads sheet, a backup's contents and the compare screen. */
    const val COPY = "Copy for Claude"
    const val COPIED = "Copied. Paste it into a chat with Claude."
    /** Where the device's lists come from. */
    const val FROM_DEVICE = "the EP-133"
    const val FACTORY_NAMES =
        "Names like 200.pcm are factory sounds the EP-133 keeps without a name. By slot: kicks 1-99, snares 100-199, hats 200-299, percussion 300-399, bass 400-499, melodic 500-599."

    /** At most this many `slot name` lines in a sound list. */
    const val MAX_SOUNDS = 400
    /** At most this many change lines in a compare. */
    const val MAX_CHANGES = 150

    /** Keypad offsets ([PadNotes.LABELS]) of pad files 1-12 counted from the top: p01 is 7, p10 is '.'. */
    private val FROM_TOP = listOf(9, 10, 11, 6, 7, 8, 3, 4, 5, 0, 1, 2)
    /** What a card name drops: #, | and line breaks (a ' #' starts a comment), runs of blanks. */
    private val CONTROL = Regex("[#|\\t\\r\\n\\u00a0 ]+")
    private val UNNAMED = Regex("^[0-9]{1,3}\\.pcm$", RegexOption.IGNORE_CASE)

    /** 'the backup "Friday"' */
    fun fromBackup(title: String) = "the backup \"${clean(title)}\""

    /** "# 12 more sounds left out" */
    fun leftOut(n: Int, what: String) = "# ${plural(n, "more $what")} left out"

    /** "A7", "A." or "AE" (ENTER) for a pad of group a-d; null for anything else. */
    fun padLabel(group: String, pad: Int, order: PadOrder): String? {
        val g = listOf("a", "b", "c", "d").indexOf(group)
        val offset = offsetOf(pad, order)
        if (g < 0 || offset == null) return null
        val label = PadNotes.LABELS[offset]
        return ('A' + g).toString() + (if (label == "ENTER") "E" else label)
    }

    /**
     * A project's pads as a card of sound lines, then the sound list [names]
     * (taken [from] the device or a backup). A pad with a slot whose sound is not
     * in a non-empty [names] gets a comment saying so; an empty pad goes in the
     * `# no sound on` comment. Pads outside groups a-d or files 1-12 are left out.
     */
    fun kit(version: String, project: Int, groups: List<PadGroup>, names: Map<Int, String>, order: PadOrder, from: String): String {
        val silent = mutableListOf<String>()
        val sections = mutableListOf<String>()
        for (g in groups) {
            val pads = g.pads.entries
                .filter { padLabel(g.name, it.key, order) != null }
                .sortedBy { keypadRank(offsetOf(it.key, order)!!) }
            val lines = mutableListOf<String>()
            for ((pad, slot) in pads) {
                val label = padLabel(g.name, pad, order)!!
                if (slot == null) {
                    silent += label
                    continue
                }
                val name = names[slot]
                if (name != null) {
                    lines += "sound $label ${slotName(slot, name)}"
                } else {
                    lines += "sound $label $slot" + if (names.isNotEmpty()) " # not in the sound list" else ""
                }
            }
            if (lines.isNotEmpty()) sections += listOf("[${g.name.uppercase()}]") + lines
        }
        val out = mutableListOf(header("My EP-133 kit", version), "The pads of project $project, from $from. ${padOrderNote(order)}", "")
        if (sections.isEmpty()) {
            out += "No sound on any pad of project $project."
        } else {
            out += listOf("```", "ARC BEAT 1", "name Project $project kit")
            if (silent.isNotEmpty()) out += "# no sound on: ${silent.joinToString(" ")}"
            out += sections
            out += "```"
        }
        if (names.isNotEmpty()) out += listOf("") + soundList(names, from)
        return out.joinToString("\n") + "\n"
    }

    /** A backup's (or the device's) sounds as the skill's sound list. */
    fun sounds(version: String, names: Map<Int, String>, from: String): String {
        val out = mutableListOf(header("My EP-133 sounds", version), "")
        if (names.isEmpty()) out += "No sounds in $from." else out += soundList(names, from)
        return out.joinToString("\n") + "\n"
    }

    /**
     * What changed between two backups: [fromTo] is the screen's line
     * ([FeatureText.compareHeader]), then one line for each sound or project, a
     * changed project's pads under it (named by [order]), cut at [MAX_CHANGES].
     */
    fun compare(
        version: String,
        fromTo: String,
        r: PakCompareResult,
        oldNames: Map<Int, String>,
        newNames: Map<Int, String>,
        order: PadOrder,
    ): String {
        val out = mutableListOf(header("Two of my EP-133 backups compared", version), fromTo, "")
        if (r.nothingChanged) {
            out += FeatureText.NOTHING_CHANGED
            return out.joinToString("\n") + "\n"
        }
        val lines = mutableListOf<String>()
        fun sounds(kind: ChangeKind) = r.sounds.filter { it.kind == kind }
        fun projects(kind: ChangeKind) = r.projects.filter { it.kind == kind }
        fun section(title: String, rows: List<String>) {
            if (rows.isNotEmpty()) lines += listOf("$title:") + rows
        }
        section(FeatureText.SOUNDS_ADDED, sounds(ChangeKind.ADDED).map { "+ ${slotName(it.slot, it.newName ?: "")}" })
        section(FeatureText.SOUNDS_REMOVED, sounds(ChangeKind.REMOVED).map { "- ${slotName(it.slot, it.oldName ?: "")}" })
        section(
            FeatureText.SOUNDS_CHANGED,
            sounds(ChangeKind.CHANGED).map {
                val what = FeatureText.soundChange(it)
                "~ ${slotName(it.slot, it.newName ?: "")}" + if (what != "") ": $what" else ""
            },
        )
        section(FeatureText.PROJECTS_ADDED, projects(ChangeKind.ADDED).map { "+ ${Strings.projectLine(it.project)}" })
        section(FeatureText.PROJECTS_REMOVED, projects(ChangeKind.REMOVED).map { "- ${Strings.projectLine(it.project)}" })
        section(
            FeatureText.PROJECTS_CHANGED,
            projects(ChangeKind.CHANGED).flatMap { p ->
                if (p.padChanges.isEmpty()) {
                    // Only claim the pads kept their sounds when both layouts could be read (as the screen does).
                    val what = if (p.padsRead) FeatureText.PATTERNS_CHANGED else FeatureText.PROJECT_CHANGED
                    listOf("~ ${Strings.projectLine(p.project)}: $what")
                } else {
                    listOf("~ ${Strings.projectLine(p.project)}:") + p.padChanges.map { c ->
                        val label = padLabel(c.group, c.pad, order) ?: "${c.group.uppercase()} pad ${c.pad}"
                        "  $label ${side(c.oldSlot, oldNames)} → ${side(c.newSlot, newNames)}"
                    }
                }
            },
        )
        out += lines.take(MAX_CHANGES)
        if (lines.size > MAX_CHANGES) out += leftOut(lines.size - MAX_CHANGES, "line")
        val same = FeatureText.unchanged(r.sameSounds, r.sameProjects)
        if (same != "") out += same
        return out.joinToString("\n") + "\n"
    }

    /**
     * A name as a card keeps it (the skill's clean_text): no #, | or line breaks,
     * single spaces. A ' #' would start a comment and cut a sound line's name
     * short, so the sound list is cleaned the same way and the two agree.
     */
    private fun clean(name: String) = name.replace(CONTROL, " ").trim()

    /** The keypad offset (0-11) of pad file [pad], or null outside 1-12. */
    private fun offsetOf(pad: Int, order: PadOrder): Int? {
        if (pad < 1 || pad > 12) return null
        return if (order == PadOrder.FROM_TOP) FROM_TOP[pad - 1] else pad - 1
    }

    /** Where a pad sits on the keypad, top row first (7 8 9 / 4 5 6 / 1 2 3 / . 0 E). */
    private fun keypadRank(offset: Int) = FROM_TOP.indexOf(offset)

    private fun header(what: String, version: String) = "$what, shared from arc $version"

    private fun padOrderNote(order: PadOrder): String {
        val way = if (order == PadOrder.FROM_TOP) "from the top (pad file 1 is 7)" else "from the bottom (pad file 1 is .)"
        return "Pads are named by arc's pad order setting, $way; community notes disagree on it."
    }

    /** "My EP-133's sounds (slot name), from the EP-133:" and its lines, cut at [MAX_SOUNDS]. */
    private fun soundList(names: Map<Int, String>, from: String): List<String> {
        val slots = names.keys.sorted()
        val out = mutableListOf("My EP-133's sounds (slot name), from $from:")
        if (slots.any { UNNAMED.matches(clean(names.getValue(it))) }) out += FACTORY_NAMES
        for (s in slots.take(MAX_SOUNDS)) out += slotName(s, names.getValue(s))
        if (slots.size > MAX_SOUNDS) out += leftOut(slots.size - MAX_SOUNDS, "sound")
        return out
    }

    /** "12 Kick", or "12" for a sound with no name. */
    private fun slotName(slot: Int, name: String): String {
        val n = clean(name)
        return if (n == "") slot.toString() else "$slot $n"
    }

    /** A pad's side of a pad change: "1 kick", "1" when the name is not known, or "empty". */
    private fun side(slot: Int?, names: Map<Int, String>): String =
        if (slot == null) "empty" else slotName(slot, names[slot] ?: "")
}
