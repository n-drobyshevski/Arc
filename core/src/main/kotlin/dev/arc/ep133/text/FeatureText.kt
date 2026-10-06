package dev.arc.ep133.text

import dev.arc.ep133.features.DiffResult
import dev.arc.ep133.features.SoundDiff
import dev.arc.ep133.features.SoundState
import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.text.Format.plural
import dev.arc.ep133.util.jsNumberToString
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

/**
 * Text for the device browser, sample upload and compare screens. These are
 * additions to the web version, so there is no original wording; it follows
 * the web version's tone (short, plain, no jargon).
 */
object FeatureText {
    const val BROWSE = "Browse"
    const val DEVICE_TITLE = "On the device"
    const val REFRESH = "Refresh"
    const val ADD_SAMPLES = "Add samples"
    const val SOUNDS = "Sounds"
    const val PROJECTS = "Projects"
    const val NO_SOUNDS = "No sounds on the device."
    const val NO_PROJECTS = "No projects on the device."
    const val READING = "Reading…"
    const val NOT_CONNECTED = "Connect your EP-133 to see what is on it."
    const val TAP_FOR_DETAILS = "Tap for details"
    const val TAP_FOR_SOUNDS = "Tap to see which sounds it uses"
    const val NO_CHECKSUM = "not reported"

    // The Device tab's layout (sections, find, groups of slots, project tiles).
    const val NO_DEVICE_TITLE = "No EP-133"
    const val FIND_SOUND = "Find a sound"
    const val FIND_HINT = "Name or slot number"
    const val NO_FIND_MATCHES = "No sounds match."
    const val PROJECT = "Project"
    const val PICK_PROJECT = "Tap a project to see its sounds and pads."

    // The Device tab, redesigned: storage as a split meter, the factory layout per range, projects as pads.
    /** "free of 61 MB", under the free space in large type. */
    fun freeOf(total: Double) = "free of ${Format.bytes(total)}"
    const val FREE = "Free"

    /**
     * The factory layout's kind of sound for the range of slots starting at
     * [first] (from the official guide's note on SOUND mode: kicks 1-99,
     * snares 100-199, hi-hats 200-299, percussion 300-399, bass 400-499,
     * melodic 500-599), or null from 600 up, which the guide leaves free.
     */
    fun factoryCategory(first: Int): String? = when (first) {
        in 1..99 -> "Kicks"
        in 100..199 -> "Snares"
        in 200..299 -> "Hats"
        in 300..399 -> "Perc"
        in 400..499 -> "Bass"
        in 500..599 -> "Melodic"
        else -> null
    }

    /** "12 \u00B7 2.1 MB", the sounds binder's bar after "Sounds". */
    fun soundsTotal(n: Int, bytes: Double) = "$n \u00B7 ${Format.bytes(bytes)}"

    const val ALL = "All"
    /** "In P3 \u00B7 7", the filter for the sounds the selected project uses. */
    fun inProject(project: Int, n: Int) = "In ${projectBadge(project)} \u00B7 $n"

    /** "P3", on a sound the selected project uses. */
    fun projectBadge(project: Int) = "P$project"

    /** A project slot with nothing in it, on its pad key. */
    const val EMPTY_PROJECT = "empty"

    /** "352 KB \u00B7 7 sounds", beside the selected project's name. */
    fun projectSummary(size: Long, sounds: Int) = "${Format.bytes(size.toDouble())} \u00B7 ${plural(sounds, "sound")}"

    /** "001–099". */
    fun range(r: IntRange) = slot(r.first) + "\u2013" + slot(r.last)

    /** "212 sounds · 6 projects". */
    fun counts(sounds: Int, projects: Int) =
        "$sounds ${Strings.soundsLabel(sounds)} \u00B7 $projects ${Strings.projectsLabel(projects)}"

    /** "Sounds 212", for the section switch. */
    fun sectionLabel(name: String, n: Int) = "$name $n"

    /**
     * "001 kick · 004 hat closed", or the slot alone when no sound is there. The
     * slot and the name are joined by a no-break space so a line never splits them.
     */
    fun projectSoundNames(slots: List<Int>, names: Map<Int, String>) =
        if (slots.isEmpty()) "Uses no sounds" else slots.joinToString(" \u00B7 ") { s -> slot(s) + (names[s]?.let { "\u00A0$it" } ?: "") }

    // Playing on the phone (an addition): what to say when nothing can be heard.
    const val SILENT_SOUND = "This sound is silent."
    const val VOLUME_OFF = "Media volume is off. Turn it up to hear the sound."
    const val NO_AUDIO_OUTPUT = "No audio output is available."

    fun cantPlay(reason: String) = "Can't play this sound: $reason"

    fun unplayableFormat(channels: Int, sampleRate: Int) = "$channels channels at $sampleRate Hz can't be played."

    /** The debug log's line for a sound that started: "play backup:…:3: 46875 Hz, 1 ch, 0.52 s -> Bluetooth (Buds)". */
    fun playNote(key: String, sampleRate: Int, channels: Int, seconds: Double, route: String) =
        "play $key: $sampleRate Hz, $channels ch, ${jsNumberToString(kotlin.math.round(seconds * 100) / 100)} s -> $route"

