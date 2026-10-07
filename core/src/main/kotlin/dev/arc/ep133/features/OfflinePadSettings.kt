package dev.arc.ep133.features

import dev.arc.ep133.formats.JsJson
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull

/**
 * A pad's SOUND EDIT settings changed while no EP-133 is connected (an
 * addition): the [project]'s pad file for [group] (0..3, A..D) and [pad] (its
 * number in the project file, pNN, as in [PadTarget]), and the [settings] it
 * should get. [slot] is the sound the settings were made for (the replay
 * skips a pad that holds another sound by then); [base] is what the sheet
 * showed before the first offline turn (the fields of it not turned are taken
 * from the device at the replay, [PadSettings.mergedOnto]); [frames] is that
 * sample's length when known, so the replayed record is whole.
 */
data class OfflinePadSetting(
    val project: Int,
    val group: Int,
    val pad: Int,
    val slot: Int,
    val settings: PadSettings,
    val base: PadSettings,
    val frames: Long? = null,
)

/**
 * Live's pad settings changed offline, in arc only (an addition), like
 * [OfflinePads] for sounds: at most one per pad, in the order they were made,
 * kept until the next connection puts them on the EP-133 or they are reset.
 */
data class OfflinePadSettings(val list: List<OfflinePadSetting> = emptyList()) {
    val size: Int get() = list.size

    /** The change on that pad, if any. */
    fun at(project: Int, group: Int, pad: Int): OfflinePadSetting? =
        list.firstOrNull { it.project == project && it.group == group && it.pad == pad }

    /**
     * [p] replaces that pad's change, if any, and goes last. A change already
     * there for the same [OfflinePadSetting.slot] keeps its base (the first
     * turn's), so the replay still knows what the sheet showed before any of
     * them; one for another sound is replaced whole.
     */
    fun put(p: OfflinePadSetting): OfflinePadSettings {
        val old = at(p.project, p.group, p.pad)
        val next = if (old != null && old.slot == p.slot) p.copy(base = old.base) else p
        return OfflinePadSettings(drop(p.project, p.group, p.pad).list + next)
    }

    /** Without that pad's change: the pad has the settings the device read had again. */
    fun drop(project: Int, group: Int, pad: Int): OfflinePadSettings =
        OfflinePadSettings(list.filterNot { it.project == project && it.group == group && it.pad == pad })

    /** The settings each changed pad should get, by (project, group, pad), in the order they were made. */
    fun byPad(): Map<Triple<Int, Int, Int>, PadSettings> = list.associate { Triple(it.project, it.group, it.pad) to it.settings }

    fun toJson(): String = JsJson.stringify(
        JsonObject(
            linkedMapOf(
                "v" to JsJson.number(1),
                "pads" to JsonArray(
                    list.map { p ->
                        val m = linkedMapOf<String, JsonElement>(
                            "project" to JsJson.number(p.project),
                            "group" to JsJson.number(p.group),
                            "pad" to JsJson.number(p.pad),
                            "slot" to JsJson.number(p.slot),
                            "settings" to p.settings.toJson(),
                            "base" to p.base.toJson(),
                        )
                        p.frames?.let { m["frames"] = JsJson.number(it) }
                        JsonObject(m)
                    },
                ),
            ),
        ),
    )

    companion object {
        val EMPTY = OfflinePadSettings()

        /**
         * Null when the text is not a version this one can read; entries it
         * can't read (one without a slot or settings among them) are skipped.
         * A missing base is the settings; missing or unreadable frames are
         * unknown.
         */
        fun fromJson(text: String): OfflinePadSettings? = runCatching {
            val o = Json.parseToJsonElement(text).jsonObject
            if (int(o, "v") != 1) return null
            var out = EMPTY
            for (e in (o["pads"] as? JsonArray).orEmpty()) {
                val f = e as? JsonObject ?: continue
                val project = int(f, "project")?.takeIf { it in 1..99 } ?: continue
                val group = int(f, "group")?.takeIf { it in 0..3 } ?: continue
                val pad = int(f, "pad")?.takeIf { it >= 1 } ?: continue
                val slot = int(f, "slot")?.takeIf { it in 1..999 } ?: continue
                val settings = PadSettings.fromJson(f["settings"] as? JsonObject ?: continue)
                val base = (f["base"] as? JsonObject)?.let(PadSettings::fromJson) ?: settings
                val frames = long(f, "frames")?.takeIf { it >= 1 }
                out = out.put(OfflinePadSetting(project, group, pad, slot, settings, base, frames))
            }
            out
        }.getOrNull()

        /** A whole number written as a number (not a string). */
        private fun int(o: JsonObject, k: String) = (o[k] as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull

        private fun long(o: JsonObject, k: String) = (o[k] as? JsonPrimitive)?.takeIf { !it.isString }?.longOrNull
    }
}
