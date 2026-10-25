package dev.arc.ep133.text

import dev.arc.ep133.features.ChangeKind
import dev.arc.ep133.features.PadChange
import dev.arc.ep133.features.PadGroup
import dev.arc.ep133.features.PadOrder
import dev.arc.ep133.features.PakCompareResult
import dev.arc.ep133.features.ProjectChange
import dev.arc.ep133.features.SoundChange
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The same strings as web/test/core/text/shareText.test.ts: both platforms share the same text. */
class ShareTextTest {
    private fun group(name: String, vararg pads: Pair<Int, Int?>) = PadGroup(name, linkedMapOf(*pads))

    @Test
    fun `names pads by the pad order`() {
        assertEquals("A7", ShareText.padLabel("a", 1, PadOrder.FROM_TOP))
        assertEquals("B.", ShareText.padLabel("b", 10, PadOrder.FROM_TOP))
        assertEquals("CE", ShareText.padLabel("c", 12, PadOrder.FROM_TOP))
        assertEquals("D.", ShareText.padLabel("d", 1, PadOrder.FROM_BOTTOM))
        assertEquals("AE", ShareText.padLabel("a", 3, PadOrder.FROM_BOTTOM))
        assertEquals("A9", ShareText.padLabel("a", 12, PadOrder.FROM_BOTTOM))
        assertNull(ShareText.padLabel("a", 13, PadOrder.FROM_TOP))
        assertNull(ShareText.padLabel("a", 0, PadOrder.FROM_BOTTOM))
        assertNull(ShareText.padLabel("e", 1, PadOrder.FROM_TOP))
    }

    @Test
    fun `shares a kit as sound lines with the sound list`() {
        val groups = listOf(
            group("a", 1 to 12, 2 to 105, 10 to null, 11 to null, 12 to 200),
            group("b", 4 to 300, 5 to 77),
            group("c", 1 to null),
            group("x", 1 to 12),
        )
        val names = linkedMapOf(300 to "rim", 12 to "Kick 808", 105 to "snare\tclap", 200 to "200.pcm")
        assertEquals(
            listOf(
                "My EP-133 kit, shared from arc 1.2.3",
                "The pads of project 3, from the EP-133. Pads are named by arc's pad order setting, from the top (pad file 1 is 7); community notes disagree on it.",
                "",
                "```",
                "ARC BEAT 1",
                "name Project 3 kit",
                "# no sound on: A. A0 C7",
                "[A]",
                "sound A7 12 Kick 808",
                "sound A8 105 snare clap",
                "sound AE 200 200.pcm",
                "[B]",
                "sound B4 300 rim",
                "sound B5 77 # not in the sound list",
                "```",
                "",
                "My EP-133's sounds (slot name), from the EP-133:",
                ShareText.FACTORY_NAMES,
                "12 Kick 808",
                "105 snare clap",
                "200 200.pcm",
                "300 rim",
                "",
            ).joinToString("\n"),
            ShareText.kit("1.2.3", 3, groups, names, PadOrder.FROM_TOP, ShareText.FROM_DEVICE),
        )
    }

    @Test
    fun `orders pads as the keypad, counted from the bottom`() {
        val groups = listOf(group("d", 1 to 5, 12 to 6, 3 to null))
        assertEquals(
            listOf(
                "My EP-133 kit, shared from arc 1.2.3",
                "The pads of project 9, from the backup \"Friday\". Pads are named by arc's pad order setting, from the bottom (pad file 1 is .); community notes disagree on it.",
                "",
                "```",
                "ARC BEAT 1",
                "name Project 9 kit",
                "# no sound on: DE",
                "[D]",
                "sound D9 6",
                "sound D. 5",
                "```",
                "",
            ).joinToString("\n"),
            ShareText.kit("1.2.3", 9, groups, emptyMap(), PadOrder.FROM_BOTTOM, ShareText.fromBackup("Friday")),
        )
    }

    @Test
    fun `says when no pad has a sound`() {
        val text = ShareText.kit("1.2.3", 2, listOf(group("a", 1 to null)), mapOf(1 to "kick"), PadOrder.FROM_TOP, ShareText.FROM_DEVICE)
        assertEquals(
            listOf(
                "No sound on any pad of project 2.",
                "",
                "My EP-133's sounds (slot name), from the EP-133:",
                "1 kick",
                "",
            ),
            text.split("\n").drop(3),
        )
    }

    @Test
    fun `cleans names as a card does, so a sound line and the list agree`() {
        // A ' #' would start a comment on the sound line; the skill's clean_text drops # and |.
        val text = ShareText.kit("0.2.0", 1, listOf(group("a", 1 to 12)), mapOf(12 to "Kick #2 | hard"), PadOrder.FROM_TOP, ShareText.FROM_DEVICE)
        val lines = text.split("\n")
        assertTrue("sound A7 12 Kick 2 hard" in lines)
        assertTrue("12 Kick 2 hard" in lines)
    }

