package dev.arc.ep133.features

import dev.arc.ep133.backup.Backup
import dev.arc.ep133.backup.PakError
import dev.arc.ep133.backup.PakExport
import dev.arc.ep133.backup.Paks
import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.Wav
import dev.arc.ep133.formats.Zip
import dev.arc.ep133.formats.numberOrNull
import dev.arc.ep133.protocol.Session
import dev.arc.ep133.testing.DemoData
import dev.arc.ep133.testing.Fixtures
import dev.arc.ep133.testing.MockEP133
import dev.arc.ep133.testing.noise
import dev.arc.ep133.testing.s16
import dev.arc.ep133.util.decodeUtf8
import dev.arc.ep133.util.encodeUtf8
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.ZoneOffset

class TrimExportTest {
    private suspend fun TestScope.connect(dev: MockEP133): Session {
        val s = Session(dev.transport(this), StandardTestDispatcher(testScheduler))
        s.handshake()
        return s
    }

    // ---------- trim ----------

    @Test
    fun `cut takes whole frames and clamps the range`() {
        val stereo = s16(1, -1, 2, -2, 3, -3, 4, -4)
        assertArrayEquals(s16(2, -2, 3, -3), SampleTrim.cut(stereo, 2, 1, 3))
        assertArrayEquals(s16(3, -3, 4, -4), SampleTrim.cut(stereo, 2, 2, 99))
        assertArrayEquals(ByteArray(0), SampleTrim.cut(stereo, 2, 3, 1))
        assertEquals(4, SampleTrim.frames(stereo, 2))
    }

    @Test
    fun `loop points move with the trim start and stay inside`() {
        val s = JsJson.parse("""{"sound.playmode":"key","sound.loopstart":100,"sound.loopend":900}""") as JsonObject
        assertEquals("""{"sound.playmode":"key","sound.loopstart":50,"sound.loopend":399}""", JsJson.stringify(SampleTrim.shiftLoops(s, 50, 400)))
        assertEquals("""{"sound.playmode":"key","sound.loopstart":0,"sound.loopend":0}""", JsJson.stringify(SampleTrim.shiftLoops(s, 950, 1)))
    }

    @Test
    fun `peaks follow the signal`() {
        val pcm = s16(0, 0, 32767, -32768, 0, 0, 16384, 0)
        val p = SampleTrim.peaks(pcm, 1, 2)
        assertEquals(Peak(-1f, 1f), p[0])
        assertEquals(0f, p[1].min)
        assertEquals(16384 / 32767f, p[1].max)
        assertEquals(List(3) { Peak(0f, 0f) }, SampleTrim.peaks(ByteArray(0), 1, 3))
    }

    @Test
    fun `a trimmed upload writes only the selection, with loops moved`() = runTest {
        val dev = MockEP133()
        val s = connect(dev)
        // 46875 Hz mono, loop points embedded in a LIST chunk.
        val json = encodeUtf8("""{"sound.loopstart":1000,"sound.loopend":3000}""")
        val base = Wav.encode(noise(4000 * 2), 1, 46875)
        // RIFF chunks are padded to an even length.
        val chunk = encodeUtf8("LIST") + byteArrayOf(json.size.toByte(), 0, 0, 0) + json + ByteArray(json.size and 1)
        val wav = base.copyOfRange(0, 36) + chunk + base.copyOfRange(36, base.size)
        val size = wav.size - 8
        wav[4] = size.toByte(); wav[5] = (size shr 8).toByte(); wav[6] = (size shr 16).toByte(); wav[7] = (size shr 24).toByte()

        SampleUpload.upload(s, listOf(UploadItem(5, "part", wav, trim = 500 until 2500)))
        val snd = dev.sounds[5]!!
        assertArrayEquals(noise(4000 * 2).copyOfRange(1000, 5000), snd.pcm)
        assertEquals(500.0, snd.meta["sound.loopstart"]!!.numberOrNull)
        assertEquals(1999.0, snd.meta["sound.loopend"]!!.numberOrNull)
        assertThrows<UploadError> { SampleUpload.upload(s, listOf(UploadItem(6, "none", wav, trim = 4000 until 4000))) }
        s.close()
    }

    @Test
    fun `a trimmed 48 kHz upload is cut first, then resampled`() = runTest {
        val dev = MockEP133()
        val s = connect(dev)
        val wav = Wav.encode(noise(9600 * 2), 1, 48000)
        SampleUpload.upload(s, listOf(UploadItem(1, "half", wav, trim = 0 until 4800)))
        assertEquals(4688 * 2, dev.sounds[1]!!.pcm.size)
        assertEquals(46875.0, dev.sounds[1]!!.meta["samplerate"]!!.numberOrNull)
        s.close()
    }

    // ---------- export ----------

    @Test
    fun `a sound exports as the exact WAV in the backup`() {
        val pak = Paks.open(Fixtures.samplePak())
        assertArrayEquals(pak.sounds[109]!!.wav, PakExport.soundWav(pak, 109))
        assertEquals("109 vox chop.wav", PakExport.soundFileName(pak.sounds[109]!!))
        assertThrows<PakError> { PakExport.soundWav(pak, 500) }
    }

    @Test
    fun `a project exports with only the sounds it uses`() {
        val pak = Paks.open(Fixtures.samplePak())
        val bytes = PakExport.project(pak, 5, nowMs = 1_791_119_124_116L, zone = ZoneOffset.UTC)
        val out = Paks.open(bytes)
        val d = Paks.describe(out)
        assertEquals(listOf(5), d.projects)
        assertEquals(listOf(7, 8, 108, 109, 110), d.slots)
        assertEquals(mapOf(5 to listOf(7, 8, 108, 109, 110)), d.projectSlots)
        for (slot in d.slots) assertArrayEquals(pak.sounds[slot]!!.wav, out.sounds[slot]!!.wav, "slot $slot")
        assertArrayEquals(pak.projects[5], out.projects[5])
        assertEquals(Paks.describe(pak).device, d.device)
        assertEquals(Paks.describe(pak).soundNames.filterKeys { it in d.slots }, d.soundNames)
        // Same file layout as a backup, in order.
        assertEquals(
            listOf("meta.json", "arc.json", "sounds/007 tom low.wav", "sounds/008 perc.wav", "sounds/108 bass c1.wav", "sounds/109 vox chop.wav", "sounds/110 stab.wav", "projects/P05.tar"),
            Zip.read(bytes).keys.toList(),
        )
        assertTrue(decodeUtf8(Zip.read(bytes).getValue("meta.json")).contains("\"generated_at\": \"2026-10-04T13:05:24.116Z\""))
        assertThrows<PakError> { PakExport.project(pak, 3) }
        assertEquals("my-set-project-5.pak", PakExport.projectFileName("my-set.pak", 5))
    }

    @Test
    fun `an exported project restores into the simulator`() = runTest {
        val pak = Paks.open(Fixtures.samplePak())
        val small = Paks.open(PakExport.project(pak, 1))
        val dst = MockEP133()
        val s = connect(dst)
        Backup.restorePak(s, small)
        val demo = DemoData.device()
        assertEquals(listOf(1, 2, 3, 4, 5), dst.sounds.keys.sorted())
        for (slot in dst.sounds.keys) assertArrayEquals(demo.sounds[slot]!!.pcm, dst.sounds[slot]!!.pcm)
        assertArrayEquals(demo.projects[1], dst.projects[1])
        assertEquals(JsonPrimitive("kick"), JsonPrimitive(dst.sounds[1]!!.name))
        s.close()
    }
}
