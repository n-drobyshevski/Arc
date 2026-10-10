package dev.arc.ep133.features

import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.Tar
import dev.arc.ep133.protocol.Device
import dev.arc.ep133.protocol.DeviceError
import dev.arc.ep133.protocol.Fs
import dev.arc.ep133.protocol.Session
import dev.arc.ep133.testing.DemoData
import dev.arc.ep133.testing.MockEP133
import dev.arc.ep133.testing.tarFile
import dev.arc.ep133.util.utf8Length
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/** Live's EDIT: a pad's SOUND EDIT settings, as pad metadata (community notes, see Device.writePadSettings). */
class PadSettingsTest {
    private fun meta(text: String) = JsJson.parse(text) as JsonObject

    private suspend fun TestScope.connect(dev: MockEP133): Session {
        val s = Session(dev.transport(this), StandardTestDispatcher(testScheduler))
        s.handshake()
        return s
    }

    /** A 26-byte pad record: slot, then the settings at ep133-ppak's offsets. */
    private fun record(slot: Int, volume: Int, pitch: Int, pan: Int, attack: Int, release: Int, time: Int, mute: Int, mode: Int) =
        ByteArray(26).also {
            it[1] = slot.toByte()
            it[2] = (slot shr 8).toByte()
            it[16] = volume.toByte()
            it[17] = pitch.toByte()
            it[18] = pan.toByte()
            it[19] = attack.toByte()
            it[20] = release.toByte()
            it[21] = time.toByte()
            it[22] = mute.toByte()
            it[23] = mode.toByte()
        }

    @Test
    fun `the play modes by their device strings`() {
        assertEquals(listOf("oneshot", "key", "legato"), PlayMode.entries.map { it.id })
        assertEquals(PlayMode.LEGATO, PlayMode.of("legato"))
        assertNull(PlayMode.of("Legato"))
        assertNull(PlayMode.of("loop"))
    }

    @Test
    fun `fromMeta reads numbers, numeric strings, booleans and 0 or 1, and clamps`() {
        val m = meta(
            """{"sym":140,"sound.playmode":"key","sample.start":"100","sample.end":5000.4,"envelope.attack":12,""" +
                """"envelope.release":" 40 ","sound.pitch":"-1.556","sound.amplitude":150,"sound.pan":-20,""" +
                """"sound.mutegroup":1,"time.mode":"BPM","midi.channel":"3"}""",
        )
        assertEquals(
            PadSettings(
                pitch = -1.56, level = 100, pan = -16, mode = PlayMode.KEY, start = 100, end = 5000,
                attack = 12, release = 40, muteGroup = true, midiChannel = 3, timeMode = "bpm",
            ),
            PadSettings.fromMeta(m),
        )
        // Play and time modes also as their record numbers; booleans as strings.
        val n = PadSettings.fromMeta(meta("""{"sound.playmode":2,"time.mode":2,"sound.mutegroup":"false","envelope.release":999}"""))
        assertEquals(PlayMode.LEGATO, n.mode)
        assertEquals("bar", n.timeMode)
        assertFalse(n.muteGroup)
        assertEquals(255, n.release)
        // Unknown or unreadable values keep the base's.
        val base = PadSettings(pitch = 3.0, level = 80, mode = PlayMode.KEY, release = 15, muteGroup = true)
        val junk = meta(
            """{"sound.pitch":"high","sound.amplitude":null,"sound.playmode":"loop","envelope.release":true,""" +
                """"sound.mutegroup":"yes","time.mode":"beat","midi.channel":[1],"sound.pan":"0x10","sample.end":"1e3"}""",
        )
        assertEquals(base, PadSettings.fromMeta(junk, base))
        assertEquals(base, PadSettings.fromMeta(JsonObject(emptyMap()), base))
        assertEquals(PadSettings.DEFAULT, PadSettings.fromMeta(null))
        // A pitch outside -12..12 and a start past the end.
        assertEquals(12.0, PadSettings.fromMeta(meta("""{"sound.pitch":40}""")).pitch)
        val t = PadSettings.fromMeta(meta("""{"sample.start":900,"sample.end":300}"""))
        assertEquals(299L to 300L, t.start to t.end)
        assertEquals(-12.0, PadSettings.fromMeta(meta("""{"sound.pitch":-12.0001}""")).pitch)
    }

