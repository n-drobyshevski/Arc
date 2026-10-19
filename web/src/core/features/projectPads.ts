// Port of core/src/main/kotlin/dev/arc/ep133/features/ProjectPads.kt
//
// Which sound sits on each pad of a project (an addition to the web version).
// It reads the same pad records as slotsUsedByProject: entries named
// `pads/<group>/p<number>` whose bytes 1-2 hold the slot. The rest of a
// record is only known from community notes (settings, PadSettings.fromRecord),
// and how pad numbers map to the physical pads is not known either, so pads
// are only ordered by number.
//
// Web delta: Kotlin's Pair<String, Int> keys of `flatten` and `settings`
// become strings made by `flatKey(group, pad)` ("group\u0000pad").

import { PAD_RE, readTar } from '../formats/tar'
import { fromRecord, type PadSettings } from './padSettings'

/** One pad group of a project: pad number to the sample slot on it (null when empty), sorted by pad number. */
export interface PadGroup {
  name: string
  pads: Map<number, number | null>
}

const GROUP_ORDER: readonly string[] = ['a', 'b', 'c', 'd']
const INT_MAX = 2 ** 31 - 1

/** Groups a, b, c, d first, then any others by name (UTF-16 code unit order, like Kotlin's String.compareTo). */
export function groupOrder(a: string, b: string): number {
  const rank = (s: string): number => {
    const i = GROUP_ORDER.indexOf(s)
    return i < 0 ? GROUP_ORDER.length : i
  }
  const d = rank(a) - rank(b)
  if (d !== 0) return d
  return a < b ? -1 : a > b ? 1 : 0
}

export function read(tar: Uint8Array): PadGroup[] {
  const groups = new Map<string, Map<number, number | null>>()
  try {
    for (const [name, rec] of readTar(tar)) {
      const m = PAD_RE.exec(name)
      if (!m) continue
      if (rec.length < 3) continue
      // Kotlin's toIntOrNull: a pad number past Int.MAX_VALUE is skipped.
      const pad = Number(m[2])
      if (!Number.isSafeInteger(pad) || pad > INT_MAX) continue
      const slot = rec[1]! | (rec[2]! << 8)
      let g = groups.get(m[1]!)
      if (!g) {
        g = new Map()
        groups.set(m[1]!, g)
      }
      g.set(pad, slot >= 1 && slot <= 999 ? slot : null)
    }
  } catch {
    // Unknown layout, like slotsUsedByProject: no information.
    return []
  }
  return [...groups.entries()]
    .sort((x, y) => groupOrder(x[0], y[0]))
    .map(([name, pads]) => ({ name, pads: new Map([...pads.entries()].sort((x, y) => x[0] - y[0])) }))
}

/**
 * Each pad's SOUND EDIT settings from its record, by [flatKey] (group, pad),
 * for the records that look like settings (PadSettings.fromRecord; an
 * addition). Groups come in [groupOrder], pads by number; a pad whose record
 * isn't plausible is left out, and a TAR that can't be read gives none.
 */
export function settings(tar: Uint8Array): Map<string, PadSettings> {
  const groups = new Map<string, Map<number, PadSettings>>()
  try {
    for (const [name, rec] of readTar(tar)) {
      const m = PAD_RE.exec(name)
      if (!m) continue
      if (rec.length < 3) continue
      const pad = Number(m[2])
      if (!Number.isSafeInteger(pad) || pad > INT_MAX) continue
      // The last record of a pad counts, as in read().
      let g = groups.get(m[1]!)
      if (!g) {
        g = new Map()
        groups.set(m[1]!, g)
      }
      const s = fromRecord(rec)
      if (s !== null) g.set(pad, s)
      else g.delete(pad)
    }
  } catch {
    return new Map()
  }
  const out = new Map<string, PadSettings>()
  for (const [group, pads] of [...groups.entries()].sort((x, y) => groupOrder(x[0], y[0]))) {
    for (const [pad, s] of [...pads.entries()].sort((x, y) => x[0] - y[0])) out.set(flatKey(group, pad), s)
  }
  return out
}

/** The `flatten` map key for a pad of a group. */
export function flatKey(group: string, pad: number): string {
  return `${group}\u0000${pad}`
}

/** Every (group, pad) to its slot, for comparing two layouts. Keys come from [flatKey]. */
export function flatten(groups: readonly PadGroup[]): Map<string, number | null> {
  const out = new Map<string, number | null>()
  for (const g of groups) for (const [pad, slot] of g.pads) out.set(flatKey(g.name, pad), slot)
  return out
}
