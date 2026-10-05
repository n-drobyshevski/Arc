// Port of the VIEW intent handling in app/src/main/kotlin/dev/arc/ep133/MainActivity.kt (handleIntent)
// (+ reference/src/app.js:447-452)
//
// Opening a .pak with the installed app: the manifest's file_handlers hand the
// files to window.launchQueue (installed Chromium desktop PWAs). Android's
// FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY check is not needed: the queue delivers
// each launch once.

/** The bits of a FileSystemFileHandle used here. */
export interface LaunchFileHandle {
  getFile(): Promise<File>
}

export interface LaunchParamsLike {
  readonly files?: readonly LaunchFileHandle[] | null
}

export interface LaunchQueueLike {
  setConsumer(consumer: (params: LaunchParamsLike) => void | Promise<void>): void
}

function browserLaunchQueue(): LaunchQueueLike | undefined {
  if (typeof window === 'undefined') return undefined
  const q = (window as unknown as { launchQueue?: LaunchQueueLike }).launchQueue
  return q && typeof q.setConsumer === 'function' ? q : undefined
}

/**
 * Calls [onFiles] with the files of every launch that carries some (files that
 * can no longer be read are left out). Returns false when the browser has no
 * launch queue, so nothing will ever arrive.
 */
export function onLaunchFiles(
  onFiles: (files: File[]) => void,
  queue: LaunchQueueLike | undefined = browserLaunchQueue(),
): boolean {
  if (!queue) return false
  queue.setConsumer(async (params) => {
    const handles = params.files ?? []
    const files: File[] = []
    for (const h of handles) {
      try {
        files.push(await h.getFile())
      } catch {
        // Moved or deleted since the launch: skip it.
      }
    }
    if (files.length !== 0) onFiles(files)
  })
  return true
}
