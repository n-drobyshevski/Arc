package dev.arc.ep133.data

import dev.arc.ep133.features.TakeTrim
import dev.arc.ep133.formats.Wav
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * A take recorded in Live: its file name, when it was made, how long it is
 * (all of it), its size, its sound's shape, and the part its [trim] keeps.
 */
data class TakeInfo(
    val name: String,
    val createdAt: Long,
    val seconds: Double,
    val bytes: Long,
    val frames: Long = 0,
    val rate: Int = 0,
    val channels: Int = 0,
    val trim: TakeTrim? = null,
) {
    /** How long the part SHARE, SAVE and EP send is: the trim's, else all of it. */
    val keptSeconds: Double get() = if (trim != null && rate > 0) trim.frames.toDouble() / rate else seconds
}

/**
 * Live's takes (an addition): WAV files in arc's own storage, named after when
 * they were made (`take-20261005-142301.wav`). The files are the list; a
 * take's trim is a text file beside it (`take-20261005-142301.trim`, see
 * [TakeTrim]), gone with it.
 */
class Takes(private val dir: File) {
    private val stamp get() = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US)

    /** A file for a take made at [now], not yet written. */
    fun newFile(now: Long): File {
        dir.mkdirs()
        val base = "take-" + stamp.format(Date(now))
        var f = File(dir, "$base.wav")
        var n = 2
        while (f.exists()) f = File(dir, "$base-${n++}.wav")
        return f
    }

    fun file(name: String): File = File(dir, File(name).name)

    /** The takes, newest first. */
    fun list(): List<TakeInfo> =
        (dir.listFiles { f -> f.isFile && f.name.startsWith("take-") && f.name.endsWith(".wav") } ?: emptyArray())
            .mapNotNull { f -> info(f) }
            .sortedWith(compareByDescending<TakeInfo> { it.createdAt }.thenByDescending { it.name })

    fun delete(name: String): Boolean {
        trimFile(name).delete()
        return file(name).delete()
    }

    private fun trimFile(name: String): File = File(dir, File(name).name.removeSuffix(".wav") + ".trim")

    /** Keeps [trim] with the take [name] (null: the whole take again). */
    fun setTrim(name: String, trim: TakeTrim?) {
        val f = trimFile(name)
        if (trim == null) f.delete() else f.writeText(trim.text())
    }

    /** A copy of the take [name], made at [now] (so it is the newest), its trim with it. */
    fun duplicate(name: String, now: Long): File {
        val to = newFile(now)
        file(name).copyTo(to)
        trimFile(name).takeIf { it.exists() }?.copyTo(trimFile(to.name))
        return to
    }

    /** The WAV SHARE, SAVE and EP send: the take's trimmed part, else the whole file. */
    fun keptWav(t: TakeInfo): ByteArray {
        val trim = t.trim ?: return file(t.name).readBytes()
        val block = 2 * t.channels
        val pcm = ByteArray((trim.frames * block).toInt())
        RandomAccessFile(file(t.name), "r").use { r ->
            r.seek(44 + trim.start * block)
            r.readFully(pcm)
        }
        return Wav.encode(pcm, t.channels, t.rate)
    }

    private fun info(f: File): TakeInfo? {
        val size = f.length()
        if (size <= 44) return null
        // The rate and channels from the header (the takes are written by arc, so it is the plain 44-byte one).
        // A take cut off by arc being closed mid-recording still says 0 bytes there: it is put right.
        val (channels, rate) = runCatching {
            RandomAccessFile(f, "rw").use { r ->
                val h = ByteArray(44)
                r.readFully(h)
                val bb = ByteBuffer.wrap(h).order(ByteOrder.LITTLE_ENDIAN)
                val ch = bb.getShort(22).toInt() and 0xFFFF
                val rate = bb.getInt(24)
                // Whole frames: SAMPLE's recordings moved in here may be mono.
                val data = if (ch > 0) (size - 44) / (2 * ch) * (2 * ch) else 0L
                if (ch > 0 && rate > 0 && bb.getInt(40).toLong() and 0xFFFFFFFFL != data) {
                    r.seek(0)
                    r.write(Wav.header(data, ch, rate))
                }
                ch to rate
            }
        }.getOrNull() ?: return null
        if (channels <= 0 || rate <= 0) return null
        val made = runCatching { stamp.parse(f.name.removePrefix("take-").take(15))?.time }.getOrNull() ?: f.lastModified()
        val frames = (size - 44) / (2L * channels)
        val trim = trimFile(f.name).takeIf { it.exists() }?.let { runCatching { TakeTrim.parse(it.readText(), frames, rate) }.getOrNull() }
        return TakeInfo(f.name, made, (size - 44) / (2.0 * channels * rate), size, frames, rate, channels, trim)
    }
}
