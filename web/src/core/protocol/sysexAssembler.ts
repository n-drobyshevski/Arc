// Port of core/src/main/kotlin/dev/arc/ep133/protocol/SysexAssembler.kt
//
// Rebuilds complete SysEx messages (F0 … F7) from a raw MIDI byte stream.
//
// Android delivers incoming MIDI in arbitrary pieces. WebMIDI already hands over
// whole messages, so on the web this is a defensive normaliser (or for a future
// byte-stream transport such as WebUSB/WebSerial).
//
// - System realtime bytes (F8..FF) may appear anywhere and are skipped.
// - Any other status byte inside a SysEx aborts it (MIDI 1.0 rule).
// - Bytes outside a SysEx (notes, clock) are dropped: the session ignores them anyway.
// - A SysEx longer than maxSize is discarded.

export class SysexAssembler {
  private readonly maxSize: number
  private readonly onMessage: (msg: Uint8Array) => void
  private buf: Uint8Array = new Uint8Array(256)
  private len = 0
  private inSysex = false

  constructor(onMessage: (msg: Uint8Array) => void, maxSize: number = 1 << 20) {
    this.onMessage = onMessage
    this.maxSize = maxSize
  }

  feed(data: Uint8Array, offset = 0, count: number = data.length - offset): void {
    for (let i = offset; i < offset + count; i++) {
      const b = data[i]
      // Kotlin indexes the ByteArray directly and throws past either end.
      if (b === undefined) throw new RangeError(`Index ${i} out of bounds for length ${data.length}`)
      if (b >= 0xf8) {
        // realtime: never part of a message
      } else if (b === 0xf0) {
        this.len = 0
        this.write(b)
        this.inSysex = true
      } else if (b === 0xf7) {
        if (this.inSysex) {
          this.write(b)
          this.inSysex = false
          const msg = this.buf.slice(0, this.len)
          this.len = 0
          this.onMessage(msg)
        }
      } else if (b >= 0x80) {
        if (this.inSysex) {
          this.inSysex = false
          this.len = 0
        }
      } else if (this.inSysex) {
        if (this.len >= this.maxSize) {
          this.inSysex = false
          this.len = 0
        } else {
          this.write(b)
        }
      }
    }
  }

  reset(): void {
    this.inSysex = false
    this.len = 0
  }

  private write(b: number): void {
    if (this.len === this.buf.length) {
      const bigger = new Uint8Array(this.buf.length * 2)
      bigger.set(this.buf)
      this.buf = bigger
    }
    this.buf[this.len++] = b
  }
}
