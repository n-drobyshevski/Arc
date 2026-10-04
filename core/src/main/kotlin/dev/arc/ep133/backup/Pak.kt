package dev.arc.ep133.backup

import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.Tar
import dev.arc.ep133.formats.Zip
import dev.arc.ep133.formats.asObject
import dev.arc.ep133.formats.jsString
import dev.arc.ep133.formats.jsStringOr
import dev.arc.ep133.formats.jsTruthy
import dev.arc.ep133.formats.prop
import dev.arc.ep133.util.JS_DOT
import dev.arc.ep133.util.JS_SPACE_CLASS
import dev.arc.ep133.util.JsDate
import dev.arc.ep133.util.decodeUtf8
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import java.time.ZoneId

/** A sound inside a .pak: the WAV file plus the settings and name from arc.json, if any. */
class PakSound(val slot: Int, val name: String, val wav: ByteArray, val settings: JsonElement?)

/** A parsed .pak (ours or the official Sample Tool's). */
class Pak(
    val meta: JsonObject,
    val sidecar: JsonObject,
    val sounds: LinkedHashMap<Int, PakSound>,
    val projects: LinkedHashMap<Int, ByteArray>,
)

data class PakDevice(val product: String, val sku: String, val osVersion: String)

/** What the library needs to know about a .pak without opening it again (`describePak`). */
data class PakDescription(
    val soundCount: Int,
    val projectCount: Int,
    val projects: List<Int>,
    val slots: List<Int>,
    val soundNames: Map<Int, String>,
    val projectSlots: Map<Int, List<Int>>,
    val device: PakDevice,
    val generatedAt: Long?,
)

class PakError(message: String) : Exception(message)

object Paks {
    // Case-insensitive parts are spelled out: JS /i only folds ASCII here, while
    // Kotlin's IGNORE_CASE and Android's ICU fold Unicode too (ſ would match s).
    private val SOUND_PATH = Regex("^[sS][oO][uU][nN][dD][sS]/([0-9]{1,3})(?:$JS_SPACE_CLASS+($JS_DOT*))?\\.[wW][aA][vV]\\z")
    private val PROJECT_PATH = Regex("^[pP][rR][oO][jJ][eE][cC][tT][sS]/[pP]([0-9]{1,2})\\.[tT][aA][rR]\\z")

    /** Parse a .pak (`openPak`). Throws for a file that is not a zip or holds nothing usable. */
    fun open(bytes: ByteArray): Pak {
        val files = Zip.read(bytes)
        fun json(k: String): JsonElement? {
            val b = files[k] ?: return null
            return JsJson.parseOrNull(decodeUtf8(b))
        }
        val meta = json("meta.json").asObject()
        val sidecar = json("arc.json").asObject()
        val sounds = LinkedHashMap<Int, PakSound>()
        val projects = LinkedHashMap<Int, ByteArray>()
        for ((path, data) in files) {
            val m = SOUND_PATH.find(path)
            if (m != null) {
                val slot = m.groupValues[1].toInt()
                if (slot < 1 || slot > 999) continue
                val side = sidecarSound(sidecar, slot)
                val fileName = m.groups[2]?.value
                val name = when {
                    side.prop("name").jsTruthy() -> side.prop("name").jsString()
                    !fileName.isNullOrEmpty() -> fileName
                    else -> "sound $slot"
                }
                val settings = side.prop("settings").takeIf { it != null && it !is JsonNull }
                sounds[slot] = PakSound(slot, name, data, settings)
                continue
            }
            val p = PROJECT_PATH.find(path)
            if (p != null) {
                val n = p.groupValues[1].toInt()
                if (n in 1..99) projects[n] = data
            }
        }
        if (sounds.isEmpty() && projects.isEmpty()) throw PakError("This file has no sounds or projects in it")
        return Pak(meta, sidecar, sounds, projects)
    }

    /** `sidecar.sounds?.[slot] ?? {}` */
    private fun sidecarSound(sidecar: JsonObject, slot: Int): JsonElement? = when (val s = sidecar["sounds"]) {
        is JsonObject -> s[slot.toString()]
        is JsonArray -> s.getOrNull(slot)
        else -> null
    }

    fun describe(pak: Pak): PakDescription {
        val projectSlots = LinkedHashMap<Int, List<Int>>()
        for ((n, tar) in pak.projects) projectSlots[n] = Tar.slotsUsedByProject(tar)
        val generated = pak.meta["generated_at"]
        return PakDescription(
            soundCount = pak.sounds.size,
            projectCount = pak.projects.size,
            projects = pak.projects.keys.sorted(),
            slots = pak.sounds.keys.sorted(),
            soundNames = pak.sounds.mapValues { it.value.name },
            projectSlots = projectSlots,
            device = PakDevice(
                product = pak.meta["device_name"].jsStringOr(""),
                sku = pak.meta["device_sku"].jsStringOr(""),
                osVersion = pak.meta["device_version"].jsStringOr(""),
            ),
            generatedAt = if (generated.jsTruthy()) parseDate(generated.jsString())?.takeIf { it != 0L } else null,
        )
    }

    /** `Date.parse` (see [JsDate]). */
    fun parseDate(s: String, zone: ZoneId = ZoneId.systemDefault()): Long? = JsDate.parse(s, zone)
}
