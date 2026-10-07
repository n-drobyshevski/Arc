package dev.arc.ep133.data

import dev.arc.ep133.features.SampleEdit
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File

/** SAMPLE's recordings on the phone: new names never clash, and a recording let go of becomes a take. */
class SampleFilesTest {
    @TempDir
    lateinit var dir: File

    @Test
    fun `new files are named for when they were kept, never over another`() {
        val files = SampleFiles(File(dir, "samples"))
        val a = files.newFile(0L)
        assertTrue(a.name.startsWith("smp-") && a.name.endsWith(".wav"))
        a.writeBytes(ByteArray(1))
        val b = files.newFile(0L)
        assertEquals(a.name.removeSuffix(".wav") + "-2.wav", b.name)
        // Only the name's last part counts.
        assertEquals(a, files.file("../../" + a.name))
    }

    @Test
    fun `a mono recording moved to Takes is listed there with its length`() {
        val files = SampleFiles(File(dir, "samples"))
        val takes = Takes(File(dir, "takes"))
        val f = files.newFile(System.currentTimeMillis())
        // 1001 mono frames at 1000 Hz: an odd sample count, kept whole.
        f.writeBytes(SampleEdit.toWavBytes(ShortArray(1001) { 1000 }, 1, 1000))
        assertTrue(files.moveToTakes(f.name, takes))
        assertFalse(f.exists())
        val listed = takes.list().single()
        assertEquals(1.001, listed.seconds, 1e-9)
        assertFalse(files.moveToTakes(f.name, takes))
    }

    @Test
    fun `a recording is written to a file of its own, never over another`() {
        val files = SampleFiles(File(dir, "samples"))
        val a = files.write(0L, byteArrayOf(1, 2))
        val b = files.write(0L, byteArrayOf(3))
        assertNotEquals(a, b)
        assertArrayEquals(byteArrayOf(1, 2), a.readBytes())
        assertArrayEquals(byteArrayOf(3), b.readBytes())
    }

    @Test
    fun `recordings no pad change names, left from before this start, are strays`() {
        val files = SampleFiles(File(dir, "samples"))
        val kept = files.write(0L, ByteArray(1)).apply { setLastModified(1_000L) }
        val left = files.write(0L, ByteArray(1)).apply { setLastModified(1_000L) }
        // Written since this start: a take on the review sheet now.
        files.write(0L, ByteArray(1)).apply { setLastModified(5_000L) }
        File(dir, "samples/notes.txt").writeText("x")
        assertEquals(listOf(left.name), files.strays(setOf(kept.name), before = 2_000L))
    }
}
