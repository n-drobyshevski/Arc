package dev.arc.ep133.testing

import dev.arc.ep133.protocol.FrameCodec
import dev.arc.ep133.protocol.Packed7
import dev.arc.ep133.protocol.Transport
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlin.random.Random

/** A TE response frame, as the device (and mock-device.js reply()) builds it. */
fun responseFrame(deviceId: Int, requestId: Int, command: Int, status: Int, payload: ByteArray = ByteArray(0)): ByteArray {
    val packed = Packed7.pack(payload)
    val out = ByteArray(11 + packed.size)
    out[0] = 0xF0.toByte(); out[1] = 0x00; out[2] = 0x20; out[3] = 0x76
    out[4] = deviceId.toByte()
    out[5] = 0x40
    out[6] = (0x20 or ((requestId shr 7) and 0x1F)).toByte()
    out[7] = (requestId and 0x7F).toByte()
    out[8] = command.toByte()
    out[9] = status.toByte()
    packed.copyInto(out, 10)
    out[out.size - 1] = 0xF7.toByte()
    return out
}

/** A transport whose device side is a script: [respond] runs (asynchronously) for every sent message. */
class ScriptedTransport(
    private val scope: CoroutineScope,
    private val respond: suspend ScriptedTransport.(ByteArray) -> Unit,
) : Transport {
    val sent = mutableListOf<ByteArray>()
    var closed = false
    private val ch = Channel<ByteArray>(Channel.UNLIMITED)
    override val incoming: Flow<ByteArray> = ch.receiveAsFlow()

    override fun send(bytes: ByteArray) {
        val copy = bytes.copyOf()
        sent += copy
        scope.launch { respond(copy) }
    }

    override fun close() {
        closed = true
    }

    fun emit(b: ByteArray) {
        ch.trySend(b)
    }

    fun reply(req: ByteArray, status: Int, payload: ByteArray = ByteArray(0)) {
        val f = FrameCodec.decodeFrame(req)!!
        emit(responseFrame(0x33, f.requestId, f.command, status, payload))
    }
}

/** A Random whose nextInt(until) returns a fixed value (to pin the first request id). */
class FixedRandom(private val value: Int) : Random() {
    override fun nextBits(bitCount: Int): Int = value
    override fun nextInt(until: Int): Int = value
}
