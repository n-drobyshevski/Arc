package dev.arc.ep133.features

import dev.arc.ep133.backup.Pak
import dev.arc.ep133.text.BackupRecord
import kotlinx.serialization.json.JsonPrimitive

/**
 * A factory pack arc can keep (an addition): the EP-133's, downloaded from
 * teenage engineering, or the EP-1320 Medieval's, which teenage engineering
 * doesn't offer, so it is a copy of the user's own Medieval backup. Each is a
 * library entry of its own [source]; Live shows one kit at a time.
 */
enum class FactoryKit(val id: String, val source: String, val sku: String, val model: String) {
    EP133("ep133", "factory", "TE032AS001", "EP-133"),
    EP1320("ep1320", "factory-ep1320", "TE032AS005", "EP-1320");

    companion object {
        fun ofId(id: String?): FactoryKit? = entries.firstOrNull { it.id == id }

        /** The kit a library entry's source keeps; null for a backup or an import. */
        fun ofSource(source: String?): FactoryKit? = entries.firstOrNull { it.source == source }

        /** The kit of a device, by its sku (DeviceInfo.sku); null for any other device. */
        fun ofSku(sku: String?): FactoryKit? = entries.firstOrNull { it.sku == sku }
    }
}

/**
 * The EP-133's factory sounds (an addition): the pack teenage engineering's
 * own EP Sample Tool restores a device with, a .pak served beside the tool on
 * their site. arc keeps it as a library entry of its own [SOURCE] (never
 * pruned), so it is browsed, searched and restored like a backup, and Live
 * plays its projects ([PROJECT] first) while no EP-133 is connected.
 *
 * The pack's file name carries a build hash that changes when the tool is
 * rebuilt, so it is looked up in the tool's page and script ([locate]); the
 * last name known ([KNOWN_PAK]) stands in when that fails.
 *
 * teenage engineering offers no pack for the EP-1320 Medieval, so its kit
 * ([FactoryKit.EP1320]) is a copy of a Medieval backup the user made, kept
 * beside the EP-133's under a source of its own ([fitsKit], [canUseAsFactory]).
 */
object FactorySounds {
    /** A library entry's source for the factory pack (beside "device" and "import"): the EP-133's kit ([FactoryKit.EP133]). */
    const val SOURCE = "factory"

    const val ORIGIN = "https://teenage.engineering"

    /** The EP Sample Tool's page, on [ORIGIN]. */
    const val PAGE = "/apps/ep-sample-tool"

    /** The pack's path when last looked at (Nov 2023's pack, OS 1.1.0). */
    const val KNOWN_PAK = "/apps/ep-sample-tool/assets/ep-133-factory-content-DRyE_DHC.pak"

    /** Its size then, for the progress when the server gives none. */
    const val KNOWN_SIZE = 27_375_018L

    /** The library entry's file name. */
    const val FILE_NAME = "ep-133-factory-content.pak"

    /** The EP-1320's copy's file name. */
    const val FILE_NAME_1320 = "ep-1320-factory-content.pak"

    /** The project Live shows first, in either kit: the factory kit (drums on A, bass on B, keys on C). */
    const val PROJECT = 1

    private val SCRIPT = Regex("""src="(/apps/ep-sample-tool/assets/[A-Za-z0-9_.-]+\.js)"""")
    private val PAK = Regex("""/apps/ep-sample-tool/assets/ep-133-factory-content-[A-Za-z0-9_-]+\.pak""")

    /** The tool's script in its page, if found. */
    fun scriptPath(html: String): String? = SCRIPT.find(html)?.groupValues?.get(1)

    /** The EP-133 pack's path in the tool's script, if found (not the EP-40's beside it). */
    fun pakPath(script: String): String? = PAK.find(script)?.value

    /**
     * The pack's path on [ORIGIN]: from the tool's page and script, read with
     * [text], else [KNOWN_PAK].
     */
    suspend fun locate(text: suspend (path: String) -> String): String {
        val found = try {
            scriptPath(text(PAGE))?.let { pakPath(text(it)) }
        } catch (e: kotlin.coroutines.cancellation.CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
        return found ?: KNOWN_PAK
    }

    /** Whether [pak] is an EP-133 factory pack (its meta.json says so). */
    fun isFactory(pak: Pak): Boolean =
        meta(pak, "pak_type") == "factory" && meta(pak, "device_name") == "EP-133" && pak.sounds.isNotEmpty()

    /**
     * Whether [pak] can be [kit]'s pack: the EP-133's download ([isFactory]),
     * or for the EP-1320 a pack with sounds made on one (its meta.json's sku
     * or name says so), a factory or a user pack alike: a Medieval reset to
     * its factory sounds backs up as a user pack.
     */
    fun fitsKit(pak: Pak, kit: FactoryKit): Boolean = when (kit) {
        FactoryKit.EP133 -> isFactory(pak)
        FactoryKit.EP1320 -> pak.sounds.isNotEmpty() &&
            (meta(pak, "device_sku") == FactoryKit.EP1320.sku || meta(pak, "device_name")?.contains("1320") == true)
    }

    /** The kit an imported [pak] is saved as: an EP-1320 factory pack goes straight in as that kit; anything else is an import (null). */
    fun importKit(pak: Pak): FactoryKit? =
        FactoryKit.EP1320.takeIf { meta(pak, "pak_type") == "factory" && fitsKit(pak, it) }

    /** Whether [b] can be copied in as the EP-1320's factory sounds: a Medieval's backup, not a factory pack already. */
    fun canUseAsFactory(b: BackupRecord): Boolean =
        !isFactorySource(b.source) && (b.device.sku == FactoryKit.EP1320.sku || "1320" in b.device.product)

    /** Whether a library entry's [source] is one of the kits' (never pruned). */
    fun isFactorySource(source: String?): Boolean = FactoryKit.ofSource(source) != null

    private fun meta(pak: Pak, k: String) = (pak.meta[k] as? JsonPrimitive)?.takeIf { it.isString }?.content

    /** What Live shows from the pack: [project]'s pads and every sound's name; null when it has none. */
    fun snapshot(pak: Pak, savedAt: Long, project: Int = PROJECT): LiveSnapshot? {
        val tar = pak.projects[project] ?: return null
        val groups = ProjectPads.read(tar).takeIf { it.isNotEmpty() } ?: return null
        return LiveSnapshot(savedAt, project, groups, pak.sounds.mapValues { it.value.name })
    }

    /** The pack's projects with pads (the ones [snapshot] shows), in order: PROJECT steps through them offline. */
    fun projects(pak: Pak): List<Int> =
        pak.projects.filter { (_, tar) -> ProjectPads.read(tar).isNotEmpty() }.keys.sorted()

    /**
     * Whether [name] is the one the EP-133 gives a sound nobody named, its
     * slot's file ("343.pcm"): how a device still holding the factory sounds
     * lists them. Live plays such a pad from the pack when it has no copy of
     * its own (a sample recorded on the device into that slot would be
     * named so too, but arc copies it while connected).
     */
    fun unnamed(slot: Int, name: String): Boolean = name.trim().equals(slot.toString().padStart(3, '0') + ".pcm", ignoreCase = true)

    /** The library's pack of [kit], if it has one (the newest, should there be two). */
    fun inLibrary(backups: List<BackupRecord>, kit: FactoryKit = FactoryKit.EP133): BackupRecord? =
        backups.filter { it.source == kit.source }.maxByOrNull { it.createdAt }
}
