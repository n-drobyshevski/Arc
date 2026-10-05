// Port of app/src/main/kotlin/dev/arc/ep133/data/ExternalLibrary.kt
//
// The library's copy outside the app: every backup's .pak plus library.json,
// in the same names and format as Android's Documents/arc, so a folder moves
// between the two apps.
//
// Web deltas:
// - Android writes Documents/arc through MediaStore with no permission, or
//   through a folder picked after a reinstall (SAF). The web has no folder it
//   may write without asking, so the only writable target is a folder the
//   user picked through the File System Access API ([FsaTarget], Chromium);
//   that is Android's "tree" mode. MediaStore's "name (1)" bookkeeping
//   (prefs store:<name>) has no equivalent: writing by name overwrites.
// - Where showDirectoryPicker is missing, a folder chosen with
//   <input webkitdirectory> becomes a read-only [FileListTarget], enough for
//   Library.restoreFrom, never adopted as the copy target.
// - Android's tree-path check ("Documents/arc") becomes the folder's own name
//   ("arc"): a directory handle has no path.
// - fileOverride and the picked folder live in IndexedDB "kv" (library.ts).

/** A file in the folder (Android FolderFile, keyed by name). */
export interface FolderFile {
  name: string
  lastModified: number
}

/** Where the library is copied: a folder of .pak files plus library.json. */
export interface ExternalTarget {
  /** The folder's name. */
  readonly name: string
  /** True for a folder that can only be read from (restore only, never adopted). */
  readonly readOnly?: boolean
  /** Every file directly in the folder. */
  list(): Promise<FolderFile[]>
  read(name: string): Promise<Uint8Array>
  /** Creates or overwrites; a string is written as UTF-8. */
  write(name: string, data: Uint8Array | string): Promise<void>
  /** Deletes the file; nothing happens when it isn't there. */
  delete(name: string): Promise<void>
  exists(name: string): Promise<boolean>
}

export const PAK_MIME = 'application/octet-stream'
export const JSON_MIME = 'application/json'

/** library.json, and the "library (1).json" an install may have written next to an earlier one. */
export function isIndex(name: string): boolean {
  return name.startsWith('library') && name.endsWith('.json')
}

/** Live's last read of the device (an addition), shown while it is not connected. */
export const LIVE_FILE = 'live.json'

/** live.json, and the "live (1).json" an install may have written next to an earlier one. */
export function isLive(name: string): boolean {
  return name.startsWith('live') && name.endsWith('.json')
}

/** Kotlin endsWith(".pak", ignoreCase = true). */
export function isPak(name: string): boolean {
  return name.length >= 4 && name.slice(-4).toLowerCase() === '.pak'
}

/**
 * Whether a picked folder is the library's: one named arc, or one that
 * already holds an index or backups. Any other folder is only read from,
 * never adopted, so a mistaken pick can't redirect copies.
 */
export function isLibraryFolder(folderName: string, names: Iterable<string>): boolean {
  if (folderName.toLowerCase() === 'arc') return true
  const list = [...names]
  return list.some(isIndex) || list.some(isPak)
}

const utf8 = (data: Uint8Array | string): Uint8Array => (typeof data === 'string' ? new TextEncoder().encode(data) : data)

/** A folder in memory, for tests (and for building the library zip). */
export class MemoryTarget implements ExternalTarget {
  readonly files = new Map<string, { data: Uint8Array; lastModified: number }>()
  readonly readOnly: boolean
  /** Throws from write/delete when set (a failing folder, for tests). */
  failWith: string | null = null
  private clock: () => number

  constructor(
    readonly name: string = 'arc',
    initial: Record<string, Uint8Array | string | { data: Uint8Array | string; lastModified: number }> = {},
    options: { readOnly?: boolean; now?: () => number } = {},
  ) {
    this.readOnly = options.readOnly ?? false
    this.clock = options.now ?? Date.now
    for (const [k, v] of Object.entries(initial)) {
      if (typeof v === 'string' || v instanceof Uint8Array) this.files.set(k, { data: utf8(v), lastModified: this.clock() })
      else this.files.set(k, { data: utf8(v.data), lastModified: v.lastModified })
    }
  }

  async list(): Promise<FolderFile[]> {
    return [...this.files].map(([name, f]) => ({ name, lastModified: f.lastModified }))
  }

  async read(name: string): Promise<Uint8Array> {
    const f = this.files.get(name)
    if (!f) throw new Error('Could not open the file')
    return f.data.slice()
  }

  async write(name: string, data: Uint8Array | string): Promise<void> {
    if (this.readOnly) throw new Error(`Could not write ${name}`)
    if (this.failWith !== null) throw new Error(this.failWith)
    this.files.set(name, { data: utf8(data).slice(), lastModified: this.clock() })
  }

  async delete(name: string): Promise<void> {
    if (this.readOnly) throw new Error(`Could not delete ${name}`)
    if (this.failWith !== null) throw new Error(this.failWith)
    this.files.delete(name)
  }

  async exists(name: string): Promise<boolean> {
    return this.files.has(name)
  }

  /** A file's content as text (tests). */
  text(name: string): string | null {
    const f = this.files.get(name)
    return f ? new TextDecoder().decode(f.data) : null
  }
}

// ---------- File System Access (Chromium) ----------

