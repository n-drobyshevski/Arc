// Port of core/src/main/kotlin/dev/arc/ep133/features/OfflinePads.kt
//
// Live's pad changes made offline, in arc only (an addition): at most one per
// pad, in the order they were made. Kept until the next connection asks
// whether to put them on the EP-133, or until "Reset pads".
//
// Web deltas:
// - SoundSource is a string union whose values are the Kotlin enum's `id`
//   ('device', 'factory'): `source.id` is `source`, `SoundSource.of` the same.
// - The data classes are plain readonly interfaces; their methods are
//   functions taking the value first (`pads.put(p)` is `put(pads, p)`), and
//   `OfflinePads.EMPTY` / `fromJson` / `fits` are on the `OfflinePads` object
//   with them.
// - fromJson reads through JSON.parse. kotlinx's intOrNull on a non-string
//   primitive is read from the parsed value: a whole number in the Int range
//   (1.0 parses as 1 in JS, where Kotlin rejects "1.0").

import { SOURCE as FACTORY_SOURCE, unnamed } from './factorySounds'
import { PadSoundCache } from './padSoundCache'

/** Which list a sound was picked from: the device's sounds as last read, or the factory pack. */
export type SoundSource = 'device' | 'factory'
export const SoundSource = {
  DEVICE: 'device',
  FACTORY: FACTORY_SOURCE,
  of(id: string): SoundSource | null {
    return id === 'device' || id === 'factory' ? id : null
  },
} as const

/**
 * A sound put on a pad while no EP-133 is connected (an addition): the
 * [project]'s pad file for [group] (0..3, A..D) and [pad] (its number in the
 * project file, pNN, as in PadTarget), and the [slot] and [name] picked from
 * [source]'s list.
 */
export interface OfflinePad {
  readonly project: number
  readonly group: number
  readonly pad: number
  readonly slot: number
  readonly name: string
  readonly source: SoundSource
}

export interface OfflinePads {
  readonly list: readonly OfflinePad[]
}

const EMPTY: OfflinePads = { list: [] }

const samePad = (p: OfflinePad, project: number, group: number, pad: number): boolean =>
  p.project === project && p.group === group && p.pad === pad

export function size(pads: OfflinePads): number {
  return pads.list.length
}

/** The change on that pad, if any. */
export function at(pads: OfflinePads, project: number, group: number, pad: number): OfflinePad | null {
  return pads.list.find((p) => samePad(p, project, group, pad)) ?? null
}

/** [p] replaces that pad's change, if any, and goes last. */
export function put(pads: OfflinePads, p: OfflinePad): OfflinePads {
  return { list: [...drop(pads, p.project, p.group, p.pad).list, p] }
}

/** Without that pad's change: the pad plays what the device read had again. */
export function drop(pads: OfflinePads, project: number, group: number, pad: number): OfflinePads {
  return { list: pads.list.filter((p) => !samePad(p, project, group, pad)) }
}

export function toJson(pads: OfflinePads): string {
  // Non-numeric keys: JSON.stringify keeps them in the Kotlin order.
  return JSON.stringify({
    v: 1,
    pads: pads.list.map((p) => ({ project: p.project, group: p.group, pad: p.pad, slot: p.slot, name: p.name, source: p.source })),
  })
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A whole number written as a number (not a string), in the Int range (kotlinx intOrNull). */
function intOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= -(2 ** 31) && v <= 2 ** 31 - 1 ? v : null
}

/** Null when the text is not a version this one can read; entries it can't read are skipped. */
export function fromJson(text: string): OfflinePads | null {
  let o: unknown
  try {
    o = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObject(o)) return null
  if (intOrNull(o['v']) !== 1) return null
  let out = EMPTY
  const list = o['pads']
  for (const f of Array.isArray(list) ? (list as unknown[]) : []) {
    if (!isObject(f)) continue
    const project = intOrNull(f['project'])
    if (project === null || project < 1 || project > 99) continue
    const group = intOrNull(f['group'])
    if (group === null || group < 0 || group > 3) continue
    const pad = intOrNull(f['pad'])
    if (pad === null || pad < 1) continue
    const slot = intOrNull(f['slot'])
    if (slot === null || slot < 1) continue
    const name = f['name']
    if (typeof name !== 'string') continue
    const source = typeof f['source'] === 'string' ? SoundSource.of(f['source']) : null
    if (source === null) continue
    out = put(out, { project, group, pad, slot, name, source })
  }
  return out
}

/**
 * Whether [p] can still go on the device: made on its [activeProject], and
 * the device holds the sound in that slot ([deviceNames], by slot). A factory
 * sound also fits where the device lists that slot unnamed (FactorySounds.unnamed):
 * the factory sound is still there.
 */
export function fits(p: OfflinePad, activeProject: number | null, deviceNames: ReadonlyMap<number, string>): boolean {
  if (p.project !== activeProject) return false
  const dev = deviceNames.get(p.slot)
  if (dev === undefined) return false
  switch (p.source) {
    case 'device':
      return PadSoundCache.sameName(dev, p.name)
    case 'factory':
      return PadSoundCache.sameName(dev, p.name) || unnamed(p.slot, dev)
  }
}

/** The Kotlin `OfflinePads` (with its companion). */
export const OfflinePads = { EMPTY, size, at, put, drop, toJson, fromJson, fits } as const
