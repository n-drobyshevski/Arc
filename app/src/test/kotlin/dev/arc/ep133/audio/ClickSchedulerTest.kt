package dev.arc.ep133.audio

import dev.arc.ep133.features.Beat
import dev.arc.ep133.features.BeatGrid
import dev.arc.ep133.features.ClockFollow
import dev.arc.ep133.protocol.MidiEvent
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.abs

/** Where the click falls, to the frame: free run, following the EP-133's beats, and between them. */
class ClickSchedulerTest {
    private val rate = 48000
    private val ms = 1_000_000L
    // The output's timestamp: stream frame 0 is heard at [t0].
    private val t0 = 1_000_000_000_000L

    private fun time(frame: Long) = t0 + frame * 1_000_000_000L / rate

    /** Blocks of [block] frames from [from] on, past [to]: each click before [to], its stream frame and beat. */
    private fun run(
        s: ClickScheduler,
        from: Long,
        to: Long,
        bpm: Int = 120,
        block: Int = 192,
        grid: (Long) -> BeatGrid? = { null },
    ): List<Pair<Long, Beat>> {
        val out = ArrayList<Pair<Long, Beat>>()
        var f = from
        while (f < to) {
            for (c in s.block(f, block, bpm, grid(f), 0L, t0)) if (f + c.offset < to) out += (f + c.offset) to c.beat
            f += block
        }
        return out
    }

    @Test
    fun `at 120 BPM and 48 kHz a click every 24000 frames exactly, the first at once`() {
        val clicks = run(ClickScheduler(rate), 0, 100L * 24000)
        assertEquals(100, clicks.size)
        clicks.forEachIndexed { k, (frame, beat) ->
            assertEquals(k * 24000L, frame)
            assertEquals(k.toLong(), beat.index)
            assertEquals(time(frame), beat.at)
        }
    }

    @Test
    fun `no drift after ten thousand beats at 133 BPM`() {
        val period = rate * 60.0 / 133
        val clicks = run(ClickScheduler(rate), 0, (10_001 * period).toLong(), bpm = 133, block = 240)
        assertEquals(10_001, clicks.size)
        clicks.forEachIndexed { k, (frame, _) -> assertTrue(abs(frame - k * period) <= 0.5) { "beat $k at $frame" } }
    }

    @Test
    fun `a new tempo waits for the beat already due`() {
        val s = ClickScheduler(rate)
        assertEquals(listOf(0L), run(s, 0, 1920).map { it.first })
        // Down to 60 BPM between the beats: the next is still at 24000, then a second apart.
        val after = run(s, 1920, 1920 + 192L * 500, bpm = 60).map { it.first }
        assertEquals(listOf(24000L, 72000L), after)
    }

    @Test
    fun `following maps the device's beats through the timestamp`() {
        val grid = BeatGrid(anchor = t0 + 100 * ms, beatIndex = 8, periodNs = 5e8, barKnown = true)
        val s = ClickScheduler(rate)
        // Not clicking at once: the first is the device's next beat.
        val clicks = run(s, 0, 60_000, grid = { grid })
        assertEquals(listOf(4800L, 28800L, 52800L), clicks.map { it.first })
        assertEquals(listOf(8L, 9L, 10L), clicks.map { it.second.index })
        assertEquals(t0 + 100 * ms, clicks[0].second.at)
        assertTrue(s.following)

        // Another timestamp (the output ran on): frame 1000 is heard at t0.
        val other = ClickScheduler(rate)
        val c = other.block(1000, 9600, 120, grid, 1000, t0)
        assertEquals(listOf(4800), c.map { it.offset })
    }

    @Test
    fun `a beat well past is skipped, one just past is clicked at once`() {
        val gone = BeatGrid(anchor = time(48000) - 5 * ms, beatIndex = 0, periodNs = 5e8, barKnown = true)
        assertEquals(emptyList<Pair<Long, Beat>>(), run(ClickScheduler(rate), 48000, 48192, grid = { gone }))

        val late = BeatGrid(anchor = time(48000) - 1 * ms, beatIndex = 0, periodNs = 5e8, barKnown = true)
        val clicks = run(ClickScheduler(rate), 48000, 48192, grid = { late })
        assertEquals(listOf(48000L), clicks.map { it.first })
        assertEquals(time(48000), clicks[0].second.at)
    }

