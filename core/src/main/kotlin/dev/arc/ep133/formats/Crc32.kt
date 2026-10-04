package dev.arc.ep133.formats

import java.util.zip.CRC32

/** Standard CRC-32 (crc32.js), the same polynomial java.util.zip uses. */
object Crc32 {
    fun of(data: ByteArray, from: Int = 0, len: Int = data.size - from): Long {
        val c = CRC32()
        c.update(data, from, len)
        return c.value
    }
}
