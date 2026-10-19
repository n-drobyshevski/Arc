package dev.arc.ep133.data

import dev.arc.ep133.features.SampleEdit
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertThrows
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

    @Test
    fun `a synth file is told by its name, never a recording's`() {
        assertTrue(SampleFiles.isSynth("syn-0a1b2c3d-1-0-9.wav"))
        assertTrue(SampleFiles.isSynth("../x/syn-0a1b2c3d-1-0-9.wav"))
        assertFalse(SampleFiles.isSynth("smp-20261007-142301.wav"))
        assertFalse(SampleFiles.isSynth("syn/smp-1.wav"))
    }

    @Test
    fun `a synth sound is written once under its name, and a name that isn't a synth's is refused`() {
        val files = SampleFiles(File(dir, "samples"))
        val name = "syn-0a1b2c3d-1-0-9.wav"
        val a = files.writeSynth(name, byteArrayOf(1, 2, 3))
        assertEquals(name, a.name)
        assertArrayEquals(byteArrayOf(1, 2, 3), a.readBytes())
        // The same name and size: the file there is used as it is.
        a.setLastModified(1_000L)
        assertEquals(a, files.writeSynth(name, byteArrayOf(9, 9, 9)))
        assertArrayEquals(byteArrayOf(1, 2, 3), a.readBytes())
        assertEquals(1_000L, a.lastModified())
        // Another size: written again, with no .tmp left behind.
        files.writeSynth(name, byteArrayOf(4, 5))
        assertArrayEquals(byteArrayOf(4, 5), a.readBytes())
        assertEquals(listOf(name), File(dir, "samples").list()!!.toList())
        assertThrows(IllegalArgumentException::class.java) { files.writeSynth("smp-1.wav", byteArrayOf(1)) }
        assertThrows(IllegalArgumentException::class.java) { files.writeSynth("syn-1.txt", byteArrayOf(1)) }
    }

    @Test
    fun `synth files no pad change names are synth strays, and never recording strays`() {
        val files = SampleFiles(File(dir, "samples"))
        val kept = files.writeSynth("syn-00000001-1-0-9.wav", ByteArray(1)).apply { setLastModified(1_000L) }
        val left = files.writeSynth("syn-00000002-1-0-9.wav", ByteArray(1)).apply { setLastModified(1_000L) }
        val recording = files.write(0L, ByteArray(1)).apply { setLastModified(1_000L) }
        assertEquals(listOf(left.name), files.synthStrays(setOf(kept.name), before = 2_000L))
        assertEquals(listOf(kept.name, left.name), files.synthStrays(emptySet(), before = Long.MAX_VALUE))
        assertEquals(emptyList<String>(), files.synthStrays(emptySet(), before = 500L))
        // A recording is never a synth stray, and a synth file never a recording's.
        assertEquals(listOf(recording.name), files.strays(emptySet(), before = 2_000L))
    }

    @Test
    fun `a synth write cut short leaves a tmp file the sweep at start finds`() {
        val files = SampleFiles(File(dir, "samples"))
        val whole = files.writeSynth("syn-00000001-1-0-9.wav", ByteArray(1)).apply { setLastModified(1_000L) }
        // Arc closed between writing the .tmp and renaming it.
        val half = File(dir, "samples/syn-00000002-1-0-9.wav.tmp").apply { writeBytes(ByteArray(1)); setLastModified(1_000L) }
        val other = File(dir, "samples/notes.tmp").apply { writeBytes(ByteArray(1)); setLastModified(1_000L) }
        assertEquals(listOf(half.name), files.synthLeftovers(before = 2_000L))
        assertEquals(emptyList<String>(), files.synthLeftovers(before = 500L))
        // Neither sweep of whole files lists it, and the leftover sweep lists no whole file.
        assertEquals(listOf(whole.name), files.synthStrays(emptySet(), before = 2_000L))
        assertEquals(emptyList<String>(), files.strays(emptySet(), before = 2_000L))
        assertTrue(other.isFile)
    }
}
