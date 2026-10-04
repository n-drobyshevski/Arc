package dev.arc.ep133.formats

import dev.arc.ep133.util.jsNumberToString
import dev.arc.ep133.util.jsStringToNumber
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * JSON with JavaScript's exact behaviour, on top of kotlinx.serialization's
 * [JsonElement] model.
 *
 * Why not kotlinx's own parser and printer: the device metadata cap (320 bytes)
 * and the files inside a .pak are measured and compared byte for byte against
 * what `JSON.stringify` produces. kotlinx prints 46875.0 where JS prints 46875,
 * keeps object keys in insertion order where JS puts integer-like keys first,
 * and its tree parser accepts unquoted literals that `JSON.parse` rejects
 * (which matters for the incremental parse in getMetadata).
 */
object JsJson {
    class SyntaxError(message: String) : Exception(message)

    // ---------- parse (JSON.parse) ----------

    fun parse(text: String): JsonElement {
        val p = Parser(text)
        p.ws()
        val v = p.value()
        p.ws()
        if (p.i != text.length) throw p.err()
        return v
    }

    /** JSON.parse that returns null instead of throwing. */
    fun parseOrNull(text: String): JsonElement? = try {
        parse(text)
    } catch (_: SyntaxError) {
        null
    }

    private class Parser(val s: String) {
        var i = 0

        fun err(): SyntaxError =
            if (i >= s.length) SyntaxError("Unexpected end of JSON input")
            else SyntaxError("Unexpected token '${s[i]}' in JSON at position $i")

        fun ws() {
            while (i < s.length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++
        }

        private class Open(val map: LinkedHashMap<String, JsonElement>?, val list: ArrayList<JsonElement>?) {
            var key: String = ""
        }

        private fun expect(c: Char) {
            if (i >= s.length || s[i] != c) throw err()
            i++
        }

        /** Reads `"key" :` and leaves [i] at the value. */
        private fun key(): String {
            ws()
            if (i >= s.length || s[i] != '"') throw err()
            val k = str()
            ws()
            expect(':')
            ws()
            return k
        }

        /**
         * Iterative (an explicit stack instead of recursion), so nesting depth
         * is limited by memory as in V8, not by the thread's stack.
         */
        fun value(): JsonElement {
            val stack = ArrayList<Open>()
            while (true) {
                if (i >= s.length) throw err()
                var v: JsonElement
                when (val c = s[i]) {
                    '{' -> {
                        i++
                        ws()
                        if (i < s.length && s[i] == '}') {
                            i++
                            v = JsonObject(emptyMap())
                        } else {
                            val o = Open(LinkedHashMap(), null)
                            o.key = key()
                            stack.add(o)
                            continue
                        }
                    }
                    '[' -> {
                        i++
                        ws()
                        if (i < s.length && s[i] == ']') {
                            i++
                            v = JsonArray(emptyList())
                        } else {
                            stack.add(Open(null, ArrayList()))
                            continue
                        }
                    }
                    '"' -> v = JsonPrimitive(str())
                    't' -> v = lit("true", JsonPrimitive(true))
                    'f' -> v = lit("false", JsonPrimitive(false))
                    'n' -> v = lit("null", JsonNull)
                    else -> v = if (c == '-' || c in '0'..'9') num() else throw err()
                }
                // Attach the finished value to its parents, closing containers as they end.
                while (true) {
                    val top = stack.lastOrNull() ?: return v
                    ws()
                    if (top.map != null) {
                        // Duplicate keys: last value wins, first position is kept (like JS).
                        top.map[top.key] = v
                        if (i < s.length && s[i] == ',') {
                            i++
                            top.key = key()
                            break
                        }
                        expect('}')
                        v = JsonObject(top.map)
                    } else {
                        top.list!!.add(v)
                        if (i < s.length && s[i] == ',') {
                            i++
                            ws()
                            break
                        }
                        expect(']')
                        v = JsonArray(top.list)
                    }
                    stack.removeAt(stack.size - 1)
                }
            }
        }

        fun lit(word: String, v: JsonElement): JsonElement {
            if (!s.startsWith(word, i)) throw err()
            i += word.length
            return v
        }

        fun str(): String {
            i++ // opening quote
            val sb = StringBuilder()
            while (true) {
                if (i >= s.length) throw err()
                val c = s[i]
                when {
                    c == '"' -> {
                        i++
                        return sb.toString()
                    }
                    c == '\\' -> {
                        i++
                        if (i >= s.length) throw err()
                        when (s[i]) {
                            '"' -> sb.append('"')
                            '\\' -> sb.append('\\')
                            '/' -> sb.append('/')
                            'b' -> sb.append('\b')
                            'f' -> sb.append('\u000C')
                            'n' -> sb.append('\n')
                            'r' -> sb.append('\r')
                            't' -> sb.append('\t')
                            'u' -> {
                                if (i + 4 >= s.length) {
                                    i = s.length
                                    throw err()
                                }
                                var v = 0
                                for (k in 1..4) {
                                    val h = s[i + k]
                                    val d = if (h.code < 128) Character.digit(h, 16) else -1
                                    if (d < 0) {
                                        i += k
                                        throw err()
                                    }
                                    v = v * 16 + d
                                }
                                sb.append(v.toChar())
                                i += 4
                            }
                            else -> throw err()
                        }
                        i++
                    }
                    c.code < 0x20 -> throw err() // raw control characters are not allowed
                    else -> {
                        sb.append(c)
                        i++
                    }
                }
            }
        }

        fun num(): JsonPrimitive {
            val start = i
            if (s[i] == '-') i++
            if (i >= s.length) throw err()
            if (s[i] == '0') {
                i++
            } else if (s[i] in '1'..'9') {
                while (i < s.length && s[i] in '0'..'9') i++
            } else {
                throw err()
            }
            if (i < s.length && s[i] == '.') {
                i++
                if (i >= s.length || s[i] !in '0'..'9') throw err()
                while (i < s.length && s[i] in '0'..'9') i++
            }
            if (i < s.length && (s[i] == 'e' || s[i] == 'E')) {
                i++
                if (i < s.length && (s[i] == '+' || s[i] == '-')) i++
                if (i >= s.length || s[i] !in '0'..'9') throw err()
                while (i < s.length && s[i] in '0'..'9') i++
            }
            return number(s.substring(start, i).toDouble())
        }
    }

