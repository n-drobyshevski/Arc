package dev.arc.ep133

import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.SystemClock
import dev.arc.ep133.protocol.TrafficLog

/**
 * Where arc's time goes, in the debug log (an addition): how long a start takes, and each time the main thread
 * is held long enough to be felt, with what it was doing. A phone can't be profiled from here, so the log says it.
 */
object StallWatch {
    /** A main thread held this long is noted: about where a tap starts to feel ignored. */
    private const val STALL_MS = 500L
    private const val TICK_MS = 100L

    /** Notes per run, so a phone that is slow throughout doesn't fill the log. */
    private const val MAX_NOTES = 20

    /** Frames of the main thread's stack kept with a note. */
    private const val MAX_FRAMES = 25

    // What [since] noted already: a start is timed once per process (a later activity isn't a start).
    private val noted = HashSet<String>()

    /** Notes how long the process took to get here ([what]): its start to now, once per process. */
    fun since(log: TrafficLog, what: String) {
        if (!synchronized(noted) { noted.add(what) }) return
        log.note("start: $what ${SystemClock.uptimeMillis() - Process.getStartUptimeMillis()} ms after the process started")
    }

    /** Watches the main thread from a thread of its own for as long as the process runs. */
    fun start(log: TrafficLog) {
        val main = Handler(Looper.getMainLooper())
        // The main thread's last beat, read from the watching thread.
        val beat = java.util.concurrent.atomic.AtomicLong(SystemClock.uptimeMillis())
        val tick = Runnable { beat.set(SystemClock.uptimeMillis()) }
        Thread({
            var notes = 0
            var heldSince = 0L
            while (notes < MAX_NOTES) {
                main.post(tick)
                runCatching { Thread.sleep(TICK_MS) }
                val now = SystemClock.uptimeMillis()
                val held = now - beat.get()
                if (held >= STALL_MS && heldSince == 0L) {
                    // Held now: what the main thread is doing.
                    heldSince = beat.get()
                    val frames = Looper.getMainLooper().thread.stackTrace.take(MAX_FRAMES).joinToString("\n") { "  at $it" }
                    log.note("main thread held ${held}+ ms, in:\n$frames")
                    notes++
                } else if (held < STALL_MS && heldSince != 0L) {
                    log.note("main thread free again after ${beat.get() - heldSince} ms")
                    heldSince = 0L
                    notes++
                }
            }
        }, "stall-watch").apply { isDaemon = true }.start()
    }
}
