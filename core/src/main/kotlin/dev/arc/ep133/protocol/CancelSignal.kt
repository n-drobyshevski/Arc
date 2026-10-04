package dev.arc.ep133.protocol

import java.util.concurrent.atomic.AtomicBoolean

/**
 * The AbortSignal of the web version. Checked only at the points the JS checks
 * it (between items, and when a download starts), so cancelling always lets the
 * current item finish.
 */
class CancelSignal {
    private val flag = AtomicBoolean(false)
    val isCancelled: Boolean get() = flag.get()
    fun cancel() = flag.set(true)

    /** `checkAbort(signal)`. */
    fun check() {
        if (flag.get()) throw CancelledError()
    }
}

/** `checkAbort` for an optional signal. */
fun CancelSignal?.checkAbort() {
    this?.check()
}
