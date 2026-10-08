package dev.arc.ep133.audio

import dev.arc.ep133.features.FrameClock
import dev.arc.ep133.features.Keys
import dev.arc.ep133.features.Pattern
import dev.arc.ep133.features.PatternNote
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.ProjectPatterns
import dev.arc.ep133.features.Seq
import dev.arc.ep133.formats.VoiceMixer
import dev.arc.ep133.formats.VoiceMode
import dev.arc.ep133.formats.VoiceShape
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNotSame
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.abs
import kotlin.math.roundToLong
import kotlin.random.Random

/**
 * The pattern sequencer against a fake output, block by block: notes land
 * on their frames once each across windows and tempo changes, gates are let
 * go of, stop and a lost output drop what waits and let go of what sounds,
 * and the beat goes on where it was heard after a re-anchor.
 */
class PatternSchedulerTest {
    // 48 kHz at 120 BPM: 250 frames a tick, a bar 96000 frames; the lookahead 2400.
    private val rate = 48000
    private val ahead = 2400L
    private val bar = 96000L
    private val t0 = 1_000_000_000_000L
    private val padShape = VoiceShape(gain = 0.5f)
    private val keysShape = VoiceShape(mode = VoiceMode.LEGATO)
    private val pcm = ShortArray(100) { 1000 }

    private class Started(val key: String, val semitones: Int, val tag: Long, val shape: VoiceShape, val at: Long, val rendered: Long)

    private class Released(val key: String, val at: Long, val tag: Long)

    private data object Flushed

    private class FakeSink : ScheduleSink {
        val events = ArrayList<Any>()
        var rendered = 0L

        val starts: List<Started> get() = events.filterIsInstance<Started>()
        val releases: List<Released> get() = events.filterIsInstance<Released>()

        override fun startAt(key: String, pcm: ShortArray, channels: Int, sampleRate: Int, semitones: Int, tag: Long, shape: VoiceShape, atFrame: Long): Boolean {
            events += Started(key, semitones, tag, shape, atFrame, rendered)
            return true
        }

        override fun releaseAt(key: String, atFrame: Long, tag: Long) {
            events += Released(key, atFrame, tag)
        }

        override fun flushTimed() {
            events += Flushed
        }
    }

    private fun voices(): Map<PhysicalPad, PadVoice> =
        (0 until 4).flatMap { g -> (0 until 12).map { o -> PhysicalPad(g, o) } }.associateWith { PadVoice(pcm, 1, 46875, padShape, keysShape) }

    private fun plan(group: Int, pattern: Pattern, bpm: Double = 120.0, voices: Map<PhysicalPad, PadVoice> = voices(), skip: Map<Int, Long> = emptyMap()) =
        SeqPlan(ProjectPatterns().with(group, pattern), voices, skip, bpm)

    // A note on each beat of a bar, on pad A1, each [gate] ticks.
    private fun beats(gate: Int = 24) = Pattern(1, List(4) { PatternNote(it * 96, 0, gate, id = it + 1) })

    // The scheduler's own clock ([nanos]) is the moment the frames rendered are heard, unless one is given.
    private inner class Rig(nanos: (() -> Long)? = null) {
        val s = PatternScheduler(nanos = nanos ?: { heard(rendered) })
        val sink = FakeSink()
        var rendered = 0L

        // Mix frame [f] is heard at [base] plus its time.
        var base = t0

        fun heard(f: Long) = base + f * 1_000_000_000L / rate

        fun fill() {
            sink.rendered = rendered
            s.fill(sink, rendered, rate)
        }

        /** Blocks of [block] up to [until], the output's stamp every [stampEvery] blocks (0: never). */
        fun run(until: Long, block: Int = 192, stampEvery: Int = 0) {
            var n = 0
            while (rendered < until) {
                fill()
                if (stampEvery > 0 && n++ % stampEvery == 0) stamp()
                rendered += block
            }
        }

        fun stamp() = s.clock(FrameClock(rendered, heard(rendered), rate))
    }

