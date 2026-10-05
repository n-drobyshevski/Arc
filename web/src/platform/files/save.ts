// Port of app/src/main/kotlin/dev/arc/ep133/files/Files.kt (writeTo, PakFileProvider.getType) and the
// save launchers in app/src/main/kotlin/dev/arc/ep133/MainActivity.kt (+ reference/src/app.js:320-334)
//
// Saving a file: showSaveFilePicker where the browser has it (CreateDocument),
// otherwise a download through <a download> with the blob URL revoked after
// 60 s. As on Android the picker opens first and the bytes are read after, so
// [saveBytes] takes the bytes or a function that produces them: the picker
// needs the user's tap, which a slow read could use up.

import { fileNameFor, importTitle } from '../../core/text/libraryRules'
import { projectFileName, soundFileName } from '../../core/backup/pakExport'
import { Strings } from '../../core/text/strings'

export { fileNameFor, importTitle, projectFileName, soundFileName }

/** What a save did. */
export type SaveResult = 'saved' | 'cancelled'

/** Bytes to save, or a function that reads them once the destination is known. */
export type FileData = Uint8Array | Blob | (() => Promise<Uint8Array | Blob>)

/** How long a download's blob URL is kept (reference app.js:333). */
export const REVOKE_AFTER_MS = 60_000

/** PakFileProvider.getType: .pak is a zip, .txt text and .wav audio; anything else is plain bytes. */
export function mimeFor(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith('.pak')) return 'application/zip'
  if (n.endsWith('.txt')) return 'text/plain'
  if (n.endsWith('.wav')) return 'audio/wav'
  return 'application/octet-stream'
}

/** MainActivity.logFileName: "arc-sysex-" + local yyyyMMdd-HHmmss + ".txt". */
export function logFileName(nowMs: number = Date.now()): string {
  const d = new Date(nowMs)
  const p = (n: number): string => String(n).padStart(2, '0')
  return (
    `arc-sysex-${String(d.getFullYear()).padStart(4, '0')}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.txt`
  )
}

/**
 * The picker's file type for [name]. A .pak is offered as
 * application/octet-stream, as MainActivity's CreateDocument does: with
 * application/zip some systems append ".zip" to "x.pak".
 */
export function pickerType(name: string, mime: string): { description: string; accept: Record<string, string[]> } {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : ''
  const type = ext === '.pak' ? 'application/octet-stream' : mime
  const description =
    ext === '.pak' ? 'EP-133 backup' : ext === '.wav' ? 'WAV audio' : ext === '.txt' ? 'Text' : 'File'
  // The File System Access API wants a MIME type of the form type/subtype and
  // extensions that start with a dot; anything else throws a TypeError.
  const validType = /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type : 'application/octet-stream'
  return { description, accept: { [validType]: /^\.[\w-]+$/.test(ext) ? [ext] : [] } }
}

// ---------------------------------------------------------------------------
// Platform

/** The bits of a FileSystemWritableFileStream used here. */
export interface WritableLike {
  write(data: Blob): Promise<void>
  close(): Promise<void>
  abort?(): Promise<void>
}

export interface SaveFileHandleLike {
  createWritable(): Promise<WritableLike>
}

export interface SavePickerOptions {
  suggestedName: string
  types: { description: string; accept: Record<string, string[]> }[]
}

export interface SaveEnv {
  /** window.showSaveFilePicker, when the browser has it (Chromium desktop). */
  showSaveFilePicker?: ((options: SavePickerOptions) => Promise<SaveFileHandleLike>) | undefined
  createObjectURL(blob: Blob): string
  revokeObjectURL(url: string): void
  /** Makes and clicks a temporary <a download>. */
  clickDownload(url: string, name: string): void
  setTimeout(fn: () => void, ms: number): unknown
}

/** The browser's [SaveEnv]. */
export function browserSaveEnv(): SaveEnv {
  const w = (typeof window === 'undefined' ? undefined : window) as
    | (Window & { showSaveFilePicker?: (o: SavePickerOptions) => Promise<SaveFileHandleLike> })
    | undefined
  const picker = w?.showSaveFilePicker
  return {
    showSaveFilePicker: typeof picker === 'function' ? (o) => picker.call(w, o) : undefined,
    createObjectURL: (b) => URL.createObjectURL(b),
    revokeObjectURL: (u) => URL.revokeObjectURL(u),
    clickDownload: (url, name) => {
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.rel = 'noopener'
      a.style.display = 'none'
      document.body.append(a)
      a.click()
      a.remove()
    },
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  }
}

// ---------------------------------------------------------------------------

function errorName(e: unknown): string {
  return typeof e === 'object' && e !== null && 'name' in e ? String((e as { name: unknown }).name) : ''
}

/** Whether [e] means the user closed a picker or share sheet. */
export function isAbort(e: unknown): boolean {
  return errorName(e) === 'AbortError'
}

/** The [FileData]'s bytes as a Blob of type [mime]. */
export async function toBlob(data: FileData, mime: string): Promise<Blob> {
  const v = typeof data === 'function' ? await data() : data
  if (v instanceof Blob) return v.type === mime || mime.length === 0 ? v : new Blob([v], { type: mime })
  return new Blob([v as Uint8Array<ArrayBuffer>], { type: mime })
}

/** reference downloadCurrent: a blob URL clicked through <a download>, revoked after a minute. */
export function download(name: string, blob: Blob, env: SaveEnv = browserSaveEnv()): void {
  const url = env.createObjectURL(blob)
  try {
    env.clickDownload(url, name)
  } finally {
    env.setTimeout(() => env.revokeObjectURL(url), REVOKE_AFTER_MS)
  }
}

/**
 * Saves [data] as [name]: through the save picker where there is one, else as
 * a download. Resolves 'cancelled' when the picker is closed. A read or write
 * that fails rejects; a half-written file is abandoned (Android deletes the
 * empty document), and the error's message is shown as is.
 *
 * Call it from a click handler, before any await, so the picker may open.
 */
export async function saveBytes(
  name: string,
  data: FileData,
  mime: string = mimeFor(name),
  env: SaveEnv = browserSaveEnv(),
): Promise<SaveResult> {
  const picker = env.showSaveFilePicker
  if (picker) {
    let handle: SaveFileHandleLike | null = null
    try {
      handle = await picker({ suggestedName: name, types: [pickerType(name, mime)] })
    } catch (e) {
      if (isAbort(e)) return 'cancelled'
      // No user activation left, a blocked name or the like: download instead.
      handle = null
    }
    if (handle) {
      const blob = await toBlob(data, mime)
      let out: WritableLike | null = null
      try {
        out = await handle.createWritable()
        await out.write(blob)
        await out.close()
      } catch (e) {
        if (out?.abort) await out.abort().catch(() => undefined)
        throw new Error(Strings.SAVE_FAILED, { cause: e })
      }
      return 'saved'
    }
  }
  download(name, await toBlob(data, mime), env)
  return 'saved'
}
