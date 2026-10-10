package dev.arc.ep133.controller

import dev.arc.ep133.features.BeatCard
import dev.arc.ep133.features.BeatCards
import dev.arc.ep133.features.CardFx
import dev.arc.ep133.features.CardPad
import dev.arc.ep133.features.CardSection
import dev.arc.ep133.features.CardSound
import dev.arc.ep133.features.Comp
import dev.arc.ep133.features.FxSettings
import dev.arc.ep133.features.FxType
import dev.arc.ep133.features.OfflinePad
import dev.arc.ep133.features.OfflinePads
import dev.arc.ep133.features.PadSettings
import dev.arc.ep133.features.PadTarget
import dev.arc.ep133.features.PlayMode
import dev.arc.ep133.features.SoundSource
import dev.arc.ep133.features.SoundStatus
import dev.arc.ep133.protocol.SoundEntry
import dev.arc.ep133.features.Pattern
import dev.arc.ep133.features.PatternNote
import dev.arc.ep133.features.PatternRecorder
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.ProjectSeq
import dev.arc.ep133.features.SceneOps
import dev.arc.ep133.features.Seq
import dev.arc.ep133.features.Timing
import dev.arc.ep133.text.ClaudeText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Beat cards as the controller works them: what a share sends, the sheet's plan and grids, and an import as one UNDO step. */
class BeatPlanTest {
    private val kick = PhysicalPad(0, 9)
    private val names = mapOf(kick to "kick", PhysicalPad(0, 11) to "snare")
    private val nameOf: (PhysicalPad) -> String? = { names[it] }
    private val bar = Seq.TICKS_PER_BAR

    private fun hit(tick: Int, offset: Int = 9, velocity: Int = 127) = PatternNote(tick, offset, 24, null, velocity)

    private fun pattern(vararg notes: PatternNote, bars: Int = 1) = Pattern(bars, notes.toList())

    private fun with(seq: ProjectSeq, group: Int, n: Int, p: Pattern) = seq.withPattern(group, n, p)

    private fun card(vararg sections: CardSection, tempo: Double? = null, swing: Int = 50, name: String? = null) = BeatCard(name, tempo, swing, sections.toList())

    private fun section(group: Int, p: Pattern) = CardSection(group, null, p)

    private fun read(card: BeatCard) = BeatCards.read(BeatCards.write(card))

    // ---- sharing ----

    @Test
    fun `a share is the scene's patterns or a group's as a tidied card in a fenced block, or nothing without notes`() {
        assertNull(beatShare(ProjectSeq.DEFAULT, null, 120.0, 50, nameOf))
        assertNull(beatShare(ProjectSeq.DEFAULT, 0, 120.0, 50, nameOf))
        var seq = with(ProjectSeq.DEFAULT, 0, 1, pattern(hit(0)))
        seq = with(seq, 2, 1, pattern(hit(0, 11), hit(96, 11), bars = 2))
        val scene = beatShare(seq, null, 92.0, 50, nameOf)!!
        assertEquals("Arc beat S01", scene.subject)
        assertTrue(scene.text.startsWith(ClaudeText.SHARE_PROMPT + "\n\n```\nARC BEAT 1\nname S01\ntempo 92\nswing 50\n# tidied"))
        assertTrue(scene.text.endsWith("\n```\n"))
        // The blank groups (B, D) are left out; the pad's name is on its row.
        val card = BeatCards.read(scene.text).card!!
        assertEquals(listOf(0, 2), card.sections.map { it.group })
        assertTrue(scene.text.contains("A7 kick"))
        // One group: its own pattern, named by the number and the scene; a group with no notes shares nothing.
        val one = beatShare(seq, 2, 92.0, 50, nameOf)!!
        assertEquals("Arc beat P01 S01", one.subject)
        assertEquals(listOf(2), BeatCards.read(one.text).card!!.sections.map { it.group })
        assertNull(beatShare(seq, 1, 92.0, 50, nameOf))
        // The scene playing and the pattern picked: the second scene's own.
        val two = SceneOps.newScene(seq)
        assertNull(beatShare(two, null, 92.0, 50, nameOf))
        assertEquals("Arc beat S02", beatShare(with(two, 1, 2, pattern(hit(0))), null, 92.0, 50, nameOf)!!.subject)
    }

