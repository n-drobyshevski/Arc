package dev.arc.ep133.features

import dev.arc.ep133.backup.Pak
import dev.arc.ep133.text.BackupRecord
import kotlinx.serialization.json.JsonPrimitive

/**
 * A factory pack arc can keep (an addition): the EP-133's and the EP-40
 * Riddim's, downloaded from teenage engineering, or the EP-1320 Medieval's,
 * which teenage engineering doesn't offer, so it is a copy of the user's own
 * Medieval backup. Each is a library entry of its own [source]; Live shows one
 * kit at a time.
 */
enum class FactoryKit(val id: String, val source: String, val sku: String, val model: String) {
    EP133("ep133", "factory", "TE032AS001", "EP-133"),
    EP1320("ep1320", "factory-ep1320", "TE032AS005", "EP-1320"),
    EP40("ep40", "factory-ep40", "TE032AS006", "EP-40");

    companion object {
        /** The kits in the order arc offers them (Settings' rows, the kit switch): the downloads first. */
        val SHOWN: List<FactoryKit> = listOf(EP133, EP40, EP1320)

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
 * The EP-40 Riddim's pack is served beside it ([FactoryKit.EP40], [download]).
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

    /** The EP-40's pack's path when last looked at (pak_release 0.2.0), beside the EP-133's. */
    const val KNOWN_PAK_40 = "/apps/ep-sample-tool/assets/ep-40-factory-content-C42FyxWp.pak"

    /** Its size then. */
    const val KNOWN_SIZE_40 = 68_853_737L

    /** The EP-40's library entry's file name. */
    const val FILE_NAME_40 = "ep-40-factory-content.pak"

    /** The project Live shows first, in any kit: the factory kit (drums on A, bass on B, keys on C). */
    const val PROJECT = 1

    private val SCRIPT = Regex("""src="(/apps/ep-sample-tool/assets/[A-Za-z0-9_.-]+\.js)"""")
    private val PAK = Regex("""/apps/ep-sample-tool/assets/ep-133-factory-content-[A-Za-z0-9_-]+\.pak""")
    private val PAK_40 = Regex("""/apps/ep-sample-tool/assets/ep-40-factory-content-[A-Za-z0-9_-]+\.pak""")

    /**
     * Where a downloadable kit's pack is: its path when last looked at
     * ([knownPak]) and [knownSize], the library entry's [fileName], and the
     * [pattern] its path has in the tool's script.
     */
    class Download(val knownPak: String, val knownSize: Long, val fileName: String, internal val pattern: Regex)

    private val EP133_DOWNLOAD = Download(KNOWN_PAK, KNOWN_SIZE, FILE_NAME, PAK)
    private val EP40_DOWNLOAD = Download(KNOWN_PAK_40, KNOWN_SIZE_40, FILE_NAME_40, PAK_40)

    /** [kit]'s download from teenage engineering; null for the EP-1320's, which they don't offer. */
    fun download(kit: FactoryKit): Download? = when (kit) {
        FactoryKit.EP133 -> EP133_DOWNLOAD
        FactoryKit.EP40 -> EP40_DOWNLOAD
        FactoryKit.EP1320 -> null
    }

    /** [kit]'s library entry's file name. */
    fun fileName(kit: FactoryKit): String = download(kit)?.fileName ?: FILE_NAME_1320

    /** The tool's script in its page, if found. */
    fun scriptPath(html: String): String? = SCRIPT.find(html)?.groupValues?.get(1)

    /** [kit]'s pack's path in the tool's script, if found (the EP-133's, not the EP-40's beside it, unless asked). */
    fun pakPath(script: String, kit: FactoryKit = FactoryKit.EP133): String? = download(kit)?.pattern?.find(script)?.value

    /**
     * [kit]'s pack's path on [ORIGIN]: from the tool's page and script, read
     * with [text], else its last known path ([Download.knownPak]). [kit] is
     * one teenage engineering offers ([download]).
     */
    suspend fun locate(kit: FactoryKit = FactoryKit.EP133, text: suspend (path: String) -> String): String {
        val d = requireNotNull(download(kit)) { "No download for ${kit.model}" }
        val found = try {
            scriptPath(text(PAGE))?.let { pakPath(text(it), kit) }
        } catch (e: kotlin.coroutines.cancellation.CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
        return found ?: d.knownPak
    }

    /** Whether [pak] is [kit]'s factory pack (its meta.json says so), the EP-133's unless asked. */
    fun isFactory(pak: Pak, kit: FactoryKit = FactoryKit.EP133): Boolean =
        meta(pak, "pak_type") == "factory" && meta(pak, "device_name") == kit.model && pak.sounds.isNotEmpty()

    /**
     * Whether [pak] can be [kit]'s pack: the EP-133's or the EP-40's download
     * ([isFactory]), or for the EP-1320 a pack with sounds made on one (its meta.json's sku
     * or name says so), a factory or a user pack alike: a Medieval reset to
     * its factory sounds backs up as a user pack.
     */
    fun fitsKit(pak: Pak, kit: FactoryKit): Boolean = when (kit) {
        FactoryKit.EP133, FactoryKit.EP40 -> isFactory(pak, kit)
        FactoryKit.EP1320 -> pak.sounds.isNotEmpty() &&
            (meta(pak, "device_sku") == FactoryKit.EP1320.sku || meta(pak, "device_name")?.contains("1320") == true)
    }

    /**
     * The kit an imported [pak] is saved as: an EP-1320 or EP-40 factory pack
     * goes straight in as that kit; anything else is an import (null), the
     * EP-133's pack too, as before.
     */
    fun importKit(pak: Pak): FactoryKit? =
        listOf(FactoryKit.EP1320, FactoryKit.EP40).firstOrNull { meta(pak, "pak_type") == "factory" && fitsKit(pak, it) }

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

    /**
     * The kit whose factory sounds a device holds, told by its slots ([device]: the slots its list has) against each
     * pack's ([packs], those saved): the pack sharing the most slots with it, counted over both lists (Jaccard), when that
     * is at least [KIT_MATCH]; else null. An EP-133 with its own sounds shares about four in ten of its slots with the
     * EP-40 Riddim's pack, and all of them with its own.
     */
    fun kitOf(device: Set<Int>, packs: Map<FactoryKit, Set<Int>>): FactoryKit? {
        if (device.isEmpty()) return null
        return packs.mapNotNull { (kit, slots) ->
            val both = device.count { it in slots }
            val either = device.size + slots.size - both
            if (either == 0) null else kit to both.toDouble() / either
        }.filter { it.second >= KIT_MATCH }.maxByOrNull { it.second }?.first
    }

    /** How much a device's slots have to be a pack's to hold that kit ([kitOf]). */
    const val KIT_MATCH = 0.6

    /** The library's pack of [kit], if it has one (the newest, should there be two). */
    fun inLibrary(backups: List<BackupRecord>, kit: FactoryKit = FactoryKit.EP133): BackupRecord? =
        backups.filter { it.source == kit.source }.maxByOrNull { it.createdAt }
}
