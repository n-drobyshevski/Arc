package dev.arc.ep133.audio

import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.AudioTimestamp
import dev.arc.ep133.formats.VoiceMixer
import dev.arc.ep133.formats.VoiceShape
import dev.arc.ep133.text.LatencyText

/**
 * Live's AudioTrack output (an addition), the fallback for the native one
 * ([NativeLiveOutput]): [BurstOutput] at the phone's own sample rate in
 * Android's low-latency mode, which is what lets it take the fast mixer path,
 * filled by [VoiceMixer] on a thread of its own. The EP-133's 46875 Hz sounds
 * are converted as they are mixed. Each burst is mixed just before the output
 * has room for it, so a press waits for no burst already mixed. The buffer
 * starts at two bursts, grows by one whenever the output runs dry, and
 * shrinks back after a quiet while. The audio thread allocates nothing per
 * burst.
 *
 * Each new voice's latency is from the press (its tag) to when its first
 * frame leaves the output, from the output's timestamp. A new route (Android
 * tells [BurstOutput]) reaches the listener from this thread, at the next burst,
 * and so does a buffer grown or shrunk ([LiveListener.tuned]). While the mix
 * is wanted, so does the output's timestamp, about every 100 ms
 * ([LiveListener.clock]), for SAMPLE's resampling.
 *
 * Opened with old (the debug screen's "AudioTrack, old"), it writes as Live
 * did before the latency work: each burst mixed as soon as the last write
 * returned, then written blocking, the buffer only growing ([BurstOutput.old]);
 * [LiveAudio] then opens it with media attributes, as Live had then.
 */
internal class TrackLiveOutput private constructor(private val output: BurstOutput, private val listener: LiveListener) : LiveOutput {
    companion object {
        /** Opens the output and starts its thread; null when the phone gives none. */
        fun open(audio: AudioManager?, attributes: AudioAttributes, listener: LiveListener, old: Boolean = false): TrackLiveOutput? =
            BurstOutput.open(audio, attributes, old)?.let { TrackLiveOutput(it, listener).apply { thread.start() } }
    }

    private val mixer = VoiceMixer(output.rate)
    @Volatile private var running = true
    private val thread = Thread({ run() }, "arc-live-audio").apply { isDaemon = true }

    override val rate = output.rate
    override val description = output.description
    override val route: AudioDeviceInfo? get() = output.route

    @Volatile override var engine = LiveEngineInfo(LatencyText.trackEngine(output.fast, output.burst, output.old), output.rate, output.burst, output.size)
        private set

    override fun start(key: String, pcm: ShortArray, channels: Int, sampleRate: Int, semitones: Int, tag: Long, shape: VoiceShape): Boolean {
        mixer.start(key, pcm, channels, sampleRate, semitones, tag, shape)
        return true
    }

    override fun release(key: String) = mixer.release(key)

    override fun cut(key: String) = mixer.cut(key)

    override fun stopAll() = mixer.stopAll()

    // The thread hands every burst over while [LiveListener.recording] says so.
    override fun recordFromNow() {}

    override fun close() {
        running = false
    }

    private fun run() {
        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_URGENT_AUDIO)
        val o = output
        val out = ShortArray(o.burst * 2)
        val ts = AudioTimestamp()
        // The route last told: a new object only when Android routes the track anew.
        var told: Any? = Unit
        // When the clock was last told, for the mix's takers.
        var clocked = 0L
        try {
            while (running) {
                // Mixed only once the output has room for it, so a press made meanwhile is in it.
                if (!o.ready()) continue
                listener.beforeBlock()
                val at = mixer.frame
                mixer.render(out, o.burst)
                // The mixer's own list, read here on its thread: no copy.
                val started = mixer.started
                if (listener.recording) {
                    var first = Long.MAX_VALUE
                    for (i in started.indices) first = minOf(first, started[i].frame)
                    listener.mixed(out, o.burst, at, if (started.isEmpty()) null else first, o.rate)
                    val now = System.nanoTime()
                    if (now - clocked >= LiveListener.CLOCK_NS) {
                        clocked = now
                        clock(ts, now)
                    }
                }
                if (!o.write(out)) break
                if (started.isNotEmpty()) report(started, ts)
                val route = o.route
                if (route !== told) {
                    told = route
                    listener.routed(route)
                }
                // The mixer makes a new set only when the voices change.
                listener.keys(mixer.keys)
                o.adjust()
                if (o.size != engine.buffer) {
                    engine = engine.copy(buffer = o.size)
                    listener.tuned(engine)
                }
            }
        } finally {
            listener.ended()
            o.release()
            // A write failed, not [close]: Live lets go of this output.
            if (running) listener.failed()
        }
    }

    /**
     * Tells the listener when a mix frame is heard, from the output's
     * timestamp: the track counts the frames it plays from the mixer's first,
     * so its frames are mix frames. No timestamp yet (just opened): the play
     * head, [now].
     */
    private fun clock(ts: AudioTimestamp, now: Long) {
        val o = output
        if (o.track.getTimestamp(ts)) {
            listener.clock(ts.framePosition, ts.nanoTime, o.rate)
        } else {
            listener.clock(o.track.playbackHeadPosition.toLong() and 0xFFFFFFFFL, now, o.rate)
        }
    }

    /** When each new voice's first frame is heard, from the output's timestamp. */
    private fun report(started: List<VoiceMixer.Started>, ts: AudioTimestamp) {
        val o = output
        val rate = o.rate.toDouble()
        // No timestamp yet (the output just opened): what is written but not played.
        val stamped = o.track.getTimestamp(ts)
        val atNanos = if (stamped) ts.nanoTime else System.nanoTime()
        val atFrame = if (stamped) ts.framePosition else o.track.playbackHeadPosition.toLong()
        val route = o.route
        val label = engine.label
        for (i in started.indices) {
            val v = started[i]
            if (v.tag == 0L) continue
            val heardAt = atNanos + ((v.frame - atFrame) / rate * 1e9).toLong()
            listener.started(v.key, (heardAt - v.tag) / 1e6, route, label)
        }
    }
}
