package dev.arc.ep133.features

import dev.arc.ep133.features.NoteEvent.Press
import dev.arc.ep133.features.NoteEvent.Release
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class NoteTouchesTest {
    @Test
    fun `a slide lets go of each note and plays the next`() {
        val t = NoteTouches()
        assertEquals(listOf(Press(60)), t.down(1, 60))
        assertEquals(emptyList<NoteEvent>(), t.move(1, 60))
        assertEquals(listOf(Release(60), Press(62)), t.move(1, 62))
        assertEquals(listOf(Release(62), Press(64)), t.move(1, 64))
        assertEquals(setOf(64), t.held)
        // Off the plate lets go; back on plays again.
        assertEquals(listOf(Release(64)), t.move(1, null))
        assertEquals(emptyList<NoteEvent>(), t.move(1, null))
        assertEquals(listOf(Press(65)), t.move(1, 65))
        assertEquals(listOf(Release(65)), t.up(1))
        assertTrue(t.held.isEmpty())
        assertEquals(emptyList<NoteEvent>(), t.up(1))
    }

    @Test
    fun `two fingers on one note, it sounds until the last lifts`() {
        val t = NoteTouches()
        t.down(1, 60)
        // The second finger strikes it again.
        assertEquals(listOf(Press(60)), t.down(2, 60))
        assertEquals(emptyList<NoteEvent>(), t.up(1))
        assertEquals(setOf(60), t.held)
        assertEquals(listOf(Release(60)), t.up(2))
        assertTrue(t.held.isEmpty())
    }

    @Test
    fun `a slide onto a held note strikes it again, and leaving keeps it for the other finger`() {
        val t = NoteTouches()
        t.down(1, 60)
        t.down(2, 64)
        assertEquals(listOf(Release(64), Press(62)), t.move(2, 62))
        assertEquals(listOf(Release(62), Press(60)), t.move(2, 60))
        // Finger 2 slides on: 60 stays, held by finger 1.
        assertEquals(listOf(Press(59)), t.move(2, 59))
        assertEquals(setOf(60, 59), t.held)
        // A finger landing again without its lift: its old note goes first.
        assertEquals(listOf(Release(59), Press(59)), t.down(2, 59))
    }

    @Test
    fun `every finger lifting at once lets go of every note`() {
        val t = NoteTouches()
        t.down(1, 60)
        t.down(2, 64)
        t.down(3, 67)
        t.down(4, 64)
        // A cancelled gesture reports every pointer up together.
        val events = listOf(1L, 2, 3, 4).flatMap { t.up(it) }
        assertEquals(listOf(Release(60), Release(67), Release(64)), events)
        assertTrue(t.held.isEmpty())
    }

    @Test
    fun `releaseAll lets go of each held note once`() {
        val t = NoteTouches()
        t.down(1, 60)
        t.down(2, 60)
        t.down(3, 67)
        assertEquals(listOf(Release(60), Release(67)), t.releaseAll())
        assertTrue(t.held.isEmpty())
        assertEquals(emptyList<NoteEvent>(), t.releaseAll())
        // Fingers from before don't hold anything any more.
        assertEquals(emptyList<NoteEvent>(), t.up(1))
        assertEquals(listOf(Press(72)), t.down(1, 72))
    }
}
