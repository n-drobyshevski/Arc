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

    /** Whether the user picked the library folder (after a reinstall). */
    val folderPicked: Boolean get() = external?.tree != null

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
     * file; then its sound names (a backup without them is indexed later),
     * then the copy in the folder. The result says if that copy failed.
     */
    suspend fun save(record: BackupRecord, bytes: ByteArray, soundNames: Map<Int, String>): Saved = withContext(Dispatchers.IO) {
        val row = record.copy(id = record.id.ifEmpty { UUID.randomUUID().toString() }, size = bytes.size.toLong())
        val copyError = files.withLock {
            store.write(row.id, bytes)
            dao.insert(BackupEntity.from(row))
            search.replace(row.id, soundNames)
            copyOut { ext ->
                ext.write(externalName(row), bytes, ExternalLibrary.PAK_MIME)
                writeIndex(ext)
            }
        }
        Saved(row, copyError)
    }

    private fun externalName(r: BackupRecord): String =
        external?.fileOverride(r.id) ?: LibraryIndex.fileFor(r.id, r.createdAt)

    /**
     * Rewrites library.json from the library. With a picked folder, entries of
     * backups whose file is in the folder but not in the library (one a restore
     * could not read, say) are kept, so their titles and notes aren't lost.
     * [base] settings are kept where the app has none of its own.
     */
    private suspend fun writeIndex(ext: ExternalLibrary, base: Map<String, String> = emptyMap()) {
        val rows = dao.all().map { it.toRecord() }
        val ids = rows.mapTo(HashSet()) { it.id }
        val entries = rows.map { r -> IndexEntry(r.id, externalName(r), r.title, r.notes, r.createdAt, r.source, r.fileName, r.device) }
        val kept = if (ext.tree == null) emptyList() else {
            val listing = ext.list()
            readIndex(ext, listing).entries.filter { it.id !in ids && it.file in listing }
        }
        val data = LibraryIndexData(entries + kept, base + settings())
        ext.write(LibraryIndex.FILE, encodeUtf8(LibraryIndex.toJson(data)), ExternalLibrary.JSON_MIME)
    }

    /** Every index file in a folder listing, oldest first, merged so the newest wins. */
    private fun readIndex(ext: ExternalLibrary, listing: Map<String, FolderFile>): LibraryIndexData =
        LibraryIndex.merge(
            listing.filterKeys(ExternalLibrary::isIndex).values.sortedBy { it.lastModified }.mapNotNull { f ->
                runCatching { LibraryIndex.parse(decodeUtf8(ext.read(f.uri))) }.getOrNull()
            },
        )

    /** Runs a copy to the folder; returns what went wrong, if anything. */
    private suspend fun copyOut(block: suspend (ExternalLibrary) -> Unit): String? {
        val ext = external ?: return null
        return try {
            block(ext)
            null
        } catch (e: Exception) {
            e.message ?: e.toString()
        }
    }

    /** Rewrites the index in the folder (after a settings change). */
    suspend fun syncIndex() = withContext(Dispatchers.IO) {
        files.withLock { copyOut { writeIndex(it) } }?.let(onExternalError)
    }

    /**
     * On every start: copies to the folder whatever is missing there (a
     * library from before the folder, or a copy that failed earlier), then the
     * index. An empty library has nothing to protect, so a fresh reinstall
     * writes nothing before the user can restore.
     */
    suspend fun reconcile() = withContext(Dispatchers.IO) {
        val ext = external ?: return@withContext
        files.withLock {
            val rows = dao.all().map { it.toRecord() }
            if (rows.isEmpty()) return@withLock
            val present = runCatching { ext.names() }.getOrNull()
            var error: String? = null
            for (r in rows) {
                val name = externalName(r)
                val err = copyOut { e ->
                    val there = present?.contains(name) ?: e.exists(name)
                    if (!there) e.write(name, store.read(r.id), ExternalLibrary.PAK_MIME)
                }
                if (error == null) error = err
            }
            val ixErr = copyOut { writeIndex(it) }
            (error ?: ixErr)?.let(onExternalError)
        }
    }

    private val restoring = Mutex()

    /**
     * Reads the library back from a folder the user picked (after a
     * reinstall): every .pak in it, with titles, notes and dates from the
     * index files (the newest wins), and the settings. Backups already in the
     * library are skipped. The folder becomes the copy target only if it is
     * the library's (Documents/arc, or one holding arc files); otherwise this
     * fails and nothing changes. Returns how many came back, and the settings.
     */
    suspend fun restoreFrom(tree: android.net.Uri, describe: (ByteArray) -> RestoredPak): Pair<Int, Map<String, String>> = withContext(Dispatchers.IO) {
        val ext = external ?: return@withContext 0 to emptyMap()
        restoring.withLock {
            val listing = ext.list(tree)
            if (!ExternalLibrary.isLibraryFolder(tree, listing.keys)) throw java.io.IOException(dev.arc.ep133.text.FeatureText.PICK_ARC_FOLDER)
            val index = readIndex(ext, listing)
            val byFile = index.entries.associateBy { it.file }
            var count = 0
            for ((name, file) in listing) {
                if (!name.endsWith(".pak", ignoreCase = true)) continue
                val entry = byFile[name]
                val taken = files.withLock {
                    (entry != null && dao.get(entry.id) != null) || dao.all().any { externalName(it.toRecord()) == name }
                }
                if (taken) continue
                val bytes = runCatching { ext.read(file.uri) }.getOrNull() ?: continue
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
            ext.setTree(tree)
            files.withLock { copyOut { writeIndex(it, index.settings) } }?.let(onExternalError)
            count to index.settings
        }
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
        files.withLock { copyOut { writeIndex(it) } }?.let(onExternalError)
    }

    suspend fun bytes(id: String): ByteArray = withContext(Dispatchers.IO) { store.read(id) }

    fun file(id: String) = store.file(id)

    /** Deletes a backup, and its file in the folder; returns what went wrong with the folder, if anything. */
    suspend fun delete(id: String): String? = withContext(Dispatchers.IO) {
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

/** A saved backup, and what went wrong copying it to the folder (null if nothing). */
data class Saved(val record: BackupRecord, val copyError: String?)

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