    @Test
    fun `written tells settings from an untouched pad`() {
        assertFalse(PadSettings.written(null))
        assertFalse(PadSettings.written(meta("{}")))
        assertFalse(PadSettings.written(meta("""{"sym":0}""")))
        assertTrue(PadSettings.written(meta("""{"sym":5}""")))
        assertTrue(PadSettings.written(meta("""{"sym":"5"}""")))
        assertTrue(PadSettings.written(meta("""{"sym":0,"sound.pitch":0}""")))
        assertTrue(PadSettings.written(meta("""{"envelope.release":15}""")))
        assertFalse(PadSettings.written(meta("""{"sym":0,"midi.channel":2}""")))
    }

    @Test
    fun `toMeta writes the full record, modes as strings, in order`() {
        val s = PadSettings(pitch = 1.5, level = 80, pan = -4, mode = PlayMode.KEY, start = 10, end = 4000, attack = 3, release = 15, muteGroup = true, midiChannel = 9, timeMode = "bpm")
        assertEquals(
            """{"sym":140,"sound.playmode":"key","sample.start":10,"sample.end":4000,"envelope.attack":3,"envelope.release":15,""" +
                """"sound.pitch":1.5,"sound.amplitude":80,"sound.pan":-4,"sound.mutegroup":true,"time.mode":"bpm","midi.channel":9}""",
            JsJson.stringify(s.toMeta(140, 5000)),
        )
        assertEquals(PadSettings.KEYS, s.toMeta(140, 5000).keys.toList())
        // No end of its own: the sample's end; neither known: no trim at all.
        val d = PadSettings.DEFAULT.toMeta(7, 46875)
        assertEquals(JsJson.number(0), d["sample.start"])
        assertEquals(JsJson.number(46875), d["sample.end"])
        assertEquals(JsonPrimitive("oneshot"), d["sound.playmode"])
        assertEquals(JsonPrimitive("off"), d["time.mode"])
        assertEquals(JsonPrimitive(false), d["sound.mutegroup"])
        assertEquals(PadSettings.KEYS - listOf("sample.start", "sample.end"), PadSettings.DEFAULT.toMeta(7, null).keys.toList())
        // Clamped on the way out: an end past the sample's.
        assertEquals(JsJson.number(5000), s.copy(end = 9000).toMeta(140, 5000)["sample.end"])
        // A time mode arc can't name goes as "off", still a string.
        assertEquals(JsonPrimitive("off"), s.copy(timeMode = "a very long time mode the device never sent").toMeta(1, null)["time.mode"])
        assertThrows<IllegalArgumentException> { s.toMeta(0, null) }
        assertThrows<IllegalArgumentException> { s.toMeta(1000, null) }
        // The largest values stay under the 320-byte metadata page.
        val big = PadSettings(-11.99, 100, -16, PlayMode.ONESHOT, 99_999_999_998, 99_999_999_999, 255, 255, false, 15, "bpm")
        val n = utf8Length(JsJson.stringify(big.toMeta(999, 99_999_999_999)))
        assertTrue(n < 320, "$n bytes")
        // And the record reads back as it was written.
        assertEquals(big, PadSettings.fromMeta(big.toMeta(999, 99_999_999_999)))
    }

    @Test
    fun `withMode pairs the release with oneshot`() {
        val oneshot = PadSettings.DEFAULT
        val key = oneshot.withMode(PlayMode.KEY)
        assertEquals(PadSettings.KEY_RELEASE, key.release)
        assertEquals(PlayMode.KEY, key.mode)
        assertEquals(255, key.withMode(PlayMode.ONESHOT).release)
        // A release of its own stays when leaving oneshot, and between key and legato.
        assertEquals(80, oneshot.copy(release = 80).withMode(PlayMode.LEGATO).release)
        assertEquals(255, key.copy(release = 255).withMode(PlayMode.LEGATO).release)
        assertEquals(40, key.copy(release = 40).withMode(PlayMode.LEGATO).release)
        // The same mode again: nothing changes.
        val odd = oneshot.copy(release = 90)
        assertEquals(odd, odd.withMode(PlayMode.ONESHOT))
    }

