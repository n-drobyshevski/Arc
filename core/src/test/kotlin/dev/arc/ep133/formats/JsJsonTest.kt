package dev.arc.ep133.formats

import dev.arc.ep133.util.jsNumberToString
import dev.arc.ep133.util.jsRound
import dev.arc.ep133.util.jsStringToNumber
import dev.arc.ep133.util.jsToFixed
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/** Expected values were produced by Node 22 (see the stage 1 commit). */
class JsJsonTest {
    @Test
    fun `numbers print like JavaScript`() {
        val nums = listOf(0.0, -0.0, 1.0, -1.0, 60.0, 46875.0, 0.1, 1.5, -3.0, 123.456, 1e21, 1e20,
            Double.MAX_VALUE, Double.MIN_VALUE, 2.944668259e9, 1152921504606846976.0, 0.000001, 1e-7, 123e-20, -1.5e-10, 100.0, 1.0 / 3)
        val js = listOf("0", "0", "1", "-1", "60", "46875", "0.1", "1.5", "-3", "123.456", "1e+21", "100000000000000000000",
            "1.7976931348623157e+308", "5e-324", "2944668259", "1152921504606847000", "0.000001", "1e-7", "1.23e-18", "-1.5e-10", "100", "0.3333333333333333")
        assertEquals(js, nums.map(::jsNumberToString))
    }

    @Test
    fun `toFixed rounds the exact binary value and keeps negative zero`() {
        val xs = listOf(0.05, 0.15, 0.25, 0.35, 1.005, -0.04, -0.05, 2.5, 1048575.0 / 1048576, 123.45, 1e21)
        assertEquals(listOf("0.1", "0.1", "0.3", "0.3", "1.0", "-0.0", "-0.1", "2.5", "1.0", "123.5", "1e+21"), xs.map { jsToFixed(it, 1) })
    }

    @Test
    fun `Number of a string`() {
        val ss = listOf("", "  12  ", "0x1f", "0X1F", "-0x10", "+0x10", "1e3", ".5", "5.", "Infinity", "-Infinity", "abc", "12abc", " 12﻿", "0b101", "0o17")
        val js = listOf(0.0, 12.0, 31.0, 31.0, Double.NaN, Double.NaN, 1000.0, 0.5, 5.0, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY,
            Double.NaN, Double.NaN, 12.0, 5.0, 15.0)
        assertEquals(js, ss.map(::jsStringToNumber))
    }

    @Test
    fun `Math round`() {
        val xs = listOf(0.5, -0.5, 1.5, 2.5, -2.5, 0.49999999999999994, -0.49999999999999994)
        assertEquals(listOf(1.0, 0.0, 2.0, 3.0, -2.0, 0.0, 0.0), xs.map { jsRound(it) + 0.0 })
    }

    @Test
    fun `integer-like keys come first in numeric order`() {
        val o = JsJson.parse("""{"b":1,"10":2,"a":3,"2":4,"01":5,"4294967295":6,"4294967294":7}""")
        assertEquals("""{"2":4,"10":2,"4294967294":7,"b":1,"a":3,"01":5,"4294967295":6}""", JsJson.stringify(o))
    }

    @Test
    fun `pretty printing and escaping match JSON stringify`() {
        val v = JsonObject(
            linkedMapOf(
                "a" to JsonArray(listOf(JsonPrimitive(1), JsonObject(mapOf("b" to JsonArray(emptyList()))), JsonObject(emptyMap()))),
                "c" to JsonPrimitive("x\u0001\"\\\n\ud800😀é"),
            ),
        )
        val expected = "{\n  \"a\": [\n    1,\n    {\n      \"b\": []\n    },\n    {}\n  ],\n  \"c\": \"x\\u0001\\\"\\\\\\n\\ud800😀é\"\n}"
        assertEquals(expected, JsJson.stringify(v, "  "))
    }

    @Test
    fun `parse is as strict as JSON parse`() {
        for (bad in listOf("{\"a\":abc}", "{\"a\":tru", "[1,]", "{\"a\":1,}", "01", "1.", "-", "\"a\u0001\"", "{'a':1}", "NaN", "[1 2]", "")) {
            assertNull(JsJson.parseOrNull(bad), bad)
        }
        assertThrows<JsJson.SyntaxError> { JsJson.parse("{\"name\":\"kick\"}\u0000") }
        assertEquals(JsonPrimitive(-0.5).content, (JsJson.parse("-5e-1") as JsonPrimitive).content)
        val dup = JsJson.parse("""{"a":1,"b":2,"a":3}""")
        assertEquals("""{"a":3,"b":2}""", JsJson.stringify(dup))
        assertEquals("""{"x":46875,"y":1.5}""", JsJson.stringify(JsJson.parse("""{"x":46875.0,"y":1.50}""")))
    }

    @Test
    fun `js value semantics`() {
        assertTrue(JsonPrimitive("1").jsTruthy())
        assertEquals(false, JsonPrimitive("").jsTruthy())
        assertEquals(false, JsonPrimitive(0).jsTruthy())
        assertEquals(1.0, JsJson.parse("[true]").jsNum().let { if (it.isNaN()) 1.0 else 0.0 }) // Number([true]) is NaN
        assertEquals(7.0, JsJson.parse("[[7]]").jsNum())
        assertEquals(0.0, JsJson.parse("[]").jsNum())
        assertEquals(64.0 * 1024 * 1024, JsonPrimitive("67108864").jsNumOr(0.0))
        assertEquals(5.0, JsonPrimitive("abc").jsNumOr(5.0))
    }
}
