package dev.arc.ep133.controller

import dev.arc.ep133.features.LiveMirror
import dev.arc.ep133.features.LiveSnapshot
import dev.arc.ep133.features.OfflinePad
import dev.arc.ep133.features.OfflinePads
import dev.arc.ep133.features.PadGroup
import dev.arc.ep133.features.PadTarget
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.SampleCapture
import dev.arc.ep133.features.SampleInput
import dev.arc.ep133.features.SampleSource
import dev.arc.ep133.features.SoundSource
import dev.arc.ep133.text.MirrorText
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * SAMPLE's controller rules: where a take goes, the inputs offered, the
 * longest take, and what the review keeps (trim, Trim silence, Normalize,
 * the slot).
 */
class SampleKeepTest {
    private val rsp = SampleInput(SampleSource.RSP, false)

    // Pad '7' of group A is pad 1 in the project file, counted from the top before any press.
    private val seven = PhysicalPad(0, 9)

    private fun mirror(project: Int? = 1): LiveMirror =
        LiveMirror().apply { load(LiveSnapshot(1L, project, listOf(PadGroup("a", mapOf(1 to 5))), mapOf(5 to "kick"))) }

    private fun review(pcm: ShortArray, channels: Int = 1, rate: Int = 1000, trimSilence: Boolean = false, normalize: Boolean = false, occupied: Set<Int>? = setOf(1, 2, 4)) =
        sampleReviewOf(seven, rsp, pcm, channels, rate, SampleCapture.End.STOPPED, false, "rsp 1007-142301", normalize, trimSilence, occupied, columns = 4)

    @Test
    fun `a take goes on its pad where EDIT would put a sound, else says why`() {
        val m = mirror()
        assertEquals(PadTargetOrWhy.Found(PadTarget(1, 0, 1, 5)), padTargetOrWhy(m, offline = true, connected = false, switching = false, pad = seven))
        assertEquals(PadTargetOrWhy.Found(PadTarget(1, 0, 1, 5)), padTargetOrWhy(m, offline = false, connected = true, switching = false, pad = seven))
        // Neither offline with a read to change nor connected, or no mirror at all.
        assertEquals(PadTargetOrWhy.Why(MirrorText.EDIT_OFFLINE), padTargetOrWhy(m, offline = false, connected = false, switching = false, pad = seven))
        assertEquals(PadTargetOrWhy.Why(MirrorText.EDIT_OFFLINE), padTargetOrWhy(null, offline = true, connected = true, switching = false, pad = seven))
        // PROJECT switching: only connected; offline views switch in arc at once.
        assertEquals(PadTargetOrWhy.Why(MirrorText.PROJECT_SWITCHING), padTargetOrWhy(m, offline = false, connected = true, switching = true, pad = seven))
        assertEquals(PadTargetOrWhy.Found(PadTarget(1, 0, 1, 5)), padTargetOrWhy(m, offline = true, connected = false, switching = true, pad = seven))
        // No project read yet.
        assertEquals(PadTargetOrWhy.Why(MirrorText.EDIT_NO_PROJECT), padTargetOrWhy(mirror(project = null), offline = false, connected = true, switching = false, pad = seven))
    }

    @Test
    fun `a pad the device numbers otherwise asks for a press first`() {
        // '8' was learned as pad 1: '7''s guess, pad 1, now belongs to another key.
        val m = LiveMirror(learned = mapOf(10 to 1)).apply { load(LiveSnapshot(1L, 1, listOf(PadGroup("a", mapOf(1 to 5))), mapOf(5 to "kick"))) }
        assertEquals(PadTargetOrWhy.Why(MirrorText.EDIT_PRESS_FIRST), padTargetOrWhy(m, offline = false, connected = true, switching = false, pad = seven))
        // And the physical pad a pad number belongs to, for an upload's progress.
        assertEquals(PhysicalPad(0, 10), physicalPadOf(m, 0, 1))
        assertEquals(seven, physicalPadOf(mirror(), 0, 1))
        assertNull(physicalPadOf(m, 0, 13))
    }

