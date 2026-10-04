package dev.arc.ep133.features

import dev.arc.ep133.backup.Backup
import dev.arc.ep133.backup.Pak
import dev.arc.ep133.backup.Progress
import dev.arc.ep133.formats.Crc32
import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.asObject
import dev.arc.ep133.formats.isJsNumber
import dev.arc.ep133.formats.numberOrNull
import dev.arc.ep133.protocol.CancelSignal
import dev.arc.ep133.protocol.Device
import dev.arc.ep133.protocol.DeviceError
import dev.arc.ep133.protocol.Fs
import dev.arc.ep133.protocol.Session
import dev.arc.ep133.protocol.checkAbort
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonElement

enum class SoundState {
    /** The device has exactly this audio (its CRC matches). */
    SAME_AUDIO,
    /** The device has different audio in this slot; restoring replaces it. */
    DIFFERENT_AUDIO,
    /** The slot is empty on the device; restoring adds the sound. */
    NOT_ON_DEVICE,
    /** The device reports no CRC; size matches, so the audio is probably the same. */
    UNVERIFIED,
}

data class SoundDiff(
    val slot: Int,
    val backupName: String,
    val deviceName: String?,
    val state: SoundState,
    /** Setting keys whose value on the device differs from what a restore would write. */
    val settingsDiffer: List<String>,
) {
    val nameDiffers: Boolean get() = deviceName != null && deviceName != Device.cleanSoundName(backupName)

    /** Restoring this slot would change nothing. */
    val unchanged: Boolean get() = state == SoundState.SAME_AUDIO && !nameDiffers && settingsDiffer.isEmpty()
}

enum class ProjectState { SAME, DIFFERENT, NOT_ON_DEVICE }

data class ProjectDiff(val project: Int, val state: ProjectState)

data class DiffResult(
    val sounds: List<SoundDiff>,
    val projects: List<ProjectDiff>,
    /** Slots on the device that the compared backup does not contain (a restore leaves them alone). */
    val deviceOnlySlots: List<Int>,
    val deviceOnlyProjects: List<Int>,
) {
    val changes: Int get() = sounds.count { !it.unchanged } + projects.count { it.state != ProjectState.SAME }
}

/**
 * Compares a backup with what is on the device (not part of the web
 * version). Sounds are compared by the device's CRC against a CRC of the PCM
 * a restore would actually upload (after resampling); projects by
 * downloading them. Nothing is written.
 */
object BackupDiff {
    private const val PROJECT_WEIGHT = 64 * 1024

    suspend fun compare(
        session: Session,
        pak: Pak,
        slots: List<Int>? = null,
        projects: List<Int>? = null,
        onProgress: (Progress) -> Unit = {},
        signal: CancelSignal? = null,
    ): DiffResult = session.onLoop {
        val slotList = (slots ?: pak.sounds.keys.toList()).filter { pak.sounds.containsKey(it) }.distinct().sorted()
        val projList = (projects ?: pak.projects.keys.toList()).filter { pak.projects.containsKey(it) }.distinct().sorted()

        onProgress(Progress(0.0, "Reading device contents"))
        val onDevice = Device.listSounds(session).associateBy { it.slot }
        val deviceProjects = Device.listProjects(session).map { it.project }.toSet()
        val total = (slotList.size.toDouble() * 1024 + projList.size.toDouble() * PROJECT_WEIGHT).let { if (it == 0.0) 1.0 else it }
        var done = 0.0
        fun report(label: String) = onProgress(Progress(minOf(1.0, done / total), label))

        val sounds = ArrayList<SoundDiff>()
        for (slot in slotList) {
            signal.checkAbort()
            val snd = pak.sounds.getValue(slot)
            report("Sound ${slot.toString().padStart(3, '0')}, ${snd.name}")
            val entry = onDevice[slot]
            if (entry == null) {
                sounds.add(SoundDiff(slot, snd.name, null, SoundState.NOT_ON_DEVICE, emptyList()))
            } else {
                val prepared = Backup.prepareSound(snd)
                val meta = Fs.getMetadata(session, slot).asObject()
                val crc = meta["crc"]?.takeIf { it.isJsNumber }?.numberOrNull
                val state = when {
                    crc != null -> if (crc == Crc32.of(prepared.pcm).toDouble()) SoundState.SAME_AUDIO else SoundState.DIFFERENT_AUDIO
                    entry.size != prepared.pcm.size.toLong() -> SoundState.DIFFERENT_AUDIO
                    else -> SoundState.UNVERIFIED
                }
                // Compare what a restore would write (after clamping) with the device,
                // for the settings the backup carries.
                val frames = Math.floor(prepared.pcm.size / (2 * prepared.channels)).toLong()
                val written = Device.soundMeta(prepared.channels, prepared.sampleRate, prepared.settings, frames)
                val keys = Device.pickSoundSettings(prepared.settings).keys
                val differ = keys.filter { k -> written[k] != null && !sameValue(written[k], meta[k]) }
                sounds.add(SoundDiff(slot, snd.name, entry.name, state, differ))
            }
            done += 1024
        }

        val projectDiffs = ArrayList<ProjectDiff>()
        for (n in projList) {
            signal.checkAbort()
            report("Project ${n.toString().padStart(2, '0')}")
            // Like the backup, try the download even if the device lists no projects.
            val onDeviceTar: ByteArray? = if (deviceProjects.isEmpty() || n in deviceProjects) {
                try {
                    Device.readProject(session, n, signal = signal)
                } catch (e: DeviceError) {
                    null
                } catch (e: CancellationException) {
                    throw e
                }
            } else {
                null
            }
            val state = when {
                onDeviceTar == null || onDeviceTar.isEmpty() -> ProjectState.NOT_ON_DEVICE
                onDeviceTar.contentEquals(pak.projects.getValue(n)) -> ProjectState.SAME
                else -> ProjectState.DIFFERENT
            }
            projectDiffs.add(ProjectDiff(n, state))
            done += PROJECT_WEIGHT
        }

        onProgress(Progress(1.0, "Done"))
        DiffResult(
            sounds = sounds,
            projects = projectDiffs,
            deviceOnlySlots = onDevice.keys.filter { !pak.sounds.containsKey(it) }.sorted(),
            deviceOnlyProjects = deviceProjects.filter { !pak.projects.containsKey(it) }.sorted(),
        )
    }

    /** Equal as JSON values (numbers compare by value: 60 and 60.0 are the same). */
    private fun sameValue(a: JsonElement?, b: JsonElement?): Boolean {
        if (a == null || b == null) return a == b
        return JsJson.stringify(a) == JsJson.stringify(b)
    }
}
