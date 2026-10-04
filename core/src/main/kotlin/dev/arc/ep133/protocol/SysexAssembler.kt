package dev.arc.ep133.protocol

import java.io.ByteArrayOutputStream

/**
 * Rebuilds complete SysEx messages (F0 … F7) from a raw MIDI byte stream.
 *
 * Android delivers incoming MIDI in arbitrary pieces (one USB packet, part of
 * one, or several), so a reply frame can arrive split across several onSend
 * calls. WebMIDI hands the web version whole messages; this restores that.
 *
 * - System realtime bytes (F8..FF) may appear anywhere and are skipped.
 * - Any other status byte inside a SysEx aborts it (MIDI 1.0 rule).
 * - Bytes outside a SysEx (notes, clock) are dropped: the session ignores them anyway.
 * - A SysEx longer than [maxSize] is discarded.
 */
class SysexAssembler(private val maxSize: Int = 1 shl 20, private val onMessage: (ByteArray) -> Unit) {
    private val buf = ByteArrayOutputStream()
    private var inSysex = false

    @Synchronized
    fun feed(data: ByteArray, offset: Int = 0, count: Int = data.size - offset) {
        for (i in offset until offset + count) {
            val b = data[i].toInt() and 0xFF
            when {
                b >= 0xF8 -> Unit // realtime: never part of a message
                b == 0xF0 -> {
                    buf.reset()
                    buf.write(b)
                    inSysex = true
                }
                b == 0xF7 -> if (inSysex) {
                    buf.write(b)
                    inSysex = false
                    val msg = buf.toByteArray()
                    buf.reset()
                    onMessage(msg)
                }
                b >= 0x80 -> if (inSysex) {
                    inSysex = false
                    buf.reset()
                }
                else -> if (inSysex) {
                    if (buf.size() >= maxSize) {
                        inSysex = false
                        buf.reset()
                    } else {
                        buf.write(b)
                    }
                }
            }
        }
    }

    @Synchronized
    fun reset() {
        inSysex = false
        buf.reset()
    }
}
