package dev.arc.ep133.features

import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.fx.clamp01
import dev.arc.ep133.formats.fx.knobHz
import dev.arc.ep133.formats.fx.lerp
import dev.arc.ep133.formats.isJsNumber
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlin.math.roundToInt

/**
 * The master effect, as the EP-133's FX offers them (its ordinal is the
 * mixer's control index): one at a time on the send bus, with two knobs, X
 * and Y. COMPRESSOR is the FX slot's own compressor, apart from the master
 * one ([Comp]).
 */
enum class FxType { NONE, DELAY, REVERB, DISTORTION, CHORUS, FILTER, COMPRESSOR }

/** The master compressor, after everything: [on], its drive [x] and its speed [y] (0..1). */
data class Comp(val on: Boolean = false, val x: Float = 0.5f, val y: Float = 0.5f)

/**
 * The sidechain (an addition to the EP-133's FX page): while [on], the pad
 * at [pad] (0..11) of [group] (0..3) ducks the groups in [dests] (a bitmask,
 * bit g for group g); [x] is how long the duck lasts and [y] its shape (0..1).
 */
data class Sidechain(
    val on: Boolean = false,
    val group: Int = 0,
    val pad: Int = 0,
    val dests: Int = 0,
    val x: Float = 0.3f,
    val y: Float = 0.5f,
)

/**
 * A project's FX: the master effect [type] with its knobs [x] and [y] (0..1),
 * each group's send to it ([sends], A..D, 0..1), the master compressor and
 * the sidechain. They stay in arc (the EP-133's own FX settings aren't read
 * or written); the mixer plays them ([FxKnobs] says how each knob is heard).
 * [DEFAULT] is no effect, no sends, nothing on: the mixer as it was before FX.
 */
