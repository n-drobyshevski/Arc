package dev.arc.ep133.controller

import dev.arc.ep133.features.Comp
import dev.arc.ep133.features.FxBook
import dev.arc.ep133.features.FxSettings
import dev.arc.ep133.features.FxType
import dev.arc.ep133.features.PadNotes
import dev.arc.ep133.features.PadSettings
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.Sidechain
import dev.arc.ep133.formats.fx.FxControl
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** FX as the controller keeps it: per project, sent to Live's output, and the punch-ins. */
class FxPlanTest {
    private data class Cmd(val what: Int, val index: Int, val x: Float, val y: Float)

    private val sent = ArrayList<Cmd>()
    private var edits = 0
    private val desk = FxDesk({ what, index, x, y -> sent += Cmd(what, index, x, y) }) { edits++ }

    /** What [s] sends whole: the effect, the four sends, the compressor, the sidechain. */
    private fun whole(s: FxSettings): List<Cmd> {
        val out = ArrayList<Cmd>()
        sendFx(s) { what, index, x, y -> out += Cmd(what, index, x, y) }
        return out
    }

    private val delay = FxSettings(
        type = FxType.DELAY,
        x = 0.25f,
        y = 0.75f,
        sends = listOf(0.5f, 0f, 1f, 0.125f),
        comp = Comp(on = true, x = 0.75f, y = 0.25f),
        sidechain = Sidechain(on = true, group = 1, pad = 3, dests = 0b0101, x = 0.5f, y = 0.25f),
    )

    @Test
    fun `the whole of a project's settings is the effect, four sends, the compressor and the sidechain, in that order`() {
        assertEquals(
            listOf(
                Cmd(FxControl.FX_TYPE, FxControl.DELAY, 0.25f, 0.75f),
                Cmd(FxControl.SEND, 0, 0.5f, 0f),
                Cmd(FxControl.SEND, 1, 0f, 0f),
                Cmd(FxControl.SEND, 2, 1f, 0f),
                Cmd(FxControl.SEND, 3, 0.125f, 0f),
                Cmd(FxControl.COMP, 1, 0.75f, 0.25f),
                Cmd(FxControl.SIDECHAIN, 0b0101, 0.5f, 0.25f),
            ),
            whole(delay),
        )
        // Off, the sidechain ducks no group, whatever groups it has.
        assertEquals(Cmd(FxControl.SIDECHAIN, 0, 0.5f, 0.25f), whole(delay.copy(sidechain = delay.sidechain.copy(on = false))).last())
    }

    @Test
    fun `fx json missing sends the defaults, so a new output gets them`() {
        assertFalse(desk.load(null))
        assertTrue(desk.loaded)
        assertEquals(FxSettings.DEFAULT, desk.fx.value)
        assertEquals(whole(FxSettings.DEFAULT), sent)
        assertNull(desk.json())
    }

    @Test
    fun `each knob sends its own command, and a turn that changes nothing sends nothing`() {
        desk.load(null)
        sent.clear()
        desk.setXY(0.2f, 0.9f)
        desk.setXY(0.2f, 0.9f)
        desk.setSend(2, 0.4f)
        desk.setSend(4, 0.4f)
        desk.setComp(on = true)
        desk.setComp(x = 2f, y = -1f)
        assertEquals(
            listOf(
                Cmd(FxControl.FX_XY, 0, 0.2f, 0.9f),
                Cmd(FxControl.SEND, 2, 0.4f, 0f),
                Cmd(FxControl.COMP, 1, 0.5f, 0.5f),
                Cmd(FxControl.COMP, 1, 1f, 0f),
            ),
            sent,
        )
        assertEquals(4, edits)
        assertEquals(Comp(on = true, x = 1f, y = 0f), desk.fx.value.comp)
    }

    @Test
    fun `the effect on already, chosen again, is none, and its knobs stay`() {
        desk.load(null)
        desk.setXY(0.3f, 0.6f)
        sent.clear()
        desk.setType(FxType.REVERB)
        desk.setType(FxType.DELAY)
        desk.setType(FxType.DELAY)
        assertEquals(
            listOf(
                Cmd(FxControl.FX_TYPE, FxControl.REVERB, 0.3f, 0.6f),
                Cmd(FxControl.FX_TYPE, FxControl.DELAY, 0.3f, 0.6f),
                Cmd(FxControl.FX_TYPE, FxControl.NONE, 0.3f, 0.6f),
            ),
            sent,
        )
        assertEquals(FxType.NONE, desk.fx.value.type)
    }

    @Test
    fun `the sidechain sends the groups it ducks only while on`() {
        desk.load(null)
        sent.clear()
        desk.toggleSidechainDest(0)
        desk.toggleSidechainDest(2)
        desk.setSidechainOn(true)
        desk.toggleSidechainDest(0)
        desk.setSidechainXY(0.1f, 0.9f)
        desk.setSidechainSource(3, 11)
        desk.setSidechainOn(false)
        assertEquals(
            listOf(0, 0, 0b101, 0b100, 0b100, 0b100, 0),
            sent.map { assertEquals(FxControl.SIDECHAIN, it.what); it.index },
        )
        assertEquals(Sidechain(on = false, group = 3, pad = 11, dests = 0b100, x = 0.1f, y = 0.9f), desk.fx.value.sidechain)
    }

