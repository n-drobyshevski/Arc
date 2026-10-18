// Port of core/src/main/kotlin/dev/arc/ep133/features/FactorySounds.kt
//
// The EP-133's factory sounds (an addition): the pack teenage engineering's
// own EP Sample Tool restores a device with, a .pak served beside the tool on
// their site. arc keeps it as a library entry of its own [SOURCE] (never
// pruned), so it is browsed, searched and restored like a backup, and Live
// plays its projects ([PROJECT] first) while no EP-133 is connected.
//
// A second pack, the EP-1320 Medieval's ([FactoryKit.EP1320]): teenage
// engineering publishes none for it, so arc keeps a copy of the person's own
// Medieval backup (or an imported pack) under a source of its own. Live
// offline shows one kit at a time.
//
// A third, the EP-40 Riddim's ([FactoryKit.EP40]): served beside the
// EP-133's in the EP Sample Tool, downloaded the same way ([download] gives
// each downloadable kit's path, size and file name).
//
// The pack's file name carries a build hash that changes when the tool is
// rebuilt, so it is looked up in the tool's page and script ([locate]); the
// last name known ([KNOWN_PAK]) stands in when that fails.
//
// Web delta: teenage engineering's server sends no CORS headers, so the
// browser reads these paths through arc's own origin (vercel.json's rewrite
// of /te/apps/ep-sample-tool/, and Vite's proxy in dev); [locate] takes paths
// on ORIGIN either way.
// FactoryKit is a frozen object per kit (compared by identity), its
// companion's ofId / ofSource / ofSku on the same name.

import type { Pak } from '../backup/pak'
import type { LiveSnapshot } from './liveSnapshot'
import type { BackupDevice } from '../text/libraryRules'
import { ktTrim } from '../util/kotlinText'
import { read as readPads } from './projectPads'

/** A library entry's source for the factory pack (beside "device" and "import"). */
export const SOURCE = 'factory'

/** A kit's id, as stored (the factoryKit setting, an offline pad's "kit"). */
export type FactoryKitId = 'ep133' | 'ep1320' | 'ep40'

/** A factory pack arc can keep: the EP-133's or the EP-40 Riddim's (downloaded), or the EP-1320 Medieval's (from your own backup). */
export interface FactoryKit {
  readonly id: FactoryKitId
  /** Its library entries' source. */
  readonly source: string
  /** The device's sku (DeviceInfo.sku, meta.json's device_sku). */
  readonly sku: string
  readonly model: string
}

const EP133: FactoryKit = Object.freeze({ id: 'ep133', source: SOURCE, sku: 'TE032AS001', model: 'EP-133' })
const EP1320: FactoryKit = Object.freeze({ id: 'ep1320', source: 'factory-ep1320', sku: 'TE032AS005', model: 'EP-1320' })
const EP40: FactoryKit = Object.freeze({ id: 'ep40', source: 'factory-ep40', sku: 'TE032AS006', model: 'EP-40' })
const KITS: readonly FactoryKit[] = Object.freeze([EP133, EP1320, EP40])

/** The Kotlin `enum class FactoryKit`, with its companion. */
export const FactoryKit = {
  EP133,
  EP1320,
  EP40,
  entries: KITS,
  /** By [id] ("ep133", "ep1320", "ep40"). */
  ofId(id: string | null | undefined): FactoryKit | null {
    return KITS.find((k) => k.id === id) ?? null
  },
  /** By a library entry's [source]. */
  ofSource(source: string | null | undefined): FactoryKit | null {
    return KITS.find((k) => k.source === source) ?? null
  },
  /** By a device's [sku]: TE032AS001 the EP-133's, TE032AS005 the EP-1320's, TE032AS006 the EP-40's, else null. */
  ofSku(sku: string | null | undefined): FactoryKit | null {
    return KITS.find((k) => k.sku === sku) ?? null
  },
} as const

/** Whether [source] is a factory pack's, of any kit (never pruned). */
export function isFactorySource(source: string | null | undefined): boolean {
  return FactoryKit.ofSource(source) !== null
}

export const ORIGIN = 'https://teenage.engineering'

/** The EP Sample Tool's page, on [ORIGIN]. */
export const PAGE = '/apps/ep-sample-tool'