    @Test
    fun `the swing is kept only where every hit sits on it`() {
        val seq = with(ProjectSeq.DEFAULT, 0, 1, pattern(hit(0), hit(24 + 6)))
        // 1/16 swung 58%: the odd step plays 4 ticks late (24 + 4 = 28), so 30 is off the grid: the card is straight.
        assertTrue(beatShare(seq, 0, 120.0, 58, nameOf)!!.text.contains("\nswing 50\n"))
        val swung = with(ProjectSeq.DEFAULT, 0, 1, pattern(hit(0), hit(28)))
        assertTrue(beatShare(swung, 0, 120.0, 58, nameOf)!!.text.contains("\nswing 58\n"))
    }

    // ---- the grid ----

    @Test
    fun `a grid has a row for each pad with notes, the keypad's order, lit by velocity`() {
        val g = beatGrid(
            section(0, pattern(hit(0, 9, 127), hit(96, 9, 100), hit(192, 9, 40), hit(0, 11, 127), hit(48, 6, 100))),
            50, nameOf, 4,
        )
        assertEquals(Timing.SIXTEENTH, g.step)
        assertEquals(16, g.perBar)
        assertEquals(4, g.goesTo)
        // The keypad goes 7 8 9 / 4 5 6 from the top: 7 (offset 9), 9 (offset 11), then 4 (offset 6).
        assertEquals(listOf(9, 11, 6), g.rows.map { it.pad.offset })
        assertEquals(listOf("kick", "snare", null), g.rows.map { it.name })
        assertEquals(listOf(3, 1, 1), g.rows.map { it.hits })
        val kicks = g.rows[0].cells
        assertEquals(16, kicks.size)
        assertEquals(Weight.ACCENT, kicks[0])
        assertEquals(Weight.NORMAL, kicks[4])
        assertEquals(Weight.GHOST, kicks[8])
        assertNull(kicks[1])
        assertEquals(0, g.moreBars)
    }

    @Test
    fun `a long pattern shows its first two bars, and the rest as more bars`() {
        val g = beatGrid(section(0, pattern(hit(0), hit(bar * 3), bars = 4)), 50, nameOf, 1)
        assertEquals(2, g.shownBars)
        assertEquals(2, g.moreBars)
        assertEquals(32, g.rows[0].cells.size)
        // The hit in bar 4 is a hit of the row all the same.
        assertEquals(2, g.rows[0].hits)
    }

    @Test
    fun `a grid reads in 1_16T or 1_32 when the hits need it, and notes past the end are left out`() {
        assertEquals(Timing.SIXTEENTH_T, beatGrid(section(0, pattern(hit(0), hit(16))), 50, nameOf, 1).step)
        assertEquals(Timing.THIRTY_SECOND, beatGrid(section(0, pattern(hit(0), hit(12))), 50, nameOf, 1).step)
        val g = beatGrid(section(0, pattern(hit(0), hit(bar + 24))), 50, nameOf, 1)
        assertEquals(listOf(1), g.rows.map { it.hits })
    }

    // ---- the sheet ----

