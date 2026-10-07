// Port of core/src/main/kotlin/dev/arc/ep133/features/PadSounds.kt
//
// Where Live finds a pad's sound when arc has no copy of it (an addition).
//
// Web delta: the backup type is generic (anything with an `id` and a
// `createdAt`, such as the library's BackupRecord), as in librarySearch.

import type { NameEntry } from './librarySearch'
import { unnamed } from './factorySounds'
import { PadSoundCache } from './padSoundCache'

/** The newest backup whose sound in [slot] has this [name], if any (the first of equals). */
export function newestBackupWith<B extends { readonly id: string; readonly createdAt: number }>(
  slot: number,
  name: string,
  entries: readonly NameEntry[],
  backups: readonly B[],
): B | null {
  const ids = new Set(entries.filter((e) => e.slot === slot && PadSoundCache.sameName(e.name, name)).map((e) => e.backupId))
  let best: B | null = null
  for (const b of backups) {
    if (ids.has(b.id) && (best === null || best.createdAt < b.createdAt)) best = b
  }
  return best
}

/**
 * The device's sounds ([names], by slot) arc can't play without it: no copy
 * read with that name ([copies], from PadSoundCache.copies), no backup with
 * that name in that slot ([entries]), and not a factory sound the saved pack
 * has (FactorySounds.unnamed, when [packSaved]).
 */
export function unavailable(
  names: ReadonlyMap<number, string>,
  copies: ReadonlyMap<number, string>,
  entries: readonly NameEntry[],
  packSaved: boolean,
): Set<number> {
  const bySlot = new Map<number, NameEntry[]>()
  for (const e of entries) {
    const list = bySlot.get(e.slot)
    if (list) list.push(e)
    else bySlot.set(e.slot, [e])
  }
  const out = new Set<number>()
  for (const [slot, name] of names) {
    const copy = copies.get(slot)
    const copied = copy !== undefined && PadSoundCache.sameName(copy, name)
    const backedUp = (bySlot.get(slot) ?? []).some((e) => PadSoundCache.sameName(e.name, name))
    if (!copied && !backedUp && !(packSaved && unnamed(slot, name))) out.add(slot)
  }
  return out
}

export const PadSounds = { newestBackupWith, unavailable } as const
