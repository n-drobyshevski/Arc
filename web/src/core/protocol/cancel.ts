// Port of core/src/main/kotlin/dev/arc/ep133/protocol/CancelSignal.kt (+ reference/src/protocol/fs.js)
//
// The web uses AbortController/AbortSignal for Kotlin's CancelSignal. Checked only
// between items and when a download starts, so the current item always finishes.

import { CancelledError } from './errors'

/** Throws [CancelledError] if [signal] has been aborted. */
export function checkAbort(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw new CancelledError()
}
