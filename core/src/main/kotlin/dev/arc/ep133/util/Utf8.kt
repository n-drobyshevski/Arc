package dev.arc.ep133.util

import java.nio.ByteBuffer
import java.nio.CharBuffer
import java.nio.charset.CodingErrorAction

// `new TextDecoder().decode(bytes)` / `new TextEncoder().encode(text)`.

/**
 * UTF-8 decode like the WHATWG TextDecoder: one leading BOM is dropped and
 * malformed input becomes U+FFFD. (The exact number of U+FFFD for a malformed
 * sequence can differ from a browser; that only affects how broken text looks.)
 */
fun decodeUtf8(b: ByteArray): String {
    val start = if (b.size >= 3 && b[0] == 0xEF.toByte() && b[1] == 0xBB.toByte() && b[2] == 0xBF.toByte()) 3 else 0
    val dec = Charsets.UTF_8.newDecoder()
        .onMalformedInput(CodingErrorAction.REPLACE)
        .onUnmappableCharacter(CodingErrorAction.REPLACE)
        .replaceWith("�")
    return dec.decode(ByteBuffer.wrap(b, start, b.size - start)).toString()
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
