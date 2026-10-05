// Port of core/src/main/kotlin/dev/arc/ep133/features/PakCompare.kt
//
// Compares two saved backups (an addition to the web version). Audio is
// compared as decoded PCM, so the same sound in a WAV with another header is
// the same. Settings are what a restore would send: the settings embedded in
// the WAV (as the Sample Tool writes them) with arc.json's laid over them,
// like prepareSound; they are compared when both sides have some. Projects
// are compared by their bytes, with pad changes listed.
//
// Web deltas: enums are string unions with a const object of the same name;
// data classes are plain objects built by same-named factory functions (with
// the Kotlin defaults); Kotlin's Pair<String, Int> pad keys are the
// "group\u0000pad" strings of projectPads.flatKey, and a missing key reads
// as null, exactly like Kotlin's `map[key]`.

import type { Pak } from '../backup/pak'
import { decodeWav, type DecodedWav } from '../formats/wav'
import { isJsonObject, type JsonObject, type JsonValue } from '../protocol/fs'
import { equalBytes } from '../util/bytes'
import { flatten, groupOrder, read, type PadGroup } from './projectPads'

export type ChangeKind = 'ADDED' | 'REMOVED' | 'CHANGED'
export const ChangeKind = { ADDED: 'ADDED', REMOVED: 'REMOVED', CHANGED: 'CHANGED' } as const

export interface SoundChange {
  readonly slot: number
  readonly kind: ChangeKind
  readonly oldName: string | null
  readonly newName: string | null
  readonly audioChanged: boolean
  readonly renamed: boolean
  /** Setting keys that differ; only judged when both backups carry settings. */
  readonly settingsChanged: readonly string[]
}

export function SoundChange(
  slot: number,
  kind: ChangeKind,
  oldName: string | null,
  newName: string | null,
  { audioChanged = false, renamed = false, settingsChanged = [] }: { audioChanged?: boolean; renamed?: boolean; settingsChanged?: readonly string[] } = {},
): SoundChange {
  return { slot, kind, oldName, newName, audioChanged, renamed, settingsChanged }
}

export interface PadChange {
  readonly group: string
  readonly pad: number
  readonly oldSlot: number | null
  readonly newSlot: number | null
}

export function PadChange(group: string, pad: number, oldSlot: number | null, newSlot: number | null): PadChange {
  return { group, pad, oldSlot, newSlot }
}

export interface ProjectChange {
  readonly project: number
  readonly kind: ChangeKind
  readonly padChanges: readonly PadChange[]
  /** False when either project's pads could not be read, so pad changes are unknown. */
  readonly padsRead: boolean
}

export function ProjectChange(
  project: number,
  kind: ChangeKind,
  padChanges: readonly PadChange[] = [],
  padsRead = true,
): ProjectChange {
  return { project, kind, padChanges, padsRead }
}

export interface PakCompareResult {
  readonly sounds: readonly SoundChange[]
  readonly projects: readonly ProjectChange[]
  readonly sameSounds: number
  readonly sameProjects: number
  /** `sounds.isEmpty() && projects.isEmpty()` */
  readonly nothingChanged: boolean
}

export function PakCompareResult(
  sounds: readonly SoundChange[],
  projects: readonly ProjectChange[],
  sameSounds: number,
  sameProjects: number,
): PakCompareResult {
  return { sounds, projects, sameSounds, sameProjects, nothingChanged: sounds.length === 0 && projects.length === 0 }
}

/** The sorted union of two maps' number keys (Kotlin `(a.keys + b.keys).toSortedSet()`). */
function sortedUnion(a: ReadonlyMap<number, unknown>, b: ReadonlyMap<number, unknown>): number[] {
  return [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y)
}

function tryDecode(wav: Uint8Array): DecodedWav | null {
  try {
    return decodeWav(wav)
  } catch {
    return null
  }
}

/** Same channels, rate and PCM; byte equality when either WAV can't be read. */
function sameAudio(a: Uint8Array, b: Uint8Array, wa: DecodedWav | null, wb: DecodedWav | null): boolean {
  if (equalBytes(a, b)) return true
  if (wa === null || wb === null) return false
  return wa.channels === wb.channels && wa.sampleRate === wb.sampleRate && equalBytes(wa.pcm, wb.pcm)
}

