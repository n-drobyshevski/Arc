package dev.arc.ep133.audio

import dev.arc.ep133.formats.Wav
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.RandomAccessFile
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.LinkedBlockingQueue

/**
 * Writes a take to [file] as it is recorded (an addition), off the audio
 * thread: [write] only copies the burst into a pooled buffer and queues it, and
 * a thread of its own writes the file. [finish] ends it with the frames to keep
 * (the silence after the last sound is cut off) and the right header; [onDone]
 * gets the file, or null when nothing was kept or writing failed.
 */
class TakeWriter(
    private val file: File,
    private val rate: Int,
    private val onDone: (file: File?, frames: Long, error: String?) -> Unit,
) {
    private class Chunk(size: Int) {
        val data = ShortArray(size)
        var shorts = 0
        /** The end marker, with the frames to keep. */
        var end = -1L
    }

    private val free = ArrayBlockingQueue<Chunk>(POOL)
    private val full = LinkedBlockingQueue<Chunk>()
    @Volatile private var failed = false

    init {
        repeat(16) { free.offer(Chunk(CHUNK_SHORTS)) }
        val thread = Thread({ run() }, "arc-take-writer")
        thread.isDaemon = true
        thread.start()
    }

    /** Queues [frames] stereo frames of [out] from frame [from]. Audio thread. */
    fun write(out: ShortArray, from: Int, frames: Int) {
        if (failed || frames <= 0) return
        val n = frames * 2
        val c = free.poll()?.takeIf { it.data.size >= n } ?: Chunk(maxOf(n, CHUNK_SHORTS))
        System.arraycopy(out, from * 2, c.data, 0, n)
        c.shorts = n
        c.end = -1L
        full.add(c)
    }

    /** Ends the take, keeping its first [keepFrames] frames. Audio thread. */
    fun finish(keepFrames: Long) {
        full.add(Chunk(0).also { it.end = keepFrames })
    }

    private fun run() {
        var error: String? = null
        var keep = 0L
        val bytes = ByteArray(CHUNK_SHORTS * 2)
        try {
            file.parentFile?.mkdirs()
            BufferedOutputStream(FileOutputStream(file), 64 * 1024).use { os ->
                os.write(Wav.header(0, 2, rate))
                while (true) {
                    val c = full.take()
                    if (c.end >= 0) {
                        keep = c.end
                        break
                    }
                    if (!failed) {
                        val b = if (bytes.size >= c.shorts * 2) bytes else ByteArray(c.shorts * 2)
                        for (i in 0 until c.shorts) {
                            val s = c.data[i].toInt()
                            b[2 * i] = s.toByte()
                            b[2 * i + 1] = (s shr 8).toByte()
                        }
                        try {
                            os.write(b, 0, c.shorts * 2)
                        } catch (e: IOException) {
                            failed = true
                            error = e.message ?: e.toString()
                        }
                    }
                    if (c.data.size == CHUNK_SHORTS) free.offer(c)
                }
            }
            if (error == null && keep > 0) {
                val data = keep * 4
                RandomAccessFile(file, "rw").use { f ->
                    f.setLength(44 + data)
                    f.seek(0)
                    f.write(Wav.header(data, 2, rate))
                }
            }
        } catch (e: IOException) {
            error = e.message ?: e.toString()
        }
        if (error != null || keep <= 0) {
            file.delete()
            onDone(null, 0, error)
        } else {
            onDone(file, keep, null)
        }
    }

    private companion object {
        /** Enough pooled buffers for a few seconds of bursts. */
        const val POOL = 512
        const val CHUNK_SHORTS = 4096
    }
}
