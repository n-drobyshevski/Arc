package dev.arc.ep133.text

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.ZoneOffset
import java.util.Locale

class TextTest {
    private val b = BackupRecord(
        id = "x", title = "Backup Oct 4, 1:05 PM", notes = "", createdAt = 0, source = "device", fileName = null,
        device = BackupDevice("EP-133", "TE032AS001", "E3PTV2JT", "2.0.5"),
        soundCount = 4, projectCount = 3, projects = listOf(1, 2, 5), slots = listOf(1, 2, 3, 9),
        projectSlots = mapOf(1 to listOf(1, 2), 2 to listOf(2, 3), 5 to emptyList()), size = 1536,
    )

    @Test
    fun `fmtBytes and plural`() {
        assertEquals(listOf("0 B", "1023 B", "1 KB", "2 KB", "1024 KB", "1.0 MB", "1.5 MB", "10 MB", "64 MB"),
            listOf(0L, 1023, 1024, 1536, 1048575, 1048576, 1572864, 10485760, 67108864).map { Format.bytes(it) })
        assertEquals("0 sounds", Format.plural(0, "sound"))
        assertEquals("1 project", Format.plural(1, "project"))
        assertEquals("1, 2, and 5", Format.list(listOf("1", "2", "5")))
        assertEquals("1 and 2", Format.list(listOf("1", "2")))
    }

    @Test
    fun `dates use plain spaces`() {
        val ms = 1_791_119_124_116L
        assertEquals("Oct 4, 1:05 PM", Format.date(ms, Format.DATE_TIME_PATTERN, Locale.US, ZoneOffset.UTC))
        assertEquals("Oct 4, 2026", Format.date(ms, Format.DAY_PATTERN, Locale.US, ZoneOffset.UTC))
        assertEquals("Oct 4, 1:05 PM", Format.date(ms, "MMM d, h:mm\u202Fa", Locale.US, ZoneOffset.UTC))
    }

    @Test
    fun `file names`() {
        assertEquals("backup-oct-4-105-pm.pak", LibraryRules.fileNameFor("Backup Oct 4, 1:05 PM"))
        assertEquals("ep133-backup.pak", LibraryRules.fileNameFor("ÄÖÜ!!"))
        assertEquals("my_set--2.pak", LibraryRules.fileNameFor("  My_Set  -2 ")) // as the JS: "-" stays, then spaces become "-"
        assertEquals("live set", LibraryRules.importTitle("live set.PAK"))
        assertEquals("a.zip", LibraryRules.importTitle("a.zip.zip"))
        assertEquals("Imported backup", LibraryRules.importTitle(".pak"))
        assertEquals("notes.txt", LibraryRules.importTitle("notes.txt"))
    }

    @Test
    fun `restore selection, button and warning`() {
        val all = LibraryRules.restoreSelection(b, everything = true, picked = emptyList(), alsoOther = false)
        assertEquals(RestoreSelection(listOf(1, 2, 3, 9), listOf(1, 2, 5)), all)
        assertEquals("Restore 4 sounds and 3 projects", LibraryRules.restoreButton(all))
        assertEquals(
            "This overwrites projects 1, 2, and 5 and 4 sample slots on your EP-133. Everything else on the device stays as it is.",
            LibraryRules.restoreWarning(all),
        )
        val one = LibraryRules.restoreSelection(b, everything = false, picked = listOf(2), alsoOther = false)
        assertEquals(RestoreSelection(listOf(2, 3), listOf(2)), one)
        assertEquals("This overwrites project 2 and 2 sample slots on your EP-133. Everything else on the device stays as it is.", LibraryRules.restoreWarning(one))
        // "other" adds sounds used by no project at all (9), not just by no picked one.
        val other = LibraryRules.restoreSelection(b, everything = false, picked = listOf(5), alsoOther = true)
        assertEquals(RestoreSelection(listOf(9), listOf(5)), other)
        val none = LibraryRules.restoreSelection(b, everything = false, picked = emptyList(), alsoOther = false)
        assertEquals("Pick something to restore", LibraryRules.restoreButton(none))
        assertEquals("", LibraryRules.restoreWarning(none))
        assertEquals("Restore 1 sound", LibraryRules.restoreButton(RestoreSelection(listOf(9), emptyList())))
    }

    @Test
    fun `detail facts and project lines`() {
        assertEquals(
            listOf("Made" to "Oct 4", "From" to "EP-133, E3PTV2JT", "OS" to "2.0.5", "Contents" to "4 sounds, 3 projects", "Size" to "2 KB"),
            LibraryRules.facts(b, "Oct 4"),
        )
        val imp = b.copy(source = "import", fileName = "friend.pak", device = BackupDevice())
        assertEquals("Imported file, friend.pak", LibraryRules.facts(imp, "x").first { it.first == "From" }.second)
        assertEquals(null, LibraryRules.facts(imp, "x").firstOrNull { it.first == "OS" })
        assertEquals("", LibraryRules.projectSoundsDetail(b, 5))
        assertEquals("0 sounds", LibraryRules.projectSoundsRestore(b, 5))
        assertEquals("2 sounds", LibraryRules.projectSoundsDetail(b, 1))
    }

    @Test
    fun `toasts and notes`() {
        assertEquals("Saved 1 sound and 0 projects.", Strings.saved(1, 0))
        assertEquals("Restored 12 sounds and 3 projects.", Strings.restored(12, 3))
        assertEquals("Imported 2 sounds and 1 project.", Strings.imported(2, 1))
        assertEquals("Couldn't import x.pak: This file has no sounds or projects in it", Strings.importFailed("x.pak", "This file has no sounds or projects in it"))
        assertEquals("Delete \"My set\" from this phone? This can't be undone.", Strings.deleteConfirm("My set"))
        assertEquals("2 backups, 3.0 MB stored on this phone (1.0 MB space left).", Strings.storageNote(2, 3L * 1048576, 1048576))
        assertEquals("", Strings.storageNote(0, 0, 5))
        assertEquals("1.5 MB of 64 MB used", Strings.meterDescription(1572864.0, 67108864.0))
        assertEquals("4 sounds, 3 projects, 2 KB", Strings.backupRowMeta(4, 3, 1536))
    }
}