    @Test
    fun `the sheet names where each section goes, the scene a card adds, and the tempo and swing it says`() {
        val seq = with(ProjectSeq.DEFAULT, 0, 2, pattern(hit(0)))
        val a = pattern(hit(0), hit(96), bars = 2)
        val b = pattern(hit(48, 11))
        val one = beatImportUi(read(card(section(0, a), tempo = 92.0, swing = 50, name = "Lazy")), seq, 120.0, nameOf)
        assertEquals("Lazy", one.title)
        assertEquals("Beat card · 2 bars · 1 pad · 2 hits", one.summary)
        // A is on pattern 1 (with notes in 2): the next free after it is 3.
        assertEquals(listOf(0 to 3), one.placed)
        assertEquals(listOf(3), one.grids.map { it.goesTo })
        assertNull(one.scene)
        assertEquals(92, one.tempo)
        assertEquals(120, one.tempoNow)
        assertNull(one.swing)
        assertNull(one.blocked)
        assertTrue(one.problems.isEmpty())
        // Three groups: a new scene (the second), the tempo is the same (hidden) and the swing is said.
        val swung = pattern(hit(0), hit(28))
        val three = beatImportUi(read(card(section(0, swung), section(1, b), section(3, b), tempo = 120.4, swing = 58)), seq, 120.0, nameOf)
        assertEquals(1, three.scene)
        assertEquals(3, three.placed.size)
        assertNull(three.tempo)
        assertEquals(58, three.swing)
        assertEquals("Beat card", three.title)
        assertEquals("Beat card · 1 bar · 3 pads · 4 hits", three.summary)
        // The bars are the longest group's, as the scene loops over it, not the groups' lengths added up.
        val mixed = card(section(0, pattern(hit(0))), section(1, pattern(hit(0), bars = 2)), section(2, pattern(hit(0), bars = 4)))
        assertEquals("Beat card · 4 bars · 3 pads · 3 hits", beatImportUi(read(mixed), seq, 120.0, nameOf).summary)
        // No tempo on the card: nothing to offer.
        assertNull(beatImportUi(read(card(section(0, a))), seq, 100.0, nameOf).tempo)
    }

    @Test
    fun `a card that can't be read lists its problems and a full group blocks the import`() {
        val bad = BeatCards.read("ARC BEAT 1\n[A]\nA7 | X... |\n")
        val ui = beatImportUi(bad, ProjectSeq.DEFAULT, 120.0, nameOf)
        assertNull(ui.card)
        assertNull(ui.summary)
        assertEquals(ClaudeText.FIX_ERRORS, ui.blocked)
        assertTrue(ui.problems.any { it.error })
        assertEquals(emptyList<BeatGridUi>(), ui.grids)
        var full = ProjectSeq.DEFAULT
        for (n in 1..Seq.MAX_PATTERNS) full = with(full, 1, n, pattern(hit(0)))
        val blocked = beatImportUi(read(card(section(0, pattern(hit(0))), section(1, pattern(hit(0))))), full, 120.0, nameOf)
        assertEquals("Group B has no free pattern.", blocked.blocked)
        assertEquals(emptyList<Pair<Int, Int>>(), blocked.placed)
        assertEquals(listOf(null, null), blocked.grids.map { it.goesTo })
    }

    // ---- import ----

    @Test
    fun `a card of one group goes into the next free pattern and is picked, in one undo step`() {
        val recorder = PatternRecorder()
        var seq = with(ProjectSeq.DEFAULT, 0, 1, pattern(hit(0, 11)))
        recorder.seq = seq
        val applied = applyBeat(seq, card(section(0, pattern(hit(0), hit(96), bars = 2))), recorder)
        assertNull(applied.fullGroup)
        assertEquals(listOf(0 to 2), applied.placed)
        assertNull(applied.scene)
        assertEquals(2, applied.seq.selected(0))
        assertEquals(2, applied.seq.pattern(0, 2).bars)
        assertEquals(1, applied.seq.scenes.size)
        // The pattern that was there stays, in its slot.
        assertFalse(applied.seq.pattern(0, 1).isEmpty)
        assertEquals("Imported to A · 02. UNDO takes it back.", beatImported(applied))
        assertTrue(recorder.canUndo)
        // One undo: the banks and the picks as they were.
        seq = applied.seq
        assertEquals(with(ProjectSeq.DEFAULT, 0, 1, pattern(hit(0, 11))), recorder.undo(seq))
        assertFalse(recorder.canUndo)
    }

