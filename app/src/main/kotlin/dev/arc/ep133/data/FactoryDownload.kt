package dev.arc.ep133.data

import dev.arc.ep133.features.FactorySounds
import dev.arc.ep133.protocol.CancelSignal
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * teenage engineering's site, for the factory sounds (FactorySounds): paths on
 * its origin read over HTTPS, nothing sent but the request. A cancel is
 * checked between chunks of the pack. Blocking: call it off the main thread.
 * (The web version reads the same paths through arc's own origin, as their
 * server sends no CORS headers.)
 */
object FactoryDownload {
    private const val TIMEOUT_MS = 20_000

    fun text(path: String, signal: CancelSignal): String = get(path, signal) { c ->
        c.inputStream.use { it.readBytes() }.toString(Charsets.UTF_8)
    }

    /** The file, with its progress as it arrives ([total] null when the server doesn't say). */
    fun bytes(path: String, signal: CancelSignal, onProgress: (done: Long, total: Long?) -> Unit): ByteArray = get(path, signal) { c ->
        val total = c.contentLengthLong.takeIf { it > 0 && c.contentEncoding == null }
        val out = ByteArrayOutputStream(total?.toInt() ?: FactorySounds.KNOWN_SIZE.toInt())
        val buf = ByteArray(64 * 1024)
        var done = 0L
        c.inputStream.use { input ->
            while (true) {
                signal.check()
                val n = input.read(buf)
                if (n < 0) break
                out.write(buf, 0, n)
                done += n
                onProgress(done, total)
            }
        }
        out.toByteArray()
    }

    private fun <T> get(path: String, signal: CancelSignal, read: (HttpURLConnection) -> T): T {
        signal.check()
        val c = URL(FactorySounds.ORIGIN + path).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = TIMEOUT_MS
            c.readTimeout = TIMEOUT_MS
            c.useCaches = false
            c.instanceFollowRedirects = true
            if (c.responseCode !in 200..299) throw IOException("HTTP ${c.responseCode}")
            return read(c)
        } finally {
            c.disconnect()
        }
    }
}
