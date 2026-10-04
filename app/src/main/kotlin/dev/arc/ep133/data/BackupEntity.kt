package dev.arc.ep133.data

import androidx.room.ColumnInfo
import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import dev.arc.ep133.text.BackupDevice
import dev.arc.ep133.text.BackupRecord

data class DeviceColumns(
    val product: String = "",
    val sku: String = "",
    val serial: String = "",
    @ColumnInfo(name = "os_version") val osVersion: String = "",
)

/** Index row for one .pak in app storage (the web version's IndexedDB "backups" store). */
@Entity(tableName = "backups", indices = [Index("created_at")])
data class BackupEntity(
    @PrimaryKey val id: String,
    val title: String,
    val notes: String,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    val source: String,
    @ColumnInfo(name = "file_name") val fileName: String?,
    @Embedded(prefix = "device_") val device: DeviceColumns,
    @ColumnInfo(name = "sound_count") val soundCount: Int,
    @ColumnInfo(name = "project_count") val projectCount: Int,
    val projects: List<Int>,
    val slots: List<Int>,
    @ColumnInfo(name = "project_slots") val projectSlots: Map<Int, List<Int>>,
    val size: Long,
) {
    fun toRecord() = BackupRecord(
        id, title, notes, createdAt, source, fileName,
        BackupDevice(device.product, device.sku, device.serial, device.osVersion),
        soundCount, projectCount, projects, slots, projectSlots, size,
    )

    companion object {
        fun from(r: BackupRecord) = BackupEntity(
            r.id, r.title, r.notes, r.createdAt, r.source, r.fileName,
            DeviceColumns(r.device.product, r.device.sku, r.device.serial, r.device.osVersion),
            r.soundCount, r.projectCount, r.projects, r.slots, r.projectSlots, r.size,
        )
    }
}
