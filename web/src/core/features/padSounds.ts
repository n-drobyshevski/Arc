// Port of core/src/main/kotlin/dev/arc/ep133/features/PadSounds.kt
//
// Where Live finds a pad's sound when arc has no copy of it (an addition).
//
// Web delta: the backup type is generic (anything with an `id` and a
// `createdAt`, such as the library's BackupRecord), as in librarySearch.

import type { NameEntry } from './librarySearch'
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

export const PadSounds = { newestBackupWith } as const
