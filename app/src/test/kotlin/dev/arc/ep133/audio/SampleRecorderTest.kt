package dev.arc.ep133.audio

import dev.arc.ep133.features.FrameClock
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.SampleCapture
import dev.arc.ep133.features.SampleInput
import dev.arc.ep133.features.SamplePhase
import dev.arc.ep133.features.SampleSource
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asCoroutineDispatcher
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.concurrent.Executor
import kotlin.coroutines.CoroutineContext

/**
 * SAMPLE's recorder with a fake input and a fake Live mix fed by hand:
 * a press or release at a time lands on the frame of that time, the
 * threshold keeps its pre-roll, latched and capped takes end as they
 * should, and closing or losing the input keeps what was recorded.
 */
class SampleRecorderTest {
    // 1000 frames a second: a frame a millisecond, so times read as frames.
    private val rate = 1000
    private val pad = PhysicalPad(0, 7)
    private val mic = SampleInput(SampleSource.MIC, false)

    private fun ms(n: Long) = n * 1_000_000L

    private class FakeInput(override val rate: Int, override val channels: Int) : SampleRecorder.Input {
        var started = false
        var closed = false
        var fail: String? = null

        override fun start() {
            fail?.let { throw IllegalStateException(it) }
            started = true
        }

        override fun close() {
            closed = true
        }
    }

    private class FakeMix(override var mixRate: Int?) : MixSource {
        override var sampleTap: MixTap? = null
    }

    // Dispatchers.Main.immediate on the main thread: a launch runs in place, what it dispatches waits in [posted].
    private class Immediate : CoroutineDispatcher() {
        val posted = ArrayDeque<Runnable>()

        override fun isDispatchNeeded(context: CoroutineContext) = false

        override fun dispatch(context: CoroutineContext, block: Runnable) {
            posted.add(block)
        }
    }

    // The recorder's scope when [queued]: what it posts waits in [posted] until run, as on a busy main thread.
    private inner class Rig(inChannels: Int = 1, queued: Boolean = false, immediate: Immediate? = null) {
        val mix = FakeMix(rate)
        val input = FakeInput(rate, inChannels)
        lateinit var sink: SampleRecorder.Sink
        var now = 0L
        val posted = immediate?.posted ?: ArrayDeque<Runnable>()
        private val dispatcher = immediate ?: if (queued) Executor { posted.add(it) }.asCoroutineDispatcher() else Dispatchers.Unconfined
        val recorder = SampleRecorder(mix, { _, s -> sink = s; input }, CoroutineScope(dispatcher)) { now }
        val takes = mutableListOf<SampleTake>()
        val lost = mutableListOf<String>()
        val phases = mutableListOf<SamplePhase>()
        var fed = 0L

        init {
            recorder.onDone = { takes += it }
            recorder.onLost = { _, why -> lost += why }
        }

        fun open(input: SampleInput = mic, gainDb: Float = 0f): String? = recorder.open(input, gainDb)

        // [frames] frames whose samples are their own frame numbers (so a take shows where it came from), or [value].
        fun feed(frames: Int, value: Short? = null, channels: Int = input.channels) {
            val pcm = ShortArray(frames * channels) { i -> value ?: (fed + i / channels).toShort() }
            sink.block(pcm, frames, fed)
            fed += frames
            phases += recorder.phase.value
        }
    }

    private fun ramp(from: Int, until: Int) = ShortArray(until - from) { (from + it).toShort() }

    @Test
    fun `a held pad records from its press to its release`() {
        val r = Rig()
        assertNull(r.open())
        assertTrue(r.input.started)
        r.sink.clock(FrameClock(0, 0, rate))
        r.feed(50)
        assertTrue(r.recorder.arm(pad, ms(100), latched = false, maxFrames = 40_000))
        r.feed(150)
        assertEquals(SamplePhase.Recording(pad, 0, 40, false), r.recorder.phase.value)
        r.recorder.stop(ms(300))
        r.feed(200)
        assertEquals(1, r.takes.size)
        val t = r.takes[0]
        assertEquals(SampleCapture.End.STOPPED, t.end)
        assertArrayEquals(ramp(100, 300), t.pcm)
        assertEquals(1, t.channels)
        assertEquals(rate, t.rate)
        assertEquals(pad, t.pad)
        assertFalse(t.latched)
        assertEquals(SamplePhase.Ready, r.recorder.phase.value)
    }

