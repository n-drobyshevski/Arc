package dev.arc.ep133.features

import dev.arc.ep133.formats.Tar
import dev.arc.ep133.formats.asObject
import dev.arc.ep133.formats.isJsNumber
import dev.arc.ep133.formats.jsNumOr
import dev.arc.ep133.formats.jsStringOr
import dev.arc.ep133.formats.numberOrNull
import dev.arc.ep133.protocol.CancelSignal
import dev.arc.ep133.protocol.Device
import dev.arc.ep133.protocol.Fs
import dev.arc.ep133.protocol.ProjectEntry
import dev.arc.ep133.protocol.Session
import dev.arc.ep133.protocol.SoundEntry
import dev.arc.ep133.protocol.Storage
import kotlinx.serialization.json.JsonObject

/** What is on the device right now (not part of the web version). */
data class DeviceContents(val storage: Storage, val sounds: List<SoundEntry>, val projects: List<ProjectEntry>) {
    val occupiedSlots: Set<Int> get() = sounds.mapTo(HashSet()) { it.slot }
}

/**
 * A project's sounds ([slots]) and pads, from one download; [settings] are
 * the pads' SOUND EDIT settings where their records look like settings
 * (ProjectPads.settings; an addition).
 */
data class ProjectLayout(
    val slots: List<Int>,
    val pads: List<PadGroup>,
    val settings: Map<Pair<String, Int>, PadSettings> = emptyMap(),
)

/** One sound's metadata as the device reports it. */

data class SoundDetails(
    val slot: Int,
    val name: String,
    val channels: Double,
    val sampleRate: Double,
    /** The settings a backup carries (Device.SOUND_KEYS), in that order. */
    val settings: JsonObject,
    /** CRC32 of the PCM, if the device reports one. */
    val crc: Long?,
)

/**
 * Read-only views of the device, built only on the commands the backup
 * already uses (LIST, META get, GET).
 */
object DeviceBrowser {
    /** Storage, sound slots and projects, in the same order refreshDevice reads them. */
    suspend fun contents(session: Session): DeviceContents = session.onLoop {
        val storage = Device.getStorage(session)
        val sounds = Device.listSounds(session)
        val projects = Device.listProjects(session)
        DeviceContents(storage, sounds, projects)
    }

    /** A sound's metadata (two small META pages), without downloading the audio. */
    suspend fun soundDetails(session: Session, slot: Int): SoundDetails {
        val meta = Fs.getMetadata(session, slot).asObject()
        val crc = meta["crc"]?.takeIf { it.isJsNumber }?.numberOrNull?.toLong()
        return SoundDetails(
            slot = slot,
            name = meta["name"].jsStringOr("sound $slot"),
            channels = meta["channels"].jsNumOr(1.0),
            sampleRate = meta["samplerate"].jsNumOr(Device.MAX_SAMPLE_RATE.toDouble()),
            settings = Device.pickSoundSettings(meta),
            crc = crc,
        )
    }

    /**
     * Sample slots a project's pads use. This downloads the project (a TAR),
     * so it takes a few seconds; the transfer is followed by the usual handshake.
     */
    suspend fun projectSounds(session: Session, project: Int, signal: CancelSignal? = null): List<Int> =
        projectLayout(session, project, signal).slots

    /** The sounds a project uses and its pads, from one download. */
    suspend fun projectLayout(session: Session, project: Int, signal: CancelSignal? = null): ProjectLayout {
        val tar = Device.readProject(session, project, signal = signal)
        return ProjectLayout(Tar.slotsUsedByProject(tar), ProjectPads.read(tar), ProjectPads.settings(tar))
    }

    /**
     * The sounds whose name contains [query] (ignoring case), or whose slot is
     * the number typed ("12" and "012" both find slot 12). A blank query keeps all.
     */
    fun findSounds(sounds: List<SoundEntry>, query: String): List<SoundEntry> {
        val q = query.trim()
        if (q.isEmpty()) return sounds
        val slot = q.takeIf { it.all(Char::isDigit) }?.toIntOrNull()
        return sounds.filter { it.name.contains(q, ignoreCase = true) || it.slot == slot }
    }

    /** Sounds in slot order, grouped by hundreds of slots: 1..99, 100..199, and so on. */
    fun hundreds(sounds: List<SoundEntry>): List<Pair<IntRange, List<SoundEntry>>> =
        sounds.sortedBy { it.slot }
            .groupBy { it.slot / 100 }
            .map { (h, list) -> (if (h == 0) 1 else h * 100)..(h * 100 + 99) to list }
}