    @Test
    fun `notes land on their frames, each once, whatever the block`() {
        for (block in listOf(1, 96, 192, 1000, 2400, 4096)) {
            val r = Rig()
            r.s.plan = plan(0, beats())
            r.s.play(0)
            r.run(ahead + 4 * bar, block)
            val starts = r.sink.starts.filter { it.at < ahead + 4 * bar }
            assertEquals(List(16) { ahead + it * 24000L }, starts.map { it.at }, "block $block")
            // Sent ahead of the mix while the blocks are within the lookahead.
            if (block <= ahead) assertTrue(starts.all { it.at >= it.rendered }, "block $block")
        }
    }

    @Test
    fun `a count-in and a lead put tick 0 later`() {
        val r = Rig()
        r.s.plan = plan(0, beats())
        r.s.play(1, extraLeadNs = 10_000_000L)
        r.run(2 * bar)
        assertEquals(ahead + 480 + bar, r.sink.starts.first().at)
    }

    @Test
    fun `tempo changes neither repeat nor skip a note`() {
        // A note on every tick, told apart by pad and pitch; the tempo changes before every block.
        val notes = List(Seq.TICKS_PER_BAR) { PatternNote(it, it % 12, 1, semitones = it / 12 - 16, id = it + 1) }
        val keys = notes.map { "seq:0:${it.offset}:${Keys.ROOT_NOTE + it.semitones!!}" }
        val random = Random(133)
        val r = Rig()
        r.s.plan = plan(0, Pattern(1, notes))
        r.s.play(0)
        while (r.rendered < 3 * bar) {
            r.s.plan = plan(0, Pattern(1, notes), 90 + random.nextDouble() * 60)
            r.fill()
            r.rendered += 64 + random.nextInt(192)
        }
        val starts = r.sink.starts
        assertTrue(starts.size > 2 * Seq.TICKS_PER_BAR)
        assertEquals(List(starts.size) { keys[it % Seq.TICKS_PER_BAR] }, starts.map { it.key })
        assertTrue(starts.zipWithNext().all { (a, b) -> b.at > a.at })
    }

    @Test
    fun `gates are let go of at their end, on the voice they started`() {
        val r = Rig()
        val pattern = Pattern(1, listOf(PatternNote(0, 3, 24, id = 1), PatternNote(96, 3, 48, semitones = 5, id = 2)))
        r.s.plan = plan(1, pattern)
        r.s.play(0)
        r.run(ahead + bar - 1)
        val (hit, note) = r.sink.starts
        assertEquals("live:1:3", hit.key)
        assertEquals(0, hit.semitones)
        assertEquals(padShape, hit.shape)
        assertEquals(ahead, hit.at)
        assertEquals("seq:1:3:65", note.key)
        assertEquals(5, note.semitones)
        assertEquals(keysShape, note.shape)
        assertEquals(ahead + 96 * 250, note.at)
        val releases = r.sink.releases
        assertEquals(2, releases.size)
        assertEquals("live:1:3", releases[0].key)
        assertEquals(hit.tag, releases[0].tag)
        assertEquals(ahead + 24 * 250, releases[0].at)
        assertEquals("seq:1:3:65", releases[1].key)
        assertEquals(note.tag, releases[1].tag)
        assertEquals(ahead + 144 * 250, releases[1].at)
    }

    @Test
    fun `each note gets a tag of its own below 0`() {
        val r = Rig()
        r.s.plan = plan(0, beats())
        r.s.play(0)
        r.run(4 * bar)
        val tags = r.sink.starts.map { it.tag }
        assertTrue(tags.all { it < 0 })
        assertEquals(tags.size, tags.toSet().size)
    }

