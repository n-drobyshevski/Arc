package dev.arc.ep133.features

/** Where the pattern transport is: stopped, RECORD armed, counting in, or playing. */
enum class TransportPhase { STOPPED, ARMED, COUNT_IN, PLAYING }

/** The transport's [phase], and whether pads played go into the pattern ([recording]; while counting in, once it starts). */
data class TransportState(val phase: TransportPhase = TransportPhase.STOPPED, val recording: Boolean = false)

/** What a press on RECORD or PLAY (or a pad, armed) asks of the sequencer and the recorder. */
sealed interface TransportAction {
    /**
     * Play from bar 1, after [countInBars] bars of count-in (0: at once),
     * recording if [record]; bar 1 heard at [at] (a pad's press), else as
     * soon as it can be.
     */
    data class Start(val countInBars: Int, val record: Boolean, val at: Long? = null) : TransportAction

    data object Stop : TransportAction
    data object PunchIn : TransportAction
    data object PunchOut : TransportAction
    data object None : TransportAction
}

/**
 * RECORD and PLAY, as on the device: RECORD then PLAY records after a
 * bar's count-in, RECORD + PLAY together at once; PLAY while running stops.
 * Armed, a pad starts the recording at once, bar 1 on its press; PLAY
 * still gives the count-in. RECORD while playing punches in and out; held,
 * it records only while held. Unlike the device, PLAY always starts at
 * bar 1. Times are nanoseconds on one clock.
 */
class Transport {
    companion object {
        /** RECORD held this long after punching in records only while held. */
        const val LONG_PRESS_NS = 400_000_000L
    }

    var state = TransportState()
        private set

    // When the RECORD press that punched in went down, while it is held.
    private var punchedAt: Long? = null

    /** RECORD goes down at [at]. */
    fun recordDown(at: Long): TransportAction {
        punchedAt = null
        return when (state.phase) {
            TransportPhase.STOPPED -> set(TransportPhase.ARMED, false, TransportAction.None)
            TransportPhase.ARMED -> set(TransportPhase.STOPPED, false, TransportAction.None)
            // Counting in: the recording of the start is called off (or back on); the count goes on.
            TransportPhase.COUNT_IN, TransportPhase.PLAYING ->
                if (state.recording) {
                    set(state.phase, false, TransportAction.PunchOut)
                } else {
                    if (state.phase == TransportPhase.PLAYING) punchedAt = at
                    set(state.phase, true, TransportAction.PunchIn)
                }
        }
    }

    /** RECORD comes up at [at]: held [longPressNs] or more after it punched in, recording stops with it. */
    fun recordUp(at: Long, longPressNs: Long = LONG_PRESS_NS): TransportAction {
        val down = punchedAt ?: return TransportAction.None
        punchedAt = null
        if (state.phase != TransportPhase.PLAYING || !state.recording || at - down < longPressNs) return TransportAction.None
        return set(TransportPhase.PLAYING, false, TransportAction.PunchOut)
    }

    /** PLAY pressed, with RECORD held down or not; [countIn] is the setting for RECORD then PLAY. */
    fun play(recordHeld: Boolean, countIn: Boolean): TransportAction {
        punchedAt = null
        return when (state.phase) {
            TransportPhase.STOPPED -> start(TransportAction.Start(0, false))
            TransportPhase.ARMED -> start(TransportAction.Start(if (countIn && !recordHeld) 1 else 0, true))
            TransportPhase.COUNT_IN, TransportPhase.PLAYING -> set(TransportPhase.STOPPED, false, TransportAction.Stop)
        }
    }

    /** A pad (or a KEYS note) goes down at [at]: armed, recording starts right there, bar 1 on the press. */
    fun padDown(at: Long): TransportAction {
        if (state.phase != TransportPhase.ARMED) return TransportAction.None
        punchedAt = null
        return set(TransportPhase.PLAYING, true, TransportAction.Start(0, true, at))
    }

    /** The count-in is over: playing, recording if it was armed. */
    fun countedIn(): TransportAction {
        if (state.phase == TransportPhase.COUNT_IN) state = state.copy(phase = TransportPhase.PLAYING)
        return TransportAction.None
    }

    /** Stopped from outside (audio focus lost, the output closed, another project): Stop while it ran. */
    fun stop(): TransportAction {
        punchedAt = null
        val running = state.phase == TransportPhase.COUNT_IN || state.phase == TransportPhase.PLAYING
        state = TransportState()
        return if (running) TransportAction.Stop else TransportAction.None
    }

    /** Recording stops and playing goes on (SAMPLE opened); armed is disarmed. */
    fun punchOut(): TransportAction {
        punchedAt = null
        if (state.phase == TransportPhase.ARMED) return set(TransportPhase.STOPPED, false, TransportAction.None)
        if (!state.recording) return TransportAction.None
        return set(state.phase, false, TransportAction.PunchOut)
    }

    private fun start(a: TransportAction.Start): TransportAction =
        set(if (a.countInBars > 0) TransportPhase.COUNT_IN else TransportPhase.PLAYING, a.record, a)

    private fun set(phase: TransportPhase, recording: Boolean, a: TransportAction): TransportAction {
        state = TransportState(phase, recording)
        return a
    }
}
