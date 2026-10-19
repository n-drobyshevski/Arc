package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test

class ArpTest {
    private val pad = PhysicalPad(0, 4)
    private fun key(semi: Int) = ArpNote(pad, semi)

    // DO MI SOL, pressed SOL, DO, MI.
    private val g = key(7)
    private val c = key(0)
    private val e = key(4)
    private val held = listOf(g, c, e)

    private fun semis(notes: List<ArpNote>) = notes.map { it.semitones }

    @Test
    fun `one octave, every order`() {
        assertEquals(listOf(7, 0, 4), semis(Arp.cycle(held, ArpOrder.PLAYED, 1)))
        assertEquals(listOf(0, 4, 7), semis(Arp.cycle(held, ArpOrder.UP, 1)))
        assertEquals(listOf(7, 4, 0), semis(Arp.cycle(held, ArpOrder.DOWN, 1)))
        assertEquals(listOf(0, 4, 7, 4), semis(Arp.cycle(held, ArpOrder.UP_DOWN, 1)))
        assertEquals(listOf(0, 4, 7), semis(Arp.cycle(held, ArpOrder.RANDOM, 1)))
    }

    @Test
    fun `one and two notes`() {
        for (o in ArpOrder.entries) assertEquals(listOf(4), semis(Arp.cycle(listOf(e), o, 1)))
        val two = listOf(e, c)
        assertEquals(listOf(4, 0), semis(Arp.cycle(two, ArpOrder.PLAYED, 1)))
        assertEquals(listOf(0, 4), semis(Arp.cycle(two, ArpOrder.UP, 1)))
        assertEquals(listOf(4, 0), semis(Arp.cycle(two, ArpOrder.DOWN, 1)))
        assertEquals(listOf(0, 4), semis(Arp.cycle(two, ArpOrder.UP_DOWN, 1)))
        assertEquals(listOf(0, 4), semis(Arp.cycle(two, ArpOrder.RANDOM, 1)))
        for (o in ArpOrder.entries) assertEquals(emptyList<ArpNote>(), Arp.cycle(emptyList(), o, 2))
    }

    @Test
    fun `octaves add the notes again an octave up, UP_DOWN mirroring the whole climb`() {
        assertEquals(listOf(7, 0, 4, 19, 12, 16), semis(Arp.cycle(held, ArpOrder.PLAYED, 2)))
        assertEquals(listOf(0, 4, 7, 12, 16, 19, 24, 28, 31), semis(Arp.cycle(held, ArpOrder.UP, 3)))
        assertEquals(listOf(31, 28, 24, 19, 16, 12, 7, 4, 0), semis(Arp.cycle(held, ArpOrder.DOWN, 3)))
        assertEquals(listOf(0, 4, 7, 12, 16, 19, 16, 12, 7, 4), semis(Arp.cycle(held, ArpOrder.UP_DOWN, 2)))
        assertEquals(listOf(4, 16, 28), semis(Arp.cycle(listOf(e), ArpOrder.UP, 3)))
        assertEquals(listOf(4, 16, 28, 16), semis(Arp.cycle(listOf(e), ArpOrder.UP_DOWN, 3)))
        assertEquals(listOf(0, 4, 12, 16), semis(Arp.cycle(listOf(e, c), ArpOrder.RANDOM, 2)))
        // Held to 1..3.
        assertEquals(Arp.cycle(held, ArpOrder.UP, 3), Arp.cycle(held, ArpOrder.UP, 9))
        assertEquals(Arp.cycle(held, ArpOrder.UP, 1), Arp.cycle(held, ArpOrder.UP, 0))
    }

    @Test
    fun `UP keeps notes of one pitch as pressed, and the velocity goes along`() {
        val a = ArpNote(PhysicalPad(0, 1), 0, 90)
        val b = ArpNote(PhysicalPad(0, 2), 0, 30)
        assertEquals(listOf(b, a), Arp.cycle(listOf(b, a), ArpOrder.UP, 1))
        assertEquals(30, Arp.cycle(listOf(b), ArpOrder.UP, 2)[1].velocity)
    }

