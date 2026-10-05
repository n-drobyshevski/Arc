package dev.arc.ep133.backup

import dev.arc.ep133.Arc
import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.Wav
import dev.arc.ep133.formats.Zip
import dev.arc.ep133.formats.ZipEntryData
import dev.arc.ep133.formats.asObject
import dev.arc.ep133.formats.isJsNumber
import dev.arc.ep133.formats.numberOrNull
import dev.arc.ep133.protocol.CancelSignal
import dev.arc.ep133.protocol.Device
import dev.arc.ep133.protocol.Fs
import dev.arc.ep133.protocol.ProjectEntry
import dev.arc.ep133.protocol.Session
import dev.arc.ep133.protocol.SoundData
import dev.arc.ep133.protocol.checkAbort
import dev.arc.ep133.util.encodeUtf8
import dev.arc.ep133.util.jsRound
import dev.arc.ep133.util.jsToFixed
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

// Device ⇄ .pak backup and restore (backup.js).
//
// A backup is a ZIP laid out like the official Sample Tool's .pak:
//   /meta.json
//   /sounds/NNN name.wav
//   /projects/PNN.tar
// plus /arc.json with per-sound settings and library info, which the
// official tool ignores.

/** Progress of a backup or restore: a fraction in 0..1 and what is being worked on. */
data class Progress(val fraction: Double, val label: String)

data class SummaryDevice(val product: String, val sku: String, val serial: String, val osVersion: String)

data class BackupSummary(
    val createdAt: Long,
    val device: SummaryDevice,
    val soundCount: Int,
    val projectCount: Int,
    val projects: List<Int>,
)

class BackupResult(val bytes: ByteArray, val summary: BackupSummary)

data class RestoreResult(val sounds: Int, val projects: Int)

/** A plain `Error` in the JS (not a device error), e.g. "Not enough room on the device". */
class RestoreError(message: String) : Exception(message)

object Backup {
    const val APP_NAME = Arc.APP_NAME
    const val APP_VERSION = Arc.APP_VERSION
    private const val PROJECT_WEIGHT = 64 * 1024

    internal fun pad3(n: Int) = n.toString().padStart(3, '0')
    internal fun pad2(n: Int) = n.toString().padStart(2, '0')