    @Test
    fun `a grid re-fitted a little later doesn't click the same beat twice`() {
        val s = ClickScheduler(rate)
        val first = BeatGrid(anchor = time(150), beatIndex = 0, periodNs = 5e8, barKnown = true)
        assertEquals(listOf(150), s.block(0, 192, 120, first, 0, t0).map { it.offset })
        // The fit moves beat 0 into the next block, a millisecond on.
        val moved = first.copy(anchor = time(198))
        assertEquals(emptyList<Int>(), s.block(192, 192, 120, moved, 0, t0).map { it.offset })
        // Its next beat still clicks.
        assertEquals(listOf(24198L), run(s, 384, 30_000, grid = { moved }).map { it.first })
    }

    @Test
    fun `free run gives way to the device's beats, not too close to its last click`() {
        val s = ClickScheduler(rate)
        assertEquals(listOf(0L), run(s, 0, 1920).map { it.first })
        // The device's beats come 0.1 s (a fifth of a beat) after that click: that one is dropped.
        val grid = BeatGrid(anchor = time(4800), beatIndex = 3, periodNs = 5e8, barKnown = false)
        assertEquals(listOf(28800L, 52800L), run(s, 1920, 60_000, grid = { grid }).map { it.first })
    }

    @Test
    fun `when the device's clock goes, it runs free on from the last click at the phone's tempo`() {
        val s = ClickScheduler(rate)
        val grid = BeatGrid(anchor = time(4800), beatIndex = 5, periodNs = 4e8, barKnown = true)
        // 150 BPM from the device: one beat in the first half second.
        val followed = run(s, 0, 24000, grid = { grid })
        assertEquals(listOf(4800L), followed.map { it.first })
        val free = run(s, 24000, 60_000, bpm = 120)
        assertEquals(listOf(28800L, 52800L), free.map { it.first })
        assertEquals(listOf(6L, 7L), free.map { it.second.index })
        assertTrue(free.none { it.second.accent })
    }

    @Test
    fun `after a Start it follows the device's tempo and bar from the next beat, not the phone's`() {
        // The EP-133 at 90 BPM, the phone at 120. Each block is worked out 20 ms before it is
        // heard, from the MIDI that came by then.
        val f = ClockFollow()
        val period = 60e9 / 90
        val tick = period / 24
        val midi = ArrayList<MidiEvent>()
        for (i in 0 until 108) midi += MidiEvent.Clock(t0 + Math.round(i * tick)) // 3 s playing
        midi += MidiEvent.Stop(t0 + 3000 * ms)
        // Stopped with no clock, PLAY at 4.3 s.
        val start = t0 + 4300 * ms
        midi += MidiEvent.Start(start)
        for (i in 0 until 200) midi += MidiEvent.Clock(start + Math.round(i * tick))
        val s = ClickScheduler(rate)
        var fed = 0
        val clicks = run(s, 0, 427_200L, bpm = 120) { from -> // to 8.9 s
            val now = time(from) - 20 * ms
            while (fed < midi.size && midi[fed].time <= now) f.onMidi(midi[fed++])
            f.grid(now)
        }
        // Beat 0 was heard before the Start came; from beat 1 on, every click is the device's.
        val after = clicks.filter { it.second.at > start + period.toLong() / 2 }
        assertEquals((1L..6L).toList(), after.map { it.second.index })
        after.forEach { (_, beat) ->
            assertTrue(abs(beat.at - (start + Math.round(beat.index * period))) < ms) { "beat ${beat.index} at ${beat.at}" }
        }
        assertEquals(listOf(4L), after.filter { it.second.accent }.map { it.second.index })
    }

    @Test
    fun `a bar's first beat is accented while the bar is known`() {
        val free = run(ClickScheduler(rate), 0, 9L * 24000).map { it.second.accent }
        assertEquals(listOf(true, false, false, false, true, false, false, false, true), free)

        val known = BeatGrid(anchor = time(4800), beatIndex = 2, periodNs = 5e8, barKnown = true)
        val k = run(ClickScheduler(rate), 0, 5L * 24000, grid = { known }).map { it.second }
        assertEquals(listOf(2L, 3L, 4L, 5L, 6L), k.map { it.index })
        assertEquals(listOf(false, false, true, false, false), k.map { it.accent })

        // Phase unknown (no Start seen): no accents, nor after the clock goes.
        val unknown = known.copy(barKnown = false)
        val s = ClickScheduler(rate)
        assertTrue(run(s, 0, 5L * 24000, grid = { unknown }).none { it.second.accent })
        assertTrue(run(s, 5L * 24000, 15L * 24000).none { it.second.accent })
    }
}
