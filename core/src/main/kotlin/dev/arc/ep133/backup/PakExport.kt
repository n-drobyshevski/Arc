package dev.arc.ep133.backup

import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.formats.Tar
import dev.arc.ep133.formats.Zip
import dev.arc.ep133.formats.ZipEntryData
import dev.arc.ep133.formats.jsStringOr
import dev.arc.ep133.util.encodeUtf8
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.ZoneId

/**
 * Pieces of a backup as their own files (an addition to the web version):
 * a single sound's WAV, or one project with the sounds it uses as a smaller
 * .pak in the same Sample Tool layout.
 */
object PakExport {
    /** "001 kick.wav", named the way backups name their sound files. */
    fun soundFileName(snd: PakSound): String = "${Backup.pad3(snd.slot)} ${Backup.safeName(snd.name)}.wav"

    /** The sound's WAV exactly as stored in the backup. */
    fun soundWav(pak: Pak, slot: Int): ByteArray =
        pak.sounds[slot]?.wav ?: throw PakError("Sound $slot is not in this backup")

    /** Sounds from the backup that a project's pads use. */
    fun projectSlots(pak: Pak, project: Int): List<Int> {
        val tar = pak.projects[project] ?: throw PakError("Project $project is not in this backup")
        return Tar.slotsUsedByProject(tar).filter { pak.sounds.containsKey(it) }
    }

    /**
     * A .pak with one project and the sounds it uses. meta.json keeps the
     * original device fields with a new generated_at; arc.json keeps the
     * original per-sound entries for the included slots.
     */
    fun project(pak: Pak, project: Int, nowMs: Long = System.currentTimeMillis(), zone: ZoneId = ZoneId.systemDefault()): ByteArray {
        val tar = pak.projects[project] ?: throw PakError("Project $project is not in this backup")
        val slots = projectSlots(pak, project)
        val meta = Backup.metaJson(
            product = pak.meta["device_name"].jsStringOr("EP-133"),
            sku = pak.meta["device_sku"].jsStringOr(""),
            osVersion = pak.meta["device_version"].jsStringOr(""),
            createdAt = nowMs,
        )
        val oldSounds = pak.sidecar["sounds"] as? JsonObject
        val soundInfo = LinkedHashMap<String, JsonElement>()
        for (slot in slots) {
            val snd = pak.sounds.getValue(slot)
            soundInfo[slot.toString()] = oldSounds?.get(slot.toString())
                ?: JsonObject(linkedMapOf("name" to JsonPrimitive(snd.name), "settings" to (snd.settings ?: JsonObject(emptyMap()))))
        }
        val sidecar = JsonObject(
            linkedMapOf(
                "app" to JsonPrimitive(Backup.APP_NAME),
                "version" to JsJson.number(1),
                "sounds" to JsonObject(soundInfo),
            ),
        )
        val entries = ArrayList<ZipEntryData>()
        entries.add(ZipEntryData("/meta.json", encodeUtf8(JsJson.stringify(meta, "  "))))
        entries.add(ZipEntryData("/arc.json", encodeUtf8(JsJson.stringify(sidecar))))
        for (slot in slots) {
            val snd = pak.sounds.getValue(slot)
            entries.add(ZipEntryData("/sounds/${soundFileName(snd)}", snd.wav))
        }
        entries.add(ZipEntryData("/projects/P${Backup.pad2(project)}.tar", tar))
        return Zip.write(entries, nowMs, zone)
    }

    /** "my-set-project-2.pak" */
    fun projectFileName(backupFileName: String, project: Int): String =
        backupFileName.removeSuffix(".pak") + "-project-$project.pak"
}
