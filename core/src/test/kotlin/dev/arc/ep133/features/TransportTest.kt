package dev.arc.ep133.features

import dev.arc.ep133.features.TransportAction.None
import dev.arc.ep133.features.TransportAction.PunchIn
import dev.arc.ep133.features.TransportAction.PunchOut
import dev.arc.ep133.features.TransportAction.Start
import dev.arc.ep133.features.TransportAction.Stop
import dev.arc.ep133.features.TransportPhase.ARMED
import dev.arc.ep133.features.TransportPhase.COUNT_IN
import dev.arc.ep133.features.TransportPhase.PLAYING
import dev.arc.ep133.features.TransportPhase.STOPPED
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class TransportTest {
    private val ms = 1_000_000L

    private fun playing(recording: Boolean = false) = Transport().apply {
        play(recordHeld = false, countIn = true)
        if (recording) {
            recordDown(0)
            recordUp(10 * ms)
        }
    }

    @Test
    fun `RECORD arms and disarms while stopped`() {
        val t = Transport()
        assertEquals(TransportState(), t.state)
        assertEquals(None, t.recordDown(0))
        assertEquals(TransportState(ARMED), t.state)
        assertEquals(None, t.recordUp(10 * ms))
        assertEquals(None, t.recordDown(20 * ms))
        assertEquals(TransportState(STOPPED), t.state)
    }

    @Test
    fun `RECORD then PLAY counts a bar in, then records`() {
        val t = Transport()
        t.recordDown(0)
        t.recordUp(10 * ms)
        assertEquals(Start(1, true), t.play(recordHeld = false, countIn = true))
        assertEquals(TransportState(COUNT_IN, true), t.state)
        assertEquals(None, t.countedIn())
        assertEquals(TransportState(PLAYING, true), t.state)
        // Not counting in: nothing.
        assertEquals(None, t.countedIn())
        assertEquals(TransportState(PLAYING, true), t.state)
    }

    @Test
    fun `RECORD and PLAY together, or the count-in off, start at once`() {
        val held = Transport()
        held.recordDown(0)
        assertEquals(Start(0, true), held.play(recordHeld = true, countIn = true))
        assertEquals(TransportState(PLAYING, true), held.state)
        // Letting go of the RECORD that armed it doesn't stop the recording.
        assertEquals(None, held.recordUp(2_000 * ms))
        assertEquals(TransportState(PLAYING, true), held.state)
        val off = Transport()
        off.recordDown(0)
        off.recordUp(10 * ms)
        assertEquals(Start(0, true), off.play(recordHeld = false, countIn = false))
        assertEquals(TransportState(PLAYING, true), off.state)
    }

    @Test
    fun `PLAY alone plays from bar 1, and stops whatever runs`() {
        val t = Transport()
        assertEquals(Start(0, false), t.play(recordHeld = false, countIn = true))
        assertEquals(TransportState(PLAYING, false), t.state)
        assertEquals(Stop, t.play(recordHeld = false, countIn = true))
        assertEquals(TransportState(), t.state)
        // Counting in, or recording: PLAY stops too.
        t.recordDown(0)
        t.play(recordHeld = false, countIn = true)
        assertEquals(Stop, t.play(recordHeld = false, countIn = true))
        assertEquals(TransportState(), t.state)
        val rec = playing(recording = true)
        assertEquals(Stop, rec.play(recordHeld = false, countIn = true))
        assertEquals(TransportState(), rec.state)
    }

    @Test
    fun `RECORD while playing punches in and out`() {
        val t = playing()
        assertEquals(PunchIn, t.recordDown(0))
        assertEquals(TransportState(PLAYING, true), t.state)
        assertEquals(None, t.recordUp(100 * ms))
        assertEquals(TransportState(PLAYING, true), t.state)
        assertEquals(PunchOut, t.recordDown(200 * ms))
        assertEquals(TransportState(PLAYING, false), t.state)
        // The up after a punch-out does nothing, however long it was held.
        assertEquals(None, t.recordUp(2_000 * ms))
        assertEquals(TransportState(PLAYING, false), t.state)
    }

    @Test
    fun `RECORD held while playing records only while held`() {
        val t = playing()
        assertEquals(PunchIn, t.recordDown(1_000 * ms))
        assertEquals(None, t.recordUp(1_000 * ms + Transport.LONG_PRESS_NS - 1))
        assertEquals(TransportState(PLAYING, true), t.state)
        val held = playing()
        held.recordDown(1_000 * ms)
        assertEquals(PunchOut, held.recordUp(1_000 * ms + Transport.LONG_PRESS_NS))
        assertEquals(TransportState(PLAYING, false), held.state)
        val custom = playing()
        custom.recordDown(0)
        assertEquals(PunchOut, custom.recordUp(100 * ms, longPressNs = 100 * ms))
    }

    @Test
    fun `RECORD during the count-in calls off the recording, and the count goes on`() {
        val t = Transport()
        t.recordDown(0)
        t.recordUp(10 * ms)
        t.play(recordHeld = false, countIn = true)
        assertEquals(PunchOut, t.recordDown(100 * ms))
        assertEquals(TransportState(COUNT_IN, false), t.state)
        // Held: no momentary punch-out of a recording that hasn't started.
        assertEquals(PunchIn, t.recordDown(200 * ms))
        assertEquals(None, t.recordUp(2_000 * ms))
        assertEquals(TransportState(COUNT_IN, true), t.state)
        t.recordDown(2_100 * ms)
        t.countedIn()
        assertEquals(TransportState(PLAYING, false), t.state)
    }

    @Test
    fun `stop from outside`() {
        val t = playing(recording = true)
        assertEquals(Stop, t.stop())
        assertEquals(TransportState(), t.state)
        assertEquals(None, t.stop())
        val armed = Transport()
        armed.recordDown(0)
        assertEquals(None, armed.stop())
        assertEquals(TransportState(), armed.state)
        val counting = Transport()
        counting.recordDown(0)
        counting.play(recordHeld = false, countIn = true)
        assertEquals(Stop, counting.stop())
        // A held RECORD let go of after it: nothing.
        val held = playing()
        held.recordDown(0)
        held.stop()
        assertEquals(None, held.recordUp(2_000 * ms))
    }

    @Test
    fun `SAMPLE opening punches out and plays on`() {
        val t = playing(recording = true)
        assertEquals(PunchOut, t.punchOut())
        assertEquals(TransportState(PLAYING, false), t.state)
        assertEquals(None, t.punchOut())
        val armed = Transport()
        armed.recordDown(0)
        assertEquals(None, armed.punchOut())
        assertEquals(TransportState(), armed.state)
        val counting = Transport()
        counting.recordDown(0)
        counting.play(recordHeld = false, countIn = true)
        assertEquals(PunchOut, counting.punchOut())
        assertEquals(TransportState(COUNT_IN, false), counting.state)
    }
}
