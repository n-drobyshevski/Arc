package dev.arc.ep133

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import androidx.core.content.edit
import dev.arc.ep133.protocol.TrafficLog
import java.io.File

/**
 * Why arc stopped last time, in the debug log (an addition). A crash writes its stack trace to a file before the
 * process dies; the next start puts it in the log, with what Android says about the last exit (a crash, a native
 * crash or "not responding", with its trace), so it can be shared from Settings → Debug log without adb.
 */
object CrashReport {
    private const val FILE = "last-crash.txt"
    private const val PREFS = "crash"
    private const val SEEN = "exitSeen"

    /** Lines of a trace kept in the log. */
    private const val MAX_LINES = 60

    /** Keeps an uncaught exception's stack trace for the next start, then lets Android handle the crash as before. */
    fun install(context: Context) {
        val file = File(context.filesDir, FILE)
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, e ->
            runCatching { file.writeText("crash in ${thread.name}: ${e.stackTraceToString().trimmed()}") }
            previous?.uncaughtException(thread, e)
        }
    }

    /** Puts the last run's crash, and Android's word on the last exit when it wasn't a normal one, in [log]. */
    fun report(context: Context, log: TrafficLog) {
        val file = File(context.filesDir, FILE)
        if (file.exists()) {
            runCatching { log.note("last run: ${file.readText()}") }
            file.delete()
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        val exit = runCatching {
            context.getSystemService(ActivityManager::class.java)
                .getHistoricalProcessExitReasons(context.packageName, 0, 1)
                .firstOrNull()
        }.getOrNull() ?: return
        // Each exit is reported once.
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (exit.timestamp <= prefs.getLong(SEEN, 0L)) return
        prefs.edit { putLong(SEEN, exit.timestamp) }
        val kind = when (exit.reason) {
            ApplicationExitInfo.REASON_CRASH -> "crash"
            ApplicationExitInfo.REASON_CRASH_NATIVE -> "native crash"
            ApplicationExitInfo.REASON_ANR -> "not responding (ANR)"
            ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "stopped for using too much"
            ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "failed to start"
            else -> return
        }
        // A Java crash's trace is the file above; Android keeps one for native crashes and ANRs.
        val trace = if (exit.reason == ApplicationExitInfo.REASON_CRASH) null else runCatching {
            exit.traceInputStream?.bufferedReader()?.use { it.readText() }
        }.getOrNull()
        log.note("last exit: $kind" + exit.description?.let { ": $it" }.orEmpty() + trace?.let { "\n${it.trimmed()}" }.orEmpty())
    }

    private fun String.trimmed() = lineSequence().take(MAX_LINES).joinToString("\n")
}