    @Test
    fun `the press and release are found through the input's clock`() {
        val r = Rig()
        r.open()
        // Frame 5000 was captured at 1 s: the press at 1.05 s is frame 5050.
        r.sink.clock(FrameClock(5000, ms(1000), rate))
        r.fed = 5000
        r.feed(20)
        r.recorder.arm(pad, ms(1050), latched = false, maxFrames = 40_000)
        r.recorder.stop(ms(1080))
        r.feed(100)
        assertArrayEquals(ramp(5050, 5080), r.takes.single().pcm)
    }

    @Test
    fun `with no clock yet a press starts at the next frame to come`() {
        val r = Rig()
        r.open()
        r.feed(30)
        r.recorder.arm(pad, ms(5), latched = false, maxFrames = 40_000)
        r.feed(20)
        r.recorder.stop(ms(1))
        r.feed(10)
        // The stop also has no clock: it lands on the frame after the last fed.
        assertArrayEquals(ramp(30, 50), r.takes.single().pcm)
    }

    @Test
    fun `a threshold waits for the sound and keeps the 20 ms before it`() {
        val r = Rig()
        r.open()
        r.sink.clock(FrameClock(0, 0, rate))
        r.recorder.setThreshold(-6f)
        r.recorder.arm(pad, ms(0), latched = false, maxFrames = 40_000)
        r.feed(100, 100)
        assertEquals(SamplePhase.Waiting(pad), r.recorder.phase.value)
        // Loud from frame 100 on: the take starts 20 frames (20 ms) before it.
        r.feed(50, 30_000)
        r.recorder.stop(ms(150))
        r.feed(10)
        val pcm = r.takes.single().pcm
        assertEquals(50 + 20, pcm.size)
        assertTrue(pcm.take(20).all { it == 100.toShort() })
        assertTrue(pcm.drop(20).all { it == 30_000.toShort() })
    }

    @Test
    fun `the level is applied before the threshold and the take`() {
        val r = Rig()
        r.open(gainDb = 6.0206f)
        r.sink.clock(FrameClock(0, 0, rate))
        r.recorder.setThreshold(-6f)
        r.recorder.arm(pad, ms(0), latched = false, maxFrames = 40_000)
        // 10000 doubled crosses −6 dBFS (about 16423); alone it wouldn't.
        r.feed(40, 10_000)
        r.recorder.stop(ms(40))
        r.feed(10)
        assertTrue(r.takes.single().pcm.all { it == 20_000.toShort() })
        assertTrue(r.recorder.level() > 0.9f)
    }

    @Test
    fun `a latched take runs until stopped and says so`() {
        val r = Rig()
        r.open()
        r.sink.clock(FrameClock(0, 0, rate))
        r.recorder.arm(pad, ms(0), latched = true, maxFrames = 40_000)
        repeat(25) { r.feed(100) }
        assertEquals(SamplePhase.Recording(pad, 2, 40, true), r.recorder.phase.value)
        r.recorder.stop(ms(2500))
        r.feed(10)
        val t = r.takes.single()
        assertTrue(t.latched)
        assertEquals(2500, t.frames)
        // Each second was shown as it came.
        val shown = r.phases.filterIsInstance<SamplePhase.Recording>().map { it.seconds }.distinct()
        assertEquals(listOf(0, 1, 2), shown)
    }

