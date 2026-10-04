package dev.arc.ep133.backup

import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.Wav
import dev.arc.ep133.formats.Zip
import dev.arc.ep133.formats.ZipEntryData
import dev.arc.ep133.formats.numberOrNull
import dev.arc.ep133.protocol.Device
import dev.arc.ep133.protocol.DeviceError
import dev.arc.ep133.protocol.FrameCodec
import dev.arc.ep133.protocol.Fs
import dev.arc.ep133.protocol.Session
import dev.arc.ep133.protocol.TimeoutError
import dev.arc.ep133.protocol.Transport
import dev.arc.ep133.testing.FixedRandom
import dev.arc.ep133.testing.MockEP133
import dev.arc.ep133.testing.MockSound
import dev.arc.ep133.testing.noise
import dev.arc.ep133.testing.pad
import dev.arc.ep133.testing.tarFile
import dev.arc.ep133.util.encodeUtf8
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.random.Random

/** The reverse-engineered quirks, each exercised against the simulator. */
class QuirksTest {
    private fun device(ackChunks: Boolean = true) = MockEP133(
        sounds = listOf(
            MockSound(1, "kick", noise(20000)),
            MockSound(2, "snare", noise(1000)),
            MockSound(150, "vox", noise(9000), mapOf("channels" to JsJson.number(2))),
        ),
        projects = listOf(2 to tarFile(listOf("pads/a/p01" to pad(1))), 7 to tarFile(listOf("pads/a/p01" to pad(2)))),
        ackChunks = ackChunks,
    )

    private suspend fun TestScope.connect(dev: MockEP133, random: Random = Random.Default, transport: Transport = dev.transport(this)): Session {
        val s = Session(transport, StandardTestDispatcher(testScheduler), random)
        s.handshake()
        return s
    }

    @Test
    fun `download accepts a big-endian page echo`() = runTest {
        val src = device().apply { echoPagesBigEndian = true }
        val s = connect(src)
        val pak = Paks.open(Backup.backupDevice(s).bytes)
        assertArrayEquals(src.sounds[1]!!.pcm, Backup.prepareSound(pak.sounds[1]!!).pcm)
        s.close()
    }

    @Test
    fun `one empty data page is tolerated, two are an error`() = runTest {
        val src = device()
        val s = connect(src)
        src.emptyPages = 1
        assertEquals(20000, Fs.download(s, 1).size)
        src.emptyPages = 2
        val e = assertThrows<DeviceError> { Fs.download(s, 1) }
        assertEquals("Device stopped sending node 1 at 0/20000 bytes", e.message)
        // The handshake after a failed transfer leaves the device usable.
        assertEquals(3, Device.listSounds(s).size)
        s.close()
    }

    @Test
    fun `every transfer is followed by a handshake, otherwise commands are dropped`() = runTest {
        val src = device()
        val s = connect(src)
        Fs.download(s, 2)
        assertEquals(0, src.dropped)
        // Simulate a missing re-init: the device ignores the next command.
        src.needsInit = true
        val e = assertThrows<TimeoutError> { Device.listSounds(s) }
        assertEquals("The device did not answer (list 1000). Check the cable and try again.", e.message)
        assertEquals(1, src.dropped)
        s.close()
    }

    @Test
    fun `request ids wrap through 4095 during a full backup`() = runTest {
        val src = device()
        val ids = HashSet<Int>()
        val inner = src.transport(this)
        val spy = object : Transport {
            override fun send(bytes: ByteArray) {
                FrameCodec.decodeFrame(bytes)?.let { ids.add(it.requestId) }
                inner.send(bytes)
            }
            override val incoming: Flow<ByteArray> = inner.incoming
        }
        val s = connect(src, FixedRandom(4000), spy)
        val r = Backup.backupDevice(s)
        assertEquals(3, r.summary.soundCount)
        assertTrue(4095 in ids && 0 in ids, "ids wrapped")
        assertTrue(ids.all { it in 0..4095 })
        s.close()
    }

    @Test
    fun `projects are probed when the device lists none`() = runTest {
        val src = device().apply { hideProjectList = true }
        val s = connect(src)
        val r = Backup.backupDevice(s)
        assertEquals(listOf(2, 7), r.summary.projects)
        assertEquals(0, src.dropped)
        // The three sounds, then a GET open for each of projects 1..9.
        assertEquals(listOf(1, 2, 150) + (1..9).map(Device::projectNode), src.opens)
        s.close()
    }

    @Test
    fun `uploads stream without acks after one stall`() = runTest {
        val src = device()
        val pak = Paks.open(Backup.backupDevice(connect(src)).bytes)

        val acked = MockEP133(ackChunks = true)
        val s1 = connect(acked)
        val t0 = currentTime
        Backup.restorePak(s1, pak, projects = emptyList())
        assertEquals(0, currentTime - t0, "with acks the window never stalls")

        val silent = MockEP133(ackChunks = false)
        val s2 = connect(silent)
        val t1 = currentTime
        Backup.restorePak(s2, pak, projects = emptyList())
        // One 600 ms stall for each upload that fills the 16-chunk window
        // (kick: 47 chunks, vox: 21), then the rest streams. Snare is only 3 chunks.
        assertEquals(2 * Fs.ACK_STALL_MS, currentTime - t1)
        assertEquals(acked.sounds.keys, silent.sounds.keys)
        s1.close()
        s2.close()
    }

