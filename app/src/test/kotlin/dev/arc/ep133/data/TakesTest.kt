package dev.arc.ep133.data

import dev.arc.ep133.features.TakeTrim
import dev.arc.ep133.formats.Wav
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File

/** Takes' trims and duplicates: a trim is a file beside the take, a copy takes it along, a delete takes it away. */
class TakesTest {
    @TempDir
    lateinit var dir: File

    // One second of stereo at 8 kHz, each frame's samples its own number (and its negative).
    private fun take(takes: Takes, now: Long): File {
        val pcm = ByteArray(8_000 * 4)
        for (f in 0 until 8_000) {
            val v = f.toShort()
            pcm[f * 4] = v.toByte(); pcm[f * 4 + 1] = (v.toInt() shr 8).toByte()
            pcm[f * 4 + 2] = (-v).toByte(); pcm[f * 4 + 3] = ((-v) shr 8).toByte()
        }
        return takes.newFile(now).apply { writeBytes(Wav.encode(pcm, 2, 8_000)) }
    }

    @Test
    fun `a trim is kept beside the take and sends only its part`() {
        val takes = Takes(dir)
        val f = take(takes, 1_000_000)
        val whole = takes.list().single()
        assertEquals(8_000L, whole.frames)
        assertNull(whole.trim)
        assertArrayEquals(f.readBytes(), takes.keptWav(whole))

        takes.setTrim(f.name, TakeTrim(2_000, 6_000))
        val t = takes.list().single()
        assertEquals(TakeTrim(2_000, 6_000), t.trim)
        assertEquals(0.5, t.keptSeconds)
        val part = Wav.decode(takes.keptWav(t))
        assertEquals(4_000 * 4, part.pcm.size)
        assertEquals(2_000, (part.pcm[0].toInt() and 0xFF) or (part.pcm[1].toInt() shl 8))

        takes.setTrim(f.name, null)
        assertNull(takes.list().single().trim)
    }

    @Test
    fun `a duplicate is the newest, its trim with it, and a delete takes the trim away`() {
        val takes = Takes(dir)
        val f = take(takes, 1_000_000)
        takes.setTrim(f.name, TakeTrim(100, 900))
        val copy = takes.duplicate(f.name, 2_000_000_000)
        val list = takes.list()
        assertEquals(listOf(copy.name, f.name), list.map { it.name })
        assertEquals(TakeTrim(100, 900), list[0].trim)
        takes.delete(f.name)
        assertFalse(File(dir, f.name.removeSuffix(".wav") + ".trim").exists())
        assertEquals(listOf(copy.name), takes.list().map { it.name })
    }
}
