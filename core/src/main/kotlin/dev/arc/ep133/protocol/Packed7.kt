package dev.arc.ep133.protocol

// 7-bit packing used inside TE SysEx frames (packed7.js).
// Every group of up to 7 data bytes is preceded by one byte that carries
// their high bits (bit n = high bit of the n-th byte in the group).

object Packed7 {
    fun packedLength(n: Int): Int = n + (n + 6) / 7

    fun pack(data: ByteArray): ByteArray {
        val out = ByteArray(packedLength(data.size))
        var o = 0
        var i = 0
        while (i < data.size) {
            val flagsAt = o++
            var flags = 0
            val end = minOf(i + 7, data.size)
            for (j in i until end) {
                val b = data[j].toInt() and 0xFF
                if (b and 0x80 != 0) flags = flags or (1 shl (j - i))
                out[o++] = (b and 0x7F).toByte()
            }
            out[flagsAt] = flags.toByte()
            i += 7
        }
        return out
    }

    /**
     * Inverse of [pack]. Like the JS it does no validation: data high bits are
     * masked off and a trailing lone flags byte yields nothing.
     */
    fun unpack(data: ByteArray): ByteArray {
        val out = ByteArray(maxOf(0, data.size - (data.size + 7) / 8))
        var o = 0
        var i = 0
        while (i < data.size) {
            val flags = data[i++].toInt() and 0xFF
            var bit = 0
            while (bit < 7 && i < data.size) {
                out[o++] = ((data[i].toInt() and 0x7F) or (((flags shr bit) and 1) shl 7)).toByte()
                bit++
                i++
            }
        }
        return if (o == out.size) out else out.copyOf(o)
    }
}
