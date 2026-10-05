package dev.arc.ep133.data

import dev.arc.ep133.formats.Wav
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** A take recorded in Live: its file name, when it was made and how long it is. */
data class TakeInfo(val name: String, val createdAt: Long, val seconds: Double, val bytes: Long)

/**
 * Live's takes (an addition): WAV files in arc's own storage, named after when
 * they were made (`take-20261005-142301.wav`). The files are the list; there is
 * nothing else to keep in step.
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

    fun delete(name: String): Boolean = file(name).delete()

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
                val data = (size - 44) / 4 * 4
                if (ch > 0 && rate > 0 && bb.getInt(40).toLong() and 0xFFFFFFFFL != data) {
                    r.seek(0)
                    r.write(Wav.header(data, ch, rate))
                }
                ch to rate
            }
        }.getOrNull() ?: return null
        if (channels <= 0 || rate <= 0) return null
        val made = runCatching { stamp.parse(f.name.removePrefix("take-").take(15))?.time }.getOrNull() ?: f.lastModified()
        return TakeInfo(f.name, made, (size - 44) / (2.0 * channels * rate), size)
    }
}
