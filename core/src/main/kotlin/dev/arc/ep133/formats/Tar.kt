package dev.arc.ep133.formats

import dev.arc.ep133.util.JS_DOT
import dev.arc.ep133.util.jsTrim

/** Read-only ustar parsing, just enough to see which sample slots a project uses (tar.js). */
object Tar {
    fun read(data: ByteArray): LinkedHashMap<String, ByteArray> {
        val out = LinkedHashMap<String, ByteArray>()
        var off = 0L
        fun field(h: ByteArray, s: Int, l: Int): String {
            val sb = StringBuilder()
            var i = s
            while (i < s + l && h[i].toInt() != 0) {
                sb.append((h[i].toInt() and 0xFF).toChar())
                i++
            }
            return sb.toString()
        }
        while (off + 512 <= data.size) {
            val h = data.copyOfRange(off.toInt(), off.toInt() + 512)
            off += 512
            if (h.all { it.toInt() == 0 }) break
            val prefix = field(h, 345, 155)
            val base = field(h, 0, 100)
            val name = (if (prefix.isNotEmpty()) "$prefix/$base" else base).removePrefix("./")
            val size = parseOctal(field(h, 124, 12).jsTrim().ifEmpty { "0" })
            // Deviation (agreed): a negative size moves `off` backwards and the JS
            // loops forever on a crafted file; stop reading instead.
            if (size < 0) break
            // h[156] || 48: a NUL type byte reads as '0', so the '\0' test never fires.
            val type = (if (h[156].toInt() == 0) 48 else h[156].toInt() and 0xFF).toChar()
            if (type == '0' || type == '\u0000') {
                val from = off.coerceAtMost(data.size.toLong()).toInt()
                val to = (off + size).coerceAtMost(data.size.toLong()).toInt()
                out[name] = if (to > from) data.copyOfRange(from, to) else ByteArray(0)
            }
            off += ((size + 511) / 512) * 512
        }
        return out
    }

    /** `parseInt(s, 8) || 0`: optional sign, then leading octal digits; no digits means 0. */
    private fun parseOctal(s: String): Long {
        var i = 0
        var neg = false
        if (i < s.length && (s[i] == '+' || s[i] == '-')) {
            neg = s[i] == '-'
            i++
        }
        var v = 0L
        var any = false
        while (i < s.length && s[i] in '0'..'7' && v < (1L shl 56)) {
            v = v * 8 + (s[i] - '0')
            any = true
            i++
        }
        if (!any) return 0
        return if (neg) -v else v
    }

    // /(^|\/)pads\/.+\/p\d+$/ with JS meanings of `.`, `\d` and `$`. The groups
    // (pad group and pad number) are only read by ProjectPads; matching is unchanged.
    internal val PAD = Regex("(?:^|/)pads/($JS_DOT+)/p([0-9]+)\\z")

    /** Sample slots (1..999) referenced by pads in a project TAR. */
    fun slotsUsedByProject(tar: ByteArray): List<Int> {
        val slots = sortedSetOf<Int>()
        try {
            for ((name, rec) in read(tar)) {
                if (!PAD.containsMatchIn(name) || rec.size < 3) continue
                val slot = (rec[1].toInt() and 0xFF) or ((rec[2].toInt() and 0xFF) shl 8)
                if (slot in 1..999) slots.add(slot)
            }
        } catch (_: Exception) {
            // Unknown layout; caller treats as "no information".
        }
        return slots.toList()
    }
}