/** The parts of FileSystemDirectoryHandle used here (lib.dom lacks the permission and iteration methods). */
export interface DirHandleLike {
  readonly kind: 'directory'
  readonly name: string
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>
  removeEntry(name: string): Promise<void>
  entries?(): AsyncIterable<[string, { kind: string } & Partial<FileHandleLike>]>
  values?(): AsyncIterable<{ kind: string; name: string } & Partial<FileHandleLike>>
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

export interface FileHandleLike {
  readonly kind: 'file'
  readonly name: string
  getFile(): Promise<File>
  createWritable(): Promise<WritableLike>
}

export interface WritableLike {
  write(data: Uint8Array | string | Blob): Promise<void>
  close(): Promise<void>
  abort(): Promise<void>
}

const errorName = (e: unknown): string => (typeof e === 'object' && e !== null ? String((e as { name?: unknown }).name) : '')

/** A folder the user picked with showDirectoryPicker (Android's SAF tree). */
export class FsaTarget implements ExternalTarget {
  readonly readOnly = false

  constructor(readonly handle: DirHandleLike) {}

  get name(): string {
    return this.handle.name
  }

  /**
   * Whether the folder may be written: "granted", or "prompt" (ask from a
   * tap with [request]) or "denied". A browser without the permission
   * methods grants what the picker gave.
   */
  async permission(request = false): Promise<PermissionState> {
    const h = this.handle
    const mode = { mode: 'readwrite' as const }
    try {
      const now = h.queryPermission ? await h.queryPermission(mode) : 'granted'
      if (now !== 'prompt' || !request || !h.requestPermission) return now
      return await h.requestPermission(mode)
    } catch {
      return 'denied'
    }
  }

  async list(): Promise<FolderFile[]> {
    const out = new Map<string, FolderFile>()
    const add = async (name: string, h: { kind: string } & Partial<FileHandleLike>): Promise<void> => {
      if (h.kind !== 'file' || !h.getFile) return
      let lastModified = 0
      try {
        lastModified = (await h.getFile()).lastModified
      } catch {
        // Unreadable: listed, dated 0 (Android's null COLUMN_LAST_MODIFIED).
      }
      out.set(name, { name, lastModified })
    }
    if (this.handle.entries) {
      for await (const [name, h] of this.handle.entries()) await add(name, h)
    } else if (this.handle.values) {
      for await (const h of this.handle.values()) await add(h.name, h)
    }
    return [...out.values()]
  }

  async read(name: string): Promise<Uint8Array> {
    const fh = await this.handle.getFileHandle(name)
    return new Uint8Array(await (await fh.getFile()).arrayBuffer())
  }

  async write(name: string, data: Uint8Array | string): Promise<void> {
    const fh = await this.handle.getFileHandle(name, { create: true })
    const w = await fh.createWritable()
    try {
      await w.write(data)
      // The file is replaced only on close, so a failed write leaves the old one.
      await w.close()
    } catch (e) {
      await w.abort().catch(() => {})
      throw e
    }
  }

  async delete(name: string): Promise<void> {
    try {
      await this.handle.removeEntry(name)
    } catch (e) {
      if (errorName(e) !== 'NotFoundError') throw e
    }
  }

  async exists(name: string): Promise<boolean> {
    try {
      await this.handle.getFileHandle(name)
      return true
    } catch (e) {
      if (errorName(e) === 'NotFoundError' || errorName(e) === 'TypeMismatchError') return false
      throw e
    }
  }
}

interface PickerWindow {
  showDirectoryPicker?(options?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }): Promise<DirHandleLike>
}

/** Whether this browser can pick a writable folder. */
export function canPickFolder(): boolean {
  return typeof (globalThis as PickerWindow).showDirectoryPicker === 'function'
}

/** Asks for a folder (call from a tap). Null when the user cancels or the browser can't. */
export async function pickFolder(): Promise<FsaTarget | null> {
  const win = globalThis as PickerWindow
  if (typeof win.showDirectoryPicker !== 'function') return null
  try {
    // Called on the window: a detached Window method throws "Illegal invocation" in some engines.
    return new FsaTarget(await win.showDirectoryPicker({ id: 'arc', mode: 'readwrite', startIn: 'documents' }))
  } catch (e) {
    if (errorName(e) === 'AbortError') return null
    throw e
  }
}

// ---------- <input webkitdirectory> (read only) ----------

/** The parts of File used here. */
export interface FileLike {
  readonly name: string
  readonly lastModified: number
  readonly webkitRelativePath?: string
  arrayBuffer(): Promise<ArrayBuffer>
}

/**
 * Files chosen with <input type=file webkitdirectory> (or several files
 * picked at once): only the folder's own files, never subfolders. Read only.
 */
export class FileListTarget implements ExternalTarget {
  readonly readOnly = true
  readonly name: string
  private files = new Map<string, FileLike>()

  constructor(files: Iterable<FileLike>, name?: string) {
    let folder = name ?? ''
    for (const f of files) {
      const parts = (f.webkitRelativePath ?? '').split('/').filter((p) => p.length > 0)
      if (parts.length > 2) continue
      if (parts.length === 2 && !name && !folder) folder = parts[0]!
      // A later file of the same name replaces the earlier one (Android's map).
      this.files.set(f.name, f)
    }
    this.name = folder
  }

  async list(): Promise<FolderFile[]> {
    return [...this.files.values()].map((f) => ({ name: f.name, lastModified: f.lastModified }))
  }

  async read(name: string): Promise<Uint8Array> {
    const f = this.files.get(name)
    if (!f) throw new Error('Could not open the file')
    return new Uint8Array(await f.arrayBuffer())
  }

  async write(name: string): Promise<void> {
    throw new Error(`Could not write ${name}`)
  }

  async delete(name: string): Promise<void> {
    throw new Error(`Could not delete ${name}`)
  }

  async exists(name: string): Promise<boolean> {
    return this.files.has(name)
  }
}
