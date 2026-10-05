package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PianoTest {
    // OCT 4 at two octaves on a Pixel 7's landscape plate: 15 whites of 52, 280 tall.
    private val white = 52f
    private val h = 280f
    private val keys = Piano.layout(Piano.range(4, 15), 15 * white, h)
    private val slop = 8f

    private fun at(x: Float, y: Float, current: Int? = null) = Piano.keyAt(keys, x, y, current, slop)

    @Test
    fun `the range starts an octave under OCT's C`() {
        assertEquals(48, Piano.lowest(4))
        assertEquals(48..72, Piano.range(4, 15))
        // One and a half octaves: C3 to G4.
        assertEquals(48..67, Piano.range(4, 12))
        assertEquals(48..60, Piano.range(4, 8))
        // Three octaves from C7 would pass 127: the plate ends at G9.
        assertEquals(96..127, Piano.range(8, 22))
        assertEquals(0..36, Piano.range(0, 22))
        assertTrue(Piano.range(4, 0).isEmpty())
    }

    @Test
    fun `as many whites as fit 44 dp each, else none`() {
        assertEquals(0, Piano.whitesFor(330f))
        assertEquals(8, Piano.whitesFor(500f))
        assertEquals(12, Piano.whitesFor(634f))
        assertEquals(15, Piano.whitesFor(809f))
        assertEquals(22, Piano.whitesFor(1200f))
        assertEquals(8, Piano.whitesFor(352f))
        assertEquals(0, Piano.whitesFor(351f))
    }

    @Test
    fun `black keys sit on the seams, drawn narrower than they are hit`() {
        assertEquals(25, keys.size)
        assertEquals(15, keys.count { !it.black })
        assertEquals((48..72).toList(), keys.map { it.note })
        assertEquals(listOf(49, 51, 54, 56, 58), keys.filter { it.black }.take(5).map { it.note })
        assertTrue(Piano.isBlack(61))
        assertFalse(Piano.isBlack(64))
        val c = keys[0]
        assertEquals(KeyRect(0f, 0f, white, h), c.rect)
        assertEquals(c.rect, c.hitRect)
        val cSharp = keys[1]
        assertEquals(white, cSharp.rect.left + cSharp.rect.width / 2, 1e-3f)
        assertEquals(white * 0.6f, cSharp.rect.width, 1e-3f)
        assertEquals(h * 0.62f, cSharp.rect.height, 1e-3f)
        assertEquals(white * 0.72f, cSharp.hitRect.width, 1e-3f)
        assertEquals(white, cSharp.hitRect.left + cSharp.hitRect.width / 2, 1e-3f)
        // F# sits between F (the 4th white) and G.
        val fSharp = keys.first { it.note == 54 }
        assertEquals(4 * white, fSharp.rect.left + fSharp.rect.width / 2, 1e-3f)
        assertEquals(15 * white, keys.last().rect.right, 1e-3f)
    }

    @Test
    fun `a black key is hit wider than drawn, and the whites below it`() {
        val y = h * 0.3f
        // Just inside the hit band either side of the C–D seam, wider than the drawn key.
        assertEquals(49, at(white + white * 0.35f, y))
        assertEquals(49, at(white - white * 0.35f, y))
        assertEquals(50, at(white + white * 0.37f, y))
        assertEquals(48, at(white - white * 0.37f, y))
        // Under the black key's foot, the whites.
        assertEquals(48, at(white - 1f, h * 0.62f + 1f))
        assertEquals(50, at(white + 1f, h * 0.62f + 1f))
    }

    @Test
    fun `sliding up from the bottom of C into C# lets go of C, then plays C#`() {
        val t = NoteTouches()
        val x = white * 0.8f
        var current = at(x, h * 0.9f)
        assertEquals(48, current)
        assertEquals(listOf(NoteEvent.Press(48)), t.down(1, current!!))
        val events = ArrayList<NoteEvent>()
        // Up the key in steps: C holds until the finger is a slop inside C#.
        var y = h * 0.9f
        while (y > 10f) {
            y -= 4f
            val next = at(x, y, current)
            if (y > h * 0.62f - slop) assertEquals(48, next)
            events += t.move(1, next)
            current = next
        }
        assertEquals(listOf(NoteEvent.Release(48), NoteEvent.Press(49)), events)
        assertEquals(setOf(49), t.held)
    }

    @Test
    fun `C# slid down past its foot by less than the slop stays C#`() {
        val x = white + 2f
        assertEquals(49, at(x, h * 0.62f + 2f, current = 49))
        // A fresh touch there is D's.
        assertEquals(50, at(x, h * 0.62f + 2f))
        // Past the slop, the white under the finger.
        assertEquals(50, at(x, h * 0.62f + slop + 1f, current = 49))
        // Sideways too: C# holds a slop past its hit edge, over C.
        val edge = white - white * 0.36f
        assertEquals(49, at(edge - slop + 1f, h * 0.3f, current = 49))
        assertEquals(48, at(edge - slop - 1f, h * 0.3f, current = 49))
    }

    @Test
    fun `a white key holds to a slop past its sides`() {
        val y = h * 0.9f
        assertEquals(48, at(white + slop - 1f, y, current = 48))
        assertEquals(50, at(white + slop + 1f, y, current = 48))
        // And from D back toward C.
        assertEquals(50, at(white - slop + 1f, y, current = 50))
        assertEquals(48, at(white - slop - 1f, y, current = 50))
        // Not yet a slop inside C#'s hit band: still C.
        val band = white - white * 0.36f
        assertEquals(48, at(band + slop - 1f, h * 0.3f, current = 48))
        assertEquals(49, at(band + slop + 1f, h * 0.3f, current = 48))
    }

    @Test
    fun `off the plate is no key`() {
        assertNull(at(-1f, h / 2))
        assertNull(at(15 * white, h / 2))
        assertNull(at(white / 2, -1f))
        assertNull(at(white / 2, h))
        // A finger on a key keeps it a slop over the edge, then lets go.
        assertEquals(48, at(-slop + 1f, h * 0.9f, current = 48))
        assertNull(at(-slop - 1f, h * 0.9f, current = 48))
        assertNull(at(white / 2, h + slop + 1f, current = 48))
        // A note no longer on the plate (after OCT changed) is a fresh touch.
        assertEquals(48, at(white / 2, h * 0.9f, current = 30))
        assertTrue(Piano.layout(IntRange.EMPTY, 100f, 100f).isEmpty())
    }

    @Test
    fun `keys are marked against the key and scale`() {
        // A minor: A is the root, C and F are in it, F# and B flat aren't.
        val a = 9
        assertEquals(KeyMark.ROOT, Piano.mark(57, a, Scale.MINOR))
        assertEquals(KeyMark.ROOT, Piano.mark(69, a, Scale.MINOR))
        assertEquals(KeyMark.IN, Piano.mark(60, a, Scale.MINOR))
        assertEquals(KeyMark.IN, Piano.mark(65, a, Scale.MINOR))
        assertEquals(KeyMark.OUT, Piano.mark(66, a, Scale.MINOR))
        assertEquals(KeyMark.OUT, Piano.mark(58, a, Scale.MINOR))
        assertEquals(listOf(57, 59, 60, 62, 64, 65, 67), (57..68).filter { Piano.mark(it, a, Scale.MINOR) != KeyMark.OUT })
        // D blues: D F G G# A C.
        assertEquals(listOf(62, 65, 67, 68, 69, 72), (62..73).filter { Piano.mark(it, 2, Scale.BLUES) != KeyMark.OUT })
        assertEquals(KeyMark.ROOT, Piano.mark(50, 2, Scale.BLUES))
        assertEquals(KeyMark.OUT, Piano.mark(64, 2, Scale.BLUES))
        // Chromatic: the root, and every other note in.
        assertEquals(KeyMark.ROOT, Piano.mark(0, 0, Scale.CHROMATIC))
        assertEquals(11, (61..71).count { Piano.mark(it, 0, Scale.CHROMATIC) == KeyMark.IN })
    }
}
