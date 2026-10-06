// Port of core/src/main/kotlin/dev/arc/ep133/features/FactorySounds.kt
//
// The EP-133's factory sounds (an addition): the pack teenage engineering's
// own EP Sample Tool restores a device with, a .pak served beside the tool on
// their site. arc keeps it as a library entry of its own [SOURCE] (never
// pruned), so it is browsed, searched and restored like a backup, and Live
// plays its [PROJECT] while no EP-133 has been read yet.
//
// The pack's file name carries a build hash that changes when the tool is
// rebuilt, so it is looked up in the tool's page and script ([locate]); the
// last name known ([KNOWN_PAK]) stands in when that fails.
//
// Web delta: teenage engineering's server sends no CORS headers, so the
// browser reads these paths through arc's own origin (vercel.json's rewrite
// of /te/apps/ep-sample-tool/, and Vite's proxy in dev); [locate] takes paths
// on ORIGIN either way.

import type { Pak } from '../backup/pak'
import type { LiveSnapshot } from './liveSnapshot'
import { ktTrim } from '../util/kotlinText'
import { read as readPads } from './projectPads'

/** A library entry's source for the factory pack (beside "device" and "import"). */
export const SOURCE = 'factory'

export const ORIGIN = 'https://teenage.engineering'

/** The EP Sample Tool's page, on [ORIGIN]. */
export const PAGE = '/apps/ep-sample-tool'

/** The pack's path when last looked at (Nov 2023's pack, OS 1.1.0). */
export const KNOWN_PAK = '/apps/ep-sample-tool/assets/ep-133-factory-content-DRyE_DHC.pak'

/** Its size then, for the progress when the server gives none. */
export const KNOWN_SIZE = 27_375_018

/** The library entry's file name. */
export const FILE_NAME = 'ep-133-factory-content.pak'

/** The project Live shows: the factory kit (drums on A, bass on B, keys on C). */
export const PROJECT = 1

const SCRIPT = /src="(\/apps\/ep-sample-tool\/assets\/[A-Za-z0-9_.-]+\.js)"/
const PAK = /\/apps\/ep-sample-tool\/assets\/ep-133-factory-content-[A-Za-z0-9_-]+\.pak/

/** The tool's script in its page, if found. */
export function scriptPath(html: string): string | null {
  return SCRIPT.exec(html)?.[1] ?? null
}

/** The EP-133 pack's path in the tool's script, if found (not the EP-40's beside it). */
export function pakPath(script: string): string | null {
  return PAK.exec(script)?.[0] ?? null
}

/**
 * The pack's path on [ORIGIN]: from the tool's page and script, read with
 * [text], else [KNOWN_PAK].
 */
export async function locate(text: (path: string) => Promise<string>): Promise<string> {
  let found: string | null = null
  try {
    const script = scriptPath(await text(PAGE))
    if (script !== null) found = pakPath(await text(script))
  } catch {
    found = null
  }
  return found ?? KNOWN_PAK
}

/** Whether [pak] is an EP-133 factory pack (its meta.json says so). */
export function isFactory(pak: Pak): boolean {
  const meta = (k: string): string | null => {
    const v = pak.meta[k]
    return typeof v === 'string' ? v : null
  }
  return meta('pak_type') === 'factory' && meta('device_name') === 'EP-133' && pak.sounds.size > 0
}

/** What Live shows from the pack: [PROJECT]'s pads and every sound's name; null when it has none. */
export function snapshot(pak: Pak, savedAt: number): LiveSnapshot | null {
  const tar = pak.projects.get(PROJECT)
  if (tar === undefined) return null
  const groups = readPads(tar)
  if (groups.length === 0) return null
  const names = new Map<number, string>()
  for (const [slot, s] of pak.sounds) names.set(slot, s.name)
  return { savedAt, activeProject: PROJECT, groups, names }
}

/**
 * Whether [name] is the one the EP-133 gives a sound nobody named, its
 * slot's file ("343.pcm"): how a device still holding the factory sounds
 * lists them. Live plays such a pad from the pack when it has no copy of
 * its own (a sample recorded on the device into that slot would be
 * named so too, but arc copies it while connected).
 */
export function unnamed(slot: number, name: string): boolean {
  return ktTrim(name).toLowerCase() === String(slot).padStart(3, '0') + '.pcm'
}

/** The library's factory pack, if it has one (the newest, should there be two). */
export function inLibrary<B extends { readonly source: string; readonly createdAt: number }>(backups: readonly B[]): B | null {
  let best: B | null = null
  for (const b of backups) {
    if (b.source === SOURCE && (best === null || best.createdAt < b.createdAt)) best = b
  }
  return best
}

/** The Kotlin `object FactorySounds`. */
export const FactorySounds = {
  SOURCE,
  ORIGIN,
  PAGE,
  KNOWN_PAK,
  KNOWN_SIZE,
  FILE_NAME,
  PROJECT,
  scriptPath,
  pakPath,
  locate,
  isFactory,
  snapshot,
  unnamed,
  inLibrary,
} as const