    private val UNSAFE = Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]")
    internal fun safeName(s: String) = s.replace(UNSAFE, "_").take(40)

    /** The .pak's /meta.json, as backup.js writes it. */
    fun metaJson(product: String, sku: String, osVersion: String, createdAt: Long, appVersion: String = APP_VERSION): JsonObject = JsonObject(
        linkedMapOf(
            "info" to JsonPrimitive("teenage engineering - pak file"),
            "pak_version" to JsJson.number(1),
            "pak_type" to JsonPrimitive("user"),
            "pak_release" to JsonPrimitive("1.2.0"),
            "device_name" to JsonPrimitive(product),
            "device_sku" to JsonPrimitive(sku),
            "device_version" to JsonPrimitive(osVersion),
            "generated_at" to JsonPrimitive(isoString(createdAt)),
            "author" to JsonPrimitive("$APP_NAME $appVersion"),
        ),
    )

    /** `Date.prototype.toISOString()`: always milliseconds and Z. */
    private val ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)
    fun isoString(ms: Long): String = ISO.format(Instant.ofEpochMilli(ms))

    /**
     * Pull every sound and project off the device.
     * [clock] and [zone] are only there so tests can pin the timestamp.
     */
    suspend fun backupDevice(
        session: Session,
        onProgress: (Progress) -> Unit = {},
        signal: CancelSignal? = null,
        clock: () -> Long = System::currentTimeMillis,
        zone: ZoneId = ZoneId.systemDefault(),
        /** The version named in meta.json's author; tests pass the web version's to compare byte for byte. */
        appVersion: String = APP_VERSION,
    ): BackupResult = session.onLoop {
        val info = session.info
        onProgress(Progress(0.0, "Reading device contents"))
        val sounds = Device.listSounds(session)
        var projects = Device.listProjects(session)
        // Some firmware lists no projects; then try the first nine directly and
        // keep whatever downloads.
        val probing = projects.isEmpty()
        if (probing) projects = (1..9).map { ProjectEntry(it, Device.projectNode(it), "", 0) }

        val totalWeight = (sounds.sumOf { maxOf(it.size, 1024L) } + projects.size.toLong() * PROJECT_WEIGHT)
            .toDouble().let { if (it == 0.0) 1.0 else it }
        var doneWeight = 0.0
        fun report(label: String, partial: Double = 0.0) =
            onProgress(Progress(minOf(1.0, (doneWeight + partial) / totalWeight), label))

        val entries = ArrayList<ZipEntryData>()
        val soundInfo = LinkedHashMap<String, JsonElement>()
        for (s in sounds) {
            signal.checkAbort()
            val weight = maxOf(s.size, 1024L).toDouble()
            val label = "Sound ${pad3(s.slot)}, ${s.name}"
            report(label)
            val snd = Device.readSound(
                session,
                s.slot,
                signal = signal,
                onProgress = { got, total -> report(label, if (total != 0L) got.toDouble() / total * weight else 0.0) },
            )
            entries.add(
                ZipEntryData(
                    "/sounds/${pad3(s.slot)} ${safeName(snd.name)}.wav",
                    Wav.encode(snd.pcm, snd.channels, snd.sampleRate),
                ),
            )
            soundInfo[s.slot.toString()] = JsonObject(linkedMapOf("name" to snd.nameValue, "settings" to snd.settings))
            doneWeight += weight
        }

        val projectNums = ArrayList<Int>()
        for (p in projects) {
            signal.checkAbort()
            val label = "Project ${pad2(p.project)}"
            report(label)
            try {
                val tar = Device.readProject(session, p.project, signal = signal)
                if (tar.isNotEmpty()) {
                    entries.add(ZipEntryData("/projects/P${pad2(p.project)}.tar", tar))
                    projectNums.add(p.project)
                }
            } catch (err: Throwable) {
                if (err is CancellationException) throw err
                if (!probing) throw err
            }
            doneWeight += PROJECT_WEIGHT
        }

        val createdAt = clock()
        val meta = metaJson(
            product = info?.product.orEmpty().ifEmpty { "EP-133" },
            sku = info?.sku.orEmpty(),
            osVersion = info?.osVersion.orEmpty(),
            createdAt = createdAt,
            appVersion = appVersion,
        )
        val sidecar = JsonObject(
            linkedMapOf(
                "app" to JsonPrimitive(APP_NAME),
                "version" to JsJson.number(1),
                "sounds" to JsonObject(soundInfo),
            ),
        )
        entries.add(0, ZipEntryData("/arc.json", encodeUtf8(JsJson.stringify(sidecar))))
        entries.add(0, ZipEntryData("/meta.json", encodeUtf8(JsJson.stringify(meta, "  "))))
        onProgress(Progress(1.0, "Packing backup"))
        val bytes = Zip.write(entries, createdAt, zone)
        BackupResult(
            bytes,
            BackupSummary(
                createdAt = createdAt,
                device = SummaryDevice(
                    product = info?.product.orEmpty().ifEmpty { "EP-133" },
                    sku = info?.sku.orEmpty(),
                    serial = info?.serial.orEmpty(),
                    osVersion = info?.osVersion.orEmpty(),
                ),
                soundCount = sounds.size,
                projectCount = projectNums.size,
                projects = projectNums,
            ),
        )
    }

    /** Decode a backed-up WAV into what the device takes: s16 PCM at 46875 Hz or below. */
    fun prepareSound(snd: PakSound): SoundData {
        val wav = Wav.decode(snd.wav)
        val rate = minOf(wav.sampleRate, Device.MAX_SAMPLE_RATE.toLong())
        val pcm = Wav.resampleS16(wav.pcm, wav.channels, wav.sampleRate, rate)
        // {...(wav.embedded ?? {}), ...(snd.settings ?? {})}
        val settings = LinkedHashMap<String, JsonElement>()
        wav.embedded?.let { settings.putAll(it) }
        (snd.settings as? JsonObject)?.let { settings.putAll(it) }
        if (rate != wav.sampleRate) {
            // Loop points are frame positions, so they scale with the sample rate.
            val k = rate.toDouble() / wav.sampleRate
            for (key in listOf("sound.loopstart", "sound.loopend")) {
                val v = settings[key]
                if (v != null && v.isJsNumber) settings[key] = JsJson.number(jsRound(v.numberOrNull!! * k))
            }
        }
        return SoundData(snd.slot, snd.name, wav.channels.toDouble(), rate.toDouble(), JsonObject(settings), pcm)
    }

    /**
     * Write a .pak (or a subset of it) back to the device.
     * [slots] and [projects] default to everything in the file.
     */
    suspend fun restorePak(
        session: Session,
        pak: Pak,
        slots: List<Int>? = null,
        projects: List<Int>? = null,
        onProgress: (Progress) -> Unit = {},
        signal: CancelSignal? = null,
    ): RestoreResult = session.onLoop {
        val slotList = (slots ?: pak.sounds.keys.toList()).filter { pak.sounds.containsKey(it) }.sorted()
        val projList = (projects ?: pak.projects.keys.toList()).filter { pak.projects.containsKey(it) }.sorted()

        onProgress(Progress(0.0, "Checking space on device"))
        val prepared = slotList.map { prepareSound(pak.sounds.getValue(it)) }
        val needed = prepared.sumOf { it.pcm.size.toLong() }
        // Restore checks free space before writing anything. Sounds about to be
        // overwritten free their space, so they count as available.
        val storage = Device.getStorage(session)
        if (storage.total != 0.0) {
            val onDevice = Device.listSounds(session)
            val reclaim = onDevice.filter { it.slot in slotList }.sumOf { it.size }
            if (needed > storage.free + reclaim) {
                fun mb(b: Double) = jsToFixed(b / 1048576, 1)
                throw RestoreError(
                    "Not enough room on the device: this restore needs ${mb(needed.toDouble())} MB, " +
                        "${mb(storage.free + reclaim)} MB is available. Delete some samples on the device or restore fewer sounds.",
                )
            }
        }

        val active: JsonElement? = try {
            Fs.getMetadata(session, Device.PROJECTS_NODE).asObject()["active"]
        } catch (e: Throwable) {
            if (e is CancellationException) throw e
            null
        }

        val totalWeight = (needed + projList.size.toLong() * PROJECT_WEIGHT).toDouble().let { if (it == 0.0) 1.0 else it }
        var doneWeight = 0.0
        fun report(label: String, partial: Double = 0.0) =
            onProgress(Progress(minOf(1.0, (doneWeight + partial) / totalWeight), label))

        for (snd in prepared) {
            signal.checkAbort()
            val label = "Sound ${pad3(snd.slot)}, ${snd.name}"
            report(label)
            var lastErr: Throwable? = null
            // A sound whose checksum does not match is uploaded once more.
            for (attempt in 0 until 2) {
                try {
                    Device.writeSound(session, snd, onProgress = { got, _ -> report(label, got.toDouble()) })
                    lastErr = null
                    break
                } catch (err: Throwable) {
                    if (err is CancellationException) throw err
                    lastErr = err
                    if (err.message?.contains("did not verify") != true) break
                    report("$label, retrying")
                }
            }
            lastErr?.let { throw it }
            doneWeight += snd.pcm.size
        }

        for (n in projList) {
            signal.checkAbort()
            report("Project ${pad2(n)}")
            Device.writeProject(session, n, pak.projects.getValue(n))
            doneWeight += PROJECT_WEIGHT
        }

        // Project uploads switch the active project; put back the one that was active.
        if (projList.isNotEmpty() && active != null && active.isJsNumber) {
            try {
                Fs.setMetadata(session, Device.PROJECTS_NODE, JsonObject(mapOf("active" to active)))
            } catch (e: Throwable) {
                if (e is CancellationException) throw e
            }
        }
        onProgress(Progress(1.0, "Done"))
        RestoreResult(slotList.size, projList.size)
    }
}
