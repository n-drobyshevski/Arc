package dev.arc.ep133.ui

import androidx.compose.runtime.saveable.SaverScope
import dev.arc.ep133.features.TourSession
import dev.arc.ep133.features.TourStep
import dev.arc.ep133.ui.components.TourSessionSaver
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** A run of the tour kept across a rotation: every field comes back, the offline path too. */
class TourSessionSaverTest {
    private val scope = SaverScope { true }

    private fun roundTrip(s: TourSession?): TourSession? =
        with(TourSessionSaver) { scope.save(s) }?.let { TourSessionSaver.restore(it) }

    @Test
    fun `a run comes back as it was`() {
        val device = TourSession(
            seenAtOpen = true, tourDoneAtOpen = false, openBackups = 3, resumed = true, welcomed = true,
            step = TourStep.HEAR, stepAt = 123_456_789L, stepBackups = 3, heardSince = true,
            connectTickedNow = true, connectAcked = true,
        )
        assertEquals(device, roundTrip(device))
        val offline = TourSession(seenAtOpen = false, tourDoneAtOpen = false, openBackups = 0, welcomed = true, step = TourStep.GUIDE, offline = true)
        assertEquals(offline, roundTrip(offline))
        val done = offline.copy(step = TourStep.DONE, reachedDone = true)
        assertEquals(done, roundTrip(done))
    }

    @Test
    fun `no run, or text it can't read, is none`() {
        assertNull(roundTrip(null))
        assertNull(TourSessionSaver.restore("true,false"))
    }
}