    @Test
    fun `a cap below the longest take ends it there, at the limit`() {
        val r = Rig()
        r.open()
        r.sink.clock(FrameClock(0, 0, rate))
        r.recorder.arm(pad, ms(10), latched = true, maxFrames = 1234)
        repeat(20) { r.feed(100) }
        val t = r.takes.single()
        assertEquals(SampleCapture.End.LIMIT, t.end)
        assertArrayEquals(ramp(10, 1244), t.pcm)
        assertEquals(SamplePhase.Ready, r.recorder.phase.value)
        // No room at all: nothing is armed.
        assertFalse(r.recorder.arm(pad, ms(0), latched = false, maxFrames = 0))
    }

    @Test
    fun `the longest take ends at the limit`() {
        val r = Rig()
        r.open()
        r.sink.clock(FrameClock(0, 0, rate))
        r.recorder.arm(pad, ms(0), latched = true, maxFrames = Int.MAX_VALUE)
        repeat(41) { r.feed(1000, 1) }
        val t = r.takes.single()
        assertEquals(SampleCapture.End.LIMIT, t.end)
        assertEquals(40 * rate, t.frames)
    }

    @Test
    fun `a cancelled take never comes`() {
        val r = Rig()
        r.open()
        r.sink.clock(FrameClock(0, 0, rate))
        r.recorder.arm(pad, ms(0), latched = false, maxFrames = 40_000)
        r.feed(100)
        r.recorder.cancel()
        r.feed(100)
        assertTrue(r.takes.isEmpty())
        assertEquals(SamplePhase.Ready, r.recorder.phase.value)
    }

    @Test
    fun `a press while a take goes ends it there, then starts its own`() {
        val r = Rig()
        r.open()
        r.sink.clock(FrameClock(0, 0, rate))
        r.recorder.arm(pad, ms(0), latched = true, maxFrames = 40_000)
        r.feed(100)
        val other = PhysicalPad(1, 3)
        r.recorder.arm(other, ms(100), latched = false, maxFrames = 40_000)
        r.feed(50)
        r.recorder.stop(ms(150))
        r.feed(10)
        assertEquals(2, r.takes.size)
        assertArrayEquals(ramp(0, 100), r.takes[0].pcm)
        assertEquals(other, r.takes[1].pad)
        assertArrayEquals(ramp(100, 150), r.takes[1].pcm)
    }

    @Test
    fun `a take straight after another, before the first is copied, loses nothing`() {
        val r = Rig(queued = true)
        r.open()
        r.sink.clock(FrameClock(0, 0, rate))
        r.recorder.arm(pad, ms(0), latched = false, maxFrames = 40_000)
        r.feed(100)
        r.recorder.stop(ms(100))
        r.recorder.arm(pad, ms(100), latched = false, maxFrames = 40_000)
        r.feed(50)
        r.recorder.stop(ms(150))
        r.feed(10)
        // Neither copied yet: a third take waits for a buffer, its frames silence meanwhile.
        r.recorder.arm(pad, ms(160), latched = false, maxFrames = 40_000)
        r.feed(10)
        assertTrue(r.takes.isEmpty())
        while (r.posted.isNotEmpty()) r.posted.removeFirst().run()
        assertEquals(2, r.takes.size)
        assertArrayEquals(ramp(0, 100), r.takes[0].pcm)
        assertArrayEquals(ramp(100, 150), r.takes[1].pcm)
        r.recorder.stop(ms(200))
        r.feed(40)
        while (r.posted.isNotEmpty()) r.posted.removeFirst().run()
        val third = r.takes[2].pcm
        assertEquals(40, third.size)
        assertTrue(third.take(10).all { it == 0.toShort() })
        assertArrayEquals(ramp(170, 200), third.copyOfRange(10, 40))
    }

