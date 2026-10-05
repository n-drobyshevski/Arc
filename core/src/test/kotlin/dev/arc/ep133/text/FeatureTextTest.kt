package dev.arc.ep133.text

import dev.arc.ep133.features.DiffResult
import dev.arc.ep133.features.KeyMark
import dev.arc.ep133.features.NoteNames
import dev.arc.ep133.features.ProjectDiff
import dev.arc.ep133.features.ProjectState
import dev.arc.ep133.features.Scale
import dev.arc.ep133.features.SoundDiff
import dev.arc.ep133.features.SoundState
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
        assertEquals("One group. Tap for all groups.", MirrorText.viewSwitch(oneGroup = true))
        assertEquals("All groups. Tap for one group.", MirrorText.viewSwitch(oneGroup = false))
        // Short scale words, still told apart once upper-cased, and never wider than five.
        val codes = Scale.entries.map { MirrorText.scaleCode(it).uppercase() }
        assertEquals(listOf("CHR", "MAJ", "MIN", "DOR", "PHR", "LYD", "MIX", "MAJ.P", "MIN.P", "BLU"), codes)
        assertEquals(codes.size, codes.toSet().size)
        assertTrue(codes.all { it.length <= 5 })
    }
}