/** The pack's path when last looked at (Nov 2023's pack, OS 1.1.0). */
export const KNOWN_PAK = '/apps/ep-sample-tool/assets/ep-133-factory-content-DRyE_DHC.pak'

/** Its size then, for the progress when the server gives none. */
export const KNOWN_SIZE = 27_375_018

/** The library entry's file name. */
export const FILE_NAME = 'ep-133-factory-content.pak'

/** The EP-1320 copy's file name. */
export const FILE_NAME_1320 = 'ep-1320-factory-content.pak'

/** The EP-40 pack's path when last looked at (Oct 2026's, pak_release 0.2.0). */
export const KNOWN_PAK_40 = '/apps/ep-sample-tool/assets/ep-40-factory-content-C42FyxWp.pak'

/** Its size then. */
export const KNOWN_SIZE_40 = 68_853_737

/** The EP-40 pack's library file name. */
export const FILE_NAME_40 = 'ep-40-factory-content.pak'

/** The project Live shows first, for every kit: the factory kit (drums on A, bass on B, keys on C). */
export const PROJECT = 1

const SCRIPT = /src="(\/apps\/ep-sample-tool\/assets\/[A-Za-z0-9_.-]+\.js)"/
const PAK = /\/apps\/ep-sample-tool\/assets\/ep-133-factory-content-[A-Za-z0-9_-]+\.pak/
const PAK_40 = /\/apps\/ep-sample-tool\/assets\/ep-40-factory-content-[A-Za-z0-9_-]+\.pak/

/** What a downloadable kit's pack is fetched by: its path in the tool's script, the path last known, its size then, and its file name. */
export interface KitDownload {
  readonly pak: RegExp
  readonly knownPak: string
  readonly knownSize: number
  readonly fileName: string
}

const DOWNLOAD_133: KitDownload = Object.freeze({ pak: PAK, knownPak: KNOWN_PAK, knownSize: KNOWN_SIZE, fileName: FILE_NAME })
const DOWNLOAD_40: KitDownload = Object.freeze({ pak: PAK_40, knownPak: KNOWN_PAK_40, knownSize: KNOWN_SIZE_40, fileName: FILE_NAME_40 })

/** How [kit]'s pack is downloaded: the EP-133's and the EP-40's from the EP Sample Tool; null for the EP-1320's (none offered). */
export function download(kit: FactoryKit): KitDownload | null {
  return kit === EP133 ? DOWNLOAD_133 : kit === EP40 ? DOWNLOAD_40 : null
}

/** The tool's script in its page, if found. */
export function scriptPath(html: string): string | null {
  return SCRIPT.exec(html)?.[1] ?? null
}

/** [kit]'s pack path in the tool's script, if found (the EP-133's and the EP-40's sit side by side). */
export function pakPath(script: string, kit: FactoryKit = EP133): string | null {
  const d = download(kit)
  return d === null ? null : (d.pak.exec(script)?.[0] ?? null)
}

/**
 * [kit]'s pack path on [ORIGIN]: from the tool's page and script, read with
 * [text], else the path last known ([KNOWN_PAK], [KNOWN_PAK_40]).
 */
export async function locate(text: (path: string) => Promise<string>, kit: FactoryKit = EP133): Promise<string> {
  const known = (download(kit) ?? DOWNLOAD_133).knownPak
  let found: string | null = null
  try {
    const script = scriptPath(await text(PAGE))
    if (script !== null) found = pakPath(await text(script), kit)
  } catch {
    found = null
  }
  return found ?? known
}

/** Whether [pak] is [kit]'s factory pack (its meta.json says so: a factory pack of that model, with sounds). */
export function isFactory(pak: Pak, kit: FactoryKit = EP133): boolean {
  return metaText(pak, 'pak_type') === 'factory' && metaText(pak, 'device_name') === kit.model && pak.sounds.size > 0
}

/** A string field of [pak]'s meta.json, else null. */
function metaText(pak: Pak, k: string): string | null {
  const v = pak.meta[k]
  return typeof v === 'string' ? v : null
}

