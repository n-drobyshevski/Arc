package dev.arc.ep133.text

import dev.arc.ep133.features.ArpNote
import dev.arc.ep133.features.DiffResult
import dev.arc.ep133.features.FxType
import dev.arc.ep133.features.KeyMark
import dev.arc.ep133.features.NoteNames
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.ProjectDiff
import dev.arc.ep133.features.ProjectSource
import dev.arc.ep133.features.ProjectState
import dev.arc.ep133.features.RecState
import dev.arc.ep133.features.SampleSource
import dev.arc.ep133.features.Scale
import dev.arc.ep133.features.SoundDiff
import dev.arc.ep133.features.SoundState
import dev.arc.ep133.features.Timing
import dev.arc.ep133.features.TransportPhase
import dev.arc.ep133.features.TransportState
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class FeatureTextTest {
    @Test
    fun `browser text`() {
        assertEquals("63 MB free of 64 MB", FeatureText.storage(63.0 * 1048576, 64.0 * 1048576))
        assertEquals("", FeatureText.storage(0.0, 0.0))
        assertEquals("007", FeatureText.slot(7))
        assertEquals("Uses sounds 1, 2, and 5", FeatureText.projectUses(listOf(1, 2, 5)))
        assertEquals("Uses sound 150", FeatureText.projectUses(listOf(150)))
        assertEquals("Uses no sounds", FeatureText.projectUses(emptyList()))
        assertEquals("Stereo", FeatureText.channels(2.0))
        assertEquals("46875 Hz", FeatureText.sampleRate(46875.0))
        assertEquals("Play mode", FeatureText.settingLabel("sound.playmode"))
        assertEquals("key", FeatureText.settingValue(JsonPrimitive("key")))
        assertEquals("-3", FeatureText.settingValue(JsonPrimitive(-3)))
    }

    @Test
    fun `upload text`() {
        assertEquals("Upload 1 sound", FeatureText.uploadButton(1))
        assertEquals("Nothing to upload", FeatureText.uploadButton(0))
        assertEquals("Uploaded 3 sounds.", FeatureText.uploaded(3))
    }

    @Test
    fun `compare text`() {
        val same = SoundDiff(1, "kick", "kick", SoundState.SAME_AUDIO, emptyList())
        val settings = SoundDiff(2, "snare", "snare", SoundState.SAME_AUDIO, listOf("sound.pitch", "envelope.release"))
        val renamed = SoundDiff(3, "hat", "hat old", SoundState.DIFFERENT_AUDIO, emptyList())
        val empty = SoundDiff(4, "clap", null, SoundState.NOT_ON_DEVICE, emptyList())
        val unknown = SoundDiff(5, "rim", "rim", SoundState.UNVERIFIED, emptyList())
        assertEquals("Same", FeatureText.soundState(same))
        assertEquals("Different pitch and release", FeatureText.soundState(settings))
        assertEquals("Different sound on the device, named \"hat old\" on the device", FeatureText.soundState(renamed))
        assertEquals("Slot is empty on the device", FeatureText.soundState(empty))
        assertEquals("Probably the same (the device reports no checksum)", FeatureText.soundState(unknown))
        val r = DiffResult(listOf(same, settings, renamed, empty), listOf(ProjectDiff(1, ProjectState.SAME)), listOf(42), listOf(7, 8))
        assertEquals("Restoring changes 3 items on your EP-133:", FeatureText.diffSummary(r))
        assertEquals("Also on the device and not in this backup, left as they are: sound 42 and projects 7 and 8.", FeatureText.untouched(r))
        assertEquals(FeatureText.NO_CHANGES, FeatureText.diffSummary(DiffResult(listOf(same), emptyList(), emptyList(), emptyList())))
    }

    @Test
    fun `durations and trim text`() {
        assertEquals("850 ms", FeatureText.duration(0.85))
        assertEquals("0 ms", FeatureText.duration(0.0))
        assertEquals("1.5 s", FeatureText.duration(1.5))
        assertEquals("12.3 s", FeatureText.duration(12.34))
        // The unit follows the rounded value.
        assertEquals("1.0 s", FeatureText.duration(46857.0 / 46875))
        assertEquals("999 ms", FeatureText.duration(0.9994))
        assertEquals("Trimmed to 1.4 s", FeatureText.trimmed(1.38))
        assertEquals("120 ms to 1.5 s, 1.4 s long", FeatureText.selection(0.12, 1.5))
    }

    @Test
    fun `piano and key text`() {
        val solfege = NoteNames.SOLFEGE
        assertEquals("KEY DO", MirrorText.keyWord(0, solfege).uppercase())
        assertEquals("Key A#", MirrorText.keyWord(10, NoteNames.LETTERS))
        assertEquals("Key: DO. Tap to change.", MirrorText.keyChoice(0, solfege))
        assertEquals("Key: F#. Tap to change.", MirrorText.keyChoice(6, NoteNames.LETTERS))
        assertEquals("LA4, root", MirrorText.pianoKey(69, solfege, KeyMark.ROOT))
        assertEquals("LA4, in the scale", MirrorText.pianoKey(69, solfege, KeyMark.IN))
        assertEquals("FA4, outside the scale", MirrorText.pianoKey(65, solfege, KeyMark.OUT))
        assertEquals("F#4, outside the scale", MirrorText.pianoKey(66, NoteNames.LETTERS, KeyMark.OUT))
        assertEquals("Keyboard, DO3 to DO5", MirrorText.pianoRange(48, 72, solfege))
        assertEquals("Keyboard, C7 to G9", MirrorText.pianoRange(96, 127, NoteNames.LETTERS))
        assertEquals("DO2, below the keys", MirrorText.outOfRange(36, solfege, below = true))
        assertEquals("E6, above the keys", MirrorText.outOfRange(88, NoteNames.LETTERS, below = false))
        // Short scale words, still told apart once upper-cased, and never wider than five.
        val codes = Scale.entries.map { MirrorText.scaleCode(it).uppercase() }
        assertEquals(listOf("CHR", "MAJ", "MIN", "DOR", "PHR", "LYD", "MIX", "MAJ.P", "MIN.P", "BLU"), codes)
        assertEquals(codes.size, codes.toSet().size)
        assertTrue(codes.all { it.length <= 5 })
    }

    @Test
    fun `device, settings and pad edit text`() {
        assertEquals("free of 64 MB", FeatureText.freeOf(64.0 * 1048576))
        assertEquals(listOf("Kicks", "Snares", "Hats", "Perc", "Bass", "Melodic", null), listOf(1, 100, 200, 300, 400, 500, 600).map(FeatureText::factoryCategory))
        assertEquals("Kicks", FeatureText.factoryCategory(99))
        assertEquals(null, FeatureText.factoryCategory(900))
        assertEquals("In P3 \u00B7 7", FeatureText.inProject(3, 7))
        assertEquals("P3", FeatureText.projectBadge(3))
        assertEquals("352 KB \u00B7 7 sounds", FeatureText.projectSummary(352L * 1024, 7))
        assertEquals("12 \u00B7 2.0 MB", FeatureText.soundsTotal(12, 2.0 * 1048576))
        assertEquals(listOf("Auto", "1 octave", "1\u00BD", "2", "3 octaves"), SettingsText.PIANO_CHOICES.map(SettingsText::pianoKeys))
        assertEquals("1\u00BD octaves", SettingsText.pianoKeysDescription(12))
        assertEquals("Pad sounds \u00B7 69 KB", SettingsText.padSoundsShort("69 KB"))
        val a8 = PhysicalPad(0, 10)
        assertEquals("Pad A 8", MirrorText.padTitle(a8))
        assertEquals("Project 1 \u00B7 now 101 snare 2", MirrorText.padSheetLine(1, 101, "snare 2"))
        assertEquals("now empty", MirrorText.padNow(null, null))
        assertEquals("now 007", MirrorText.padNow(7, null))
        assertEquals("Pad A 8: vox chop", MirrorText.assigned(a8, "vox chop"))
        assertEquals("Pad A 8: back to snare 2", MirrorText.restored(a8, "snare 2"))
        assertEquals("snare 2 \u2192 vox chop", MirrorText.dropPreview("snare 2", "vox chop"))
        assertEquals("empty \u2192 vox chop", MirrorText.dropPreview(null, "vox chop"))
        assertEquals("KEYS \u00B7 FA5", MirrorText.lastNote(77, NoteNames.SOLFEGE).uppercase())
        assertEquals("Keys on a piano", MirrorText.keysView(true))
        assertEquals("Pad A 8: kick, in arc until you connect", MirrorText.assignedOffline(a8, "kick"))
        assertEquals("1 pad changed in arc only. When you connect, arc asks before putting it on the EP-133.", MirrorText.offlinePadsNote(1))
        assertEquals("3 pads changed in arc only. When you connect, arc asks before putting them on the EP-133.", MirrorText.offlinePadsNote(3))
        assertEquals("Put 1 offline pad change on the EP-133?", MirrorText.putOffline(1))
        assertEquals("Put 2 offline pad changes on the EP-133?", MirrorText.putOffline(2))
        assertEquals("2 pads put on the EP-133.", MirrorText.offlineWritten(2, 0))
        assertEquals("1 pad put on the EP-133. 1 skipped: the EP-133 has another sound or project there now.", MirrorText.offlineWritten(1, 1))
    }

    @Test
    fun `pad settings text`() {
        assertEquals(listOf("Sound", "Trim", "Env", "Midi", "Mute"), (0..4).map(MirrorText::pageName))
        assertEquals("MUTE GROUP", MirrorText.MUTE_GROUP.uppercase())
        assertEquals(listOf("+1.5", "-12", "0", "+0.25", "-0.07", "0", "+12"), listOf(1.5, -12.0, 0.0, 0.25, -0.0701, -0.004, 12.0).map(MirrorText::pitchLabel))
        assertEquals("100", MirrorText.levelLabel(100))
        assertEquals(listOf("L16", "L8", "C", "R1", "R16"), listOf(-16, -8, 0, 1, 16).map(MirrorText::panLabel))
        assertEquals(listOf("Oneshot", "Key", "Legato"), dev.arc.ep133.features.PlayMode.entries.map(MirrorText::modeLabel))
        assertEquals("0.25 s", MirrorText.secondsLabel(11719, 46875.0))
        assertEquals("1.00 s", MirrorText.secondsLabel(46875, 46875.0))
        assertEquals("0.00 s", MirrorText.secondsLabel(100, 0.0))
        assertEquals("255", MirrorText.envLabel(255))
        assertEquals(listOf("1", "16"), listOf(0, 15).map(MirrorText::channelLabel))
        assertEquals(listOf("On", "Off"), listOf(true, false).map(MirrorText::onOff))
        assertEquals("Pitch: +1.5.", MirrorText.knobDescription(MirrorText.PITCH, MirrorText.pitchLabel(1.5)))
        assertEquals("Plays 46875 frames from frame 1200.", MirrorText.trimDescription(1200, 46875))
        assertEquals("The pad's settings couldn't be changed: timeout", MirrorText.padSettingsFailed("timeout"))
    }

    @Test
    fun `function keys and offline notes`() {
        assertEquals("1\u20139", MirrorText.FN_PROJECT_SUB)
        assertEquals("Project 3", MirrorText.projectKeyState(3, ProjectSource.DEVICE))
        assertEquals("Project 3", MirrorText.projectKeyState(3, ProjectSource.LAST_READ))
        assertEquals("Factory project 3", MirrorText.projectKeyState(3, ProjectSource.FACTORY))
        assertEquals("No project", MirrorText.projectKeyState(null, ProjectSource.DEVICE))
        assertEquals("P3", MirrorText.projectShort(3))
        assertEquals("The project couldn't be switched: timeout", MirrorText.projectFailed("timeout"))
        assertEquals("On, 120 BPM", MirrorText.clickState(true, 120, following = false))
        assertEquals("Off, 98 BPM, from the EP-133", MirrorText.clickState(false, 98, following = true))
        assertEquals("120 BPM", MirrorText.tempoValue(120))
        assertEquals("120", MirrorText.tempoShort(120))
        assertEquals(
            "Not connected: these are the EP-133's factory sounds, project 3 as it ships. Connect your EP-133 to see it live.",
            MirrorText.offlineNote(MirrorText.FACTORY, 3),
        )
        // Project 1 unless PROJECT stepped on; a last read keeps its own note.
        assertEquals(MirrorText.factoryNote(1), MirrorText.offlineNote(MirrorText.FACTORY))
        assertEquals(MirrorText.OFFLINE_NOTE, MirrorText.offlineNote(MirrorText.lastSeen("5 Oct, 14:02"), 3))
        assertTrue(MirrorText.LISTEN_ONLY.endsWith("in EDIT, switch projects with PROJECT, or keep a sample in SAMPLE."))
        assertEquals("Next project: tap; hold + pad 1–9 to pick", CoachText.PROJECT)
        assertEquals("Project 3, shown", MirrorText.projectChoice(3, shown = true))
        assertEquals("Project 4", MirrorText.projectChoice(4, shown = false))
        assertEquals("Sound", MirrorText.FN_SOUND)
        assertEquals("Pad's sound", MirrorText.SOUND_SHEET)
        assertEquals("Click: tap; hold for tempo", CoachText.TEMPO)
    }

    @Test
    fun `fx text`() {
        assertEquals(listOf("FX", "PAGE"), listOf(MirrorText.FN_FX, MirrorText.FN_FX_SUB).map { it.uppercase() })
        assertEquals(listOf("OFF", "DLY", "REV", "DST", "CHO", "FLT", "CMP"), FxType.entries.map(MirrorText::fxCode))
        // The key's word stays six letters at most, for four keys across a narrow phone.
        assertEquals(listOf("FX off", "Delay", "Reverb", "Dist", "Chorus", "Filter", "Comp"), FxType.entries.map(MirrorText::fxKeyLabel))
        assertTrue(FxType.entries.all { MirrorText.fxKeyLabel(it).length <= 6 })
        assertEquals("Effects, Distortion", MirrorText.fxKeyDescription(FxType.DISTORTION))
        assertEquals("Effects, Off", MirrorText.fxKeyDescription(FxType.NONE))
        assertEquals("Reverb, on. Tap again to turn it off.", MirrorText.fxChoice(FxType.REVERB, on = true))
        assertEquals("Reverb", MirrorText.fxChoice(FxType.REVERB, on = false))
        assertEquals("Group B sends nothing to the effect: raise its fader to hear it.", MirrorText.fxHearNoSend('B'))
        assertEquals("Length 1/8D, feedback 38%", MirrorText.xyState(FxType.DELAY, 0.625f, 0.4f, 120f))
        assertEquals("Cutoff OPEN, reso Q 4.3", MirrorText.xyState(FxType.FILTER, 0.5f, 0.5f, 120f))
        assertEquals("1/8D \u00B7 38%", MirrorText.xyReadout(FxType.DELAY, 0.625f, 0.4f, 120f))
        assertEquals(listOf("Length up", "Feedback down"), listOf(MirrorText.xyStep("LENGTH", true), MirrorText.xyStep("FEEDBACK", false)))
        assertEquals("Send C", MirrorText.sendName(2))
        assertEquals(listOf("0", "62", "100"), listOf(0f, 0.62f, 1f).map(MirrorText::sendValue))
        val a7 = PhysicalPad(0, 9)
        assertEquals("A 7 kick", MirrorText.sidechainSource(a7, "kick"))
        assertEquals("A 7", MirrorText.sidechainSource(a7, null))
        assertEquals("Sidechain source, A 7 kick", MirrorText.sidechainSourceDescription(a7, "kick"))
        assertEquals("Set to B 1", MirrorText.setSource(PhysicalPad(1, 3)))
        assertEquals("Duck group D", MirrorText.duckChoice(3))
        assertEquals(listOf("30 ms", "201 ms", "600 ms"), listOf(0f, 0.3f, 1f).map(MirrorText::sidechainLength))
        assertEquals(listOf("SNAP 60", "EVEN", "PUMP 40"), listOf(0.2f, 0.5f, 0.7f).map(MirrorText::sidechainShape))
    }

    @Test
    fun `punch text`() {
        // Slot order, '.' to '9', as the pads print them while FX is held.
        assertEquals(
            listOf("PITCH RND", "SLICE", "STUTTER", "REPEAT", "TAPE STOP", "FILTER LFO", "LPF", "HPF", "SEND FX", "TREMOLO", "OCT \u2193", "DECIMATE"),
            (0 until 12).map { MirrorText.punchName(it).uppercase() },
        )
        assertEquals(listOf("Beat repeat", "Octave down"), listOf(3, 10).map(MirrorText::punchDescription))
        assertEquals("PUNCH \u00B7 REPEAT + LPF", MirrorText.punchLine(linkedSetOf(3, 6)))
        assertEquals("Punch-ins, Beat repeat, Low-pass filter", MirrorText.punchSpoken(linkedSetOf(3, 6)))
    }

    @Test
    fun `sample text`() {
        val a7 = PhysicalPad(0, 9)
        assertEquals("Sample", MirrorText.SAMPLE_TAG)
        assertEquals("Latch on: tap a pad to record hands-free. Tap it again or STOP to stop.", MirrorText.LATCH_NOTE)
        // LATCH reads STOP while a hands-free take goes on: the shared word.
        assertEquals("STOP", FeatureText.STOP.uppercase())
        assertEquals(listOf("MIC", "RSP ST", "USB"), listOf(SampleSource.MIC to false, SampleSource.RSP to true, SampleSource.USB to false).map { (s, st) -> MirrorText.sourceShort(s, st).uppercase() })
        assertEquals("Phone mic, mono", MirrorText.sourceName(SampleSource.MIC, false))
        assertEquals("Resample the phone's sound, stereo", MirrorText.sourceName(SampleSource.RSP, true))
        assertEquals("EP-133 over USB, mono", MirrorText.sourceName(SampleSource.USB, false))
        // LEVEL is the pad sheet's knob word; SAMPLE's KNOB X reuses it.
        assertEquals("Level", MirrorText.LEVEL)
        assertEquals(listOf("+12 dB", "\u22126 dB", "0 dB"), listOf(12, -6, 0).map(MirrorText::gainReadout))
        assertEquals(listOf("Off", "\u221224 dB", "0 dB"), listOf(null, -24, 0).map(MirrorText::thresholdReadout))
        assertEquals(listOf("Free", "1 bar", "2 bars"), listOf(null, 1, 2).map(MirrorText::barsChoice))
        assertEquals("Count-in 3", MirrorText.countIn(3))
        assertEquals("0:04 / 0:20", MirrorText.sampleTime(4, 20))
        assertEquals("0:39 / 0:40", MirrorText.sampleTime(39, 40))
        assertEquals("Takes up to 40 s", MirrorText.sampleMax(40))
        assertEquals("Pad A 7: uploading, 40%", MirrorText.sampleUploading(a7, 40))
        assertEquals("Disk low: room for 12 s", MirrorText.diskLow(12))
        assertEquals("Pad A 7: uploading", MirrorText.sampleUploading(a7))
        assertEquals("Pad A 7, has a sound", MirrorText.padTitle(a7) + MirrorText.padSampleState(true))
        assertEquals(", empty", MirrorText.padSampleState(false))
        assertEquals("The input couldn't be opened: busy", MirrorText.inputFailed("busy"))
        // The seconds are cut, not rounded, as the take's time is.
        assertEquals("Pad A 7 \u00B7 0:04 \u00B7 RSP ST", MirrorText.reviewLine(a7, 4.7, SampleSource.RSP, true))
        assertEquals("Pad A 7 \u00B7 1:05 \u00B7 MIC", MirrorText.reviewLine(a7, 65.0, SampleSource.MIC, false))
        assertEquals("Slot 214, the next free one", MirrorText.slotLine(214, next = true))
        assertEquals("Slot 300", MirrorText.slotLine(300, next = false))
        assertEquals("Pad A 7: kept in arc. It goes on the EP-133 when you connect.", MirrorText.sampleQueued(a7))
        assertEquals("Pad A 7: new sample on the EP-133.", MirrorText.sampleSaved(a7))
        assertEquals("The EP-133 is taking a new sample. This sound plays once it's done.", MirrorText.DEVICE_UPLOADING)
        assertEquals("1 sample kept in Takes.", MirrorText.samplesToTakes(1))
        assertEquals("3 samples kept in Takes.", MirrorText.samplesToTakes(3))
        // The offline prompt counts recordings apart from pad changes.
        assertEquals("Put 2 offline pad changes on the EP-133?", MirrorText.putOffline(2, samples = 0))
        assertEquals("Put 1 new sample on the EP-133?", MirrorText.putOffline(0, samples = 1))
        assertEquals("Put 1 offline pad change and 2 new samples on the EP-133?", MirrorText.putOffline(1, samples = 2))
        assertEquals("Review samples", SettingsText.REVIEW_SAMPLES)
        assertTrue(SettingsText.REVIEW_SAMPLES_NOTE.endsWith("as on the EP-133."))
        assertEquals("Sample", CoachText.SAMPLE)
    }

    @Test
    fun `pattern text`() {
        val a7 = PhysicalPad(0, 9)
        assertEquals("Pattern", MirrorText.PATTERN)
        assertEquals(
            listOf("RECORD", "PLAY", "STOP", "ERASE", "UNDO", "TIMING", "LENGTH", "AUTO", "COUNT-IN", "CLEAR", "CLEAR ALL"),
            listOf(
                MirrorText.RECORD, MirrorText.PLAY, FeatureText.STOP, MirrorText.ERASE, MirrorText.UNDO, MirrorText.TIMING,
                MirrorText.LENGTH, MirrorText.AUTO, MirrorText.COUNT_IN, MirrorText.CLEAR, MirrorText.CLEAR_ALL,
            ).map { it.uppercase() },
        )
        assertEquals("×2", MirrorText.DOUBLE)
        assertEquals("2.3 / 4", MirrorText.patternPosition(2, 3, 4))
        assertEquals("2.3 / 4 · 1/16", MirrorText.patternRecording(2, 3, 4, Timing.SIXTEENTH))
        assertEquals("1.1 / 1 · Off", MirrorText.patternRecording(1, 1, 1, Timing.OFF))
        assertEquals("Count-in 3", MirrorText.countIn(3))
        assertEquals("/ 4", MirrorText.countInOf(4))
        assertEquals("Play a pad or PLAY · 1/16", MirrorText.patternArmed(Timing.SIXTEENTH))
        assertEquals("Play a pad or PLAY · Off", MirrorText.patternArmed(Timing.OFF))
        assertEquals(listOf("Off", "1/1", "1/2", "1/4", "1/8", "1/8T", "1/16", "1/16T", "1/32"), Timing.entries.map(MirrorText::timingLabel))
        assertEquals("Timing 1/16: notes snap to the nearest 1/16", MirrorText.timingName(Timing.SIXTEENTH))
        assertEquals("Timing 1/8T: notes snap to the nearest 1/8 triplet", MirrorText.timingName(Timing.EIGHTH_T))
        assertEquals("Timing off: notes stay where you play them", MirrorText.timingName(Timing.OFF))
        val c4 = ArpNote(a7, 0)
        val held = listOf(ArpNote(a7, 5), ArpNote(a7, 9), c4)
        assertEquals("ARP · 1/16 · FA LA DO", MirrorText.arpLine(false, false, Timing.SIXTEENTH, held, NoteNames.SOLFEGE))
        assertEquals("ARP ∞ · 1/8T · F A C", MirrorText.arpLine(false, true, Timing.EIGHTH_T, held, NoteNames.LETTERS))
        assertEquals(
            "REPEAT · 1/32 · A 7, B ENTER",
            MirrorText.arpLine(true, false, Timing.THIRTY_SECOND, listOf(ArpNote(a7, null), ArpNote(PhysicalPad(1, 2), null)), NoteNames.SOLFEGE),
        )
        assertEquals("A · 1 bar", MirrorText.groupLength(0, 1))
        assertEquals("Group D, 16 bars", MirrorText.groupLengthName(3, 16))
        assertEquals("Clear group B's notes?", MirrorText.clearAsk(1))
        assertEquals("Clear every group's notes?", MirrorText.clearAsk(null))
        assertEquals("Group C cleared.", MirrorText.cleared(2))
        assertEquals("Patterns cleared.", MirrorText.cleared(null))
        assertEquals("Pad A 7: notes erased.", MirrorText.erased(a7))
        assertEquals("Pad A 7, has notes", MirrorText.padTitle(a7) + MirrorText.PAD_HAS_NOTES)
        assertEquals("1 pad not loaded", MirrorText.missingPads(1))
        assertEquals("3 pads not loaded", MirrorText.missingPads(3))
        assertEquals("Patterns stay in arc and play on the phone.", MirrorText.PATTERN_NOTE)
        // The keys for screen readers, and what is said when the transport changes.
        val stopped = TransportState()
        val armed = TransportState(TransportPhase.ARMED)
        val counting = TransportState(TransportPhase.COUNT_IN, recording = true)
        val recording = TransportState(TransportPhase.PLAYING, recording = true)
        val playing = TransportState(TransportPhase.PLAYING)
        assertEquals(
            listOf("Record, off", "Record, armed", "Record, armed", "Record, recording", "Record, off"),
            listOf(stopped, armed, counting, recording, playing).map(MirrorText::recordDescription),
        )
        assertEquals("Record, off", MirrorText.recordDescription(TransportState(TransportPhase.COUNT_IN)))
        assertEquals(
            listOf("Play", "Play", "Play, counting in", "Play, bar 2 of 4", "Play, bar 2 of 4"),
            listOf(stopped, armed, counting, recording, playing).map { MirrorText.playDescription(it, 2, 4) },
        )
        assertEquals(
            listOf("Stopped", "Record armed", "Counting in", "Recording", "Playing"),
            listOf(stopped, armed, counting, recording, playing).map(MirrorText::transportAnnouncement),
        )
        // SAMPLE's BARS choice for the pattern's length.
        assertEquals("PTN", MirrorText.PTN.uppercase())
        // REC is TAKE now.
        assertEquals("TAKE 0:12", MirrorText.takeBadge(12.9).uppercase())
        assertEquals("Take. Recording starts with the first sound you play.", MirrorText.takeDescription(RecState.Idle))
        assertEquals("Take, waiting for the first sound. Tap to cancel.", MirrorText.takeDescription(RecState.Armed))
        assertEquals("Recording a take, 1:05. Tap to stop.", MirrorText.takeDescription(RecState.Recording(65)))
        assertTrue(MirrorText.TAKES_HINT.startsWith("Tap TAKE, then play"))
        assertEquals("Record a pattern: tap, then PLAY; hold for its settings", CoachText.RECORD)
    }
}
