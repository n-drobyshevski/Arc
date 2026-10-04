package dev.arc.ep133.protocol

import dev.arc.ep133.util.decodeUtf8
import dev.arc.ep133.util.jsTrim
import dev.arc.ep133.util.sub
import dev.arc.ep133.util.u8

// TE SysEx framing (frame.js).
//
//   F0 00 20 76 <device> 40 <b6> <b7> <command> [status] <packed payload> F7
//
// b6 = 0x40 (is request) | 0x20 (request id present) | request id bits 7..11
// b7 = request id bits 0..6
// Responses clear 0x40 and carry a status byte before the payload.
// Frames with b6 == 0x40 (request flag, no id) are unsolicited device pushes.

val TE_MFG = intArrayOf(0x00, 0x20, 0x76)
const val MIDI_SYSEX_TE = 0x40
const val BIT_IS_REQUEST = 0x40
const val BIT_REQUEST_ID = 0x20

object Cmd {
    const val GREET = 1
    const val FILE = 5
}

object Status {
    const val OK = 0
    const val ERROR = 1
    const val NOT_FOUND = 2
    const val BAD_REQUEST = 3
    const val SPECIFIC_ERROR_START = 16
    const val SPECIFIC_SUCCESS_START = 64
}

/** MIDI universal identity request. */
val IDENTITY_REQUEST: ByteArray get() = byteArrayOf(0xF0.toByte(), 0x7E, 0x7F, 0x06, 0x01, 0xF7.toByte())

const val DEFAULT_DEVICE_ID = 0x33 // EP-133

/** A decoded TE frame. All numbers are unsigned. [status] is -1 for requests, [requestId] -1 without an id. */
class Frame(
    val deviceId: Int,
    val isRequest: Boolean,
    val hasId: Boolean,
    val requestId: Int,
    val command: Int,
    val status: Int,
    val payload: ByteArray,
)

data class Identity(val deviceId: Int, val sku: String)

object FrameCodec {
    /**
     * Every request carries a 12 bit request id split over bytes 6 and 7;
     * replies are matched back to their request by that id.
     */
    fun encodeRequest(deviceId: Int, requestId: Int, command: Int, payload: ByteArray = ByteArray(0)): ByteArray {
        val packed = Packed7.pack(payload)
        val out = ByteArray(10 + packed.size)
        out[0] = 0xF0.toByte()
        out[1] = TE_MFG[0].toByte()
        out[2] = TE_MFG[1].toByte()
        out[3] = TE_MFG[2].toByte()
        out[4] = (deviceId and 0x7F).toByte()
        out[5] = MIDI_SYSEX_TE.toByte()
        out[6] = (BIT_IS_REQUEST or BIT_REQUEST_ID or ((requestId shr 7) and 0x1F)).toByte()
        out[7] = (requestId and 0x7F).toByte()
        out[8] = (command and 0x7F).toByte()
        packed.copyInto(out, 9)
        out[out.size - 1] = 0xF7.toByte()
        return out
    }

    fun isTeFrame(d: ByteArray): Boolean =
        d.size >= 9 &&
            d.u8(0) == 0xF0 &&
            d.u8(1) == TE_MFG[0] &&
            d.u8(2) == TE_MFG[1] &&
            d.u8(3) == TE_MFG[2] &&
            d.u8(5) == MIDI_SYSEX_TE &&
            d.u8(d.size - 1) == 0xF7

    /** Decode any TE frame (request, response or push). Returns null for anything else. */
    fun decodeFrame(d: ByteArray): Frame? {
        if (!isTeFrame(d)) return null
        val isRequest = d.u8(6) and BIT_IS_REQUEST != 0
        val hasId = d.u8(6) and BIT_REQUEST_ID != 0
        val requestId = if (hasId) ((d.u8(6) and 0x1F) shl 7) or (d.u8(7) and 0x7F) else -1
        val command = d.u8(8)
        var i = 9
        var status = -1
        if (!isRequest) {
            if (d.size < 11) return null
            status = d.u8(i++)
        }
        val payload = Packed7.unpack(d.sub(i, d.size - 1))
        return Frame(d.u8(4), isRequest, hasId, requestId, command, status, payload)
    }

    /** Universal identity reply: F0 7E <dev> 06 02 00 20 76 <family×2> <model×2> <ver×4> F7 */
    fun parseIdentity(d: ByteArray): Identity? {
        if (d.size < 13 || d.u8(0) != 0xF0 || d.u8(1) != 0x7E || d.u8(3) != 0x06 || d.u8(4) != 0x02) return null
        if (d.u8(5) != TE_MFG[0] || d.u8(6) != TE_MFG[1] || d.u8(7) != TE_MFG[2]) return null
        val product = d.u8(8) or (d.u8(9) shl 7)
        val assembly = d.u8(10) or (d.u8(11) shl 7)
        return Identity(
            deviceId = d.u8(2),
            sku = "TE${product.toString().padStart(3, '0')}AS${assembly.toString().padStart(3, '0')}",
        )
    }

    /** GREET reply text: "product:EP-133;mode:normal;sku:TE032AS001;os_version:2.0.5;..." */
    fun parseGreet(text: String): Map<String, String> {
        val out = LinkedHashMap<String, String>()
        for (part in text.replace("\u0000", "").split(';')) {
            val i = part.indexOf(':')
            if (i > 0) out[part.substring(0, i).jsTrim()] = part.substring(i + 1).jsTrim()
        }
        return out
    }

    fun statusText(status: Int): String = when {
        status == Status.OK -> "ok"
        status == Status.ERROR -> "error"
        status == Status.NOT_FOUND -> "command not found"
        status == Status.BAD_REQUEST -> "bad request"
        status >= Status.SPECIFIC_SUCCESS_START -> "in progress"
        status >= Status.SPECIFIC_ERROR_START -> "device error $status"
        else -> "status $status"
    }
}

// Big-endian helpers. Payloads inside FILE commands are big-endian.
fun be16(v: Int): ByteArray = byteArrayOf((v shr 8).toByte(), v.toByte())
fun be32(v: Long): ByteArray = byteArrayOf((v ushr 24).toByte(), (v ushr 16).toByte(), (v ushr 8).toByte(), v.toByte())
fun be32(v: Int): ByteArray = be32(v.toLong())
fun readBe16(d: ByteArray, at: Int): Int = (d.u8(at) shl 8) or d.u8(at + 1)
/** Unsigned 32-bit; a Long so sizes of 2 GiB and up stay positive. */
fun readBe32(d: ByteArray, at: Int): Long =
    (d.u8(at).toLong() shl 24) + (d.u8(at + 1) shl 16) + (d.u8(at + 2) shl 8) + d.u8(at + 3)

// Download page numbers are 14-bit little-endian (two 7-bit bytes).
fun u14le(v: Int): ByteArray = byteArrayOf((v and 0x7F).toByte(), ((v shr 7) and 0x7F).toByte())
fun readU14le(d: ByteArray, at: Int): Int = (d.u8(at) and 0x7F) or ((d.u8(at + 1) and 0x7F) shl 7)

/** NUL-terminated UTF-8 string. `next` is end + 1 even without a terminator (then size + 1). */
fun readCString(d: ByteArray, at: Int): Pair<String, Int> {
    var end = at
    while (end < d.size && d[end].toInt() != 0) end++
    return decodeUtf8(d.sub(at, end)) to end + 1
}
