package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class LearnedLinksTest {
    @Test
    fun `parse skips junk and out-of-range pairs, format round-trips`() {
        val m = LearnedLinks.parse("0:10,1:11,x:1,12:3,2:13,3")
        assertEquals(mapOf(0 to 10, 1 to 11), m)
        assertEquals(m, LearnedLinks.parse(LearnedLinks.format(m)))
        assertEquals(emptyMap<Int, Int>(), LearnedLinks.parse(null))
    }

    @Test
    fun `a restore keeps what was learned here and stays one to one`() {
        val restored = mapOf(0 to 10, 1 to 11, 2 to 12)
        // Learned after the reinstall: key 1 again (the same), key 5 as pad 12.
        val local = mapOf(1 to 11, 5 to 12)
        // Key 2's restored pad 12 now belongs to key 5, so it goes.
        assertEquals(mapOf(0 to 10, 1 to 11, 5 to 12), LearnedLinks.merge(restored, local))
        assertEquals(restored, LearnedLinks.merge(restored, emptyMap()))
    }
}