    @Test
    fun `mergedOnto takes only the turned fields onto the device's settings`() {
        val base = PadSettings(pitch = 1.0, level = 80, start = 100, end = 2000, timeMode = "bpm")
        val current = PadSettings(
            pitch = -3.0, level = 60, pan = 5, mode = PlayMode.LEGATO, start = 200, end = 3000,
            attack = 9, release = 40, muteGroup = true, midiChannel = 7, timeMode = "bar",
        )
        // Nothing turned: what the device holds now, every field.
        assertEquals(current, base.mergedOnto(base, current))
        // Turned: level and pan; the rest (unchanged from base) are the device's.
        val turned = base.copy(level = 30, pan = -4)
        assertEquals(current.copy(level = 30, pan = -4), turned.mergedOnto(base, current))
        // A field turned back to its base value is not a change.
        assertEquals(current, base.copy(level = 80).mergedOnto(base, current))
        // Every field turned: all of this one's.
        val all = PadSettings(
            pitch = 2.0, level = 10, pan = -1, mode = PlayMode.KEY, start = 5, end = null,
            attack = 1, release = 2, muteGroup = true, midiChannel = 3, timeMode = "off",
        )
        assertEquals(all, all.mergedOnto(base, current))
        // end: cleared to the sample's end offline wins over the device's end...
        assertNull(base.copy(end = null).mergedOnto(base, current).end)
        // ...a set end over a device's null, and an untouched end takes the device's, null or not.
        assertEquals(1500L, PadSettings(end = 1500).mergedOnto(PadSettings.DEFAULT, current.copy(end = null)).end)
        assertNull(PadSettings.DEFAULT.mergedOnto(PadSettings.DEFAULT, current.copy(end = null)).end)
        assertEquals(3000L, PadSettings.DEFAULT.mergedOnto(PadSettings.DEFAULT, current).end)
        // timeMode too, though arc doesn't edit it.
        assertEquals("off", base.copy(timeMode = "off").mergedOnto(base, current).timeMode)
        assertEquals("bar", base.mergedOnto(base, current).timeMode)
    }

    @Test
    fun `clamped keeps the trim inside the sample`() {
        val s = PadSettings(start = 500, end = 9000)
        assertEquals(PadSettings(start = 500, end = 4000), s.clamped(4000))
        assertEquals(PadSettings(start = 3999, end = 4000), PadSettings(start = 7000, end = 9000).clamped(4000))
        assertEquals(PadSettings(start = 99, end = 100), PadSettings(start = 200, end = 100).clamped(null))
        assertEquals(PadSettings(start = 0, end = 1), PadSettings(start = -5, end = 0).clamped(null))
        // No end of its own: start stays before the sample's end, end stays null.
        assertEquals(PadSettings(start = 3999), PadSettings(start = 5000).clamped(4000))
        assertEquals(PadSettings(start = 5000), PadSettings(start = 5000).clamped(null))
        assertEquals(PadSettings(start = 5000), PadSettings(start = 5000).clamped(0)) // a length of 0 isn't known
        val wild = PadSettings(pitch = 1.23456, level = -3, pan = 99, attack = 300, release = -1, midiChannel = 16, timeMode = "?")
        assertEquals(PadSettings(pitch = 1.23, level = 0, pan = 16, attack = 255, release = 0, midiChannel = 15), wild.clamped(null))
        assertEquals(0.0, PadSettings(pitch = Double.NaN).clamped(null).pitch)
        assertEquals(3500L, PadSettings(start = 500).length(4000))
        assertEquals(1000L, PadSettings(start = 500, end = 1500).length(4000))
        assertEquals(0L, PadSettings(start = 5000).length(4000))
    }

    @Test
    fun `fromRecord decodes a plausible record and refuses the rest`() {
        val rec = record(140, volume = 80, pitch = -3, pan = 5, attack = 10, release = 15, time = 1, mute = 1, mode = 1)
        assertEquals(
            PadSettings(pitch = -3.0, level = 80, pan = 5, mode = PlayMode.KEY, attack = 10, release = 15, muteGroup = true, timeMode = "bpm"),
            PadSettings.fromRecord(rec),
        )
        // An unknown time mode reads as off; the rest must be in range.
        assertEquals("off", PadSettings.fromRecord(record(1, 100, 0, 0, 0, 255, 7, 0, 0))!!.timeMode)
        // The demo's records: all zero but the slot.
        assertNull(PadSettings.fromRecord(ByteArray(26).also { it[1] = 5 }))
        assertNull(PadSettings.fromRecord(record(1, 101, 0, 0, 0, 0, 0, 0, 0)))
        assertNull(PadSettings.fromRecord(record(1, 100, 13, 0, 0, 0, 0, 0, 0)))
        assertNull(PadSettings.fromRecord(record(1, 100, 0, -17, 0, 0, 0, 0, 0)))
        assertNull(PadSettings.fromRecord(record(1, 100, 0, 0, 0, 0, 0, 0, 3)))
        assertNull(PadSettings.fromRecord(rec.copyOf(23)))
        assertEquals(PadSettings.fromRecord(rec), PadSettings.fromRecord(rec.copyOf(24)))
    }

