package dev.arc.ep133.protocol

import dev.arc.ep133.formats.JsJson
import kotlinx.serialization.json.JsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/** Pure parts of fs.js and device.js. Expected values come from the reference run under Node 22. */
class FsDeviceTest {
    private fun obj(json: String) = JsJson.parse(json) as JsonObject

    @Test
    fun `soundMeta key order, loop clamping and the 320 byte trim`() {
        fun sm(ch: Double, rate: Double, settings: String, frames: Long) =
            JsJson.stringify(Device.soundMeta(ch, rate, obj(settings), frames))
        assertEquals(
            """{"sound.playmode":"oneshot","sound.rootnote":60,"sound.pitch":0,"sound.pan":0,"sound.amplitude":100,"envelope.attack":0,"envelope.release":255,"time.mode":"off","channels":1,"samplerate":46875}""",
            sm(1.0, 46875.0, "{}", 1000),
        )
        assertEquals(
            """{"sound.playmode":"key","sound.rootnote":60,"sound.pitch":-3,"sound.pan":0,"sound.amplitude":100,"envelope.attack":0,"envelope.release":255,"time.mode":"off","sound.loopstart":0,"sound.loopend":999,"sound.bpm":120.5,"channels":2,"samplerate":44100}""",
            sm(2.0, 44100.0, """{"sound.playmode":"key","sound.pitch":-3,"sound.loopend":5000,"sound.loopstart":2000,"sound.bpm":120.5,"foo":1,"sound.pan":null}""", 1000),
        )
        assertEquals(
            """{"sound.playmode":"oneshot","sound.rootnote":60,"sound.pitch":0,"sound.pan":0,"sound.amplitude":100,"envelope.attack":0,"envelope.release":255,"time.mode":"off","sound.loopstart":"abc","sound.loopend":499,"channels":1,"samplerate":46875}""",
            sm(1.0, 46875.0, """{"sound.loopend":"999","sound.loopstart":"abc"}""", 500),
        )
        val x = "x".repeat(200)
        assertEquals(
            """{"sound.playmode":"$x","sound.rootnote":60,"sound.pitch":0,"sound.amplitude":100,"envelope.attack":0,"envelope.release":255,"channels":1,"samplerate":46875}""",
            sm(1.0, 46875.0, """{"sound.playmode":"$x","sound.bpm":1,"sound.loopstart":1,"sound.loopend":2,"time.mode":"bar","sound.pan":3}""", 10),
        )
    }

    @Test
    fun `cleanSoundName`() {
        val inputs = listOf("kick.wav", "KICK.WAV", "  héllo wörld 123456789012345  ", "", null, "éé", "a.wav.wav", "tab\there")
        assertEquals(
            listOf("kick", "KICK", "hllo wrld 1234567890", "sound", "sound", "sound", "a.wav", "tabhere"),
            inputs.map(Device::cleanSoundName),
        )
    }

    @Test
    fun `loose metadata parsing repairs stray quotes`() {
        assertEquals("""{"name":"kick"}""", JsJson.stringify(Fs.parseJsonLoose("{\"name\":\"kick\"}\u0000\u0000")))
        assertEquals("""{"name":"my best\" kick\"","x":1}""", JsJson.stringify(Fs.parseJsonLoose("""{"name":"my "best" kick","x":1}""")))
        assertEquals("""{"a":"bc\"","d":2}""", JsJson.stringify(Fs.parseJsonLoose("""{"a":"b"c","d":2}""")))
        assertEquals("Could not read device metadata: {{{", assertThrows<DeviceError> { Fs.parseJsonLoose("{{{") }.message)
    }

    @Test
    fun `project node numbering`() {
        assertEquals(listOf(null, 1, null, 2, 99, null), listOf(2999, 3000, 3500, 4000, 101000, 102000).map(Device::projectFromNode))
        assertEquals(3000, Device.projectNode(1))
        assertEquals(6000, Device.projectNode(4))
    }

    @Test
    fun `list pages stop at a truncated entry`() {
        // page echo, then one full entry and a truncated one without enough bytes
        val p = byteArrayOf(0, 0) + be16(1) + byteArrayOf(5) + be32(99) + "kick".toByteArray() + byteArrayOf(0) + byteArrayOf(0, 2, 5)
        assertEquals(listOf(ListEntry(1, 5, 99, "kick", false)), Fs.parseListPage(p))
        // An unterminated last name is still accepted (next == size + 1)
        val q = byteArrayOf(0, 0) + be16(2) + byteArrayOf(6) + be32(0) + "05".toByteArray()
        assertEquals(listOf(ListEntry(2, 6, 0, "05", true)), Fs.parseListPage(q))
    }

    @Test
    fun `frame helpers`() {
        assertEquals(0xFFFF_FFFFL, readBe32(byteArrayOf(-1, -1, -1, -1), 0))
        assertEquals(0, readBe16(ByteArray(0), 0))
        assertEquals(0x3FFF, readU14le(u14le(0x3FFF), 0))
        assertEquals(129, readU14le(byteArrayOf(1, 1), 0))
        assertEquals("device error 16", FrameCodec.statusText(16))
        assertEquals("status 4", FrameCodec.statusText(4))
        assertEquals(mapOf("a" to "b:c", "" to "x"), FrameCodec.parseGreet("a:b:c;:skip; :x;novalue\u0000"))
    }
}