    @Test
    fun `stereo input goes into a mono take mixed down, and mono into stereo doubled`() {
        val r = Rig(inChannels = 2)
        r.open()
        r.sink.clock(FrameClock(0, 0, rate))
        r.recorder.arm(pad, ms(0), latched = false, maxFrames = 40_000)
        r.sink.block(ShortArray(20) { if (it % 2 == 0) 100 else 300 }, 10, 0)
        r.recorder.stop(ms(10))
        r.sink.block(ShortArray(20), 10, 10)
        assertTrue(r.takes.single().pcm.all { it == 200.toShort() })

        // RSP's mix is stereo: a mono take mixes it down, a stereo one keeps it.
        val m = Rig()
        m.open(SampleInput(SampleSource.RSP, true))
        val tap = m.mix.sampleTap!!
        tap.clock(FrameClock(0, 0, rate))
        m.recorder.arm(pad, ms(0), latched = false, maxFrames = 40_000)
        tap.mixed(ShortArray(20) { if (it % 2 == 0) 100 else 300 }, 10, 0, rate)
        m.recorder.stop(ms(10))
        tap.mixed(ShortArray(20), 10, 10, rate)
        val t = m.takes.single()
        assertEquals(2, t.channels)
        assertEquals(10, t.frames)
        assertEquals(100.toShort(), t.pcm[0])
        assertEquals(300.toShort(), t.pcm[1])
    }

    @Test
    fun `a stereo input the phone opens mono records a mono take, as long as a mono one`() {
        val r = Rig(inChannels = 1)
        r.open(SampleInput(SampleSource.MIC, true))
        assertEquals(1, r.recorder.channels)
        r.sink.clock(FrameClock(0, 0, rate))
        r.recorder.arm(pad, ms(0), latched = false, maxFrames = Int.MAX_VALUE)
        r.feed(10, 7)
        assertEquals(SamplePhase.Recording(pad, 0, 40, false), r.recorder.phase.value)
        r.recorder.stop(ms(10))
        r.feed(10)
        val t = r.takes.single()
        assertEquals(1, t.channels)
        assertEquals(10, t.frames)
        assertTrue(t.pcm.all { it == 7.toShort() })
    }

    @Test
    fun `a press straight after a take records from its frame, already fed`() {
        val r = Rig()
        r.open()
        r.sink.clock(FrameClock(0, 0, rate))
        r.recorder.arm(pad, ms(0), latched = true, maxFrames = 40_000)
        r.feed(100)
        // Pressed at frame 80, which reached the recorder after frames up to 100 had.
        val other = PhysicalPad(1, 3)
        r.recorder.arm(other, ms(80), latched = false, maxFrames = 40_000)
        r.feed(50)
        r.recorder.stop(ms(150))
        r.feed(10)
        assertArrayEquals(ramp(0, 80), r.takes[0].pcm)
        assertArrayEquals(ramp(80, 150), r.takes[1].pcm)

        // The first buffer, home again, was fed meanwhile: a third take straight after the second has its frames too.
        r.recorder.arm(pad, ms(160), latched = true, maxFrames = 40_000)
        r.feed(100)
        r.recorder.arm(other, ms(200), latched = false, maxFrames = 40_000)
        r.feed(100)
        r.recorder.stop(ms(300))
        r.feed(10)
        assertEquals(4, r.takes.size)
        assertArrayEquals(ramp(160, 200), r.takes[2].pcm)
        assertArrayEquals(ramp(200, 300), r.takes[3].pcm)
    }

    @Test
    fun `RSP finds a press the mix was fed past, by the output's latency`() {
        val r = Rig()
        r.open(SampleInput(SampleSource.RSP, false))
        val tap = r.mix.sampleTap!!
        tap.clock(FrameClock(0, 0, rate))
        // Mixed 300 ms ahead of what is heard: the press at 100 ms comes as frame 300 is fed.
        tap.mixed(ShortArray(600) { (it / 2).toShort() }, 300, 0, rate)
        r.recorder.arm(pad, ms(100), latched = false, maxFrames = 40_000)
        r.recorder.stop(ms(200))
        tap.mixed(ShortArray(200), 100, 300, rate)
        assertArrayEquals(ramp(100, 200), r.takes.single().pcm)

        // With a threshold, a crossing at frame 450 already fed is found, with its 20 ms.
        r.recorder.setThreshold(-6f)
        tap.mixed(ShortArray(400) { i -> if (i / 2 in 50 until 100) 30_000 else 0 }, 200, 400, rate)
        r.recorder.arm(pad, ms(420), latched = false, maxFrames = 40_000)
        tap.mixed(ShortArray(200), 100, 600, rate)
        r.recorder.stop(ms(700))
        tap.mixed(ShortArray(200), 100, 700, rate)
        val t = r.takes[1]
        assertEquals(700 - 430, t.frames)
        assertTrue(t.pcm.take(20).all { it == 0.toShort() })
        assertEquals(30_000.toShort(), t.pcm[20])
    }