data class FxSettings(
    val type: FxType = FxType.NONE,
    val x: Float = 0.5f,
    val y: Float = 0.5f,
    val sends: List<Float> = List(GROUPS) { 0f },
    val comp: Comp = Comp(),
    val sidechain: Sidechain = Sidechain(),
) {
    /** Every knob and send held to 0..1 (NaN to 0), four sends, the sidechain's pad, group and groups in range. */
    fun clamped(): FxSettings = FxSettings(
        type = type,
        x = clamp01(x),
        y = clamp01(y),
        sends = List(GROUPS) { clamp01(sends.getOrElse(it) { 0f }) },
        comp = Comp(comp.on, clamp01(comp.x), clamp01(comp.y)),
        sidechain = Sidechain(
            on = sidechain.on,
            group = sidechain.group.coerceIn(0, GROUPS - 1),
            pad = sidechain.pad.coerceIn(0, 11),
            dests = sidechain.dests and ALL_GROUPS,
            x = clamp01(sidechain.x),
            y = clamp01(sidechain.y),
        ),
    )

    /** Another effect; the knobs stay where they are. */
    fun withType(t: FxType): FxSettings = copy(type = t)

    fun withXY(x: Float, y: Float): FxSettings = copy(x = clamp01(x), y = clamp01(y))

    /** Group [g]'s send at [v] (0..1). */
    fun withSend(g: Int, v: Float): FxSettings = copy(sends = sends.mapIndexed { i, old -> if (i == g) clamp01(v) else old })

    fun withComp(c: Comp): FxSettings = copy(comp = c)

    fun withSidechain(s: Sidechain): FxSettings = copy(sidechain = s)

    companion object {
        /** The send groups, A..D. */
        const val GROUPS = 4
        /** [Sidechain.dests] with every group. */
        const val ALL_GROUPS = (1 shl GROUPS) - 1

        val DEFAULT = FxSettings()

        /** The name over the X knob for [type] ("" for none). */
        fun xLabel(type: FxType): String = when (type) {
            FxType.NONE -> ""
            FxType.DELAY -> "LENGTH"
            FxType.REVERB -> "SIZE"
            FxType.DISTORTION -> "DRIVE"
            FxType.CHORUS -> "RATE"
            FxType.FILTER -> "CUTOFF"
            FxType.COMPRESSOR -> "DRIVE"
        }

        /** The name over the Y knob for [type] ("" for none). */
        fun yLabel(type: FxType): String = when (type) {
            FxType.NONE -> ""
            FxType.DELAY -> "FEEDBACK"
            FxType.REVERB -> "COLOR"
            FxType.DISTORTION -> "COLOR"
            FxType.CHORUS -> "FEEDBACK"
            FxType.FILTER -> "RESO"
            FxType.COMPRESSOR -> "SPEED"
        }

        /**
         * What the X knob at [x] does to [type], as the display shows it: the
         * delay's division ("1/8D"), the filter's cutoff ("LPF 1.2k",
         * "OPEN", "HPF 400"), the drive ("12.3x"), the reverb's size ("64%"),
         * the chorus's rate ("0.42 Hz"). [bpm] is the tempo the delay follows;
         * its division reads the same at any tempo.
         */
        fun xReadout(type: FxType, x: Float, @Suppress("UNUSED_PARAMETER") bpm: Float = Tempo.DEFAULT.toFloat()): String {
            val k = clamp01(x)
            return when (type) {
                FxType.NONE -> ""
                FxType.DELAY -> FxKnobs.DELAY_DIVISIONS[FxKnobs.delayDivision(k)].name
                FxType.REVERB -> "${(k * 100f).roundToInt()}%"
                FxType.DISTORTION -> times(FxKnobs.distortionDrive(k))
                FxType.CHORUS -> "${hundredths(FxKnobs.chorusRateHz(k))} Hz"
                FxType.FILTER -> when (FxKnobs.filterZone(k)) {
                    FxKnobs.LPF -> "LPF ${hz(FxKnobs.filterLpfHz(k))}"
                    FxKnobs.HPF -> "HPF ${hz(FxKnobs.filterHpfHz(k))}"
                    else -> "OPEN"
                }
                FxType.COMPRESSOR -> times(FxKnobs.compDrive(k))
            }
        }

        /**
         * What the Y knob at [y] does to [type]: the feedback ("45%"), the
         * reverb's tilt ("DARK 40", "FLAT", "BRIGHT 20"), the distortion's
         * colour ("LP 40", "OPEN", "HP 20"), the filter's Q ("Q 2.3"), the
         * compressor's attack and release in ms ("0.5/40").
         */
        fun yReadout(type: FxType, y: Float): String {
            val k = clamp01(y)
            // From the centre: -100 (all the way down) to 100 (all the way up).
            val tilt = ((k - 0.5f) * 200f).roundToInt()
            return when (type) {
                FxType.NONE -> ""
                FxType.DELAY -> "${(FxKnobs.delayFeedback(k) * 100f).roundToInt()}%"
                FxType.REVERB -> if (tilt < 0) "DARK ${-tilt}" else if (tilt > 0) "BRIGHT $tilt" else "FLAT"
                FxType.DISTORTION -> if (tilt < 0) "LP ${-tilt}" else if (tilt > 0) "HP $tilt" else "OPEN"
                FxType.CHORUS -> "${(FxKnobs.chorusDepth(k) * 100f).roundToInt()}%"
                FxType.FILTER -> "Q ${tenths(FxKnobs.filterQ(k))}"
                FxType.COMPRESSOR -> FxKnobs.COMP_SPEEDS[FxKnobs.compSpeed(k)].name
            }
        }

        /** [v] (0 or more) to one decimal: "2.5". */
        private fun tenths(v: Float): String {
            val t = (v * 10f).roundToInt()
            return "${t / 10}.${t % 10}"
        }

        /** [v] (0 or more) to two decimals: "0.42". */
        private fun hundredths(v: Float): String {
            val h = (v * 100f).roundToInt()
            return "${h / 100}." + "${h % 100}".padStart(2, '0')
        }

        /** A gain as "2.5x", whole from 10 up ("40x"). */
        private fun times(v: Float): String = if ((v * 10f).roundToInt() < 100) "${tenths(v)}x" else "${v.roundToInt()}x"

        /** A frequency as "400", "1.2k", whole kHz from 10k up ("12k"). */
        private fun hz(v: Float): String {
            val r = v.roundToInt()
            if (r < 1000) return "$r"
            val t = (v / 100f).roundToInt()
            return if (t < 100) "${t / 10}.${t % 10}k" else "${(v / 1000f).roundToInt()}k"
        }
    }
}

/**
 * How each effect hears its knobs (0..1), shared by the readouts above and
 * the effects themselves, so what the display says is what plays. Float
 * arithmetic in the order written, as FxMath's (the web twin repeats it with
 * Math.fround).
 */
