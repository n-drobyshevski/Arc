// Port of app/src/main/kotlin/dev/arc/ep133/files/Files.kt (shareableUri, share) and MainActivity.shareBytes
// (+ reference/src/app.js:336-350)
//
// Sharing a file: the Web Share API with files stands in for the ACTION_SEND
// chooser. Closing the share sheet is not an error (AbortError is ignored). A
// browser that can't share files saves the file instead and says so: the
// caller shows WebText.savedInstead(name) when this returns 'saved'.

import { Strings } from '../../core/text/strings'
import { browserSaveEnv, isAbort, mimeFor, saveBytes, toBlob, type FileData, type SaveEnv } from '../files/save'

/** What a share did: shared, sheet closed, or saved instead (no file sharing here). */
export type ShareResult = 'shared' | 'cancelled' | 'saved'

export interface ShareDataLike {
  files: File[]
  title?: string
  text?: string
}

export interface ShareEnv {
  /** navigator.canShare. */
  canShare?: ((data: ShareDataLike) => boolean) | undefined
  /** navigator.share. */
  share?: ((data: ShareDataLike) => Promise<void>) | undefined
  /** Where the fallback saves. */
  save: SaveEnv
}

/** The browser's [ShareEnv]. */
export function browserShareEnv(): ShareEnv {
  const nav = (typeof navigator === 'undefined' ? undefined : navigator) as
    | (Navigator & { canShare?: (d: ShareDataLike) => boolean })
    | undefined
  return {
    canShare: typeof nav?.canShare === 'function' ? (d) => nav.canShare?.(d) === true : undefined,
    share: typeof nav?.share === 'function' ? (d) => nav.share(d) : undefined,
    save: browserSaveEnv(),
  }
}

export interface ShareOptions {
  /** EXTRA_TEXT; defaults to Strings.SHARE_TITLE_PREFIX + title, as MainActivity.shareBytes does. */
  text?: string
  env?: ShareEnv
}

/**
 * Shares [data] as a file named [name] of type [mime], with [title] as the
 * subject. Rejects with Strings.SHARE_FAILED when the share itself fails
 * (MainActivity's "no app to share with"), and with the read's own error when
 * the bytes can't be read (a damaged backup while exporting a piece of it).
 *
 * Call it from a click handler: navigator.share needs the user's tap, so the
 * bytes should be quick to read.
 */
export async function shareFile(
  name: string,
  data: FileData,
  mime: string = mimeFor(name),
  title: string = name,
  options: ShareOptions = {},
): Promise<ShareResult> {
  const env = options.env ?? browserShareEnv()
  const text = options.text ?? Strings.SHARE_TITLE_PREFIX + title
  const blob = await toBlob(data, mime)
  const file = new File([blob], name, { type: mime })
  const payload: ShareDataLike = { files: [file], title, text }
  let can = false
  try {
    can = env.share !== undefined && env.canShare !== undefined && env.canShare({ files: [file] })
  } catch {
    can = false
  }
  if (!can || !env.share) {
    const r = await saveBytes(name, blob, mime, env.save)
    return r === 'saved' ? 'saved' : 'cancelled'
  }
  try {
    await env.share(payload)
    return 'shared'
  } catch (e) {
    if (isAbort(e)) return 'cancelled'
    throw new Error(Strings.SHARE_FAILED, { cause: e })
  }
}
