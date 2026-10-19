// Port of core/src/main/kotlin/dev/arc/ep133/features/DeviceBrowser.kt
//
// Read-only views of the device (not part of the web version), built only on
// the commands the backup already uses (LIST, META get, GET).
//
// Web deltas: Session.onLoop is dropped (JS is single-threaded; the awaits run
// in order). `hundreds` returns {from, to, sounds} for Kotlin's
// Pair<IntRange, List<SoundEntry>>.

import { slotsUsedByProject } from '../formats/tar'
import {
  MAX_SAMPLE_RATE,
  asObject,
  getMetadata,
  getStorage,
  listProjects,
  listSounds,
  pickSoundSettings,
  readProject,
  type ProjectEntry,
  type SoundEntry,
  type Storage,
} from '../protocol/device'
import type { JsonObject } from '../protocol/fs'
import type { Session } from '../protocol/session'
import { ktTrim } from '../util/kotlinText'
import type { PadSettings } from './padSettings'
import { read as readPads, settings as padSettingsOf, type PadGroup } from './projectPads'

/** What is on the device right now. */
export interface DeviceContents {
  storage: Storage
  sounds: SoundEntry[]
  projects: ProjectEntry[]
  /** The slots of [sounds] (Kotlin's computed property). */
  occupiedSlots: Set<number>
}

/** The sounds a project uses and its pads. */
/**
 * A project's sounds ([slots]) and pads, from one download; [settings] are the
 * pads' SOUND EDIT settings where their records look like settings, by
 * flatKey (projectPads.settings; an addition). Missing means none (Kotlin's
 * default).
 */
export interface ProjectLayout {
  slots: number[]
  pads: PadGroup[]
  settings?: Map<string, PadSettings>
}

/** One sound's metadata as the device reports it. */
export interface SoundDetails {
  slot: number
  name: string
  channels: number
  sampleRate: number
  /** The settings a backup carries (SOUND_KEYS), in that order. */
  settings: JsonObject
  /** CRC32 of the PCM, if the device reports one. */
  crc: number | null
}

/** Sounds of one hundred-slot block: 1..99, 100..199, and so on (inclusive bounds). */
export interface SlotBlock {
  from: number
  to: number
  sounds: SoundEntry[]
}

export function deviceContents(storage: Storage, sounds: SoundEntry[], projects: ProjectEntry[]): DeviceContents {
  return { storage, sounds, projects, occupiedSlots: new Set(sounds.map((s) => s.slot)) }
}

/** Storage, sound slots and projects, in the same order refreshDevice reads them. */
export async function contents(session: Session): Promise<DeviceContents> {
  const storage = await getStorage(session)
  const sounds = await listSounds(session)
  const projects = await listProjects(session)
  return deviceContents(storage, sounds, projects)
}

/** A sound's metadata (two small META pages), without downloading the audio. */
export async function soundDetails(session: Session, slot: number): Promise<SoundDetails> {
  const meta = asObject(await getMetadata(session, slot))
  const crc = meta.crc
  return {
    slot,
    // `x || fallback`, as Kotlin's jsStringOr / jsNumOr spell out.
    name: meta.name ? String(meta.name) : `sound ${slot}`,
    channels: Number(meta.channels) || 1,
    sampleRate: Number(meta.samplerate) || MAX_SAMPLE_RATE,
    settings: pickSoundSettings(meta),
    crc: typeof crc === 'number' ? Math.trunc(crc) : null,
  }
}

/**
 * Sample slots a project's pads use. This downloads the project (a TAR), so
 * it takes a few seconds; the transfer is followed by the usual handshake.
 */
export async function projectSounds(session: Session, project: number, signal?: AbortSignal | null): Promise<number[]> {
  return (await projectLayout(session, project, signal)).slots
}

/** The sounds a project uses and its pads, from one download. */
export async function projectLayout(
  session: Session,
  project: number,
  signal?: AbortSignal | null,
): Promise<ProjectLayout> {
  const tar = await readProject(session, project, { signal })
  return { slots: slotsUsedByProject(tar), pads: readPads(tar), settings: padSettingsOf(tar) }
}

// Kotlin's Char.equals(other, ignoreCase = true): simple (one char) case mappings.
function upperChar(c: string): string {
  const u = c.toUpperCase()
  return u.length === 1 ? u : c
}

function lowerChar(c: string): string {
  // U+0130 is the one char whose full lowercase is two chars; its simple mapping is 'i'.
  if (c === 'İ') return 'i'
  const l = c.toLowerCase()
  return l.length === 1 ? l : c
}

function charEqualsIgnoreCase(a: string, b: string): boolean {
  if (a === b) return true
  const ua = upperChar(a)
  const ub = upperChar(b)
  return ua === ub || lowerChar(ua) === lowerChar(ub)
}

/** Kotlin's String.contains(other, ignoreCase = true), UTF-16 unit by unit. */
function containsIgnoreCase(s: string, q: string): boolean {
  outer: for (let i = 0; i + q.length <= s.length; i++) {
    for (let j = 0; j < q.length; j++) if (!charEqualsIgnoreCase(s[i + j]!, q[j]!)) continue outer
    return true
  }
  return false
}

/**
 * The sounds whose name contains [query] (ignoring case), or whose slot is
 * the number typed ("12" and "012" both find slot 12). A blank query keeps all.
 */
export function findSounds(sounds: SoundEntry[], query: string): SoundEntry[] {
  const q = ktTrim(query)
  if (q.length === 0) return sounds
  const slot = slotNumber(q)
  return sounds.filter((s) => containsIgnoreCase(s.name, q) || s.slot === slot)
}

// Char.isDigit on the JVM is Unicode Nd, per UTF-16 unit (a surrogate is never a digit).
const ND = /^\p{Nd}$/u
const isDigitUnit = (u: number): boolean => ND.test(String.fromCharCode(u))

/** Character.digit(c, 10) for an Nd unit: BMP Nd digits come in separate runs of ten, 0 first. */
function digitValue(u: number): number {
  let d = 0
  while (d < 9 && isDigitUnit(u - d - 1)) d++
  return d
}

/**
 * Kotlin `q.takeIf { it.all(Char::isDigit) }?.toIntOrNull()`: any Unicode decimal
 * digits ("١٢" is 12, as toIntOrNull reads them), null past Int.MAX_VALUE.
 */
function slotNumber(q: string): number | null {
  let n = 0
  for (let i = 0; i < q.length; i++) {
    const u = q.charCodeAt(i)
    if (!isDigitUnit(u)) return null
    n = n * 10 + digitValue(u)
    if (n > 2 ** 31 - 1) return null
  }
  return n
}

/** Sounds in slot order, grouped by hundreds of slots: 1..99, 100..199, and so on. */
export function hundreds(sounds: readonly SoundEntry[]): SlotBlock[] {
  const groups = new Map<number, SoundEntry[]>()
  for (const s of [...sounds].sort((a, b) => a.slot - b.slot)) {
    const h = Math.trunc(s.slot / 100)
    const list = groups.get(h)
    if (list) list.push(s)
    else groups.set(h, [s])
  }
  return [...groups.entries()].map(([h, list]) => ({ from: h === 0 ? 1 : h * 100, to: h * 100 + 99, sounds: list }))
}