    @Test
    fun `a take ended by closing is handed over after close, not inside it`() {
        val main = Immediate()
        val r = Rig(immediate = main)
        r.open()
        r.sink.clock(FrameClock(0, 0, rate))
        r.recorder.arm(pad, ms(0), latched = true, maxFrames = 40_000)
        r.feed(100)
        var seen: SamplePhase? = null
        r.recorder.onDone = {
            seen = r.recorder.phase.value
            r.takes += it
        }
        r.recorder.close()
        assertTrue(r.takes.isEmpty())
        while (main.posted.isNotEmpty()) main.posted.removeFirst().run()
        assertArrayEquals(ramp(0, 100), r.takes.single().pcm)
        assertEquals(SamplePhase.Ready, seen)
    }

    @Test
    fun `closing keeps the take going up to the last block`() {
        val r = Rig()
        r.open()
        r.sink.clock(FrameClock(0, 0, rate))
        r.recorder.arm(pad, ms(20), latched = true, maxFrames = 40_000)
        r.feed(100)
        r.recorder.stop(ms(500))
        r.recorder.close()
        assertTrue(r.input.closed)
        assertEquals(SampleCapture.End.STOPPED, r.takes.single().end)
        assertArrayEquals(ramp(20, 100), r.takes.single().pcm)
        assertEquals(SamplePhase.Ready, r.recorder.phase.value)
        // Blocks still on their way are dropped.
        r.feed(100)
        assertEquals(1, r.takes.size)
        assertNull(r.recorder.input)
    }

    @Test
    fun `closing while waiting for the threshold keeps nothing`() {
        val r = Rig()
        r.open()
        r.recorder.setThreshold(-6f)
        r.recorder.arm(pad, ms(0), latched = false, maxFrames = 40_000)
        r.feed(100, 10)
        r.recorder.close()
        assertTrue(r.takes.isEmpty())
    }

    @Test
    fun `a lost input keeps what was recorded and says why`() {
        val r = Rig()
        r.open()
        r.sink.clock(FrameClock(0, 0, rate))
        r.recorder.arm(pad, ms(0), latched = true, maxFrames = 40_000)
        r.feed(100)
        r.sink.lost("unplugged")
        val t = r.takes.single()
        assertEquals(SampleCapture.End.LOST, t.end)
        assertEquals(100, t.frames)
        assertEquals(listOf("unplugged"), r.lost)
        assertNull(r.recorder.input)
        assertTrue(r.input.closed)
    }

    @Test
    fun `an input that won't open says why`() {
        val r = Rig()
        r.input.fail = "busy"
        assertEquals("busy", r.open())
        assertNull(r.recorder.input)
        assertTrue(r.input.closed)
        assertFalse(r.recorder.arm(pad, 0, latched = false, maxFrames = 1))
    }

    @Test
    fun `a silenced input is shown until it closes`() {
        val r = Rig()
        r.open()
        r.sink.silenced(true)
        assertTrue(r.recorder.silenced.value)
        r.recorder.close()
        assertFalse(r.recorder.silenced.value)
    }

    @Test
    fun `a scheduled take is exact whatever the threshold`() {
        val r = Rig()
        r.open()
        r.sink.clock(FrameClock(0, 0, rate))
        r.recorder.setThreshold(-1f)
        assertTrue(r.recorder.schedule(pad, ms(100), 250))
        repeat(5) { r.feed(100, 5) }
        val t = r.takes.single()
        assertEquals(SampleCapture.End.BARS, t.end)
        assertEquals(250, t.frames)
        assertTrue(t.latched)
    }

