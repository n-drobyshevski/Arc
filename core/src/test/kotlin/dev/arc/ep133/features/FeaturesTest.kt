package dev.arc.ep133.features

import dev.arc.ep133.backup.Backup
import dev.arc.ep133.backup.Paks
import dev.arc.ep133.backup.RestoreError
import dev.arc.ep133.formats.Crc32
import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.Wav
import dev.arc.ep133.formats.numberOrNull
import dev.arc.ep133.protocol.CancelSignal
import dev.arc.ep133.protocol.CancelledError
import dev.arc.ep133.protocol.Session
import dev.arc.ep133.testing.MockEP133
import dev.arc.ep133.testing.MockSound
import dev.arc.ep133.testing.noise
import dev.arc.ep133.testing.pad
import dev.arc.ep133.testing.tarFile
import dev.arc.ep133.util.encodeUtf8
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class FeaturesTest {
    private fun device() = MockEP133(
        sounds = listOf(
            MockSound(1, "kick", noise(20000), mapOf("sound.playmode" to JsonPrimitive("key"), "sound.pitch" to JsJson.number(-3))),
            MockSound(2, "snare", noise(1000)),
            MockSound(150, "vox", noise(9000), mapOf("channels" to JsJson.number(2))),
        ),
        projects = listOf(
            1 to tarFile(listOf("pads/a/p01" to pad(1), "pads/a/p02" to pad(2))),
            4 to tarFile(listOf("pads/b/p05" to pad(150))),
        ),
    )

    private suspend fun TestScope.connect(dev: MockEP133): Session {
        val s = Session(dev.transport(this), StandardTestDispatcher(testScheduler))
        s.handshake()
        return s
    }

    // ---------- device browser ----------

    @Test
    fun `browser lists sounds, projects and storage`() = runTest {
        val dev = device()
        val s = connect(dev)
        val c = DeviceBrowser.contents(s)
        assertEquals(listOf(1, 2, 150), c.sounds.map { it.slot })
        assertEquals(listOf("kick", "snare", "vox"), c.sounds.map { it.name })
        assertEquals(listOf(20000L, 1000L, 9000L), c.sounds.map { it.size })
        assertEquals(listOf(1, 4), c.projects.map { it.project })
        assertEquals(64.0 * 1024 * 1024, c.storage.total)
        assertEquals(64.0 * 1024 * 1024 - 30000, c.storage.free)
        assertEquals(setOf(1, 2, 150), c.occupiedSlots)
        s.close()
    }

    @Test
    fun `sound details come from metadata only`() = runTest {
        val dev = device()
        val s = connect(dev)
        val d = DeviceBrowser.soundDetails(s, 150)
        assertEquals("vox", d.name)
        assertEquals(2.0, d.channels)
        assertEquals(46875.0, d.sampleRate)
        assertEquals(Crc32.of(noise(9000)), d.crc)
        val k = DeviceBrowser.soundDetails(s, 1)
        assertEquals("""{"sound.playmode":"key","sound.pitch":-3}""", JsJson.stringify(k.settings))
        assertTrue(dev.opens.isEmpty(), "no audio was downloaded")
        dev.reportCrc = false
        dev.addSound(7, "plain", noise(10))
        assertNull(DeviceBrowser.soundDetails(s, 7).crc)
        s.close()
    }

    @Test
    fun `project sounds are read from the project's pads`() = runTest {
        val dev = device()
        val s = connect(dev)
        assertEquals(listOf(1, 2), DeviceBrowser.projectSounds(s, 1))
        assertEquals(listOf(150), DeviceBrowser.projectSounds(s, 4))
        // The download is followed by the handshake, so the next command still works.
        assertEquals(3, DeviceBrowser.contents(s).sounds.size)
        assertEquals(0, dev.dropped)
        s.close()
    }

    // ---------- sample upload ----------

    @Test
    fun `slot suggestions and names`() {
        assertEquals(listOf(3, 4, 5), SampleUpload.suggestSlots(setOf(1, 2, 150), 3))
        assertEquals(listOf(4, 5), SampleUpload.suggestSlots(setOf(1, 2), 2, taken = setOf(3)))
        assertEquals(emptyList<Int>(), SampleUpload.suggestSlots((1..999).toSet(), 2))
        assertEquals("808 Kick", SampleUpload.nameFor("808 Kick.WAV"))
        assertEquals("a long sample name t", SampleUpload.nameFor("a long sample name that goes on.wav"))
    }

    @Test
    fun `upload into free slots and over an existing one`() = runTest {
        val dev = device()
        val s = connect(dev)
        val a = Wav.encode(noise(4000), 1, 46875)
        val b = Wav.encode(noise(3000), 2, 46875)
        val c = Wav.encode(noise(500), 1, 46875)
        val r = SampleUpload.upload(
            s,
            listOf(UploadItem(3, "hat", a), UploadItem(4, "pad", b), UploadItem(2, "snare 2", c)),
        )
        assertEquals(3, r.sounds)
        assertEquals(0, r.projects)
        assertArrayEquals(noise(4000), dev.sounds[3]!!.pcm)
        assertEquals("pad", dev.sounds[4]!!.name)
        assertEquals(2.0, dev.sounds[4]!!.meta["channels"]!!.numberOrNull)
        assertEquals("snare 2", dev.sounds[2]!!.name)
        assertArrayEquals(noise(500), dev.sounds[2]!!.pcm)
        // No project was touched and the active project stayed.
        assertTrue(dev.metaWrites.none { it.first == 2000 })
        assertEquals(0, dev.dropped)
        s.close()
    }

    @Test
    fun `upload resamples, keeps embedded settings and scales loops`() = runTest {
        val dev = MockEP133()
        val s = connect(dev)
        // A 48 kHz WAV with settings embedded in a LIST chunk, as the Sample Tool writes them.
        val json = encodeUtf8("""{"sound.playmode":"legato","sound.loopend":1000}""")
        val base = Wav.encode(noise(4800 * 2), 1, 48000)
        val chunk = encodeUtf8("LIST") + byteArrayOf(json.size.toByte(), 0, 0, 0) + json
        val wav = base.copyOfRange(0, 36) + chunk + base.copyOfRange(36, base.size)
        // fix the RIFF size
        val size = wav.size - 8
        wav[4] = size.toByte(); wav[5] = (size shr 8).toByte(); wav[6] = (size shr 16).toByte(); wav[7] = (size shr 24).toByte()
        SampleUpload.upload(s, listOf(UploadItem(9, "loop", wav)))
        val m = dev.sounds[9]!!.meta
        assertEquals(46875.0, m["samplerate"]!!.numberOrNull)
        assertEquals(JsonPrimitive("legato"), m["sound.playmode"])
        assertEquals(977.0, m["sound.loopend"]!!.numberOrNull)
        assertEquals(4688 * 2, dev.sounds[9]!!.pcm.size)
        s.close()
    }

    @Test
    fun `upload refuses bad input before writing anything`() = runTest {
        val dev = MockEP133(capacity = 5000)
        val s = connect(dev)
        val wav = Wav.encode(noise(6000), 1, 46875)
        assertEquals(
            "Two files are set to slot 5. Give each file its own slot.",
            assertThrows<UploadError> { SampleUpload.upload(s, listOf(UploadItem(5, "a", wav), UploadItem(5, "b", wav))) }.message,
        )
        assertThrows<UploadError> { SampleUpload.upload(s, listOf(UploadItem(1000, "a", wav))) }
        assertEquals("Not a WAV file", assertThrows<IllegalArgumentException> { SampleUpload.upload(s, listOf(UploadItem(5, "a", ByteArray(100)))) }.message)
        val e = assertThrows<RestoreError> { SampleUpload.upload(s, listOf(UploadItem(5, "a", wav))) }
        assertTrue(e.message!!.startsWith("Not enough room on the device"))
        assertTrue(dev.sounds.isEmpty())
        assertTrue(2 !in dev.log, "no PUT was sent")
        s.close()
    }

    @Test
    fun `upload can be cancelled between files`() = runTest {
        val dev = MockEP133()
        val s = connect(dev)
        val cancel = CancelSignal()
        val items = (1..3).map { UploadItem(it, "s$it", Wav.encode(noise(2000), 1, 46875)) }
        assertThrows<CancelledError> {
            SampleUpload.upload(s, items, onProgress = { if (it.label.startsWith("Sound 002")) cancel.cancel() }, signal = cancel)
        }
        // The file in progress finishes; nothing after it is written.
        assertEquals(listOf(1, 2), dev.sounds.keys.sorted())
        s.close()
    }

    // ---------- backup vs device ----------

    @Test
    fun `diff reports same, changed, missing and device-only items`() = runTest {
        val src = device()
        val pak = Paks.open(Backup.backupDevice(connect(src)).bytes)

        val dst = device()
        dst.addSound(2, "snare", noise(1001)) // different audio
        dst.sounds[1]!!.meta["sound.pitch"] = JsJson.number(5) // same audio, other setting
        dst.sounds.remove(150) // missing
        dst.addSound(42, "extra", noise(10)) // only on the device
        dst.projects[1] = tarFile(listOf("pads/a/p01" to pad(9))) // different project
        dst.projects.remove(4)
        dst.projects[7] = noise(10)
        val s = connect(dst)
        val r = BackupDiff.compare(s, pak)

        val bySlot = r.sounds.associateBy { it.slot }
        assertEquals(SoundState.SAME_AUDIO, bySlot[1]!!.state)
        assertEquals(listOf("sound.pitch"), bySlot[1]!!.settingsDiffer)
        assertTrue(!bySlot[1]!!.unchanged)
        assertEquals(SoundState.DIFFERENT_AUDIO, bySlot[2]!!.state)
        assertEquals(SoundState.NOT_ON_DEVICE, bySlot[150]!!.state)
        assertEquals(listOf(42), r.deviceOnlySlots)
        assertEquals(listOf(ProjectDiff(1, ProjectState.DIFFERENT), ProjectDiff(4, ProjectState.NOT_ON_DEVICE)), r.projects)
        assertEquals(listOf(7), r.deviceOnlyProjects)
        assertEquals(5, r.changes)
        assertTrue(2 !in dst.log && dst.metaWrites.isEmpty(), "nothing was written")
        assertEquals(0, dst.dropped)
        s.close()
    }

    @Test
    fun `diff of a backup with its own device shows no changes`() = runTest {
        val src = device()
        val s = connect(src)
        val pak = Paks.open(Backup.backupDevice(s).bytes)
        val r = BackupDiff.compare(s, pak)
        assertTrue(r.sounds.all { it.unchanged }, r.sounds.toString())
        assertTrue(r.projects.all { it.state == ProjectState.SAME })
        assertEquals(0, r.changes)
        s.close()
    }

    @Test
    fun `diff only looks at the chosen slots and projects`() = runTest {
        val src = device()
        val pak = Paks.open(Backup.backupDevice(connect(src)).bytes)
        val dst = device()
        val s = connect(dst)
        val r = BackupDiff.compare(s, pak, slots = listOf(150), projects = listOf(4))
        assertEquals(listOf(150), r.sounds.map { it.slot })
        assertEquals(listOf(4), r.projects.map { it.project })
        // Only project 4 was downloaded.
        assertEquals(listOf(6000), dst.opens)
        s.close()
    }

    @Test
    fun `without a crc the diff falls back to size`() = runTest {
        val src = device()
        val pak = Paks.open(Backup.backupDevice(connect(src)).bytes)
        val dst = MockEP133().apply {
            reportCrc = false
            addSound(1, "kick", noise(20000), mapOf("sound.playmode" to JsonPrimitive("key"), "sound.pitch" to JsJson.number(-3)))
            addSound(2, "snare", noise(999))
        }
        val s = connect(dst)
        val r = BackupDiff.compare(s, pak, projects = emptyList()).sounds.associateBy { it.slot }
        assertEquals(SoundState.UNVERIFIED, r[1]!!.state)
        assertEquals(SoundState.DIFFERENT_AUDIO, r[2]!!.state)
        s.close()
    }
}
