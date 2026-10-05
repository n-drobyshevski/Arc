// Port of core/src/main/kotlin/dev/arc/ep133/text/LibraryRules.kt (+ reference/src/app.js:320-323, 372-400, 461)
//
// The small rules app.js applies around the library and restore sheet, lifted
// into pure functions (the reference reads the DOM).
//
// Web deltas:
// - Kotlin data classes become interfaces; BackupDevice and RestoreSelection
//   also get factory functions of the same name (the Kotlin constructors,
//   with BackupDevice's defaults).
// - projectSlots keys are numbers in Kotlin; in JS objects they are string
//   keys, which a numeric index reads the same way.
// - Ids compare by UTF-16 code units (`<`), as Kotlin String.compareTo does,
//   never with localeCompare.

import { bytes, list, plural } from './format'
import { Strings } from './strings'

/** A device as stored with a backup (the web version's record.device). */
export interface BackupDevice {
  readonly product: string
  readonly sku: string
  readonly serial: string
  readonly osVersion: string
}

/** `BackupDevice(product = "", sku = "", serial = "", osVersion = "")`. */
export function BackupDevice(product = '', sku = '', serial = '', osVersion = ''): BackupDevice {
  return { product, sku, serial, osVersion }
}

/** One library entry (library.js record). */
export interface BackupRecord {
  readonly id: string
  readonly title: string
  readonly notes: string
  readonly createdAt: number
  /** "device" or "import". */
  readonly source: string
  readonly fileName: string | null
  readonly device: BackupDevice
  readonly soundCount: number
  readonly projectCount: number
  readonly projects: readonly number[]
  readonly slots: readonly number[]
  readonly projectSlots: Readonly<Record<number, readonly number[]>>
  readonly size: number
}

/** What a restore will write. */
export interface RestoreSelection {
  readonly slots: readonly number[]
  readonly projects: readonly number[]
}

export function RestoreSelection(slots: readonly number[], projects: readonly number[]): RestoreSelection {
  return { slots, projects }
}

const byCreatedDesc = (a: BackupRecord, b: BackupRecord): number =>
  a.createdAt > b.createdAt ? -1 : a.createdAt < b.createdAt ? 1 : 0
const byIdAsc = (a: BackupRecord, b: BackupRecord): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * The backups to delete so only the newest [keep] remain (an addition to
 * the web version); none when [keep] is null (keep all).
 * Newest first by createdAt, ties by id descending; the first [keep] stay.
 */
export function toPrune(backups: readonly BackupRecord[], keep: number | null | undefined): BackupRecord[] {
  if (keep == null || backups.length <= keep) return []
  // Kotlin's drop(n) rejects a negative count.
  if (keep < 0) throw new RangeError(`Requested element count ${keep} is less than zero.`)
  return [...backups].sort((a, b) => byCreatedDesc(a, b) || byIdAsc(b, a)).slice(keep)
}

/** `fileNameFor(b)`: "my-backup.pak". JS \w is ASCII only, spelled out here. */
export function fileNameFor(title: string): string {
  const base =
    title
      .replace(/[^A-Za-z0-9_\- ]+/g, '')
      .trim()
      .replace(/ +/g, '-')
      .toLowerCase() || 'ep133-backup'
  return `${base}.pak`
}

/** `file.name.replace(/\.(pak|zip)$/i, '') || 'Imported backup'`. */
export function importTitle(fileName: string): string {
  // Without the u flag, /i never folds a non-ASCII letter onto an ASCII one,
  // which is what the Kotlin ASCII guard spells out.
  return fileName.replace(/\.(pak|zip)$/i, '') || 'Imported backup'
}

/** `restoreSelection()` from app.js. */
export function restoreSelection(
  b: BackupRecord,
  everything: boolean,
  picked: readonly number[],
  alsoOther: boolean,
): RestoreSelection {
  if (everything) return { slots: b.slots, projects: b.projects }
  const slots = new Set<number>()
  for (const p of picked) for (const s of b.projectSlots[p] ?? []) slots.add(s)
  if (alsoOther) {
    // "no picked project uses" in the label, but the web code excludes
    // sounds used by any project in the backup. Kept as written.
    const usedByAny = new Set(Object.values(b.projectSlots).flat())
    for (const s of b.slots) if (!usedByAny.has(s)) slots.add(s)
  }
  return { slots: [...slots].sort((x, y) => x - y), projects: picked }
}

function parts(sel: RestoreSelection): string[] {
  const out: string[] = []
  if (sel.slots.length !== 0) out.push(plural(sel.slots.length, 'sound'))
  if (sel.projects.length !== 0) out.push(plural(sel.projects.length, 'project'))
  return out
}

/** The restore key: "Restore 3 sounds and 1 project" or "Pick something to restore". */
export function restoreButton(sel: RestoreSelection): string {
  const p = parts(sel)
  return p.length !== 0 ? `Restore ${p.join(' and ')}` : Strings.PICK_SOMETHING
}

export function canRestore(sel: RestoreSelection): boolean {
  return parts(sel).length !== 0
}

export function restoreWarning(sel: RestoreSelection): string {
  if (parts(sel).length === 0) return ''
  const what: string[] = []
  if (sel.projects.length !== 0) {
    what.push(`${sel.projects.length === 1 ? 'project' : 'projects'} ${list(sel.projects.map(String))}`)
  }
  if (sel.slots.length !== 0) what.push(plural(sel.slots.length, 'sample slot'))
  return `This overwrites ${what.join(' and ')} on your EP-133. Everything else on the device stays as it is.`
}

/** Rows of the detail sheet's facts list; empty values are left out. */
export function facts(b: BackupRecord, madeText: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const fact = (k: string, v: string): void => {
    if (v.length !== 0) out.push([k, v])
  }
  fact('Made', madeText)
  fact(
    'From',
    b.source === 'import'
      ? 'Imported file' + (b.fileName ? `, ${b.fileName}` : '')
      : [b.device.product, b.device.serial].filter((s) => s.length !== 0).join(', '),
  )
  fact('OS', b.device.osVersion)
  fact('Contents', `${plural(b.soundCount, 'sound')}, ${plural(b.projectCount, 'project')}`)
  fact('Size', bytes(b.size))
  return out
}

/** Muted text after "Project N" in the detail sheet ("" when no sounds are known). */
export function projectSoundsDetail(b: BackupRecord, n: number): string {
  const used = b.projectSlots[n]?.length ?? 0
  return used !== 0 ? plural(used, 'sound') : ''
}

/** Small text after a project checkbox in the restore sheet (shows "0 sounds"). */
export function projectSoundsRestore(b: BackupRecord, n: number): string {
  return plural(b.projectSlots[n]?.length ?? 0, 'sound')
}

/** Library order: newest first (ties keep id order, as IndexedDB did). */
export function sorted(items: readonly BackupRecord[]): BackupRecord[] {
  return [...items].sort((a, b) => byCreatedDesc(a, b) || byIdAsc(a, b))
}

/** The Kotlin `object LibraryRules`, for call sites that read `LibraryRules.toPrune(...)`. */
export const LibraryRules = {
  toPrune,
  fileNameFor,
  importTitle,
  restoreSelection,
  restoreButton,
  canRestore,
  restoreWarning,
  facts,
  projectSoundsDetail,
  projectSoundsRestore,
  sorted,
} as const
