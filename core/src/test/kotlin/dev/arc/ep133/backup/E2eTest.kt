package dev.arc.ep133.backup

import dev.arc.ep133.formats.Crc32
import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.numberOrNull
import dev.arc.ep133.protocol.CancelSignal
import dev.arc.ep133.protocol.CancelledError
import dev.arc.ep133.protocol.Device
import dev.arc.ep133.protocol.Session
import dev.arc.ep133.testing.MockEP133
import dev.arc.ep133.testing.MockSound
import dev.arc.ep133.testing.noise
import dev.arc.ep133.testing.pad
import dev.arc.ep133.testing.tarFile
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource

/**
 * Port of reference/test/e2e.test.js. Each JS assertion is kept, in order;
 * lines marked "extra" are Kotlin additions.
 *
 * The session and the simulator share one virtual-time dispatcher, so the
 * no-ack upload path (600 ms stalls) runs instantly and deterministically.
 */
class E2eTest {
    private fun sourceDevice(ackChunks: Boolean = true) = MockEP133(
        sounds = listOf(
            MockSound(1, "kick", noise(20000), mapOf("sound.playmode" to JsonPrimitive("key"), "sound.pitch" to JsJson.number(-3))),
            MockSound(2, "snare", noise(1000)),
            MockSound(150, "vox chop long name x", noise(90001 - 1), mapOf("channels" to JsJson.number(2), "sound.loopend" to JsJson.number(10))),
        ),
        projects = listOf(
            1 to tarFile(listOf("pads/a/p01" to pad(1), "pads/a/p02" to pad(2), "settings" to noise(222))),
            4 to tarFile(listOf("pads/b/p05" to pad(150))),
        ),
        ackChunks = ackChunks,
    )

    private suspend fun TestScope.connect(device: MockEP133): Session {
        val s = Session(device.transport(this), StandardTestDispatcher(testScheduler))
        s.handshake()
        return s
    }

    @ParameterizedTest(name = "backup then restore into an empty device (chunk acks: {0})")
    @ValueSource(booleans = [true, false])
    fun `backup then restore into an empty device`(ackChunks: Boolean) = runTest {
        val src = sourceDevice()
        val s1 = connect(src)
        assertEquals("EP-133", s1.info!!.product)
        assertEquals("2.0.5", s1.info!!.osVersion) // extra
        assertEquals("MOCK0001", s1.info!!.serial) // extra
        val progress = ArrayList<Double>()
        val result = Backup.backupDevice(s1, onProgress = { progress.add(it.fraction) })
        val summary = result.summary
        assertEquals(3, summary.soundCount)
        assertEquals(listOf(1, 4), summary.projects)
        assertTrue(progress.last() == 1.0 && progress.zipWithNext().all { (a, b) -> b >= a })
        assertEquals(0, src.dropped, "no command was sent while the device wanted a re-init")

        val pak = Paks.open(result.bytes)
        val d = Paks.describe(pak)
        assertEquals(listOf(1, 2, 150), d.slots)
        assertEquals(mapOf(1 to listOf(1, 2), 4 to listOf(150)), d.projectSlots)

        val dst = MockEP133(ackChunks = ackChunks, projects = listOf(4 to noise(10)))
        val s2 = connect(dst)
        Backup.restorePak(s2, pak)
        assertEquals(0, dst.dropped)
        for ((slot, snd) in src.sounds) {
            val got = dst.sounds[slot]
            assertNotNull(got, "slot $slot restored")
            assertEquals(Crc32.of(snd.pcm).toDouble(), got!!.meta["crc"]!!.numberOrNull)
            assertEquals(snd.meta["channels"]!!.numberOrNull, got.meta["channels"]!!.numberOrNull)
        }
        assertEquals(JsonPrimitive("key"), dst.sounds[1]!!.meta["sound.playmode"])
        assertEquals(-3.0, dst.sounds[1]!!.meta["sound.pitch"]!!.numberOrNull)
        assertEquals("vox chop long name x", dst.sounds[150]!!.name)
        assertArrayEquals(src.projects[1], dst.projects[1])
        assertArrayEquals(src.projects[4], dst.projects[4])
        assertEquals(3000.0, dst.projectsMeta["active"]!!.numberOrNull, "active project restored afterwards")
        // extra: each project upload switches away and back, then the original is restored.
        assertEquals(
            listOf("""{"active":6000}""", """{"active":3000}""", """{"active":3000}""", """{"active":6000}""", """{"active":3000}"""),
            dst.metaWrites.filter { it.first == 2000 }.map { it.second },
        )
        s1.close()
        s2.close()
    }

    @Test
    fun `restore a single project with only the sounds it uses`() = runTest {
        val src = sourceDevice()
        val bytes = Backup.backupDevice(connect(src)).bytes
        val pak = Paks.open(bytes)
        val dst = MockEP133()
        val s = connect(dst)
        val d = Paks.describe(pak)
        Backup.restorePak(s, pak, projects = listOf(4), slots = d.projectSlots[4])
        assertEquals(listOf(150), dst.sounds.keys.toList())
        assertEquals(listOf(4), dst.projects.keys.toList())
        assertEquals(3000.0, dst.projectsMeta["active"]!!.numberOrNull) // extra
        s.close()
    }

    @Test
    fun `refuses to restore when the device is too full`() = runTest {
        val src = sourceDevice()
        val bytes = Backup.backupDevice(connect(src)).bytes
        val pak = Paks.open(bytes)
        val dst = MockEP133(capacity = 50000, sounds = listOf(MockSound(9, "big", noise(45000))))
        val s = connect(dst)
        val e = assertThrows<RestoreError> { Backup.restorePak(s, pak) }
        assertTrue(e.message!!.contains("Not enough room"))
        assertEquals(
            "Not enough room on the device: this restore needs 0.1 MB, 0.0 MB is available. Delete some samples on the device or restore fewer sounds.",
            e.message,
        ) // extra
        assertEquals(1, dst.sounds.size, "nothing was written")
        assertTrue(2 !in dst.log) // extra: no PUT at all
        s.close()
    }

    @Test
    fun `cancelling stops between items`() = runTest {
        val src = sourceDevice()
        val s = connect(src)
        val cancel = CancelSignal()
        assertThrows<CancelledError> {
            Backup.backupDevice(s, signal = cancel, onProgress = { if (it.label.contains("snare")) cancel.cancel() })
        }
        // extra: the device was left in a usable state
        assertEquals(0, src.dropped)
        assertEquals(3, Device.listSounds(s).size)
        s.close()
    }
}