    fun play(name: String) = "$PLAY $name"

    fun stop(name: String) = "$STOP $name"

    fun storage(free: Double, total: Double) =
        if (total != 0.0) "${Format.bytes(free)} free of ${Format.bytes(total)}" else ""

    fun slot(n: Int) = n.toString().padStart(3, '0')

    fun projectUses(slots: List<Int>) =
        if (slots.isEmpty()) "Uses no sounds" else "Uses ${if (slots.size == 1) "sound" else "sounds"} ${Format.list(slots.map(Int::toString))}"

    fun channels(ch: Double) = when (ch) {
        1.0 -> "Mono"
        2.0 -> "Stereo"
        else -> "${jsNumberToString(ch)} channels"
    }

    fun sampleRate(hz: Double) = "${jsNumberToString(hz)} Hz"

    private val SETTING_LABELS = linkedMapOf(
        "sound.playmode" to "Play mode",
        "sound.rootnote" to "Root note",
        "sound.pitch" to "Pitch",
        "sound.pan" to "Pan",
        "sound.amplitude" to "Volume",
        "sound.loopstart" to "Loop start",
        "sound.loopend" to "Loop end",
        "sound.bpm" to "BPM",
        "time.mode" to "Time mode",
        "envelope.attack" to "Attack",
        "envelope.release" to "Release",
    )

    fun settingLabel(key: String) = SETTING_LABELS[key] ?: key

    fun settingValue(v: JsonElement): String =
        if (v is JsonPrimitive && v.isString) v.content else JsJson.stringify(v)

    // ---------- upload ----------
    const val UPLOAD_TITLE = "Add samples"
    const val UPLOAD_HINT = "Each file goes into the sample slot shown. Change a slot to put it somewhere else."
    const val SLOT = "Slot"
    const val NO_FREE_SLOT = "No free slot left. Pick one to replace."
    const val UPLOADING = "Uploading"

    fun replaces(name: String) = "Replaces $name"
    fun unusable(message: String) = "Can't be uploaded: $message"
    fun uploadButton(n: Int) = if (n > 0) "Upload ${plural(n, "sound")}" else "Nothing to upload"
    fun duplicateSlot(slot: Int) = "Two files are set to slot $slot."
    fun uploaded(n: Int) = "Uploaded ${plural(n, "sound")}."

    // ---------- compare ----------
    const val COMPARE = "Compare with device"
    const val COMPARING = "Comparing"
    const val NO_CHANGES = "Everything you picked is already on the device."

    fun diffSummary(r: DiffResult) =
        if (r.changes == 0) NO_CHANGES else "Restoring changes ${plural(r.changes, "item")} on your EP-133:"

    fun soundState(d: SoundDiff): String {
        val parts = ArrayList<String>()
        when (d.state) {
            SoundState.SAME_AUDIO -> if (d.unchanged) parts.add("Same")
            SoundState.DIFFERENT_AUDIO -> parts.add("Different sound on the device")
            SoundState.NOT_ON_DEVICE -> parts.add("Slot is empty on the device")
            SoundState.UNVERIFIED -> parts.add("Probably the same (the device reports no checksum)")
        }
        if (d.nameDiffers) parts.add("named \"${d.deviceName}\" on the device")
        if (d.settingsDiffer.isNotEmpty()) parts.add("different ${Format.list(d.settingsDiffer.map { settingLabel(it).lowercase() })}")
        return parts.joinToString(", ").replaceFirstChar { it.uppercase() }
    }

    fun projectState(state: dev.arc.ep133.features.ProjectState) = when (state) {
        dev.arc.ep133.features.ProjectState.SAME -> "Same"
        dev.arc.ep133.features.ProjectState.DIFFERENT -> "Different on the device"
        dev.arc.ep133.features.ProjectState.NOT_ON_DEVICE -> "Not on the device"
    }

    fun untouched(r: DiffResult): String {
        val parts = ArrayList<String>()
        if (r.deviceOnlySlots.isNotEmpty()) parts.add("${if (r.deviceOnlySlots.size == 1) "sound" else "sounds"} ${Format.list(r.deviceOnlySlots.map(Int::toString))}")
        if (r.deviceOnlyProjects.isNotEmpty()) parts.add("${if (r.deviceOnlyProjects.size == 1) "project" else "projects"} ${Format.list(r.deviceOnlyProjects.map(Int::toString))}")
        return if (parts.isEmpty()) "" else "Also on the device and not in this backup, left as they are: ${parts.joinToString(" and ")}."
    }

    // ---------- backup contents, playback, export ----------
    const val CONTENTS = "Contents"
    const val OPENING = "Opening…"
    const val PLAY = "Play"
    const val STOP = "Stop"
    const val SHARE_WAV = "Share WAV"
    const val SAVE_WAV = "Save WAV"
    const val SHARE_PROJECT = "Share project"
    const val SAVE_PROJECT = "Save project"
    const val NO_SOUNDS_IN_BACKUP = "No sounds in this backup."
    const val NO_PROJECTS_IN_BACKUP = "No projects in this backup."
    const val EXPORT_HINT = "A project is shared as its own .pak with the sounds it uses."