    // ---------- values ----------

    /**
     * A JS number as a JsonPrimitive. Whole numbers are stored as Long so that
     * kotlinx's own toString() also prints them without ".0".
     */
    fun number(d: Double): JsonPrimitive =
        if (d == Math.floor(d) && Math.abs(d) < 9.007199254740992E15) JsonPrimitive(d.toLong()) else JsonPrimitive(d)

    fun number(n: Int): JsonPrimitive = JsonPrimitive(n.toLong())

    fun number(n: Long): JsonPrimitive = JsonPrimitive(n)

    // ---------- stringify (JSON.stringify) ----------

    /** `JSON.stringify(v)` or, with [indent], `JSON.stringify(v, null, indent)`. */
    fun stringify(v: JsonElement, indent: String? = null): String {
        val sb = StringBuilder()
        write(sb, v, indent?.takeIf { it.isNotEmpty() }, "")
        return sb.toString()
    }

    private fun write(sb: StringBuilder, v: JsonElement, indent: String?, cur: String) {
        when (v) {
            is JsonNull -> sb.append("null")
            is JsonPrimitive -> when {
                v.isString -> quote(sb, v.content)
                v.content == "true" || v.content == "false" -> sb.append(v.content)
                else -> {
                    val d = v.content.toDoubleOrNull() ?: Double.NaN
                    sb.append(if (d.isNaN() || d.isInfinite()) "null" else jsNumberToString(d))
                }
            }
            is JsonArray -> {
                if (v.isEmpty()) {
                    sb.append("[]")
                    return
                }
                val inner = if (indent != null) cur + indent else cur
                sb.append('[')
                v.forEachIndexed { k, e ->
                    if (k > 0) sb.append(',')
                    if (indent != null) sb.append('\n').append(inner)
                    write(sb, e, indent, inner)
                }
                if (indent != null) sb.append('\n').append(cur)
                sb.append(']')
            }
            is JsonObject -> {
                if (v.isEmpty()) {
                    sb.append("{}")
                    return
                }
                val inner = if (indent != null) cur + indent else cur
                sb.append('{')
                var first = true
                for (k in jsKeyOrder(v.keys)) {
                    if (!first) sb.append(',')
                    first = false
                    if (indent != null) sb.append('\n').append(inner)
                    quote(sb, k)
                    sb.append(':')
                    if (indent != null) sb.append(' ')
                    write(sb, v.getValue(k), indent, inner)
                }
                if (indent != null) sb.append('\n').append(cur)
                sb.append('}')
            }
        }
    }

