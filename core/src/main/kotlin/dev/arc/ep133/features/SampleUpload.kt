package dev.arc.ep133.features

import dev.arc.ep133.backup.Backup
import dev.arc.ep133.backup.Pak
import dev.arc.ep133.backup.PakSound
import dev.arc.ep133.backup.Progress
import dev.arc.ep133.backup.RestoreResult
import dev.arc.ep133.protocol.CancelSignal
import dev.arc.ep133.protocol.Device
import dev.arc.ep133.protocol.Session
import kotlinx.serialization.json.JsonObject

/** A WAV file to load into a sample slot. */
class UploadItem(val slot: Int, val name: String, val wav: ByteArray)

class UploadError(message: String) : Exception(message)

/**
 * Loading WAV files from the phone into sample slots (not part of the web
 * version). It goes through exactly the restore path: the files become a
 * backup in memory with only these sounds and no projects, and restorePak
 * writes it. So uploads get the same free-space check, resampling above
 * 46875 Hz, CRC verification with one retry, progress and cancel.
 */
object SampleUpload {
    const val FIRST_SLOT = 1
    const val LAST_SLOT = 999

    /** The sound name a file gets on the device: its file name, cleaned like any upload. */
    fun nameFor(fileName: String): String = Device.cleanSoundName(fileName)

    /** The first [count] free slots, lowest first (fewer if the device is that full). */
    fun suggestSlots(occupied: Set<Int>, count: Int, taken: Set<Int> = emptySet()): List<Int> =
        (FIRST_SLOT..LAST_SLOT).asSequence().filter { it !in occupied && it !in taken }.take(count).toList()

    /** The next free slot not in [taken], or null when every slot is used. */
    fun nextFree(occupied: Set<Int>, taken: Set<Int>): Int? = suggestSlots(occupied, 1, taken).firstOrNull()

    fun validate(items: List<UploadItem>) {
        for (i in items) {
            if (i.slot !in FIRST_SLOT..LAST_SLOT) throw UploadError("Slot ${i.slot} doesn't exist. Slots go from 1 to 999.")
        }
        val dup = items.groupBy { it.slot }.entries.firstOrNull { it.value.size > 1 }
        if (dup != null) throw UploadError("Two files are set to slot ${dup.key}. Give each file its own slot.")
    }

    /** The in-memory backup an upload is restored from. */
    fun asPak(items: List<UploadItem>): Pak {
        val sounds = LinkedHashMap<Int, PakSound>()
        for (i in items) sounds[i.slot] = PakSound(i.slot, i.name, i.wav, null)
        return Pak(JsonObject(emptyMap()), JsonObject(emptyMap()), sounds, LinkedHashMap())
    }

    suspend fun upload(
        session: Session,
        items: List<UploadItem>,
        onProgress: (Progress) -> Unit = {},
        signal: CancelSignal? = null,
    ): RestoreResult {
        validate(items)
        return Backup.restorePak(session, asPak(items), slots = items.map { it.slot }, projects = emptyList(), onProgress = onProgress, signal = signal)
    }
}
