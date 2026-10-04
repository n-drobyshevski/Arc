package dev.arc.ep133.data

import dev.arc.ep133.backup.IndexEntry
import dev.arc.ep133.backup.LibraryIndex
import dev.arc.ep133.backup.LibraryIndexData
import dev.arc.ep133.backup.Paks
import dev.arc.ep133.text.BackupDevice
import dev.arc.ep133.text.LibraryRules
import dev.arc.ep133.util.decodeUtf8
import dev.arc.ep133.util.encodeUtf8
import dev.arc.ep133.features.NameEntry
import dev.arc.ep133.text.BackupRecord
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.UUID

/**
 * The backup library (library.js): Room rows plus .pak files, with a copy of
 * both in Documents/arc that outlives the app ([external], an addition).
 * Copy failures never fail the library operation; they go to [onExternalError].
 */
class Library(
    private val db: ArcDatabase,
    private val store: PakStore,
    private val external: ExternalLibrary? = null,
) {
    /** Settings kept with the library in the folder (the live mirror's), read when the index is written. */
    var settings: () -> Map<String, String> = { emptyMap() }

    /** Called with what went wrong when the folder copy could not be written. */
    var onExternalError: (String) -> Unit = {}
    private val dao get() = db.backups()
    private val search get() = db.search()

    // Serialises file writes, deletes and the startup sweep, so the sweep never
    // removes a file that is being saved.
    private val files = Mutex()

    val backups: Flow<List<BackupRecord>> = dao.observeAll().map { rows -> rows.map { it.toRecord() } }

    /** Every indexed sound name, for searching. */
    val names: Flow<List<NameEntry>> = search.observeNames().map { rows -> rows.map { NameEntry(it.backupId, it.slot, it.name) } }

    /**
     * Stores the file first, then the row, so a row never points at a missing
     * file; then its sound names (a backup without them is indexed later).
     */
    suspend fun save(record: BackupRecord, bytes: ByteArray, soundNames: Map<Int, String>): BackupRecord = withContext(Dispatchers.IO) {
        val row = record.copy(id = record.id.ifEmpty { UUID.randomUUID().toString() }, size = bytes.size.toLong())
        files.withLock {
            store.write(row.id, bytes)
            dao.insert(BackupEntity.from(row))
            search.replace(row.id, soundNames)
            copyOut { ext ->
                ext.write(externalName(row), bytes, ExternalLibrary.PAK_MIME)
                writeIndex(ext)
            }
        }
        row
    }

    private fun externalName(r: BackupRecord): String =
        external?.fileOverride(r.id) ?: LibraryIndex.fileFor(r.id, r.createdAt)

    private suspend fun writeIndex(ext: ExternalLibrary) {
        val entries = dao.all().map { e ->
            val r = e.toRecord()
            IndexEntry(r.id, externalName(r), r.title, r.notes, r.createdAt, r.source, r.fileName, r.device)
        }
        ext.write(LibraryIndex.FILE, encodeUtf8(LibraryIndex.toJson(LibraryIndexData(entries, settings()))), ExternalLibrary.JSON_MIME)
    }

    private suspend fun copyOut(block: suspend (ExternalLibrary) -> Unit) {
        val ext = external ?: return
        try {
            block(ext)
        } catch (e: Exception) {
            onExternalError(e.message ?: e.toString())
        }
    }

    /** Rewrites the index in the folder (after a settings change). */
    suspend fun syncIndex() = withContext(Dispatchers.IO) { files.withLock { copyOut { writeIndex(it) } } }

    /**
     * Copies a library that predates the folder into it, once: every backup
     * whose file is not there yet, then the index.
     */
    suspend fun exportOnce() = withContext(Dispatchers.IO) {
        val ext = external ?: return@withContext
        if (ext.exported) return@withContext
        files.withLock {
            var ok = true
            for (e in dao.all()) {
                val r = e.toRecord()
                val name = externalName(r)
                try {
                    if (!ext.exists(name)) ext.write(name, store.read(r.id), ExternalLibrary.PAK_MIME)
                } catch (x: Exception) {
                    ok = false
                    onExternalError(x.message ?: x.toString())
                }
            }
            copyOut { writeIndex(it) }
            if (ok) ext.exported = true
        }
    }

    /**
     * Reads the library back from a folder the user picked (after a
     * reinstall): every .pak in it, with titles, notes and dates from the
     * index files, and the settings. Backups already in the library are
     * skipped. From now on the folder is where copies go. Returns how many
     * backups came back, and the settings found.
     */
    suspend fun restoreFrom(tree: android.net.Uri, describe: (ByteArray) -> RestoredPak): Pair<Int, Map<String, String>> = withContext(Dispatchers.IO) {
        val ext = external ?: return@withContext 0 to emptyMap()
        ext.setTree(tree)
        val listing = ext.list()
        val index = LibraryIndex.merge(
            listing.filterKeys { it.startsWith("library") && it.endsWith(".json") }.values.mapNotNull { uri ->
                runCatching { LibraryIndex.parse(decodeUtf8(ext.read(uri))) }.getOrNull()
            },
        )
        val byFile = index.entries.associateBy { it.file }
        var count = 0
        for ((name, uri) in listing) {
            if (!name.endsWith(".pak", ignoreCase = true)) continue
            val entry = byFile[name]
            if (entry != null && dao.get(entry.id) != null) continue
            val bytes = runCatching { ext.read(uri) }.getOrNull() ?: continue
            val d = runCatching { describe(bytes) }.getOrNull() ?: continue
            val id = entry?.id ?: UUID.randomUUID().toString()
            val record = BackupRecord(
                id = id,
                title = entry?.title ?: LibraryRules.importTitle(name),
                notes = entry?.notes ?: "",
                createdAt = entry?.createdAt ?: d.createdAt,
                source = entry?.source ?: "import",
                fileName = entry?.fileName ?: name,
                device = entry?.device ?: d.device,
                soundCount = d.soundCount,
                projectCount = d.projectCount,
                projects = d.projects,
                slots = d.slots,
                projectSlots = d.projectSlots,
                size = bytes.size.toLong(),
            )
            files.withLock {
                store.write(id, bytes)
                dao.insert(BackupEntity.from(record))
                search.replace(id, d.soundNames)
                // The file keeps its name; remember it when it isn't the usual one.
                if (name != LibraryIndex.fileFor(id, record.createdAt)) ext.setFileOverride(id, name)
            }
            count++
        }
        files.withLock { copyOut { writeIndex(it) } }
        ext.exported = true
        count to index.settings
    }

    /**
     * Indexes the sound names of backups saved before search existed (or whose
     * names were not stored). One backup at a time; a damaged file is skipped
     * and tried again next start.
     */
    suspend fun indexMissing() = withContext(Dispatchers.IO) {
        search.dropOrphans()
        val missing = dao.ids() - search.indexedIds().toSet()
        for (id in missing) {
            val bytes = files.withLock { if (dao.get(id) != null) runCatching { store.read(id) }.getOrNull() else null } ?: continue
            val names = withContext(Dispatchers.Default) {
                runCatching { Paks.open(bytes).sounds.mapValues { it.value.name } }.getOrNull()
            } ?: continue
            // Only if the backup was not deleted meanwhile.
            files.withLock { if (dao.get(id) != null) search.replace(id, names) }
        }
    }

    suspend fun update(id: String, title: String, notes: String) = withContext(Dispatchers.IO) {
        dao.updateText(id, title, notes)
        files.withLock { copyOut { writeIndex(it) } }
    }

    suspend fun bytes(id: String): ByteArray = withContext(Dispatchers.IO) { store.read(id) }

    fun file(id: String) = store.file(id)

    suspend fun delete(id: String) = withContext(Dispatchers.IO) {
        files.withLock {
            val row = dao.get(id)?.toRecord()
            dao.delete(id)
            search.forget(id)
            store.delete(id)
            copyOut { ext ->
                if (row != null) ext.delete(externalName(row))
                ext.setFileOverride(id, null)
                writeIndex(ext)
            }
        }
    }

    suspend fun sweep() = withContext(Dispatchers.IO) { files.withLock { store.sweep(dao.ids().toSet()) } }

    fun spaceLeft(): Long = store.freeSpace()
}

/** What restoring needs from a .pak (its description). */
data class RestoredPak(
    val createdAt: Long,
    val device: BackupDevice,
    val soundCount: Int,
    val projectCount: Int,
    val projects: List<Int>,
    val slots: List<Int>,
    val projectSlots: Map<Int, List<Int>>,
    val soundNames: Map<Int, String>,
)
