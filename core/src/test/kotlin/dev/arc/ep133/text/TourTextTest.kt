package dev.arc.ep133.text

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TourTextTest {
    private val sentences = listOf(
        TourText.WELCOME_HINT, TourText.WELCOME_STEPS, TourText.CONNECT_HINT, TourText.NEEDS_DEVICE,
        TourText.PAD_NOTE, TourText.HEAR_HINT, TourText.BACKUP_HINT, TourText.DONE_HINT, TourText.LATER_NOTE,
        SettingsText.TRY_AGAIN_NOTE, SettingsText.SHOW_NOTE, Strings.PLUG_IN_HINT,
    )
    private val labels = listOf(
        TourText.TITLE, TourText.WELCOME_SUB, TourText.RESUME_HEAD, TourText.START, TourText.CONTINUE, TourText.NOT_NOW,
        TourText.SKIP, TourText.LATER, TourText.NEXT, TourText.PLAY_IT, TourText.RESTORE_HEAD, TourText.FIRST_TIME,
        TourText.CONNECT_HEAD, TourText.ROW_MIDI, TourText.ROW_PLUGGED, TourText.ROW_CONNECTED, TourText.PAD_HEAD,
        TourText.HEAR_HEAD, TourText.BACKUP_HEAD, TourText.NEEDS_MIDI, TourText.DONE_HEAD,
    )

    @Test
    fun `sentences end with a full stop, headings and keys don't`() {
        for (s in sentences) assertTrue(s.endsWith("."), s)
        for (l in labels) assertFalse(l.endsWith(".") || l.endsWith("?") && l != TourText.RESTORE_HEAD, l)
        for (s in sentences + labels) assertFalse(s.contains("!"), s)
    }

    @Test
    fun `the compact cards' bodies fit two lines`() {
        // PAD and HEAR sit in a short card over the A-D keys.
        assertTrue((MirrorText.WAITING + " " + TourText.PAD_NOTE).length <= 64)
        assertTrue(TourText.HEAR_HINT.length <= 64)
    }

    @Test
    fun `formatted text`() {
        assertEquals("Step 2 of 4", TourText.stepOf(2, 4))
        assertEquals("Connected: done", TourText.row(TourText.ROW_CONNECTED, true))
        assertEquals("MIDI allowed: not yet", TourText.row(TourText.ROW_MIDI, false))
        assertEquals("Try arc stopped at step 3 of 4.", TourText.resumeHint(3, 4))
        // The hint names the key the card has.
        assertTrue(TourText.CONNECT_HINT.contains("tap ${Strings.CONNECT}."))
    }
}
