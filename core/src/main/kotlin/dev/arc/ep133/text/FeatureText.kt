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
}