/**
 * Whether [pak] can be [kit]'s pack: for the EP-133 and the EP-40,
 * [isFactory]; for the EP-1320, a pack with sounds made on one (its meta.json's sku, or a name
 * with 1320 in it), a factory or a user pack alike (a reset device backs up
 * as a user pack).
 */
export function fitsKit(pak: Pak, kit: FactoryKit): boolean {
  if (kit !== EP1320) return isFactory(pak, kit)
  const name = metaText(pak, 'device_name')
  return pak.sounds.size > 0 && (metaText(pak, 'device_sku') === EP1320.sku || (name !== null && name.includes('1320')))
}

/** Whether [b] can be copied as the EP-1320's factory sounds: an EP-1320 backup, not a factory pack already. */
export function canUseAsFactory(b: { readonly source: string; readonly device: BackupDevice }): boolean {
  return !isFactorySource(b.source) && (b.device.sku === EP1320.sku || b.device.product.includes('1320'))
}

/**
 * The kit an imported [pak] is saved as: the EP-1320's for an EP-1320
 * factory pack, the EP-40's for its factory pack, else null (an ordinary
 * import).
 */
export function importKit(pak: Pak): FactoryKit | null {
  if (metaText(pak, 'pak_type') !== 'factory') return null
  return fitsKit(pak, EP1320) ? EP1320 : isFactory(pak, EP40) ? EP40 : null
}

/** What Live shows from the pack: [project]'s pads and every sound's name; null when it has none. */
export function snapshot(pak: Pak, savedAt: number, project: number = PROJECT): LiveSnapshot | null {
  const tar = pak.projects.get(project)
  if (tar === undefined) return null
  const groups = readPads(tar)
  if (groups.length === 0) return null
  const names = new Map<number, string>()
  for (const [slot, s] of pak.sounds) names.set(slot, s.name)
  return { savedAt, activeProject: project, groups, names }
}

/** The pack's projects with pads (the ones [snapshot] shows), in order: PROJECT steps through them offline. */
export function projects(pak: Pak): number[] {
  const out: number[] = []
  for (const [n, tar] of pak.projects) if (readPads(tar).length > 0) out.push(n)
  return out.sort((a, b) => a - b)
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

/** The library's factory pack of [kit], if it has one (the newest, should there be two). */
export function inLibrary<B extends { readonly source: string; readonly createdAt: number }>(
  backups: readonly B[],
  kit: FactoryKit = EP133,
): B | null {
  let best: B | null = null
  for (const b of backups) {
    if (b.source === kit.source && (best === null || best.createdAt < b.createdAt)) best = b
  }
  return best
}

/** The kits as Settings and Live list them: the downloadable ones first (EP-133, EP-40), then the EP-1320's. */
const SHOWN: readonly FactoryKit[] = Object.freeze([EP133, EP40, EP1320])

/**
 * The kits whose pack the library has, in the order Settings and Live list
 * them (EP-133, EP-40, EP-1320): the kit switch offers these once there are
 * two, and the first stands in for a chosen kit whose pack isn't saved.
 */
export function savedKits(backups: readonly { readonly source: string; readonly createdAt: number }[]): FactoryKit[] {
  return SHOWN.filter((k) => inLibrary(backups, k) !== null)
}

/**
 * The kit Live plays offline: [chosen] while its pack is saved, else the
 * first saved ([savedKits]), else the EP-133's.
 */
export function activeKitOf(chosen: FactoryKit, backups: readonly { readonly source: string; readonly createdAt: number }[]): FactoryKit {
  if (inLibrary(backups, chosen) !== null) return chosen
  return savedKits(backups)[0] ?? EP133
}

/** The Kotlin `object FactorySounds`. */
export const FactorySounds = {
  SOURCE,
  ORIGIN,
  PAGE,
  KNOWN_PAK,
  KNOWN_SIZE,
  FILE_NAME,
  FILE_NAME_1320,
  KNOWN_PAK_40,
  KNOWN_SIZE_40,
  FILE_NAME_40,
  PROJECT,
  download,
  scriptPath,
  pakPath,
  locate,
  isFactory,
  isFactorySource,
  fitsKit,
  canUseAsFactory,
  importKit,
  snapshot,
  projects,
  unnamed,
  inLibrary,
  savedKits,
  activeKitOf,
} as const
