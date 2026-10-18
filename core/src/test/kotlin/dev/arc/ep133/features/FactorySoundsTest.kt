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
    fun `offline, PROJECT steps through the pack's projects with pads`() {
        val p1 = tarFile(listOf("pads/a/p01" to pad(100)))
        val p3 = tarFile(listOf("pads/c/p02" to pad(1)))
        val p = pak(factoryMeta, mapOf(3 to p3, 1 to p1, 2 to tarFile(emptyList())))
        assertEquals(listOf(1, 3), FactorySounds.projects(p))
        val snap = FactorySounds.snapshot(p, 5L, project = 3)!!
        assertEquals(3, snap.activeProject)
        assertEquals(listOf("c"), snap.groups.map { it.name })
        assertEquals(mapOf(2 to 1), snap.groups[0].pads)
        assertEquals(mapOf(1 to "micro kick", 100 to "nt snare"), snap.names)
        assertNull(FactorySounds.snapshot(p, 5L, project = 2))
        assertNull(FactorySounds.snapshot(p, 5L, project = 4))
        assertEquals(emptyList<Int>(), FactorySounds.projects(pak(factoryMeta, emptyMap())))
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

    private fun rec(id: String, createdAt: Long, source: String, device: BackupDevice) = rec(id, createdAt, source).copy(device = device)

    private val medievalMeta = mapOf("pak_type" to "user", "device_name" to "EP-1320", "device_sku" to "TE032AS005")

    @Test
    fun `a kit is found by its id, its library source and its device's sku`() {
        assertEquals(FactoryKit.EP133, FactoryKit.ofSku("TE032AS001"))
        assertEquals(FactoryKit.EP1320, FactoryKit.ofSku("TE032AS005"))
        assertNull(FactoryKit.ofSku("TE032AS003"))
        assertNull(FactoryKit.ofSku(null))
        assertEquals(FactoryKit.EP1320, FactoryKit.ofId("ep1320"))
        assertNull(FactoryKit.ofId("ep40"))
        assertEquals(FactoryKit.EP133, FactoryKit.ofSource(FactorySounds.SOURCE))
        assertEquals(FactoryKit.EP1320, FactoryKit.ofSource("factory-ep1320"))
        assertNull(FactoryKit.ofSource("device"))
        assertTrue(FactorySounds.isFactorySource("factory-ep1320"))
        assertFalse(FactorySounds.isFactorySource("import"))
    }

    @Test
    fun `each kit finds its own pack, never the other's`() {
        val ep133 = rec("f", 1L, FactorySounds.SOURCE)
        val medieval = rec("m", 2L, FactoryKit.EP1320.source)
        val newer = rec("m2", 3L, FactoryKit.EP1320.source)
        val backups = listOf(rec("a", 10L, "device"), ep133, medieval, newer)
        assertEquals(ep133, FactorySounds.inLibrary(backups))
        assertEquals(ep133, FactorySounds.inLibrary(backups, FactoryKit.EP133))
        assertEquals(newer, FactorySounds.inLibrary(backups, FactoryKit.EP1320))
        assertNull(FactorySounds.inLibrary(listOf(ep133), FactoryKit.EP1320))
        assertNull(FactorySounds.inLibrary(listOf(medieval), FactoryKit.EP133))
    }

    @Test
    fun `a Medieval's pack fits its kit, a factory or a user pack alike`() {
        assertTrue(FactorySounds.fitsKit(pak(medievalMeta, emptyMap()), FactoryKit.EP1320))
        assertTrue(FactorySounds.fitsKit(pak(medievalMeta + ("pak_type" to "factory"), emptyMap()), FactoryKit.EP1320))
        // Named so without its sku, or its sku alone.
        assertTrue(FactorySounds.fitsKit(pak(mapOf("device_name" to "EP-1320 Medieval"), emptyMap()), FactoryKit.EP1320))
        assertTrue(FactorySounds.fitsKit(pak(mapOf("device_sku" to "TE032AS005"), emptyMap()), FactoryKit.EP1320))
        // The EP-133's pack isn't the Medieval's, nor the other way round; and a pack needs sounds.
        assertFalse(FactorySounds.fitsKit(pak(factoryMeta + ("device_sku" to "TE032AS001"), emptyMap()), FactoryKit.EP1320))
        assertFalse(FactorySounds.fitsKit(pak(medievalMeta + ("pak_type" to "factory"), emptyMap()), FactoryKit.EP133))
        assertTrue(FactorySounds.fitsKit(pak(factoryMeta, emptyMap()), FactoryKit.EP133))
        val silent = Pak(JsonObject(medievalMeta.mapValues { JsonPrimitive(it.value) }), JsonObject(emptyMap()), LinkedHashMap(), LinkedHashMap())
        assertFalse(FactorySounds.fitsKit(silent, FactoryKit.EP1320))
    }

    @Test
    fun `an imported EP-1320 factory pack goes in as its kit, anything else as an import`() {
        assertEquals(FactoryKit.EP1320, FactorySounds.importKit(pak(medievalMeta + ("pak_type" to "factory"), emptyMap())))
        // A Medieval's own backup is an import: Use as factory sounds copies it.
        assertNull(FactorySounds.importKit(pak(medievalMeta, emptyMap())))
        // The EP-133's pack imported by hand stays an import, as before.
        assertNull(FactorySounds.importKit(pak(factoryMeta, emptyMap())))
    }

    @Test
    fun `only a Medieval's backup can be used as factory sounds`() {
        val medieval = BackupDevice("EP-1320", "TE032AS005", "", "1.0.0")
        assertTrue(FactorySounds.canUseAsFactory(rec("a", 1L, "device", medieval)))
        assertTrue(FactorySounds.canUseAsFactory(rec("b", 1L, "import", BackupDevice(product = "EP-1320 Medieval"))))
        assertFalse(FactorySounds.canUseAsFactory(rec("c", 1L, "device", BackupDevice("EP-133", "TE032AS001"))))
        // The copy itself isn't offered again.
        assertFalse(FactorySounds.canUseAsFactory(rec("d", 1L, FactoryKit.EP1320.source, medieval)))
    }

    @Test
    fun `neither kit is pruned, and each says where it came from`() {
        val ep133 = rec("f", 1L, FactorySounds.SOURCE)
        val medieval = rec("m", 2L, FactoryKit.EP1320.source, BackupDevice("EP-1320", "TE032AS005"))
        val backups = listOf(rec("a", 10L, "device"), ep133, medieval, rec("b", 20L, "import"))
        assertEquals(listOf("a"), LibraryRules.toPrune(backups, 1).map { it.id })
        assertEquals(emptyList<BackupRecord>(), LibraryRules.toPrune(backups, 2))
        assertEquals("Your backup, used as EP-1320 factory sounds", LibraryRules.facts(medieval, "").toMap()["From"])
        assertEquals(LibraryRules.FACTORY_FROM, LibraryRules.facts(ep133, "").toMap()["From"])
    }
}
