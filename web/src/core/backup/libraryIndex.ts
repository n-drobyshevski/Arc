// Port of core/src/main/kotlin/dev/arc/ep133/backup/LibraryIndex.kt
//
// The library kept outside the app (an addition to the web version): every
// backup's .pak in a folder, plus this index (library.json) with what the .pak
// files don't hold: titles, notes, dates, where each came from, and a few
// settings. A library rebuilt from that folder reads this index back.

import { APP_NAME } from '../../version'
import { LearnedLinks } from '../features/learnedLinks'
import { isJsonObject } from '../protocol/fs'
import type { BackupDevice } from '../text/libraryRules'

/** A backup's device fields: text/libraryRules `BackupDevice`, as in the Kotlin. */
export type IndexDevice = BackupDevice

/** What a backup needs besides its .pak to come back after a reinstall. */
export interface IndexEntry {
  id: string
  file: string
  title: string
  notes: string
  createdAt: number
  /** "device" or "import". */
  source: string
  fileName: string | null
  device: BackupDevice
}

export interface LibraryIndexData {
  entries: IndexEntry[]
  settings: Record<string, string>
}

export const FILE = 'library.json'
export const FOLDER = 'arc'

const pad = (n: number, w = 2): string => String(n).padStart(w, '0')

/** yyyyMMdd-HHmmss in UTC. */
function stamp(ms: number): string {
  const d = new Date(ms)
  return (
    `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  )
}

// Kotlin Char.isLetterOrDigit: letters (L*) and decimal digits (Nd), tested
// per UTF-16 unit (a lone surrogate half is neither).
const LETTER_OR_DIGIT = /^[\p{L}\p{Nd}]$/u

/**
 * The backup's file in the folder: "arc-20261004-230112-1a2b3c4d.pak".
 * It depends only on things that never change (the creation time and
 * id), so renaming a backup never orphans its file.
 */
export function fileFor(id: string, createdAt: number): string {
  let tag = ''
  for (let i = 0; i < id.length && tag.length < 8; i++) {
    const c = id[i]!
    if (LETTER_OR_DIGIT.test(c)) tag += c
  }
  tag = tag.toLowerCase() || 'backup'
  return `arc-${stamp(createdAt)}-${tag}.pak`
}

/** library.json: two-space indent, keys in this fixed order. */
export function toJson(data: LibraryIndexData): string {
  const backups = data.entries.map((e) => ({
    id: e.id,
    file: e.file,
    title: e.title,
    notes: e.notes,
    createdAt: e.createdAt,
    source: e.source,
    fileName: e.fileName ?? null,
    device: {
      product: e.device.product,
      sku: e.device.sku,
      serial: e.device.serial,
      osVersion: e.device.osVersion,
    },
  }))
  const settings: Record<string, string> = {}
  for (const [k, v] of Object.entries(data.settings)) {
    Object.defineProperty(settings, k, { value: v, writable: true, enumerable: true, configurable: true })
  }
  return JSON.stringify({ app: APP_NAME, version: 1, backups, settings }, null, 2)
}

// Kotlin String.isBlank: only Char.isWhitespace characters (Zs/Zl/Zp, tab..CR, FS..US).
const BLANK = /^[\p{Zs}\p{Zl}\p{Zp}\t\n\u000B\f\r\u001C-\u001F]*$/u

type Obj = Record<string, unknown>
const own = (o: Obj, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined)
const stringOr = (v: unknown, fallback: string): string => (v ? String(v) : fallback)

/**
 * Kotlin Double.toLong(): toward zero, clamped to the Long range (as a double,
 * which is what toJson writes back), and never -0.
 */
const toLong = (d: number): number => Math.min(2 ** 63, Math.max(-(2 ** 63), Math.trunc(d))) + 0

/**
 * Reads an index, skipping entries it can't use. Anything that is not an
 * index gives null, so a stray file named library.json is ignored.
 */
export function parse(text: string): LibraryIndexData | null {
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch {
    return null
  }
  if (!isJsonObject(root)) return null
  const list = own(root, 'backups')
  if (!Array.isArray(list)) return null
  const entries: IndexEntry[] = []
  for (const el of list) {
    if (!isJsonObject(el)) continue
    const str = (k: string): string | null => {
      const v = own(el, k)
      return typeof v === 'string' ? v : null
    }
    const id = str('id')
    if (id === null || BLANK.test(id)) continue
    const file = str('file')
    if (file === null || BLANK.test(file)) continue
    const created = own(el, 'createdAt')
    if (typeof created !== 'number') continue
    const d = own(el, 'device')
    const dev = isJsonObject(d) ? d : null
    entries.push({
      id,
      file,
      title: str('title') ?? '',
      notes: str('notes') ?? '',
      createdAt: toLong(created),
      source: str('source') ?? 'import',
      fileName: str('fileName'),
      device: {
        product: stringOr(dev && own(dev, 'product'), ''),
        sku: stringOr(dev && own(dev, 'sku'), ''),
        serial: stringOr(dev && own(dev, 'serial'), ''),
        osVersion: stringOr(dev && own(dev, 'osVersion'), ''),
      },
    })
  }
  const settings: Record<string, string> = {}
  const s = own(root, 'settings')
  if (isJsonObject(s)) {
    for (const [k, v] of Object.entries(s)) {
      if (typeof v === 'string') {
        Object.defineProperty(settings, k, { value: v, writable: true, enumerable: true, configurable: true })
      }
    }
  }
  return { entries, settings }
}

const LEARNED = 'mirror.learned'

/**
 * Several indexes (an old one the new install couldn't overwrite, and a new
 * one) merged by id; later ones win. Live's learned pad links are combined,
 * so a few pads learned in a new install don't drop the rest.
 */
export function merge(indexes: readonly LibraryIndexData[]): LibraryIndexData {
  // Map.set: a later entry replaces the value but keeps the first position.
  const byId = new Map<string, IndexEntry>()
  const settings: Record<string, string> = {}
  for (const ix of indexes) {
    for (const e of ix.entries) byId.set(e.id, e)
    const before = Object.hasOwn(settings, LEARNED) ? settings[LEARNED]! : null
    for (const [k, v] of Object.entries(ix.settings)) {
      Object.defineProperty(settings, k, { value: v, writable: true, enumerable: true, configurable: true })
    }
    const now = Object.hasOwn(ix.settings, LEARNED) ? ix.settings[LEARNED]! : null
    if (before !== null && now !== null) {
      settings[LEARNED] = LearnedLinks.format(LearnedLinks.merge(LearnedLinks.parse(before), LearnedLinks.parse(now)))
    }
  }
  return { entries: [...byId.values()], settings }
}
