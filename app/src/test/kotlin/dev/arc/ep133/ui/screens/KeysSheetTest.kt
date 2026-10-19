package dev.arc.ep133.ui.screens

import dev.arc.ep133.features.KeyMark.IN
import dev.arc.ep133.features.KeyMark.OUT
import dev.arc.ep133.features.KeyMark.ROOT
import dev.arc.ep133.features.Scale
import dev.arc.ep133.text.MirrorText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** The KEYS sheet's scale rows: each scale's twelve semitones as dots, and what a screen reader hears of the row. */
class KeysSheetTest {
    @Test
    fun `every scale has twelve dots, the first its root`() {
        for (s in Scale.entries) {
            val dots = scaleDots(s)
            assertEquals(12, dots.size, s.name)
            assertEquals(ROOT, dots[0], s.name)
            assertEquals(1, dots.count { it == ROOT }, s.name)
        }
    }

    @Test
    fun `the root and the scale's other notes are as many as its intervals`() {
        for (s in Scale.entries) {
            assertEquals(s.intervals.size, scaleDots(s).count { it != OUT }, s.name)
        }
    }

    @Test
    fun `major is filled on the white keys from C`() {
        assertEquals(listOf(ROOT, OUT, IN, OUT, IN, IN, OUT, IN, OUT, IN, OUT, IN), scaleDots(Scale.MAJOR))
    }

    @Test
    fun `minor has its flat third, sixth and seventh`() {
        assertEquals(listOf(ROOT, OUT, IN, IN, OUT, IN, OUT, IN, IN, OUT, IN, OUT), scaleDots(Scale.MINOR))
    }

    @Test
    fun `blues has its flat fifth beside the fifth`() {
        assertEquals(listOf(ROOT, OUT, OUT, IN, OUT, IN, IN, IN, OUT, OUT, IN, OUT), scaleDots(Scale.BLUES))
    }

    @Test
    fun `chromatic is every note`() {
        assertEquals(listOf(ROOT) + List(11) { IN }, scaleDots(Scale.CHROMATIC))
    }

    @Test
    fun `a row says its scale and how many notes`() {
        assertEquals("Major, 7 notes", MirrorText.scaleRow(Scale.MAJOR))
        assertEquals("Major penta, 5 notes", MirrorText.scaleRow(Scale.MAJOR_PENTATONIC))
        assertEquals("Chromatic, 12 notes", MirrorText.scaleRow(Scale.CHROMATIC))
    }
}