    @Test
    fun `a card of several groups adds a scene that plays them, in one undo step`() {
        val recorder = PatternRecorder()
        val seq = with(ProjectSeq.DEFAULT, 2, 1, pattern(hit(0)))
        recorder.seq = seq
        val applied = applyBeat(seq, card(section(0, pattern(hit(0))), section(1, pattern(hit(48, 11)))), recorder)
        assertEquals(1, applied.scene)
        assertEquals(1, applied.seq.scene)
        assertEquals(2, applied.seq.scenes.size)
        // A and B on their new patterns; C and D, which the card hasn't, keep the numbers of the scene playing.
        assertEquals(listOf(1, 1, 1, 1), applied.seq.scenes[0].patterns)
        assertEquals(listOf(2, 2, 1, 1), applied.seq.scenes[1].patterns)
        assertEquals("Imported to scene S02. UNDO takes it back.", beatImported(applied))
        assertEquals(seq, recorder.undo(applied.seq))
        assertFalse(recorder.canUndo)
    }

    @Test
    fun `with 99 scenes the patterns are placed and picked in the scene playing`() {
        var seq = ProjectSeq.DEFAULT
        repeat(Seq.MAX_SCENES - 1) { seq = SceneOps.newScene(seq) }
        assertEquals(Seq.MAX_SCENES, seq.scenes.size)
        val recorder = PatternRecorder()
        recorder.seq = seq
        val applied = applyBeat(seq, card(section(0, pattern(hit(0))), section(1, pattern(hit(0)))), recorder)
        assertNull(applied.scene)
        assertEquals(Seq.MAX_SCENES, applied.seq.scenes.size)
        // The last scene played pattern 99 in every group: the next free after it wraps to 1.
        assertEquals(listOf(0 to 1, 1 to 1), applied.placed)
        assertEquals(listOf(1, 1, 99, 99), List(4) { applied.seq.selected(it) })
        assertEquals("Imported to A \u00B7 01, B \u00B7 01. UNDO takes it back.", beatImported(applied))
        assertEquals(seq, recorder.undo(applied.seq))
    }

    @Test
    fun `a full group changes nothing and makes no undo step`() {
        var seq = ProjectSeq.DEFAULT
        for (n in 1..Seq.MAX_PATTERNS) seq = with(seq, 0, n, pattern(hit(0)))
        val recorder = PatternRecorder()
        recorder.seq = seq
        val applied = applyBeat(seq, card(section(0, pattern(hit(0)))), recorder)
        assertEquals(0, applied.fullGroup)
        assertSame(seq, applied.seq)
        assertTrue(applied.placed.isEmpty())
        assertFalse(recorder.canUndo)
    }

    // ---- sounds ----

    private fun entries(vararg e: Pair<Int, String>) = e.map { SoundEntry(it.first, it.second, 0) }

    private val micro = PhysicalPad(0, 9)
    private val rim = PhysicalPad(0, 11)
    private val pads = mapOf(micro to (12 to "Kick dusty"), rim to (300 to "Rim"))

    @Test
    fun `a share has a sound line for each pad it uses, and the sound list after the closing fence when asked`() {
        val seq = with(ProjectSeq.DEFAULT, 0, 1, pattern(hit(0), hit(96, 11)))
        val sounds = { pad: PhysicalPad -> pads[pad]?.let { CardSound(it.first, it.second) } }
        val plain = beatShare(seq, 0, 120.0, 50, nameOf, sounds)!!
        val card = BeatCards.read(plain.text).card!!
        assertEquals(mapOf(9 to CardSound(12, "Kick dusty"), 11 to CardSound(300, "Rim")), card.sections.single().sounds)
        assertTrue(plain.text.endsWith("\n```\n"))
        // With the list: a blank line after the fence, the header, and the sounds in slot order; the card reads the same.
        val list = SoundSet(ClaudeText.SOUNDS_FROM_LAST_READ, mapOf(300 to "Rim", 12 to "Kick dusty"))
        val full = beatShare(seq, 0, 120.0, 50, nameOf, sounds, list)!!
        assertEquals(plain.text + "\n" + ClaudeText.soundListHeader(ClaudeText.SOUNDS_FROM_LAST_READ) + "\n12 Kick dusty\n300 Rim\n", full.text)
        assertEquals(card, BeatCards.read(full.text).card)
        // A pad with no known sound gets no line.
        assertEquals(emptyMap<Int, CardSound>(), BeatCards.read(beatShare(seq, 0, 120.0, 50, nameOf)!!.text).card!!.sections.single().sounds)
    }

