package dev.arc.ep133.data

import dev.arc.ep133.text.BackupRecord
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import java.util.UUID

/** The backup library (library.js): Room rows plus .pak files. */
class Library(private val db: ArcDatabase, private val store: PakStore) {
    private val dao get() = db.backups()

    val backups: Flow<List<BackupRecord>> = dao.observeAll().map { rows -> rows.map { it.toRecord() } }

    /** Stores the file first, then the row, so a row never points at a missing file. */
    suspend fun save(record: BackupRecord, bytes: ByteArray): BackupRecord = withContext(Dispatchers.IO) {
        val row = record.copy(id = record.id.ifEmpty { UUID.randomUUID().toString() }, size = bytes.size.toLong())
        store.write(row.id, bytes)
        dao.insert(BackupEntity.from(row))
        row
    }

    suspend fun update(id: String, title: String, notes: String) = withContext(Dispatchers.IO) {
        dao.updateText(id, title, notes)
    }

    suspend fun bytes(id: String): ByteArray = withContext(Dispatchers.IO) { store.read(id) }

    fun file(id: String) = store.file(id)

    suspend fun delete(id: String) = withContext(Dispatchers.IO) {
        dao.delete(id)
        store.delete(id)
    }

    suspend fun sweep() = withContext(Dispatchers.IO) { store.sweep(dao.ids().toSet()) }

    fun spaceLeft(): Long = store.freeSpace()
}
