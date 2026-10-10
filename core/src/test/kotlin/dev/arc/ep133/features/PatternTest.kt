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

    /** A project's sequencer as it starts, playing [p]. */
    private fun seq(p: ProjectPatterns) = ProjectSeq.DEFAULT.withPlaying(p)

    @Test
    fun `patterns by project, the blank ones dropped`() {
        val p = seq(ProjectPatterns().with(1, Pattern(2)))
        val all = Patterns.EMPTY.put(1, p).put(3, ProjectSeq.DEFAULT).put(4, seq(ProjectPatterns()))
        assertEquals(p, all.of(1))
        assertEquals(ProjectSeq.DEFAULT, all.of(2))
        assertEquals(setOf(1), all.projects.keys)
        assertEquals(Patterns.EMPTY, all.put(1, ProjectSeq.DEFAULT))
        // Another scene is something: kept.
        assertEquals(setOf(5), Patterns.EMPTY.put(5, SceneOps.newScene(ProjectSeq.DEFAULT)).projects.keys)
    }

    @Test
    fun `the patterns survive the round trip, without ids or the open flag`() {
        val a = Pattern(2, listOf(PatternNote(96, 3, 24, semitones = 5, id = 7)))
        val all = Patterns.EMPTY.put(1, seq(ProjectPatterns().with(0, a)))
        assertEquals(
            """{"v":2,"projects":[{"project":1,"scene":0,"scenes":[[1,1,1,1]],"groups":[{"group":0,"patterns":[""" +
                """{"n":1,"bars":2,"notes":[{"t":96,"pad":3,"gate":24,"semi":5}]}]}]}]}""",
            all.toJson(),
        )
        assertEquals(Patterns.EMPTY.put(1, seq(ProjectPatterns().with(0, a.copy(notes = listOf(a.notes[0].copy(id = 0)))))), Patterns.fromJson(all.toJson()))
        // Velocity only when it isn't full; a pattern with only another length is kept; project 0 (none known) too.
        val more = Patterns.EMPTY
            .put(0, seq(ProjectPatterns().with(3, Pattern(1, listOf(PatternNote(0, 0, 1, velocity = 64))))))
            .put(2, seq(ProjectPatterns().with(1, Pattern(4))))
        assertEquals(
            """{"v":2,"projects":[{"project":0,"scene":0,"scenes":[[1,1,1,1]],"groups":[{"group":3,"patterns":[""" +
                """{"n":1,"bars":1,"notes":[{"t":0,"pad":0,"gate":1,"vel":64}]}]}]},""" +
                """{"project":2,"scene":0,"scenes":[[1,1,1,1]],"groups":[{"group":1,"patterns":[{"n":1,"bars":4,"notes":[]}]}]}]}""",
            more.toJson(),
        )
        assertEquals(more, Patterns.fromJson(more.toJson()))
        assertFalse(Patterns.EMPTY.put(1, seq(ProjectPatterns().with(0, a.copy(open = true)))).toJson().contains("open"))
        assertEquals(Patterns.EMPTY, Patterns.fromJson(Patterns.EMPTY.toJson()))
        assertEquals("""{"v":2,"projects":[]}""", Patterns.EMPTY.toJson())
    }

    @Test
    fun `scenes and banks survive the round trip, blank patterns left out`() {
        val kick = Pattern(1, listOf(PatternNote(0, 0, 24)))
        val p = ProjectSeq(
            banks = listOf(mapOf(1 to kick, 3 to Pattern(2, listOf(PatternNote(384, 1, 12)))), emptyMap(), mapOf(2 to Pattern(4)), mapOf(99 to kick)),
            scenes = listOf(Scene(listOf(1, 1, 1, 1)), Scene(listOf(3, 5, 2, 99))),
            scene = 1,
        )
        val all = Patterns.EMPTY.put(7, p)
        assertEquals(
            """{"v":2,"projects":[{"project":7,"scene":1,"scenes":[[1,1,1,1],[3,5,2,99]],"groups":[""" +
                """{"group":0,"patterns":[{"n":1,"bars":1,"notes":[{"t":0,"pad":0,"gate":24}]},{"n":3,"bars":2,"notes":[{"t":384,"pad":1,"gate":12}]}]},""" +
                """{"group":2,"patterns":[{"n":2,"bars":4,"notes":[]}]},""" +
                """{"group":3,"patterns":[{"n":99,"bars":1,"notes":[{"t":0,"pad":0,"gate":24}]}]}]}]}""",
            all.toJson(),
        )
        assertEquals(all, Patterns.fromJson(all.toJson()))
        assertEquals(1, Patterns.fromJson(all.toJson())!!.of(7).scene)
    }

    @Test
    fun `a version 1 file reads as pattern 1 of each group, in one scene, and is written as version 2`() {
        val v1 = """{"v":1,"projects":[{"project":1,"groups":[{"group":0,"bars":2,"notes":[{"t":96,"pad":3,"gate":24,"semi":5}]},""" +
            """{"group":2,"bars":4,"notes":[]}]}]}"""
        val read = Patterns.fromJson(v1)!!
        val want = ProjectSeq.DEFAULT
            .withPattern(0, 1, Pattern(2, listOf(PatternNote(96, 3, 24, semitones = 5))))
            .withPattern(2, 1, Pattern(4))
        assertEquals(want, read.of(1))
        assertEquals(listOf(Scene(listOf(1, 1, 1, 1))), read.of(1).scenes)
        assertEquals(
            """{"v":2,"projects":[{"project":1,"scene":0,"scenes":[[1,1,1,1]],"groups":[""" +
                """{"group":0,"patterns":[{"n":1,"bars":2,"notes":[{"t":96,"pad":3,"gate":24,"semi":5}]}]},""" +
                """{"group":2,"patterns":[{"n":1,"bars":4,"notes":[]}]}]}]}""",
            read.toJson(),
        )
        assertEquals(read, Patterns.fromJson(read.toJson()))
    }

    @Test
    fun `junk reads as nothing, and entries it can't read are skipped`() {
        assertNull(Patterns.fromJson("not json"))
        assertNull(Patterns.fromJson("[]"))
        assertNull(Patterns.fromJson("""{"v":3,"projects":[]}"""))
        assertNull(Patterns.fromJson("""{"v":"2","projects":[]}"""))
        assertNull(Patterns.fromJson("""{"projects":[]}"""))
        assertEquals(Patterns.EMPTY, Patterns.fromJson("""{"v":1}"""))
        assertEquals(Patterns.EMPTY, Patterns.fromJson("""{"v":2}"""))
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
            seq(ProjectPatterns().with(0, Pattern(2, listOf(PatternNote(0, 1, 24), PatternNote(48, 2, 12, semitones = -3, velocity = 100))))),
        )
        assertEquals(want, Patterns.fromJson(text))
    }

    @Test
    fun `version 2 junk is skipped too`() {
        val text = """{"v":2,"projects":[
            {"project":100,"scenes":[[1,1,1,1]],"groups":[]},
            "x",
            {"project":2,"scene":5,"scenes":[[1,1,1,1],[1,2,3],[0,1,1,1],[1,1,1,100],[1,"2",1,1],"x",[2,2,2,2]],"groups":[
                {"group":4,"patterns":[{"n":1,"bars":2,"notes":[]}]},
                {"group":"0","patterns":[{"n":1,"bars":2,"notes":[]}]},
                {"group":1,"patterns":[
                    {"n":0,"bars":2,"notes":[]},
                    {"n":100,"bars":2,"notes":[]},
                    {"n":2,"bars":0,"notes":[]},
                    {"n":2,"notes":[]},
                    "x",
                    {"n":2,"bars":3,"notes":[{"t":0,"pad":1,"gate":24},{"t":0,"pad":12,"gate":24}]}
                ]}
            ]},
            {"project":3,"scenes":[],"groups":[{"group":0,"patterns":[{"n":4,"bars":2,"notes":[]}]}]}
        ]}"""
        val read = Patterns.fromJson(text)!!
        assertEquals(setOf(2, 3), read.projects.keys)
        // The scenes it can read, and the index held to them.
        val two = read.of(2)
        assertEquals(listOf(Scene(listOf(1, 1, 1, 1)), Scene(listOf(2, 2, 2, 2))), two.scenes)
        assertEquals(1, two.scene)
        assertEquals(mapOf(2 to Pattern(3, listOf(PatternNote(0, 1, 24)))), two.banks[1])
        assertTrue(two.banks[0].isEmpty())
        // No scenes: the one of patterns 1.
        assertEquals(ProjectSeq.DEFAULT.withPattern(0, 4, Pattern(2)), read.of(3))
    }

    @Test
    fun `a pattern reads at most its note cap`() {
        val notes = (0 until Seq.MAX_NOTES + 5).joinToString(",") { """{"t":$it,"pad":0,"gate":1}""" }
        val read = Patterns.fromJson("""{"v":1,"projects":[{"project":1,"groups":[{"group":0,"bars":99,"notes":[$notes]}]}]}""")
        assertEquals(Seq.MAX_NOTES, read!!.of(1).playing().group(0).notes.size)
        val read2 = Patterns.fromJson("""{"v":2,"projects":[{"project":1,"groups":[{"group":0,"patterns":[{"n":1,"bars":99,"notes":[$notes]}]}]}]}""")
        assertEquals(Seq.MAX_NOTES, read2!!.of(1).pattern(0, 1).notes.size)
    }

    @Test
    fun `timing snaps to the nearest grid tick, ties up`() {
        assertEquals(Timing.SIXTEENTH, Timing.DEFAULT)
        assertEquals(listOf(0, 384, 192, 96, 48, 32, 24, 16, 12), Timing.entries.map { it.ticks })
        assertEquals(Timing.entries.drop(1), Timing.intervals)
        assertEquals(Timing.EIGHTH_T, Timing.of("1/8T"))
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

    @Test
    fun `swing pushes the odd steps of 1-8 and 1-16 late, up to half a step`() {
        assertEquals(listOf(Timing.EIGHTH, Timing.SIXTEENTH), Timing.entries.filter { it.swings })
        assertEquals(0, Timing.SIXTEENTH.swingOffset(0, 75))
        assertEquals(12, Timing.SIXTEENTH.swingOffset(1, 75))
        assertEquals(24, Timing.EIGHTH.swingOffset(3, 75))
        assertEquals(0, Timing.SIXTEENTH.swingOffset(1, 50))
        // 58%: 8 / 50 of 24 ticks, 3.84, rounds to 4.
        assertEquals(4, Timing.SIXTEENTH.swingOffset(1, 58))
        assertEquals(4, Timing.SIXTEENTH.swingOffset(-1, 58))
        // Held to 50..75.
        assertEquals(12, Timing.SIXTEENTH.swingOffset(1, 99))
        assertEquals(0, Timing.SIXTEENTH.swingOffset(1, 10))
        // Triplets, the long ones and 1/32 don't swing.
        for (t in listOf(Timing.SIXTEENTH_T, Timing.QUARTER, Timing.THIRTY_SECOND, Timing.OFF)) assertEquals(0, t.swingOffset(1, 75))
    }

    @Test
    fun `quantize snaps to the swung grid, straight the same as without swing`() {
        // At 75 the 1/16 grid is 0, 36, 48, 84, 96...
        assertEquals(36L, Timing.SIXTEENTH.quantize(30.0, 75))
        assertEquals(0L, Timing.SIXTEENTH.quantize(17.9, 75))
        // Ties round up: 18 is as near 0 as 36.
        assertEquals(36L, Timing.SIXTEENTH.quantize(18.0, 75))
        assertEquals(48L, Timing.SIXTEENTH.quantize(42.0, 75))
        assertEquals(84L, Timing.SIXTEENTH.quantize(70.0, 75))
        // Before 0: step -1 is late too, at -12.
        assertEquals(-12L, Timing.SIXTEENTH.quantize(-7.0, 75))
        assertEquals(0L, Timing.SIXTEENTH.quantize(-6.0, 75))
        // 1/16T doesn't swing.
        assertEquals(16L, Timing.SIXTEENTH_T.quantize(12.0, 75))
        assertEquals(10L, Timing.OFF.quantize(10.4, 75))
        var t = -50.0
        while (t < 450.0) {
            for (timing in Timing.entries) assertEquals(timing.quantize(t), timing.quantize(t, 50), "$timing at $t")
            t += 0.25
        }
    }

    @Test
    fun `TIMING's settings are never OFF, hold the swing, and record OFF in free time`() {
        val d = TimingSettings()
        assertEquals(TimingSettings(Timing.SIXTEENTH, 50, true), d)
        assertEquals(TimingSettings.DEFAULT, d)
        assertEquals(Timing.SIXTEENTH, TimingSettings(Timing.OFF).interval)
        assertEquals(Timing.SIXTEENTH, d.withInterval(Timing.EIGHTH).withInterval(Timing.OFF).interval)
        assertEquals(75, d.withSwing(80).swing)
        assertEquals(50, TimingSettings(swing = 0).swing)
        assertEquals(Timing.SIXTEENTH, d.record)
        assertEquals(Timing.OFF, d.withQuantize(false).record)
        assertEquals(Timing.EIGHTH_T, d.withQuantize(false).withInterval(Timing.EIGHTH_T).withQuantize(true).record)
    }
}
