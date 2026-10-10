package dev.arc.ep133.features

import dev.arc.ep133.features.SampleCapture.End
import dev.arc.ep133.features.SampleCapture.Event
import dev.arc.ep133.features.SampleCapture.State
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class SampleCaptureTest {
    // [n] mono frames from frame [at], each sample its own frame number, so a
    // take shows exactly which frames it kept; [loud] frames are 20000, over
    // a 0.5 threshold that the frame numbers (all under 16384) stay below.
    private fun ramp(at: Long, n: Int, vararg loud: Long) =
        ShortArray(n) {
            val f = at + it
            (if (f in loud) 20000L else f).toShort()
        }

    private fun feed(c: SampleCapture, at: Long, n: Int, vararg loud: Long) = c.feed(ramp(at, n, *loud), n, 1, at)

    private fun shorts(vararg v: Int) = ShortArray(v.size) { v[it].toShort() }

    private fun capture(preRoll: Int = 20) = SampleCapture(1000, 1, 1000, preRoll)

    @Test
    fun `nothing is kept while idle`() {
        val c = capture()
        assertNull(feed(c, 0, 100, 50))
        assertEquals(State.IDLE, c.state)
        assertEquals(0, c.frames)
        assertNull(c.started)
    }

    @Test
    fun `armed without a threshold, the take starts at its frame inside a block`() {
        val c = capture()
        c.arm(130, null)
        assertNull(feed(c, 0, 100))
        assertEquals(State.ARMED, c.state)
        assertEquals(Event.Started(130), feed(c, 100, 100))
        assertEquals(State.RECORDING, c.state)
        assertEquals(70, c.frames)
        assertEquals(130, c.take().first().toInt())
        assertEquals(199, c.take().last().toInt())
    }

    @Test
    fun `armed late, the take reaches back through the ring as far as it goes`() {
        val c = capture()
        feed(c, 0, 100)
        // Frame 50 has gone by, and only 80..99 are still in the ring.
        c.arm(50, null)
        assertEquals(Event.Started(80), feed(c, 100, 100))
        assertEquals(120, c.frames)
        assertEquals(80, c.take().first().toInt())

        val d = capture()
        feed(d, 0, 100)
        d.arm(95, null)
        assertEquals(Event.Started(95), feed(d, 100, 10))
        assertArrayEquals(shorts(95, 96, 97, 98, 99, 100), d.take().copyOf(6))
    }

    @Test
    fun `quiet blocks keep nothing and stay armed`() {
        val c = capture()
        c.arm(0, 0.5f)
        for (i in 0 until 3) assertNull(feed(c, i * 100L, 100))
        assertEquals(State.ARMED, c.state)
        assertEquals(0, c.frames)
        assertNull(c.started)
    }

    @Test
    fun `the take starts the pre-roll before the frame that crosses the threshold`() {
        val c = capture()
        feed(c, 0, 100)
        c.arm(100, 0.5f)
        assertEquals(Event.Started(130), feed(c, 100, 100, 150))
        assertEquals(130, c.take()[0].toInt())
        assertEquals(20000, c.take()[20].toInt())
        assertEquals(70, c.frames)
    }

    @Test
    fun `the pre-roll reaches back into the block before`() {
        val c = capture()
        c.arm(0, 0.5f)
        assertNull(feed(c, 0, 100))
        assertEquals(Event.Started(85), feed(c, 100, 100, 105))
        assertArrayEquals(shorts(85, 86, 87), c.take().copyOf(3))
        assertEquals(99, c.take()[14].toInt())
        assertEquals(20000, c.take()[20].toInt())
        assertEquals(115, c.frames)
    }

    @Test
    fun `the pre-roll goes back no further than what was fed, preRollFrames or the armed frame`() {
        // Nothing fed before the crossing's block.
        val fed = capture()
        fed.arm(0, 0.5f)
        assertEquals(Event.Started(1000), feed(fed, 1000, 100, 1005))
        assertEquals(20000, fed.take()[5].toInt())

        // A shorter pre-roll.
        val short = capture(preRoll = 5)
        short.arm(0, 0.5f)
        assertEquals(Event.Started(145), feed(short, 100, 100, 150))

        // Not before the frame it was armed at, and a crossing before that doesn't count.
        val from = capture()
        feed(from, 0, 100)
        from.arm(140, 0.5f)
        assertEquals(Event.Started(140), feed(from, 100, 100, 120, 150))
        assertEquals(140, from.take()[0].toInt())
        assertEquals(20000, from.take()[10].toInt())
    }

    @Test
    fun `frames kept beyond the pre-roll reach a late press, and the threshold still keeps only the pre-roll`() {
        // 100 frames kept, 20 of pre-roll: a press 70 frames back is still there.
        val late = SampleCapture(1000, 1, 1000, 20, keptFrames = 100)
        feed(late, 0, 100)
        late.arm(30, null)
        assertEquals(Event.Started(30), feed(late, 100, 100))
        assertEquals(30, late.take().first().toInt())
        assertEquals(170, late.frames)

        // A crossing already fed after the press is found, with 20 frames before it.
        val thr = SampleCapture(1000, 1, 1000, 20, keptFrames = 100)
        feed(thr, 0, 100, 60)
        thr.arm(10, 0.5f)
        assertEquals(Event.Started(40), feed(thr, 100, 100))
        assertEquals(40, thr.take().first().toInt())
        assertEquals(20000, thr.take()[20].toInt())

        assertThrows(IllegalArgumentException::class.java) { SampleCapture(1000, 1, 1000, 20, keptFrames = 10) }
    }

    @Test
    fun `a stop inside a later block keeps exactly the frames before it`() {
        val c = capture()
        c.arm(0, null)
        assertEquals(Event.Started(0), feed(c, 0, 100))
        c.stop(250)
        assertEquals(State.RECORDING, c.state)
        assertNull(feed(c, 100, 100))
        assertEquals(Event.Ended(End.STOPPED), feed(c, 200, 100))
        assertEquals(State.DONE, c.state)
        assertEquals(250, c.frames)
        assertEquals(249, c.take().last().toInt())
        assertNull(feed(c, 300, 100))
        assertEquals(250, c.frames)

        // A stop at a frame already fed cuts the take back at once.
        val d = capture()
        d.arm(0, null)
        feed(d, 0, 100)
        feed(d, 100, 100)
        d.stop(150)
        assertEquals(State.DONE, d.state)
        assertEquals(End.STOPPED, d.end)
        assertEquals(150, d.frames)
        assertEquals(149, d.take().last().toInt())
    }

    @Test
    fun `a stop before the threshold is crossed keeps nothing`() {
        val c = capture()
        c.arm(0, 0.5f)
        feed(c, 0, 100)
        c.stop(50)
        assertEquals(State.DONE, c.state)
        assertEquals(End.STOPPED, c.end)
        assertEquals(0, c.frames)

        // A stop the input hasn't reached: a crossing after it doesn't start the take.
        val d = capture()
        d.arm(0, 0.5f)
        feed(d, 0, 100)
        d.stop(150)
        assertEquals(State.ARMED, d.state)
        assertEquals(Event.Ended(End.STOPPED), feed(d, 100, 100, 160))
        assertEquals(0, d.frames)
        assertNull(d.started)
    }

    @Test
    fun `armed late with a threshold, frames already fed that crossed it start the take`() {
        // The crossing at 95 was fed before the arm: the take starts its
        // pre-roll before it (75), no further back than the ring (80).
        val c = capture()
        feed(c, 0, 100, 95)
        c.arm(50, 0.5f)
        assertEquals(Event.Started(80), feed(c, 100, 100))
        assertEquals(120, c.frames)
        assertEquals(80, c.take().first().toInt())
        assertEquals(20000, c.take()[15].toInt())

        // ...or the armed frame.
        val d = capture()
        feed(d, 0, 100, 95)
        d.arm(90, 0.5f)
        assertEquals(Event.Started(90), feed(d, 100, 100))
        assertEquals(110, d.frames)
        assertEquals(20000, d.take()[5].toInt())

        // A crossing before the armed frame doesn't count.
        val e = capture()
        feed(e, 0, 100, 85)
        e.arm(90, 0.5f)
        assertNull(feed(e, 100, 100))
        assertEquals(State.ARMED, e.state)

        // A stop with nothing fed since the arm keeps the frames up to it...
        val f = capture()
        feed(f, 0, 100, 95)
        f.arm(90, 0.5f)
        f.stop(98)
        assertEquals(End.STOPPED, f.end)
        assertEquals(90L, f.started)
        assertEquals(8, f.frames)
        assertEquals(20000, f.take()[5].toInt())

        // ...unless it comes before the crossing.
        val g = capture()
        feed(g, 0, 100, 95)
        g.arm(90, 0.5f)
        g.stop(95)
        assertEquals(End.STOPPED, g.end)
        assertEquals(0, g.frames)
        assertNull(g.started)

        // The threshold is checked before stereo mixes down, as it is live.
        val h = capture()
        val stereo = ShortArray(200)
        stereo[190] = 20000
        stereo[191] = -20000
        h.feed(stereo, 100, 2, 0)
        h.arm(90, 0.5f)
        assertEquals(Event.Started(90), feed(h, 100, 100))
        assertEquals(0, h.take()[5].toInt())
    }

    @Test
    fun `stereo mixes down to a mono take, and mono doubles for a stereo one`() {
        val mono = SampleCapture(1000, 1, 100)
        mono.arm(0, null)
        mono.feed(shorts(3, 4, -3, -4, 32767, 32767, -32768, -32767), 4, 2, 0)
        assertArrayEquals(shorts(3, -4, 32767, -32768), mono.take())

        val stereo = SampleCapture(1000, 2, 100)
        stereo.arm(0, null)
        stereo.feed(shorts(5, -6), 2, 1, 0)
        assertArrayEquals(shorts(5, 5, -6, -6), stereo.take())
        assertEquals(2, stereo.frames)
    }

    @Test
    fun `gain rounds half up and clips to 16 bits`() {
        val c = SampleCapture(1000, 1, 100)
        c.gain = 2f
        c.arm(0, null)
        c.feed(shorts(100, 20000, -20000, -3), 4, 1, 0)
        assertArrayEquals(shorts(200, 32767, -32768, -6), c.take())
        assertEquals(1f, c.blockPeak)

        val d = SampleCapture(1000, 1, 100)
        d.gain = 0.5f
        d.arm(0, null)
        d.feed(shorts(3, -3, 1, -1, 16384), 5, 1, 0)
        assertArrayEquals(shorts(2, -1, 1, 0, 8192), d.take())
        assertEquals(0.25f, d.blockPeak)
    }

    @Test
    fun `20 s stereo and 40 s mono end at their limit exactly`() {
        for ((channels, seconds) in listOf(2 to 20, 1 to 40)) {
            val rate = 48000
            val c = SampleCapture(rate, channels, seconds * rate)
            c.arm(0, null)
            val block = ShortArray(1000 * channels) { 7 }
            var at = 0L
            var ended: Event? = null
            while (ended == null) {
                val e = c.feed(block, 1000, channels, at)
                if (e is Event.Ended) ended = e
                at += 1000
            }
            assertEquals(Event.Ended(End.LIMIT), ended)
            assertEquals(seconds * rate, c.frames)
            assertEquals(seconds, c.seconds)
            assertEquals(seconds * rate * channels, c.take().size)
            assertNull(c.feed(block, 1000, channels, at))
        }
    }

    @Test
    fun `a schedule ignores the threshold and starts exactly inside a block`() {
        val c = capture()
        c.arm(0, 0.9f)
        c.schedule(150, 200)
        assertNull(feed(c, 0, 100))
        assertEquals(State.SCHEDULED, c.state)
        assertEquals(Event.Started(150), feed(c, 100, 100))
        assertNull(feed(c, 200, 100))
        assertEquals(Event.Ended(End.BARS), feed(c, 300, 100))
        assertEquals(200, c.frames)
        assertEquals(150, c.take().first().toInt())
        assertEquals(349, c.take().last().toInt())
    }

    @Test
    fun `a schedule starts in a later block, or starts and ends in one`() {
        val c = capture()
        c.schedule(450, 100)
        for (i in 0 until 4) assertNull(feed(c, i * 100L, 100))
        assertEquals(Event.Started(450), feed(c, 400, 100))
        assertEquals(Event.Ended(End.BARS), feed(c, 500, 100))
        assertEquals(100, c.frames)
        assertEquals(450, c.take().first().toInt())
        assertEquals(549, c.take().last().toInt())

        val d = capture()
        d.schedule(110, 30)
        assertEquals(Event.Ended(End.BARS), feed(d, 100, 100))
        assertEquals(110L, d.started)
        assertEquals(30, d.frames)
        assertEquals(139, d.take().last().toInt())
    }

    @Test
    fun `a gap in the input is filled with silence`() {
        val c = capture()
        c.arm(0, null)
        feed(c, 1, 99)
        // Frames 100..149 never came.
        feed(c, 150, 100)
        assertEquals(249, c.frames)
        assertEquals(99, c.take()[98].toInt())
        assertEquals(ShortArray(50).toList(), c.take().copyOfRange(99, 149).toList())
        assertEquals(150, c.take()[149].toInt())

        // Inside a schedule too, even when the take starts in the gap.
        val d = capture()
        d.schedule(120, 100)
        assertNull(feed(d, 0, 100))
        assertEquals(Event.Ended(End.BARS), feed(d, 200, 100))
        assertEquals(120L, d.started)
        assertEquals(100, d.frames)
        assertEquals(ShortArray(80).toList(), d.take().copyOf(80).toList())
        assertEquals(200, d.take()[80].toInt())
    }

    @Test
    fun `seconds count the recorded frames`() {
        val c = SampleCapture(10, 1, 100)
        c.arm(0, null)
        for (i in 0 until 3) feed(c, i * 10L, 10)
        assertEquals(3, c.seconds)
        feed(c, 30, 5)
        assertEquals(35, c.frames)
        assertEquals(3, c.seconds)
    }

    @Test
    fun `cancel throws the take away`() {
        val c = capture()
        c.arm(0, null)
        feed(c, 0, 100)
        c.cancel()
        assertEquals(State.DONE, c.state)
        assertEquals(End.CANCELLED, c.end)
        assertEquals(0, c.frames)
        assertEquals(0, c.take().size)
        assertNull(feed(c, 100, 100))
        assertEquals(0, c.frames)
    }

    @Test
    fun `a lost input keeps what was recorded`() {
        val c = capture()
        c.arm(0, null)
        feed(c, 0, 100)
        c.lost()
        assertEquals(State.DONE, c.state)
        assertEquals(End.LOST, c.end)
        assertEquals(100, c.frames)
        assertNull(feed(c, 100, 100))
        assertEquals(100, c.frames)

        val d = capture()
        d.arm(0, 0.5f)
        feed(d, 0, 100)
        d.lost()
        assertEquals(End.LOST, d.end)
        assertEquals(0, d.frames)
    }

    @Test
    fun `feed reports when the take starts and ends`() {
        val c = capture()
        c.arm(0, null)
        assertEquals(Event.Started(0), feed(c, 0, 100))
        c.stop(150)
        assertEquals(Event.Ended(End.STOPPED), feed(c, 100, 100))
        assertNull(feed(c, 200, 100))

        // Started and stopped in one block: the end is reported, the start is still there to read.
        val d = capture()
        d.arm(10, null)
        d.stop(30)
        assertEquals(Event.Ended(End.STOPPED), feed(d, 0, 100))
        assertEquals(10L, d.started)
        assertEquals(20, d.frames)
        assertArrayEquals(shorts(10, 11), d.take().copyOf(2))
    }
}