    @Test
    fun `ProjectPads reads the settings of plausible records only`() {
        val good = record(140, 80, -3, 5, 10, 15, 0, 0, 1)
        val tar = tarFile(
            listOf(
                "pads/b/p02" to good,
                "pads/a/p10" to record(3, 100, 0, 0, 0, 255, 0, 0, 0),
                "pads/a/p01" to good,
                "pads/a/p03" to ByteArray(26).also { it[1] = 9 },
                "pads/c/p05" to good,
                "pads/c/p05" to ByteArray(26), // the last record of a pad counts
            ),
        )
        val m = ProjectPads.settings(tar)
        assertEquals(listOf("a" to 1, "a" to 10, "b" to 2), m.keys.toList())
        assertEquals(PadSettings.fromRecord(good), m["b" to 2])
        assertEquals(255, m["a" to 10]!!.release)
        // The demo's all-zero records: none.
        assertEquals(emptyMap<Pair<String, Int>, PadSettings>(), ProjectPads.settings(DemoData.projects().first().second))
        assertEquals(emptyMap<Pair<String, Int>, PadSettings>(), ProjectPads.settings(ByteArray(10) { 1 }))
        // The slots still read as before.
        assertEquals(140, ProjectPads.read(tar).first { it.name == "b" }.pads[2])
        assertEquals(listOf(3, 9, 140), Tar.slotsUsedByProject(tar))
    }

    @Test
    fun `readPad reads a pad's metadata, and writePadSettings writes all twelve keys`() = runTest {
        val dev = DemoData.device()
        val s = connect(dev)
        // Untouched: sym 0 only, not settings.
        val before = Device.readPad(s, 1, 1, 2)
        assertEquals("""{"sym":0}""", JsJson.stringify(before))
        assertFalse(PadSettings.written(before))
        val set = PadSettings(pitch = -2.5, level = 70, pan = 8, mode = PlayMode.LEGATO, start = 100, end = 1200, attack = 4, release = 30, muteGroup = true, midiChannel = 2)
        Device.writePadSettings(s, 1, 1, 2, 110, set, 2000)
        val (node, text) = dev.metaWrites.last()
        assertEquals(3302, node)
        assertEquals(PadSettings.KEYS, (JsJson.parse(text) as JsonObject).keys.toList())
        val after = Device.readPad(s, 1, 1, 2)
        assertTrue(PadSettings.written(after))
        assertEquals(set, PadSettings.fromMeta(after))
        assertEquals(dev.padMeta(1, 1, 2), after)
        // sym still lands in the project's pad record.
        assertEquals(110, ProjectPads.read(Device.readProject(s, 1)).first { it.name == "b" }.pads[2])
        // Another pad is untouched; a project the device doesn't have reads empty.
        assertEquals("""{"sym":0}""", JsJson.stringify(Device.readPad(s, 1, 1, 3)))
        assertEquals(JsonObject(emptyMap()), Device.readPad(s, 9, 0, 1))
        s.close()
    }

    @Test
    fun `the mock refuses a play or time mode that isn't a string, as the device does`() = runTest {
        val dev = DemoData.device()
        val s = connect(dev)
        val node = PadPush.node(PadFid(1, 0, 1))
        assertThrows<DeviceError> { setMeta(s, node, """{"sym":3,"sound.playmode":1}""") }
        assertThrows<DeviceError> { setMeta(s, node, """{"sym":3,"time.mode":0}""") }
        assertEquals("""{"sym":0}""", JsJson.stringify(Device.readPad(s, 1, 0, 1)))
        // A partial write merges into what is there.
        setMeta(s, node, """{"sound.pitch":2}""")
        setMeta(s, node, """{"sound.pan":-3}""")
        assertEquals("""{"sym":0,"sound.pitch":2,"sound.pan":-3}""", JsJson.stringify(Device.readPad(s, 1, 0, 1)))
        // No such project: refused.
        assertThrows<DeviceError> { Device.writePadSettings(s, 9, 0, 1, 1, PadSettings.DEFAULT, null) }
        s.close()
    }

    private suspend fun setMeta(s: Session, node: Int, json: String) {
        Fs.setMetadata(s, node, JsJson.parse(json) as JsonObject)
    }
}
