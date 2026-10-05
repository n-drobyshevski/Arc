// Port of core/src/main/kotlin/dev/arc/ep133/backup/PakExport.kt
//
// Pieces of a backup as their own files (an addition to the web version):
// a single sound's WAV, or one project with the sounds it uses as a smaller
// .pak in the same Sample Tool layout.

import { slotsUsedByProject } from '../formats/tar'
import { writeZip, type ZipEntry } from '../formats/zip'
import type { JsonObject, JsonValue } from '../protocol/fs'
import { APP_NAME, metaJson, pad2, pad3, safeName } from './backup'
import { PakError, type Pak, type PakSound } from './pak'

const utf8 = new TextEncoder()

/** `x || fallback` as a string (Kotlin `jsStringOr`). */
const stringOr = (v: unknown, fallback: string): string => (v ? String(v) : fallback)

/** "001 kick.wav", named the way backups name their sound files. */
export function soundFileName(snd: PakSound): string {
  return `${pad3(snd.slot)} ${safeName(snd.name)}.wav`
}

/** The sound's WAV exactly as stored in the backup. */
export function soundWav(pak: Pak, slot: number): Uint8Array {
  const snd = pak.sounds.get(slot)
  if (!snd) throw new PakError(`Sound ${slot} is not in this backup`)
  return snd.wav
}

/** Sounds from the backup that a project's pads use. */
export function projectSlots(pak: Pak, project: number): number[] {
  const tar = pak.projects.get(project)
  if (!tar) throw new PakError(`Project ${project} is not in this backup`)
  return slotsUsedByProject(tar).filter((s) => pak.sounds.has(s))
}

/**
 * A .pak with one project and the sounds it uses. meta.json keeps the
 * original device fields with a new generated_at; arc.json keeps the
 * original per-sound entries for the included slots.
 * [offsetMin] is minutes east of UTC for the zip's DOS times (Kotlin `zone`; default local).
 */
export async function project(pak: Pak, n: number, nowMs: number = Date.now(), offsetMin?: number): Promise<Uint8Array> {
  const tar = pak.projects.get(n)
  if (!tar) throw new PakError(`Project ${n} is not in this backup`)
  const slots = projectSlots(pak, n)
  const meta = metaJson(
    stringOr(pak.meta.device_name, 'EP-133'),
    stringOr(pak.meta.device_sku, ''),
    stringOr(pak.meta.device_version, ''),
    nowMs,
  )
  const s = pak.sidecar.sounds
  const oldSounds = typeof s === 'object' && s !== null && !Array.isArray(s) ? s : null
  const soundInfo: JsonObject = {}
  for (const slot of slots) {
    const snd = pak.sounds.get(slot)!
    const key = String(slot)
    const old: JsonValue | undefined = oldSounds && Object.hasOwn(oldSounds, key) ? oldSounds[key] : undefined
    soundInfo[key] = old !== undefined ? old : { name: snd.name, settings: snd.settings ?? {} }
  }
  const sidecar: JsonObject = { app: APP_NAME, version: 1, sounds: soundInfo }
  const entries: ZipEntry[] = [
    { path: '/meta.json', data: utf8.encode(JSON.stringify(meta, null, 2)) },
    { path: '/arc.json', data: utf8.encode(JSON.stringify(sidecar)) },
  ]
  for (const slot of slots) {
    const snd = pak.sounds.get(slot)!
    entries.push({ path: `/sounds/${soundFileName(snd)}`, data: snd.wav })
  }
  entries.push({ path: `/projects/P${pad2(n)}.tar`, data: tar })
  return writeZip(entries, offsetMin === undefined ? { date: nowMs } : { date: nowMs, offsetMin })
}

/** "my-set-project-2.pak" (the ".pak" suffix is removed case-sensitively). */
export function projectFileName(backupFileName: string, n: number): string {
  const base = backupFileName.endsWith('.pak') ? backupFileName.slice(0, -4) : backupFileName
  return `${base}-project-${n}.pak`
}
