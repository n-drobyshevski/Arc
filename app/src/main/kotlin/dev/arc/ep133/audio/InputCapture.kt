package dev.arc.ep133.audio

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioRecordingConfiguration
import android.media.AudioRouting
import android.media.AudioTimestamp
import android.media.MediaRecorder
import androidx.annotation.RequiresPermission
import dev.arc.ep133.features.FrameClock
import dev.arc.ep133.features.SampleInput
import dev.arc.ep133.features.SampleSource
import java.util.concurrent.locks.LockSupport

/**
 * SAMPLE's input from the phone's mic or the EP-133 over USB audio (an
 * addition): an [AudioRecord] of 16-bit PCM at [rate], read on a thread of
 * its own ("arc-sample-in", at audio priority) in 10 ms blocks into one
 * array, so it runs whichever of Live's outputs plays, and nothing of the
 * native engine changes. Each block goes to [onBlock] with its first frame,
 * counted from the first one read.
 *
 * The source is the rawest the phone offers: UNPROCESSED where it says it
 * supports it, else VOICE_RECOGNITION (no noise suppression or gain
 * control), else MIC. A [device] (the EP-133's USB input) is asked for as
 * the preferred one; Android routing the input away from it, as when it is
 * unplugged, loses the input. A stereo input the phone won't give opens
 * mono ([channels] says which).
 *
 * About every 100 ms the input's timestamp goes to [onClock], so a press can
 * be found among the frames ([FrameClock]); a phone that gives none gets an
 * estimate from the frames read. A failed read (the input died) or the
 * routing away ends the thread and goes to [onLost]; whether Android is
 * silencing the input (another app took the mic) goes to [onSilenced]. All
 * of them are called on the thread.
 *
 * It needs RECORD_AUDIO, which [start] checks first.
 */
