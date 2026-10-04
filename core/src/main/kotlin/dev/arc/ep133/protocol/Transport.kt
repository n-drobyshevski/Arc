package dev.arc.ep133.protocol

import kotlinx.coroutines.flow.Flow

/**
 * A MIDI-like byte pipe, the same shape session.js expects:
 * `send(bytes)` plus a stream of incoming messages.
 *
 * - [send] takes one complete SysEx message per call and must not deliver
 *   anything to [incoming] synchronously from inside the call.
 * - [incoming] is hot, ordered and lossless, one complete message per element.
 *   It has exactly one collector (the Session); logging wraps the transport
 *   instead of collecting it a second time.
 */
interface Transport {
    fun send(bytes: ByteArray)
    val incoming: Flow<ByteArray>
    fun close() {}
}
