package dev.arc.ep133.data

import dev.arc.ep133.backup.Paks
import dev.arc.ep133.features.NameEntry
import dev.arc.ep133.text.BackupRecord
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.UUID

/** The backup library (library.js): Room rows plus .pak files. */
class Library(private val db: ArcDatabase, private val store: PakStore) {
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
        }
        row
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
    }

    suspend fun bytes(id: String): ByteArray = withContext(Dispatchers.IO) { store.read(id) }

    fun file(id: String) = store.file(id)

    suspend fun delete(id: String) = withContext(Dispatchers.IO) {
        files.withLock {
            dao.delete(id)
            search.forget(id)
            store.delete(id)
        }
    }

    suspend fun sweep() = withContext(Dispatchers.IO) { files.withLock { store.sweep(dao.ids().toSet()) } }

    fun spaceLeft(): Long = store.freeSpace()
}
