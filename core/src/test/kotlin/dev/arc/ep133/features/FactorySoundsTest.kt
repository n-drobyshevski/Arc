package dev.arc.ep133.features

import dev.arc.ep133.backup.Pak
import dev.arc.ep133.backup.PakSound
import dev.arc.ep133.testing.pad
import dev.arc.ep133.testing.tarFile
import dev.arc.ep133.text.BackupDevice
import dev.arc.ep133.text.BackupRecord
import dev.arc.ep133.text.LibraryRules
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class FactorySoundsTest {
    // The EP Sample Tool's page and a line of its script, as served (Oct 2026).
    private val page = """
        <link rel="icon" type="image/x-icon" href="/apps/ep-sample-tool/assets/favicon-CV1VhAGr.ico" />
        <script type="module" crossorigin src="/apps/ep-sample-tool/assets/index-C1wBjhTa.js"></script>
        <link rel="stylesheet" crossorigin href="/apps/ep-sample-tool/assets/index-qny0Yi1N.css">
    """.trimIndent()
    private val script = """const a="/apps/ep-sample-tool/assets/ep-40-factory-content-C42FyxWp.pak",""" +
        """b="/apps/ep-sample-tool/assets/ep-133-factory-content-DRyE_DHC.pak";"""

    @Test
    fun `the pack is found through the tool's page and script`() = runTest {
        assertEquals("/apps/ep-sample-tool/assets/index-C1wBjhTa.js", FactorySounds.scriptPath(page))
        assertEquals("/apps/ep-sample-tool/assets/ep-133-factory-content-DRyE_DHC.pak", FactorySounds.pakPath(script))
        val asked = mutableListOf<String>()
        val path = FactorySounds.locate { p ->
            asked += p
            if (p == FactorySounds.PAGE) page else script.replace("DRyE_DHC", "N3w-H4sh")
        }
        assertEquals("/apps/ep-sample-tool/assets/ep-133-factory-content-N3w-H4sh.pak", path)
        assertEquals(listOf(FactorySounds.PAGE, "/apps/ep-sample-tool/assets/index-C1wBjhTa.js"), asked)
    }

    @Test
    fun `the last known path stands in when the lookup fails`() = runTest {
        assertEquals(FactorySounds.KNOWN_PAK, FactorySounds.locate { throw java.io.IOException("offline") })
        assertEquals(FactorySounds.KNOWN_PAK, FactorySounds.locate { "<html></html>" })
        assertEquals(FactorySounds.KNOWN_PAK, FactorySounds.locate { p -> if (p == FactorySounds.PAGE) page else "nothing here" })
    }

    private fun pak(meta: Map<String, String>, projects: Map<Int, ByteArray>) = Pak(
        JsonObject(meta.mapValues { JsonPrimitive(it.value) }),
        JsonObject(emptyMap()),
        linkedMapOf(1 to PakSound(1, "micro kick", ByteArray(0), null), 100 to PakSound(100, "nt snare", ByteArray(0), null)),
        LinkedHashMap(projects),
    )

    private val factoryMeta = mapOf("pak_type" to "factory", "device_name" to "EP-133")

    @Test
    fun `only an EP-133 factory pack counts`() {
        assertTrue(FactorySounds.isFactory(pak(factoryMeta, emptyMap())))
        assertFalse(FactorySounds.isFactory(pak(factoryMeta + ("pak_type" to "user"), emptyMap())))
        assertFalse(FactorySounds.isFactory(pak(factoryMeta + ("device_name" to "EP-40"), emptyMap())))
        assertFalse(FactorySounds.isFactory(pak(emptyMap(), emptyMap())))
    }

    @Test
    fun `Live shows project 1's pads with every sound's name`() {
        val p1 = tarFile(listOf("pads/a/p01" to pad(100), "pads/a/p10" to pad(1), "pads/b/p01" to pad(0)))
        val snap = FactorySounds.snapshot(pak(factoryMeta, mapOf(1 to p1, 2 to tarFile(emptyList()))), 5L)!!
        assertEquals(5L, snap.savedAt)
        assertEquals(1, snap.activeProject)
        assertEquals(listOf("a", "b"), snap.groups.map { it.name })
        assertEquals(mapOf(1 to 100, 10 to 1), snap.groups[0].pads)
        assertEquals(mapOf(1 to null), snap.groups[1].pads)
        assertEquals(mapOf(1 to "micro kick", 100 to "nt snare"), snap.names)
        // No project 1, or one without pads: nothing to show.
        assertNull(FactorySounds.snapshot(pak(factoryMeta, mapOf(2 to p1)), 5L))
        assertNull(FactorySounds.snapshot(pak(factoryMeta, mapOf(1 to tarFile(emptyList()))), 5L))
    }

    @Test
    fun `a sound is unnamed when the device lists it as its slot's file`() {
        assertTrue(FactorySounds.unnamed(343, "343.pcm"))
        assertTrue(FactorySounds.unnamed(1, "001.pcm"))
        assertTrue(FactorySounds.unnamed(1, " 001.PCM "))
        assertFalse(FactorySounds.unnamed(1, "1.pcm"))
        assertFalse(FactorySounds.unnamed(2, "001.pcm")) // another slot's file: moved, not the factory sound
        assertFalse(FactorySounds.unnamed(343, "nt perc"))
    }

    private fun rec(id: String, createdAt: Long, source: String) = BackupRecord(
        id, id, "", createdAt, source, null, BackupDevice(), 0, 0, emptyList(), emptyList(), emptyMap(), 0,
    )

    @Test
    fun `the factory pack is found in the library and never pruned`() {
        val factory = rec("f", 1L, FactorySounds.SOURCE)
        val backups = listOf(rec("a", 10L, "device"), factory, rec("b", 20L, "import"), rec("c", 30L, "device"))
        assertEquals(factory, FactorySounds.inLibrary(backups))
        assertNull(FactorySounds.inLibrary(backups - factory))
        // Keep 2: the oldest own backup goes; the factory pack, older still, is neither counted nor deleted.
        assertEquals(listOf("a"), LibraryRules.toPrune(backups, 2).map { it.id })
        assertEquals(emptyList<BackupRecord>(), LibraryRules.toPrune(backups, 3))
        assertEquals(LibraryRules.FACTORY_FROM, LibraryRules.facts(factory, "").toMap()["From"])
    }
}
