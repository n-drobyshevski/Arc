package dev.arc.ep133.protocol

/** A MIDI message the live mirror cares about. [time] is the receiver's timestamp in nanoseconds. */
sealed interface MidiEvent {
    val time: Long

    data class NoteOn(val channel: Int, val note: Int, val velocity: Int, override val time: Long) : MidiEvent
    data class NoteOff(val channel: Int, val note: Int, override val time: Long) : MidiEvent
    data class ControlChange(val channel: Int, val controller: Int, val value: Int, override val time: Long) : MidiEvent
    data class Clock(override val time: Long) : MidiEvent
    data class Start(override val time: Long) : MidiEvent
    data class Continue(override val time: Long) : MidiEvent
    data class Stop(override val time: Long) : MidiEvent
}

/**
 * Parses the non-SysEx part of an incoming MIDI byte stream (an addition to
 * the web version, for the live mirror). SysEx stays the SysexAssembler's
 * job: its bytes are skipped here.
 *
 * - Running status is kept, so a note-on status followed by several note
 *   pairs gives several notes (the guide's OS 2.0.1 notes turned running
 *   status on for TRS MIDI out).
 * - Real-time bytes (F8..FF) may arrive anywhere, even inside another
 *   message, and never disturb it.
 * - A note-on with velocity 0 is a note-off, as in the MIDI specification.
 * - Messages the mirror does not use (pressure, pitch bend, program change,
 *   system common) are parsed for their length and dropped.
 */
class MidiInput(private val emit: (MidiEvent) -> Unit) {
    private var status = 0
    private val data = IntArray(2)
    private var count = 0
    private var inSysex = false

    @Synchronized
    fun feed(bytes: ByteArray, offset: Int = 0, length: Int = bytes.size - offset, time: Long = 0L) {
        for (i in offset until offset + length) feedByte(bytes[i].toInt() and 0xFF, time)
    }

    private fun feedByte(b: Int, time: Long) {
        if (b >= 0xF8) {
            when (b) {
                0xF8 -> emit(MidiEvent.Clock(time))
                0xFA -> emit(MidiEvent.Start(time))
                0xFB -> emit(MidiEvent.Continue(time))
                0xFC -> emit(MidiEvent.Stop(time))
            }
            return
        }
        if (b == 0xF0) {
            inSysex = true
            status = 0
            return
        }
        if (b == 0xF7) {
            inSysex = false
            return
        }
        if (b >= 0x80) {
            // Any other status byte ends a SysEx (as the assembler does) and starts a
            // message. A system common status (F1..F6) also cancels running status;
            // its data bytes are dropped below.
            inSysex = false
            status = b
            count = 0
            return
        }
        if (inSysex || status == 0) return
        if (status >= 0xF0) {
            // Data of a system common message (song position, song select, MTC): not used.
            return
        }
        data[count++] = b
        if (count < dataLength(status)) return
        count = 0 // running status: the next data bytes start a new message with the same status
        val ch = (status and 0x0F) + 1
        when (status and 0xF0) {
            0x90 -> emit(if (data[1] == 0) MidiEvent.NoteOff(ch, data[0], time) else MidiEvent.NoteOn(ch, data[0], data[1], time))
            0x80 -> emit(MidiEvent.NoteOff(ch, data[0], time))
            0xB0 -> emit(MidiEvent.ControlChange(ch, data[0], data[1], time))
        }
    }

    private fun dataLength(status: Int): Int = when (status and 0xF0) {
        0xC0, 0xD0 -> 1
        else -> 2
    }
}
