package dev.arc.ep133.text

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class GuideTextTest {
    private val all = GuideText.sections.flatMap { it.entries }

    @Test
    fun `every entry is sourced from the official guide`() {
        assertEquals(5, GuideText.sections.size)
        assertEquals(100, all.size)
        for (s in GuideText.sections) assertTrue(s.entries.isNotEmpty(), s.title)
        for (e in all) {
            assertTrue(e.source.startsWith(GuideText.OFFICIAL_URL + "/"), e.source)
            assertTrue(e.action.isNotBlank() && e.keys.isNotBlank(), e.action)
        }
    }

    @Test
    fun `entries read as user text`() {
        val fragments = listOf("http", "Corrected", "I removed", "Citation", "anchor")
        for (e in all) {
            for (text in listOfNotNull(e.action, e.keys, e.note)) {
                for (f in fragments) assertFalse(text.contains(f), "\"$f\" in: $text")
                assertEquals(text.trim(), text)
                assertTrue(text.first().isUpperCase() || !text.first().isLetter(), text)
                // Plain printable text only: no invisible or typographic characters.
                assertTrue(text.all { it.code in 0x20..0x7E }, text)
            }
        }
    }

    @Test
    fun `no combination is listed twice`() {
        fun norm(s: String) = s.lowercase().filter { it.isLetterOrDigit() }
        val keys = all.map { norm(it.keys) }
        assertEquals(keys.size, keys.toSet().size, keys.groupBy { it }.filter { it.value.size > 1 }.keys.toString())
        val actions = all.map { norm(it.action) }
        assertEquals(actions.size, actions.toSet().size)
    }

    @Test
    fun `filter matches every word`() {
        assertEquals(GuideText.sections, GuideText.filter("  "))
        val tempo = GuideText.filter("tempo SAMPLE")
        assertTrue(tempo.isNotEmpty())
        for (s in tempo) for (e in s.entries) {
            val text = (e.action + " " + e.keys + " " + e.note.orEmpty()).lowercase()
            assertTrue("tempo" in text && "sample" in text, e.action)
        }
        assertTrue(GuideText.filter("zzzz-no-such-combo").isEmpty())
    }
}