object FxKnobs {
    /** A delay length: [num]/[den] of a beat (a quarter note). */
    data class Division(val name: String, val num: Int, val den: Int)

    /** The delay's tempo-synced lengths, shortest first: X picks one of twelve. */
    val DELAY_DIVISIONS = listOf(
        Division("1/32", 1, 8),
        Division("1/16T", 1, 6),
        Division("1/16", 1, 4),
        Division("1/8T", 1, 3),
        Division("1/16D", 3, 8),
        Division("1/8", 1, 2),
        Division("1/4T", 2, 3),
        Division("1/8D", 3, 4),
        Division("1/4", 1, 1),
        Division("1/2T", 4, 3),
        Division("1/4D", 3, 2),
        Division("1/2", 2, 1),
    )

    /** The compressor's attack and release, in ms: Y picks one of eight, fast to slow. */
    data class Speed(val name: String, val attackMs: Float, val releaseMs: Float)

    val COMP_SPEEDS = listOf(
        Speed("0.5/40", 0.5f, 40f),
        Speed("1/60", 1f, 60f),
        Speed("2/100", 2f, 100f),
        Speed("5/150", 5f, 150f),
        Speed("10/200", 10f, 200f),
        Speed("15/300", 15f, 300f),
        Speed("20/400", 20f, 400f),
        Speed("30/600", 30f, 600f),
    )

    /** [filterZone]'s answers: low-pass below [LPF_TOP], high-pass above [HPF_BOTTOM], open between. */
    const val LPF = -1
    const val OPEN = 0
    const val HPF = 1
    const val LPF_TOP = 0.47f
    const val HPF_BOTTOM = 0.53f

    /** The delay's [DELAY_DIVISIONS] index for X. */
    fun delayDivision(x: Float): Int = minOf(11, (clamp01(x) * 12f).toInt())

    /** The delay's feedback for Y: 0..0.95. */
    fun delayFeedback(y: Float): Float = 0.95f * y

    /** The reverb's comb feedback for X: 0.70..0.98. */
    fun reverbFeedback(x: Float): Float = lerp(0.70f, 0.98f, x)

    /** The distortion's drive for X: 1 + 39x², 1..40. */
    fun distortionDrive(x: Float): Float = 1f + 39f * x * x

    /** The chorus's LFO rate for X, in Hz: 0.05..5 on the knob's cubic curve. */
    fun chorusRateHz(x: Float): Float = knobHz(x, 0.05f, 5f)

    /** The chorus's depth and feedback for Y: 0..0.7. */
    fun chorusDepth(y: Float): Float = 0.7f * y

    /** Which way the filter goes at X: [LPF], [OPEN] or [HPF]. */
    fun filterZone(x: Float): Int = if (x < LPF_TOP) LPF else if (x > HPF_BOTTOM) HPF else OPEN

    /** The low-pass cutoff in the [LPF] zone: 60 Hz at X = 0 up to 20 kHz at [LPF_TOP]. */
    fun filterLpfHz(x: Float): Float = knobHz(x / LPF_TOP, 60f, 20000f)

    /** The high-pass cutoff in the [HPF] zone: 20 Hz at [HPF_BOTTOM] up to 8 kHz at X = 1. */
    fun filterHpfHz(x: Float): Float = knobHz((x - HPF_BOTTOM) / (1f - HPF_BOTTOM), 20f, 8000f)

    /** The filter's Q for Y: 0.5..8. */
    fun filterQ(y: Float): Float = lerp(0.5f, 8f, y)

    /** The compressor's input drive for X: 1 + 7x², 1..8. */
    fun compDrive(x: Float): Float = 1f + 7f * x * x

    /** The compressor's [COMP_SPEEDS] index for Y. */
    fun compSpeed(y: Float): Int = minOf(7, (clamp01(y) * 8f).toInt())
}

/**
 * Every project's [FxSettings], by project number (0..99), kept in arc's
 * settings as JSON: {"v":1,"projects":[{"project":n,"type":"DELAY",...}]}.
 * Knob values are written as the exact numbers their floats are, so the web
 * twin writes the same text.
 */
