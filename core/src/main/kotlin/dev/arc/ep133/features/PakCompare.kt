package dev.arc.ep133.features

import dev.arc.ep133.backup.Pak
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

data class ProjectChange(val project: Int, val kind: ChangeKind, val padChanges: List<PadChange> = emptyList())

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
 * header is the same; settings only when both backups carry them (Sample
 * Tool backups have none); projects by their bytes, with pad changes listed.
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
                    val audio = !sameAudio(a.wav, b.wav)
                    val renamed = a.name != b.name
                    val settings = settingsChanged(a.settings, b.settings)
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
                else -> projects.add(ProjectChange(n, ChangeKind.CHANGED, padChanges(a, b)))
            }
        }
        return PakCompareResult(sounds, projects, sameSounds, sameProjects)
    }

    /** Same channels, rate and PCM; byte equality when either WAV can't be read. */
    private fun sameAudio(a: ByteArray, b: ByteArray): Boolean {
        if (a.contentEquals(b)) return true
        val wa = runCatching { Wav.decode(a) }.getOrNull() ?: return false
        val wb = runCatching { Wav.decode(b) }.getOrNull() ?: return false
        return wa.channels == wb.channels && wa.sampleRate == wb.sampleRate && wa.pcm.contentEquals(wb.pcm)
    }

    private fun settingsChanged(a: JsonElement?, b: JsonElement?): List<String> {
        if (a !is JsonObject || b !is JsonObject) return emptyList()
        return (a.keys + b.keys).filter { k ->
            val x = a[k]
            val y = b[k]
            x == null || y == null || JsJson.stringify(x) != JsJson.stringify(y)
        }
    }

    private fun padChanges(a: ByteArray, b: ByteArray): List<PadChange> {
        val ga = ProjectPads.read(a)
        val gb = ProjectPads.read(b)
        val pa = ProjectPads.flatten(ga)
        val pb = ProjectPads.flatten(gb)
        // Group order as read (a-d first), then pad number.
        val order = (ga.map { it.name } + gb.map { it.name }).distinct()
        return (pa.keys + pb.keys)
            .filter { pa[it] != pb[it] }
            .sortedWith(compareBy({ order.indexOf(it.first) }, { it.second }))
            .map { PadChange(it.first, it.second, pa[it], pb[it]) }
    }
}
