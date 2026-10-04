package dev.arc.ep133.text

import dev.arc.ep133.util.jsRound
import dev.arc.ep133.util.jsToFixed
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Formatting helpers from app.js. All locale-independent except the dates. */
object Format {
    /** `plural(n, one, many)`: "1 sound", "0 sounds". */
    fun plural(n: Int, one: String, many: String = one + "s"): String = "$n ${if (n == 1) one else many}"

    /** `fmtBytes`. Takes a Double because device sizes come from JSON numbers. */
    fun bytes(b: Double): String = when {
        b >= 1048576 -> "${jsToFixed(b / 1048576, if (b >= 10485760) 0 else 1)} MB"
        b >= 1024 -> "${dev.arc.ep133.util.jsNumberToString(jsRound(b / 1024))} KB"
        else -> "${dev.arc.ep133.util.jsNumberToString(b)} B"
    }

    fun bytes(b: Long): String = bytes(b.toDouble())

    /** `new Intl.ListFormat('en', { type: 'conjunction' })`. */
    fun list(items: List<String>): String = when (items.size) {
        0 -> ""
        1 -> items[0]
        2 -> "${items[0]} and ${items[1]}"
        else -> items.dropLast(1).joinToString(", ") + ", and " + items.last()
    }

    /**
     * A date with a platform pattern (on Android, from
     * DateFormat.getBestDateTimePattern for "MMMdjmm" or "MMMdyyyy", which
     * matches the Intl.DateTimeFormat options of the web version).
     * Narrow and no-break spaces become plain spaces, so titles and file
     * names do not depend on the ICU version.
     */
    fun date(ms: Long, pattern: String, locale: Locale = Locale.getDefault(), zone: ZoneId = ZoneId.systemDefault()): String =
        DateTimeFormatter.ofPattern(pattern, locale).withZone(zone).format(Instant.ofEpochMilli(ms))
            .replace('\u202F', ' ').replace('\u00A0', ' ')

    /** Default patterns, used when the platform does not supply one (tests, JVM). */
    const val DATE_TIME_PATTERN = "MMM d, h:mm a"
    const val DAY_PATTERN = "MMM d, yyyy"
}