    @Test
    fun `stop drops what waits first, then lets go of what sounds`() {
        val r = Rig()
        // Gates most of a beat long: one sounds whenever it stops.
        r.s.plan = plan(0, beats(gate = 90))
        r.s.play(0)
        assertTrue(r.s.running)
        r.run(100_000, stampEvery = 25)
        assertNotNull(r.s.timeline.value)
        // The beat at tick 384 (frame 98400) sounds; its release isn't sent yet.
        val sounding = r.sink.starts.last()
        assertEquals(98400L, sounding.at)
        r.s.stop()
        assertFalse(r.s.running)
        val before = r.sink.events.size
        r.fill()
        val after = r.sink.events.drop(before)
        assertEquals(Flushed, after.first())
        val released = after.drop(1).map { it as Released }
        assertEquals(listOf(sounding.tag), released.map { it.tag })
        assertEquals(VoiceMixer.NOW, released.single().at)
        assertNull(r.s.timeline.value)
        // Nothing more.
        r.run(4 * bar, stampEvery = 25)
        assertEquals(before + 2, r.sink.events.size)
    }

    @Test
    fun `lost drops what waits, then re-anchors on the next stamp where the beat was heard`() {
        val r = Rig()
        r.s.plan = plan(0, beats(gate = 90))
        r.s.play(0)
        r.run(100_000, stampEvery = 25)
        val old = r.s.timeline.value!!
        val sounding = r.sink.starts.last()
        r.s.lost()
        val before = r.sink.events.size
        r.fill()
        val after = r.sink.events.drop(before)
        assertEquals(Flushed, after.first())
        assertEquals(listOf(sounding.tag to VoiceMixer.NOW), after.drop(1).map { (it as Released).tag to it.at })
        // A new output: its frames from 0, heard 20 ms later than the old one's would have been.
        val lostAt = r.heard(r.rendered)
        r.rendered = 0
        r.base = lostAt + 20_000_000L
        val starts = r.sink.starts.size
        r.fill()
        r.rendered += 192
        r.fill()
        assertEquals(starts, r.sink.starts.size, "nothing until a stamp")
        r.stamp()
        val now = r.s.timeline.value!!
        assertNotSame(old, now)
        assertEquals(old.tickAt(r.heard(r.rendered)), now.tickAt(r.heard(r.rendered)), 0.01)
        r.rendered += 192
        r.run(r.rendered + 2 * bar, stampEvery = 25)
        val next = r.sink.starts.drop(starts)
        assertTrue(next.size >= 7)
        // Each heard on the old beats, to a frame or two.
        val grid = old.grid()
        for (n in next) {
            val t = r.heard(n.at)
            val i = grid.indexFrom(t - (grid.periodNs / 2).roundToLong())
            assertTrue(abs(t - grid.at(i)) <= 2 * 1_000_000_000L / rate) { "${n.at} heard ${t - grid.at(i)} ns off the beat" }
        }
    }

    @Test
    fun `the timeline comes with the first stamp and is new only when it changes`() {
        val r = Rig()
        r.s.plan = plan(0, beats())
        r.s.play(0)
        r.fill()
        assertNull(r.s.timeline.value)
        r.stamp()
        val t = r.s.timeline.value!!
        assertEquals(0.0, t.tickAt(r.heard(ahead)), 1e-9)
        assertEquals(r.heard(ahead), t.nanosOf(0))
        assertEquals(ahead + 96 * 250, t.frameOfTick(96))
        assertEquals(r.heard(ahead), t.grid().anchor)
        r.rendered += 4800
        r.fill()
        r.stamp()
        assertSame(t, r.s.timeline.value)
        r.s.plan = plan(0, beats(), bpm = 90.0)
        r.fill()
        val slower = r.s.timeline.value!!
        assertNotSame(t, slower)
        assertEquals(90.0, slower.grid().bpm, 1e-9)
    }