    @Test
    fun `the sounds Arc knows are the EP-133's while connected, and the view's list offline`() {
        assertNull(soundSetOf(null))
        assertNull(soundSetOf(MirrorUi()))
        val connected = soundSetOf(MirrorUi(sounds = entries(1 to "Kick", 2 to "Snare")))!!
        assertEquals(ClaudeText.SOUNDS_FROM_DEVICE, connected.source)
        assertEquals(mapOf(1 to "Kick", 2 to "Snare"), connected.names)
        assertEquals(2, connected.size)
        val device = entries(5 to "Kick")
        val factory = entries(1 to "Pack kick", 2 to "Pack snare", 3 to "Pack hat")
        fun offline(base: SoundSource, d: List<SoundEntry>? = device, f: List<SoundEntry>? = factory) =
            soundSetOf(MirrorUi(offline = "Last seen", offlineSounds = OfflineSounds(base, d, f, emptySet())))
        assertEquals(ClaudeText.SOUNDS_FROM_LAST_READ to mapOf(5 to "Kick"), offline(SoundSource.DEVICE)!!.let { it.source to it.names })
        assertEquals(ClaudeText.SOUNDS_FROM_FACTORY, offline(SoundSource.FACTORY)!!.source)
        assertEquals(3, offline(SoundSource.FACTORY)!!.size)
        assertNull(offline(SoundSource.FACTORY, f = null))
        assertNull(soundSetOf(MirrorUi(offline = "Factory sounds")))
    }

    @Test
    fun `the sheet's sound rows are the card's lines matched to the sounds, with the old names`() {
        val sections = CardSection(
            0, null, pattern(hit(0), hit(96, 11)),
            mapOf(9 to CardSound(12, "Micro kick"), 11 to CardSound(300, "Rim dusty"), 0 to CardSound(40, "Hat")),
        )
        val card = card(sections)
        val set = SoundSet(ClaudeText.SOUNDS_FROM_DEVICE, mapOf(12 to "Micro kick", 40 to "Hat", 77 to "Other"))
        val current = mapOf(micro to 5, PhysicalPad(0, 0) to 40)
        val ui = soundsUi(card, set, { current[it] }, { if (it == micro) "Kick dusty" else null }, offline = false, project = 3)!!
        assertEquals(3, ui.project)
        assertFalse(ui.offline)
        // Keypad order: 7 (offset 9), 9 (offset 11), then . (offset 0).
        assertEquals(listOf(micro, rim, PhysicalPad(0, 0)), ui.rows.map { it.pad })
        assertEquals(listOf(SoundStatus.CHANGE, SoundStatus.MISSING, SoundStatus.SAME), ui.rows.map { it.pick.status })
        assertEquals(listOf("Kick dusty", null, null), ui.rows.map { it.oldName })
        // Only the change can be ticked.
        assertEquals(listOf(micro), ui.changes.map { it.pad })
        // No sounds known at all: every line is missing. A card without sound lines has no block.
        assertEquals(List(3) { SoundStatus.MISSING }, soundsUi(card, null, { null }, nameOf, offline = true, project = null)!!.rows.map { it.pick.status })
        assertNull(soundsUi(card(section(0, pattern(hit(0)))), set, { null }, nameOf, offline = false, project = 1))
        // The sheet carries them.
        val sheet = beatImportUi(read(card), ProjectSeq.DEFAULT, 120.0, nameOf) { soundsUi(it, set, { null }, nameOf, offline = false, project = 2) }
        assertEquals(3, sheet.sounds!!.rows.size)
        assertNull(beatImportUi(read(card), ProjectSeq.DEFAULT, 120.0, nameOf).sounds)
    }

