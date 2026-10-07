package dev.arc.ep133.features

import dev.arc.ep133.formats.JsJson
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject

/**
 * A pad's SOUND EDIT settings changed while no EP-133 is connected (an
 * addition): the [project]'s pad file for [group] (0..3, A..D) and [pad] (its
 * number in the project file, pNN, as in [PadTarget]), and the [settings] it
 * should get.
 */
data class OfflinePadSetting(val project: Int, val group: Int, val pad: Int, val settings: PadSettings)

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

    /** [p] replaces that pad's change, if any, and goes last. */
    fun put(p: OfflinePadSetting): OfflinePadSettings = OfflinePadSettings(drop(p.project, p.group, p.pad).list + p)

    /** Without that pad's change: the pad has the settings the device read had again. */
    fun drop(project: Int, group: Int, pad: Int): OfflinePadSettings =
        OfflinePadSettings(list.filterNot { it.project == project && it.group == group && it.pad == pad })

    fun toJson(): String = JsJson.stringify(
        JsonObject(
            linkedMapOf(
                "v" to JsJson.number(1),
                "pads" to JsonArray(
                    list.map { p ->
                        JsonObject(
                            linkedMapOf<String, JsonElement>(
                                "project" to JsJson.number(p.project),
                                "group" to JsJson.number(p.group),
                                "pad" to JsJson.number(p.pad),
                                "settings" to p.settings.toJson(),
                            ),
                        )
                    },
                ),
            ),
        ),
    )

    companion object {
        val EMPTY = OfflinePadSettings()

        /** Null when the text is not a version this one can read; entries it can't read are skipped. */
        fun fromJson(text: String): OfflinePadSettings? = runCatching {
            val o = Json.parseToJsonElement(text).jsonObject
            if (int(o, "v") != 1) return null
            var out = EMPTY
            for (e in (o["pads"] as? JsonArray).orEmpty()) {
                val f = e as? JsonObject ?: continue
                val project = int(f, "project")?.takeIf { it in 1..99 } ?: continue
                val group = int(f, "group")?.takeIf { it in 0..3 } ?: continue
                val pad = int(f, "pad")?.takeIf { it >= 1 } ?: continue
                val settings = f["settings"] as? JsonObject ?: continue
                out = out.put(OfflinePadSetting(project, group, pad, PadSettings.fromJson(settings)))
            }
            out
        }.getOrNull()

        /** A whole number written as a number (not a string). */
        private fun int(o: JsonObject, k: String) = (o[k] as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull
    }
}
