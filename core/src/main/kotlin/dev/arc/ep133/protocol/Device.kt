package dev.arc.ep133.protocol

import dev.arc.ep133.formats.Crc32
import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.asObject
import dev.arc.ep133.formats.isJsNumber
import dev.arc.ep133.formats.jsNum
import dev.arc.ep133.formats.jsNumOr
import dev.arc.ep133.formats.jsStringOr
import dev.arc.ep133.formats.numberOrNull
import dev.arc.ep133.util.utf8Length
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// EP-133 K.O. II filesystem layout and high-level operations (device.js).
//
//   /sounds    node 1000, children are sample slots 1..999 (raw s16le PCM + JSON metadata)
//   /projects  node 2000, project N lives at 3000 + (N-1)*1000 and reads/writes as a TAR

data class Storage(val total: Double, val free: Double, val used: Double)

data class SoundEntry(val slot: Int, val name: String, val size: Long)

data class ProjectEntry(val project: Int, val node: Int, val name: String, val size: Long)

/**
 * A sound read from, or about to be written to, the device.
 * [channels] and [sampleRate] are JS numbers (`Number(meta.x) || default`) and stay
 * Doubles until they are written into a WAV header or metadata.
 */
class SoundData(
    val slot: Int,
    val name: String,
    val channels: Double,
    val sampleRate: Double,
    val settings: JsonObject,
    val pcm: ByteArray,
)

object Device {
    const val SOUNDS_NODE = 1000
    const val PROJECTS_NODE = 2000
    const val MAX_SAMPLE_RATE = 46875
    const val MAX_SOUND_NAME = 20

    fun projectNode(n: Int): Int = 3000 + (n - 1) * 1000

    fun projectFromNode(node: Int): Int? {
        if (node < 3000 || (node - 3000) % 1000 != 0) return null
        val n = (node - 3000) / 1000 + 1
        return if (n in 1..99) n else null
    }

    /** Per-sound settings worth carrying through a backup. */
    val SOUND_KEYS = listOf(
        "sound.playmode",
        "sound.rootnote",
        "sound.pitch",
        "sound.pan",
        "sound.amplitude",
        "sound.loopstart",
        "sound.loopend",
        "sound.bpm",
        "time.mode",
        "envelope.attack",
        "envelope.release",
    )

    private val DEFAULT_SOUND: List<Pair<String, JsonElement>> = listOf(
        "sound.playmode" to JsonPrimitive("oneshot"),
        "sound.rootnote" to JsJson.number(60),
        "sound.pitch" to JsJson.number(0),
        "sound.pan" to JsJson.number(0),
        "sound.amplitude" to JsJson.number(100),
        "envelope.attack" to JsJson.number(0),
        "envelope.release" to JsJson.number(255),
        "time.mode" to JsonPrimitive("off"),
    )

    fun pickSoundSettings(meta: JsonObject?): JsonObject {
        val out = LinkedHashMap<String, JsonElement>()
        if (meta != null) for (k in SOUND_KEYS) {
            val v = meta[k]
            if (v != null && v !is JsonNull) out[k] = v
        }
        return JsonObject(out)
    }

    suspend fun getStorage(session: Session): Storage {
        val m = Fs.getMetadata(session, SOUNDS_NODE).asObject()
        val total = m["max_capacity"].jsNumOr(0.0)
        val free = m["free_space_in_bytes"].jsNumOr(0.0)
        return Storage(total, free, maxOf(0.0, total - free))
    }

    suspend fun listSounds(session: Session): List<SoundEntry> =
        Fs.listNode(session, SOUNDS_NODE)
            .filter { !it.isDir && it.node in 1..999 }
            .map { SoundEntry(it.node, it.name, it.size) }
            .sortedBy { it.slot }

    suspend fun listProjects(session: Session): List<ProjectEntry> {
        val out = ArrayList<ProjectEntry>()
        for (e in Fs.listNode(session, PROJECTS_NODE)) {
            val n = projectFromNode(e.node)
            if (n != null) out.add(ProjectEntry(n, e.node, e.name, e.size))
        }
        return out.sortedBy { it.project }
    }

    suspend fun readSound(
        session: Session,
        slot: Int,
        onProgress: ((Long, Long) -> Unit)? = null,
        signal: CancelSignal? = null,
    ): SoundData {
        val meta = Fs.getMetadata(session, slot).asObject()
        val pcm = Fs.download(session, slot, onProgress, signal)
        return SoundData(
            slot = slot,
            name = meta["name"].jsStringOr("sound $slot"),
            channels = meta["channels"].jsNumOr(1.0),
            sampleRate = meta["samplerate"].jsNumOr(MAX_SAMPLE_RATE.toDouble()),
            settings = pickSoundSettings(meta),
            pcm = pcm,
        )
    }

    suspend fun readProject(
        session: Session,
        n: Int,
        onProgress: ((Long, Long) -> Unit)? = null,
        signal: CancelSignal? = null,
    ): ByteArray = Fs.download(session, projectNode(n), onProgress, signal)

