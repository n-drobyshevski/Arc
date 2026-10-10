package dev.arc.ep133.features

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class OfflinePadsTest {
    private val kick = OfflinePad(1, 0, 5, 343, "kick", SoundSource.FACTORY)
    private val snare = OfflinePad(1, 1, 2, 7, "snare", SoundSource.DEVICE)
    private val take = OfflinePad(1, 0, 5, 0, "mic 1007-142301", SoundSource.RECORDED, "rec-1.wav")

    @Test
    fun `one change per pad, the latest last, and a drop takes it back`() {
        var p = OfflinePads.EMPTY.put(kick).put(snare)
        assertEquals(2, p.size)
        assertEquals(kick, p.at(1, 0, 5))
        assertNull(p.at(2, 0, 5)) // another project's pad
        assertNull(p.at(1, 1, 5)) // another group's
        // Another sound on the same pad replaces its change and moves it last.
        val hat = kick.copy(slot = 200, name = "hat", source = SoundSource.DEVICE)
        p = p.put(hat)
        assertEquals(listOf(snare, hat), p.list)
        p = p.drop(1, 0, 5)
        assertEquals(listOf(snare), p.list)
        assertEquals(p, p.drop(1, 0, 5)) // nothing there: no change
        assertEquals("device", SoundSource.DEVICE.id)
        assertEquals(SoundSource.FACTORY, SoundSource.of("factory"))
        assertNull(SoundSource.of("cloud"))
    }

    @Test
    fun `the changes survive the round trip, and junk reads as nothing`() {
        val p = OfflinePads.EMPTY.put(kick).put(snare)
        assertEquals(
            """{"v":1,"pads":[{"project":1,"group":0,"pad":5,"slot":343,"name":"kick","source":"factory"},""" +
                """{"project":1,"group":1,"pad":2,"slot":7,"name":"snare","source":"device"}]}""",
            p.toJson(),
        )
        assertEquals(p, OfflinePads.fromJson(p.toJson()))
        assertEquals(OfflinePads.EMPTY, OfflinePads.fromJson(OfflinePads.EMPTY.toJson()))
        assertNull(OfflinePads.fromJson("not json"))
        assertNull(OfflinePads.fromJson("[]"))
        assertNull(OfflinePads.fromJson("""{"v":2,"pads":[]}"""))
        assertNull(OfflinePads.fromJson("""{"pads":[]}"""))
        assertEquals(OfflinePads.EMPTY, OfflinePads.fromJson("""{"v":1}"""))
    }

    @Test
    fun `entries it can't read are skipped, and a later change of a pad wins`() {
        val text = """{"v":1,"pads":[
            {"project":1,"group":0,"pad":5,"slot":343,"name":"kick","source":"factory"},
            {"project":1,"group":0,"pad":6,"slot":"8","name":"x","source":"device"},
            {"project":1,"group":4,"pad":6,"slot":8,"name":"x","source":"device"},
            {"project":0,"group":0,"pad":6,"slot":8,"name":"x","source":"device"},
            {"project":1,"group":0,"pad":6,"slot":8,"name":5,"source":"device"},
            {"project":1,"group":0,"pad":6,"slot":8,"name":"x","source":"cloud"},
            {"project":1,"group":0,"pad":6,"slot":8,"name":"x"},
            {"project":1,"group":0,"slot":8,"name":"x","source":"device"},
            7, null, [],
            {"project":1,"group":1,"pad":2,"slot":7,"name":"snare","source":"device"},
            {"project":1,"group":0,"pad":5,"slot":344,"name":"kick 2","source":"factory"}
        ]}"""
        val p = OfflinePads.fromJson(text)!!
        assertEquals(listOf(snare, kick.copy(slot = 344, name = "kick 2")), p.list)
    }

    @Test
    fun `a device sound fits while the device holds it in that slot`() {
        val names = mapOf(7 to " Snare.WAV ", 8 to "clap")
        assertTrue(OfflinePads.fits(snare, 1, names)) // case, spaces and .wav as PadSoundCache.sameName
        assertFalse(OfflinePads.fits(snare.copy(slot = 8), 1, names)) // another sound there now
        assertFalse(OfflinePads.fits(snare.copy(slot = 9), 1, names)) // nothing there
        // An unnamed slot is not the device sound that was picked.
        assertFalse(OfflinePads.fits(snare.copy(slot = 343, name = "kick"), 1, mapOf(343 to "343.pcm")))
    }

    @Test
    fun `a factory sound fits where the device has it, named or unnamed`() {
        assertTrue(OfflinePads.fits(kick, 1, mapOf(343 to "343.pcm")))
        assertTrue(OfflinePads.fits(kick, 1, mapOf(343 to "KICK")))
        assertFalse(OfflinePads.fits(kick, 1, mapOf(343 to "my take")))
        assertFalse(OfflinePads.fits(kick, 1, mapOf(343 to "344.pcm")))
        assertFalse(OfflinePads.fits(kick, 1, emptyMap()))
    }

    @Test
    fun `a change made on another project is skipped`() {
        val names = mapOf(343 to "343.pcm", 7 to "snare")
        assertFalse(OfflinePads.fits(kick, 2, names))
        assertFalse(OfflinePads.fits(snare, null, names))
        assertTrue(OfflinePads.fits(snare, 1, names))
    }

    @Test
    fun `a recorded sample survives the round trip with its file`() {
        assertEquals("rec", SoundSource.RECORDED.id)
        assertEquals(SoundSource.RECORDED, SoundSource.of("rec"))
        val p = OfflinePads.EMPTY.put(snare).put(take)
        // Still version 1; only the recorded entry has a file.
        assertEquals(
            """{"v":1,"pads":[{"project":1,"group":1,"pad":2,"slot":7,"name":"snare","source":"device"},""" +
                """{"project":1,"group":0,"pad":5,"slot":0,"name":"mic 1007-142301","source":"rec","file":"rec-1.wav"}]}""",
            p.toJson(),
        )
        assertEquals(p, OfflinePads.fromJson(p.toJson()))
    }

    @Test
    fun `a reader from before recorded samples skips them and keeps the rest`() {
        val p = OfflinePads.EMPTY.put(snare).put(take)
        // To a reader from before, "rec" is a source it doesn't know, which it skips like any other.
        assertNull(SoundSource.of("later"))
        assertEquals(listOf(snare), OfflinePads.fromJson(p.toJson().replace("\"rec\"", "\"later\""))!!.list)
        // Text written before recorded samples still reads, every entry without a file.
        val before = """{"v":1,"pads":[{"project":1,"group":1,"pad":2,"slot":7,"name":"snare","source":"device"}]}"""
        assertEquals(listOf(snare), OfflinePads.fromJson(before)!!.list)
        assertNull(OfflinePads.fromJson(before)!!.list.single().file)
    }

    @Test
    fun `a recorded entry needs slot 0 and its file`() {
        val text = """{"v":1,"pads":[
            {"project":1,"group":0,"pad":5,"slot":0,"name":"x","source":"rec"},
            {"project":1,"group":0,"pad":5,"slot":0,"name":"x","source":"rec","file":7},
            {"project":1,"group":0,"pad":5,"slot":3,"name":"x","source":"rec","file":"x.wav"},
            {"project":1,"group":0,"pad":6,"slot":0,"name":"x","source":"device"},
            {"project":1,"group":1,"pad":2,"slot":7,"name":"snare","source":"device","file":"stray.wav"},
            {"project":1,"group":0,"pad":5,"slot":0,"name":"mic 1007-142301","source":"rec","file":"rec-1.wav"}
        ]}"""
        // A file on another source's entry is ignored.
        assertEquals(listOf(snare, take), OfflinePads.fromJson(text)!!.list)
    }

    @Test
    fun `a recording replaces a pad's earlier change, and a pick replaces a recording`() {
        var p = OfflinePads.EMPTY.put(kick).put(snare).put(take)
        assertEquals(listOf(snare, take), p.list) // kick was on the same pad
        val hat = kick.copy(slot = 200, name = "hat", source = SoundSource.DEVICE)
        p = p.put(hat)
        assertEquals(listOf(snare, hat), p.list)
        assertNull(p.at(1, 0, 5)!!.file)
    }

    @Test
    fun `a recorded sample fits on its own project, whatever the device's slots hold`() {
        assertTrue(OfflinePads.fits(take, 1, emptyMap()))
        assertTrue(OfflinePads.fits(take, 1, mapOf(0 to "kick", 343 to "343.pcm")))
        assertFalse(OfflinePads.fits(take, 2, emptyMap()))
        assertFalse(OfflinePads.fits(take, null, emptyMap()))
    }
}
