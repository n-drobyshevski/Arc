package dev.arc.ep133.audio

import android.media.AudioDeviceInfo
import android.media.AudioManager
import dev.arc.ep133.formats.VoiceMixer
import dev.arc.ep133.formats.VoiceShape
import dev.arc.ep133.text.LatencyText
import java.util.concurrent.locks.LockSupport

/**
 * Live's native output (an addition): the Oboe (AAudio) engine in
 * libarc_live.so ([NativeAudio]; the C++ is in src/main/cpp). Its stream runs
 * at the device's own rate in low-latency mode, exclusive (MMAP) where the
 * device grants it, and is mixed in the audio callback itself by a C++ port
 * of [VoiceMixer] that renders the same samples. Nothing waits on a Kotlin
 * thread, and a headphone plug or unplug reopens the stream on the new route.
 *
 * Presses go in as commands through a lock-free ring: [prepare], [start],
 * [release], [cut], [stopAll], the sequencer's timed [startAt],
 * [releaseAt] and [flushTimed], and the FX bus's [control] hold this object's lock, so the ring has one
 * producer at a time. A sound is copied into native memory ([NativeSamples])
 * when the app prepares it, off the main thread, so a press only finds it
 * (one never prepared is copied the first time it plays); keys go as numbers
 * ([LiveKeys]).
 *
 * A thread of its own ("arc-live-native") polls the engine every
 * [POLL_NS]: voices started (their latency, from the stream's timestamp, goes
 * to the listener), the keys sounding, xruns, the REC mix (into the take, as
 * the AudioTrack output does, and while it or the clock is wanted the
 * stream's timestamp about every 100 ms, for SAMPLE and the sequencer), the
 * output's latency about every second (Oboe's own estimate, for the delay
 * Bluetooth adds), the mix frames rendered so far (where the sequencer
 * schedules from), a stream reopened (new route, rate or mode), and whether
 * the engine still runs: dead, or no callback for [STALL_NS] while it should
 * play, and it gives out, so Live falls back to AudioTrack.
 * That thread also closes the engine when [close] asks.
 */
