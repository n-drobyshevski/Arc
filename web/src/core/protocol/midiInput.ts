// Port of core/src/main/kotlin/dev/arc/ep133/protocol/MidiInput.kt
//
// Parses the non-SysEx part of an incoming MIDI byte stream, for the live mirror.
// SysEx goes to the session; its bytes are skipped here.
//
// - Running status is kept, so a note-on status followed by several note pairs
//   gives several notes (OS 2.0.1 turned running status on for TRS MIDI out).
// - Real-time bytes (F8..FF) may arrive anywhere, even inside another message,
//   and never disturb it.
// - A note-on with velocity 0 is a note-off, as in the MIDI specification.
// - Messages the mirror does not use (pressure, pitch bend, program change,
//   system common) are parsed for their length and dropped.
//
// Web delta: event `time` is in milliseconds (MIDIMessageEvent.timeStamp /
// performance.now()), where the Kotlin uses nanoseconds.

/** A MIDI message the live mirror cares about. `time` is the receiver's timestamp in ms. Channels are 1..16. */
export type MidiEvent =
  | { type: 'NoteOn'; channel: number; note: number; velocity: number; time: number }
  | { type: 'NoteOff'; channel: number; note: number; time: number }
  | { type: 'ControlChange'; channel: number; controller: number; value: number; time: number }
  | { type: 'Clock'; time: number }
  | { type: 'Start'; time: number }
  | { type: 'Continue'; time: number }
  | { type: 'Stop'; time: number }

export class MidiInput {
  private readonly emit: (e: MidiEvent) => void
  private status = 0
  private readonly data: [number, number] = [0, 0]
  private count = 0
  private inSysex = false

  constructor(emit: (e: MidiEvent) => void) {
    this.emit = emit
  }

  /** Feeds [bytes], all stamped with [timeMs]. */
  feed(bytes: Uint8Array | ArrayLike<number>, timeMs = 0, offset = 0, length: number = bytes.length - offset): void {
    for (let i = offset; i < offset + length; i++) {
      const b = i >= 0 && i < bytes.length ? bytes[i] : undefined
      // Kotlin indexes the ByteArray directly and throws past either end.
      if (b === undefined) throw new RangeError(`Index ${i} out of bounds for length ${bytes.length}`)
      this.feedByte(b & 0xff, timeMs)
    }
  }

  private feedByte(b: number, time: number): void {
    if (b >= 0xf8) {
      switch (b) {
        case 0xf8:
          this.emit({ type: 'Clock', time })
          break
        case 0xfa:
          this.emit({ type: 'Start', time })
          break
        case 0xfb:
          this.emit({ type: 'Continue', time })
          break
        case 0xfc:
          this.emit({ type: 'Stop', time })
          break
      }
      return
    }
    if (b === 0xf0) {
      this.inSysex = true
      this.status = 0
      return
    }
    if (b === 0xf7) {
      this.inSysex = false
      return
    }
    if (b >= 0x80) {
      // Any other status byte ends a SysEx (as the assembler does) and starts a
      // message. A system common status (F1..F6) also cancels running status;
      // its data bytes are dropped below.
      this.inSysex = false
      this.status = b
      this.count = 0
      return
    }
    if (this.inSysex || this.status === 0) return
    // Data of a system common message (song position, song select, MTC): not used.
    if (this.status >= 0xf0) return
    this.data[this.count++] = b
    if (this.count < dataLength(this.status)) return
    this.count = 0 // running status: the next data bytes start a new message with the same status
    const channel = (this.status & 0x0f) + 1
    const [d0, d1] = this.data
    switch (this.status & 0xf0) {
      case 0x90:
        this.emit(
          d1 === 0
            ? { type: 'NoteOff', channel, note: d0, time }
            : { type: 'NoteOn', channel, note: d0, velocity: d1, time },
        )
        break
      case 0x80:
        this.emit({ type: 'NoteOff', channel, note: d0, time })
        break
      case 0xb0:
        this.emit({ type: 'ControlChange', channel, controller: d0, value: d1, time })
        break
    }
  }
}

function dataLength(status: number): number {
  const kind = status & 0xf0
  return kind === 0xc0 || kind === 0xd0 ? 1 : 2
}
