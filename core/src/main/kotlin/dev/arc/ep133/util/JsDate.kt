package dev.arc.ep133.util

import java.time.DateTimeException
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import kotlin.math.abs

/**
 * `Date.parse(text)` for the strings a .pak's meta.json can realistically
 * carry: the ECMAScript date-time format, plus the common forms V8's legacy
 * parser also accepts (a space instead of "T", ±HHMM offsets, "YYYY/M/D",
 * "YYYY-M-D" and RFC 1123 dates). Returns null where JS gives NaN.
 * Rarer legacy forms that browsers parse in their own ways give null.
 */
object JsDate {
    private const val MAX_TIME = 8.64e15

    // YYYY | ±YYYYYY, then -MM, -DD, then THH:mm[:ss[.fff…]], then Z | ±HH:mm
    private val ES = Regex(
        "([+-][0-9]{6}|[0-9]{4})(?:-([0-9]{2})(?:-([0-9]{2}))?)?" +
            "(?:T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\\.([0-9]+))?)?(Z|[+-][0-9]{2}:[0-9]{2})?)?",
    )

    // Legacy: Y-M-D or Y/M/D, optional time after a space or T, optional offset.
    private val LEGACY = Regex(
        "([0-9]{4})[-/]([0-9]{1,2})[-/]([0-9]{1,2})" +
            "(?:[ T]([0-9]{1,2}):([0-9]{2})(?::([0-9]{2})(?:\\.([0-9]+))?)?)?" +
            " ?(Z|GMT|UTC|[+-][0-9]{2}:?[0-9]{2})?",
    )

    fun parse(text: String, zone: ZoneId = ZoneId.systemDefault()): Long? {
        val s = text.jsTrim()
        ES.matchEntire(s)?.let { m -> return es(m, zone) }
        LEGACY.matchEntire(s)?.let { m -> return legacy(m, zone) }
        return runCatching { ZonedDateTime.parse(s, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli() }.getOrNull()
    }

    private fun es(m: MatchResult, zone: ZoneId): Long? {
        val g = m.groupValues
        val yearText = g[1]
        if (yearText == "-000000") return null
        val year = yearText.toInt()
        val month = g[2].ifEmpty { "1" }.toInt()
        val day = g[3].ifEmpty { "1" }.toInt()
        val hasTime = g[4].isNotEmpty()
        val hour = g[4].ifEmpty { "0" }.toInt()
        val minute = g[5].ifEmpty { "0" }.toInt()
        val second = g[6].ifEmpty { "0" }.toInt()
        val ms = g[7].take(3).padEnd(3, '0').ifEmpty { "000" }.toInt()
        if (month !in 1..12 || day !in 1..31 || minute > 59 || second > 59) return null
        if (hour > 24 || (hour == 24 && (minute != 0 || second != 0 || ms != 0))) return null
        // Date-only forms are UTC; date-time forms without an offset are local time.
        val offset: ZoneOffset? = when {
            !hasTime -> ZoneOffset.UTC
            g[8] == "Z" -> ZoneOffset.UTC
            g[8].isNotEmpty() -> runCatching { ZoneOffset.of(g[8]) }.getOrNull() ?: return null
            else -> null
        }
        return build(year, month, day, hour, minute, second, ms, offset, zone)
    }

    private fun legacy(m: MatchResult, zone: ZoneId): Long? {
        val g = m.groupValues
        val month = g[2].toInt()
        val day = g[3].toInt()
        val hour = g[4].ifEmpty { "0" }.toInt()
        val minute = g[5].ifEmpty { "0" }.toInt()
        val second = g[6].ifEmpty { "0" }.toInt()
        val ms = g[7].take(3).padEnd(3, '0').ifEmpty { "000" }.toInt()
        if (month !in 1..12 || day !in 1..31 || hour > 24 || minute > 59 || second > 59) return null
        val off = g[8]
        val offset: ZoneOffset? = when {
            off.isEmpty() -> null // legacy forms are local time
            off == "Z" || off == "GMT" || off == "UTC" -> ZoneOffset.UTC
            else -> {
                val digits = off.substring(1).replace(":", "")
                val sign = if (off[0] == '-') -1 else 1
                runCatching { ZoneOffset.ofHoursMinutes(sign * digits.substring(0, 2).toInt(), sign * digits.substring(2).toInt()) }.getOrNull() ?: return null
            }
        }
        return build(g[1].toInt(), month, day, hour, minute, second, ms, offset, zone)
    }

    /** Day-of-month overflow rolls over into the next month, as in V8 ("2024-02-30" is March 1). */
    private fun build(year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int, ms: Int, offset: ZoneOffset?, zone: ZoneId): Long? {
        return try {
            val local = LocalDateTime.of(LocalDate.of(year, month, 1).plusDays((day - 1).toLong()), java.time.LocalTime.MIDNIGHT)
                .plusHours(hour.toLong()).plusMinutes(minute.toLong()).plusSeconds(second.toLong()).plusNanos(ms * 1_000_000L)
            val t = (if (offset != null) local.toInstant(offset) else local.atZone(zone).toInstant()).toEpochMilli()
            if (abs(t.toDouble()) > MAX_TIME) null else t
        } catch (_: DateTimeException) {
            null
        } catch (_: ArithmeticException) {
            null
        }
    }
}