    @Test
    fun `a pad with no sound is told once a plan, and plays nothing`() {
        val r = Rig()
        val missing = mutableListOf<PhysicalPad>()
        r.s.onMissing = { missing += it }
        val some = voices() - PhysicalPad(2, 5)
        val pattern = Pattern(1, listOf(PatternNote(0, 5, 24, id = 1), PatternNote(96, 6, 24, id = 2)))
        r.s.plan = plan(2, pattern, voices = some)
        r.s.play(0)
        r.run(3 * bar)
        assertEquals(listOf(PhysicalPad(2, 5)), missing)
        assertTrue(r.sink.starts.all { it.key == "live:2:6" })
        r.s.plan = plan(2, pattern, voices = some)
        r.run(4 * bar)
        assertEquals(listOf(PhysicalPad(2, 5), PhysicalPad(2, 5)), missing)
    }

    @Test
    fun `a note heard live as it was recorded skips that pass only`() {
        val r = Rig()
        r.s.plan = plan(0, beats(), skip = mapOf(2 to 0L))
        r.s.play(0)
        r.run(ahead + 2 * bar)
        val starts = r.sink.starts.filter { it.at < ahead + 2 * bar }
        assertEquals(7, starts.size)
        assertFalse(starts.any { it.at == ahead + 24000L })
    }

    @Test
    fun `a loss told before PLAY is the old run's, so bar 1 plays where it was anchored`() {
        // Live's output closed (lost) and opened again, then PLAY: all picked up by the same block.
        val r = Rig()
        r.s.plan = plan(0, beats())
        r.s.lost()
        r.s.play(0)
        // The output's first stamp comes a few blocks later.
        r.run(1920)
        r.stamp()
        assertNotNull(r.s.timeline.value)
        r.run(ahead + bar, stampEvery = 25)
        assertEquals(listOf(ahead, ahead + 24000L, ahead + 48000L, ahead + 72000L), r.sink.starts.map { it.at }.filter { it < ahead + bar })
        // Re-anchored never: the first timeline still holds.
        assertEquals(0.0, r.s.timeline.value!!.tickAt(r.heard(ahead)), 1e-9)
    }

    // Group A's beats, the first (id 1) the press that started the run, heard live; group B's pad 2 on tick 0 too.
    private fun pressPlan() = SeqPlan(
        ProjectPatterns().with(0, beats()).with(1, Pattern(1, listOf(PatternNote(0, 2, 24, id = 10)))),
        voices(),
        mapOf(1 to 0L),
        120.0,
    )

    @Test
    fun `a press anchors tick 0 on the frame heard then, the timeline out at once`() {
        val r = Rig()
        r.s.plan = pressPlan()
        r.s.armed = true
        assertFalse(r.s.running)
        // Armed and stopped: the output's stamps come, and nothing plays.
        r.run(48_000, stampEvery = 25)
        assertTrue(r.sink.events.isEmpty())
        val f = r.rendered - 1200
        val at = r.heard(f)
        r.s.play(0, atNanos = at)
        r.fill()
        // Out with this block, B's tick 0 (behind the mix) sent in it already.
        assertEquals(listOf("live:1:2" to f), r.sink.starts.map { it.key to it.at })
        val tl = r.s.timeline.value!!
        assertEquals(0.0, tl.tickAt(at), 1e-6)
        assertEquals(f, tl.frameOfTick(0))
        r.run(f + 2 * bar, stampEvery = 25)
        val starts = r.sink.starts.filter { it.at < f + 2 * bar }
        // B's tick 0 a little late (sent behind the mix), A's pressed note not again in pass 0, then each once on its frame.
        assertEquals("live:1:2" to f, starts.first().key to starts.first().at)
        assertTrue(starts.first().at < starts.first().rendered)
        assertEquals(
            listOf(f + 24000, f + 48000, f + 72000, f + bar, f + bar, f + bar + 24000, f + bar + 48000, f + bar + 72000),
            starts.drop(1).map { it.at },
        )
        assertEquals(listOf("live:0:0", "live:1:2"), starts.filter { it.at == f + bar }.map { it.key })
        // The stamps after it keep the same timeline.
        assertSame(tl, r.s.timeline.value)
    }

