package dev.arc.ep133.util

// Byte helpers that behave like the JS reference's Uint8Array code.
//
// JS reads bytes as 0..255 and an out-of-range index reads `undefined`, which
// every bit operation in the reference turns into 0. Several parsers rely on
// that (for example a short download reply reads its page echo as 0), so reads
// here return 0 past the end instead of throwing.

/** Unsigned byte at [i], or 0 when [i] is out of range (like `undefined | 0` in JS). */
fun ByteArray.u8(i: Int): Int = if (i in indices) this[i].toInt() and 0xFF else 0

/** Like `Uint8Array.subarray(from, to)`: clamps and never throws (returns a copy). */
fun ByteArray.sub(from: Int, to: Int = size): ByteArray {
    val a = from.coerceIn(0, size)
    val b = to.coerceIn(0, size)
    return if (b <= a) ByteArray(0) else copyOfRange(a, b)
}

/** Builds a byte array from Ints (wrapped mod 256, like `Uint8Array.from`), ByteArrays and IntArrays. */
fun bytes(vararg parts: Any): ByteArray {
    val out = java.io.ByteArrayOutputStream()
    for (p in parts) {
        when (p) {
            is Int -> out.write(p and 0xFF)
            is ByteArray -> out.write(p, 0, p.size)
            is IntArray -> p.forEach { out.write(it and 0xFF) }
            is List<*> -> p.forEach { out.write((it as Int) and 0xFF) }
            else -> throw IllegalArgumentException("bytes(): unsupported part ${p::class}")
        }
    }
    return out.toByteArray()
}

/** "F0 00 20" style hex, used by the debug log and tests. */
fun ByteArray.toHex(sep: String = " "): String {
    val sb = StringBuilder(size * 3)
    for (i in indices) {
        if (i > 0) sb.append(sep)
        val v = this[i].toInt() and 0xFF
        sb.append(HEX[v ushr 4]).append(HEX[v and 0xF])
    }
    return sb.toString()
}

/** Parses whitespace separated hex bytes ("F0 7E 7F"). */
fun hexBytes(s: String): ByteArray {
    val parts = s.trim().split(Regex("[ \t\r\n]+")).filter { it.isNotEmpty() }
    return ByteArray(parts.size) { parts[it].toInt(16).toByte() }
}

private val HEX = "0123456789ABCDEF".toCharArray()
