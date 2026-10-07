package dev.arc.ep133.features

import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.numberOrNull
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * How a pad plays its sample (SOUND EDIT's MODE on the EP-133), by the
 * string the device's pad metadata uses for `sound.playmode` (an addition).
 */
enum class PlayMode(val id: String) {
    ONESHOT("oneshot"),
    KEY("key"),
    LEGATO("legato");

    companion object {
        fun of(id: String): PlayMode? = entries.firstOrNull { it.id == id }
    }
}

/**
 * A pad's SOUND EDIT settings, as Live's EDIT reads and writes them (an
 * addition to the web version). None of this is in the official guide; it
 * follows community notes:
 *
 * - ZacharySBrown/ep133-ppak (PROTOCOL.md): the settings are JSON metadata on
 *   the pad's file node ([PadPush.node]), read with a METADATA GET and written
 *   with a METADATA SET, and the 26-byte pad record in a project TAR.
 * - wil-gerard/ep133-mcp (docs/research/pad-params-proof.md): the twelve keys
 *   of [toMeta], checked on hardware (OS 2.5.1) to persist through a power
 *   cycle. `sound.playmode` and `time.mode` must be strings or the device
 *   refuses the write (status 1). A partial write can make the device re-sync
 *   every field from the sample, so a write always carries the full record.
 *
 * [pitch] is in semitones (-12..12, two decimals), [level] 0..100 (ep133-mcp
 * reads `sound.amplitude` as 0..200 with 100 as unity; arc stays at 0..100),
 * [pan] -16..16, [start] and [end] frame indices into the sample ([end] null
 * for the sample's end), [attack] and [release] envelope ticks 0..255,
 * [midiChannel] 0..15. [timeMode] is kept as read and written back, not
 * edited.
 */
data class PadSettings(
    val pitch: Double = 0.0,
    val level: Int = 100,
    val pan: Int = 0,
    val mode: PlayMode = PlayMode.ONESHOT,
    val start: Long = 0,
    val end: Long? = null,
    val attack: Int = 0,
    val release: Int = 255,
    val muteGroup: Boolean = false,
    val midiChannel: Int = 0,
    val timeMode: String = "off",
) {
    /**
     * [m] as the play mode, with the release the tools pair with it: ONESHOT
     * plays to the end, so release 255; leaving ONESHOT with release 255 goes
     * to [KEY_RELEASE], the device's key-mode default. The same mode again
     * changes nothing.
     */
    fun withMode(m: PlayMode): PadSettings = when {
        m == mode -> this
        m == PlayMode.ONESHOT -> copy(mode = m, release = ENV_MAX)
        mode == PlayMode.ONESHOT && release == ENV_MAX -> copy(mode = m, release = KEY_RELEASE)
        else -> copy(mode = m)
    }

    /**
     * Every value in its range: pitch rounded to two decimals, an unknown
     * [timeMode] as "off", and the trim with start < end <= [frames] when the
     * sample's length is known (an [end] of null stays the sample's end).
     */
    fun clamped(frames: Long?): PadSettings {
        val n = frames?.takeIf { it >= 1 }
        val e = end?.let { if (n != null) it.coerceIn(1, n) else it.coerceAtLeast(1) }
        val s = start.coerceIn(0, (e ?: n ?: Long.MAX_VALUE) - 1)
        return copy(
            pitch = round2(if (pitch.isNaN()) 0.0 else pitch.coerceIn(-PITCH_MAX, PITCH_MAX)),
            level = level.coerceIn(0, LEVEL_MAX),
            pan = pan.coerceIn(-PAN_MAX, PAN_MAX),
            start = s,
            end = e,
            attack = attack.coerceIn(0, ENV_MAX),
            release = release.coerceIn(0, ENV_MAX),
            midiChannel = midiChannel.coerceIn(0, CHANNELS - 1),
            timeMode = timeMode.takeIf { it in TIME_MODES } ?: "off",
        )
    }

    /**
     * The METADATA SET for a pad playing [slot] (1..999): the full record, in
     * the order of [KEYS], enums as strings, the values [clamped] to [frames].
     * `sample.end` is [end] or else [frames]; the trim is left out only when
     * neither is known. The largest record stays well under the 320-byte
     * metadata page.
     */
    fun toMeta(slot: Int, frames: Long?): JsonObject {
        require(slot in 1..999) { "Slot $slot doesn't exist. Slots go from 1 to 999." }
        val c = clamped(frames)
        val last = c.end ?: frames?.takeIf { it >= 1 }
        val m = LinkedHashMap<String, JsonElement>()
        m["sym"] = JsJson.number(slot)
        m["sound.playmode"] = JsonPrimitive(c.mode.id)
        if (last != null) {
            m["sample.start"] = JsJson.number(c.start)
            m["sample.end"] = JsJson.number(last)
        }
        m["envelope.attack"] = JsJson.number(c.attack)
        m["envelope.release"] = JsJson.number(c.release)
        m["sound.pitch"] = JsJson.number(c.pitch)
        m["sound.amplitude"] = JsJson.number(c.level)
        m["sound.pan"] = JsJson.number(c.pan)
        m["sound.mutegroup"] = JsonPrimitive(c.muteGroup)
        m["time.mode"] = JsonPrimitive(c.timeMode)
        m["midi.channel"] = JsJson.number(c.midiChannel)
        return JsonObject(m)
    }

    /**
     * Offline edits replayed onto what the device holds now, so only what was
     * turned changes: field by field (every one, [end] and [timeMode] too),
     * this one's value where it differs from [base] (what the sheet showed
     * before the edits), else [current]'s (what the device reads now).
     */
    fun mergedOnto(base: PadSettings, current: PadSettings): PadSettings = PadSettings(
        pitch = if (pitch != base.pitch) pitch else current.pitch,
        level = if (level != base.level) level else current.level,
        pan = if (pan != base.pan) pan else current.pan,
        mode = if (mode != base.mode) mode else current.mode,
        start = if (start != base.start) start else current.start,
        end = if (end != base.end) end else current.end,
        attack = if (attack != base.attack) attack else current.attack,
        release = if (release != base.release) release else current.release,
        muteGroup = if (muteGroup != base.muteGroup) muteGroup else current.muteGroup,
        midiChannel = if (midiChannel != base.midiChannel) midiChannel else current.midiChannel,
        timeMode = if (timeMode != base.timeMode) timeMode else current.timeMode,
    )

    /** Frames the pad plays of a sample [frames] long: end (or the sample's end) less start, never below 0. */
    fun length(frames: Long): Long = maxOf(0L, (end ?: frames) - start)

    /** arc's own saved form (OfflinePadSettings), by field name; [end] only when set. */
    fun toJson(): JsonObject {
        val m = LinkedHashMap<String, JsonElement>()
        m["pitch"] = JsJson.number(pitch)
        m["level"] = JsJson.number(level)
        m["pan"] = JsJson.number(pan)
        m["mode"] = JsonPrimitive(mode.id)
        m["start"] = JsJson.number(start)
        end?.let { m["end"] = JsJson.number(it) }
        m["attack"] = JsJson.number(attack)
        m["release"] = JsJson.number(release)
        m["muteGroup"] = JsonPrimitive(muteGroup)
        m["midiChannel"] = JsJson.number(midiChannel)
        m["timeMode"] = JsonPrimitive(timeMode)
        return JsonObject(m)
    }

    companion object {
        val DEFAULT = PadSettings()

        /** The release the device gave a pad in key mode (ep133-mcp); see [withMode]. */
        const val KEY_RELEASE = 15

        /** Milliseconds per envelope tick: provisional, not verified on the device. */
        const val ENV_MS_PER_TICK = 10
        const val PITCH_MAX = 12.0
        const val LEVEL_MAX = 100
        const val PAN_MAX = 16
        const val ENV_MAX = 255
        const val CHANNELS = 16

        /** `time.mode`'s values, by their number in the pad record. */
        val TIME_MODES = listOf("off", "bpm", "bar")

        /** The pad metadata keys, in the order [toMeta] writes them. */
        val KEYS = listOf(
            "sym", "sound.playmode", "sample.start", "sample.end", "envelope.attack", "envelope.release",
            "sound.pitch", "sound.amplitude", "sound.pan", "sound.mutegroup", "time.mode", "midi.channel",
        )

        private val NUMERIC = Regex("-?[0-9]+(\\.[0-9]+)?")

        private fun round2(x: Double) = Math.round(x * 100) / 100.0

        /** A number, or a string that is one ("12", "-1.5"); null for anything else. */
        private fun num(e: JsonElement?): Double? {
            val p = e as? JsonPrimitive ?: return null
            val d = if (p.isString) p.content.trim().takeIf { NUMERIC.matches(it) }?.toDouble() else p.numberOrNull
            return d?.takeIf { it.isFinite() }
        }

        private fun int(e: JsonElement?): Int? = num(e)?.let { Math.round(it.coerceIn(-1e9, 1e9)).toInt() }

        private fun long(e: JsonElement?): Long? = num(e)?.let { Math.round(it.coerceIn(-1e15, 1e15)) }

        /** true/false, 1/0, or those as strings. */
        private fun bool(e: JsonElement?): Boolean? {
            val p = e as? JsonPrimitive ?: return null
            if (!p.isString && (p.content == "true" || p.content == "false")) return p.content == "true"
            return when (p.content.trim()) {
                "true", "1" -> true
                "false", "0" -> false
                else -> null
            }
        }

        /** A known string (any case), or its number in the record. */
        private fun <T> named(e: JsonElement?, all: List<T>, id: (T) -> String): T? {
            val p = e as? JsonPrimitive ?: return null
            if (p.isString) return all.firstOrNull { id(it) == p.content.trim().lowercase() }
            val i = num(p)?.takeIf { it == Math.floor(it) }?.toInt() ?: return null
            return all.getOrNull(i)
        }

        /**
         * A pad's settings from its metadata GET, tolerant of how the values
         * come: numbers or numeric strings, booleans or 0/1, the play and time
         * modes as strings or their record numbers. Anything missing or
         * unreadable keeps [base]'s value; the result is [clamped].
         */
        fun fromMeta(meta: JsonObject?, base: PadSettings = DEFAULT): PadSettings {
            if (meta == null) return base.clamped(null)
            return PadSettings(
                pitch = num(meta["sound.pitch"]) ?: base.pitch,
                level = int(meta["sound.amplitude"]) ?: base.level,
                pan = int(meta["sound.pan"]) ?: base.pan,
                mode = named(meta["sound.playmode"], PlayMode.entries) { it.id } ?: base.mode,
                start = long(meta["sample.start"]) ?: base.start,
                end = long(meta["sample.end"]) ?: base.end,
                attack = int(meta["envelope.attack"]) ?: base.attack,
                release = int(meta["envelope.release"]) ?: base.release,
                muteGroup = bool(meta["sound.mutegroup"]) ?: base.muteGroup,
                midiChannel = int(meta["midi.channel"]) ?: base.midiChannel,
                timeMode = named(meta["time.mode"], TIME_MODES) { it } ?: base.timeMode,
            ).clamped(null)
        }

        /**
         * Whether a pad's metadata GET looks like real pad settings: `sym`
         * above 0, or any `sound.` or `envelope.` key. An untouched pad reads
         * `{"sym":0}` or less (Device.assignPad), and its settings are then
         * better taken from the project's pad record ([fromRecord]).
         */
        fun written(meta: JsonObject?): Boolean {
            if (meta == null) return false
            if ((num(meta["sym"]) ?: 0.0) > 0) return true
            return meta.keys.any { it.startsWith("sound.") || it.startsWith("envelope.") }
        }

        /**
         * A pad's settings from its 26-byte record in a project TAR
         * (`pads/<group>/pNN`), at the offsets ep133-ppak gives, not verified
         * here: volume u8 @16, pitch i8 @17, pan i8 @18, attack u8 @19, release
         * u8 @20, time mode u8 @21 (0 off, 1 bpm, 2 bar), mute group u8 @22,
         * play mode u8 @23 (0 oneshot, 1 key, 2 legato). Null unless the record
         * looks like that: at least 24 bytes, volume 1..100, pitch -12..12, pan
         * -16..16 and play mode 0..2 (an all-zero record, as arc's demo writes,
         * is not). The trim stays the whole sample: the record's sample length
         * (u32 @8) comes without a start.
         */
        fun fromRecord(rec: ByteArray): PadSettings? {
            if (rec.size < 24) return null
            val level = rec[16].toInt() and 0xFF
            val pitch = rec[17].toInt()
            val pan = rec[18].toInt()
            val mode = PlayMode.entries.getOrNull(rec[23].toInt() and 0xFF)
            if (level !in 1..LEVEL_MAX || pitch !in -12..12 || pan !in -PAN_MAX..PAN_MAX || mode == null) return null
            return PadSettings(
                pitch = pitch.toDouble(),
                level = level,
                pan = pan,
                mode = mode,
                attack = rec[19].toInt() and 0xFF,
                release = rec[20].toInt() and 0xFF,
                timeMode = TIME_MODES.getOrNull(rec[21].toInt() and 0xFF) ?: "off",
                muteGroup = rec[22].toInt() != 0,
            )
        }

        /** arc's saved form back ([toJson]); missing or unreadable fields are [DEFAULT]'s, the result [clamped]. */
        fun fromJson(o: JsonObject?): PadSettings {
            if (o == null) return DEFAULT
            val d = DEFAULT
            return PadSettings(
                pitch = num(o["pitch"]) ?: d.pitch,
                level = int(o["level"]) ?: d.level,
                pan = int(o["pan"]) ?: d.pan,
                mode = (o["mode"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.let(PlayMode::of) ?: d.mode,
                start = long(o["start"]) ?: d.start,
                end = long(o["end"]),
                attack = int(o["attack"]) ?: d.attack,
                release = int(o["release"]) ?: d.release,
                muteGroup = bool(o["muteGroup"]) ?: d.muteGroup,
                midiChannel = int(o["midiChannel"]) ?: d.midiChannel,
                timeMode = (o["timeMode"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: d.timeMode,
            ).clamped(null)
        }
    }
}
