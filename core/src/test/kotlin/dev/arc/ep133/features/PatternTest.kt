package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PatternTest {
    @Test
    fun `the device's sequencer numbers`() {
        assertEquals(96, Seq.PPQN)
        assertEquals(384, Seq.TICKS_PER_BAR)
        assertEquals(listOf(1, 2, 4, 8), Seq.LENGTHS)
        assertEquals(384, Pattern().lengthTicks)
        assertEquals(99 * 384, Pattern(bars = 99).lengthTicks)
    }

    @Test
    fun `a pattern plays its notes in tick order, not those past its end`() {
        val late = PatternNote(400, 1, 24)
        val p = Pattern(1, listOf(PatternNote(200, 3, 24), late, PatternNote(0, 2, 24)))
        assertFalse(p.isEmpty)
        assertTrue(Pattern().isEmpty)
        assertEquals(listOf(0, 200), p.playable().map { it.tick })
        // Longer again, the note past the end plays again.
        assertEquals(listOf(0, 200, 400), p.copy(bars = 2).playable().map { it.tick })
    }

    @Test
    fun `a project's patterns, one a group`() {
        val a = Pattern(1, listOf(PatternNote(0, 3, 24), PatternNote(96, 3, 24, semitones = 2), PatternNote(500, 7, 24)))
        val p = ProjectPatterns().with(0, a).with(2, Pattern(4, listOf(PatternNote(10, 0, 24))))
        assertEquals(a, p.group(0))
        assertEquals(Pattern(), p.group(1))
        assertEquals(4 * 384, p.longestTicks)
        assertEquals(384, ProjectPatterns().longestTicks)
        assertFalse(p.isEmpty)
        assertTrue(ProjectPatterns().isEmpty)
        // The note past A's end isn't played, so its pad isn't needed.
        assertEquals(setOf(PhysicalPad(0, 3), PhysicalPad(2, 0)), p.usedPads())
    }

    @Test
    fun `patterns by project, the blank ones dropped`() {
        val p = ProjectPatterns().with(1, Pattern(2))
        val all = Patterns.EMPTY.put(1, p).put(3, ProjectPatterns())
        assertEquals(p, all.of(1))
        assertEquals(ProjectPatterns(), all.of(2))
        assertEquals(setOf(1), all.projects.keys)
        assertEquals(Patterns.EMPTY, all.put(1, ProjectPatterns()))
    }

    @Test
    fun `the patterns survive the round trip, without ids or the open flag`() {
        val a = Pattern(2, listOf(PatternNote(96, 3, 24, semitones = 5, id = 7)))
        val all = Patterns.EMPTY.put(1, ProjectPatterns().with(0, a))
        assertEquals("""{"v":1,"projects":[{"project":1,"groups":[{"group":0,"bars":2,"notes":[{"t":96,"pad":3,"gate":24,"semi":5}]}]}]}""", all.toJson())
        assertEquals(Patterns.EMPTY.put(1, ProjectPatterns().with(0, a.copy(notes = listOf(a.notes[0].copy(id = 0))))), Patterns.fromJson(all.toJson()))
        // Velocity only when it isn't full; a group with only another length is kept; project 0 (none known) too.
        val more = Patterns.EMPTY
            .put(0, ProjectPatterns().with(3, Pattern(1, listOf(PatternNote(0, 0, 1, velocity = 64)))))
            .put(2, ProjectPatterns().with(1, Pattern(4)))
        assertEquals(
            """{"v":1,"projects":[{"project":0,"groups":[{"group":3,"bars":1,"notes":[{"t":0,"pad":0,"gate":1,"vel":64}]}]},""" +
                """{"project":2,"groups":[{"group":1,"bars":4,"notes":[]}]}]}""",
            more.toJson(),
        )
        assertEquals(more, Patterns.fromJson(more.toJson()))
        assertFalse(Patterns.EMPTY.put(1, ProjectPatterns().with(0, a.copy(open = true))).toJson().contains("open"))
        assertEquals(Patterns.EMPTY, Patterns.fromJson(Patterns.EMPTY.toJson()))
    }

    @Test
    fun `junk reads as nothing, and entries it can't read are skipped`() {
        assertNull(Patterns.fromJson("not json"))
        assertNull(Patterns.fromJson("[]"))
        assertNull(Patterns.fromJson("""{"v":2,"projects":[]}"""))
        assertNull(Patterns.fromJson("""{"projects":[]}"""))
        assertEquals(Patterns.EMPTY, Patterns.fromJson("""{"v":1}"""))
        val text = """{"v":1,"projects":[
            {"project":100,"groups":[{"group":0,"bars":2,"notes":[]}]},
            {"project":"1","groups":[{"group":0,"bars":2,"notes":[]}]},
            {"project":1,"groups":[
                {"group":4,"bars":2,"notes":[]},
                {"group":1,"bars":0,"notes":[]},
                {"group":1,"bars":100,"notes":[]},
                {"group":2,"notes":[]},
                {"group":0,"bars":2,"notes":[
                    {"t":0,"pad":1,"gate":24},
                    {"t":-1,"pad":1,"gate":24},
                    {"t":0,"pad":12,"gate":24},
                    {"t":0,"pad":1,"gate":0},
                    {"t":0,"pad":1,"gate":24,"semi":"2"},
                    {"t":0,"pad":1,"gate":24,"vel":0},
                    {"t":0,"pad":1},
                    "x",
                    {"t":48,"pad":2,"gate":12,"semi":-3,"vel":100}
                ]}
            ]}
        ]}"""
        val want = Patterns.EMPTY.put(
            1,
            ProjectPatterns().with(0, Pattern(2, listOf(PatternNote(0, 1, 24), PatternNote(48, 2, 12, semitones = -3, velocity = 100)))),
        )
        assertEquals(want, Patterns.fromJson(text))
    }

    @Test
    fun `a group reads at most its note cap`() {
        val notes = (0 until Seq.MAX_NOTES + 5).joinToString(",") { """{"t":$it,"pad":0,"gate":1}""" }
        val read = Patterns.fromJson("""{"v":1,"projects":[{"project":1,"groups":[{"group":0,"bars":99,"notes":[$notes]}]}]}""")
        assertEquals(Seq.MAX_NOTES, read!!.of(1).group(0).notes.size)
    }

    @Test
    fun `timing snaps to the nearest grid tick, ties up`() {
        assertEquals(Timing.SIXTEENTH, Timing.DEFAULT)
        assertEquals(listOf(0, 48, 24, 12), Timing.entries.map { it.ticks })
        assertEquals(Timing.EIGHTH, Timing.of("1/8"))
        assertEquals(Timing.OFF, Timing.of("off"))
        assertNull(Timing.of("1/64"))
        assertEquals(0L, Timing.SIXTEENTH.quantize(11.9))
        assertEquals(24L, Timing.SIXTEENTH.quantize(12.0))
        assertEquals(24L, Timing.SIXTEENTH.quantize(35.9))
        assertEquals(48L, Timing.EIGHTH.quantize(24.0))
        assertEquals(12L, Timing.THIRTY_SECOND.quantize(17.9))
        // On the length: the caller wraps it.
        assertEquals(384L, Timing.SIXTEENTH.quantize(380.0))
        // Before tick 0: half a step rounds up to 0, more doesn't.
        assertEquals(0L, Timing.SIXTEENTH.quantize(-12.0))
        assertEquals(-24L, Timing.SIXTEENTH.quantize(-12.1))
        // OFF: the nearest whole tick.
        assertEquals(10L, Timing.OFF.quantize(10.49))
        assertEquals(11L, Timing.OFF.quantize(10.5))
        assertEquals(0L, Timing.OFF.quantize(-0.5))
    }
}
