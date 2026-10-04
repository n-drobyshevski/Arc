package dev.arc.ep133.data

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ConvertersTest {
    private val c = Converters()

    @Test
    fun `lists and slot maps round-trip as JSON`() {
        assertEquals("[1,2,150]", c.fromIntList(listOf(1, 2, 150)))
        assertEquals(listOf(1, 2, 150), c.toIntList("[1,2,150]"))
        val m = mapOf(1 to listOf(1, 2), 4 to listOf(150), 5 to emptyList())
        val s = c.fromSlotMap(m)
        assertEquals("""{"1":[1,2],"4":[150],"5":[]}""", s)
        assertEquals(m, c.toSlotMap(s))
    }
}