    @Test
    fun `shares a sound list, cut when long`() {
        assertEquals(
            "My EP-133 sounds, shared from arc 1.2.3\n\nMy EP-133's sounds (slot name), from the backup \"Fri\":\n1 kick\n9 hat\n",
            ShareText.sounds("1.2.3", linkedMapOf(9 to "hat", 1 to " kick "), ShareText.fromBackup("Fri")),
        )
        assertEquals(
            "My EP-133 sounds, shared from arc 1.2.3\n\nNo sounds in the EP-133.\n",
            ShareText.sounds("1.2.3", emptyMap(), ShareText.FROM_DEVICE),
        )
        val many = (1..999).associateWith { "sound number $it" }
        val text = ShareText.sounds("1.2.3", many, ShareText.FROM_DEVICE)
        val lines = text.split("\n")
        assertEquals("1 sound number 1", lines[3])
        assertEquals("400 sound number 400", lines[ShareText.MAX_SOUNDS + 2])
        assertEquals("# 599 more sounds left out", lines[ShareText.MAX_SOUNDS + 3])
        assertTrue(text.length < 20_000)
        assertEquals("# 1 more line left out", ShareText.leftOut(1, "line"))
    }

    @Test
    fun `shares what changed between two backups`() {
        val r = PakCompareResult(
            listOf(
                SoundChange(5, ChangeKind.ADDED, null, "clap"),
                SoundChange(3, ChangeKind.REMOVED, "hat", null),
                SoundChange(2, ChangeKind.CHANGED, "snare", "snare 2", audioChanged = true, renamed = true),
                SoundChange(7, ChangeKind.CHANGED, "tom", "tom", settingsChanged = listOf("sound.pitch")),
            ),
            listOf(
                ProjectChange(4, ChangeKind.ADDED),
                ProjectChange(6, ChangeKind.REMOVED),
                ProjectChange(1, ChangeKind.CHANGED, listOf(PadChange("a", 3, 1, 5), PadChange("b", 10, null, 9))),
                ProjectChange(2, ChangeKind.CHANGED, emptyList(), true),
                ProjectChange(3, ChangeKind.CHANGED, emptyList(), false),
            ),
            1,
            0,
        )
        val oldNames = mapOf(1 to "kick", 3 to "hat")
        val newNames = mapOf(5 to "clap")
        assertEquals(
            listOf(
                "Two of my EP-133 backups compared, shared from arc 1.2.3",
                "From Fri (Oct 4, 2026) to Sat (Oct 5, 2026)",
                "",
                "Sounds added:",
                "+ 5 clap",
                "Sounds removed:",
                "- 3 hat",
                "Sounds changed:",
                "~ 2 snare 2: Renamed from snare; audio changed",
                "~ 7 tom: Settings changed: Pitch",
                "Projects added:",
                "+ Project 4",
                "Projects removed:",
                "- Project 6",
                "Projects changed:",
                "~ Project 1:",
                "  A9 1 kick → 5 clap",
                "  B. empty → 9",
                "~ Project 2: Patterns or settings changed; each pad still has the same sound.",
                "~ Project 3: Changed.",
                "Unchanged: 1 sound.",
                "",
            ).joinToString("\n"),
            ShareText.compare("1.2.3", "From Fri (Oct 4, 2026) to Sat (Oct 5, 2026)", r, oldNames, newNames, PadOrder.FROM_TOP),
        )
    }

    @Test
    fun `says when nothing changed, and cuts a long compare`() {
        assertEquals(
            "Two of my EP-133 backups compared, shared from arc 1.2.3\nFrom a to b\n\nNothing changed: the same sounds and projects.\n",
            ShareText.compare("1.2.3", "From a to b", PakCompareResult(emptyList(), emptyList(), 3, 2), emptyMap(), emptyMap(), PadOrder.FROM_TOP),
        )
        val added = (1..200).map { SoundChange(it, ChangeKind.ADDED, null, "s$it") }
        val lines = ShareText.compare("1.2.3", "From a to b", PakCompareResult(added, emptyList(), 0, 0), emptyMap(), emptyMap(), PadOrder.FROM_TOP)
            .split("\n")
        assertEquals("Sounds added:", lines[3])
        assertEquals("+ 149 s149", lines[3 + ShareText.MAX_CHANGES - 1])
        assertEquals("# 51 more lines left out", lines[3 + ShareText.MAX_CHANGES])
        assertEquals("", lines.last())
    }
}
