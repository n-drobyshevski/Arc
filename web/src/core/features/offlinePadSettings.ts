// Port of core/src/main/kotlin/dev/arc/ep133/features/OfflinePadSettings.kt
//
// Live's pad settings changed offline, in arc only (an addition), like
// OfflinePads for sounds: at most one per pad, in the order they were made,
// kept until the next connection puts them on the EP-133 or they are reset.
//
// Web deltas:
// - The data classes are plain readonly interfaces; their methods are
//   functions taking the value first (`s.put(p)` is `put(s, p)`), and
//   `OfflinePadSettings.EMPTY` / `fromJson` are on the `OfflinePadSettings`
//   object with them.
// - fromJson reads through JSON.parse. kotlinx's intOrNull on a non-string
//   primitive is read from the parsed value: a whole number in the Int range
//   (1.0 parses as 1 in JS, where Kotlin rejects "1.0").

import type { JsonObject } from '../protocol/fs'
import { PadSettings } from './padSettings'

/**
 * A pad's SOUND EDIT settings changed while no EP-133 is connected (an
 * addition): the [project]'s pad file for [group] (0..3, A..D) and [pad] (its
 * number in the project file, pNN, as in PadTarget), and the [settings] it
 * should get.
 */
export interface OfflinePadSetting {
  readonly project: number
  readonly group: number
  readonly pad: number
  readonly settings: PadSettings
}

export interface OfflinePadSettings {
  readonly list: readonly OfflinePadSetting[]
}

const EMPTY: OfflinePadSettings = { list: [] }

const samePad = (p: OfflinePadSetting, project: number, group: number, pad: number): boolean =>
  p.project === project && p.group === group && p.pad === pad

export function size(s: OfflinePadSettings): number {
  return s.list.length
}

/** The change on that pad, if any. */
export function at(s: OfflinePadSettings, project: number, group: number, pad: number): OfflinePadSetting | null {
  return s.list.find((p) => samePad(p, project, group, pad)) ?? null
}

/** [p] replaces that pad's change, if any, and goes last. */
export function put(s: OfflinePadSettings, p: OfflinePadSetting): OfflinePadSettings {
  return { list: [...drop(s, p.project, p.group, p.pad).list, p] }
}

/** Without that pad's change: the pad has the settings the device read had again. */
export function drop(s: OfflinePadSettings, project: number, group: number, pad: number): OfflinePadSettings {
  return { list: s.list.filter((p) => !samePad(p, project, group, pad)) }
}

export function toJson(s: OfflinePadSettings): string {
  // Non-numeric keys: JSON.stringify keeps them in the Kotlin order.
  return JSON.stringify({
    v: 1,
    pads: s.list.map((p) => ({ project: p.project, group: p.group, pad: p.pad, settings: PadSettings.toJson(p.settings) })),
  })
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A whole number written as a number (not a string), in the Int range (kotlinx intOrNull). */
function intOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= -(2 ** 31) && v <= 2 ** 31 - 1 ? v : null
}

/** Null when the text is not a version this one can read; entries it can't read are skipped. */
export function fromJson(text: string): OfflinePadSettings | null {
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
    const settings = f['settings']
    if (!isObject(settings)) continue
    out = put(out, { project, group, pad, settings: PadSettings.fromJson(settings as JsonObject) })
  }
  return out
}

/** The Kotlin `OfflinePadSettings` (with its companion). */
export const OfflinePadSettings = { EMPTY, size, at, put, drop, toJson, fromJson } as const
