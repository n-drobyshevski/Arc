package dev.arc.ep133.backup

import dev.arc.ep133.formats.Crc32
import dev.arc.ep133.formats.Zip
import dev.arc.ep133.protocol.Session
import dev.arc.ep133.testing.DemoData
import dev.arc.ep133.testing.Fixtures
import dev.arc.ep133.testing.MockEP133
import dev.arc.ep133.util.decodeUtf8
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.time.ZoneOffset

/**
 * Compatibility with the web version's .pak files.
 *
 * reference/test/fixtures/sample.pak was written by the JS backup of the
 * simulated demo device (test/make-fixture.mjs). The expected values below
 * were read from it with the JS reference under Node.
 */
class PakCompatTest {
    /** generated_at of the fixture, 2026-10-04T13:05:24.116Z. */
    private val fixtureTime = 1_791_119_124_116L

    private val expectedDescription = PakDescription(
        soundCount = 12,
        projectCount = 3,
        projects = listOf(1, 2, 5),
        slots = listOf(1, 2, 3, 4, 5, 6, 7, 8, 108, 109, 110, 111),
        soundNames = mapOf(
            1 to "kick", 2 to "snare", 3 to "hat closed", 4 to "hat open", 5 to "clap", 6 to "rim", 7 to "tom low",
            8 to "perc", 108 to "bass c1", 109 to "vox chop", 110 to "stab", 111 to "riser",
        ),
        projectSlots = mapOf(1 to listOf(1, 2, 3, 4, 5), 2 to listOf(4, 5, 6, 7, 8), 5 to listOf(7, 8, 108, 109, 110)),
        device = PakDevice(product = "EP-133", sku = "TE032AS001", osVersion = "2.0.5"),
        generatedAt = fixtureTime,
    )

    /** (slot, wav size, crc32 of the wav) for every sound in the fixture. */
    private val expectedWavs = listOf(
        Triple(1, 8044, 1210850052L), Triple(2, 11044, 892705292L), Triple(3, 14044, 1840889880L),
        Triple(4, 17044, 3413871838L), Triple(5, 20044, 916970730L), Triple(6, 23044, 2483237793L),
        Triple(7, 26044, 75479863L), Triple(8, 29044, 1502255551L), Triple(108, 32044, 1276560396L),
        Triple(109, 70044, 323993505L), Triple(110, 38044, 2298888661L), Triple(111, 41044, 3349279222L),
    )

    @Test
    fun `opens the web version's sample pak`() {
        val pak = Paks.open(Fixtures.samplePak())
        assertEquals(expectedDescription, Paks.describe(pak))
        assertEquals(expectedWavs, pak.sounds.values.map { Triple(it.slot, it.wav.size, Crc32.of(it.wav)) })
        assertEquals(
            listOf(Triple(1, 7168, 2661716966L), Triple(2, 7168, 2921213206L), Triple(5, 7168, 401043680L)),
            pak.projects.map { (n, t) -> Triple(n, t.size, Crc32.of(t)) },
        )
        assertEquals("teenage engineering - pak file", pak.meta["info"]!!.let { (it as kotlinx.serialization.json.JsonPrimitive).content })
        assertEquals("arc", (pak.sidecar["app"] as kotlinx.serialization.json.JsonPrimitive).content)
        // The fixture's audio is exactly the demo device's tone() output.
        val demo = DemoData.sounds().associateBy { it.slot }
        for (s in pak.sounds.values) {
            val wav = Backup.prepareSound(s)
            assertArrayEquals(demo.getValue(s.slot).pcm, wav.pcm, "pcm of slot ${s.slot}")
        }
    }

    @Test
    fun `a Kotlin backup has the same layout and contents as the JS one`() = runTest {
        val dev = DemoData.device()
        val s = Session(dev.transport(this), StandardTestDispatcher(testScheduler))
        s.handshake()
        // The fixture names the web version that wrote it in meta.json; arc names its own
        // version (version.properties), so build ours with the web version's to compare.
        val webVersion = Regex("""APP_VERSION = '([^']+)'""")
            .find(java.io.File(System.getProperty("arc.referenceDir"), "src/backup.js").readText())!!.groupValues[1]
        val ours = Backup.backupDevice(s, clock = { fixtureTime }, zone = ZoneOffset.UTC, appVersion = webVersion).bytes
        s.close()
        val theirs = Fixtures.samplePak()

        val a = centralDirectory(ours)
        val b = centralDirectory(theirs)
        assertEquals(b.map { it.name }, a.map { it.name }, "entry names and order")
        // Everything except the compressed size and offset (deflate output may differ).
        assertEquals(b, a)

        // Uncompressed contents are identical, including meta.json and arc.json.
        val za = Zip.read(ours)
        val zb = Zip.read(theirs)
        for ((name, data) in zb) assertArrayEquals(data, za[name], name)
        assertEquals(decodeUtf8(zb.getValue("meta.json")), decodeUtf8(za.getValue("meta.json")))
        assertEquals(decodeUtf8(zb.getValue("arc.json")), decodeUtf8(za.getValue("arc.json")))
        assertEquals(Paks.describe(Paks.open(theirs)), Paks.describe(Paks.open(ours)))
    }

    @Test
    fun `the web version's sample pak restores into the simulator`() = runTest {
        val pak = Paks.open(Fixtures.samplePak())
        val dst = MockEP133()
        val s = Session(dst.transport(this), StandardTestDispatcher(testScheduler))
        s.handshake()
        val r = Backup.restorePak(s, pak)
        assertEquals(RestoreResult(12, 3), r)
        val demo = DemoData.device()
        for ((slot, snd) in demo.sounds) assertArrayEquals(snd.pcm, dst.sounds[slot]!!.pcm, "slot $slot")
        for ((n, tar) in demo.projects) assertArrayEquals(tar, dst.projects[n], "project $n")
        assertEquals(0, dst.dropped)
        s.close()
    }

    private data class CentralEntry(
        val name: String, val madeBy: Int, val needed: Int, val flags: Int, val method: Int,
        val time: Int, val date: Int, val crc: Long, val size: Long, val extra: Int, val comment: Int,
    )

    private fun centralDirectory(zip: ByteArray): List<CentralEntry> {
        val bb = ByteBuffer.wrap(zip).order(ByteOrder.LITTLE_ENDIAN)
        val eocd = zip.size - 22
        assertEquals(0x06054B50, bb.getInt(eocd))
        val count = bb.getShort(eocd + 10).toInt() and 0xFFFF
        var p = bb.getInt(eocd + 16)
        val out = ArrayList<CentralEntry>()
        repeat(count) {
            fun u16(o: Int) = bb.getShort(p + o).toInt() and 0xFFFF
            fun u32(o: Int) = bb.getInt(p + o).toLong() and 0xFFFFFFFFL
            val nl = u16(28)
            val e = CentralEntry(
                name = decodeUtf8(zip.copyOfRange(p + 46, p + 46 + nl)),
                madeBy = u16(4), needed = u16(6), flags = u16(8), method = u16(10), time = u16(12), date = u16(14),
                crc = u32(16), size = u32(24), extra = u16(30), comment = u16(32),
            )
            // The local header must agree with the central one.
            val l = u32(42).toInt()
            assertEquals(0x04034B50, bb.getInt(l))
            assertEquals(e.flags, bb.getShort(l + 6).toInt() and 0xFFFF)
            assertEquals(0, bb.getShort(l + 28).toInt(), "no local extra field")
            out.add(e)
            p += 46 + nl + e.extra + e.comment
        }
        return out
    }
}
