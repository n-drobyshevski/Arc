// Port of core/src/main/kotlin/dev/arc/ep133/features/LiveSnapshot.kt
//
// What Live last read from the device (an addition): the active project, its
// pads and the sound names. Kept (live.json) so Live still shows the pads and
// their samples while no EP-133 is connected. `savedAt` is in epoch
// milliseconds.
//
// Web deltas:
// - The data class is a plain interface; `s.toJson()` is `toJson(s)` and
//   `LiveSnapshot.fromJson` is `fromJson`.
// - toJson writes the text by hand so keys keep the Kotlin order (a JS object
//   would move numeric keys such as slot numbers to the front).
// - fromJson reads through JSON.parse, so a slot-names object comes back in
//   numeric key order rather than file order, and kotlinx's
//   JsonPrimitive.intOrNull / longOrNull are read from the parsed value: a
//   whole number (1.0 parses as 1 in JS, where Kotlin rejects "1.0") or a
//   string of digits.

import { groupOrder, type PadGroup } from './projectPads'

export interface LiveSnapshot {
  savedAt: number
  activeProject: number | null
  groups: PadGroup[]
  names: ReadonlyMap<number, string>
}

const INT_MIN = -(2 ** 31)
const INT_MAX = 2 ** 31 - 1

/** kotlinx JsonPrimitive.longOrNull on a parsed value: numbers and numeric strings; null for anything else (true, null, objects, arrays). */
function longOrNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isSafeInteger(v) ? v : null
  if (typeof v === 'string' && /^-?\d+([eE][+-]?\d+)?$/.test(v)) {
    const n = Number(v)
    return Number.isSafeInteger(n) ? n : null
  }
  return null
}

/** kotlinx JsonPrimitive.intOrNull: longOrNull inside the Int range. */
function intOrNull(v: unknown): number | null {
  const n = longOrNull(v)
  return n !== null && n >= INT_MIN && n <= INT_MAX ? n : null
}

/** Kotlin String.toIntOrNull for an object key (ASCII digits; slot and pad numbers). */
function keyToInt(k: string): number | null {
  if (!/^[+-]?\d+$/.test(k)) return null
  const n = Number(k)
  return n >= INT_MIN && n <= INT_MAX ? n : null
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const q = (s: string): string => JSON.stringify(s)
const obj = (entries: readonly string[]): string => `{${entries.join(',')}}`

export function toJson(s: LiveSnapshot): string {
  return obj([
    `"v":1`,
    `"savedAt":${s.savedAt}`,
    `"project":${s.activeProject ?? 'null'}`,
    `"groups":` +
      obj(s.groups.map((g) => `${q(g.name)}:` + obj([...g.pads].map(([pad, slot]) => `${q(String(pad))}:${slot ?? 'null'}`)))),
    `"names":` + obj([...s.names].map(([slot, name]) => `${q(String(slot))}:${q(name)}`)),
  ])
}

/** Null when the text is not a snapshot this version can read. */
export function fromJson(text: string): LiveSnapshot | null {
  let o: unknown
  try {
    o = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObject(o)) return null
  // `o["v"]?.jsonPrimitive` throws (so: null) for an object or array.
  if (intOrNull(o['v']) !== 1) return null
  const groups: PadGroup[] = []
  const g = o['groups']
  if (isObject(g)) {
    for (const [name, pads] of Object.entries(g)) {
      // `pads.jsonObject` throws for anything else, and the whole read is null.
      if (!isObject(pads)) return null
      const entries: [number, number | null][] = []
      for (const [pad, slot] of Object.entries(pads)) {
        const n = keyToInt(pad)
        if (n === null) continue
        entries.push([n, intOrNull(slot)])
      }
      // toMap(TreeMap()): sorted by pad, a later duplicate replacing an earlier one.
      const m = new Map<number, number | null>()
      for (const [n, slot] of entries) m.set(n, slot)
      groups.push({ name, pads: new Map([...m].sort((a, b) => a[0] - b[0])) })
    }
  }
  groups.sort((a, b) => groupOrder(a.name, b.name))
  const names = new Map<number, string>()
  const ns = o['names']
  if (isObject(ns)) {
    for (const [slot, name] of Object.entries(ns)) {
      const n = keyToInt(slot)
      if (n === null || typeof name !== 'string') continue
      names.set(n, name)
    }
  }
  const savedAt = longOrNull(o['savedAt'])
  if (savedAt === null) return null
  return {
    savedAt,
    activeProject: intOrNull(o['project']),
    groups,
    names,
  }
}

/** The Kotlin `LiveSnapshot.Companion`. */
export const LiveSnapshot = { fromJson, toJson } as const