    @Test
    fun `the factory pack names the sounds the EP-133 lists unnamed, in the sound set and the sheet`() {
        val pack = mapOf(12 to "KICK DEEP", 200 to "HH CLOSED", 201 to "201.pcm")
        val connected = MirrorUi(sounds = entries(12 to "012.pcm", 200 to "200.pcm", 201 to "201.pcm", 5 to "Mine"))
        assertEquals(mapOf(12 to "KICK DEEP", 200 to "HH CLOSED", 201 to "201.pcm", 5 to "Mine"), soundSetOf(connected, pack)!!.names)
        assertEquals(mapOf(12 to "012.pcm", 200 to "200.pcm", 201 to "201.pcm", 5 to "Mine"), soundSetOf(connected)!!.names)
        val offline = MirrorUi(offline = "Last seen", offlineSounds = OfflineSounds(SoundSource.DEVICE, entries(200 to "200.pcm"), entries(200 to "HH CLOSED"), emptySet()))
        assertEquals(ClaudeText.SOUNDS_FROM_LAST_READ to mapOf(200 to "HH CLOSED"), soundSetOf(offline, pack)!!.let { it.source to it.names })
        // With the names, a card's line is found; without them it is taken by its slot, unverified, and the row says what the card called it.
        val card = card(CardSection(0, null, pattern(hit(0)), mapOf(9 to CardSound(200, "HH CLOSED"), 11 to CardSound(201, "SNARE"), 0 to CardSound(201, "201.pcm"), 3 to CardSound(5, "Mine"))))
        fun rows(set: SoundSet?) = soundsUi(card, set, { null }, nameOf, offline = false, project = 1)!!.rows
        // Keypad order: 7, 9, 1, then . (offsets 9, 11, 3, 0). Slot 201 is unnamed in the pack too.
        val named = rows(soundSetOf(connected, pack))
        assertEquals(listOf(false, true, false, true), named.map { it.pick.unverified })
        assertEquals(listOf(null, "SNARE", null, null), named.map { it.cardSays })
        val bare = rows(soundSetOf(connected))
        assertEquals(listOf(true, true, false, true), bare.map { it.pick.unverified })
        // The card's name is only quoted where it differs from what the row shows.
        assertEquals(listOf("HH CLOSED", "SNARE", null, null), bare.map { it.cardSays })
        assertEquals(List(4) { SoundStatus.CHANGE }, bare.map { it.pick.status })
    }

    @Test
    fun `the hint to share the sound list shows when every sound line is missing`() {
        val card = card(CardSection(0, null, pattern(hit(0)), mapOf(9 to CardSound(301, "Rim"), 11 to CardSound(410, null))))
        val set = SoundSet(ClaudeText.SOUNDS_FROM_DEVICE, mapOf(12 to "Kick", 301 to "Rim"))
        assertTrue(soundsUi(card, SoundSet(ClaudeText.SOUNDS_FROM_DEVICE, mapOf(12 to "Kick")), { null }, nameOf, offline = false, project = 1)!!.noneFound)
        assertTrue(soundsUi(card, null, { null }, nameOf, offline = false, project = 1)!!.noneFound)
        // One found is enough to leave it out.
        assertFalse(soundsUi(card, set, { null }, nameOf, offline = false, project = 1)!!.noneFound)
    }

