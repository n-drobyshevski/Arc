package dev.arc.ep133.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

@Database(
    entities = [BackupEntity::class, SoundNameEntity::class, IndexedBackupEntity::class],
    version = 2,
    exportSchema = true,
)
@TypeConverters(Converters::class)
abstract class ArcDatabase : RoomDatabase() {
    abstract fun backups(): BackupDao

    abstract fun search(): SearchDao

    companion object {
        fun open(context: Context): ArcDatabase =
            // No destructive fallback: the startup sweep deletes .pak files without a row.
            Room.databaseBuilder(context, ArcDatabase::class.java, "arc.db").addMigrations(MIGRATION_1_2).build()
    }
}