class InputCapture(
    private val context: Context,
    private val device: AudioDeviceInfo?,
    override val rate: Int,
    channels: Int,
    private val onBlock: (pcm: ShortArray, frames: Int, at: Long) -> Unit,
    private val onClock: (FrameClock) -> Unit,
    private val onLost: (why: String) -> Unit,
    private val onSilenced: (Boolean) -> Unit = {},
) : SampleRecorder.Input {
    companion object {
        /** The rate the mic is recorded at, and the most a USB input is. */
        const val RATE = 48000

        /** Blocks a second: 10 ms each. */
        const val BLOCKS_PER_SECOND = 100

        /** The buffer Android holds for the thread, in blocks: room for it to be late a little. */
        const val BUFFER_BLOCKS = 8

        /**
         * How long [close] waits for the thread to let go of the record: a
         * stopped read returns at once, so only an input that hangs takes
         * this long.
         */
        const val CLOSE_WAIT_MS = 500L

        const val NO_PERMISSION = "arc may not use the microphone"
        const val NO_INPUT = "the phone has no input that records at this rate"
        const val IN_USE = "another app is using the input"
        const val ROUTED_AWAY = "the input went away"
        const val DIED = "the input stopped"

        /**
         * The audio sources to try, best first: UNPROCESSED when the phone
         * says it supports it ([unprocessed]), then VOICE_RECOGNITION, then MIC.
         */
        fun sources(unprocessed: Boolean): List<Int> = buildList {
            if (unprocessed) add(MediaRecorder.AudioSource.UNPROCESSED)
            add(MediaRecorder.AudioSource.VOICE_RECOGNITION)
            add(MediaRecorder.AudioSource.MIC)
        }

        /**
         * The rate to record a device offering [rates] at: the highest up to
         * [RATE] (the EP-133 keeps 46875 Hz), any rate at all reading as
         * [RATE]; the lowest offered when all are higher.
         */
        fun bestRate(rates: IntArray): Int {
            if (rates.isEmpty()) return RATE
            return rates.filter { it <= RATE }.maxOrNull() ?: rates.min()
        }

        /** The rate to record [device] at: [RATE] for the phone's mic. */
        fun rateFor(device: AudioDeviceInfo?): Int = if (device == null) RATE else bestRate(device.sampleRates)

        /**
         * [SampleRecorder]'s inputs in the app: the mic, or the USB input
         * [usb] has found (none plugged in: it fails, saying so), at their
         * rates, stereo when asked for.
         */
        fun opener(context: Context, usb: UsbAudioInputs): (SampleInput, SampleRecorder.Sink) -> SampleRecorder.Input = { input, sink ->
            val device = if (input.source == SampleSource.USB) usb.present.value ?: throw IllegalStateException(ROUTED_AWAY) else null
            InputCapture(
                context, device, rateFor(device), if (input.stereo) 2 else 1,
                onBlock = sink::block, onClock = sink::clock, onLost = sink::lost, onSilenced = sink::silenced,
            )
        }

        /** Why a read failed, from its error code. */
        private fun readError(code: Int): String = when (code) {
            AudioRecord.ERROR_DEAD_OBJECT -> DIED
            AudioRecord.ERROR_INVALID_OPERATION -> DIED
            else -> "$DIED ($code)"
        }
    }

    /** The channels each block holds: those asked for, or 1 where the phone gives no stereo input. */
    override var channels: Int = channels
        private set

    /** The audio source it opened with (MediaRecorder.AudioSource), once started. */
    var source: Int = -1
        private set

    @Volatile private var running = false
    // Set by Android's callbacks, picked up by the thread before each read.
    @Volatile private var routedAway = false
    @Volatile private var silenced = false
    @Volatile private var record: AudioRecord? = null
    @Volatile private var thread: Thread? = null

    // The record's stop from [close] and its release on the thread, one at a time.
    private val recordLock = Any()
    private var released = false

    private val routing = AudioRouting.OnRoutingChangedListener { router ->
        val to = router.routedDevice
        if (device != null && to != null && to.id != device.id) routedAway = true
    }

    private val recording = object : AudioManager.AudioRecordingCallback() {
        override fun onRecordingConfigChanged(configs: List<AudioRecordingConfiguration>) {
            val r = record ?: return
            configs.firstOrNull { it.clientAudioSessionId == r.audioSessionId }?.let { silenced = it.isClientSilenced }
        }
    }

    /**
     * Opens the input and starts its thread. Throws, saying why, when arc
     * may not record, no input opens at [rate], or another app holds it.
     */
    @RequiresPermission(Manifest.permission.RECORD_AUDIO)
    override fun start() {
        check(record == null) { "already started" }
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            throw SecurityException(NO_PERMISSION)
        }
        val audio = context.getSystemService(AudioManager::class.java)
        val unprocessed = audio?.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED) == "true"
        val block = rate / BLOCKS_PER_SECOND
        var r: AudioRecord? = null
        // Stereo first when asked for, then mono; each with the rawest source that opens.
        for (ch in listOf(channels, 1).distinct()) {
            for (src in sources(unprocessed)) {
                r = build(src, ch, block) ?: continue
                channels = ch
                source = src
                break
            }
            if (r != null) break
        }
        val opened = r ?: throw IllegalStateException(NO_INPUT)
        if (device != null) opened.setPreferredDevice(device)
        try {
            opened.startRecording()
        } catch (e: IllegalStateException) {
            opened.release()
            throw IllegalStateException(IN_USE, e)
        }
        // Older phones open a mic another app holds, and never record from it.
        if (opened.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
            opened.release()
            throw IllegalStateException(IN_USE)
        }
        // A device that won't take the format leaves Android recording from another: not what was asked for.
        val to = opened.routedDevice
        if (device != null && to != null && to.id != device.id) {
            runCatching { opened.stop() }
            opened.release()
            throw IllegalStateException(ROUTED_AWAY)
        }
        // Before the callback, which only listens for this record.
        record = opened
        opened.addOnRoutingChangedListener(routing, null)
        opened.registerAudioRecordingCallback(Runnable::run, recording)
        // Android tells changes only: a record silenced from its start (another app has the mic) said so before the callback was there.
        silenced = opened.activeRecordingConfiguration?.isClientSilenced == true
        running = true
        thread = Thread({ run(opened, block) }, "arc-sample-in").apply {
            isDaemon = true
            start()
        }
    }

    /**
     * Stops the input, and waits (up to [CLOSE_WAIT_MS]) for the thread to
     * let go of it: the same device opened straight after, as for stereo
     * or another USB input, mustn't find this one still recording.
     */
    override fun close() {
        running = false
        val t = thread ?: return
        // A read waits for a whole block: stopping the record ends it now.
        synchronized(recordLock) {
            if (!released) runCatching { record?.stop() }
        }
        if (t !== Thread.currentThread()) t.join(CLOSE_WAIT_MS)
    }

    @RequiresPermission(Manifest.permission.RECORD_AUDIO)
    private fun build(source: Int, channels: Int, block: Int): AudioRecord? {
        val mask = if (channels == 2) AudioFormat.CHANNEL_IN_STEREO else AudioFormat.CHANNEL_IN_MONO
        val min = AudioRecord.getMinBufferSize(rate, mask, AudioFormat.ENCODING_PCM_16BIT)
        if (min <= 0) return null
        val r = try {
            AudioRecord.Builder()
                .setAudioSource(source)
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(rate)
                        .setChannelMask(mask)
                        .build(),
                )
                .setBufferSizeInBytes(maxOf(min, block * channels * 2 * BUFFER_BLOCKS))
                .build()
        } catch (_: UnsupportedOperationException) {
            return null
        } catch (_: IllegalArgumentException) {
            return null
        }
        if (r.state != AudioRecord.STATE_INITIALIZED) {
            r.release()
            return null
        }
        return r
    }

    private fun run(r: AudioRecord, block: Int) {
        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_URGENT_AUDIO)
        val ch = channels
        val buf = ShortArray(block * ch)
        val ts = AudioTimestamp()
        val clockEvery = (rate / 10).toLong()
        var at = 0L
        var clocked = -clockEvery
        var told = false
        var why: String? = null
        try {
            while (running) {
                if (routedAway) {
                    why = ROUTED_AWAY
                    break
                }
                val s = silenced
                if (s != told) {
                    told = s
                    onSilenced(s)
                }
                val n = r.read(buf, 0, buf.size, AudioRecord.READ_BLOCKING)
                if (n < 0) {
                    why = readError(n)
                    break
                }
                // Nothing yet: wait a little, never spin.
                if (n == 0) {
                    LockSupport.parkNanos(1_000_000L)
                    continue
                }
                val frames = n / ch
                onBlock(buf, frames, at)
                at += frames
                if (at - clocked >= clockEvery) {
                    clocked = at
                    onClock(clock(r, ts, at))
                }
            }
        } finally {
            r.removeOnRoutingChangedListener(routing)
            r.unregisterAudioRecordingCallback(recording)
            synchronized(recordLock) {
                runCatching { r.stop() }
                r.release()
                released = true
            }
            if (why != null && running) onLost(why)
        }
    }

    // When a frame was captured: from the input's timestamp, or (none) the frame after the last read, now.
    private fun clock(r: AudioRecord, ts: AudioTimestamp, at: Long): FrameClock =
        if (r.getTimestamp(ts, AudioTimestamp.TIMEBASE_MONOTONIC) == AudioRecord.SUCCESS) {
            FrameClock(ts.framePosition, ts.nanoTime, rate)
        } else {
            FrameClock(at, System.nanoTime(), rate)
        }
}
