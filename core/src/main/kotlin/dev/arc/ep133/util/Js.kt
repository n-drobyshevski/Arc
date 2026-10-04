package dev.arc.ep133.util

import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode
import kotlin.math.abs
import kotlin.math.floor

// Small pieces of JavaScript semantics the reference depends on. Kotlin and
// Java differ from JS on each of these, and the differences show up in file
// names, error text and the bytes written to the device.

/** The ECMAScript WhiteSpace + LineTerminator set used by `trim()`, `\s` and `Number()`. */
fun isJsWhitespace(c: Char): Boolean = when (c) {
    '\t', '\n', '\u000B', '\u000C', '\r', ' ', '\u00A0', '\u1680', '\u2028', '\u2029',
    '\u202F', '\u205F', '\u3000', '\uFEFF' -> true
    else -> c in '\u2000'..'\u200A'
}

/** Regex character class equal to JS `\s` (Java's `\s` is ASCII only, ICU's is Unicode). */
const val JS_SPACE_CLASS = "[\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]"

/** Regex for JS `.` without the s flag (Java's `.` also excludes U+0085). */
const val JS_DOT = "[^\\n\\r\\u2028\\u2029]"

/** `String.prototype.trim()`. */
fun String.jsTrim(): String = trim { isJsWhitespace(it) }

/** `Math.round`: nearest integer, ties toward +Infinity. NaN and infinities pass through. */
fun jsRound(x: Double): Double {
    if (x.isNaN() || x.isInfinite()) return x
    val f = floor(x)
    // x - floor(x) is exact for every double, unlike floor(x + 0.5).
    return if (x - f >= 0.5) f + 1 else f
}

/** `ToInt32` (used by `|`, `<<` and `>>`). */
fun toInt32(x: Double): Int {
    if (x.isNaN() || x.isInfinite()) return 0
    val t = if (x < 0) -floor(-x) else floor(x)
    return BigDecimal(t).toBigInteger().toInt()
}

/** `ToUint32` (used by `>>>` and `DataView.setUint32`). */
fun toUint32(x: Double): Long = toInt32(x).toLong() and 0xFFFF_FFFFL

/** `ToUint16` (used by `DataView.setUint16`). */
fun toUint16(x: Double): Int = toInt32(x) and 0xFFFF

/** `Number(string)`: StringToNumber, including hex/octal/binary prefixes and Infinity. */
fun jsStringToNumber(s: String): Double {
    val t = s.jsTrim()
    if (t.isEmpty()) return 0.0
    // A sign is not allowed in front of 0x / 0o / 0b.
    if (t.length > 2 && t[0] == '0') {
        val radix = when (t[1]) {
            'x', 'X' -> 16
            'o', 'O' -> 8
            'b', 'B' -> 2
            else -> 0
        }
        if (radix != 0) {
            val digits = t.substring(2)
            if (digits.isEmpty() || !digits.all { Character.digit(it, radix) >= 0 && it.code < 128 }) return Double.NaN
            return java.math.BigInteger(digits, radix).toDouble()
        }
    }
    when (t) {
        "Infinity", "+Infinity" -> return Double.POSITIVE_INFINITY
        "-Infinity" -> return Double.NEGATIVE_INFINITY
    }
    if (!DECIMAL_LITERAL.matches(t)) return Double.NaN
    return t.toDouble()
}

// StrDecimalLiteral without Infinity: digits with optional fraction and exponent, ASCII only.
private val DECIMAL_LITERAL = Regex("[+-]?(?:[0-9]+\\.?[0-9]*|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?")

/** `Number.prototype.toString()` / how JSON.stringify prints numbers (finite values). */
fun jsNumberToString(d: Double): String {
    if (d.isNaN()) return "NaN"
    if (d == 0.0) return "0" // also -0
    if (d.isInfinite()) return if (d > 0) "Infinity" else "-Infinity"
    if (d < 0) return "-" + jsNumberToString(-d)
    // Shortest digit string that round-trips (Number::toString). Double.toString
    // is not guaranteed shortest on every runtime (ART), so search explicitly.
    // At each precision try the nearest value and both neighbours: next to a
    // power of two the gaps differ, and the nearest may miss while a neighbour fits.
    val exact = BigDecimal(d)
    var digits = ""
    var n = 0
    for (p in 1..17) {
        val mc = { m: RoundingMode -> exact.round(MathContext(p, m)) }
        val fits = listOf(mc(RoundingMode.HALF_EVEN), mc(RoundingMode.FLOOR), mc(RoundingMode.CEILING))
            .distinct()
            .filter { it.toString().toDouble() == d }
        if (fits.isEmpty()) continue
        // Closest to the exact value; on a tie, the even last digit.
        val r = fits.minWithOrNull(
            compareBy<BigDecimal> { it.subtract(exact).abs() }.thenBy { it.unscaledValue().testBit(0) },
        )!!
        digits = r.unscaledValue().toString().trimEnd('0').ifEmpty { "0" }
        // value = 0.digits * 10^n
        n = r.precision() - r.scale()
        break
    }
    val k = digits.length
    return when {
        n in k..21 -> digits + "0".repeat(n - k)
        n in 1..21 -> digits.substring(0, n) + "." + digits.substring(n)
        n in -5..0 -> "0." + "0".repeat(-n) + digits
        else -> {
            val e = n - 1
            val exp = if (e >= 0) "e+$e" else "e-${-e}"
            if (k == 1) digits + exp else digits[0] + "." + digits.substring(1) + exp
        }
    }
}

/**
 * `Number.prototype.toFixed(digits)`. Rounds the exact binary value half up
 * on the magnitude, and keeps the minus sign of small negatives ("-0.0").
 */
fun jsToFixed(x: Double, digits: Int): String {
    if (x.isNaN()) return "NaN"
    if (abs(x) >= 1e21 || x.isInfinite()) return jsNumberToString(x)
    if (x < 0) return "-" + jsToFixed(-x, digits)
    return BigDecimal(x).setScale(digits, RoundingMode.HALF_UP).toPlainString()
}

/** `String(n).padStart(width, '0')` for integers. */
fun padNum(n: Int, width: Int): String = n.toString().padStart(width, '0')
