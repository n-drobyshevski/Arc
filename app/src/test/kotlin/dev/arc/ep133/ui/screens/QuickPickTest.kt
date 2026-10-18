package dev.arc.ep133.ui.screens

import androidx.compose.ui.geometry.Rect
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.sqrt

/**
 * Hold to pick on KEYS' scale and octave words: the rows, the half-circle and the pick, as the
 * prototype has them ("C1 · Aim": by direction, the list's order, toward the middle, 128 dp).
 * At density 1, so px read as dp.
 */
class QuickPickTest {
    private val gap = QuickPick.GAP.value
    private val dead = QuickPick.DEAD.value
    private val minDx = QuickPick.MIN_DX.value

    private fun assertNear(expected: Float, actual: Float, what: String = "") = assertEquals(expected, actual, 0.01f, what)

    // ---- rows ----

    @Test
    fun `with no room below the whole list stacks up from the thumb, the last level with it`() {
        val rows = QuickPick.rows(10, roomBelow = 0f, gap = gap)
        assertEquals(10, rows.size)
        assertEquals(List(10) { (it - 9) * gap }, rows)
        // Under a row's room is no room: still level.
        assertEquals(rows, QuickPick.rows(10, roomBelow = gap - 1f, gap = gap))
    }

    @Test
    fun `with room below the foot goes down whole rows, never more than half the list`() {
        // Two rows' room (and a bit): the last two choices below the thumb.
        assertEquals(List(10) { (it - 7) * gap }, QuickPick.rows(10, roomBelow = 2.5f * gap, gap = gap))
        // Plenty: half the list below at most ((n − 1) / 2 rows), the rest above.
        assertEquals(List(10) { (it - 5) * gap }, QuickPick.rows(10, roomBelow = 1000f, gap = gap))
        assertEquals(List(9) { (it - 4) * gap }, QuickPick.rows(9, roomBelow = 1000f, gap = gap))
        // One choice sits level with the thumb; none, nothing.
        assertEquals(listOf(0f), QuickPick.rows(1, roomBelow = 1000f, gap = gap))
        assertEquals(emptyList<Float>(), QuickPick.rows(0, roomBelow = 1000f, gap = gap))
    }

    @Test
    fun `the stack is lifted where the foot doesn't fit, and comes down where the head doesn't`() {
        // Half the list would go four rows down; one fits: lifted to one.
        val lifted = QuickPick.rows(9, roomBelow = gap, gap = gap)
        assertNear(gap, lifted.last())
        assertNear(-7 * gap, lifted.first())
        // High on the screen (two rows above): as far down as the room below allows, past the half.
        val lowered = QuickPick.rows(9, roomBelow = 1000f, gap = gap, roomAbove = 2 * gap)
        assertNear(-2 * gap, lowered.first())
        assertNear(6 * gap, lowered.last())
        // But never past the room below: the fit ([QuickPick.fit]) sees that it all goes in.
        val tight = QuickPick.rows(9, roomBelow = 3 * gap, gap = gap, roomAbove = 2 * gap)
        assertNear(3 * gap, tight.last())
    }

    // ---- the half-circle ----

    @Test
    fun `the half-ellipse bows out at the thumb and narrows to the ends`() {
        val rows = QuickPick.rows(10, roomBelow = 0f, gap = gap)
        val slots = QuickPick.place(rows, rx = 128f, gap = gap, minDx = minDx)
        val ry = 9 * gap + gap / 2
        // The foot, level with the thumb: the whole radius out.
        assertNear(128f, slots.last().dx, "foot")
        assertNear(0f, slots.last().dy)
        // The middle row: on the ellipse.
        val dy = slots[5].dy
        assertNear(128f * sqrt(1f - (dy / ry) * (dy / ry)), slots[5].dx, "middle")
        // The top: the ellipse is nearly closed there, so the least way out.
        assertNear(128f * sqrt(1f - (9 * gap / ry) * (9 * gap / ry)), slots.first().dx, "top")
        assertTrue(slots.first().dx < slots[5].dx && slots[5].dx < slots.last().dx)
        // Every chip in its list place, in order.
        assertEquals((0..9).toList(), slots.map { it.i })
    }

    @Test
    fun `the ends keep clear of the thumb`() {
        // A narrow half-circle: the ends would come in to the thumb; they stop at the least dx.
        val slots = QuickPick.place(QuickPick.rows(10, 0f, gap), rx = 56f, gap = gap, minDx = minDx)
        assertNear(minDx, slots.first().dx)
        assertTrue(slots.all { it.dx >= minDx })
    }

    // ---- the pick ----

    private val fanSlots = QuickPick.place(QuickPick.rows(10, roomBelow = 2.5f * gap, gap = gap), rx = 128f, gap = gap, minDx = minDx)

    @Test
    fun `in the dead zone nothing is lit`() {
        assertNull(QuickPick.pick(0f, 0f, fanSlots, dead))
        assertNull(QuickPick.pick(10f, -10f, fanSlots, dead))
        assertNull(QuickPick.pick(-dead, 0f, fanSlots, dead))
        assertNotNull(QuickPick.pick(dead + 1f, 0f, fanSlots, dead))
    }

