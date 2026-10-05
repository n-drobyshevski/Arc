package dev.arc.ep133.midi

import android.media.midi.MidiDevice
import android.media.midi.MidiInputPort
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.util.Log
import dev.arc.ep133.protocol.MidiEvent
import dev.arc.ep133.protocol.MidiInput
import dev.arc.ep133.protocol.SysexAssembler
import dev.arc.ep133.protocol.Transport
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import java.io.IOException

/**
 * [Transport] over android.media.midi.
 *
 * Naming on Android is from the device's point of view: we send into the
 * device's [MidiInputPort] and receive from its [MidiOutputPort].
 */
class MidiTransport(
    private val device: MidiDevice,
    private val input: MidiInputPort,
    private val output: MidiOutputPort,
) : Transport {
    private val inbox = Channel<ByteArray>(Channel.UNLIMITED)

    // Incoming SysEx can arrive split across several onSend calls; reassemble F0..F7 first.
    private val assembler = SysexAssembler { inbox.trySend(it) }

    private val _events = MutableSharedFlow<MidiEvent>(extraBufferCapacity = 512, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    /**
     * Notes, clock and transport from the device, for the live mirror (an
     * addition to the web version). Parsed beside the SysEx assembler from the
     * same bytes, so the SysEx path is unchanged. Nobody listening costs nothing;
     * a slow listener loses the oldest events rather than holding up MIDI.
     */
    val events: SharedFlow<MidiEvent> = _events.asSharedFlow()

    private val midiInput = MidiInput { _events.tryEmit(it) }

    private val receiver = object : MidiReceiver() {
        override fun onSend(msg: ByteArray, offset: Int, count: Int, timestamp: Long) {
            // The buffer is reused by the framework, so the assembler copies what it keeps.
            assembler.feed(msg, offset, count)
            // Android's timestamps are System.nanoTime based.
            midiInput.feed(msg, offset, count, timestamp)
        }
    }

    @Volatile
    private var closed = false

    init {
        output.connect(receiver)
    }

    override val incoming: Flow<ByteArray> = inbox.receiveAsFlow()

    /** Each frame goes out in a single send() call. */
    override fun send(bytes: ByteArray) {
        if (closed) {
            Log.w(TAG, "send after close ignored")
            return
        }
        if (bytes.size > input.maxMessageSize) {
            // Would be split by the framework; our largest frame (an upload chunk) is 510 bytes.
            Log.w(TAG, "frame of ${bytes.size} bytes exceeds maxMessageSize ${input.maxMessageSize}")
        }
        try {
            input.send(bytes, 0, bytes.size)
        } catch (e: IOException) {
            throw IOException("Could not send to the EP-133: ${e.message}", e)
        }
    }

    override fun close() {
        if (closed) return
        closed = true
        runCatching { output.disconnect(receiver) }
        runCatching { output.close() }
        runCatching { input.close() }
        runCatching { device.close() }
        inbox.close()
    }

    private companion object {
        const val TAG = "arc.midi"
    }
}