    @Test
    fun `RSP taps Live's mix at its rate and lets go on close`() {
        val r = Rig()
        r.mix.mixRate = 2000
        assertNull(r.open(SampleInput(SampleSource.RSP, true)))
        val tap = r.mix.sampleTap!!
        assertEquals(2000, r.recorder.rate)
        // Mix frame 1000 was heard at 1 s; the press at 1.1 s is mix frame 1200.
        tap.clock(FrameClock(1000, ms(1000), 2000))
        r.recorder.arm(pad, ms(1100), latched = false, maxFrames = 40_000)
        tap.mixed(ShortArray(1000) { (it / 2).toShort() }, 500, 1000, 2000)
        r.recorder.stop(ms(1200))
        tap.mixed(ShortArray(1000), 500, 1500, 2000)
        val t = r.takes.single()
        assertEquals(2, t.channels)
        assertEquals(200, t.frames)
        assertEquals(200.toShort(), t.pcm[0])
        r.recorder.close()
        assertNull(r.mix.sampleTap)
    }

    @Test
    fun `RSP opens again at the new rate when Live's output reopens`() {
        val r = Rig()
        r.open(SampleInput(SampleSource.RSP, false))
        val first = r.mix.sampleTap!!
        // The blocks' rate counts, even before the output says it.
        first.mixed(ShortArray(20), 10, 0, 44100)
        val second = r.mix.sampleTap!!
        assertTrue(second !== first)
        assertEquals(44100, r.recorder.rate)
        second.mixed(ShortArray(20), 10, 10, 44100)
        assertSame(second, r.mix.sampleTap)
        assertTrue(r.lost.isEmpty())
        // Live closing for good is a lost input.
        r.mix.mixRate = null
        second.lost(LiveAudio.TAP_CLOSED)
        assertEquals(listOf(LiveAudio.TAP_CLOSED), r.lost)
        assertNull(r.recorder.input)
    }

    @Test
    fun `a press as Live's output opens at another rate still records, at that rate`() {
        val r = Rig()
        // Live's output closed: RSP waits at 48000 Hz.
        r.mix.mixRate = null
        r.open(SampleInput(SampleSource.RSP, false))
        assertEquals(SampleRecorder.DEFAULT_RATE, r.recorder.rate)
        val first = r.mix.sampleTap!!
        r.recorder.arm(pad, ms(0), latched = false, maxFrames = 40_000)
        // The press opened it at 2000 Hz.
        r.mix.mixRate = 2000
        first.mixed(ShortArray(20), 10, 0, 2000)
        val second = r.mix.sampleTap!!
        assertTrue(second !== first)
        second.clock(FrameClock(0, 0, 2000))
        second.mixed(ShortArray(980) { 5 }, 490, 10, 2000)
        r.recorder.stop(ms(200))
        second.mixed(ShortArray(20), 10, 500, 2000)
        val t = r.takes.single()
        assertEquals(2000, t.rate)
        // Frames 0..9 went to the input that was let go of.
        assertEquals(390, t.frames)
        assertTrue(r.lost.isEmpty())
    }

    @Test
    fun `opening the same input again keeps it, another replaces it`() {
        val r = Rig()
        r.open()
        val sink = r.sink
        r.open(gainDb = 3f)
        assertSame(sink, r.sink)
        r.open(SampleInput(SampleSource.RSP, false))
        assertTrue(r.input.closed)
        assertEquals(SampleSource.RSP, r.recorder.input?.source)
    }

