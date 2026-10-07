package dev.arc.ep133.audio

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import dev.arc.ep133.features.Beat
import dev.arc.ep133.features.BeatGrid
import dev.arc.ep133.features.FrameClock
import dev.arc.ep133.features.RecState
import dev.arc.ep133.features.TakeRecorder
import dev.arc.ep133.formats.VoiceMixer
import dev.arc.ep133.formats.VoiceShape
import dev.arc.ep133.text.LiveEngine
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import java.util.concurrent.Executors

/**
 * Live's sound output (an addition): one low-latency stream, open while Live
 * is on screen, that a [VoiceMixer] fills with the pads and keys being played.
 * A press only adds a voice, so it is heard after one or two of the output's
 * bursts (a few milliseconds each) rather than after a new track is set up.
 *
 * It runs on one of two outputs ([LiveOutput]), both at the phone's own
 * sample rate (the EP-133's 46875 Hz sounds are converted as they are mixed),
 * both starting at a two-burst buffer that grows after the output runs dry
 * and shrinks back after a quiet while:
 * - native ([NativeLiveOutput]): an Oboe (AAudio) stream, exclusive (MMAP)
 *   where the phone grants it, mixed in its own audio callback by the C++ port
 *   of the mixer; it reopens on the new route after a headphone plug or unplug.
 * - AudioTrack ([TrackLiveOutput]): Android's low-latency AudioTrack mode,
 *   mixed on a Kotlin thread just before each burst is due.
 * Native is preferred; AudioTrack is used when the library doesn't load (as in
 * the JVM tests), when a native stream won't open, and for the rest of the
 * run once the native one has died or stalled while playing ([EngineChoice]),
 * which then hands over to AudioTrack at once. The debug screen's latency
 * test can ask for AudioTrack instead ([engine]), as it is now or as it was
 * before the latency work (blocking writes). Both are tagged as a game's
 * sound (USAGE_GAME, music content), which is what Live is: sound that answers
 * a touch. Its volume is still media's, audio focus is asked for with the
 * same attributes, and previews ([SoundPlayer]) stay media. The old AudioTrack
 * way is tagged media (USAGE_MEDIA), as Live was then, focus included; touch
 * input is still delivered unbuffered while Live is shown, so it measures the
 * output as it was, not the whole of the old press path.
 *
 * [wireless] says when the output goes to Bluetooth or a hearing aid, which
 * plays late whatever the app does; Live's display line says so. It follows
 * the route as it changes (a headset connecting while Live is open).
 *
 * [onStarted] gets each voice's latency: from the press ([play]'s pressedAt)
 * to when its first frame leaves the output, from the output's timestamp,
 * where the output goes and which engine played it ([LiveEngineInfo.label],
 * also in [engineInfo]). It is called on the output's thread with the bare
 * numbers: it should hand them on, not format them there. [onOutput] gets the
 * output's [description] again whenever it changes after [open] (a native
 * stream reopened or tuned its buffer, or the switch to AudioTrack), also on
 * that thread; and on the caller's when a press or REC opened it after [open]
 * had failed.
 *
 * REC ([arm]) records the mix into a take: from the first sound after it to
 * [stopRecording], Live closing or [TakeRecorder.MAX_SECONDS]. [onTake] gets
 * the file (null when nothing was played or it couldn't be written), and
 * whether the limit stopped it, on the take's writer thread. SAMPLE's RSP
 * takes the same mix beside it ([sampleTap], before REC sees each block),
 * with the output's timestamp so a press finds the frame heard then; the tap
 * is let go of, and told it is lost, when the output closes, gives out or
 * fails, since the next output counts its frames afresh. So REC and RSP can
 * run at once.
 *
 * The TEMPO key's click ([startClick]) is a stream of its own
 * ([MetronomeOutput]), not a voice: REC never has it, and it carries on
 * while the output reopens. It shares the output's audio focus ([FocusHold]):
 * focus stays while it is on, and a call or another app taking focus stops
 * it as it stops the voices.
 */