    @Test
    fun `a PADS hit is never transposed and plays once`() {
        val hit = ArpNote(PhysicalPad(1, 3), null, 100)
        assertEquals(listOf(hit), Arp.cycle(listOf(hit), ArpOrder.UP, 3))
        assertEquals(listOf(hit, e, key(16)), Arp.cycle(listOf(e, hit), ArpOrder.UP, 2))
        // Note repeat: every pad held, together, as held.
        val pads = listOf(hit, ArpNote(PhysicalPad(1, 4), null))
        assertSame(pads, Arp.repeatNotes(pads))
    }

    @Test
    fun `the note on each step goes round the cycle`() {
        val cycle = Arp.cycle(held, ArpOrder.UP_DOWN, 1)
        assertEquals(listOf(0, 4, 7, 4, 0, 4, 7, 4), (0L until 8).map { Arp.noteAt(it, cycle, ArpOrder.UP_DOWN, 0)!!.semitones })
        assertEquals(4, Arp.noteAt(-1, cycle, ArpOrder.UP_DOWN, 0)!!.semitones)
        assertEquals(e, Arp.noteAt(3_000_000_001, Arp.cycle(held, ArpOrder.UP, 1), ArpOrder.PLAYED, 7))
        assertNull(Arp.noteAt(3, emptyList(), ArpOrder.UP, 0))
        assertNull(Arp.noteAt(3, emptyList(), ArpOrder.RANDOM, 7))
    }

    @Test
    fun `RANDOM picks the same notes as the web version`() {
        val five = (0 until 5).map(::key)
        assertEquals(listOf(3, 2, 0, 3, 2, 0, 3, 2), (0L until 8).map { Arp.noteAt(it, five, ArpOrder.RANDOM, 7)!!.semitones })
        val three = (0 until 3).map(::key)
        assertEquals(listOf(1, 1, 0, 2, 2, 1, 0, 0), (0L until 8).map { Arp.noteAt(it, three, ArpOrder.RANDOM, 7)!!.semitones })
        assertEquals(listOf(4, 1), listOf(-1L, -2L).map { Arp.noteAt(it, five, ArpOrder.RANDOM, 7)!!.semitones })
        // As the web's test has it: DO MI SOL over two octaves, and steps before the run and past 2^32 (only the low 32 bits count).
        val six = Arp.cycle(listOf(c, e, g), ArpOrder.RANDOM, 2)
        val at = { steps: List<Long> -> steps.map { six.indexOf(Arp.noteAt(it, six, ArpOrder.RANDOM, 7)) } }
        assertEquals(listOf(1, 1, 0, 5, 5, 4, 3, 3), at((0L until 8).toList()))
        assertEquals(listOf(1, 1, 5), at(listOf(-1L, 4_294_967_296L, 4_294_967_299L)))
    }

    @Test
    fun `gate, velocity and settings`() {
        assertEquals(12, Arp.gateTicks(Timing.SIXTEENTH, 50))
        assertEquals(24, Arp.gateTicks(Timing.SIXTEENTH, 100))
        assertEquals(2, Arp.gateTicks(Timing.SIXTEENTH, 10))
        assertEquals(1, Arp.gateTicks(Timing.THIRTY_SECOND, 1))
        assertEquals(1, Arp.gateTicks(Timing.OFF, 50))
        assertEquals(5, Arp.gateTicks(Timing.SIXTEENTH_T, 30))
        assertEquals(1f, Arp.velocityGain(127))
        assertEquals(1f, Arp.velocityGain(300))
        assertEquals(0.25f, Arp.velocityGain(64), 0.01f)
        assertEquals(Arp.velocityGain(1), Arp.velocityGain(-5))
        val s = ArpSettings()
        assertEquals(ArpSettings(ArpOrder.PLAYED, 1, 50, false), s)
        assertEquals(3, s.withOctaves(5).octaves)
        assertEquals(1, s.withOctaves(0).octaves)
        assertEquals(10, s.withGate(2).gate)
        assertEquals(100, s.withGate(150).gate)
        assertEquals(ArpOrder.DOWN, s.withOrder(ArpOrder.DOWN).order)
        assertEquals(true, s.withLatch(true).latch)
        assertEquals(listOf("played", "up", "down", "updown", "random"), ArpOrder.entries.map { it.id })
        assertEquals(ArpOrder.UP_DOWN, ArpOrder.of("updown"))
        assertNull(ArpOrder.of("UP"))
    }
}
