package dev.arc.ep133.features

import dev.arc.ep133.backup.Pak
import dev.arc.ep133.text.BackupRecord
import kotlinx.serialization.json.JsonPrimitive

/**
 * The EP-133's factory sounds (an addition): the pack teenage engineering's
 * own EP Sample Tool restores a device with, a .pak served beside the tool on
 * their site. arc keeps it as a library entry of its own [SOURCE] (never
 * pruned), so it is browsed, searched and restored like a backup, and Live
 * plays its [PROJECT] while no EP-133 has been read yet.
 *
 * The pack's file name carries a build hash that changes when the tool is
 * rebuilt, so it is looked up in the tool's page and script ([locate]); the
 * last name known ([KNOWN_PAK]) stands in when that fails.
 */
object FactorySounds {
    /** A library entry's source for the factory pack (beside "device" and "import"). */
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

    /** The project Live shows: the factory kit (drums on A, bass on B, keys on C). */
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
    fun isFactory(pak: Pak): Boolean {
        fun meta(k: String) = (pak.meta[k] as? JsonPrimitive)?.takeIf { it.isString }?.content
        return meta("pak_type") == "factory" && meta("device_name") == "EP-133" && pak.sounds.isNotEmpty()
    }

    /** What Live shows from the pack: [PROJECT]'s pads and every sound's name; null when it has none. */
    fun snapshot(pak: Pak, savedAt: Long): LiveSnapshot? {
        val tar = pak.projects[PROJECT] ?: return null
        val groups = ProjectPads.read(tar).takeIf { it.isNotEmpty() } ?: return null
        return LiveSnapshot(savedAt, PROJECT, groups, pak.sounds.mapValues { it.value.name })
    }

    /**
     * Live's pad links for the factory sounds, where nothing can be learned
     * (no device): the [learned] ones, the rest numbered from the top row as
     * arc writes pads before any press (PadPush.topNumber), which puts the
     * factory kit's kicks on '.' and '0'. Never saved as learned.
     */
    fun links(learned: Map<Int, Int>): Map<Int, Int> {
        val out = LinkedHashMap(learned)
        for (offset in 0..11) {
            val n = PadPush.topNumber(offset)
            if (offset !in out && n !in out.values) out[offset] = n
        }
        return out
    }

    /** The library's factory pack, if it has one (the newest, should there be two). */
    fun inLibrary(backups: List<BackupRecord>): BackupRecord? =
        backups.filter { it.source == SOURCE }.maxByOrNull { it.createdAt }
}
