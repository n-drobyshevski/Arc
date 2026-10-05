package dev.arc.ep133.features

import dev.arc.ep133.text.BackupDevice
import dev.arc.ep133.text.BackupRecord
import dev.arc.ep133.text.LibraryRules
import dev.arc.ep133.text.SettingsText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SettingsRulesTest {
    private fun b(id: String, at: Long) =
        BackupRecord(id, id, "", at, "device", null, BackupDevice(), 0, 0, emptyList(), emptyList(), emptyMap(), 0L)

    @Test
    fun `pruning keeps the newest and drops the oldest`() {
        val list = listOf(b("c", 300), b("a", 100), b("d", 400), b("b", 200))
        assertEquals(emptyList<BackupRecord>(), LibraryRules.toPrune(list, null))
        assertEquals(emptyList<BackupRecord>(), LibraryRules.toPrune(list, 4))
        assertEquals(emptyList<BackupRecord>(), LibraryRules.toPrune(list, 10))
        assertEquals(listOf("b", "a"), LibraryRules.toPrune(list, 2).map { it.id })
        assertEquals(listOf("a"), LibraryRules.toPrune(list, 3).map { it.id })
        // Same time: the order is still fixed (by id), so the same one goes every time.
        assertEquals(listOf("x"), LibraryRules.toPrune(listOf(b("x", 5), b("y", 5)), 1).map { it.id })
    }

    @Test
    fun `settings wording`() {
        assertEquals("All", SettingsText.keepLabel(null))
        assertEquals("10", SettingsText.keepLabel(10))
        assertEquals("This deletes the oldest backup, also from Documents/arc.", SettingsText.pruneConfirm(1))
        assertEquals("This deletes the 3 oldest backups, also from Documents/arc.", SettingsText.pruneConfirm(3))
        assertEquals("Removed 1 old backup.", SettingsText.pruned(1))
        assertEquals("Removed 2 old backups.", SettingsText.pruned(2))
    }
}
