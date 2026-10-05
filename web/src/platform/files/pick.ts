// Port of app/src/main/kotlin/dev/arc/ep133/files/Files.kt (read, describe) (+ reference/src/app.js:441-445)
//
// Opening files: a hidden <input type=file> stands in for OpenDocument /
// GetMultipleContents, and drag and drop for the VIEW intent. Reading keeps the
// Android cap: anything over 128 MiB fails with Files.TOO_LARGE before it is
// read into memory, and again if the bytes turn out larger than the size said.

import { WebText } from '../../core/text/webText'

/** Files.MAX_IMPORT: larger than any EP-133 backup (64 MB of samples), small enough to read into memory. */
export const MAX_IMPORT = 128 * 1024 * 1024

/** Files.TOO_LARGE. */
export const TOO_LARGE = WebText.TOO_LARGE

/**
 * What the import picker offers. Android opens any document; browsers grey out
 * files that match none of these, so the .pak extension and every MIME type a
 * .pak turns up as (AndroidManifest VIEW filters) are listed.
 */
export const PAK_ACCEPT = '.pak,.zip,application/zip,application/x-zip-compressed,application/octet-stream'

/** What the sample picker offers (MainActivity: audio/* and application/octet-stream). */
export const WAV_ACCEPT = '.wav,audio/*'

/** What "Restore from a folder" without a folder picker offers. */
export const FOLDER_ACCEPT = '.pak,.json'

/** The file-reading failure the UI shows as is. */
export class FileReadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'FileReadError'
  }
}

export interface PickOptions {
  /** The input's accept attribute, e.g. [PAK_ACCEPT]. */
  accept?: string
  multiple?: boolean
  /** `webkitdirectory`: pick a whole folder (read-only "Restore from a folder"). */
  directory?: boolean
}

/** The bits of `document` the picker uses. */
export interface PickDocument {
  createElement(tag: 'input'): HTMLInputElement
  body: { append(node: Node): void } | null
}

function browserDocument(): PickDocument {
  if (typeof document === 'undefined') throw new FileReadError(WebText.OPEN_FAILED)
  return document
}

/**
 * Shows the browser's file picker and resolves with the chosen files, or []
 * when the picker is closed without a choice. Must be called from a user
 * gesture (a click handler) before any await.
 *
 * The input is created per call and removed afterwards, with its value reset,
 * so picking the same file twice in a row still reports it (app.js:443).
 */
/**
 * The open picker's finish, if any. Browsers without the input's 'cancel'
 * event (Safari before 16.4, older Chromium) never say the picker was closed;
 * the next pick settles the earlier one with [] so inputs don't pile up.
 */
let openPicker: ((files: File[]) => void) | null = null

export function pickFiles(options: PickOptions = {}, doc: PickDocument = browserDocument()): Promise<File[]> {
  openPicker?.([])
  const input = doc.createElement('input')
  input.type = 'file'
  if (options.accept !== undefined) input.accept = options.accept
  input.multiple = options.multiple === true
  if (options.directory === true) input.webkitdirectory = true
  input.hidden = true
  input.style.display = 'none'
  return new Promise<File[]>((resolve) => {
    let done = false
    const finish = (files: File[]): void => {
      if (done) return
      done = true
      if (openPicker === finish) openPicker = null
      input.removeEventListener('change', onChange)
      input.removeEventListener('cancel', onCancel)
      input.value = ''
      input.remove()
      resolve(files)
    }
    const onChange = (): void => finish(input.files ? Array.from(input.files) : [])
    const onCancel = (): void => finish([])
    input.addEventListener('change', onChange)
    input.addEventListener('cancel', onCancel)
    openPicker = finish
    doc.body?.append(input)
    input.click()
  })
}

/** A file to read: a File, or any Blob with an optional name. */
export type ReadableFile = Blob & { readonly name?: string; readonly lastModified?: number }

/**
 * Files.read: the whole file, failing with [TOO_LARGE] for anything over
 * [MAX_IMPORT]. The size is checked first so a huge file fails before it is
 * read, then the bytes are checked again.
 */