object FxBook {
    fun toJson(map: Map<Int, FxSettings>): String {
        val projects = map.entries.sortedBy { it.key }.map { (project, raw) ->
            val s = raw.clamped()
            JsonObject(
                linkedMapOf(
                    "project" to JsJson.number(project),
                    "type" to JsonPrimitive(s.type.name),
                    "x" to num(s.x),
                    "y" to num(s.y),
                    "sends" to JsonArray(s.sends.map(::num)),
                    "comp" to JsonObject(linkedMapOf("on" to JsonPrimitive(s.comp.on), "x" to num(s.comp.x), "y" to num(s.comp.y))),
                    "sidechain" to JsonObject(
                        linkedMapOf(
                            "on" to JsonPrimitive(s.sidechain.on),
                            "group" to JsJson.number(s.sidechain.group),
                            "pad" to JsJson.number(s.sidechain.pad),
                            "dests" to JsJson.number(s.sidechain.dests),
                            "x" to num(s.sidechain.x),
                            "y" to num(s.sidechain.y),
                        ),
                    ),
                ),
            )
        }
        return JsJson.stringify(JsonObject(linkedMapOf("v" to JsJson.number(1), "projects" to JsonArray(projects))))
    }

    /**
     * Null when the text is not a version this one can read. A project entry
     * it can't read (no project number in 0..99, an unknown type, a field of
     * the wrong kind) is skipped; a field left out is its default, and
     * numbers out of range are held in it ([FxSettings.clamped]). A later
     * entry for the same project wins.
     */
    fun fromJson(s: String): Map<Int, FxSettings>? {
        val o = JsJson.parseOrNull(s) as? JsonObject ?: return null
        if (int(o["v"]) != 1) return null
        val out = LinkedHashMap<Int, FxSettings>()
        for (e in (o["projects"] as? JsonArray).orEmpty()) {
            val f = e as? JsonObject ?: continue
            val project = int(f["project"])?.takeIf { it in 0..99 } ?: continue
            out[project] = entry(f) ?: continue
        }
        return out
    }

    /** One project's settings, or null when a field present can't be read. */
    private fun entry(f: JsonObject): FxSettings? {
        val d = FxSettings.DEFAULT
        val type = if ("type" in f) FxType.entries.firstOrNull { e -> str(f["type"]) == e.name } ?: return null else d.type
        val x = float(f, "x", d.x) ?: return null
        val y = float(f, "y", d.y) ?: return null
        val sends = if ("sends" in f) {
            val list = f["sends"] as? JsonArray ?: return null
            List(FxSettings.GROUPS) { g -> if (g < list.size) float(list[g]) ?: return null else 0f }
        } else {
            d.sends
        }
        val comp = if ("comp" in f) {
            val c = f["comp"] as? JsonObject ?: return null
            Comp(bool(c, "on", d.comp.on) ?: return null, float(c, "x", d.comp.x) ?: return null, float(c, "y", d.comp.y) ?: return null)
        } else {
            d.comp
        }
        val sidechain = if ("sidechain" in f) {
            val c = f["sidechain"] as? JsonObject ?: return null
            val ds = d.sidechain
            Sidechain(
                on = bool(c, "on", ds.on) ?: return null,
                group = intField(c, "group", ds.group) ?: return null,
                pad = intField(c, "pad", ds.pad) ?: return null,
                dests = intField(c, "dests", ds.dests) ?: return null,
                x = float(c, "x", ds.x) ?: return null,
                y = float(c, "y", ds.y) ?: return null,
            )
        } else {
            d.sidechain
        }
        return FxSettings(type, x, y, sends, comp, sidechain).clamped()
    }

    /** The float's exact value as a JSON number. */
    private fun num(v: Float): JsonPrimitive = JsJson.number(v.toDouble())

    private fun float(e: JsonElement?): Float? = if (e != null && e.isJsNumber) (e as JsonPrimitive).content.toDouble().toFloat() else null

    /** [k] as a float: [default] when it's left out, null when it isn't a number. */
    private fun float(o: JsonObject, k: String, default: Float): Float? = if (k in o) float(o[k]) else default

    /** A whole number written as a number (not a string), in the Int range. */
    private fun int(e: JsonElement?): Int? = (e as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull

    private fun intField(o: JsonObject, k: String, default: Int): Int? = if (k in o) int(o[k]) else default

    private fun bool(o: JsonObject, k: String, default: Boolean): Boolean? =
        if (k in o) (o[k] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull else default

    private fun str(e: JsonElement?): String? = (e as? JsonPrimitive)?.takeIf { it.isString }?.content
}
