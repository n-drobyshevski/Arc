package dev.arc.ep133.features

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import java.io.File

/**
 * arc's copy of the device's pad sounds, for Live (an addition): one WAV per
 * slot (`s<slot>.wav`) and `index.json` with the name and device size each
 * was read with. A copy counts only while the device still has the same
 * name in that slot. Past [capBytes], the least recently played go first.
 */
class PadSoundCache(private val dir: File, private val capBytes: Long = 256L * 1024 * 1024, private val now: () -> Long = System::currentTimeMillis) {
    private data class Entry(val name: String, val size: Long, val usedAt: Long)

    private val indexFile get() = File(dir, "index.json")
    private var index: MutableMap<Int, Entry>? = null

    private fun file(slot: Int) = File(dir, "s$slot.wav")

    private fun entries(): MutableMap<Int, Entry> = index ?: load().also { index = it }

    private fun load(): MutableMap<Int, Entry> {
        val out = LinkedHashMap<Int, Entry>()
        runCatching {
            val o = Json.parseToJsonElement(indexFile.readText()).jsonObject
            for ((k, v) in o) {
                val slot = k.toIntOrNull() ?: continue
                val e = v as? JsonObject ?: continue
                val name = e["name"]?.jsonPrimitive?.contentOrNull ?: continue
                val size = e["size"]?.jsonPrimitive?.longOrNull ?: continue
                val usedAt = e["usedAt"]?.jsonPrimitive?.longOrNull ?: 0L
                if (file(slot).isFile) out[slot] = Entry(name, size, usedAt)
            }
        }
        return out
    }

    private fun save() {
        val text = buildJsonObject {
            for ((slot, e) in entries()) put(slot.toString(), buildJsonObject {
                put("name", e.name)
                put("size", e.size)
                put("usedAt", e.usedAt)
            })
        }.toString()
        writeAtomically(indexFile, text.toByteArray())
    }

    private fun writeAtomically(f: File, bytes: ByteArray) {
        dir.mkdirs()
        val tmp = File(dir, f.name + ".tmp")
        tmp.writeBytes(bytes)
        if (!tmp.renameTo(f)) {
            tmp.delete()
            throw java.io.IOException("Could not save ${f.name}")
        }
    }

    /** The WAV for a slot, when it was read with this [name]. */
    @Synchronized
    fun get(slot: Int, name: String): ByteArray? {
        val e = entries()[slot] ?: return null
        if (!sameName(e.name, name)) return null
        val bytes = runCatching { file(slot).readBytes() }.getOrNull() ?: return null
        entries()[slot] = e.copy(usedAt = now())
        runCatching { save() }
        return bytes
    }

    /** Whether the copy of a slot is the device's current sound ([size] as the device lists it). */
    @Synchronized
    fun fresh(slot: Int, name: String, size: Long): Boolean =
        entries()[slot]?.let { sameName(it.name, name) && it.size == size } == true

    @Synchronized
    fun put(slot: Int, name: String, size: Long, wav: ByteArray) {
        writeAtomically(file(slot), wav)
        entries()[slot] = Entry(name, size, now())
        evict(keep = slot)
        save()
    }

    /** Space used, in bytes. */
    @Synchronized
    fun bytes(): Long = entries().keys.sumOf { file(it).length() }

    @Synchronized
    fun clear() {
        dir.listFiles()?.forEach { it.delete() }
        index = LinkedHashMap()
    }

    private fun evict(keep: Int) {
        var total = bytes()
        for ((slot, _) in entries().entries.sortedBy { it.value.usedAt }.toList()) {
            if (total <= capBytes) break
            if (slot == keep) continue
            total -= file(slot).length()
            file(slot).delete()
            entries().remove(slot)
        }
    }

    companion object {
        /**
         * Names as the device lists them and as a backup keeps them may differ
         * in case, spacing or a ".wav" ending; those still count as the same.
         */
        fun sameName(a: String, b: String): Boolean = norm(a) == norm(b)

        private fun norm(s: String) = s.trim().lowercase().removeSuffix(".wav").trim()
    }
}
