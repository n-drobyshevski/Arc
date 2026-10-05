package dev.arc.ep133.features

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/**
 * What Live last read from the device (an addition): the active project, its
 * pads and the sound names. Kept so Live still shows the pads and their
 * samples while no EP-133 is connected. [savedAt] is in epoch milliseconds.
 */
data class LiveSnapshot(
    val savedAt: Long,
    val activeProject: Int?,
    val groups: List<PadGroup>,
    val names: Map<Int, String>,
) {
    fun toJson(): String = buildJsonObject {
        put("v", 1)
        put("savedAt", savedAt)
        put("project", activeProject?.let(::JsonPrimitive) ?: JsonNull)
        put("groups", buildJsonObject {
            for (g in groups) put(g.name, buildJsonObject {
                for ((pad, slot) in g.pads) put(pad.toString(), slot?.let(::JsonPrimitive) ?: JsonNull)
            })
        })
        put("names", buildJsonObject { for ((slot, name) in names) put(slot.toString(), name) })
    }.toString()

    companion object {
        /** Null when the text is not a snapshot this version can read. */
        fun fromJson(text: String): LiveSnapshot? = runCatching {
            val o = Json.parseToJsonElement(text).jsonObject
            if (o["v"]?.jsonPrimitive?.intOrNull != 1) return null
            val groups = (o["groups"] as? JsonObject).orEmpty().map { (name, pads) ->
                PadGroup(
                    name,
                    pads.jsonObject.entries.mapNotNull { (pad, slot) ->
                        val n = pad.toIntOrNull() ?: return@mapNotNull null
                        n to (slot as? JsonPrimitive)?.intOrNull
                    }.toMap(java.util.TreeMap()),
                )
            }.sortedWith(compareBy(ProjectPads.groupOrder) { it.name })
            val names = (o["names"] as? JsonObject).orEmpty().mapNotNull { (slot, name) ->
                val n = slot.toIntOrNull() ?: return@mapNotNull null
                val s = (name as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return@mapNotNull null
                n to s
            }.toMap()
            LiveSnapshot(
                savedAt = o["savedAt"]?.jsonPrimitive?.longOrNull ?: return null,
                activeProject = (o["project"] as? JsonPrimitive)?.intOrNull,
                groups = groups,
                names = names,
            )
        }.getOrNull()
    }
}
