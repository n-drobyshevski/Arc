package dev.arc.ep133.data

import dev.arc.ep133.features.FactorySounds
import dev.arc.ep133.protocol.CancelSignal
import dev.arc.ep133.protocol.CancelledError
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * teenage engineering's site, for the factory sounds (FactorySounds): paths on
 * its origin read over HTTPS, nothing sent but the request. A cancel closes
 * the connection at once (a stalled read or connect would otherwise wait out
 * its timeout), and the read that fails then throws [CancelledError].
 * Blocking: call it off the main thread.
 * (The web version reads the same paths through arc's own origin, as their
 * server sends no CORS headers.)
 */
object FactoryDownload {
    private const val TIMEOUT_MS = 20_000
    private const val CANCEL_POLL_MS = 100L

    fun text(path: String, signal: CancelSignal, origin: String = FactorySounds.ORIGIN): String = get(origin + path, signal) { c ->
        c.inputStream.use { it.readBytes() }.toString(Charsets.UTF_8)
    }

    /** The file, with its progress as it arrives ([total] null when the server doesn't say). [origin]: tests serve their own. */
    fun bytes(
        path: String,
        signal: CancelSignal,
        origin: String = FactorySounds.ORIGIN,
        onProgress: (done: Long, total: Long?) -> Unit,
    ): ByteArray = get(origin + path, signal) { c ->
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
        // A closed connection reads as the end: a cancel, or a server that stopped short.
        signal.check()
        if (total != null && done != total) throw IOException("The download stopped at $done of $total bytes")
        out.toByteArray()
    }

    private fun <T> get(url: String, signal: CancelSignal, read: (HttpURLConnection) -> T): T {
        signal.check()
        val c = URL(url).openConnection() as HttpURLConnection
        // CancelSignal is a flag: a small watcher turns it into a closed connection.
        val watcher = Thread {
            try {
                while (!signal.isCancelled) Thread.sleep(CANCEL_POLL_MS)
                c.disconnect()
            } catch (_: InterruptedException) {
                // The request ended first.
            }
        }.apply { isDaemon = true; start() }
        try {
            c.connectTimeout = TIMEOUT_MS
            c.readTimeout = TIMEOUT_MS
            c.useCaches = false
            c.instanceFollowRedirects = true
            if (c.responseCode !in 200..299) throw IOException("HTTP ${c.responseCode}")
            return read(c)
        } catch (e: IOException) {
            if (signal.isCancelled) throw CancelledError()
            // Offline, no DNS, nothing answering: say so rather than the socket's words.
            if (e is java.net.UnknownHostException || e is java.net.ConnectException || e is java.net.NoRouteToHostException) {
                throw IOException(dev.arc.ep133.text.FeatureText.FACTORY_UNREACHABLE, e)
            }
            throw e
        } finally {
            watcher.interrupt()
            c.disconnect()
        }
    }
}
