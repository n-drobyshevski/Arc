package dev.arc.ep133.data

import com.sun.net.httpserver.HttpServer
import dev.arc.ep133.protocol.CancelSignal
import dev.arc.ep133.protocol.CancelledError
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.io.IOException
import java.net.InetSocketAddress

class FactoryDownloadTest {
    private val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
        createContext("/pak") { ex ->
            val body = ByteArray(200_000) { (it % 251).toByte() }
            ex.sendResponseHeaders(200, body.size.toLong())
            ex.responseBody.use { it.write(body) }
        }
        // Sends a little, stalls, then ends the connection short.
        createContext("/stall") { ex ->
            ex.sendResponseHeaders(200, 1_000_000)
            runCatching {
                ex.responseBody.write(ByteArray(1000))
                ex.responseBody.flush()
                Thread.sleep(2_000)
            }
            ex.close()
        }
        // Promises more than it sends.
        createContext("/short") { ex ->
            ex.sendResponseHeaders(200, 5000)
            runCatching { ex.responseBody.write(ByteArray(1000)) }
            ex.close()
        }
        createContext("/missing") { ex ->
            ex.sendResponseHeaders(404, -1)
            ex.close()
        }
        executor = java.util.concurrent.Executors.newCachedThreadPool()
        start()
    }
    private val origin = "http://127.0.0.1:${server.address.port}"

    @AfterEach
    fun stop() = server.stop(0)

    @Test
    fun `the pack arrives whole, its progress counted against the length`() {
        val seen = mutableListOf<Pair<Long, Long?>>()
        val bytes = FactoryDownload.bytes("/pak", CancelSignal(), origin) { done, total -> seen += done to total }
        assertArrayEquals(ByteArray(200_000) { (it % 251).toByte() }, bytes)
        assertEquals(200_000L to 200_000L, seen.last())
        assertTrue(seen.zipWithNext().all { (a, b) -> a.first < b.first })
    }

    // How soon a stalled read lets go is the platform's: Android's HttpURLConnection (OkHttp) closes
    // the socket on disconnect, the JDK's waits for the server. Either way it ends as a cancel, never
    // as an error or a short pack.
    @Test
    fun `a cancel during a stalled read ends as a cancel`() {
        val signal = CancelSignal()
        Thread {
            Thread.sleep(300)
            signal.cancel()
        }.start()
        assertThrows<CancelledError> { FactoryDownload.bytes("/stall", signal, origin) { _, _ -> } }
    }

    @Test
    fun `a pack cut short is an error, not a smaller pack`() {
        val e = assertThrows<IOException> { FactoryDownload.bytes("/short", CancelSignal(), origin) { _, _ -> } }
        assertEquals("The download stopped at 1000 of 5000 bytes", e.message)
    }

    @Test
    fun `a server error is an error, not a cancel`() {
        val e = assertThrows<IOException> { FactoryDownload.text("/missing", CancelSignal(), origin) }
        assertEquals("HTTP 404", e.message)
    }
}
