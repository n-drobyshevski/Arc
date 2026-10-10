package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class ProjectStepTest {
    @Test
    fun `connected, PROJECT steps 1 to 9 and wraps`() {
        assertEquals(listOf(2, 3, 4, 5, 6, 7, 8, 9, 1), (1..9).map(ProjectStep::next))
        // Nothing read yet, or a number the key doesn't have: start at 1.
        assertEquals(1, ProjectStep.next(null))
        assertEquals(1, ProjectStep.next(0))
        assertEquals(1, ProjectStep.next(10))
    }

    @Test
    fun `offline, the views are the last read's project and the factory pack's`() {
        val pack = listOf(1, 2, 5)
        assertEquals(listOf(1, 2, 5), ProjectStep.offlineViews(null, pack))
        // The last read in the middle, and one the pack has too: each number once.
        assertEquals(listOf(1, 2, 3, 5), ProjectStep.offlineViews(3, pack))
        assertEquals(listOf(1, 2, 5), ProjectStep.offlineViews(2, pack))
        // Out of range on either side is dropped.
        assertEquals(listOf(1, 9), ProjectStep.offlineViews(12, listOf(9, 0, 1, 10)))
        // No pack: the last read alone.
        assertEquals(listOf(4), ProjectStep.offlineViews(4, emptyList()))
        assertEquals(emptyList<Int>(), ProjectStep.offlineViews(null, emptyList()))
    }

    @Test
    fun `offline stepping wraps, and needs two views`() {
        val views = listOf(1, 3, 5)
        assertEquals(3, ProjectStep.nextOffline(1, views))
        assertEquals(5, ProjectStep.nextOffline(3, views))
        assertEquals(1, ProjectStep.nextOffline(5, views))
        // A last read with no project is shown first but isn't in the cycle.
        assertEquals(1, ProjectStep.nextOffline(null, views))
        assertEquals(5, ProjectStep.nextOffline(4, views))
        // No pack (even with a last read): nothing to step to, the key greys out.
        assertNull(ProjectStep.nextOffline(4, listOf(4)))
        assertNull(ProjectStep.nextOffline(null, emptyList()))
    }

    @Test
    fun `a view's source`() {
        val pack = listOf(1, 2, 5)
        assertEquals(ProjectSource.LAST_READ, ProjectStep.sourceOf(2, 2, pack))
        assertEquals(ProjectSource.FACTORY, ProjectStep.sourceOf(1, 2, pack))
        assertEquals(ProjectSource.LAST_READ, ProjectStep.sourceOf(3, 3, pack))
        assertNull(ProjectStep.sourceOf(4, 3, pack))
        assertNull(ProjectStep.sourceOf(12, 12, pack))
    }
}