export async function readFile(file: ReadableFile, max: number = MAX_IMPORT): Promise<Uint8Array> {
  if (file.size > max) throw new FileReadError(TOO_LARGE)
  let buf: ArrayBuffer
  try {
    buf = await file.arrayBuffer()
  } catch (e) {
    throw new FileReadError(WebText.OPEN_FAILED, { cause: e })
  }
  if (buf.byteLength > max) throw new FileReadError(TOO_LARGE)
  return new Uint8Array(buf)
}

/** Files.describe: the display name (else "backup.pak") and last-modified time, if known. */
export function describeFile(file: ReadableFile): { name: string; lastModified: number | null } {
  const name = file.name !== undefined && file.name.length !== 0 ? file.name : 'backup.pak'
  const m = file.lastModified
  return { name, lastModified: typeof m === 'number' && Number.isFinite(m) && m > 0 ? m : null }
}

// ---------------------------------------------------------------------------
// Drag and drop

/** The bits of a DragEvent the drop helper reads. */
export interface DragEventLike extends Event {
  readonly dataTransfer: {
    readonly types: ArrayLike<string> | readonly string[]
    readonly files: ArrayLike<File> | null
    dropEffect: string
  } | null
}

export interface DropOptions {
  /** Called with the dropped files (never empty). */
  onFiles(files: File[]): void
  /** Called with true while files are dragged over the target, false when they leave or drop. */
  onActive?(active: boolean): void
  /** Keeps only the files this accepts; all by default. */
  filter?(file: File): boolean
}

function carriesFiles(e: DragEventLike): boolean {
  const types = e.dataTransfer?.types
  if (!types) return false
  return Array.from(types as ArrayLike<string>).includes('Files')
}

/**
 * Makes [target] (usually the whole page) accept dropped files, the web
 * stand-in for opening a .pak with arc. Drags that carry no files (text,
 * links) are left alone. Returns a function that removes the listeners.
 */
export function attachDrop(target: EventTarget, options: DropOptions): () => void {
  // dragenter/dragleave fire for every child crossed; count them so the
  // highlight only goes off when the pointer leaves the target itself.
  let depth = 0
  const setActive = (on: boolean): void => options.onActive?.(on)
  const onEnter = (ev: Event): void => {
    const e = ev as DragEventLike
    if (!carriesFiles(e)) return
    e.preventDefault()
    depth++
    if (depth === 1) setActive(true)
  }
  const onOver = (ev: Event): void => {
    const e = ev as DragEventLike
    if (!carriesFiles(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }
  const onLeave = (): void => {
    // Not checked for files: some browsers (Safari) leave dataTransfer.types
    // empty on dragleave, which would leave the highlight stuck on. Only a drag
    // that was counted on the way in is counted out.
    if (depth === 0) return
    depth = Math.max(0, depth - 1)
    if (depth === 0) setActive(false)
  }
  const onDrop = (ev: Event): void => {
    const e = ev as DragEventLike
    if (!carriesFiles(e)) return
    e.preventDefault()
    depth = 0
    setActive(false)
    const list = e.dataTransfer?.files
    const files = list ? Array.from(list) : []
    const kept = options.filter ? files.filter((f) => options.filter?.(f) === true) : files
    if (kept.length !== 0) options.onFiles(kept)
  }
  target.addEventListener('dragenter', onEnter)
  target.addEventListener('dragover', onOver)
  target.addEventListener('dragleave', onLeave)
  target.addEventListener('drop', onDrop)
  return () => {
    target.removeEventListener('dragenter', onEnter)
    target.removeEventListener('dragover', onOver)
    target.removeEventListener('dragleave', onLeave)
    target.removeEventListener('drop', onDrop)
  }
}

/** Whether [file] looks like a backup by name: .pak or .zip (the drop filter for imports). */
export function isPakName(name: string): boolean {
  return /\.(pak|zip)$/i.test(name)
}