    /** "1.5 s" or "850 ms" */
    fun duration(seconds: Double): String {
        // The unit follows the rounded value, so 0.9996 s reads "1.0 s", not "1000 ms".
        val ms = dev.arc.ep133.util.jsRound(seconds * 1000)
        return if (ms < 1000) "${ms.toLong()} ms" else "${dev.arc.ep133.util.jsToFixed(seconds, 1)} s"
    }

    // ---------- trim ----------
    const val TRIM = "Trim"
    const val PLAY_SELECTION = "Play selection"
    const val RESET = "Reset"
    const val START = "Start"
    const val END = "End"

    fun trimmed(seconds: Double) = "Trimmed to ${duration(seconds)}"
    fun selection(startS: Double, endS: Double) = "${duration(startS)} to ${duration(endS)}, ${duration(endS - startS)} long"

    // ---------- pad layout ----------
    const val PADS = "Pads"
    const val EMPTY_PAD = "Empty"
    const val MISSING_PAD = "Sound not found"
    const val NO_PADS = "No pad assignments found in this project."
    const val PADS_NOTE = "Pads are shown by number, not by where they sit on the device."

    /** "Group A"; a group with an unexpected name keeps it. */
    fun group(name: String) = "Group ${groupLetter(name)}"

    private fun groupLetter(name: String) = if (name.length == 1) name.uppercase() else name

    fun padsTitle(project: Int) = "Project $project pads"

    // ---------- library search ----------
    const val SEARCH = "Search"
    const val SEARCH_SOUNDS = "Search sounds"
    const val SEARCH_HINT = "Find a sound by name in every saved backup."
    const val NO_SOUND_MATCHES = "No sounds match."
    const val INDEXING = "Indexing backups…"

    fun matches(n: Int) = plural(n, "match", "matches")

    // ---------- compare two backups ----------
    const val COMPARE_BACKUPS = "Compare with another backup"
    const val PICK_OTHER = "Compare with which backup?"
    const val COMPARING_BACKUPS = "Comparing…"
    const val SOUNDS_ADDED = "Sounds added"
    const val SOUNDS_REMOVED = "Sounds removed"
    const val SOUNDS_CHANGED = "Sounds changed"
    const val PROJECTS_ADDED = "Projects added"
    const val PROJECTS_REMOVED = "Projects removed"
    const val PROJECTS_CHANGED = "Projects changed"
    const val NOTHING_CHANGED = "Nothing changed: the same sounds and projects."
    const val AUDIO_CHANGED = "Audio changed"
    const val PATTERNS_CHANGED = "Patterns or settings changed; each pad still has the same sound."
    const val PROJECT_CHANGED = "Changed."

    fun compareHeader(oldTitle: String, oldDay: String, newTitle: String, newDay: String) =
        "From $oldTitle ($oldDay) to $newTitle ($newDay)"

    fun unchanged(sounds: Int, projects: Int): String {
        val parts = buildList {
            if (sounds > 0) add(plural(sounds, "sound"))
            if (projects > 0) add(plural(projects, "project"))
        }
        return if (parts.isEmpty()) "" else "Unchanged: ${parts.joinToString(" and ")}."
    }

    /** "Renamed from kick; audio changed; settings changed: Pitch, Volume" */
    fun soundChange(c: dev.arc.ep133.features.SoundChange): String = buildList {
        if (c.renamed && c.oldName != null) add("Renamed from ${c.oldName}")
        if (c.audioChanged) add(if (isEmpty()) AUDIO_CHANGED else "audio changed")
        if (c.settingsChanged.isNotEmpty()) {
            val labels = c.settingsChanged.map(::settingLabel).joinToString(", ")
            add(if (isEmpty()) "Settings changed: $labels" else "settings changed: $labels")
        }
    }.joinToString("; ")

    /** "Pad A3: 001 kick, now 005 clap" */
    fun padChange(c: dev.arc.ep133.features.PadChange, oldName: String?, newName: String?): String {
        fun side(slot: Int?, name: String?) = if (slot == null) "empty" else slot(slot) + (name?.let { " $it" } ?: "")
        return "Pad ${groupLetter(c.group)}${c.pad}: ${side(c.oldSlot, oldName)}, now ${side(c.newSlot, newName)}"
    }

    // ---------- library folder (kept across reinstalls) ----------
    const val FOLDER_NOTE = "Backups are also kept in Documents/arc, so they survive reinstalling arc."
    const val RESTORE_FOLDER = "Restore from Documents/arc"
    const val RESTORE_HINT = "Reinstalled arc? Pick the Documents/arc folder to bring your backups back."
    const val NOTHING_TO_RESTORE = "No backups found in that folder."
    const val PICK_ARC_FOLDER = "That folder has no arc backups. Pick the arc folder inside Documents."

    fun restored(n: Int) = "Restored ${plural(n, "backup")}"

    fun copyFailed(message: String) = "Could not copy to Documents/arc: $message"
}
