package dev.arc.ep133.features

import dev.arc.ep133.text.BackupDevice
import dev.arc.ep133.text.BackupRecord
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File

class PadSoundsTest {
    @TempDir
    lateinit var dir: File

    private var clock = 0L
    private fun cache(cap: Long = 1000) = PadSoundCache(dir, cap) { ++clock }

    @Test
    fun `a copy counts while the slot keeps its name, and survives a restart`() {
        val c = cache()
        c.put(5, "kick", 100, ByteArray(10) { 1 })
        assertArrayEquals(ByteArray(10) { 1 }, c.get(5, "kick"))
        assertArrayEquals(ByteArray(10) { 1 }, c.get(5, "Kick.wav")) // same name, other spelling
        assertNull(c.get(5, "snare")) // the slot holds another sound now
        assertNull(c.get(6, "kick"))
        assertTrue(c.fresh(5, "kick", 100))
        assertFalse(c.fresh(5, "kick", 120)) // replaced by a sound of the same name
        // A new cache on the same folder reads the index back.
        assertArrayEquals(ByteArray(10) { 1 }, cache().get(5, "kick"))
        assertEquals(10, cache().bytes())
    }

    @Test
    fun `past the cap the least recently played go first`() {
        val c = cache(cap = 25)
        c.put(1, "a", 1, ByteArray(10))
        c.put(2, "b", 1, ByteArray(10))
        c.get(1, "a") // 1 is now newer than 2
        c.put(3, "c", 1, ByteArray(10))
        assertNull(c.get(2, "b"))
        assertTrue(c.fresh(1, "a", 1))
        assertTrue(c.fresh(3, "c", 1))
        assertEquals(20, c.bytes())
    }

    @Test
    fun `a broken index reads as empty, and clear empties it`() {
        dir.resolve("index.json").writeText("not json")
        val c = cache()
        assertNull(c.get(1, "a"))
        c.put(1, "a", 1, ByteArray(3))
        c.clear()
        assertNull(c.get(1, "a"))
        assertEquals(0, c.bytes())
    }

    private fun backup(id: String, at: Long) = BackupRecord(id, id, "", at, "device", null, BackupDevice(), 0, 0, emptyList(), emptyList(), emptyMap(), 0)

    @Test
    fun `the newest backup with that sound in that slot`() {
        val old = backup("old", 1)
        val new = backup("new", 2)
        val other = backup("other", 3)
        val names = listOf(
            NameEntry("old", 5, "kick"),
            NameEntry("new", 5, "KICK"),
            NameEntry("other", 5, "snare"),
            NameEntry("other", 6, "kick"),
        )
        assertEquals(new, PadSounds.newestBackupWith(5, "kick", names, listOf(old, new, other)))
        assertNull(PadSounds.newestBackupWith(7, "kick", names, listOf(old, new, other)))
    }
}
