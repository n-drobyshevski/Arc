package dev.arc.ep133.data

import com.sun.net.httpserver.HttpServer
import dev.arc.ep133.features.FactoryKit
import dev.arc.ep133.features.FactorySounds
import dev.arc.ep133.formats.Wav
import dev.arc.ep133.formats.Zip
import dev.arc.ep133.formats.ZipEntryData
import dev.arc.ep133.protocol.CancelSignal
import dev.arc.ep133.protocol.CancelledError
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.io.IOException
import java.net.InetSocketAddress

class FactoryDownloadTest {
    /** A small factory pack of [model], zipped in a folder as the EP-40's is, with macOS's forks beside it. */
    private fun factoryPak(model: String): ByteArray {
        val top = "factory-content"
        val meta = """{"pak_type":"factory","device_name":"$model","device_sku":"TE032AS006"}"""
        return Zip.write(
            listOf(
                ZipEntryData("$top/meta.json", meta.toByteArray()),
                ZipEntryData("__MACOSX/$top/._meta.json", ByteArray(40)),
                ZipEntryData("$top/sounds/335 cowbell.wav", Wav.encode(ByteArray(16), 1, 46875)),
                ZipEntryData("__MACOSX/$top/sounds/._335 cowbell.wav", ByteArray(40)),
            ),
            dateMs = 0,
        )
    }

    /** Each pack served at the other's path. */
    @Volatile private var wrongPack = false
    private val asked = java.util.Collections.synchronizedList(mutableListOf<String>())
    private val ep40Path = "/apps/ep-sample-tool/assets/ep-40-factory-content-T3st_40.pak"
    private val ep133Path = "/apps/ep-sample-tool/assets/ep-133-factory-content-T3st_133.pak"

    private val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
        // The EP Sample Tool as served: its page, its script naming both packs, and the packs.
        createContext("/apps/ep-sample-tool") { ex ->
            val path = ex.requestURI.path
            asked += path
            val body = when (path) {
                FactorySounds.PAGE -> """<script type="module" crossorigin src="/apps/ep-sample-tool/assets/index-T3st.js"></script>""".toByteArray()
                "/apps/ep-sample-tool/assets/index-T3st.js" -> """const a="$ep40Path",b="$ep133Path";""".toByteArray()
                ep40Path -> factoryPak(if (wrongPack) "EP-133" else "EP-40")
                ep133Path -> factoryPak(if (wrongPack) "EP-40" else "EP-133")
                else -> null
            }
            if (body == null) {
                ex.sendResponseHeaders(404, -1)
            } else {
                ex.sendResponseHeaders(200, body.size.toLong())
                ex.responseBody.use { it.write(body) }
            }
            ex.close()
        }
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
    fun `getting the EP-40's sounds downloads its own pack, found beside the EP-133's`() {
        val seen = mutableListOf<Pair<Long, Long>>()
        val (bytes, pak) = runBlocking { FactoryDownload.pack(FactoryKit.EP40, CancelSignal(), origin) { done, all -> seen += done to all } }
        assertEquals(listOf(FactorySounds.PAGE, "/apps/ep-sample-tool/assets/index-T3st.js", ep40Path), asked.toList())
        assertArrayEquals(factoryPak("EP-40"), bytes)
        assertEquals(mapOf(335 to "cowbell"), pak.sounds.mapValues { it.value.name })
        assertTrue(FactorySounds.isFactory(pak, FactoryKit.EP40))
        assertEquals(bytes.size.toLong() to bytes.size.toLong(), seen.last())
        // Saved as the EP-40's kit.
        assertEquals("factory-ep40", FactoryKit.EP40.source)
        assertEquals("ep-40-factory-content.pak", FactorySounds.fileName(FactoryKit.EP40))
    }

    @Test
    fun `the EP-133's download is the EP-133's pack, as before`() {
        val (_, pak) = runBlocking { FactoryDownload.pack(FactoryKit.EP133, CancelSignal(), origin) { _, _ -> } }
        assertEquals(ep133Path, asked.last())
        assertTrue(FactorySounds.isFactory(pak))
    }

    @Test
    fun `another device's pack is refused for the kit asked for`() {
        // The EP-133's pack where the EP-40's should be.
        wrongPack = true
        val e = assertThrows<IOException> { runBlocking { FactoryDownload.pack(FactoryKit.EP40, CancelSignal(), origin) { _, _ -> } } }
        assertEquals(dev.arc.ep133.text.FeatureText.NOT_FACTORY_40, e.message)
        val e133 = assertThrows<IOException> { runBlocking { FactoryDownload.pack(FactoryKit.EP133, CancelSignal(), origin) { _, _ -> } } }
        assertEquals(dev.arc.ep133.text.FeatureText.NOT_FACTORY, e133.message)
    }

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
    fun `nothing answering is said plainly`() {
        val closed = java.net.ServerSocket(0).use { it.localPort }
        val e = assertThrows<IOException> { FactoryDownload.text("/x", CancelSignal(), "http://127.0.0.1:$closed") }
        assertEquals(dev.arc.ep133.text.FeatureText.FACTORY_UNREACHABLE, e.message)
    }

    @Test
    fun `a server error is an error, not a cancel`() {
        val e = assertThrows<IOException> { FactoryDownload.text("/missing", CancelSignal(), origin) }
        assertEquals("HTTP 404", e.message)
    }
}
