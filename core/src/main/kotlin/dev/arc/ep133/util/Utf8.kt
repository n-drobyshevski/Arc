package dev.arc.ep133.util

import java.nio.CharBuffer
import java.nio.charset.CodingErrorAction

// `new TextDecoder().decode(bytes)` / `new TextEncoder().encode(text)`.

/**
 * UTF-8 decode exactly like the WHATWG TextDecoder: one leading BOM is
 * dropped, and every maximal invalid subpart becomes one U+FFFD (the Java and
 * Android decoders group some invalid sequences differently, which would
 * change names and error texts).
 */
fun decodeUtf8(b: ByteArray): String {
    var i = if (b.size >= 3 && b[0] == 0xEF.toByte() && b[1] == 0xBB.toByte() && b[2] == 0xBF.toByte()) 3 else 0
    val sb = StringBuilder(b.size)
    var cp = 0
    var needed = 0
    var seen = 0
    var lower = 0x80
    var upper = 0xBF
    while (i < b.size) {
        val byte = b[i].toInt() and 0xFF
        if (needed == 0) {
            when (byte) {
                in 0x00..0x7F -> sb.append(byte.toChar())
                in 0xC2..0xDF -> {
                    needed = 1
                    cp = byte and 0x1F
                }
                in 0xE0..0xEF -> {
                    if (byte == 0xE0) lower = 0xA0
                    if (byte == 0xED) upper = 0x9F
                    needed = 2
                    cp = byte and 0x0F
                }
                in 0xF0..0xF4 -> {
                    if (byte == 0xF0) lower = 0x90
                    if (byte == 0xF4) upper = 0x8F
                    needed = 3
                    cp = byte and 0x07
                }
                else -> sb.append('\uFFFD')
            }
            i++
            continue
        }
        if (byte < lower || byte > upper) {
            // Invalid continuation: emit U+FFFD and process this byte again as a lead byte.
            cp = 0
            needed = 0
            seen = 0
            lower = 0x80
            upper = 0xBF
            sb.append('\uFFFD')
            continue
        }
        lower = 0x80
        upper = 0xBF
        cp = (cp shl 6) or (byte and 0x3F)
        seen++
        i++
        if (seen == needed) {
            sb.appendCodePoint(cp)
            cp = 0
            needed = 0
            seen = 0
        }
    }
    if (needed != 0) sb.append('\uFFFD')
    return sb.toString()
}

/** UTF-8 encode like TextEncoder: a lone surrogate becomes U+FFFD (Java would write '?'). */
fun encodeUtf8(s: String): ByteArray {
    val enc = Charsets.UTF_8.newEncoder()
        .onMalformedInput(CodingErrorAction.REPLACE)
        .onUnmappableCharacter(CodingErrorAction.REPLACE)
        .replaceWith(byteArrayOf(0xEF.toByte(), 0xBF.toByte(), 0xBD.toByte()))
    val bb = enc.encode(CharBuffer.wrap(s))
    val out = ByteArray(bb.remaining())
    bb.get(out)
    return out
}

/** Length of [s] in UTF-8 bytes, as TextEncoder would produce. */
fun utf8Length(s: String): Int = encodeUtf8(s).size

/** `String.fromCharCode(...bytes)`: each byte becomes the char with the same code (ISO-8859-1). */
fun latin1(b: ByteArray, from: Int = 0, to: Int = b.size): String {
    val sb = StringBuilder((to - from).coerceAtLeast(0))
    for (i in from until to) sb.append((b[i].toInt() and 0xFF).toChar())
    return sb.toString()
}

/**
 * `new TextDecoder('latin1')`. The WHATWG Encoding standard maps the "latin1"
 * label to windows-1252, so 0x80..0x9F are the cp1252 punctuation characters
 * (the five undefined ones map to the C1 control with the same code).
 */
fun decodeWindows1252(b: ByteArray): String {
    val sb = StringBuilder(b.size)
    for (x in b) {
        val v = x.toInt() and 0xFF
        sb.append(if (v in 0x80..0x9F) CP1252_HIGH[v - 0x80] else v.toChar())
    }
    return sb.toString()
}

private val CP1252_HIGH = charArrayOf(
    '€', '\u0081', '‚', 'ƒ', '„', '…', '†', '‡',
    'ˆ', '‰', 'Š', '‹', 'Œ', '\u008D', 'Ž', '\u008F',
    '\u0090', '‘', '’', '“', '”', '•', '–', '—',
    '˜', '™', 'š', '›', 'œ', '\u009D', 'ž', 'Ÿ',
)