    @Test
    fun `the inputs offered follow the mic, its stereo and USB, RSP always`() {
        fun ids(l: List<SampleInput>) = l.map { MirrorText.sourceShort(it.source, it.stereo) }
        assertEquals(listOf("Mic", "Mic St", "Rsp", "Rsp St", "Usb", "Usb St"), ids(sampleInputs(mic = true, micStereo = true, usb = true, usbStereo = true)))
        assertEquals(listOf("Mic", "Rsp", "Rsp St"), ids(sampleInputs(mic = true, micStereo = false, usb = false, usbStereo = true)))
        // No mic permission: RSP only.
        assertEquals(listOf("Rsp", "Rsp St"), ids(sampleInputs(mic = false, micStereo = true, usb = false, usbStereo = false)))
        assertEquals(listOf("Rsp", "Rsp St", "Usb"), ids(sampleInputs(mic = false, micStereo = false, usb = true, usbStereo = false)))
        // The input chosen when offered, else RSP in the same mono or stereo.
        val inputs = sampleInputs(mic = false, micStereo = false, usb = false, usbStereo = false)
        assertEquals(SampleInput(SampleSource.RSP, true), pickSampleInput(SampleInput(SampleSource.MIC, true), inputs))
        assertEquals(SampleInput(SampleSource.RSP, true), pickSampleInput(SampleInput(SampleSource.RSP, true), inputs))
    }

    @Test
    fun `the longest take is the device's limit, less when its space is short`() {
        assertEquals(40 * 48000, sampleMaxFrames(stereo = false, rate = 48000, free = null))
        assertEquals(20 * 48000, sampleMaxFrames(stereo = true, rate = 48000, free = 1e9))
        // 93750 bytes free: a second of mono at 46875 Hz, so 48000 frames at 48 kHz.
        assertEquals(48000, sampleMaxFrames(stereo = false, rate = 48000, free = 93750.0))
        assertEquals(0, sampleMaxFrames(stereo = true, rate = 48000, free = 0.0))
    }

    @Test
    fun `a review keeps the whole take, or from where the sound starts with Trim silence`() {
        // 30 silent frames, then sound: the sound starts at 30, less 20 ms (20 frames at 1000 Hz).
        val pcm = ShortArray(100) { if (it >= 30) 10000 else 0 }
        val r = review(pcm)
        assertEquals(100, r.frames)
        assertEquals(0, r.start)
        assertEquals(100, r.length)
        assertEquals(10, r.silenceAt)
        assertEquals(4, r.peaks.size)
        val t = review(pcm, trimSilence = true)
        assertEquals(10, t.start)
        assertEquals(90, t.length)
        assertTrue(t.trimSilence)
        // All silent: nothing to trim to.
        assertNull(review(ShortArray(50), trimSilence = true).silenceAt)
        assertEquals(0, review(ShortArray(50), trimSilence = true).start)
    }

    @Test
    fun `connected the slot is the next free one, offline it is picked on upload`() {
        val r = review(ShortArray(10))
        assertEquals(3, r.slot)
        assertEquals(3, r.nextFree)
        assertFalse(r.offline)
        val off = review(ShortArray(10), occupied = null)
        assertNull(off.slot)
        assertTrue(off.offline)
    }

    @Test
    fun `the review's trim stays inside the take and keeps a frame at least`() {
        val r = review(ShortArray(100) { if (it >= 30) 10000 else 0 })
        assertEquals(20 to 30, trimReview(r, 20, 30).let { it.start to it.length })
        assertEquals(99 to 1, trimReview(r, 500, 30).let { it.start to it.length })
        assertEquals(0 to 1, trimReview(r, -5, 0).let { it.start to it.length })
        assertEquals(40 to 60, trimReview(r, 40, 1000).let { it.start to it.length })
        // Moved off where the sound starts, Trim silence is off.
        val t = withTrimSilence(r, true)
        assertTrue(trimReview(t, 10, 50).trimSilence)
        assertFalse(trimReview(t, 12, 50).trimSilence)
    }

