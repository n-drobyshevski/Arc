package dev.arc.ep133.backup

import dev.arc.ep133.text.BackupDevice
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class LibraryIndexTest {
    private val a = IndexEntry(
        "1a2b3c4d-0000-4000-8000-000000000000", "arc-20261004-230112-1a2b3c4d.pak", "Before the gig", "two \"quoted\" lines\nhere",
        1_791_154_872_000L, "device", null, BackupDevice("EP-133", "TE032AS001", "serial-1", "2.5.1"),
    )
    private val b = IndexEntry(
        "ffff", "arc-20261002-101500-ffff.pak", "my set", "", 1_790_936_100_000L, "import", "my set.pak", BackupDevice(),
    )

    @Test
    fun `file names come from the creation time and id only`() {
        assertEquals("arc-20261004-230112-1a2b3c4d.pak", LibraryIndex.fileFor(a.id, a.createdAt))
        assertEquals("arc-19700101-000000-backup.pak", LibraryIndex.fileFor("--", 0))
    }

    @Test
    fun `an index round-trips, settings included`() {
        val data = LibraryIndexData(listOf(a, b), mapOf("mirror.order" to "FROM_TOP", "mirror.learned" to "0:10,9:1"))
        val json = LibraryIndex.toJson(data)
        assertEquals(data, LibraryIndex.parse(json))
        // It names the app, so a stray library.json is easy to tell apart.
        assertEquals(true, json.startsWith("{\n  \"app\": \"arc\""))
    }

    @Test
    fun `unusable entries and files are skipped`() {
        val text = """
            {"backups": [
              {"id": "x", "file": "x.pak", "createdAt": 5},
              {"id": "", "file": "y.pak", "createdAt": 5},
              {"id": "z", "createdAt": 5},
              {"id": "w", "file": "w.pak", "createdAt": "5"},
              7
            ], "settings": {"k": "v", "n": 1}}
        """.trimIndent()
        val d = LibraryIndex.parse(text)!!
        assertEquals(listOf("x"), d.entries.map { it.id })
        assertEquals(IndexEntry("x", "x.pak", "", "", 5, "import", null, BackupDevice()), d.entries.single())
        assertEquals(mapOf("k" to "v"), d.settings)
        assertNull(LibraryIndex.parse("not json"))
        assertNull(LibraryIndex.parse("""{"sounds": {}}"""))
    }

    @Test
    fun `indexes merge by id, later ones winning`() {
        val old = LibraryIndexData(listOf(a, b), mapOf("mirror.order" to "FROM_TOP"))
        val newer = LibraryIndexData(listOf(a.copy(title = "Renamed")), mapOf("mirror.order" to "FROM_BOTTOM"))
        val m = LibraryIndex.merge(listOf(old, newer))
        assertEquals(listOf("Renamed", "my set"), m.entries.map { it.title })
        assertEquals(mapOf("mirror.order" to "FROM_BOTTOM"), m.settings)
    }

    @Test
    fun `learned pad links from an old and a new index are combined`() {
        val old = LibraryIndexData(emptyList(), mapOf("mirror.learned" to "0:10,1:11,2:12", "app.theme" to "DARK"))
        val newer = LibraryIndexData(emptyList(), mapOf("mirror.learned" to "5:12"))
        val m = LibraryIndex.merge(listOf(old, newer))
        assertEquals(mapOf("mirror.learned" to "0:10,1:11,5:12", "app.theme" to "DARK"), m.settings)
    }
}