    @Test
    fun `at most 16 chunks are unacknowledged`() = runTest {
        val dst = MockEP133()
        val inner = dst.transport(this)
        val outstanding = HashSet<Int>()
        var max = 0
        val spy = object : Transport {
            override fun send(bytes: ByteArray) {
                val f = FrameCodec.decodeFrame(bytes)
                if (f != null && f.command == 5 && f.payload.size > 4 && f.payload[0].toInt() == 2 && f.payload[1].toInt() == 1) {
                    outstanding.add(f.requestId)
                    max = maxOf(max, outstanding.size)
                }
                inner.send(bytes)
            }
            override val incoming: Flow<ByteArray> = inner.incoming.onEach { b ->
                FrameCodec.decodeFrame(b)?.let { outstanding.remove(it.requestId) }
            }
        }
        val s = connect(dst, transport = spy)
        Device.writeSound(s, dev.arc.ep133.protocol.SoundData(5, "x", 1.0, 46875.0, JsonObject(emptyMap()), noise(433 * 100)))
        assertEquals(16, max)
        // 433-byte chunks: 100 data frames for 43300 bytes
        assertEquals(43300, dst.sounds[5]!!.pcm.size)
        s.close()
    }

    @Test
    fun `a checksum mismatch is retried once`() = runTest {
        val src = device()
        val pak = Paks.open(Backup.backupDevice(connect(src)).bytes)
        val dst = MockEP133().apply { corruptCrcUploads = 1 }
        val s = connect(dst)
        val labels = ArrayList<String>()
        Backup.restorePak(s, pak, slots = listOf(1), projects = emptyList(), onProgress = { labels.add(it.label) })
        assertTrue("Sound 001, kick, retrying" in labels)
        dst.corruptCrcUploads = 2
        val e = assertThrows<DeviceError> { Backup.restorePak(s, pak, slots = listOf(2), projects = emptyList()) }
        assertEquals("Sound 2 did not verify after upload (checksum mismatch)", e.message)
        s.close()
    }

    @Test
    fun `the free space check is skipped when the device reports no capacity`() = runTest {
        val src = device()
        val pak = Paks.open(Backup.backupDevice(connect(src)).bytes)
        val dst = MockEP133(capacity = 0)
        val s = connect(dst)
        // Not "Not enough room": the restore went ahead and the device refused the data.
        val e = assertThrows<DeviceError> { Backup.restorePak(s, pak) }
        assertEquals("Device rejected data for node 1", e.message)
        s.close()
    }

    @Test
    fun `high sample rates are resampled and loop points scaled`() = runTest {
        val frames = 4800
        val pcm = noise(frames * 2)
        val wav = Wav.encode(pcm, 1, 48000)
        val arc = """{"app":"arc","version":1,"sounds":{"3":{"name":"hi","settings":{"sound.loopstart":480,"sound.loopend":1000,"sound.playmode":"key"}}}}"""
        val zip = Zip.write(
            listOf(ZipEntryData("/arc.json", encodeUtf8(arc)), ZipEntryData("/sounds/003 hi.wav", wav)),
            dateMs = 0,
        )
        val dst = MockEP133()
        val s = connect(dst)
        Backup.restorePak(s, Paks.open(zip))
        val m = dst.sounds[3]!!.meta
        assertEquals(46875.0, m["samplerate"]!!.numberOrNull)
        assertEquals(469.0, m["sound.loopstart"]!!.numberOrNull) // round(480 * 46875 / 48000) = round(468.75)
        assertEquals(977.0, m["sound.loopend"]!!.numberOrNull) // round(976.5625)
        assertEquals(JsonPrimitive("key"), m["sound.playmode"])
        assertEquals(4688 * 2, dst.sounds[3]!!.pcm.size)
        s.close()
    }

    @Test
    fun `metadata writes are capped at 320 bytes`() = runTest {
        val dst = MockEP133()
        val s = connect(dst)
        val big = JsonObject(mapOf("name" to JsonPrimitive("x".repeat(320))))
        val e = assertThrows<DeviceError> { Fs.setMetadata(s, 5, big) }
        assertEquals("Metadata for node 5 is too large (331 bytes)", e.message)
        val e2 = assertThrows<DeviceError> {
            Fs.upload(s, node = 5, parent = 1000, flags = Fs.PUT_FLAGS_SOUND, name = "x", meta = big, data = ByteArray(10), barrier = {})
        }
        assertEquals("Sound settings too large to upload", e2.message)
        s.close()
    }

    @Test
    fun `a project upload switches away and back, and restore puts back the active project`() = runTest {
        val src = device()
        val pak = Paks.open(Backup.backupDevice(connect(src)).bytes)
        val dst = MockEP133(projects = listOf(1 to noise(10), 3 to noise(10)), active = 5000)
        val s = connect(dst)
        Backup.restorePak(s, pak, slots = emptyList(), projects = listOf(7))
        assertEquals(
            listOf("""{"active":3000}""", """{"active":9000}""", """{"active":5000}"""),
            dst.metaWrites.filter { it.first == 2000 }.map { it.second },
        )
        assertEquals(5000.0, dst.projectsMeta["active"]!!.numberOrNull)
        s.close()
    }
}