    /** JS own-property order: array-index keys ascending, then the rest in insertion order. */
    fun jsKeyOrder(keys: Collection<String>): List<String> {
        val idx = keys.filter { isArrayIndex(it) }.sortedBy { it.toLong() }
        if (idx.isEmpty()) return keys.toList()
        return idx + keys.filter { !isArrayIndex(it) }
    }

    private fun isArrayIndex(k: String): Boolean {
        if (k.isEmpty() || k.length > 10) return false
        if (k.length > 1 && k[0] == '0') return false
        if (!k.all { it in '0'..'9' }) return false
        return k.toLong() < 4294967295L
    }

    private fun quote(sb: StringBuilder, s: String) {
        sb.append('"')
        var i = 0
        while (i < s.length) {
            val c = s[i]
            when {
                c == '"' -> sb.append("\\\"")
                c == '\\' -> sb.append("\\\\")
                c == '\b' -> sb.append("\\b")
                c == '\u000C' -> sb.append("\\f")
                c == '\n' -> sb.append("\\n")
                c == '\r' -> sb.append("\\r")
                c == '\t' -> sb.append("\\t")
                c.code < 0x20 -> sb.append("\\u").append(hex4(c.code))
                c.isHighSurrogate() && i + 1 < s.length && s[i + 1].isLowSurrogate() -> {
                    sb.append(c).append(s[i + 1])
                    i++
                }
                c.isSurrogate() -> sb.append("\\u").append(hex4(c.code)) // lone surrogate (well-formed stringify)
                else -> sb.append(c)
            }
            i++
        }
        sb.append('"')
    }

    private fun hex4(v: Int) = Integer.toHexString(v).padStart(4, '0')
}

// ---------- JS value semantics on JsonElement ----------

/** True for a JSON number (not a string, boolean or null). */
val JsonElement.isJsNumber: Boolean
    get() = this is JsonPrimitive && !isString && this !is JsonNull && content != "true" && content != "false"

/** The numeric value of a JSON number, or null for anything else. */
val JsonElement.numberOrNull: Double?
    get() = if (isJsNumber) (this as JsonPrimitive).content.toDoubleOrNull() else null

/** JS truthiness. A missing value (Kotlin null) is `undefined`. */
fun JsonElement?.jsTruthy(): Boolean = when (this) {
    null, JsonNull -> false
    is JsonPrimitive -> when {
        isString -> content.isNotEmpty()
        content == "true" -> true
        content == "false" -> false
        else -> content.toDoubleOrNull().let { it != null && it != 0.0 && !it.isNaN() }
    }
    else -> true
}

/** `String(x)`. A missing value is "undefined". */
fun JsonElement?.jsString(): String = when (this) {
    null -> "undefined"
    JsonNull -> "null"
    is JsonPrimitive -> if (isString || content == "true" || content == "false") content
        else jsNumberToString(content.toDoubleOrNull() ?: Double.NaN)
    is JsonArray -> joinToString(",") { if (it is JsonNull) "" else it.jsString() }
    is JsonObject -> "[object Object]"
}

/** `Number(x)`. A missing value is NaN. */
fun JsonElement?.jsNum(): Double = when (this) {
    null -> Double.NaN
    JsonNull -> 0.0
    is JsonPrimitive -> when {
        isString -> jsStringToNumber(content)
        content == "true" -> 1.0
        content == "false" -> 0.0
        else -> content.toDoubleOrNull() ?: Double.NaN
    }
    is JsonArray -> jsStringToNumber(jsString())
    is JsonObject -> Double.NaN
}

/** `Number(x) || fallback`. */
fun JsonElement?.jsNumOr(fallback: Double): Double {
    val n = jsNum()
    return if (n.isNaN() || n == 0.0) fallback else n
}

/** `x || fallback` for a value used as text. */
fun JsonElement?.jsStringOr(fallback: String): String = if (jsTruthy()) jsString() else fallback

/** Property access on a parsed JSON value: primitives and arrays have no named properties. */
fun JsonElement?.prop(key: String): JsonElement? = (this as? JsonObject)?.get(key)

/** `x ?? {}` followed by property reads: anything that is not an object reads as empty. */
fun JsonElement?.asObject(): JsonObject = this as? JsonObject ?: JsonObject(emptyMap())
