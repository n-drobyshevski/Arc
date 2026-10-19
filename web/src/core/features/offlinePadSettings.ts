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
//   (1.0 parses as 1 in JS, where Kotlin rejects "1.0"); longOrNull likewise,
//   a safe integer.
// - frames is `number | null` (Kotlin's `Long? = null`) and always present.
// - byPad's Triple keys are `${project}:${group}:${pad}` strings (padKey), in
//   a Map kept in insertion order as Kotlin's associate.

import type { JsonObject } from '../protocol/fs'
import { PadSettings } from './padSettings'

/**
 * A pad's SOUND EDIT settings changed while no EP-133 is connected (an
 * addition): the [project]'s pad file for [group] (0..3, A..D) and [pad] (its
 * number in the project file, pNN, as in PadTarget), and the [settings] it
 * should get. [slot] is the sound the settings were made for (the replay
 * skips a pad that holds another sound by then); [base] is what the sheet
 * showed before the first offline turn (the fields of it not turned are taken
 * from the device at the replay, PadSettings.mergedOnto); [frames] is that
 * sample's length when known, so the replayed record is whole.
 */
export interface OfflinePadSetting {
  readonly project: number
  readonly group: number
  readonly pad: number
  readonly slot: number
  readonly settings: PadSettings
  readonly base: PadSettings
  readonly frames: number | null
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

/**
 * [p] replaces that pad's change, if any, and goes last. A change already
 * there for the same slot keeps its base (the first turn's), so the replay
 * still knows what the sheet showed before any of them; one for another sound
 * is replaced whole.
 */
export function put(s: OfflinePadSettings, p: OfflinePadSetting): OfflinePadSettings {
  const old = at(s, p.project, p.group, p.pad)
  const next = old !== null && old.slot === p.slot ? { ...p, base: old.base } : p
  return { list: [...drop(s, p.project, p.group, p.pad).list, next] }
}

/** Without that pad's change: the pad has the settings the device read had again. */
export function drop(s: OfflinePadSettings, project: number, group: number, pad: number): OfflinePadSettings {
  return { list: s.list.filter((p) => !samePad(p, project, group, pad)) }
}

/** The key byPad gives the pad (Kotlin's Triple(project, group, pad)). */
export function padKey(project: number, group: number, pad: number): string {
  return `${project}:${group}:${pad}`
}

/** The settings each changed pad should get, by padKey(project, group, pad), in the order they were made. */
export function byPad(s: OfflinePadSettings): Map<string, PadSettings> {
  return new Map(s.list.map((p) => [padKey(p.project, p.group, p.pad), p.settings]))
}

export function toJson(s: OfflinePadSettings): string {
  // Non-numeric keys: JSON.stringify keeps them in the Kotlin order.
  return JSON.stringify({
    v: 1,
    pads: s.list.map((p) => {
      const m: JsonObject = {
        project: p.project,
        group: p.group,
        pad: p.pad,
        slot: p.slot,
        settings: PadSettings.toJson(p.settings),
        base: PadSettings.toJson(p.base),
      }
      if (p.frames !== null) m['frames'] = p.frames
      return m
    }),
  })
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A whole number written as a number (not a string), in the Int range (kotlinx intOrNull). */
function intOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= -(2 ** 31) && v <= 2 ** 31 - 1 ? v : null
}

/** A whole number written as a number, in the Long range JS keeps exact (kotlinx longOrNull). */
function longOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) ? v : null
}

/**
 * Null when the text is not a version this one can read; entries it can't
 * read (one without a slot or settings among them) are skipped. A missing
 * base is the settings; missing or unreadable frames are unknown.
 */
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
    const slot = intOrNull(f['slot'])
    if (slot === null || slot < 1 || slot > 999) continue
    const raw = f['settings']
    if (!isObject(raw)) continue
    const settings = PadSettings.fromJson(raw as JsonObject)
    const rawBase = f['base']
    const base = isObject(rawBase) ? PadSettings.fromJson(rawBase as JsonObject) : settings
    const n = longOrNull(f['frames'])
    const frames = n !== null && n >= 1 ? n : null
    out = put(out, { project, group, pad, slot, settings, base, frames })
  }
  return out
}

/** The Kotlin `OfflinePadSettings` (with its companion). */
export const OfflinePadSettings = { EMPTY, size, at, put, drop, byPad, padKey, toJson, fromJson } as const