class LiveAudio(
    context: Context,
    private val onStarted: (key: String, latencyMs: Double, route: AudioDeviceInfo?, engine: String) -> Unit = { _, _, _, _ -> },
    private val onTake: (file: File?, seconds: Double, limit: Boolean, error: String?) -> Unit = { _, _, _, _ -> },
    private val onOutput: (description: String) -> Unit = {},
) : MixSource {
    private val audio = context.getSystemService(AudioManager::class.java)
    private val attributes = attributes(AudioAttributes.USAGE_GAME)
    // The old AudioTrack way's ([LiveEngine.TRACK_OLD]): media, as Live was before the latency work.
    private val oldAttributes = attributes(AudioAttributes.USAGE_MEDIA)
    // Focus is asked for when something sounds and let go once all is quiet, off the
    // UI and audio threads: a press must not wait for it.
    private val focusThread = Executors.newSingleThreadExecutor { r -> Thread(r, "arc-focus").apply { isDaemon = true } }
    private val gameFocus = focusRequest(attributes)
    private val oldFocus = focusRequest(oldAttributes)
    // The request for the open output's attributes; the one held is let go of as it was asked for.
    @Volatile private var focus = gameFocus
    // Whether focus is held, for the voices and the click together; it queues the asks and let-gos.
    private val hold = FocusHold<AudioFocusRequest>(::ask, ::letGo)

    // The click, and who is told when something other than [stopClick] stops it; under [clickLock].
    private val clickLock = Any()
    @Volatile private var click: MetronomeOutput? = null
    private var clickStopped: (() -> Unit)? = null

    private val _keys = MutableStateFlow<Set<String>>(emptySet())
    /** The voices sounding (pad and key ids), for the rings. */
    val keys: StateFlow<Set<String>> = _keys

    private val _wireless = MutableStateFlow(false)
    /** Whether the open output goes to a wireless device ([isWireless]); false while closed. */
    val wireless: StateFlow<Boolean> = _wireless

    private val _engine = MutableStateFlow<LiveEngineInfo?>(null)
    /**
     * The engine the output opened on and its buffer now, for the latency
     * test; the last one stays after Live closes (null before the first open).
     */
    val engineInfo: StateFlow<LiveEngineInfo?> = _engine

    private val engines = EngineChoice { NativeAudio.loaded }

    /**
     * The debug screen's engine choice: [LiveEngine.AUTO] (native, else
     * AudioTrack), or AudioTrack as now or the old way. It applies from the
     * next [open]: the caller reopens an open output.
     */
    var engine: LiveEngine
        get() = engines.engine
        set(value) {
            engines.engine = value
        }

    // Key numbers for the native engine, kept across outputs.
    private val keyIds = LiveKeys()

    @Volatile private var output: LiveOutput? = null
    // What the open output's thread reports into; a new one for each output.
    @Volatile private var session: Session? = null

    private class Take(val recorder: TakeRecorder, val writer: TakeWriter) {
        @Volatile var limit = false
    }

    private val _rec = MutableStateFlow<RecState>(RecState.Idle)
    /** The REC key's state. */
    val rec: StateFlow<RecState> = _rec
    // A take armed but not yet picked up by the output's thread, and a stop asked for.
    @Volatile private var armed: Take? = null
    @Volatile private var stopAsked = false

    // SAMPLE's RSP, fed on the output's thread; set and cleared under this object's lock.
    @Volatile private var tap: MixTap? = null

    /**
     * Who takes the mix beside REC (SAMPLE's RSP, an addition): each block,
     * and the output's clock, on the output's thread, from the next block.
     * Cleared, and told [MixTap.lost], when the output closes, gives out or fails.
     */
    override var sampleTap: MixTap?
        get() = tap
        set(value) {
            synchronized(this) {
                tap = value
                // The native engine hands the mix over from now, as for REC.
                if (value != null) output?.recordFromNow()
            }
        }

    /** The open output's sample rate, null while closed. */
    override val mixRate: Int? get() = output?.rate

    private fun focusRequest(attributes: AudioAttributes) = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(attributes)
        // A call or another app taking the output over stops the sounds.
        .setOnAudioFocusChangeListener { change -> if (change < 0) focusLost(change) }
        .build()

    companion object {
        private fun attributes(usage: Int) = AudioAttributes.Builder()
            .setUsage(usage)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .build()

        /** Why RSP's tap was let go of ([MixTap.lost]): Live closed, its native engine gave out, or its output failed. */
        const val TAP_CLOSED = "Live's sound closed"
        const val TAP_GAVE_OUT = "Live's sound reopened"
        const val TAP_FAILED = "Live's sound stopped"

        /**
         * Whether output device [type] is wireless, and so heard late: Bluetooth
         * (classic or LE) or a hearing aid. The newer types are plain numbers on
         * older Android versions, where they simply never occur.
         */
        @SuppressLint("InlinedApi")
        fun isWireless(type: Int?): Boolean = when (type) {
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLE_SPEAKER,
            AudioDeviceInfo.TYPE_BLE_BROADCAST, AudioDeviceInfo.TYPE_HEARING_AID,
            -> true
            else -> false
        }
    }

    /**
     * How the output was set up, for the debug log: "48000 Hz, 96-frame
     * bursts, AAudio exclusive (MMAP)", "…, AAudio shared", or "48000 Hz,
     * 192-frame bursts, AudioTrack low-latency path".
     */
    var description = ""
        private set

    /** Whether the output is open. */
    val isOpen: Boolean get() = output != null

    /** Opens the output (Live came on screen); nothing is heard until a voice starts. */
    @Synchronized
    fun open(): Boolean {
        if (output != null) return true
        val s = Session()
        val old = engines.old
        val o = openNative(s) ?: TrackLiveOutput.open(audio, if (old) oldAttributes else attributes, s, old) ?: return false
        focus = if (old && o is TrackLiveOutput) oldFocus else gameFocus
        description = o.description
        session = s
        output = o
        _engine.value = o.engine
        // After [output]: a route the thread reports meanwhile is no older than this one.
        _wireless.value = isWireless(o.route?.type)
        return true
    }

    /** Opened by a press or REC, not by Live coming on screen ([open] had failed): told to [onOutput] like a change. */
    @Synchronized
    private fun openLate(): Boolean {
        if (output != null) return true
        if (!open()) return false
        onOutput(description)
        return true
    }

    private fun openNative(s: Session): LiveOutput? {
        if (!engines.native()) return null
        return NativeLiveOutput.open(audio, keyIds, s).also { engines.opened(it != null) }
    }

    /** Closes the output (Live left the screen); what was sounding stops. */
    fun close() {
        var t: MixTap? = null
        val o = synchronized(this) {
            session?.running = false
            session = null
            t = tap
            tap = null
            output.also { output = null }
        }
        t?.lost(TAP_CLOSED)
        o ?: return
        o.close()
        _keys.value = emptySet()
        _rec.value = RecState.Idle
        _wireless.value = false
        // The click keeps it while on; [stopClick] lets go of it then.
        hold.idle()
    }

    /**
     * Gets [pcm] ready to [play], so its first press doesn't copy it (the
     * native output copies a sound into the engine's memory; AudioTrack needs
     * nothing). It may take a few milliseconds: not on the main thread. Does
     * nothing while closed, so call it again for what's kept after [open].
     */
    fun prepare(pcm: ShortArray, channels: Int) {
        output?.prepare(pcm, channels)
    }

    /**
     * Plays [pcm] as voice [key] ([semitones] from its own pitch) until
     * [release]; [pressedAt] (System.nanoTime) is when the finger came down.
     * [shape] is how the pad plays it, as the EP-133's SOUND EDIT has it
     * (its own pitch, level, pan, trim, attack, release, play mode and mute
     * group; [VoiceShape.DEFAULT], Live's own way, unless given). Opens the
     * output first if Live hasn't. False when there is no output.
     */
    fun play(
        key: String,
        pcm: ShortArray,
        channels: Int,
        sampleRate: Int,
        semitones: Int,
        pressedAt: Long,
        shape: VoiceShape = VoiceShape.DEFAULT,
    ): Boolean {
        if (output == null && !openLate()) return false
        val o = output ?: return false
        if (!o.start(key, pcm, channels, sampleRate, semitones, pressedAt, shape)) return false
        hold.sound(focus)
        return true
    }

    /**
     * Arms REC: the next sound starts a take, written to [file]. Opens the
     * output first if Live hasn't. False when there is no output.
     */
    @Synchronized
    fun arm(file: File): Boolean {
        if (_rec.value != RecState.Idle) return true
        if (output == null && !openLate()) return false
        val o = output ?: return false
        val rate = o.rate
        lateinit var take: Take
        take = Take(
            TakeRecorder(rate),
            TakeWriter(file, rate) { f, frames, error -> onTake(f, frames.toDouble() / rate, take.limit, error) },
        )
        take.recorder.arm()
        stopAsked = false
        armed = take
        o.recordFromNow()
        _rec.value = RecState.Armed
        return true
    }

    /** Stops the take: what was recorded is saved (nothing, if nothing was played). */
    fun stopRecording() {
        if (_rec.value != RecState.Idle) stopAsked = true
    }

    /** Lets go of voice [key] (every voice of a KEY-mode pad's; a ONESHOT one plays on to its end). */
    fun release(key: String) {
        output?.release(key)
    }

    /** Ends voice [key] at once, in a few milliseconds: the press turned out to be a scroll. */
    fun cut(key: String) {
        output?.cut(key)
    }

    fun stopAll() {
        output?.stopAll()
    }

    /** Where the output goes now, once it is open. */
    fun route(): AudioDeviceInfo? = output?.route

    /** Whether the click is on. */
    val clicking: Boolean get() = click != null

    /**
     * Starts the click at [bpm], or on the EP-133's beats while [grid] gives
     * them (asked before each burst with the time now; null: run free).
     * [onBeat] gets each click when it is scheduled, with when it is heard,
     * on the click's thread; [onStopped] is told when something other than
     * [stopClick] stops it: focus taken, or the output failing. Already on,
     * only [bpm] is taken. Needs no open output. False when there is no output.
     */
    fun startClick(bpm: Int, grid: (now: Long) -> BeatGrid? = { null }, onBeat: (Beat) -> Unit = {}, onStopped: () -> Unit = {}): Boolean {
        synchronized(clickLock) {
            click?.let {
                it.bpm = bpm
                return true
            }
            val c = MetronomeOutput.open(audio, attributes, bpm, grid, onBeat, ::clickEnded) ?: return false
            click = c
            clickStopped = onStopped
            hold.clickOn(focus)
        }
        return true
    }

    /** The click's tempo, from the beat after the next; nothing while it is off. */
    fun setClickTempo(bpm: Int) {
        click?.bpm = bpm
    }

    /** Stops the click (onStopped isn't told). The focus goes once all is quiet, as after the voices. */
    fun stopClick() {
        stopClick(null)
    }

    /** Stops the click if it is [only] (any, when null); its onStopped is told unless [only] is null. */
    private fun stopClick(only: MetronomeOutput?, tell: Boolean = only != null) {
        val stopped = synchronized(clickLock) {
            val c = click ?: return
            if (only != null && c !== only) return
            click = null
            c.close()
            hold.clickOff()
            // No output to count the quiet: let go now.
            if (output == null) hold.idle()
            clickStopped.also { clickStopped = null }
        }
        if (tell) stopped?.invoke()
    }

    /** The click's output failed under it (on its thread). */
    private fun clickEnded(c: MetronomeOutput) = stopClick(c)

    /**
     * Focus was taken ([change] < 0): the voices stop. A call or another
     * app's sound ([AudioManager.AUDIOFOCUS_LOSS], [AudioManager.AUDIOFOCUS_LOSS_TRANSIENT])
     * also stops the click and lets go, so the next sound asks again; a
     * notification's ducking leaves the click on, as Android ducks it.
     */
    private fun focusLost(change: Int) {
        stopAll()
        if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) return
        click?.let { stopClick(it, tell = true) }
        hold.lost()
    }

    private fun ask(f: AudioFocusRequest) {
        focusThread.execute { audio.requestAudioFocus(f) }
    }

    private fun letGo(f: AudioFocusRequest) {
        focusThread.execute { audio.abandonAudioFocusRequest(f) }
    }

    /** The native engine gave out under [s]: what plays next goes through AudioTrack. */
    private fun gaveOut(s: Session) {
        // All under the lock: a press's [openLate] can't open another native engine in between,
        // nor can [close] slip in and leave the AudioTrack output open after Live left.
        var t: MixTap? = null
        val reopened = synchronized(this) {
            if (session !== s) return
            engines.gaveOut()
            session = null
            output = null
            // The next output counts its frames from 0: the tap's frames so far are done with.
            t = tap
            tap = null
            open().also { if (!it) _wireless.value = false }
        }
        _keys.value = emptySet()
        _rec.value = RecState.Idle
        // After the reopen, so RSP finds the new output when it opens again.
        t?.lost(TAP_GAVE_OUT)
        if (reopened) onOutput(description)
    }

    /**
     * [s]'s output failed under it, its thread gone (not closed, nor given
     * out): Live lets go of it as [close] does, so the next press opens a
     * new one, and RSP is told, since nothing feeds its tap any more.
     */
    private fun failed(s: Session) {
        var t: MixTap? = null
        synchronized(this) {
            if (session !== s) return
            session = null
            output = null
            t = tap
            tap = null
        }
        _keys.value = emptySet()
        _rec.value = RecState.Idle
        _wireless.value = false
        hold.idle()
        t?.lost(TAP_FAILED)
    }

    /** Ends [t]: its writer keeps what was recorded up to the last sound. */
    private fun end(t: Take) {
        t.writer.finish(t.recorder.stop())
    }

    /**
     * One output's side of Live (the same for both): REC's take, the keys and
     * focus, all on that output's thread. [running] goes false when Live
     * closes, so a late report doesn't overwrite the closed state.
     */
    private inner class Session : LiveListener {
        @Volatile var running = true
        private var take: Take? = null
        private var shown: Set<String> = emptySet()

        override val recording: Boolean get() = take != null || armed != null || tap != null

        override fun beforeBlock() {
            armed?.let {
                armed = null
                take?.let { t -> end(t) }
                take = it
            }
            if (stopAsked) {
                stopAsked = false
                take?.let { end(it) }
                take = null
                if (armed == null) _rec.value = RecState.Idle
            }
        }

        override fun mixed(out: ShortArray, frames: Int, at: Long, firstStart: Long?, rate: Int) {
            // RSP first: it only reads the block. Not after Live closed: a tap set since is another output's.
            if (running) tap?.mixed(out, frames, at, rate)
            val t = take ?: return
            // A native stream reopened at another rate: the take so far is kept, at its own.
            if (rate != t.recorder.outRate) {
                end(t)
                take = null
                if (running) _rec.value = RecState.Idle
                return
            }
            val k = t.recorder.onBurst(out, frames, at, firstStart)
            if (k != null) t.writer.write(out, k.from, k.frames)
            if (k?.last == true) {
                t.limit = true
                end(t)
                take = null
                _rec.value = RecState.Idle
            } else if (t.recorder.state == TakeRecorder.State.RECORDING) {
                // A new state only when the seconds shown change.
                val seconds = t.recorder.seconds
                if (running && (_rec.value as? RecState.Recording)?.seconds != seconds) _rec.value = RecState.Recording(seconds)
            }
        }

        override fun clock(frame: Long, nanos: Long, rate: Int) {
            if (running) tap?.clock(FrameClock(frame, nanos, rate))
        }

        override fun started(key: String, latencyMs: Double, route: AudioDeviceInfo?, engine: String) = onStarted(key, latencyMs, route, engine)

        override fun keys(keys: Set<String>) {
            if (keys !== shown) {
                shown = keys
                if (running) _keys.value = keys
            }
            // Quiet for two seconds, the click off: other apps may have the output back.
            hold.quiet(keys.isEmpty(), System.nanoTime())
        }

        override fun routed(route: AudioDeviceInfo?) {
            if (running && session === this) _wireless.value = isWireless(route?.type)
        }

        override fun changed(description: String) {
            if (!running || session !== this) return
            this@LiveAudio.description = description
            onOutput(description)
        }

        override fun tuned(engine: LiveEngineInfo) {
            if (running && session === this) _engine.value = engine
        }

        override fun ended() {
            // Live closing ends the take; it is saved like any other.
            take?.let { end(it) }
            take = null
            armed?.let {
                armed = null
                end(it)
            }
        }

        override fun gaveOut() = gaveOut(this)

        override fun failed() = failed(this)
    }
}
