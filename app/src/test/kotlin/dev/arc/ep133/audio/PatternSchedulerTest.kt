package dev.arc.ep133.audio

import dev.arc.ep133.features.Arp
import dev.arc.ep133.features.ArpNote
import dev.arc.ep133.features.ArpOrder
import dev.arc.ep133.features.ArpSettings
import dev.arc.ep133.features.FrameClock
import dev.arc.ep133.features.Keys
import dev.arc.ep133.features.Pattern
import dev.arc.ep133.features.PatternNote
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.ProjectPatterns
import dev.arc.ep133.features.Seq
import dev.arc.ep133.features.Timing
import dev.arc.ep133.features.TimingSettings
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
 * and the beat goes on where it was heard after a re-anchor. The arp and
 * note repeat step from the press on a clock of their own, or on the
 * pattern's grid while it runs.
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
    fun `the tick heard is the stamp's less the delay the stamp leaves out`() {
        // The pattern's clock is arc's own and its notes are not moved by the delay (the sequencer takes no input for
        // one); what the eye follows and a press lands on goes through the timeline's heard time.
        val a = Rig()
        a.s.plan = plan(0, beats())
        a.s.play(0)
        a.run(ahead + 2 * bar, stampEvery = 3)
        val t = a.s.timeline.value!!
        val delay = 180_000_000L
        // At 120 BPM a tick is 5 ms and a bit: 180 ms is 34.56 of them.
        val now = a.heard(ahead + bar / 2)
        assertEquals(t.tickAt(now), t.heardTickAt(now, 0L))
        assertEquals(t.tickAt(now) - 34.56, t.heardTickAt(now, delay), 1e-9)
        assertEquals(t.nanosOf(96) + delay, t.heardNanosOf(96, delay))
        assertEquals(t.nanosOf(96), t.heardNanosOf(96, 0L))
        // What is heard at a tick's heard time is that tick.
        assertEquals(96.0, t.heardTickAt(t.heardNanosOf(96, delay), delay), 1e-6)
        // A slower tempo makes the same time fewer ticks.
        a.s.plan = plan(0, beats(), bpm = 60.0)
        a.fill()
        val slow = a.s.timeline.value!!
        assertEquals(slow.tickAt(now) - 17.28, slow.heardTickAt(now, delay), 1e-9)
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

    // ---------- The arp and note repeat ----------

    // 1/16 at 120 BPM: 24 ticks, 6000 frames a step.
    private val step = 6000L

    private fun note(semis: Int?, velocity: Int = 127, pad: PhysicalPad = PhysicalPad(0, 0)) = ArpNote(pad, semis, velocity)

    private fun arpPlan(
        notes: List<ArpNote>,
        pressNanos: Long,
        order: ArpOrder = ArpOrder.PLAYED,
        gate: Int = 50,
        swing: Int = 50,
        interval: Timing = Timing.SIXTEENTH,
        keys: Boolean = true,
        bpm: Double = 120.0,
    ) = ArpPlan(notes, voices(), keys, TimingSettings(interval, swing), ArpSettings(order, gate = gate), bpm, 7, pressNanos)

    private val arpStarts: (Rig) -> List<Started> = { r -> r.sink.starts.filter { it.key.startsWith("arp:") } }

    @Test
    fun `a free arp plays its first step on the press, then a step every interval`() {
        val r = Rig()
        r.run(48_000)
        val f = r.rendered - 1200
        r.s.arp = arpPlan(listOf(note(0), note(4), note(7)), r.heard(f))
        assertTrue(r.s.running)
        assertFalse(r.s.playing)
        r.stamp()
        r.run(f + bar, stampEvery = 25)
        val starts = arpStarts(r).filter { it.at < f + bar }
        assertEquals(List(16) { f + it * step }, starts.map { it.at })
        assertEquals(List(16) { "arp:0:0:" + listOf(0, 4, 7)[it % 3] }, starts.map { it.key })
        assertEquals(List(16) { listOf(0, 4, 7)[it % 3] }, starts.map { it.semitones })
        assertTrue(starts.all { it.shape == keysShape && it.tag < 0 })
        // The press heard before the block: its step a little late, the rest ahead of the mix.
        assertTrue(starts.first().at < starts.first().rendered)
        assertTrue(starts.drop(1).all { it.at >= it.rendered })
        // No stamp: step 0 on the frames rendered.
        val q = Rig()
        q.run(48_000)
        q.s.arp = arpPlan(listOf(note(0)), q.heard(q.rendered))
        q.run(48_000 + bar)
        assertEquals(List(16) { 48_000 + it * step }, arpStarts(q).filter { it.at < 48_000 + bar }.map { it.at })
    }

    @Test
    fun `with the pattern running, the press plays at once and the steps after it lie on the grid`() {
        val r = Rig()
        val ticks = ArrayList<Long>()
        r.s.onArpStep = { ticks += it.globalTick }
        r.s.plan = SeqPlan(ProjectPatterns(), voices(), emptyMap(), 120.0)
        r.s.play(0)
        r.run(48_000, stampEvery = 25)
        // Tick 177.6: the grid's 1/16 at 180 is less than half a step on, so the next is 192.
        val f = r.rendered - 1200
        r.s.arp = arpPlan(listOf(note(0), note(4)), r.heard(f))
        r.run(f + bar, stampEvery = 25)
        val starts = arpStarts(r).filter { it.at < f + bar }
        assertEquals(f, starts.first().at)
        assertEquals(List(starts.size - 1) { ahead + (192 + it * 24) * 250L }, starts.drop(1).map { it.at })
        assertEquals(listOf(178L) + List(starts.size - 1) { 192L + it * 24 }, ticks.take(starts.size))
        assertTrue(ticks.zipWithNext().all { (a, b) -> b > a })
    }

    @Test
    fun `swing puts every odd step later, free and on the grid`() {
        val r = Rig()
        r.run(48_000)
        val f = r.rendered
        r.s.arp = arpPlan(listOf(note(0)), r.heard(f), swing = 75)
        r.run(f + bar)
        // 75%: half a 1/16 late, 12 ticks.
        assertEquals(List(16) { f + it * step + if (it % 2 == 1) 3000 else 0 }, arpStarts(r).filter { it.at < f + bar }.map { it.at })
        // On the grid: the odd 1/16s of the bar, from tick 0.
        val g = Rig()
        g.s.plan = SeqPlan(ProjectPatterns(), voices(), emptyMap(), 120.0)
        g.s.play(0)
        g.run(48_000, stampEvery = 25)
        g.s.arp = arpPlan(listOf(note(0)), g.heard(g.rendered - 1200), swing = 75)
        g.run(48_000 + bar, stampEvery = 25)
        for (s in arpStarts(g).drop(1)) {
            val tick = (s.at - ahead) / 250
            assertEquals(if ((tick / 24) % 2 == 1L) 12L else 0L, tick % 24, "tick $tick")
        }
        // Straight with 1/8T, which doesn't swing.
        val t = Rig()
        t.run(48_000)
        t.s.arp = arpPlan(listOf(note(0)), t.heard(t.rendered), swing = 75, interval = Timing.EIGHTH_T)
        t.run(48_000 + bar)
        assertEquals(List(12) { 48_000 + it * 8000L }, arpStarts(t).filter { it.at < 48_000 + bar }.map { it.at })
    }

    @Test
    fun `UP cycles across windows, neither repeating nor skipping a step through tempo and plan changes`() {
        val random = Random(133)
        val r = Rig()
        val held = listOf(note(7), note(0), note(4))
        val press = r.heard(0)
        while (r.rendered < 4 * bar) {
            r.s.arp = arpPlan(held, press, order = ArpOrder.UP, bpm = 90 + random.nextDouble() * 60)
            r.fill()
            r.rendered += 64 + random.nextInt(800)
        }
        val starts = arpStarts(r)
        assertTrue(starts.size > 40)
        assertEquals(List(starts.size) { "arp:0:0:" + listOf(0, 4, 7)[it % 3] }, starts.map { it.key })
        assertTrue(starts.zipWithNext().all { (a, b) -> b.at > a.at })
        // Steps at 90..150 BPM: 4000..6667 frames apart.
        assertTrue(starts.zipWithNext().all { (a, b) -> b.at - a.at in 3990..6680 }) { starts.zipWithNext().map { (a, b) -> b.at - a.at }.toString() }
    }

    @Test
    fun `each step lets go at its gate, on the voice it started`() {
        val r = Rig()
        r.s.arp = arpPlan(listOf(note(0), note(5)), r.heard(0), gate = 50)
        r.run(bar)
        val starts = arpStarts(r).filter { it.at + 3000 < bar - ahead }
        val releases = r.sink.releases
        assertTrue(starts.size >= 10)
        for (s in starts) {
            val rel = releases.single { it.tag == s.tag }
            assertEquals(s.key, rel.key)
            // Half of a 1/16: 12 ticks.
            assertEquals(s.at + 3000, rel.at)
        }
        assertEquals(Arp.gateTicks(Timing.SIXTEENTH, 50), 12)
    }

    @Test
    fun `no plan lets go of every arp voice, and nothing more plays`() {
        val r = Rig()
        r.s.arp = arpPlan(listOf(note(0), note(4)), r.heard(0), gate = 100)
        r.run(30_000)
        val sounding = arpStarts(r).filter { it.at < r.rendered }.last()
        r.s.arp = null
        assertFalse(r.s.running)
        r.fill()
        val stopAt = r.rendered
        r.run(r.rendered + bar)
        val starts = arpStarts(r)
        // Each voice let go of: the one sounding where the mix was, any sent to start later at its gate.
        for (s in starts) assertTrue(r.sink.releases.any { it.tag == s.tag }) { "${s.key} at ${s.at} never let go of" }
        assertEquals(stopAt, r.sink.releases.filter { it.tag == sounding.tag }.minOf { it.at })
        assertTrue(starts.all { it.at < stopAt + ahead })
        assertFalse(r.sink.events.contains(Flushed))
    }

    @Test
    fun `note repeat plays every pad held on each step, as pad hits`() {
        val r = Rig()
        val a1 = PhysicalPad(0, 0)
        val b3 = PhysicalPad(1, 4)
        r.s.arp = arpPlan(listOf(note(null, pad = a1), note(null, velocity = 64, pad = b3)), r.heard(0), keys = false)
        r.run(bar)
        val starts = arpStarts(r).filter { it.at < bar }
        assertEquals(32, starts.size)
        for ((i, pair) in starts.chunked(2).withIndex()) {
            assertEquals(listOf("arp:0:0:n", "arp:1:4:n"), pair.map { it.key })
            assertTrue(pair.all { it.at == i * step && it.semitones == 0 })
            assertEquals(padShape, pair[0].shape)
            // Softer: (64 / 127)² of the pad's gain.
            assertEquals(padShape.gain * Arp.velocityGain(64), pair[1].shape.gain, 1e-6f)
        }
    }

    @Test
    fun `a pattern note plays at its velocity, 127 as it was`() {
        val r = Rig()
        val pattern = Pattern(1, listOf(PatternNote(0, 0, 24, id = 1), PatternNote(96, 0, 24, velocity = 32, id = 2)))
        r.s.plan = plan(0, pattern)
        r.s.play(0)
        r.run(bar)
        val (loud, soft) = r.sink.starts
        assertSame(padShape, loud.shape)
        assertEquals(padShape.gain * Arp.velocityGain(32), soft.shape.gain, 1e-6f)
    }

    // A plan with [now] playing, and the group's [queued] pattern from its tick; [also] are other groups' patterns playing.
    private fun switching(now: Pattern, vararg queued: Pair<Int, QueuedSwitch>, also: Map<Int, Pattern> = emptyMap()): SeqPlan {
        var p = ProjectPatterns()
        for ((g, pat) in also) p = p.with(g, pat)
        for ((g, _) in queued) p = p.with(g, now)
        return SeqPlan(p, voices(), emptyMap(), 120.0, queued.toMap())
    }

    // What started up to tick [until]: its tick (250 frames each at this tempo) and voice.
    private fun startsBefore(r: Rig, until: Long): List<Pair<Long, String>> =
        r.sink.starts.filter { it.at < ahead + until * 250 }.map { (it.at - ahead) / 250 to it.key }

    // A bar with a hit on pad [pad] (0..11) at each of [ticks].
    private fun hits(pad: Int, vararg ticks: Int) = Pattern(1, ticks.mapIndexed { i, t -> PatternNote(t, pad, 24, id = i + 1) })

    @Test
    fun `a switch at a bar line plays the old pattern before it and the queued one from it`() {
        val r = Rig()
        // A's beats on A 1, B's two hits on A 2: B takes over at bar 3 (tick 768), and is on its own bar 1 there.
        r.s.plan = switching(beats(), 0 to QueuedSwitch(hits(1, 0, 192), 2L * Seq.TICKS_PER_BAR))
        r.s.play(0)
        r.run(ahead + 4 * bar)
        val a = listOf(0L, 96, 192, 288, 384, 480, 576, 672).map { it to "live:0:0" }
        val b = listOf(768L, 960, 1152, 1344).map { it to "live:0:1" }
        assertEquals(a + b, startsBefore(r, 4L * Seq.TICKS_PER_BAR))
    }

    @Test
    fun `a switch at a pattern end drops the old pattern's second pass and starts the queued one on its tick`() {
        val r = Rig()
        // A is 2 bars, a note in each: the switch at tick 768 is its end. B is a bar: it plays at 768 and again at 1152.
        val a = Pattern(2, listOf(PatternNote(0, 0, 24, id = 1), PatternNote(400, 0, 24, id = 2)))
        r.s.plan = switching(a, 0 to QueuedSwitch(hits(1, 0), 768))
        r.s.play(0)
        r.run(ahead + 4 * bar)
        assertEquals(
            listOf(0L to "live:0:0", 400L to "live:0:0", 768L to "live:0:1", 1152L to "live:0:1"),
            startsBefore(r, 4L * Seq.TICKS_PER_BAR),
        )
    }

    @Test
    fun `an immediate switch keeps the queued pattern on the transport's bar 1, whatever tick it comes at`() {
        val r = Rig()
        // From tick 100: the old pattern plays its notes at 0 and 96; B's note at 0 is before the switch, so it doesn't play
        // and the old note at 288 is after it, so nor does that; B's at 192 does, and B loops on from its own tick 0.
        r.s.plan = switching(beats(), 0 to QueuedSwitch(hits(1, 0, 192), 100))
        r.s.play(0)
        r.run(ahead + 2 * bar)
        assertEquals(
            listOf(0L to "live:0:0", 96L to "live:0:0", 192L to "live:0:1", 384L to "live:0:1", 576L to "live:0:1"),
            startsBefore(r, 2L * Seq.TICKS_PER_BAR),
        )
    }

    @Test
    fun `two groups switch at their own ticks`() {
        val r = Rig()
        val a = Pattern(1, listOf(PatternNote(0, 0, 24, id = 1), PatternNote(192, 0, 24, id = 2)))
        val b = Pattern(1, listOf(PatternNote(96, 1, 24, id = 3)))
        // A switches at bar 2, B at bar 3.
        r.s.plan = switching(a, 0 to QueuedSwitch(b, 384), 1 to QueuedSwitch(b, 768))
        r.s.play(0)
        r.run(ahead + 3 * bar)
        assertEquals(
            listOf(
                0L to "live:0:0", 0L to "live:1:0", 192L to "live:0:0", 192L to "live:1:0",
                384L to "live:1:0", 480L to "live:0:1", 576L to "live:1:0", 864L to "live:0:1", 864L to "live:1:1",
            ),
            startsBefore(r, 3L * Seq.TICKS_PER_BAR),
        )
    }

    @Test
    fun `a group with no queue is left as it was`() {
        val r = Rig()
        val other = Pattern(1, listOf(PatternNote(48, 5, 24, id = 9)))
        r.s.plan = switching(beats(), 0 to QueuedSwitch(hits(1, 0), 384), also = mapOf(2 to other))
        r.s.play(0)
        r.run(ahead + 2 * bar)
        val c = startsBefore(r, 2L * Seq.TICKS_PER_BAR).filter { it.second == "live:2:5" }
        assertEquals(listOf(48L, 432L), c.map { it.first })
    }

    @Test
    fun `the plan taking the queued pattern in place of the queue neither repeats nor skips a note`() {
        val b = hits(1, 0, 96, 192, 288)
        val queued = switching(beats(), 0 to QueuedSwitch(b, 384))
        val whole = Rig()
        whole.s.plan = queued
        whole.s.play(0)
        whole.run(ahead + 4 * bar)
        // The controller applies the switch once the playhead passes it: the pattern itself, no queue.
        val applied = Rig()
        applied.s.plan = queued
        applied.s.play(0)
        applied.run(ahead + 384 * 250 + 4800)
        applied.s.plan = SeqPlan(ProjectPatterns().with(0, b), voices(), emptyMap(), 120.0)
        applied.run(ahead + 4 * bar)
        assertEquals(startsBefore(whole, 1536), startsBefore(applied, 1536))
        assertEquals(whole.sink.starts.map { it.at }, applied.sink.starts.map { it.at })
    }

    @Test
    fun `a switch queued at the free tick finds nothing of the old pattern sent from it, and the queued one whole`() {
        // Hits every 24 ticks, the old pattern on pad 0 and the queued one on pad 1, so the window the switch lands in has some.
        val every = IntArray(16) { it * 24 }
        val r = Rig()
        assertEquals(Long.MIN_VALUE, r.s.freeTick)
        r.s.plan = plan(0, hits(0, *every))
        r.s.play(0)
        r.run(ahead + bar / 2 + 1234)
        val at = r.s.freeTick
        // Past what was sent: the old pattern's notes sent so far are all before it.
        assertTrue(r.sink.starts.all { (it.at - ahead) / 250 < at })
        assertTrue(at > (r.rendered - ahead) / 250)
        r.s.plan = switching(hits(0, *every), 0 to QueuedSwitch(hits(1, *every), at))
        r.run(ahead + 2 * bar)
        val heard = startsBefore(r, 2L * Seq.TICKS_PER_BAR)
        assertTrue(heard.none { it.second == "live:0:0" && it.first >= at })
        val queued = (0 until 2L * Seq.TICKS_PER_BAR step 24).filter { it >= at }.map { it to "live:0:1" }
        assertEquals(queued, heard.filter { it.second == "live:0:1" })
        r.s.stop()
        r.run(r.rendered + 192)
        assertEquals(Long.MIN_VALUE, r.s.freeTick)
    }

    @Test
    fun `a note of the old pattern sounding at the switch is let go of at its own gate`() {
        val r = Rig()
        // A's note starts at 300 and lasts to 500; the switch at 384 takes the pattern, not the gate.
        val a = Pattern(1, listOf(PatternNote(300, 0, 200, id = 1)))
        r.s.plan = switching(a, 0 to QueuedSwitch(hits(1, 0), 384))
        r.s.play(0)
        r.run(ahead + 2 * bar)
        val held = r.sink.starts.first { it.key == "live:0:0" }
        val release = r.sink.releases.first { it.key == "live:0:0" }
        assertEquals(held.tag, release.tag)
        assertEquals(ahead + 500 * 250, release.at)
        assertEquals(listOf(300L to "live:0:0", 384L to "live:0:1"), startsBefore(r, 768))
        // Nothing dropped but what PLAY's own start dropped.
        assertEquals(1, r.sink.events.count { it === Flushed })
    }

    @Test
    fun `steps are told for RECORD only while the pattern runs, which they move onto at its start`() {
        val r = Rig()
        val told = ArrayList<ArpStep>()
        r.s.onArpStep = { told += it }
        r.s.plan = SeqPlan(ProjectPatterns(), voices(), emptyMap(), 120.0)
        r.s.arp = arpPlan(listOf(note(0)), r.heard(0), gate = 25)
        r.run(bar, stampEvery = 25)
        assertTrue(arpStarts(r).isNotEmpty())
        assertTrue(told.isEmpty())
        val before = arpStarts(r).size
        r.s.play(0)
        r.run(3 * bar, stampEvery = 25)
        // PLAY anchors tick 0 a lookahead on; from there, the grid's steps.
        val zero = bar + ahead
        val after = arpStarts(r).drop(before)
        assertTrue(after.isNotEmpty())
        for (s in after) assertEquals(0L, (s.at - zero) % step, "frame ${s.at}")
        assertEquals(after.size, told.size)
        assertEquals(after.map { (it.at - zero) / 250 }, told.map { it.globalTick })
        assertTrue(told.all { it.gateTicks == 6 && it.note == note(0) })
        // Stopped, the arp goes on its own clock, and RECORD hears nothing more.
        r.s.stop()
        val n = told.size
        r.run(4 * bar, stampEvery = 25)
        assertEquals(n, told.size)
        assertTrue(arpStarts(r).last().at > 3 * bar + ahead)
    }

    @Test
    fun `a step STOP drops before it is mixed is never told for RECORD`() {
        val r = Rig()
        val told = ArrayList<Pair<ArpStep, Long>>()
        r.s.onArpStep = { told += it to r.rendered }
        r.s.plan = SeqPlan(ProjectPatterns(), voices(), emptyMap(), 120.0)
        r.s.play(0)
        r.run(48_000, stampEvery = 25)
        r.s.arp = arpPlan(listOf(note(0)), r.heard(r.rendered - 1200))
        // Tick 480 (frame 218400) is sent a lookahead early, and not yet mixed when STOP comes.
        val zero = ahead
        val pending = zero + 480 * 250L
        r.run(pending - 1056, stampEvery = 25)
        assertTrue(arpStarts(r).any { it.at == pending && it.rendered < pending })
        // Each one told was mixed by then.
        assertTrue(told.isNotEmpty())
        for ((s, at) in told) assertTrue(zero + s.globalTick * 250 < at, "tick ${s.globalTick} told at $at")
        r.s.stop()
        r.run(pending + bar, stampEvery = 25)
        assertTrue(r.sink.events.contains(Flushed))
        assertTrue(told.none { it.first.globalTick >= 480 }, told.map { it.first.globalTick }.toString())
    }
}