    @Test
    fun `a press heard longer ago than the lookahead replays nothing of the past`() {
        val r = Rig()
        r.s.plan = pressPlan()
        r.s.armed = true
        r.run(48_000, stampEvery = 25)
        val f = r.rendered - ahead - 2400
        r.s.play(0, atNanos = r.heard(f))
        r.run(f + bar, stampEvery = 25)
        val starts = r.sink.starts
        assertTrue(starts.all { it.at >= it.rendered - ahead })
        assertEquals(listOf(f + 24000, f + 48000, f + 72000), starts.filter { it.at < f + bar }.map { it.at })
        assertEquals(0.0, r.s.timeline.value!!.tickAt(r.heard(f)), 1e-6)
    }

    @Test
    fun `a press with no stamp, or one from frames counted before, waits for the next and anchors where it was heard`() {
        for (lost in listOf(false, true)) {
            val r = Rig()
            r.s.plan = pressPlan()
            r.s.armed = true
            if (lost) {
                // A stamp, then the output reopened: its frames count anew.
                r.run(48_000, stampEvery = 25)
                r.s.lost()
            } else {
                r.run(48_000)
            }
            val f = r.rendered - 1200
            val at = r.heard(f)
            r.s.play(0, atNanos = at)
            r.fill()
            r.rendered += 192
            r.fill()
            // Nothing sent and nothing out till a stamp says where the press was heard.
            assertTrue(r.sink.starts.isEmpty(), "lost $lost")
            assertNull(r.s.timeline.value, "lost $lost")
            r.stamp()
            // Out once the next block has sent what fell behind (B's tick 0, a little late).
            assertNull(r.s.timeline.value, "lost $lost")
            r.fill()
            assertEquals(listOf("live:1:2" to f), r.sink.starts.map { it.key to it.at }, "lost $lost")
            assertEquals(0.0, r.s.timeline.value!!.tickAt(at), 1e-6, "lost $lost")
            r.rendered += 192
            r.run(f + bar, stampEvery = 25)
            assertEquals(listOf(f, f + 24000, f + 48000, f + 72000), r.sink.starts.filter { it.at < f + bar }.map { it.at }, "lost $lost")
        }
    }

    @Test
    fun `a press no stamp follows for long takes the frames rendered as heard then`() {
        var now = 0L
        val r = Rig { now }
        r.s.plan = pressPlan()
        r.s.armed = true
        r.run(48_000)
        val at = 7_000_000_000L
        now = at
        r.s.play(0, atNanos = at)
        // Blocks of 4 ms and no stamp: nothing for half a second.
        while (now - at < PatternScheduler.PRESS_WAIT_NS) {
            r.fill()
            r.rendered += 192
            now += 4_000_000L
        }
        assertTrue(r.sink.starts.isEmpty())
        // Tick 0 half a second before the frames rendered; what fell further behind than the lookahead isn't sent.
        val f = r.rendered - 24_000
        r.run(f + bar)
        assertEquals(listOf(f + 24000, f + 48000, f + 72000), r.sink.starts.filter { it.at < f + bar }.map { it.at })
    }

    @Test
    fun `a stamp from before RECORD was last armed finds no press`() {
        val r = Rig()
        r.s.plan = pressPlan()
        r.s.armed = true
        r.run(48_000, stampEvery = 25)
        // Disarmed, the stamps stop, and the output's clock moves off the last one (an underrun, say).
        r.s.armed = false
        r.run(96_000)
        r.base += 30_000_000L
        r.s.armed = true
        val f = r.rendered - 1200
        val at = r.heard(f)
        r.s.play(0, atNanos = at)
        r.fill()
        assertNull(r.s.timeline.value)
        r.stamp()
        r.fill()
        assertEquals(f, r.s.timeline.value!!.frameOfTick(0))
        assertEquals(0.0, r.s.timeline.value!!.tickAt(at), 1e-6)
    }
}
