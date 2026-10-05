// Port of core/src/main/kotlin/dev/arc/ep133/protocol/Transport.kt (+ reference/src/protocol/session.js)

/**
 * A MIDI-like byte pipe.
 *
 * - [send] takes one complete SysEx message per call and must not deliver
 *   anything to [onMessage] listeners synchronously from inside the call.
 * - Incoming messages are ordered and lossless, one complete message per
 *   callback. Only SysEx (`F0 ...`) should reach the Session.
 * - [onMessage] returns an unsubscribe function.
 */
export interface Transport {
  send(b: Uint8Array): void
  onMessage(cb: (b: Uint8Array) => void): () => void
  close?(): void
}
