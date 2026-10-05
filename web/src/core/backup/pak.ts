// Port of core/src/main/kotlin/dev/arc/ep133/backup/Pak.kt (+ reference/src/backup.js)
//
// Reading a .pak (ours or the official Sample Tool's) and describing it for the library.

import { slotsUsedByProject } from '../formats/tar'
import { readZip } from '../formats/zip'
import { asObject, type JsonObject, type JsonValue } from '../protocol/fs'

/** A sound inside a .pak: the WAV file plus the settings and name from arc.json, if any. */
export interface PakSound {
  slot: number
  name: string
  wav: Uint8Array
  /** `side.settings ?? null`: whatever arc.json holds (normally an object). */
  settings: JsonValue | null
}

/** A parsed .pak. [sounds] and [projects] are in zip (central directory) order. */
export interface Pak {
  meta: JsonObject
  sidecar: JsonObject
  sounds: Map<number, PakSound>
  projects: Map<number, Uint8Array>
}

export interface PakDevice {
  product: string
  sku: string
  osVersion: string
}

/** What the library needs to know about a .pak without opening it again (`describePak`). */
export interface PakDescription {
  soundCount: number
  projectCount: number
  /** Ascending. */
  projects: number[]
  /** Ascending. */
  slots: number[]
  soundNames: Record<number, string>
  projectSlots: Record<number, number[]>
  device: PakDevice
  generatedAt: number | null
}

export class PakError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PakError'
  }
}

// Native JS regexes: /i folds ASCII only here and `.`/`\s` have their JS
// meanings, which the Kotlin spells out by hand.
const SOUND_PATH = /^sounds\/(\d{1,3})(?:\s+(.*))?\.wav$/i
const PROJECT_PATH = /^projects\/P(\d{1,2})\.tar$/i

/** JS truthiness. */
const truthy = (v: unknown): boolean => Boolean(v)

/** `x || fallback` with the result as a string (Kotlin `jsStringOr`). */
function stringOr(v: unknown, fallback: string): string {
  return truthy(v) ? String(v) : fallback
}

/** `sidecar.sounds?.[slot] ?? {}`: [sounds] may be an object keyed by slot or an array. */
function sidecarSound(sidecar: JsonObject, slot: number): JsonValue | undefined {
  const s = sidecar.sounds
  if (Array.isArray(s)) return s[slot]
  if (typeof s === 'object' && s !== null) return Object.hasOwn(s, String(slot)) ? s[String(slot)] : undefined
  return undefined
}

/** Property access on a parsed JSON value: only objects have named properties. */
function prop(v: JsonValue | undefined, key: string): JsonValue | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined
  return Object.hasOwn(v, key) ? v[key] : undefined
}

/** Parse a .pak (`openPak`). Throws for a file that is not a zip or holds nothing usable. */
export async function openPak(bytes: Uint8Array): Promise<Pak> {
  const files = await readZip(bytes)
  const json = (k: string): JsonValue | null => {
    const b = files.get(k)
    if (!b) return null
    try {
      return JSON.parse(new TextDecoder().decode(b)) as JsonValue
    } catch {
      return null
    }
  }
  // Kotlin asObject(): anything that is not an object (an array too) reads as {}.
  const meta = asObject(json('meta.json'))
  const sidecar = asObject(json('arc.json'))
  const sounds = new Map<number, PakSound>()
  const projects = new Map<number, Uint8Array>()
  for (const [path, data] of files) {
    const m = SOUND_PATH.exec(path)
    if (m) {
      const slot = Number(m[1])
      if (slot < 1 || slot > 999) continue
      const side = sidecarSound(sidecar, slot)
      const fileName = m[2]
      const sideName = prop(side, 'name')
      // side.name || fileName || `sound N`, kept a string (JS would keep a number as is).
      const name = truthy(sideName) ? String(sideName) : fileName ? fileName : `sound ${slot}`
      const settings = prop(side, 'settings') ?? null
      sounds.set(slot, { slot, name, wav: data, settings })
      continue
    }
    const p = PROJECT_PATH.exec(path)
    if (p) {
      const n = Number(p[1])
      if (n >= 1 && n <= 99) projects.set(n, data)
    }
  }
  if (!sounds.size && !projects.size) throw new PakError('This file has no sounds or projects in it')
  return { meta, sidecar, sounds, projects }
}

/** `Date.parse`. */
export function parseDate(s: string): number | null {
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : t
}

export function describePak(pak: Pak): PakDescription {
  const projectSlots: Record<number, number[]> = {}
  for (const [n, tar] of pak.projects) projectSlots[n] = slotsUsedByProject(tar)
  const soundNames: Record<number, string> = {}
  for (const [k, v] of pak.sounds) soundNames[k] = v.name
  const generated = pak.meta.generated_at
  return {
    soundCount: pak.sounds.size,
    projectCount: pak.projects.size,
    projects: [...pak.projects.keys()].sort((a, b) => a - b),
    slots: [...pak.sounds.keys()].sort((a, b) => a - b),
    soundNames,
    projectSlots,
    device: {
      product: stringOr(pak.meta.device_name, ''),
      sku: stringOr(pak.meta.device_sku, ''),
      osVersion: stringOr(pak.meta.device_version, ''),
    },
    // Date.parse(...) || null: NaN and 0 both give null.
    generatedAt: truthy(generated) ? parseDate(String(generated)) || null : null,
  }
}
