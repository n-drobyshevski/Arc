package dev.arc.ep133.data

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.flow.Flow

/** One sound name in a saved backup, for searching (an addition to the web version). */
@Entity(tableName = "sound_names", primaryKeys = ["backup_id", "slot"])
data class SoundNameEntity(
    @ColumnInfo(name = "backup_id") val backupId: String,
    val slot: Int,
    val name: String,
)

/** A backup whose sound names are in [SoundNameEntity], even when it has no sounds. */
@Entity(tableName = "indexed_backups")
data class IndexedBackupEntity(@PrimaryKey @ColumnInfo(name = "backup_id") val backupId: String)

@Dao
abstract class SearchDao {
    @Query("SELECT * FROM sound_names")
    abstract fun observeNames(): Flow<List<SoundNameEntity>>

    @Query("SELECT backup_id FROM indexed_backups")
    abstract suspend fun indexedIds(): List<String>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    protected abstract suspend fun insertNames(rows: List<SoundNameEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    protected abstract suspend fun markIndexed(row: IndexedBackupEntity)

    @Query("DELETE FROM sound_names WHERE backup_id = :id")
    protected abstract suspend fun deleteNames(id: String)

    @Query("DELETE FROM indexed_backups WHERE backup_id = :id")
    protected abstract suspend fun unmark(id: String)

    /** Replaces a backup's names; the backup counts as indexed only once its names are in. */
    @Transaction
    open suspend fun replace(id: String, names: Map<Int, String>) {
        deleteNames(id)
        insertNames(names.map { (slot, name) -> SoundNameEntity(id, slot, name) })
        markIndexed(IndexedBackupEntity(id))
    }

    @Transaction
    open suspend fun forget(id: String) {
        deleteNames(id)
        unmark(id)
    }

    /** Rows left behind if the app stopped between deleting a backup and its names. */
    @Transaction
    open suspend fun dropOrphans() {
        dropOrphanNames()
        dropOrphanMarks()
    }

    @Query("DELETE FROM sound_names WHERE backup_id NOT IN (SELECT id FROM backups)")
    protected abstract suspend fun dropOrphanNames()

    @Query("DELETE FROM indexed_backups WHERE backup_id NOT IN (SELECT id FROM backups)")
    protected abstract suspend fun dropOrphanMarks()
}

/**
 * Version 1 to 2 only adds the two search tables; the backups table is not
 * touched. The SQL is Room's own from schemas/.../2.json (checked by a test).
 */
val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        for (sql in MIGRATION_1_2_SQL) db.execSQL(sql)
    }
}

internal val MIGRATION_1_2_SQL = listOf(
    "CREATE TABLE IF NOT EXISTS `sound_names` (`backup_id` TEXT NOT NULL, `slot` INTEGER NOT NULL, `name` TEXT NOT NULL, PRIMARY KEY(`backup_id`, `slot`))",
    "CREATE TABLE IF NOT EXISTS `indexed_backups` (`backup_id` TEXT NOT NULL, PRIMARY KEY(`backup_id`))",
)