/**
 * {...(wav.embedded ?? {}), ...(settings ?? {})}, or null when there are none of either.
 * A Map, not an object: Kotlin's LinkedHashMap keeps insertion order (embedded
 * keys, then new arc.json keys) where a JS object would put integer-like keys first.
 */
function effective(wav: DecodedWav | null, side: JsonValue | null): Map<string, JsonValue> | null {
  const embedded = wav?.embedded ?? null
  if (embedded === null && !isJsonObject(side)) return null
  const m = new Map<string, JsonValue>()
  if (embedded !== null) for (const [k, v] of Object.entries(embedded)) m.set(k, v as JsonValue)
  if (isJsonObject(side)) for (const [k, v] of Object.entries(side)) m.set(k, v)
  return m
}

function settingsChanged(a: Map<string, JsonValue> | null, b: Map<string, JsonValue> | null): string[] {
  if (a === null || b === null) return []
  const keys = [...new Set([...a.keys(), ...b.keys()])]
  return keys.filter((k) => !a.has(k) || !b.has(k) || JSON.stringify(a.get(k)) !== JSON.stringify(b.get(k)))
}

function padChanges(ga: readonly PadGroup[], gb: readonly PadGroup[]): PadChange[] {
  const pa = flatten(ga)
  const pb = flatten(gb)
  const at = (m: ReadonlyMap<string, number | null>, k: string): number | null => m.get(k) ?? null
  // Groups a-d first (as everywhere else), then pad number.
  return [...new Set([...pa.keys(), ...pb.keys()])]
    .filter((k) => at(pa, k) !== at(pb, k))
    .map((k) => {
      // The pad number is digits, so the last NUL separates it from the group name.
      const cut = k.lastIndexOf('\u0000')
      return PadChange(k.slice(0, cut), Number(k.slice(cut + 1)), at(pa, k), at(pb, k))
    })
    .sort((x, y) => groupOrder(x.group, y.group) || x.pad - y.pad)
}

export function compare(old: Pak, next: Pak): PakCompareResult {
  const sounds: SoundChange[] = []
  let sameSounds = 0
  for (const slot of sortedUnion(old.sounds, next.sounds)) {
    const a = old.sounds.get(slot)
    const b = next.sounds.get(slot)
    if (a === undefined) {
      sounds.push(SoundChange(slot, ChangeKind.ADDED, null, b!.name))
    } else if (b === undefined) {
      sounds.push(SoundChange(slot, ChangeKind.REMOVED, a.name, null))
    } else {
      const wa = tryDecode(a.wav)
      const wb = tryDecode(b.wav)
      const audioChanged = !sameAudio(a.wav, b.wav, wa, wb)
      const renamed = a.name !== b.name
      const settings = settingsChanged(effective(wa, a.settings), effective(wb, b.settings))
      if (audioChanged || renamed || settings.length > 0) {
        sounds.push(SoundChange(slot, ChangeKind.CHANGED, a.name, b.name, { audioChanged, renamed, settingsChanged: settings }))
      } else {
        sameSounds++
      }
    }
  }

  const projects: ProjectChange[] = []
  let sameProjects = 0
  for (const n of sortedUnion(old.projects, next.projects)) {
    const a = old.projects.get(n)
    const b = next.projects.get(n)
    if (a === undefined) {
      projects.push(ProjectChange(n, ChangeKind.ADDED))
    } else if (b === undefined) {
      projects.push(ProjectChange(n, ChangeKind.REMOVED))
    } else if (equalBytes(a, b)) {
      sameProjects++
    } else {
      const ga = read(a)
      const gb = read(b)
      projects.push(ProjectChange(n, ChangeKind.CHANGED, padChanges(ga, gb), ga.length > 0 && gb.length > 0))
    }
  }
  return PakCompareResult(sounds, projects, sameSounds, sameProjects)
}

/** The Kotlin `object PakCompare`. */
export const PakCompare = { compare } as const
