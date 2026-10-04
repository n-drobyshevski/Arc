package dev.arc.ep133.formats

import dev.arc.ep133.util.decodeUtf8
import dev.arc.ep133.util.encodeUtf8
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.time.Instant
import java.time.ZoneId
import java.util.zip.Deflater
import java.util.zip.Inflater

/** One file inside a .pak. [path] keeps the leading "/" that the Sample Tool layout uses. */
class ZipEntryData(val path: String, val data: ByteArray, val compress: Boolean = true)

/**
 * Small ZIP reader/writer (store + deflate), byte-compatible with zip.js.
 *
 * Written by hand on top of java.util.zip's Deflater, Inflater and CRC32
 * rather than ZipOutputStream, because the .pak layout must match the web
 * version: UTF-8 flag (0x0800) on every entry, no data descriptors, no extra
 * fields, version 20, and names with a leading "/".
 */
object Zip {
    private const val LOCAL_SIG = 0x04034B50L
    private const val CENTRAL_SIG = 0x02014B50L
    private const val END_SIG = 0x06054B50L

    /** MS-DOS time and date fields, in the local time of [zone] (like the JS Date getters). */
    fun dosTime(epochMs: Long, zone: ZoneId): Pair<Int, Int> {
        val d = Instant.ofEpochMilli(epochMs).atZone(zone)
        val time = (d.hour shl 11) or (d.minute shl 5) or (d.second shr 1)
        val date = ((d.year - 1980) shl 9) or (d.monthValue shl 5) or d.dayOfMonth
        return (time and 0xFFFF) to (date and 0xFFFF)
    }

    fun deflateRaw(data: ByteArray): ByteArray {
        val d = Deflater(Deflater.DEFAULT_COMPRESSION, true)
        try {
            d.setInput(data)
            d.finish()
            val out = ByteArrayOutputStream(maxOf(64, data.size / 2))
            val buf = ByteArray(64 * 1024)
            while (!d.finished()) {
                val n = d.deflate(buf)
                out.write(buf, 0, n)
            }
            return out.toByteArray()
        } finally {
            d.end()
        }
    }

    fun inflateRaw(raw: ByteArray, name: String): ByteArray {
        val inf = Inflater(true)
        try {
            // With nowrap, zlib may need one extra input byte to finish (see Inflater docs).
            inf.setInput(raw + 0)
            val out = ByteArrayOutputStream(maxOf(64, raw.size * 3))
            val buf = ByteArray(64 * 1024)
            while (!inf.finished()) {
                val n = try {
                    inf.inflate(buf)
                } catch (e: java.util.zip.DataFormatException) {
                    throw IllegalArgumentException("Damaged data in $name")
                }
                if (n == 0 && (inf.needsInput() || inf.needsDictionary())) throw IllegalArgumentException("Damaged data in $name")
                out.write(buf, 0, n)
            }
            return out.toByteArray()
        } finally {
            inf.end()
        }
    }

    fun write(entries: List<ZipEntryData>, dateMs: Long, zone: ZoneId = ZoneId.systemDefault()): ByteArray {
        val out = ByteArrayOutputStream()
        write(entries, dateMs, zone, out)
        return out.toByteArray()
    }

    fun write(entries: List<ZipEntryData>, dateMs: Long, zone: ZoneId, out: OutputStream) {
        val (time, day) = dosTime(dateMs, zone)
        val central = ByteArrayOutputStream()
        var offset = 0L
        for (e in entries) {
            val name = encodeUtf8(e.path)
            val crc = Crc32.of(e.data)
            var method = 0
            var body = e.data
            if (e.compress && e.data.size > 64) {
                val z = deflateRaw(e.data)
                // Only keep the deflated form when it saves at least 5%.
                if (z.size < e.data.size * 0.95) {
                    method = 8
                    body = z
                }
            }
            val local = Le(30 + name.size)
            local.u32(LOCAL_SIG).u16(20).u16(0x0800).u16(method).u16(time).u16(day)
                .u32(crc).u32(body.size.toLong()).u32(e.data.size.toLong()).u16(name.size).u16(0)
            local.bytes(name)

            val cen = Le(46 + name.size)
            cen.u32(CENTRAL_SIG).u16(20).u16(20).u16(0x0800).u16(method).u16(time).u16(day)
                .u32(crc).u32(body.size.toLong()).u32(e.data.size.toLong()).u16(name.size)
                .u16(0).u16(0).u16(0).u16(0).u32(0).u32(offset)
            cen.bytes(name)

            out.write(local.buf)
            out.write(body)
            central.write(cen.buf)
            offset += local.buf.size + body.size
        }
        val cenBytes = central.toByteArray()
        val end = Le(22)
        end.u32(END_SIG).u16(0).u16(0).u16(entries.size).u16(entries.size)
            .u32(cenBytes.size.toLong()).u32(offset).u16(0)
        out.write(cenBytes)
        out.write(end.buf)
    }

