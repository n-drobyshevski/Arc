package dev.arc.ep133.features

import dev.arc.ep133.text.BackupRecord

/** One sound name in a saved backup, as indexed by the library. */
data class NameEntry(val backupId: String, val slot: Int, val name: String)

data class SearchHit(val slot: Int, val name: String)

data class SearchGroup(val backup: BackupRecord, val hits: List<SearchHit>)

/** Finds sounds by name across saved backups (an addition to the web version). */
object LibrarySearch {
    /**
     * Sounds whose name contains every word of [query], ignoring case, grouped
     * by backup in the library's order and sorted by slot. A blank query finds nothing.
     */
    fun search(entries: List<NameEntry>, backups: List<BackupRecord>, query: String): List<SearchGroup> {
        val words = query.trim().lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (words.isEmpty()) return emptyList()
        val byBackup = entries
            .filter { e -> e.name.lowercase().let { n -> words.all { it in n } } }
            .groupBy { it.backupId }
        return backups.mapNotNull { b ->
            byBackup[b.id]?.sortedBy { it.slot }?.map { SearchHit(it.slot, it.name) }?.let { SearchGroup(b, it) }
        }
    }
}