    @Test
    fun `Trim silence moves the start, its end left where it was`() {
        val r = trimReview(review(ShortArray(100) { if (it >= 30) 10000 else 0 }), 0, 80)
        val on = withTrimSilence(r, true)
        assertEquals(10 to 70, on.start to on.length)
        assertTrue(on.trimSilence)
        val off = withTrimSilence(on, false)
        assertEquals(0 to 80, off.start to off.length)
        assertFalse(off.trimSilence)
    }

    @Test
    fun `KEEP puts the part kept on the pad, normalized when asked`() {
        val pcm = shortArrayOf(0, 100, -200, 400, 1000, -16384, 0, 0)
        val r = trimReview(review(pcm), 2, 4)
        assertArrayEquals(shortArrayOf(-200, 400, 1000, -16384), reviewedPcm(r))
        // The loudest sample of the part, -16384, to full scale: twice as loud (32767 / 16384), rounded half up.
        assertArrayEquals(shortArrayOf(-400, 800, 2000, -32767), reviewedPcm(r.copy(normalize = true)))
        // Stereo frames are cut whole.
        val st = trimReview(review(shortArrayOf(1, 2, 3, 4, 5, 6), channels = 2), 1, 1)
        assertArrayEquals(shortArrayOf(3, 4), reviewedPcm(st))
    }

    @Test
    fun `the slot steps over the slots in use and stays at either end`() {
        val used = setOf(1, 2, 4, 998)
        assertEquals(3, stepFreeSlot(used, null, 1))
        assertEquals(5, stepFreeSlot(used, 3, 1))
        assertEquals(6, stepFreeSlot(used, 3, 2))
        assertEquals(3, stepFreeSlot(used, 5, -1))
        // Nothing free below 3, nor above 999.
        assertEquals(3, stepFreeSlot(used, 3, -1))
        assertEquals(999, stepFreeSlot(used, 997, 1))
        assertEquals(999, stepFreeSlot(used, 999, 1))
        assertNull(stepFreeSlot((1..999).toSet(), null, 1))
    }

    @Test
    fun `a recorded pad change plays from its file and names the take`() {
        // The offline mirror plays a recording from its file, under its name, with no slot to show.
        val rec = OfflinePad(1, 0, 1, 0, "mic 1007-142301", SoundSource.RECORDED, "smp-20261007-142301.wav")
        val m = mirror().apply { setLocal(OfflinePads(listOf(rec))) }
        val sample = m.sampleOf(seven)
        assertEquals("smp-20261007-142301.wav", sample?.file)
        assertEquals("mic 1007-142301", m.nameOf(seven))
        assertNull(m.slotOf(seven))
        assertEquals(PadTarget(1, 0, 1, null), m.target(seven))
    }

    @Test
    fun `a recording let go of on its pad goes to Takes, unless it is going up`() {
        val t = PadTarget(1, 0, 1, 5)
        val rec = OfflinePad(1, 0, 1, 0, "mic 1007-142301", SoundSource.RECORDED, "smp-a.wav")
        val snare = OfflinePad(1, 0, 2, 7, "snare", SoundSource.DEVICE)
        val before = OfflinePads(listOf(rec, snare))
        // Another sound picked for its pad offline.
        val picked = offlineAssign(before, t, 9, "hat", SoundSource.DEVICE, readSlot = 5)
        assertEquals(listOf(rec), recordingsLetGo(before, picked, emptySet()))
        // The device's own sound picked again: the pad's change, the recording, is dropped.
        val back = offlineAssign(before, t, 5, "kick", SoundSource.DEVICE, readSlot = 5)
        assertEquals(listOf(rec), recordingsLetGo(before, back, emptySet()))
        // A newer take kept on it; one going up now is left to its upload.
        val newer = before.put(rec.copy(file = "smp-b.wav"))
        assertEquals(listOf(rec), recordingsLetGo(before, newer, emptySet()))
        assertTrue(recordingsLetGo(before, newer, setOf("smp-a.wav")).isEmpty())
        // Another pad changed: the recording stays where it is.
        val other = offlineAssign(before, PadTarget(1, 0, 2, 7), 9, "hat", SoundSource.DEVICE, readSlot = 7)
        assertTrue(recordingsLetGo(before, other, emptySet()).isEmpty())
    }
}
