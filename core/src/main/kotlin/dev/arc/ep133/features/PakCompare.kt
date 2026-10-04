package dev.arc.ep133.features

import dev.arc.ep133.backup.Pak
import dev.arc.ep133.formats.DecodedWav
import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.Wav
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

enum class ChangeKind { ADDED, REMOVED, CHANGED }

data class SoundChange(
    val slot: Int,
    val kind: ChangeKind,
    val oldName: String?,
    val newName: String?,
    val audioChanged: Boolean = false,
    val renamed: Boolean = false,
    /** Setting keys that differ; only judged when both backups carry settings. */
    val settingsChanged: List<String> = emptyList(),
)

data class PadChange(val group: String, val pad: Int, val oldSlot: Int?, val newSlot: Int?)

data class ProjectChange(
    val project: Int,
    val kind: ChangeKind,
    val padChanges: List<PadChange> = emptyList(),
    /** False when either project's pads could not be read, so pad changes are unknown. */
    val padsRead: Boolean = true,
)

data class PakCompareResult(
    val sounds: List<SoundChange>,
    val projects: List<ProjectChange>,
    val sameSounds: Int,
    val sameProjects: Int,
) {
    val nothingChanged: Boolean get() = sounds.isEmpty() && projects.isEmpty()
}

/**
 * Compares two saved backups (an addition to the web version), on the phone.
 * Audio is compared as decoded PCM, so the same sound in a WAV with another
 * header is the same. Settings are what a restore would send: the settings
 * embedded in the WAV (as the Sample Tool writes them) with arc.json's laid
 * over them, like Backup.prepareSound; they are compared when both sides have
 * some. Projects are compared by their bytes, with pad changes listed.
 */
object PakCompare {
    fun compare(old: Pak, new: Pak): PakCompareResult {
        val sounds = ArrayList<SoundChange>()
        var sameSounds = 0
        for (slot in (old.sounds.keys + new.sounds.keys).toSortedSet()) {
            val a = old.sounds[slot]
            val b = new.sounds[slot]
            when {
                a == null -> sounds.add(SoundChange(slot, ChangeKind.ADDED, null, b!!.name))
                b == null -> sounds.add(SoundChange(slot, ChangeKind.REMOVED, a.name, null))
                else -> {
                    val wa = runCatching { Wav.decode(a.wav) }.getOrNull()
                    val wb = runCatching { Wav.decode(b.wav) }.getOrNull()
                    val audio = !sameAudio(a.wav, b.wav, wa, wb)
                    val renamed = a.name != b.name
                    val settings = settingsChanged(effective(wa, a.settings), effective(wb, b.settings))
                    if (audio || renamed || settings.isNotEmpty()) {
                        sounds.add(SoundChange(slot, ChangeKind.CHANGED, a.name, b.name, audio, renamed, settings))
                    } else {
                        sameSounds++
                    }
                }
            }
        }

        val projects = ArrayList<ProjectChange>()
        var sameProjects = 0
        for (n in (old.projects.keys + new.projects.keys).toSortedSet()) {
            val a = old.projects[n]
            val b = new.projects[n]
            when {
                a == null -> projects.add(ProjectChange(n, ChangeKind.ADDED))
                b == null -> projects.add(ProjectChange(n, ChangeKind.REMOVED))
                a.contentEquals(b) -> sameProjects++
                else -> {
                    val ga = ProjectPads.read(a)
                    val gb = ProjectPads.read(b)
                    projects.add(ProjectChange(n, ChangeKind.CHANGED, padChanges(ga, gb), padsRead = ga.isNotEmpty() && gb.isNotEmpty()))
                }
            }
        }
        return PakCompareResult(sounds, projects, sameSounds, sameProjects)
    }

    /** Same channels, rate and PCM; byte equality when either WAV can't be read. */
    private fun sameAudio(a: ByteArray, b: ByteArray, wa: DecodedWav?, wb: DecodedWav?): Boolean {
        if (a.contentEquals(b)) return true
        if (wa == null || wb == null) return false
        return wa.channels == wb.channels && wa.sampleRate == wb.sampleRate && wa.pcm.contentEquals(wb.pcm)
    }

    /** {...(wav.embedded ?? {}), ...(settings ?? {})}, or null when there are none of either. */
    private fun effective(wav: DecodedWav?, side: JsonElement?): JsonObject? {
        val embedded = wav?.embedded
        if (embedded == null && side !is JsonObject) return null
        val m = LinkedHashMap<String, JsonElement>()
        embedded?.let { m.putAll(it) }
        (side as? JsonObject)?.let { m.putAll(it) }
        return JsonObject(m)
    }

    private fun settingsChanged(a: JsonElement?, b: JsonElement?): List<String> {
        if (a !is JsonObject || b !is JsonObject) return emptyList()
        return (a.keys + b.keys).filter { k ->
            val x = a[k]
            val y = b[k]
            x == null || y == null || JsJson.stringify(x) != JsJson.stringify(y)
        }
    }

    private fun padChanges(ga: List<PadGroup>, gb: List<PadGroup>): List<PadChange> {
        val pa = ProjectPads.flatten(ga)
        val pb = ProjectPads.flatten(gb)
        // Groups a-d first (as everywhere else), then pad number.
        return (pa.keys + pb.keys)
            .filter { pa[it] != pb[it] }
            .sortedWith(compareBy<Pair<String, Int>, String>(ProjectPads.groupOrder) { it.first }.thenBy { it.second })
            .map { PadChange(it.first, it.second, pa[it], pb[it]) }
    }
}
