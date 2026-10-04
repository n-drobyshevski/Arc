package dev.arc.ep133.formats

import dev.arc.ep133.util.JsDate
import dev.arc.ep133.util.decodeUtf8
import dev.arc.ep133.util.jsNumberToString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.ZoneOffset

/**
 * Cases found by the fidelity review of the port, each checked against
 * Node 22 running the reference (expected values are Node's output).
 */
class ParityTest {
    private fun h(s: String) = ByteArray(s.length / 2) { s.substring(2 * it, 2 * it + 2).toInt(16).toByte() }

    @Test
    fun `UTF-8 decoding matches TextDecoder, including invalid sequences`() {
        val cases = listOf(
            "45eda08078" to "45 fffd fffd fffd 78", "edbfbf41" to "fffd fffd fffd 41", "eda041" to "fffd fffd 41",
            "eda0" to "fffd fffd", "f4908080" to "fffd fffd fffd fffd", "e08080" to "fffd fffd fffd", "c080" to "fffd fffd",
            "f0808080" to "fffd fffd fffd fffd", "e180" to "fffd", "f1808041" to "fffd 41", "efbbbf41" to "41",
            "efbbbfefbbbf41" to "feff 41", "f09f9880" to "1f600", "c3a9" to "e9",
        )
        for ((input, expected) in cases) {
            val got = decodeUtf8(h(input)).codePoints().toArray().joinToString(" ") { Integer.toHexString(it) }
            assertEquals(expected, got, input)
        }
    }

    @Test
    fun `numbers next to a power of two print the shortest digits`() {
        val xs = listOf(Math.pow(2.0, -24.0), Math.pow(2.0, -44.0), Math.pow(2.0, 89.0), Math.pow(2.0, 60.0), Double.MIN_VALUE, 0.1 + 0.2, 123456789012345680000.0)
        assertEquals(
            listOf("5.960464477539063e-8", "5.684341886080802e-14", "6.189700196426902e+26", "1152921504606847000", "5e-324", "0.30000000000000004", "123456789012345680000"),
            xs.map(::jsNumberToString),
        )
    }

    @Test
    fun `deep nesting parses like V8 instead of overflowing the stack`() {
        val depth = 100_000
        val deep = "[".repeat(depth) + "]".repeat(depth)
        var v = JsJson.parse(deep)
        var n = 1
        while (v is kotlinx.serialization.json.JsonArray && v.isNotEmpty()) {
            v = v[0]
            n++
        }
        assertEquals(depth, n)
        assertNull(JsJson.parseOrNull("[".repeat(depth)))
        val obj = JsJson.parse("{\"a\":" + "[".repeat(5000) + "]".repeat(5000) + ",\"b\":{\"c\":[1,{\"d\":2}]}}")
        assertEquals("""{"c":[1,{"d":2}]}""", JsJson.stringify((obj as kotlinx.serialization.json.JsonObject)["b"]!!))
    }

    @Test
    fun `Date parse`() {
        val xs = listOf(
            "2026-10-04T13:05:24.116Z", "2024", "2024-01", "2024-01-01", "2024-01-01T10:00", "2024-01-01T10:00:00+01:00",
            "2024-01-01 10:00:00", "2024-01-01T10:00:00+0100", "2024-1-1", "2024/01/01", "Mon, 01 Jan 2024 10:00:00 GMT",
            "2024-02-30T00:00:00Z", "2024-01-01T10:00:00.1234567891Z", "+002024-01-01T00:00:00Z", "2024-13-01",
            "2024-01-01T24:00:00Z", "2024-01-01T24:01:00Z", "garbage", "", "2024-01-32",
        )
        val js = listOf(
            1791119124116, 1704067200000, 1704067200000, 1704067200000, 1704103200000, 1704099600000,
            1704103200000, 1704099600000, 1704067200000, 1704067200000, 1704103200000,
            1709251200000, 1704103200123, 1704067200000, null,
            1704153600000, null, null, null, null,
        )
        assertEquals(js, xs.map { JsDate.parse(it, ZoneOffset.UTC) })
    }

    @Test
    fun `truncated deflate data is rejected like DecompressionStream does`() {
        assertEquals("abc", String(Zip.inflateRaw(h("4b4c4a0600"), "x")))
        assertThrows<IllegalArgumentException> { Zip.inflateRaw(h("4b4c4a06"), "x") }
    }

    @Test
    fun `out of bounds reads use the DataView message`() {
        val wav = Wav.encode(ByteArray(4), 1, 8000).copyOf(30) // fmt chunk cut short
        // The clamped chunk walk reads past the end while parsing "fmt ".
        val e = assertThrows<IllegalArgumentException> { Wav.decode(wav) }
        assertEquals(DATAVIEW_RANGE, e.message)
    }
}
