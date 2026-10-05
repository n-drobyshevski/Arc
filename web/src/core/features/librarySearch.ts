// Port of core/src/main/kotlin/dev/arc/ep133/features/LibrarySearch.kt
//
// Finds sounds by name across saved backups (an addition to the web version).
//
// Web delta: the backup type is generic (anything with an `id`, such as the
// library's BackupRecord), so this module does not depend on the text layer.

import { JAVA_WS, ktTrim } from '../util/kotlinText'

/** One sound name in a saved backup, as indexed by the library. */
export interface NameEntry {
  backupId: string
  slot: number
  name: string
}

export interface SearchHit {
  slot: number
  name: string
}

export interface SearchGroup<B extends { readonly id: string } = { readonly id: string }> {
  backup: B
  hits: SearchHit[]
}

/**
 * Sounds whose name contains every word of [query], ignoring case, grouped
 * by backup in the library's order and sorted by slot. A blank query finds nothing.
 */
export function search<B extends { readonly id: string }>(
  entries: readonly NameEntry[],
  backups: readonly B[],
  query: string,
): SearchGroup<B>[] {
  const words = ktTrim(query)
    .toLowerCase()
    .split(JAVA_WS)
    .filter((w) => w.length > 0)
  if (words.length === 0) return []
  const byBackup = new Map<string, NameEntry[]>()
  for (const e of entries) {
    const n = e.name.toLowerCase()
    if (!words.every((w) => n.includes(w))) continue
    const list = byBackup.get(e.backupId)
    if (list) list.push(e)
    else byBackup.set(e.backupId, [e])
  }
  const out: SearchGroup<B>[] = []
  for (const b of backups) {
    const list = byBackup.get(b.id)
    if (!list) continue
    out.push({ backup: b, hits: [...list].sort((x, y) => x.slot - y.slot).map((e) => ({ slot: e.slot, name: e.name })) })
  }
  return out
}
