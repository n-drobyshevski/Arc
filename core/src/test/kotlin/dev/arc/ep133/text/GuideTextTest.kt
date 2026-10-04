package dev.arc.ep133.text

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

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

    @Test
    fun `combos parse, and only draw keys their own text names`() {
        val withCombo = all.filter { it.combo != null }
        assertEquals(93, withCombo.size)
        for (e in withCombo) {
            val combo = GuideCombo.parse(e.combo!!)
            val text = e.keys
            val lower = text.lowercase()
            fun has(s: String) = lower.contains(s.lowercase())
            for (option in combo.options) for (step in option) {
                assertTrue(step.keys.isNotEmpty(), e.combo)
                for (k in step.keys) {
                    val named = when (k.label) {
                        "+" -> has("+") || has("plus")
                        "-" -> has("-")
                        "A-D" -> has("A-D") || has("group")
                        "A", "B", "C", "D" -> Regex("\\b${k.label}\\b").containsMatchIn(text)
                        "1-9" -> has("1-9")
                        "0-9" -> has("type") || has("number") || has("code") || text.any { it.isDigit() }
                        else -> has(k.label)
                    }
                    assertTrue(named, "${k.label} is not in: $text")
                    val actionNamed = when (k.action) {
                        null -> true
                        KeyAction.HOLD -> has("hold")
                        KeyAction.DIAL -> k.kind == KeyKind.PAD
                        KeyAction.TURN -> k.kind == KeyKind.KNOB
                        KeyAction.MOVE -> k.kind == KeyKind.FADER
                        KeyAction.TWICE -> has("twice")
                    }
                    assertTrue(actionNamed, "${k.action} on ${k.label} in: $text")
                }
            }
            // The context line only repeats what the text (or the action) says.
            combo.context?.let { ctx ->
                val words = ctx.lowercase().split(Regex("[^a-z-]+")).filter { it.length > 2 && it != "the" }
                for (w in words) assertTrue((lower + " " + e.action.lowercase()).contains(w), "\"$w\" (context) not in: $text")
            }
        }
    }

    @Test
    fun `combo notation`() {
        val c = GuideCombo.parse("[In SOUND mode] hold:SHIFT + -/+ > turn:KNOB X / KNOB Y | x2:C")
        assertEquals("In SOUND mode", c.context)
        assertEquals(2, c.options.size)
        val first = c.options[0]
        assertEquals(
            listOf(KeyCap("SHIFT", KeyKind.LIGHT, KeyAction.HOLD), KeyCap("-", KeyKind.LIGHT), KeyCap("+", KeyKind.LIGHT)),
            first[0].keys,
        )
        assertEquals(ComboStep(listOf(KeyCap("KNOB X", KeyKind.KNOB, KeyAction.TURN), KeyCap("KNOB Y", KeyKind.KNOB)), alternatives = true), first[1])
        assertEquals(KeyCap("C", KeyKind.DARK, KeyAction.TWICE), c.options[1][0].keys.single())
        assertThrows<IllegalStateException> { GuideCombo.parse("hold:NOPE") }
        assertThrows<IllegalStateException> { GuideCombo.parse("spin:SHIFT") }
        assertThrows<IllegalArgumentException> { GuideCombo.parse("SHIFT + A / B") }
        assertEquals("FX", GuideText.tab(GuideText.sections[3]))
        assertEquals("SOUNDS", GuideText.tab(GuideText.sections[0]))
    }
}