    @Test
    fun `taking the sounds back offline restores each pad's change as it was, or drops it, never a recording gone to Takes`() {
        val a = PadTarget(1, 0, 1, 10)
        val b = PadTarget(1, 0, 2, 11)
        val c = PadTarget(1, 0, 3, 12)
        val oldA = OfflinePad(1, 0, 1, 20, "Old A", SoundSource.DEVICE)
        val recorded = OfflinePad(1, 0, 3, 0, "Take", SoundSource.RECORDED, "take.wav")
        val before = OfflinePads(listOf(oldA, recorded))
        // The import replaced all three pads' changes; a fourth change of the user's came after.
        val other = OfflinePad(1, 1, 1, 9, "Other", SoundSource.DEVICE)
        val after = OfflinePads(listOf(OfflinePad(1, 0, 1, 31, "New A", SoundSource.FACTORY), OfflinePad(1, 0, 2, 32, "New B", SoundSource.FACTORY), OfflinePad(1, 0, 3, 33, "New C", SoundSource.FACTORY), other))
        val restored = offlineRestore(after, before, listOf(a, b, c))
        assertEquals(oldA, restored.at(1, 0, 1))
        assertNull(restored.at(1, 0, 2))
        assertNull(restored.at(1, 0, 3))
        assertEquals(other, restored.at(1, 1, 1))
        assertEquals(2, restored.size)
    }

    @Test
    fun `UNDO is the import's when it goes back to the sequencer before it, and not when an edit came between`() {
        val recorder = PatternRecorder()
        val seq = with(ProjectSeq.DEFAULT, 0, 1, pattern(hit(0, 11)))
        recorder.seq = seq
        val applied = applyBeat(seq, card(section(0, pattern(hit(0)))), recorder)
        // A later edit of the banks: its undo is not the import's.
        recorder.seq = applied.seq
        val edited = recorder.editSeq(applied.seq, with(applied.seq, 1, 1, pattern(hit(0))))
        assertFalse(isBefore(recorder.undo(edited)!!, seq))
        assertTrue(isBefore(recorder.undo(applied.seq)!!, seq))
    }

    // ---- FX and pad shaping ----

    @Test
    fun `a share carries the project's FX and each used pad's settings, and nothing when they are the defaults`() {
        val seq = with(ProjectSeq.DEFAULT, 0, 1, pattern(hit(0), hit(96, 11)))
        val plain = beatShare(seq, 0, 120.0, 50, nameOf, fx = FxSettings.DEFAULT, pads = { PadSettings.DEFAULT })!!.text
        assertFalse(plain.contains("\nfx ") || plain.contains("\npad "))
        val fx = FxSettings(FxType.DISTORTION, 0.55f, 0.5f, listOf(0.45f, 0.3f, 0f, 0f), Comp(true, 0.6f, 0.15f))
        val shaped = mapOf(kick to PadSettings.DEFAULT.copy(pitch = -2.0, level = 80), PhysicalPad(0, 11) to PadSettings.DEFAULT.withMode(PlayMode.KEY).copy(release = 20))
        val text = beatShare(seq, 0, 120.0, 50, nameOf, fx = fx, pads = { shaped[it] })!!.text
        val card = BeatCards.read(text).card!!
        assertEquals(FxType.DISTORTION, card.fx!!.type)
        assertEquals(mapOf(0 to 0.45f, 1 to 0.3f), card.fx!!.sends)
        assertEquals(true, card.fx!!.comp!!.on)
        val pads = card.sections.single().pads
        assertEquals(CardPad(pitch = -2.0, level = 80), pads[9])
        assertEquals(CardPad(release = 20, mode = PlayMode.KEY), pads[11])
        // The share's FX come before the first section, as the spec has them.
        assertTrue(text.indexOf("\nfx distortion") in 1 until text.indexOf("[A"))
    }