internal class NativeLiveOutput private constructor(
    private val handle: Long,
    private val audio: AudioManager?,
    private val keyIds: LiveKeys,
    private val listener: LiveListener,
    opened: IntArray,
) : LiveOutput {
    companion object {
        /** How often the engine's reports are read. */
        const val POLL_NS = 4_000_000L

        /** No callback for this long while the stream should play: the engine gave out. */
        const val STALL_NS = 3_000_000_000L

        /** Sounds kept in native memory, as many as the app keeps decoded for Live's pads. */
        const val SOUND_BYTES = 64L * 1024 * 1024

        /** Opens the engine and its stream and starts polling; null when the library or a stream isn't to be had. */
        fun open(audio: AudioManager?, keyIds: LiveKeys, listener: LiveListener): NativeLiveOutput? {
            if (!NativeAudio.loaded) return null
            val handle = NativeAudio.create()
            if (handle == 0L) return null
            val info = IntArray(NativeAudio.INFO_SIZE)
            if (!NativeAudio.open(handle) || !NativeAudio.info(handle, info)) {
                NativeAudio.destroy(handle)
                return null
            }
            return NativeLiveOutput(handle, audio, keyIds, listener, info).apply { thread.start() }
        }

        /**
         * How a stream is set up ([NativeAudio.info]'s fields), for the debug
         * log: "48000 Hz, 96-frame bursts, AAudio exclusive (MMAP)"; the xruns
         * and the buffer they grew it to, once there were any.
         */
        fun describe(info: IntArray, xruns: Int, buffer: Int): String {
            val mode = when {
                info[NativeAudio.AAUDIO] == 0 -> "OpenSL ES"
                info[NativeAudio.EXCLUSIVE] != 0 -> "AAudio exclusive (MMAP)"
                info[NativeAudio.MMAP] != 0 -> "AAudio shared (MMAP)"
                else -> "AAudio shared"
            }
            val path = if (info[NativeAudio.LOW_LATENCY] != 0) "" else ", normal path (no low-latency output)"
            val tuned = if (xruns > 0) ", $xruns xruns, $buffer-frame buffer" else ""
            return "${info[NativeAudio.RATE]} Hz, ${info[NativeAudio.BURST]}-frame bursts, $mode$path$tuned"
        }

        /** The engine as the latency test shows it, from [info]: "AAudio exclusive (MMAP), 96-frame bursts", its buffer [buffer] frames. */
        fun engineOf(info: IntArray, buffer: Int): LiveEngineInfo {
            val mode = LatencyText.nativeMode(info[NativeAudio.AAUDIO] != 0, info[NativeAudio.EXCLUSIVE] != 0, info[NativeAudio.MMAP] != 0)
            val burst = info[NativeAudio.BURST]
            return LiveEngineInfo(LatencyText.nativeEngine(mode, burst, info[NativeAudio.LOW_LATENCY] != 0), info[NativeAudio.RATE], burst, buffer)
        }
    }

    // The stream's set-up, refreshed when it reopens (poll thread).
    private val info = opened.copyOf()

    @Volatile override var rate = info[NativeAudio.RATE]
        private set

    @Volatile override var description = describe(info, 0, info[NativeAudio.BUFFER])
        private set

    @Volatile override var route: AudioDeviceInfo? = findRoute(info[NativeAudio.DEVICE])
        private set

    @Volatile override var engine = engineOf(info, info[NativeAudio.BUFFER])
        private set

    @Volatile private var running = true
    // Set (under this lock) once the engine is gone: the producer calls do nothing after.
    private var closed = false
    private val samples = NativeSamples(
        SOUND_BYTES,
        NativeAudio.MAX_SAMPLES,
        load = { slot, pcm, channels -> NativeAudio.load(handle, slot, pcm, channels) },
        unload = { slot -> NativeAudio.unload(handle, slot) },
    )
    private val thread = Thread({ run() }, "arc-live-native").apply { isDaemon = true }

    @Synchronized
    override fun prepare(pcm: ShortArray, channels: Int) {
        if (!closed && channels in 1..2 && pcm.size >= channels) samples.slot(pcm, channels)
    }

    override fun start(key: String, pcm: ShortArray, channels: Int, sampleRate: Int, semitones: Int, tag: Long, shape: VoiceShape): Boolean =
        startAt(key, pcm, channels, sampleRate, semitones, tag, shape, VoiceMixer.NOW)

    @Synchronized
    override fun startAt(key: String, pcm: ShortArray, channels: Int, sampleRate: Int, semitones: Int, tag: Long, shape: VoiceShape, atFrame: Long): Boolean {
        require(channels in 1..2) { "channels: $channels" }
        if (closed) return false
        // Nothing to play, as the Kotlin mixer takes it.
        if (pcm.size < channels) return true
        val slot = samples.slot(pcm, channels) ?: return false
        // The shape's semitones go into the pitch here, as the Kotlin mixer's start adds them.
        val pitch = VoiceMixer.pitchRatio(semitones + shape.semitones)
        return NativeAudio.start(
            handle, keyIds.id(key), slot, sampleRate, pitch, tag,
            shape.gain, shape.pan, shape.start, shape.end, shape.attackMs, shape.releaseMs, shape.mode.ordinal, shape.muteGroup,
            shape.bus, shape.duckSource, atFrame,
        )
    }

    @Synchronized
    override fun release(key: String) {
        if (!closed) NativeAudio.release(handle, keyIds.id(key))
    }

    @Synchronized
    override fun cut(key: String) {
        if (!closed) NativeAudio.cut(handle, keyIds.id(key))
    }

    @Synchronized
    override fun stopAll() {
        if (!closed) NativeAudio.stopAll(handle)
    }

    @Synchronized
    override fun releaseAt(key: String, atFrame: Long, tag: Long) {
        if (!closed) NativeAudio.releaseAt(handle, keyIds.id(key), atFrame, tag)
    }

    @Synchronized
    override fun flushTimed() {
        if (!closed) NativeAudio.flushTimed(handle)
    }

    @Synchronized
    override fun control(what: Int, index: Int, x: Float, y: Float) {
        if (!closed) NativeAudio.control(handle, what, index, x, y)
    }

    @Synchronized
    override fun recordFromNow() {
        if (!closed) NativeAudio.setRecording(handle, true)
    }

    override fun close() {
        running = false
        LockSupport.unpark(thread)
    }

    private fun run() {
        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_AUDIO)
        val reports = LongArray(1024)
        val mix = ShortArray(NativeAudio.CHUNK * 2)
        val header = LongArray(3)
        val stamp = LongArray(2)
        // The mix's clock, told apart from [stamp]: that one is the voices' this poll.
        val clockStamp = LongArray(2)
        var clocked = 0L
        // When the latency was last told (0: not yet, so the first poll tells it).
        var measured = 0L
        val watch = StallWatch(STALL_NS)
        // The engine counts its streams from 1, the one [open] started.
        var generation = 1L
        var keys: Set<String> = emptySet()
        var gaveOut = false
        try {
            while (running) {
                val n = NativeAudio.poll(handle, reports)
                if (n < NativeAudio.HEADER) break
                val state = reports[1].toInt()
                if (generation != reports[2]) {
                    // The stream reopened: its rate, route and mode may be new.
                    generation = reports[2]
                    // Another route's latency: told afresh at once.
                    measured = 0L
                    if (NativeAudio.info(handle, info)) {
                        rate = info[NativeAudio.RATE]
                        route = findRoute(info[NativeAudio.DEVICE])
                        description = describe(info, 0, info[NativeAudio.BUFFER])
                        engine = engineOf(info, info[NativeAudio.BUFFER])
                        listener.routed(route)
                        listener.changed(description)
                        listener.tuned(engine)
                    }
                }
                listener.beforeBlock(reports[NativeAudio.RENDERED], rate)
                // Under the lock, so a REC armed meanwhile ([recordFromNow]) isn't turned off again.
                synchronized(this) { NativeAudio.setRecording(handle, listener.recording) }
                var heard = 0
                var i = NativeAudio.HEADER
                while (i < n) {
                    when (reports[i]) {
                        NativeAudio.STARTED -> {
                            val tag = reports[i + 3]
                            // No press (0), or the sequencer's (below 0): no latency to tell.
                            if (tag > 0L) {
                                // One timestamp for all the voices in this poll.
                                if (heard == 0) heard = NativeAudio.timestamp(handle, stamp)
                                report(reports[i + 1].toInt(), reports[i + 2], tag, if (heard == 0) null else stamp)
                            }
                            i += 4
                        }
                        NativeAudio.KEYS -> {
                            val count = reports[i + 1].toInt()
                            val set = LinkedHashSet<String>(count * 2)
                            for (k in 0 until count) keyIds.name(reports[i + 2 + k].toInt())?.let(set::add)
                            keys = set
                            i += 2 + count
                        }
                        NativeAudio.OUTPUT -> {
                            // The callback grew or shrank its buffer, or ran dry.
                            description = describe(info, reports[i + 1].toInt(), reports[i + 2].toInt())
                            engine = engine.copy(buffer = reports[i + 2].toInt())
                            listener.changed(description)
                            listener.tuned(engine)
                            i += 3
                        }
                        else -> i = n
                    }
                }
                while (true) {
                    val frames = NativeAudio.readMix(handle, mix, header)
                    if (frames <= 0) break
                    listener.mixed(mix, frames, header[0], header[1].takeIf { it >= 0 }, header[2].toInt())
                }
                if (listener.recording || listener.clocked) {
                    val now = System.nanoTime()
                    // None while the stream reopens: told at the next poll that has one.
                    if (now - clocked >= LiveListener.CLOCK_NS && NativeAudio.timestamp(handle, clockStamp) != 0) {
                        clocked = now
                        listener.clock(clockStamp[0], clockStamp[1], rate)
                    }
                }
                val at = System.nanoTime()
                if (measured == 0L || at - measured >= LiveListener.LATENCY_NS) {
                    measured = at
                    // None while the stream reopens or has no timestamp yet: told so, and again at the next.
                    listener.latency(NativeAudio.latency(handle).takeIf { it > 0 })
                }
                listener.keys(keys)
                if (state == NativeAudio.DEAD || watch.stalled(reports[0], state == NativeAudio.RUNNING, System.nanoTime())) {
                    gaveOut = true
                    break
                }
                LockSupport.parkNanos(POLL_NS)
            }
        } finally {
            listener.ended()
            // The producer calls see [closed] under the lock and leave the handle alone, so the
            // engine goes outside it: stopping a stalled stream can take seconds, and a press
            // meanwhile (main thread) mustn't wait for that.
            synchronized(this) { closed = true }
            NativeAudio.destroy(handle)
            if (gaveOut) listener.gaveOut() else if (running) listener.failed()
        }
    }

    /** The latency of voice [key], which starts at mix frame [frame]; [stamp] maps a mix frame to its time (null: none, so now). */
    private fun report(key: Int, frame: Long, tag: Long, stamp: LongArray?) {
        val name = keyIds.name(key) ?: return
        val atFrame = stamp?.get(0) ?: frame
        val atNanos = stamp?.get(1) ?: System.nanoTime()
        val heardAt = atNanos + ((frame - atFrame) / rate.toDouble() * 1e9).toLong()
        listener.started(name, (heardAt - tag) / 1e6, route, engine.label)
    }

    /** The output device with id [id], if Android lists it. */
    private fun findRoute(id: Int): AudioDeviceInfo? =
        if (id <= 0) null else audio?.getDevices(AudioManager.GET_DEVICES_OUTPUTS)?.firstOrNull { it.id == id }
}
