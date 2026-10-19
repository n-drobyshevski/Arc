package dev.arc.ep133.features

import dev.arc.ep133.text.BackupRecord

/** Where Live finds a pad's sound when arc has no copy of it (an addition). */
object PadSounds {
    /** The newest backup whose sound in [slot] has this [name], if any. */
    fun newestBackupWith(slot: Int, name: String, entries: List<NameEntry>, backups: List<BackupRecord>): BackupRecord? {
        val ids = entries.filter { it.slot == slot && PadSoundCache.sameName(it.name, name) }.mapTo(HashSet()) { it.backupId }
        return backups.filter { it.id in ids }.maxByOrNull { it.createdAt }
    }

    /**
     * The device's sounds ([names], by slot) arc can't play without it: no
     * copy read with that name ([copies], from [PadSoundCache.copies]), no
     * backup with that name in that slot ([entries]), and not a factory sound
     * the saved pack has ([FactorySounds.unnamed], when [packSaved]).
     */
    fun unavailable(names: Map<Int, String>, copies: Map<Int, String>, entries: List<NameEntry>, packSaved: Boolean): Set<Int> {
        val bySlot = entries.groupBy { it.slot }
        return names.filter { (slot, name) ->
            val copied = copies[slot]?.let { PadSoundCache.sameName(it, name) } == true
            val backedUp = bySlot[slot].orEmpty().any { PadSoundCache.sameName(it.name, name) }
            !copied && !backedUp && !(packSaved && FactorySounds.unnamed(slot, name))
        }.keys
    }
}