    /**
     * Reads a zip into path → bytes, in central directory order. Any leading
     * "/" is removed from the keys; directory entries are skipped. A repeated
     * name keeps its first position and the last data (like a JS Map).
     */
    fun read(buf: ByteArray): LinkedHashMap<String, ByteArray> {
        val r = LeReader(buf)
        var eocd = -1
        var i = buf.size - 22
        val stop = maxOf(0, buf.size - 65557)
        while (i >= stop) {
            if (r.u32(i) == END_SIG) {
                eocd = i
                break
            }
            i--
        }
        if (eocd < 0) throw IllegalArgumentException("Not a .pak / zip file")
        val count = r.u16(eocd + 10)
        var p = r.u32(eocd + 16).toInt()
        val out = LinkedHashMap<String, ByteArray>()
        for (n in 0 until count) {
            if (r.u32(p) != CENTRAL_SIG) throw IllegalArgumentException("Damaged zip directory")
            val method = r.u16(p + 10)
            val csize = r.u32(p + 20)
            val nameLen = r.u16(p + 28)
            val extraLen = r.u16(p + 30)
            val commentLen = r.u16(p + 32)
            val localAt = r.u32(p + 42).toInt()
            val name = decodeUtf8(r.slice(p + 46, p + 46 + nameLen))
            p += 46 + nameLen + extraLen + commentLen
            if (name.endsWith("/")) continue
            val lNameLen = r.u16(localAt + 26)
            val lExtraLen = r.u16(localAt + 28)
            val start = localAt + 30 + lNameLen + lExtraLen
            val raw = r.slice(start, (start + csize).coerceAtMost(Int.MAX_VALUE.toLong()).toInt())
            val data = when (method) {
                0 -> raw
                8 -> inflateRaw(raw, name)
                else -> throw IllegalArgumentException("Unsupported compression in $name")
            }
            out[name.trimStart('/')] = data
        }
        return out
    }

    private class Le(size: Int) {
        val buf = ByteArray(size)
        private var o = 0
        fun u16(v: Int) = apply {
            buf[o++] = v.toByte()
            buf[o++] = (v shr 8).toByte()
        }
        fun u32(v: Long) = apply {
            for (k in 0 until 4) buf[o++] = (v ushr (8 * k)).toByte()
        }
        fun bytes(b: ByteArray) = apply {
            b.copyInto(buf, o)
            o += b.size
        }
    }

    /** Little-endian reads that fail like DataView does when outside the buffer. */
    private class LeReader(val b: ByteArray) {
        private fun check(at: Int, n: Int) {
            if (at < 0 || at + n > b.size) throw IllegalArgumentException("Damaged zip file")
        }
        fun u16(at: Int): Int {
            check(at, 2)
            return (b[at].toInt() and 0xFF) or ((b[at + 1].toInt() and 0xFF) shl 8)
        }
        fun u32(at: Int): Long {
            check(at, 4)
            var v = 0L
            for (k in 0 until 4) v = v or ((b[at + k].toLong() and 0xFF) shl (8 * k))
            return v
        }
        /** subarray(): clamps instead of failing. */
        fun slice(from: Int, to: Int): ByteArray {
            val a = from.coerceIn(0, b.size)
            val z = to.coerceIn(0, b.size)
            return if (z <= a) ByteArray(0) else b.copyOfRange(a, z)
        }
    }
}
