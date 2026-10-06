package dev.arc.ep133.features

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/** Which list a sound was picked from: the device's sounds as last read, or the factory pack. */
enum class SoundSource(val id: String) {
    DEVICE("device"),
    FACTORY(FactorySounds.SOURCE);

    companion object {
        fun of(id: String): SoundSource? = entries.firstOrNull { it.id == id }
    }
}

/**
 * A sound put on a pad while no EP-133 is connected (an addition): the
 * [project]'s pad file for [group] (0..3, A..D) and [pad] (its number in the
 * project file, pNN, as in [PadTarget]), and the [slot] and [name] picked from
 * [source]'s list.
 */
data class OfflinePad(val project: Int, val group: Int, val pad: Int, val slot: Int, val name: String, val source: SoundSource)

/**
 * Live's pad changes made offline, in arc only (an addition): at most one per
 * pad, in the order they were made. Kept until the next connection asks
 * whether to put them on the EP-133, or until "Reset pads".
 */
data class OfflinePads(val list: List<OfflinePad> = emptyList()) {
    val size: Int get() = list.size

    /** The change on that pad, if any. */
    fun at(project: Int, group: Int, pad: Int): OfflinePad? =
        list.firstOrNull { it.project == project && it.group == group && it.pad == pad }

    /** [p] replaces that pad's change, if any, and goes last. */
    fun put(p: OfflinePad): OfflinePads = OfflinePads(drop(p.project, p.group, p.pad).list + p)

    /** Without that pad's change: the pad plays what the device read had again. */
    fun drop(project: Int, group: Int, pad: Int): OfflinePads =
        OfflinePads(list.filterNot { it.project == project && it.group == group && it.pad == pad })

    fun toJson(): String = buildJsonObject {
        put("v", 1)
        putJsonArray("pads") {
            for (p in list) add(buildJsonObject {
                put("project", p.project)
                put("group", p.group)
                put("pad", p.pad)
                put("slot", p.slot)
                put("name", p.name)
                put("source", p.source.id)
            })
        }
    }.toString()

    companion object {
        val EMPTY = OfflinePads()

        /** Null when the text is not a version this one can read; entries it can't read are skipped. */
        fun fromJson(text: String): OfflinePads? = runCatching {
            val o = Json.parseToJsonElement(text).jsonObject
            if (int(o, "v") != 1) return null
            var out = EMPTY
            for (e in (o["pads"] as? JsonArray).orEmpty()) {
                val f = e as? JsonObject ?: continue
                val project = int(f, "project")?.takeIf { it in 1..99 } ?: continue
                val group = int(f, "group")?.takeIf { it in 0..3 } ?: continue
                val pad = int(f, "pad")?.takeIf { it >= 1 } ?: continue
                val slot = int(f, "slot")?.takeIf { it >= 1 } ?: continue
                val name = (f["name"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: continue
                val source = (f["source"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.let(SoundSource::of) ?: continue
                out = out.put(OfflinePad(project, group, pad, slot, name, source))
            }
            out
        }.getOrNull()

        /** A whole number written as a number (not a string). */
        private fun int(o: JsonObject, k: String) = (o[k] as? JsonPrimitive)?.takeIf { !it.isString }?.intOrNull

        /**
         * Whether [p] can still go on the device: made on its [activeProject],
         * and the device holds the sound in that slot ([deviceNames], by slot).
         * A factory sound also fits where the device lists that slot unnamed
         * ([FactorySounds.unnamed]): the factory sound is still there.
         */
        fun fits(p: OfflinePad, activeProject: Int?, deviceNames: Map<Int, String>): Boolean {
            if (p.project != activeProject) return false
            val dev = deviceNames[p.slot] ?: return false
            return when (p.source) {
                SoundSource.DEVICE -> PadSoundCache.sameName(dev, p.name)
                SoundSource.FACTORY -> PadSoundCache.sameName(dev, p.name) || FactorySounds.unnamed(p.slot, dev)
            }
        }
    }
}
