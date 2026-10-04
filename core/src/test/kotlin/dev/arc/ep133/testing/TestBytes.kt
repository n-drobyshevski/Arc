package dev.arc.ep133.testing

import dev.arc.ep133.util.encodeUtf8
import dev.arc.ep133.util.hexBytes
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Helpers shared by the ported JS tests. */
fun hex(s: String): ByteArray = hexBytes(s)

/** `noise(n)` from e2e.test.js: (i * 31 + 7) & 0xff. */
fun noise(n: Int): ByteArray = ByteArray(n) { ((it * 31 + 7) and 0xFF).toByte() }

/** `pad(slot)` / `padRecord(slot)`: a 26-byte pad record with the slot little-endian in bytes 1..2. */
fun pad(slot: Int): ByteArray = ByteArray(26).also {
    it[1] = (slot and 0xFF).toByte()
    it[2] = (slot shr 8).toByte()
}

/** `tarFile(entries)` from the JS tests: ustar headers with name, octal size and type '0'. */
fun tarFile(entries: List<Pair<String, ByteArray>>): ByteArray {
    val out = ByteArrayOutputStream()
    for ((name, data) in entries) {
        val h = ByteArray(512)
        encodeUtf8(name).copyInto(h, 0)
        encodeUtf8(data.size.toString(8).padStart(11, '0')).copyInto(h, 124)
        h[156] = 48
        out.write(h)
        out.write(data)
        out.write(ByteArray((512 - (data.size % 512)) % 512))
    }
    out.write(ByteArray(1024))
    return out.toByteArray()
}

/** Int16 samples to little-endian bytes (`new Uint8Array(new Int16Array(...).buffer)`). */
fun s16(vararg samples: Int): ByteArray {
    val b = ByteBuffer.allocate(samples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
    for (s in samples) b.putShort(s.toShort())
    return b.array()
}