    @Test
    fun `the choice nearest the finger's way is lit`() {
        // Straight out: the row level with the thumb (the eighth, two above the foot).
        assertEquals(7, QuickPick.pick(30f, 0f, fanSlots, dead)?.i)
        // Toward each chip, a little way: that chip.
        for (s in fanSlots) {
            val len = sqrt(s.dx * s.dx + s.dy * s.dy)
            assertEquals(s.i, QuickPick.pick(s.dx / len * 24f, s.dy / len * 24f, fanSlots, dead)?.i, "toward ${s.i}")
        }
        // Between two chips, the nearer by angle.
        val a = fanSlots[3]
        val b = fanSlots[4]
        val mid = (a.angle * 0.7f + b.angle * 0.3f) * (Math.PI / 180).toFloat()
        assertEquals(3, QuickPick.pick(40f * kotlin.math.cos(mid), 40f * kotlin.math.sin(mid), fanSlots, dead)?.i)
    }

    @Test
    fun `a pull back past the thumb reads as straight up or down, so it reaches the ends`() {
        assertEquals(0, QuickPick.pick(-30f, -5f, fanSlots, dead)?.i)
        assertEquals(9, QuickPick.pick(-30f, 5f, fanSlots, dead)?.i)
        // Straight up and straight down: the first and the last.
        assertEquals(0, QuickPick.pick(0f, -40f, fanSlots, dead)?.i)
        assertEquals(9, QuickPick.pick(0f, 40f, fanSlots, dead)?.i)
    }

    @Test
    fun `the octave fan runs high to low, its rows mapping back to the list`() {
        // The octaves, 0 to 8 in the list: reversed, OCT 8 tops the fan and OCT 0 is at its foot.
        val octaves = (0..8).toList()
        val shown = octaves.indices.map { octaves[QuickPick.option(it, octaves.size, reversed = true)] }
        assertEquals((8 downTo 0).toList(), shown)
        // A pick by direction lands on a row; the row gives the octave. Straight up: the top row, OCT 8.
        val slots = QuickPick.place(QuickPick.rows(9, roomBelow = 0f, gap = gap), rx = 128f, gap = gap, minDx = minDx)
        val up = QuickPick.pick(0f, -40f, slots, dead)!!
        assertEquals(8, octaves[QuickPick.option(up.i, 9, reversed = true)])
        // The current octave's row (ringed) goes the same way back: OCT 4 sits on row 4, OCT 7 on row 1.
        assertEquals(4, QuickPick.option(4, 9, reversed = true))
        assertEquals(1, QuickPick.option(7, 9, reversed = true))
        for (i in octaves) assertEquals(i, QuickPick.option(QuickPick.option(i, 9, true), 9, true))
        // Unreversed (the scales): the list's order.
        assertEquals((0..9).toList(), (0..9).map { QuickPick.option(it, 10, reversed = false) })
    }

    // ---- the fit ----

    @Test
    fun `where the stack fits the row stays, where it doesn't it shrinks, then the list`() {
        // Tall: the full row.
        assertEquals(gap, QuickPick.fit(10, roomAbove = 600f, roomBelow = 0f, gap = gap, minGap = 30f))
        // A phone on its side: 300 dp for nine rows, split 110 above and 190 below.
        val g = QuickPick.fit(10, roomAbove = 110f, roomBelow = 190f, gap = gap, minGap = 30f)
        assertNotNull(g)
        assertTrue(g!! < gap && g >= 30f) { "$g" }
        val rows = QuickPick.rows(10, roomBelow = 190f, gap = g, roomAbove = 110f)
        assertTrue(-rows.first() <= 110f + 0.01f && rows.last() <= 190f + 0.01f) { "$rows" }
        // Too short even at 30 dp a row: null, and the hold opens the list.
        assertNull(QuickPick.fit(10, roomAbove = 100f, roomBelow = 150f, gap = gap, minGap = 30f))
        // One choice always fits.
        assertEquals(gap, QuickPick.fit(1, 0f, 0f, gap, 30f))
    }

    @Test
    fun `the fan opens toward the middle, as wide as the room less a chip allows`() {
        // The scale word low on a 360 x 668 phone: rightward, the radius cut to the room.
        val phone = Rect(0f, 0f, 360f, 668f)
        val left = QuickPick.fan(10, 83f, 621f, phone, 1f)!!
        assertEquals(1, left.dir)
        assertNear(360f - 83f - QuickPick.CHIP_ROOM.value, left.slots.maxOf { it.dx })
        // No room below (the edge's 30 dp), so the whole list stands above the thumb, inside the window.
        assertNear(0f, left.slots.last().dy)
        assertTrue(left.y + left.slots.first().dy >= QuickPick.EDGE.value)
        // The octave word at the row's end: leftward, the full 128 dp.
        val right = QuickPick.fan(9, 300f, 621f, phone, 1f)!!
        assertEquals(-1, right.dir)
        assertNear(QuickPick.RADIUS.value, right.slots.maxOf { it.dx })
        assertTrue(right.at(right.slots.last()).x < 300f)
        // Density: the same fan, in px.
        val dense = QuickPick.fan(10, 83f * 2.625f, 621f * 2.625f, Rect(0f, 0f, 360f * 2.625f, 668f * 2.625f), 2.625f)!!
        assertNear(left.slots.first().dx * 2.625f, dense.slots.first().dx)
        // A window too short for the list: none.
        assertNull(QuickPick.fan(10, 300f, 120f, Rect(0f, 0f, 700f, 240f), 1f))
    }
}