    /** Metadata sent with a sound upload (`soundMeta` in device.js). */
    fun soundMeta(channels: Double, sampleRate: Double, settings: JsonObject?, frames: Long): JsonObject {
        // {...DEFAULT_SOUND, ...pickSoundSettings(settings), channels, samplerate}
        val meta = LinkedHashMap<String, JsonElement>()
        for ((k, v) in DEFAULT_SOUND) meta[k] = v
        meta.putAll(pickSoundSettings(settings))
        meta["channels"] = JsJson.number(channels)
        meta["samplerate"] = JsJson.number(sampleRate)
        // Loop points beyond the end of the sample confuse the device.
        // (`x != null && x > frames - 1` uses JS relational comparison, so
        // numeric strings compare as numbers and anything else is false.)
        val last = (frames - 1).toDouble()
        if (gtLoose(meta["sound.loopend"], last)) meta["sound.loopend"] = JsJson.number(last)
        if (gtLoose(meta["sound.loopstart"], last)) meta["sound.loopstart"] = JsJson.number(0)
        // Stay under the 320 byte metadata page by dropping optional keys.
        val optional = ArrayDeque(listOf("sound.bpm", "sound.loopstart", "sound.loopend", "time.mode", "sound.pan"))
        while (utf8Length(JsJson.stringify(JsonObject(meta))) > 320 && optional.isNotEmpty()) {
            meta.remove(optional.removeFirst())
        }
        return JsonObject(meta)
    }

    /** `v != null && v > n` with JS semantics for a JSON value against a number. */
    private fun gtLoose(v: JsonElement?, n: Double): Boolean {
        if (v == null || v is JsonNull) return false
        if (v is JsonPrimitive || v is kotlinx.serialization.json.JsonArray) {
            val x = v.jsNum()
            return !x.isNaN() && x > n
        }
        return false
    }

    fun cleanSoundName(name: String?): String {
        var s = if (name.isNullOrEmpty()) "sound" else name
        // /\.wav$/i, written out because regex case-insensitivity differs between JS, Java and ICU.
        if (s.length >= 4 && s.substring(s.length - 4).let { it[0] == '.' && it.substring(1).lowercase() == "wav" && it.all { c -> c.code < 128 } }) {
            s = s.substring(0, s.length - 4)
        }
        s = s.filter { it.code in 0x20..0x7E }
        s = s.trim(' ')
        s = s.take(MAX_SOUND_NAME)
        return s.ifEmpty { "sound" }
    }

    /** Upload PCM (s16le interleaved) into a sample slot and verify it landed intact. */
    suspend fun writeSound(
        session: Session,
        sound: SoundData,
        onProgress: ((Long, Long) -> Unit)? = null,
    ) {
        if (sound.pcm.isEmpty()) throw DeviceError("Sound ${sound.slot} is empty")
        val frames = Math.floor(sound.pcm.size / (2 * sound.channels)).toLong()
        val meta = soundMeta(sound.channels, sound.sampleRate, sound.settings, frames)
        Fs.upload(
            session,
            node = sound.slot,
            parent = SOUNDS_NODE,
            flags = Fs.PUT_FLAGS_SOUND,
            name = cleanSoundName(sound.name),
            meta = meta,
            data = sound.pcm,
            onProgress = onProgress,
            barrier = { Fs.setMetadata(session, sound.slot, meta, timeout = 180_000, progress = true) },
        )
        // Sound uploads are verified by comparing the device's crc with a CRC32
        // of the PCM. Only when the device reports one; JS compares with !==, so
        // a crc that is not a number never matches.
        val after = Fs.getMetadata(session, sound.slot).asObject()
        val crc = after["crc"]
        if (crc != null && crc !is JsonNull) {
            val same = crc.isJsNumber && crc.numberOrNull == Crc32.of(sound.pcm).toDouble()
            if (!same) throw DeviceError("Sound ${sound.slot} did not verify after upload (checksum mismatch)")
        }
    }

    /** Upload a project TAR and make the device reload it. */
    suspend fun writeProject(
        session: Session,
        n: Int,
        tar: ByteArray,
        onProgress: ((Long, Long) -> Unit)? = null,
    ) {
        val node = projectNode(n)
        Fs.upload(
            session,
            node = node,
            parent = PROJECTS_NODE,
            flags = Fs.PUT_FLAGS_DIR,
            name = n.toString().padStart(2, '0'),
            data = tar,
            onProgress = onProgress,
            barrier = { Fs.listPage(session, PROJECTS_NODE, 0, timeout = 180_000, progress = true) },
        )
        // The device keeps the old project in memory if it is the active one.
        // Switch away and back so the new data is actually loaded.
        try {
            val projects = listProjects(session)
            val other = projects.firstOrNull { it.project != n }
            if (other != null) {
                Fs.setMetadata(session, PROJECTS_NODE, JsonObject(mapOf("active" to JsJson.number(other.node))))
                delay(200)
            }
            Fs.setMetadata(session, PROJECTS_NODE, JsonObject(mapOf("active" to JsJson.number(node))))
        } catch (e: Throwable) {
            Fs.rethrowIfCancelled(e)
            // Non-fatal: the project is written, it loads next time it is selected.
        }
    }
}
