package dev.arc.ep133.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface BackupDao {
    /** Newest first; ties keep id order, as IndexedDB returned them. */
    @Query("SELECT * FROM backups ORDER BY created_at DESC, id ASC")
    fun observeAll(): Flow<List<BackupEntity>>

    @Query("SELECT * FROM backups ORDER BY created_at DESC, id ASC")
    suspend fun all(): List<BackupEntity>

    @Query("SELECT * FROM backups WHERE id = :id")
    suspend fun get(id: String): BackupEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(row: BackupEntity)

    @Query("UPDATE backups SET title = :title, notes = :notes WHERE id = :id")
    suspend fun updateText(id: String, title: String, notes: String)

    @Query("DELETE FROM backups WHERE id = :id")
    suspend fun delete(id: String)

    @Query("SELECT id FROM backups")
    suspend fun ids(): List<String>
}