    @Test
    fun `each project keeps its own, and fx json gives them back to another run`() {
        desk.load(null)
        desk.switchTo(3)
        desk.setType(FxType.DELAY)
        desk.setSend(0, 0.5f)
        desk.switchTo(5)
        assertEquals(FxSettings.DEFAULT, desk.fx.value)
        desk.setComp(on = true, x = 0.75f)
        desk.switchTo(3)
        assertEquals(FxType.DELAY, desk.fx.value.type)
        val text = desk.json()!!

        val read = FxBook.fromJson(text)!!
        assertEquals(setOf(3, 5), read.keys)
        val next = ArrayList<Cmd>()
        val again = FxDesk({ what, index, x, y -> next += Cmd(what, index, x, y) })
        again.switchTo(5)
        next.clear()
        assertFalse(again.load(read))
        // Read, the project shown is sent whole: the output (and any output after it) has it.
        assertEquals(Comp(on = true, x = 0.75f, y = 0.5f), again.fx.value.comp)
        assertEquals(whole(again.fx.value), next)
        next.clear()
        again.switchTo(3)
        assertEquals(desk.fx.value, again.fx.value)
        assertEquals(whole(desk.fx.value), next)
        assertEquals(text, again.json())
    }

    @Test
    fun `a project back at the defaults leaves the file`() {
        desk.load(null)
        desk.switchTo(7)
        desk.setType(FxType.FILTER)
        assertEquals(setOf(7), FxBook.fromJson(desk.json()!!)!!.keys)
        // FILTER again is none: project 7 is at the defaults.
        desk.setType(FxType.FILTER)
        assertNull(desk.json())
    }

    @Test
    fun `what changed before the file was read is kept over it, and the rest comes from the file`() {
        val file = mapOf(1 to delay, 2 to delay.copy(type = FxType.CHORUS))
        desk.switchTo(1)
        desk.setSend(3, 1f)
        val edited = desk.fx.value
        assertTrue(desk.load(file))
        assertEquals(edited, desk.fx.value)
        desk.switchTo(2)
        assertEquals(FxType.CHORUS, desk.fx.value.type)
        assertEquals(mapOf(1 to edited, 2 to file.getValue(2)), desk.kept())
    }

    @Test
    fun `a punch-in press always punches in, its depth held to 1, a lift sends 0, and all up lets go of each`() {
        desk.punchDown(FxControl.TREMOLO, 0f)
        desk.punchDown(FxControl.LPF, 2f)
        desk.punchDown(FxControl.SLICE, Float.NaN)
        desk.punchDown(12, 1f)
        assertEquals(listOf(FxControl.TREMOLO, FxControl.LPF, FxControl.SLICE), desk.punches.value.toList())
        desk.punchMove(FxControl.LPF, 0.5f)
        desk.punchMove(FxControl.HPF, 0.5f)
        desk.punchUp(FxControl.TREMOLO)
        desk.punchUp(FxControl.TREMOLO)
        assertEquals(listOf(FxControl.LPF, FxControl.SLICE), desk.punches.value.toList())
        desk.punchAllUp()
        assertTrue(desk.punches.value.isEmpty())
        assertEquals(
            listOf(
                Cmd(FxControl.PUNCH, FxControl.TREMOLO, PUNCH_MIN_DEPTH, 0f),
                Cmd(FxControl.PUNCH, FxControl.LPF, 1f, 0f),
                Cmd(FxControl.PUNCH, FxControl.SLICE, PUNCH_MIN_DEPTH, 0f),
                Cmd(FxControl.PUNCH, FxControl.LPF, 0.5f, 0f),
                Cmd(FxControl.PUNCH, FxControl.TREMOLO, 0f, 0f),
                Cmd(FxControl.PUNCH, FxControl.LPF, 0f, 0f),
                Cmd(FxControl.PUNCH, FxControl.SLICE, 0f, 0f),
            ),
            sent,
        )
        // Punch-ins aren't settings: nothing to keep.
        assertEquals(0, edits)
    }

    @Test
    fun `the punch-ins sit on the pads by their labels`() {
        fun slot(label: String) = punchSlotForPad(PadNotes.LABELS.indexOf(label))
        assertEquals(FxControl.TREMOLO, slot("7"))
        assertEquals(FxControl.OCTAVE_DOWN, slot("8"))
        assertEquals(FxControl.DECIMATOR, slot("9"))
        assertEquals(FxControl.LPF, slot("4"))
        assertEquals(FxControl.HPF, slot("5"))
        assertEquals(FxControl.SEND_FX, slot("6"))
        assertEquals(FxControl.BEAT_REPEAT, slot("1"))
        assertEquals(FxControl.TAPE_STOP, slot("2"))
        assertEquals(FxControl.FILTER_LFO, slot("3"))
        assertEquals(FxControl.PITCH_RANDOM, slot("."))
        assertEquals(FxControl.SLICE, slot("0"))
        assertEquals(FxControl.STUTTER, slot("ENTER"))
        assertEquals(-1, punchSlotForPad(12))
        assertEquals(-1, punchSlotForPad(-1))
    }

    @Test
    fun `only the sidechain's source pad ducks, and only while it is on`() {
        val fx = FxSettings.DEFAULT.withSidechain(Sidechain(on = true, group = 2, pad = 5, dests = 1))
        assertTrue(duckSource(fx, PhysicalPad(2, 5)))
        assertFalse(duckSource(fx, PhysicalPad(2, 4)))
        assertFalse(duckSource(fx, PhysicalPad(1, 5)))
        assertFalse(duckSource(fx.withSidechain(fx.sidechain.copy(on = false)), PhysicalPad(2, 5)))
        // A pad's voice (and its KEYS notes) is on its group's bus, ducking only as the source.
        assertEquals(2, voiceShape(PadSettings.DEFAULT, 2, duckSource = true).bus)
        assertTrue(voiceShape(PadSettings.DEFAULT, 2, keys = true, duckSource = true).duckSource)
        assertFalse(voiceShape(PadSettings.DEFAULT, 2).duckSource)
    }
}
