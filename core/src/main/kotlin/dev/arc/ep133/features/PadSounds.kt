package dev.arc.ep133.features

import dev.arc.ep133.text.BackupRecord

/** Where Live finds a pad's sound when arc has no copy of it (an addition). */
object PadSounds {
    /** The newest backup whose sound in [slot] has this [name], if any. */
    fun newestBackupWith(slot: Int, name: String, entries: List<NameEntry>, backups: List<BackupRecord>): BackupRecord? {
        val ids = entries.filter { it.slot == slot && PadSoundCache.sameName(it.name, name) }.mapTo(HashSet()) { it.backupId }
        return backups.filter { it.id in ids }.maxByOrNull { it.createdAt }
    }
}