    @Test
    fun `a take is going from its press until it ends, however it ends`() {
        val r = Rig()
        r.open()
        r.sink.clock(FrameClock(0, 0, rate))
        assertFalse(r.recorder.going)
        // Kept: going from the press, until the input picks up the release.
        r.recorder.arm(pad, ms(0), latched = false, maxFrames = 40_000)
        assertTrue(r.recorder.going)
        r.feed(50)
        r.recorder.stop(ms(40))
        assertTrue(r.recorder.going)
        r.feed(10)
        assertFalse(r.recorder.going)
        assertEquals(1, r.takes.size)
        // Cancelled.
        r.recorder.arm(pad, ms(60), latched = false, maxFrames = 40_000)
        r.feed(10)
        r.recorder.cancel()
        r.feed(10)
        assertFalse(r.recorder.going)
        // Stopped before the threshold was reached: nothing comes, and it is over all the same.
        r.recorder.setThreshold(-6f)
        r.recorder.arm(pad, ms(80), latched = true, maxFrames = 40_000)
        r.feed(10, 10)
        assertTrue(r.recorder.going)
        r.recorder.stop(ms(90))
        r.feed(10, 10)
        assertFalse(r.recorder.going)
        assertEquals(1, r.takes.size)
    }

    @Test
    fun `a hands-free take waiting for sound is over when its input is let go of`() {
        val r = Rig()
        r.open()
        r.recorder.setThreshold(-6f)
        r.recorder.arm(pad, ms(0), latched = true, maxFrames = 40_000)
        r.feed(100, 10)
        assertTrue(r.recorder.going)
        // −/+ to another input: this one closes, the take with nothing in it.
        r.open(SampleInput(SampleSource.RSP, false))
        assertFalse(r.recorder.going)
        assertTrue(r.takes.isEmpty())
    }

    @Test
    fun `a take asked of an input that goes before it starts is over`() {
        val r = Rig()
        r.open()
        // Asked, and the input unplugged before a block came to pick it up.
        r.recorder.arm(pad, ms(0), latched = true, maxFrames = 40_000)
        assertTrue(r.recorder.going)
        r.sink.lost("unplugged")
        assertFalse(r.recorder.going)
        assertTrue(r.takes.isEmpty())
        assertEquals(listOf("unplugged"), r.lost)
        // Waiting for the threshold when it went: the same.
        r.open()
        r.recorder.setThreshold(-6f)
        r.recorder.arm(pad, ms(0), latched = true, maxFrames = 40_000)
        r.feed(100, 10)
        r.sink.lost("unplugged")
        assertFalse(r.recorder.going)
        assertTrue(r.takes.isEmpty())
    }

    @Test
    fun `a take waiting for sound as Live's output reopens waits on, at the new rate`() {
        val r = Rig()
        r.open(SampleInput(SampleSource.RSP, false))
        val first = r.mix.sampleTap!!
        first.clock(FrameClock(0, 0, rate))
        r.recorder.setThreshold(-6f)
        r.recorder.arm(pad, ms(0), latched = true, maxFrames = 40_000)
        first.mixed(ShortArray(200) { 10 }, 100, 0, rate)
        assertEquals(SamplePhase.Waiting(pad, latched = true), r.recorder.phase.value)
        // Live's output opens again at 2000 Hz: RSP with it, and the take still waits for its sound.
        r.mix.mixRate = 2000
        first.mixed(ShortArray(20), 10, 100, 2000)
        val second = r.mix.sampleTap!!
        assertTrue(second !== first)
        assertTrue(r.recorder.going)
        assertTrue(r.lost.isEmpty())
        // Mix frame 0 heard at 100 ms; loud from there, and stopped at 150 ms: mix frame 100.
        second.clock(FrameClock(0, ms(100), 2000))
        second.mixed(ShortArray(200) { 20_000 }, 100, 0, 2000)
        assertTrue(r.recorder.phase.value is SamplePhase.Recording)
        r.recorder.stop(ms(150))
        second.mixed(ShortArray(200) { 20_000 }, 100, 100, 2000)
        val t = r.takes.single()
        assertEquals(2000, t.rate)
        assertEquals(100, t.frames)
        assertTrue(t.latched)
        assertFalse(r.recorder.going)
    }
}
