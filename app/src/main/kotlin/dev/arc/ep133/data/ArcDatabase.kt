package dev.arc.ep133.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

@Database(entities = [BackupEntity::class], version = 1, exportSchema = true)
@TypeConverters(Converters::class)
abstract class ArcDatabase : RoomDatabase() {
    abstract fun backups(): BackupDao

    companion object {
        fun open(context: Context): ArcDatabase =
            Room.databaseBuilder(context, ArcDatabase::class.java, "arc.db").build()
    }
}