    @Test
    fun `the FX block has a row for each kind the card sets, and says so when the project has it already`() {
        val now = FxSettings(FxType.REVERB, 0.5f, 0.5f, listOf(0.5f, 0f, 0f, 0f))
        val c = card(section(0, pattern(hit(0)))).copy(
            fx = CardFx(type = FxType.DISTORTION, x = 0.55f, y = 0.4f, sends = mapOf(0 to 0.5f), comp = Comp(false)),
        )
        val ui = beatFxUi(c, now)!!
        assertEquals(listOf("Effect", "Sends", "Comp"), ui.rows.map { it.label })
        // The sends A 50% say the same; the comp is off already: only the effect changes.
        assertEquals(listOf(false, true, true), ui.rows.map { it.same })
        assertTrue(ui.changes)
        assertEquals("REVERB \u00B7 SIZE 50% \u00B7 FLAT", ui.rows[0].old)
        assertEquals("DISTORTION \u00B7 DRIVE 13x \u00B7 LP 20", ui.rows[0].new)
        // Everything the card says is set already: the block stays, with nothing to apply.
        val same = beatFxUi(c.copy(fx = CardFx(sends = mapOf(0 to 0.5f))), now)!!
        assertFalse(same.changes)
        // No FX line, no block; the sheet carries it.
        assertNull(beatFxUi(card(section(0, pattern(hit(0)))), now))
        assertEquals(3, beatImportUi(read(c), ProjectSeq.DEFAULT, 120.0, nameOf, fx = { beatFxUi(it, now) }).fx!!.rows.size)
        assertNull(beatImportUi(read(c), ProjectSeq.DEFAULT, 120.0, nameOf).fx)
    }

    @Test
    fun `the pad shaping rows are the card's pad lines in keypad order, starting from the defaults when a new sound goes on`() {
        val shaped = PadSettings.DEFAULT.copy(pitch = 2.0)
        val snare = PhysicalPad(0, 11)
        val c = card(
            CardSection(0, null, pattern(hit(0)), pads = mapOf(11 to CardPad(pitch = 2.0, release = 40, mode = PlayMode.KEY), 9 to CardPad(pitch = 2.0), 0 to CardPad(level = 90))),
        )
        val ui = padShapingUi(c, { if (it == kick) shaped else null }, { it != PhysicalPad(0, 0) }, nameOf, offline = false)!!
        // Keypad order: 7 (offset 9), 9 (offset 11), then . (offset 0).
        assertEquals(listOf(kick, snare, PhysicalPad(0, 0)), ui.rows.map { it.pad })
        assertEquals(listOf("kick", "snare", null), ui.rows.map { it.name })
        val (k, sn, none) = ui.rows
        // A7 has pitch +2 already; A9 changes pitch, release and mode.
        assertTrue(k.parts(false).isEmpty())
        assertFalse(k.changes(false))
        assertEquals(listOf("Pitch", "Release", "Mode"), sn.parts(false).map { it.name })
        assertTrue(sn.changes(false))
        // A new sound resets the pad: its row starts from the defaults, so A7's pitch is a change then.
        assertEquals(listOf("Pitch"), k.parts(true).map { it.name })
        assertTrue(k.changes(true))
        // A pad with no sound can't be shaped, unless a sound is going onto it.
        assertFalse(none.changes(false))
        assertTrue(none.changes(true))
        assertEquals(PadSettings.DEFAULT.copy(level = 90), none.after(true))
        assertNull(padShapingUi(card(section(0, pattern(hit(0)))), { null }, { true }, nameOf, offline = true))
        // IMPORT shapes the ticked pads, in section and keypad order.
        assertEquals(listOf(snare to CardPad(pitch = 2.0, release = 40, mode = PlayMode.KEY)), padShapes(c, setOf(snare)))
        assertEquals(listOf(9, 11), padShapes(c, setOf(snare, kick)).map { it.first.offset })
        assertEquals(emptyList<Pair<PhysicalPad, CardPad>>(), padShapes(c, emptySet()))
        assertEquals("Imported to A \u00B7 02. FX applied. UNDO takes it back.", beatImported(BeatApplied(ProjectSeq.DEFAULT, listOf(0 to 2), null, null), fx = true))
    }
}
