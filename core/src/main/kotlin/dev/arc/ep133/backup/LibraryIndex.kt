package dev.arc.ep133.backup

import dev.arc.ep133.features.LearnedLinks
import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.isJsNumber
import dev.arc.ep133.formats.jsStringOr
import dev.arc.ep133.formats.numberOrNull
import dev.arc.ep133.text.BackupDevice
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/** What a backup needs besides its .pak to come back after a reinstall. */
data class IndexEntry(
    val id: String,
    val file: String,
    val title: String,
    val notes: String,
    val createdAt: Long,
    /** "device" or "import". */
    val source: String,
    val fileName: String?,
    val device: BackupDevice,
)

data class LibraryIndexData(val entries: List<IndexEntry>, val settings: Map<String, String>)

/**
 * The library kept outside the app (an addition to the web version): every
 * backup's .pak in Documents/arc, plus this index (library.json) with what
 * the .pak files don't hold: titles, notes, dates, where each came from, and
 * a few settings. Android deletes app storage on uninstall; this folder stays,
 * so a reinstalled arc can read the library back.
 */
object LibraryIndex {
    const val FILE = "library.json"
    const val FOLDER = "arc"

    private val STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC)

    /**
     * The backup's file in the folder: "arc-20261004-230112-1a2b3c4d.pak".
     * It depends only on things that never change (the creation time and
     * id), so renaming a backup never orphans its file.
     */
    fun fileFor(id: String, createdAt: Long): String {
        val stamp = STAMP.format(Instant.ofEpochMilli(createdAt))
        val tag = id.filter { it.isLetterOrDigit() }.take(8).lowercase().ifEmpty { "backup" }
        return "arc-$stamp-$tag.pak"
    }

    fun toJson(data: LibraryIndexData): String {
        val backups = data.entries.map { e ->
            JsonObject(
                linkedMapOf(
                    "id" to JsonPrimitive(e.id),
                    "file" to JsonPrimitive(e.file),
                    "title" to JsonPrimitive(e.title),
                    "notes" to JsonPrimitive(e.notes),
                    "createdAt" to JsJson.number(e.createdAt.toDouble()),
                    "source" to JsonPrimitive(e.source),
                    "fileName" to (e.fileName?.let { JsonPrimitive(it) } ?: kotlinx.serialization.json.JsonNull),
                    "device" to JsonObject(
                        linkedMapOf(
                            "product" to JsonPrimitive(e.device.product),
                            "sku" to JsonPrimitive(e.device.sku),
                            "serial" to JsonPrimitive(e.device.serial),
                            "osVersion" to JsonPrimitive(e.device.osVersion),
                        ),
                    ),
                ),
            )
        }
        val root = JsonObject(
            linkedMapOf(
                "app" to JsonPrimitive(Backup.APP_NAME),
                "version" to JsJson.number(1.0),
                "backups" to JsonArray(backups),
                "settings" to JsonObject(data.settings.mapValues { JsonPrimitive(it.value) }),
            ),
        )
        return JsJson.stringify(root, "  ")
    }

    /**
     * Reads an index, skipping entries it can't use. Anything that is not an
     * index gives null, so a stray file named library.json is ignored.
     */
    fun parse(text: String): LibraryIndexData? {
        val root = JsJson.parseOrNull(text) as? JsonObject ?: return null
        val list = root["backups"] as? JsonArray ?: return null
        val entries = list.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            fun str(k: String): String? = (o[k] as? JsonPrimitive)?.takeIf { it.isString }?.content
            val id = str("id")?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val file = str("file")?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val created = o["createdAt"]?.takeIf { it.isJsNumber }?.numberOrNull?.toLong() ?: return@mapNotNull null
            val d = o["device"] as? JsonObject
            IndexEntry(
                id = id,
                file = file,
                title = str("title") ?: "",
                notes = str("notes") ?: "",
                createdAt = created,
                source = str("source") ?: "import",
                fileName = str("fileName"),
                device = BackupDevice(
                    d?.get("product").jsStringOr(""),
                    d?.get("sku").jsStringOr(""),
                    d?.get("serial").jsStringOr(""),
                    d?.get("osVersion").jsStringOr(""),
                ),
            )
        }
        val settings = (root["settings"] as? JsonObject)?.mapNotNull { (k, v) ->
            (v as? JsonPrimitive)?.takeIf { it.isString }?.let { k to it.content }
        }?.toMap() ?: emptyMap()
        return LibraryIndexData(entries, settings)
    }

    /**
     * Several indexes (an old one the new install couldn't overwrite, and a new
     * one) merged by id; later ones win. Live's learned pad links are combined,
     * so a few pads learned in a new install don't drop the rest.
     */
    fun merge(indexes: List<LibraryIndexData>): LibraryIndexData {
        val byId = LinkedHashMap<String, IndexEntry>()
        val settings = LinkedHashMap<String, String>()
        for (ix in indexes) {
            for (e in ix.entries) byId[e.id] = e
            val before = settings[LEARNED]
            settings.putAll(ix.settings)
            val now = ix.settings[LEARNED]
            if (before != null && now != null) {
                settings[LEARNED] = LearnedLinks.format(LearnedLinks.merge(LearnedLinks.parse(before), LearnedLinks.parse(now)))
            }
        }
        return LibraryIndexData(byId.values.toList(), settings)
    }

    private const val LEARNED = "mirror.learned"
}
