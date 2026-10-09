package dev.arc.ep133.controller

import android.content.Context
import android.content.Intent
import android.text.format.DateFormat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import dev.arc.ep133.audio.PcmSound
import dev.arc.ep133.audio.SoundMemory
import dev.arc.ep133.backup.Backup
import dev.arc.ep133.backup.PakDescription
import dev.arc.ep133.backup.Paks
import dev.arc.ep133.backup.Progress
import dev.arc.ep133.data.Library
import dev.arc.ep133.features.BackupDiff
import dev.arc.ep133.features.DeviceBrowser
import dev.arc.ep133.features.DeviceContents
import dev.arc.ep133.features.DiffResult
import dev.arc.ep133.features.FactorySounds
import dev.arc.ep133.features.OfflinePad
import dev.arc.ep133.features.OfflinePads
import dev.arc.ep133.features.PadSample
import dev.arc.ep133.features.PatternPosition
import dev.arc.ep133.features.ProjectPatterns
import dev.arc.ep133.features.Seq
import dev.arc.ep133.features.SoundSource
import dev.arc.ep133.features.SampleEdit
import dev.arc.ep133.features.SampleInput
import dev.arc.ep133.features.SamplePhase
import dev.arc.ep133.features.SampleSource
import dev.arc.ep133.features.SampleUpload
import dev.arc.ep133.features.SoundDetails
import dev.arc.ep133.features.Timing
import dev.arc.ep133.features.TransportAction
import dev.arc.ep133.features.TransportPhase
import dev.arc.ep133.features.nextLoopStart
import dev.arc.ep133.features.passOf
import dev.arc.ep133.features.positionOf
import dev.arc.ep133.features.UploadItem
import dev.arc.ep133.formats.Wav
import dev.arc.ep133.features.SampleTrim
import dev.arc.ep133.midi.MidiConnector
import dev.arc.ep133.protocol.CancelSignal
import dev.arc.ep133.protocol.CancelledError
import dev.arc.ep133.protocol.Device
import dev.arc.ep133.protocol.DeviceInfo
import dev.arc.ep133.protocol.LoggingTransport
import dev.arc.ep133.protocol.Session
import dev.arc.ep133.protocol.Storage
import dev.arc.ep133.protocol.TrafficLog
import dev.arc.ep133.service.TransferService
import dev.arc.ep133.text.BackupDevice
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.LibraryRules
import dev.arc.ep133.text.BackupRecord
import dev.arc.ep133.text.Format
import dev.arc.ep133.text.RestoreSelection
import dev.arc.ep133.text.Strings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.Locale
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.floor

/** What the device panel shows (app.js state.device). */
data class DeviceSummary(val info: DeviceInfo, val storage: Storage, val sounds: Int, val projects: Int)

/** The progress sheet. */
data class TaskUi(val title: String, val label: String, val fraction: Double, val cancelling: Boolean)

/** A toast; [action] ("Undo") is a key at its end that runs [onAction]. */
data class ToastMsg(val id: Long, val text: String, val error: Boolean, val action: String? = null, val onAction: (() -> Unit)? = null)

/** The device browser (an addition to the web version). */
data class BrowserUi(
    val contents: DeviceContents? = null,
    val details: Map<Int, SoundDetails> = emptyMap(),
    val projectSounds: Map<Int, List<Int>> = emptyMap(),
    /** Pads of the projects whose sounds were read (same download). */
    val projectPads: Map<Int, List<dev.arc.ep133.features.PadGroup>> = emptyMap(),
    /** What is being read right now: "contents", "slot:N" or "project:N". */
    val reading: String? = null,
    /** WAV files picked for upload, waiting for their slots to be confirmed. */
    val draft: List<UploadDraftItem>? = null,
)

/** One picked file. [error] is set when it can't be uploaded (not a usable WAV). */
data class UploadDraftItem(
    val fileName: String,
    val name: String,
    val slot: Int?,
    val wav: ByteArray?,
    val error: String?,
    /** Frames to upload; null means the whole file. */
    val trim: IntRange? = null,
    /** The file's sample rate, for showing trim times (0 when unusable). */
    val sampleRate: Long = 0,
)

/** Sound search across saved backups: the query, its results, and whether older backups are still being indexed. */
data class SearchUi(
    val query: String = "",
    val results: List<dev.arc.ep133.features.SearchGroup> = emptyList(),
    val indexing: Boolean = false,
)

/**
 * Two saved backups being compared, older first. The sound names stay for
 * describing pad changes; the backups themselves are not kept.
 */
data class PakCompareUi(
    val oldId: String,
    val newId: String,
    val result: dev.arc.ep133.features.PakCompareResult? = null,
    val oldNames: Map<Int, String> = emptyMap(),
    val newNames: Map<Int, String> = emptyMap(),
    val error: String? = null,
)

/** The live mirror: what the device is playing, plus loading and errors. */
data class MirrorUi(
    val state: dev.arc.ep133.features.MirrorState = dev.arc.ep133.features.MirrorState(),
    val loading: Boolean = true,
    val error: String? = null,
    /** Not connected, showing the last read instead: when it was made ("Last seen 5 Oct, 14:02"). */
    val offline: String? = null,
    /** The device's sounds as Live read them, for EDIT's pad sheet (empty until read, and offline). */
    val sounds: List<dev.arc.ep133.protocol.SoundEntry> = emptyList(),
    /** Offline: the sounds EDIT's pad sheet lists instead, played and put on pads in arc only. */
    val offlineSounds: OfflineSounds? = null,
    /**
     * Connected, PROJECT tapped: the project the EP-133 is switching to, the
     * newest tap's, until the read of it lands (null otherwise). The display
     * and the key show it meanwhile, and EDIT waits.
     */
    val projectTarget: Int? = null,
    /**
     * Offline: the projects PROJECT steps through (ProjectStep.offlineViews),
     * the last read's and the factory pack's. Fewer than two grey it out.
     */
    val offlineProjects: List<Int> = emptyList(),
)

/** Live's click (TEMPO): whether it sounds, and the phone's tempo (the EP-133's leads while it sends MIDI clock). */
data class MetronomeUi(val on: Boolean = false, val bpm: Int = dev.arc.ep133.features.Tempo.DEFAULT)

/**
 * The sound lists Live offers offline (an addition): the device's sounds as
 * last read ([device], null when never read) and the factory pack's
 * ([factory], null when the library has none), with no sizes. [base] is the
 * list the view shows (the factory sounds when nothing was read);
 * [unavailable] are the device's slots arc has no audio for, dimmed.
 */
data class OfflineSounds(
    val base: SoundSource,
    val device: List<dev.arc.ep133.protocol.SoundEntry>?,
    val factory: List<dev.arc.ep133.protocol.SoundEntry>?,
    val unavailable: Set<Int>,
)

/** A backup opened for its contents screen (sounds and projects, playback, export). */
data class ContentsUi(
    val backupId: String,
    val pak: dev.arc.ep133.backup.Pak?,
    val error: String? = null,
    /** Length of each sound in seconds; missing when its WAV can't be read. */
    val durations: Map<Int, Double> = emptyMap(),
)

/** The result of comparing a backup with the device, for the selection it was made with. */
data class DiffUi(val backupId: String, val selection: RestoreSelection, val result: DiffResult)

data class UiState(
    val midiSupported: Boolean = true,
    val connected: Boolean = false,
    val device: DeviceSummary? = null,
    val busy: Boolean = false,
    val backups: List<BackupRecord> = emptyList(),
    /** False until the library has been read once (the empty state stays hidden until then). */
    val libraryLoaded: Boolean = false,
    val freshId: String? = null,
    val task: TaskUi? = null,
    val spaceLeft: Long? = null,
    val toast: ToastMsg? = null,
    val browser: BrowserUi = BrowserUi(),
    val diff: DiffUi? = null,
    val contents: ContentsUi? = null,
    val search: SearchUi = SearchUi(),
    val pakCompare: PakCompareUi? = null,
    val mirror: MirrorUi? = null,
    /**
     * Live is copying a pad's sound from the device in the background. Unlike
     * [busy] it leaves every key enabled: an action waits for that one sound.
     */
    val backgroundRead: Boolean = false,
    /** The sound Live's KEYS plays: a pad, its sample as the mirror names it. */
    val keysPad: dev.arc.ep133.features.PhysicalPad? = null,
    /** Whether the library folder has been picked (after a reinstall); until then restoring is offered. */
    val folderPicked: Boolean = false,
    /** Live's pad changes made offline, in arc only ([OfflinePads]): how many, for Live tools' Reset row. */
    val offlinePads: Int = 0,
    /** The EP-133 connected with offline pad changes kept: how many, while it asks whether to write them. */
    val offlinePrompt: OfflinePrompt? = null,
)

/**
 * EDIT's pad settings, while a pad's sheet shows them (an addition): the
 * [pad] and where its settings are kept ([target]), the [settings] shown
 * (each turn lands here at once), and its sound's length ([frames], at
 * [sampleRate]) with its waveform ([peaks]) once loaded, for TRIM. [reading]
 * while the EP-133 is asked for the pad's settings, [failed] when it
 * couldn't answer (the knobs then rest: a turn would write guesses over the
 * pad); [offline] when they change in arc only, from [base], what the sheet
 * showed before them (what isn't turned is taken from the device later).
 */
data class PadEditState(
    val pad: dev.arc.ep133.features.PhysicalPad,
    val target: dev.arc.ep133.features.PadTarget,
    val settings: dev.arc.ep133.features.PadSettings,
    val frames: Long? = null,
    val sampleRate: Int = dev.arc.ep133.protocol.Device.MAX_SAMPLE_RATE,
    val peaks: List<dev.arc.ep133.features.Peak>? = null,
    val reading: Boolean = false,
    val offline: Boolean = false,
    val failed: Boolean = false,
    val base: dev.arc.ep133.features.PadSettings = settings,
)

/**
 * The state and actions of app.js. Lives as long as the process (owned by
 * ArcApp), so a running transfer survives the activity being recreated; the
 * foreground service only keeps the process alive.
 */
/** EDIT's knobs: their turning rests this long before the pad's settings are written. */
private const val PAD_WRITE_DELAY_MS = 150L

/**
 * How a pad with [s] plays on the phone (an addition): the EP-133's pitch,
 * level, pan, trim, envelope (ticks, [PadSettings.ENV_MS_PER_TICK] each, a
 * guess) and play mode, its mute group being its pad group's ([group] 0..3).
 * For KEYS ([keys]), where each note is a voice of its own, LEGATO is a held
 * note and the mute group is left out (the notes would cut each other). It
 * goes through its group's FX bus (its send, the sidechain's duck), and
 * [duckSource] when the pad is the sidechain's source.
 */
internal fun voiceShape(
    s: dev.arc.ep133.features.PadSettings,
    group: Int,
    keys: Boolean = false,
    duckSource: Boolean = false,
): dev.arc.ep133.formats.VoiceShape {
    val ms = dev.arc.ep133.features.PadSettings.ENV_MS_PER_TICK
    return dev.arc.ep133.formats.VoiceShape(
        semitones = s.pitch,
        gain = s.level / dev.arc.ep133.features.PadSettings.LEVEL_MAX.toFloat(),
        pan = s.pan,
        start = s.start.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt(),
        end = s.end?.coerceIn(0L, Int.MAX_VALUE.toLong())?.toInt() ?: Int.MAX_VALUE,
        attackMs = s.attack * ms,
        releaseMs = maxOf(dev.arc.ep133.formats.VoiceMixer.FADE_MS, s.release * ms),
        mode = when (s.mode) {
            dev.arc.ep133.features.PlayMode.ONESHOT -> dev.arc.ep133.formats.VoiceMode.ONESHOT
            dev.arc.ep133.features.PlayMode.KEY -> dev.arc.ep133.formats.VoiceMode.KEY
            dev.arc.ep133.features.PlayMode.LEGATO -> if (keys) dev.arc.ep133.formats.VoiceMode.GATE else dev.arc.ep133.formats.VoiceMode.LEGATO
        },
        // KEYS' notes are one pad's: its mute group would cut its own chord.
        muteGroup = if (s.muteGroup && !keys) group + 1 else 0,
        bus = group,
        duckSource = duckSource,
    )
}

/** How much of Live's pad samples is kept decoded in memory (16-bit, so 32M samples). */
private const val PAD_MEMORY_BYTES = 64L * 1024 * 1024

/** How much of the backup sounds and takes played in lists is kept decoded, for a quick replay. */
private const val PREVIEW_MEMORY_BYTES = 16L * 1024 * 1024

/** The previews' keys for the pad sheet's offline sounds ("pad:<source>:<slot>:<name>"); backups are "backup:<id>:<slot>". */
private const val PAD_PREVIEW = "pad:"

/** A Live press let go of while its sound loaded for longer than this sounds only if no press came after it. */
private const val LATE_LOAD_NS = 120_000_000L

/** The player's key for SAMPLE's review sheet. */
internal const val REVIEW_KEY = "sample:review"

/** How long SAMPLE's count-in waits for the click's next beat before it gives up (a beat at 40 BPM is 1.5 s). */
private const val BEAT_WAIT_MS = 2_000L

/** PATTERN's count-in starts this much later still: time for the click to open its own output. */
private const val COUNT_IN_LEAD_NS = 150_000_000L

/** The patterns started for SAMPLE's PTN take start this much later still: time to ask for the take before bar 1. */
private const val PATTERN_TAKE_LEAD_NS = 100_000_000L

/** The pattern's loop wakes at least this often while the transport runs (a tempo or output change). */
private const val PATTERN_LOOP_MS = 100L

/** And this often while ERASE is held on a pad, so the notes go before the sequencer sends them. */
private const val PATTERN_ERASE_MS = 20L

/**
 * A scene's or pattern's pick waiting takes over in the model this long after its tick is heard (the sequencer
 * played it from the tick all the same): a press just before the tick, told late (a scroll's wait), still records
 * into the pattern it was played over.
 */
private const val SCENE_GRACE_NS = 100_000_000L

/** A press in ERASE (or CORRECT, while playing) let go of sooner than this is a tap: it erases (corrects) the pad's every note. */
internal const val ERASE_TAP_NS = 200_000_000L

/** A recording's key in Live's pad memory: its file in arc's samples folder. */
private fun recordedKey(file: String) = "rec:$file"

/** A take as a sound to play. */
private fun pcmSoundOf(pcm: ShortArray, channels: Int, rate: Int) = PcmSound(pcm, channels, rate, pcm.all { it == 0.toShort() })

/** How often an idle mirror with a tempo showing looks whether it went stale. */
private const val TEMPO_CHECK_MS = 250L

/** How long the click's tempo rests before library.json gets it. */
private const val TEMPO_SYNC_MS = 1000L

/** How long FX's knobs rest before fx.json gets them. */
private const val FX_SAVE_MS = 500L

/**
 * How long an idle mirror showing [st] may sleep before [st] changes by
 * itself at [now]: when its first released pad or note is past its fade, or
 * (a tempo showing) the next look at whether the clock stopped. Null: nothing
 * changes until the device sends something.
 */
internal fun mirrorSettlesIn(st: dev.arc.ep133.features.MirrorState, now: Long): Long? {
    var due = Long.MAX_VALUE
    for (l in st.pads.values) l.offAt?.let { due = minOf(due, it + dev.arc.ep133.features.LiveMirror.FADE_NS) }
    for (l in st.notes.values) l.offAt?.let { due = minOf(due, it + dev.arc.ep133.features.LiveMirror.FADE_NS) }
    // A moment past the fade, so the snapshot drops it.
    var ms = if (due == Long.MAX_VALUE) null else ((due - now) / 1_000_000L + 5).coerceAtLeast(1L)
    if (st.bpm != null) ms = minOf(ms ?: TEMPO_CHECK_MS, TEMPO_CHECK_MS)
    return ms
}

/**
 * The mirror state to show after [shown] when the snapshot is [next]: [shown]
 * itself when the two read the same on screen, the tempo at the display's
 * precision (MirrorText.bpm). The clock estimate wobbles on every clock
 * message (48 a second at 120 BPM), so an unchanged screen isn't published again.
 */
internal fun shownMirror(shown: dev.arc.ep133.features.MirrorState?, next: dev.arc.ep133.features.MirrorState): dev.arc.ep133.features.MirrorState {
    if (shown == null || shown.bpm?.let(dev.arc.ep133.text.MirrorText::bpm) != next.bpm?.let(dev.arc.ep133.text.MirrorText::bpm)) return next
    return if (next.copy(bpm = shown.bpm) == shown) shown else next
}

/**
 * PROJECT's switch loop: [pass] for [target]'s project, again while taps
 * moved the target on meanwhile, until a pass ends with the target where it
 * began. A tap at any point of a pass, its last read too, gets a pass of
 * its own, so taps pile up and the newest is written. A null pass (cut
 * short by a tap, or the mirror closed or reopened meanwhile) is looked at
 * again. Null once the target is gone; else the last pass's result.
 */
internal suspend fun <R : Any> passOnNewest(target: () -> Int?, pass: suspend (want: Int) -> R?): R? {
    while (true) {
        val want = target() ?: return null
        val r = pass(want) ?: continue
        if (target() == want) return r
    }
}

/**
 * The lists Live offers offline: the device's sounds from [lastRead] and the
 * factory pack's from [factory] (any of its projects: each has every sound's
 * name), by slot, sizes unknown; [unavailable] from
 * [dev.arc.ep133.features.PadSounds.unavailable]. [base] is the view's own
 * list: the device's for the last read, the factory pack's for one of its
 * projects (PROJECT steps between them).
 */
internal fun offlineSoundsOf(
    lastRead: dev.arc.ep133.features.LiveSnapshot?,
    factory: dev.arc.ep133.features.LiveSnapshot?,
    unavailable: Set<Int>,
    base: SoundSource = if (lastRead != null) SoundSource.DEVICE else SoundSource.FACTORY,
): OfflineSounds {
    fun list(names: Map<Int, String>) = names.entries.sortedBy { it.key }.map { dev.arc.ep133.protocol.SoundEntry(it.key, it.value, 0) }
    return OfflineSounds(
        base = base,
        device = lastRead?.let { list(it.names) },
        factory = factory?.let { list(it.names) },
        unavailable = unavailable,
    )
}

/**
 * [slot]'s row in [source]'s list when it is listed and arc can play it;
 * null: it needs the EP-133. The pad's own sound in the read ([readSlot])
 * is always taken, unplayable or not: picking it drops the pad's change.
 */
internal fun OfflineSounds.pick(slot: Int, source: SoundSource, readSlot: Int? = null): dev.arc.ep133.protocol.SoundEntry? {
    val list = if (source == SoundSource.FACTORY) factory else device
    return list?.firstOrNull { it.slot == slot }?.takeIf { source == SoundSource.FACTORY || slot !in unavailable || slot == readSlot }
}

/**
 * [pads] after [slot] ([name], from [source]) was picked offline for [t]'s
 * pad: picking the device's own sound, the one the read has there
 * ([readSlot]), drops the pad's change; anything else is put on it.
 */
internal fun offlineAssign(
    pads: OfflinePads,
    t: dev.arc.ep133.features.PadTarget,
    slot: Int,
    name: String,
    source: SoundSource,
    readSlot: Int?,
): OfflinePads =
    if (source == SoundSource.DEVICE && slot == readSlot) pads.drop(t.project, t.group, t.pad)
    else pads.put(OfflinePad(t.project, t.group, t.pad, slot, name, source))

/** What reconnecting does with one offline pad change. */
internal sealed interface OfflineStep {
    /** Skipped: the EP-133 has another sound or project there now ([OfflinePads.fits]). */
    data object Skip : OfflineStep

    /** The pad has that sound already: done without a write. */
    data object Done : OfflineStep

    /** [slot] to write on [target]'s pad (its slot the one the read has now). */
    data class Write(val target: dev.arc.ep133.features.PadTarget, val slot: Int) : OfflineStep

    /**
     * A sample recorded in arc ([SoundSource.RECORDED], an addition): its
     * file goes into the next free slot, then onto [target]'s pad.
     */
    data class Upload(val target: dev.arc.ep133.features.PadTarget) : OfflineStep
}

/**
 * The step for [p] on the device as Live just read it: its [activeProject],
 * its sound names by slot ([deviceNames]) and the slot on [p]'s pad now
 * ([readSlot]).
 */
internal fun offlineStep(p: OfflinePad, activeProject: Int?, deviceNames: Map<Int, String>, readSlot: Int?): OfflineStep = when {
    !OfflinePads.fits(p, activeProject, deviceNames) -> OfflineStep.Skip
    // Never on the device yet: whatever the pad has now, the recording goes on it.
    p.source == SoundSource.RECORDED -> OfflineStep.Upload(dev.arc.ep133.features.PadTarget(p.project, p.group, p.pad, readSlot))
    readSlot == p.slot -> OfflineStep.Done
    else -> OfflineStep.Write(dev.arc.ep133.features.PadTarget(p.project, p.group, p.pad, readSlot), p.slot)
}

/**
 * The question when the EP-133 connects with offline changes kept: how many
 * pad changes (sounds and settings) and how many new recordings ([samples])
 * wait to go on it.
 */
data class OfflinePrompt(val changes: Int, val samples: Int = 0)

// ---------- SAMPLE: recording into a pad (an addition) ----------

/**
 * SAMPLE mode as its line and panel show it (an addition): [on] while the
 * mode is open, the [input] recording from those [inputs] offered (USB only
 * while plugged in, [usb]; MIC and USB only with the mic allowed), its LEVEL
 * ([gainDb]) and threshold ([thresholdDb], null for none), the [bars] a
 * hands-free take lasts (null: Free; PTN, the pattern's length, is
 * [pattern], with notes in the project), the panel's [latch] switch, what is
 * going on ([phase]), the longest take in seconds ([maxSeconds], less when
 * the EP-133 is short of space: [lowSpace]).
 */
data class SampleUiState(
    val on: Boolean = false,
    val input: SampleInput = SampleInput(SampleSource.MIC, false),
    val inputs: List<SampleInput> = emptyList(),
    val gainDb: Float = 0f,
    val thresholdDb: Float? = null,
    val bars: Int? = null,
    val pattern: Boolean = false,
    val latch: Boolean = false,
    val phase: SamplePhase = SamplePhase.Ready,
    val maxSeconds: Int = dev.arc.ep133.features.SampleLimits.MAX_MONO_S,
    val lowSpace: Boolean = false,
    val usb: Boolean = false,
)

/**
 * A take on SAMPLE's review sheet before KEEP (an addition): recorded into
 * [pad] from [input], [pcm] interleaved at [channels] and [rate] ([frames]
 * of it, drawn as [peaks]), and why it ended ([end]). [start] and [length]
 * pick the part kept, in frames; [silenceAt] is where the sound starts
 * (null: all silent), which [trimSilence] starts it at; [normalize] raises
 * the part kept to 0 dB. Connected, [slot] is the slot it goes into, the
 * next free one ([nextFree]) unless another was picked; [offline], the slot
 * is the next free one when the EP-133 connects. [name] is what it is called
 * on the device; [latched] when it ran hands-free, for RETAKE. [file] holds
 * the take as recorded, in arc's samples folder, until it is kept or let go
 * of: arc closed meanwhile, the next start finds it there and puts it in
 * Takes, so a take waiting for KEEP is never lost.
 */
data class SampleReview(
    val pad: dev.arc.ep133.features.PhysicalPad,
    val input: SampleInput,
    val pcm: ShortArray,
    val channels: Int,
    val rate: Int,
    val frames: Int,
    val peaks: List<dev.arc.ep133.features.Peak>,
    val start: Int,
    val length: Int,
    val silenceAt: Int?,
    val normalize: Boolean,
    val trimSilence: Boolean,
    val slot: Int?,
    val nextFree: Int?,
    val offline: Boolean,
    val name: String,
    val end: dev.arc.ep133.features.SampleCapture.End,
    val latched: Boolean = false,
    val file: String? = null,
)

/** A press let go of sooner than this in SAMPLE mode is a tap: it plays the pad, as the device's "push again", and records nothing. */
internal const val SAMPLE_TAP_NS = 200_000_000L

/** The review's waveform, in columns: as many as EDIT's TRIM page draws. */
internal const val REVIEW_COLUMNS = 96

/** Where [pad]'s sound is set, or the words saying why it can't be ([editTarget]'s toast). */
internal sealed interface PadTargetOrWhy {
    data class Found(val target: dev.arc.ep133.features.PadTarget) : PadTargetOrWhy

    data class Why(val text: String) : PadTargetOrWhy
}

/**
 * Where [pad]'s sound is set in [m]: offline ([offline]: Live shows the last
 * read or the factory sounds, changed in arc only) or [connected] (the
 * mirror of this connection, read); not while PROJECT is [switching] the
 * project. Else why not: nothing to set it in, a project not read yet, or a
 * pad the EP-133 numbers otherwise than arc guessed.
 */
internal fun padTargetOrWhy(
    m: dev.arc.ep133.features.LiveMirror?,
    offline: Boolean,
    connected: Boolean,
    switching: Boolean,
    pad: dev.arc.ep133.features.PhysicalPad,
    now: Long = System.nanoTime(),
): PadTargetOrWhy {
    if (m == null || !offline && !connected) return PadTargetOrWhy.Why(dev.arc.ep133.text.MirrorText.EDIT_OFFLINE)
    // The pad's project is about to change: its sound is set once the switch lands.
    if (!offline && switching) return PadTargetOrWhy.Why(dev.arc.ep133.text.MirrorText.PROJECT_SWITCHING)
    m.target(pad)?.let { return PadTargetOrWhy.Found(it) }
    // A known project but no pad number: the device numbers its pads otherwise than arc guessed.
    val unknownPad = m.snapshot(now).activeProject != null && m.padNumber(pad) == null
    return PadTargetOrWhy.Why(if (unknownPad) dev.arc.ep133.text.MirrorText.EDIT_PRESS_FIRST else dev.arc.ep133.text.MirrorText.EDIT_NO_PROJECT)
}

/**
 * The inputs SAMPLE's −/+ offers, in the device's order: the phone's [mic]
 * (stereo only where it has a stereo mic, [micStereo]), RSP always, and the
 * EP-133 over [usb] (stereo as it offers). The mic and USB need the mic
 * permission, which the caller counts in.
 */
internal fun sampleInputs(mic: Boolean, micStereo: Boolean, usb: Boolean, usbStereo: Boolean): List<SampleInput> =
    SampleInput.ORDER.filter {
        when (it.source) {
            SampleSource.MIC -> mic && (!it.stereo || micStereo)
            SampleSource.RSP -> true
            SampleSource.USB -> usb && (!it.stereo || usbStereo)
        }
    }

/** [want] when it is offered, else RSP in the same mono or stereo: it always is, and needs no permission. */
internal fun pickSampleInput(want: SampleInput, inputs: List<SampleInput>): SampleInput =
    want.takeIf { it in inputs } ?: SampleInput(SampleSource.RSP, want.stereo)

/**
 * The longest take in frames at [rate], mono or [stereo]: the EP-133's
 * limit, less when [free] bytes (the device's free space, null while
 * unknown) hold less.
 */
internal fun sampleMaxFrames(stereo: Boolean, rate: Int, free: Double?): Int {
    val max = dev.arc.ep133.features.SampleLimits.maxFrames(stereo, rate)
    val fit = dev.arc.ep133.features.SampleLimits.framesThatFit(free, if (stereo) 2 else 1, rate) ?: max
    return minOf(max, fit)
}

/**
 * The review for a take: all of it kept, or from where the sound starts
 * with [trimSilence] (20 ms of the attack left in), [normalize] as it was
 * last chosen. [occupied] holds the device's slots in use, and gives the
 * next free one; null offline, where the slot is picked on upload.
 */
internal fun sampleReviewOf(
    pad: dev.arc.ep133.features.PhysicalPad,
    input: SampleInput,
    pcm: ShortArray,
    channels: Int,
    rate: Int,
    end: dev.arc.ep133.features.SampleCapture.End,
    latched: Boolean,
    name: String,
    normalize: Boolean,
    trimSilence: Boolean,
    occupied: Set<Int>?,
    columns: Int = REVIEW_COLUMNS,
): SampleReview {
    val frames = SampleEdit.frames(pcm, channels)
    val silenceAt = SampleEdit.leadingSilence(pcm, channels, guardFrames = rate / 50)
    val start = if (trimSilence) silenceAt ?: 0 else 0
    val next = occupied?.let { SampleUpload.nextFree(it, emptySet()) }
    return SampleReview(
        pad, input, pcm, channels, rate, frames, SampleEdit.peaks(pcm, channels, columns),
        start = start,
        length = frames - start,
        silenceAt = silenceAt,
        normalize = normalize,
        trimSilence = trimSilence,
        slot = next,
        nextFree = next,
        offline = occupied == null,
        name = name,
        end = end,
        latched = latched,
    )
}

/** [r] kept from frame [start] for [length] frames, both held inside the take (at least one frame). */
internal fun trimReview(r: SampleReview, start: Int, length: Int): SampleReview {
    val s = start.coerceIn(0, maxOf(0, r.frames - 1))
    val n = length.coerceIn(minOf(1, r.frames - s), r.frames - s)
    // Moved off where the sound starts, it no longer trims the silence.
    return r.copy(start = s, length = n, trimSilence = r.trimSilence && s == r.silenceAt)
}

/** [r] with Trim silence [on]: it starts where the sound does (or at 0, off), its end left where it was. */
internal fun withTrimSilence(r: SampleReview, on: Boolean): SampleReview {
    val end = r.start + r.length
    val start = if (on) r.silenceAt ?: r.start else 0
    val trimmed = trimReview(r, start, if (end > start) end - start else r.frames - start)
    return trimmed.copy(trimSilence = on)
}

/** What KEEP puts on the pad: the part kept, raised to 0 dB with [SampleReview.normalize]. */
internal fun reviewedPcm(r: SampleReview): ShortArray {
    val cut = SampleEdit.cut(r.pcm, r.channels, r.start, r.length)
    if (!r.normalize) return cut
    return SampleEdit.applyGain(cut, SampleEdit.normalizeGain(cut, r.channels, 0, SampleEdit.frames(cut, r.channels)))
}

/**
 * The free slot [step] free slots on from [from] (− down, + up), passing
 * over the [occupied] ones and staying put at either end; the first free
 * one from nothing. Null when every slot is in use.
 */
internal fun stepFreeSlot(occupied: Set<Int>, from: Int?, step: Int): Int? {
    var s = from ?: return SampleUpload.nextFree(occupied, emptySet())
    val dir = if (step < 0) -1 else 1
    repeat(kotlin.math.abs(step)) {
        var n = s + dir
        while (n in SampleUpload.FIRST_SLOT..SampleUpload.LAST_SLOT && n in occupied) n += dir
        if (n in SampleUpload.FIRST_SLOT..SampleUpload.LAST_SLOT) s = n
    }
    return s
}

/** What a pad pressed in SAMPLE mode does ([samplePress]). */
internal enum class SamplePress {
    /** Stops the hands-free take it is the pad of (or that take's count-in or wait for PLAY), at the press. */
    STOP,

    /** The same once the press is kept (an unsure press on the scrolling page): a scroll stops nothing. */
    STOP_WHEN_KEPT,

    /** Plays as ever beside the take going on: how a chord goes into RSP. */
    PLAY,

    /** LATCH on: a hands-free take into it. */
    LATCH,

    /** The same once the press is kept: a scroll latches nothing. */
    LATCH_WHEN_KEPT,

    /** Records into it while held. */
    HOLD,
}

/**
 * What a press on [pad] does in SAMPLE mode: [held] is the pad held to
 * record (null for none), [latched] the pad of a hands-free take, and
 * [handsFree] whether that take (or its count-in, or its wait for PLAY)
 * goes on; [going], whether any take does; [latch], LATCH; [unsure], a
 * press on the scrolling page that may yet be a scroll. A tap on the
 * hands-free take's pad stops it, as STOP does.
 */
internal fun samplePress(
    pad: dev.arc.ep133.features.PhysicalPad,
    held: dev.arc.ep133.features.PhysicalPad?,
    latched: dev.arc.ep133.features.PhysicalPad?,
    handsFree: Boolean,
    going: Boolean,
    latch: Boolean,
    unsure: Boolean,
): SamplePress = when {
    held == null && latched == pad && handsFree -> if (unsure) SamplePress.STOP_WHEN_KEPT else SamplePress.STOP
    going -> SamplePress.PLAY
    latch -> if (unsure) SamplePress.LATCH_WHEN_KEPT else SamplePress.LATCH
    else -> SamplePress.HOLD
}

/**
 * The hands-free take's pad ([latched]) once a take into [take] has come
 * in: let go of when it was that take's, unless a take is [going] again
 * (the same pad latched anew as the last take ended, before it came in).
 */
internal fun latchAfterTake(
    latched: dev.arc.ep133.features.PhysicalPad?,
    take: dev.arc.ep133.features.PhysicalPad,
    going: Boolean,
): dev.arc.ep133.features.PhysicalPad? = if (latched == take && !going) null else latched

/**
 * The slots a new take's review counts as in use: the device's
 * ([device]), and those the recordings kept and not yet up are going into
 * ([held], each as its review left it; null for the next free one then).
 */
internal fun slotsTaken(device: Set<Int>, held: Collection<Int?>): Set<Int> = device + held.filterNotNull()

/**
 * [pads] with the recordings on [t]'s pad taken off, but those [going] up
 * now: another sound was written onto the pad while connected, and they
 * would overwrite it when their turn came.
 */
internal fun withoutRecordingsOn(pads: OfflinePads, t: dev.arc.ep133.features.PadTarget, going: Set<String>): OfflinePads =
    OfflinePads(
        pads.list.filterNot {
            it.source == SoundSource.RECORDED && it.project == t.project && it.group == t.group && it.pad == t.pad && it.file !in going
        },
    )

/**
 * The offline changes a connected mirror shows: only the recordings on their
 * way up now, or whose upload failed in this connection ([uploading], by
 * file), so their pads play them meanwhile. The rest wait for the connect
 * question, and the device's pads are shown as they are.
 */
internal fun connectedLocal(pads: OfflinePads, uploading: Set<String>): OfflinePads =
    OfflinePads(pads.list.filter { it.source == SoundSource.RECORDED && it.file in uploading })

/**
 * The recordings [before] holds that [after] no longer does (another sound
 * picked for the pad, or a new take kept on it), but those [going] up now:
 * their files go to Takes, as nothing else would ever offer them again.
 */
internal fun recordingsLetGo(before: OfflinePads, after: OfflinePads, going: Set<String>): List<OfflinePad> {
    val kept = after.list.mapNotNullTo(HashSet()) { it.file }
    return before.list.filter { it.source == SoundSource.RECORDED && it.file != null && it.file !in kept && it.file !in going }
}

/** The physical pad [m] numbers [number] in [group]'s pad file, if any: for a recording's progress and toast. */
internal fun physicalPadOf(m: dev.arc.ep133.features.LiveMirror, group: Int, number: Int): dev.arc.ep133.features.PhysicalPad? =
    (0 until 12).map { dev.arc.ep133.features.PhysicalPad(group, it) }.firstOrNull { m.padNumber(it) == number }

class ArcController(
    private val context: Context,
    private val library: Library,
    private val midi: MidiConnector,
    val trafficLog: TrafficLog,
    private val scope: CoroutineScope,
    val player: dev.arc.ep133.audio.SoundPlayer = dev.arc.ep133.audio.SoundPlayer(context),
) {
    private val _state = MutableStateFlow(UiState(midiSupported = midi.supported))
    val state: StateFlow<UiState> = _state.asStateFlow()

    private val searchQuery = MutableStateFlow("")

    // ---------- live mirror (an addition) ----------
    private var liveEvents: kotlinx.coroutines.flow.SharedFlow<dev.arc.ep133.protocol.MidiEvent>? = null
    private var mirror: dev.arc.ep133.features.LiveMirror? = null
    private var mirrorJobs: List<Job> = emptyList()
    private var mirrorPushOff: (() -> Unit)? = null
    private var mirrorSession: Session? = null
    // Bumped by every stop, so an offline open still reading gives way to a later open or close.
    private var mirrorGen = 0
    private val mirrorPrefs by lazy { context.getSharedPreferences("mirror", Context.MODE_PRIVATE) }
    // The device's project, pads and names as Live last read them, shown while it is not connected.
    private val lastReadFile by lazy { java.io.File(context.filesDir, "live-last.json") }
    @Volatile
    private var lastRead: dev.arc.ep133.features.LiveSnapshot? = null
    private var lastReadLoaded = false
    // Live's pad changes made offline, in arc only, until the next connection puts them on the
    // device or "Reset pads" clears them. Not in Documents/arc: they belong to this install's read.
    private val offlinePadsFile by lazy { java.io.File(context.filesDir, "live-pads.json") }
    @Volatile
    private var offlinePads: OfflinePads? = null
    // Write putting them on the device: the changes are cleared only at its end, so a read meanwhile doesn't ask again.
    private var offlineWrite: Job? = null
    // EDIT's pad settings made offline, kept like the pad changes above (live-pad-settings.json).
    private val offlinePadSettingsFile by lazy { java.io.File(context.filesDir, "live-pad-settings.json") }
    @Volatile
    private var offlinePadSettings: dev.arc.ep133.features.OfflinePadSettings? = null
    // EDIT's pad settings as known: read from the EP-133, turned in arc, or (failing those) its pad
    // records, by (project, group, pad number). What a pad plays with on the phone. Main thread writes.
    @Volatile
    private var padSettings: Map<Triple<Int, Int, Int>, dev.arc.ep133.features.PadSettings> = emptyMap()
    private val _padEdit = MutableStateFlow<PadEditState?>(null)
    /** The pad settings EDIT's open sheet shows, if any. */
    val padEdit: StateFlow<PadEditState?> = _padEdit.asStateFlow()
    private var padEditJob: Job? = null
    // The newest settings turned and not yet on the device, and the one worker writing them.
    private var padPending: Triple<dev.arc.ep133.features.PadTarget, dev.arc.ep133.features.PadSettings, Long?>? = null
    private var padWriter: Job? = null
    // The settings last written (or read) per pad: what a failed write goes back to.
    private val padSaved = HashMap<Triple<Int, Int, Int>, dev.arc.ep133.features.PadSettings>()

    // Live's pads play on the phone: from arc's copy of the device's sounds, a backup, or the device.
    private val padSounds by lazy { dev.arc.ep133.features.PadSoundCache(java.io.File(context.filesDir, "pad-sounds")) }
    /** The device's sound list from Live's read (names and sizes), to tell which copies are current. */
    private var deviceSounds: Map<Int, dev.arc.ep133.protocol.SoundEntry> = emptyMap()
    /** Every sound name in the saved backups, for finding a pad's sound in one. */
    private var backupNames: List<dev.arc.ep133.features.NameEntry> = emptyList()
    /** The last backup a pad played from, opened, so the next taps are quick. */
    private var openPak: Pair<String, dev.arc.ep133.backup.Pak>? = null
    /** The factory sounds' projects with pads as Live shows them, by number, by the library entry they came from. */
    private var factorySnaps: Pair<String, Map<Int, dev.arc.ep133.features.LiveSnapshot>>? = null
    // PROJECT, connected: the project the newest tap asked for, until the device's read of it lands,
    // and the one worker writing it (taps meanwhile only move the target). Main thread only.
    private var projectTarget: Int? = null
    private var projectJob: Job? = null
    // PROJECT, offline: the view stepped to (null: the last read, else the pack's first project).
    // In memory only, and forgotten after a good read of the device.
    private var offlineProject: Int? = null
    // TEMPO: the device's MIDI clock, followed while Live listens to it (null offline). Fed on the
    // listening thread, asked by the click's.
    @Volatile
    private var clockFollow: dev.arc.ep133.features.ClockFollow? = null
    private val tapTempo = dev.arc.ep133.features.TapTempo()
    private val clickOn = MutableStateFlow(false)
    private val _beats = MutableStateFlow<dev.arc.ep133.features.Beat?>(null)
    /**
     * Each beat for TEMPO's light, with when it is heard ([dev.arc.ep133.features.Beat.at]):
     * the click's while it sounds, else the EP-133's from its clock.
     */
    val beats: StateFlow<dev.arc.ep133.features.Beat?> = _beats.asStateFlow()
    // −/+ and tap tempo change the tempo many times a second: library.json is written once it rests.
    private var tempoSync: Job? = null
    /** Live's own low-latency output, open while Live is on screen. */
    private val liveAudio = dev.arc.ep133.audio.LiveAudio(context, ::liveStarted, ::takeDone, ::liveOutput)
    /** The Live voices sounding on the phone ("live:<group>:<offset>" pads, "note:<midi>" keys), for the rings. */
    val liveKeys: StateFlow<Set<String>> get() = liveAudio.keys
    /** Live's TAKE key (Live tools), and its badge on the display line. */
    val rec: StateFlow<dev.arc.ep133.features.RecState> get() = liveAudio.rec
    /** Whether Live's sound goes to Bluetooth or a hearing aid, which plays late: its display line says so. */
    val liveWireless: StateFlow<Boolean> get() = liveAudio.wireless
    /** Live's output latency in milliseconds, about once a second while it is open; null when closed or not measurable ([dev.arc.ep133.audio.LiveAudio.latencyMs]). */
    val outputLatencyMs: StateFlow<Int?> get() = liveAudio.latencyMs
    /** The Bluetooth delay in milliseconds while it is made up for (wireless, the setting on), else null: the chip's words ([dev.arc.ep133.audio.LiveAudio.madeUpFor]). */
    val delayMadeUpFor: StateFlow<Int?> get() = liveAudio.madeUpFor
    // The debug screen's latency test: Live's press-to-sound times by engine.
    private val latencyTest = dev.arc.ep133.audio.LiveLatency()
    /** The latency test's times and engines, for the debug screen. */
    val latency: StateFlow<dev.arc.ep133.audio.LiveLatency.State> get() = latencyTest.state
    private val takeStore by lazy { dev.arc.ep133.data.Takes(java.io.File(context.filesDir, "takes")) }
    private val _takes = MutableStateFlow<List<dev.arc.ep133.data.TakeInfo>>(emptyList())
    /** Live's recorded takes, newest first. */
    val takes: StateFlow<List<dev.arc.ep133.data.TakeInfo>> = _takes.asStateFlow()
    // Live's pad samples decoded and ready ("slot:name"), so a press plays at once; the
    // least recently played go past PAD_MEMORY_BYTES. Main thread only.
    private val padMemory = SoundMemory<String>(PAD_MEMORY_BYTES)
    // Previews decoded once and played again at once: backup sounds and takes, by the player's key.
    private val previews = SoundMemory<String>(PREVIEW_MEMORY_BYTES)
    // A sample on its way to memory for a press, by the same key: the presses that come
    // meanwhile (a glissando over the keys) wait for that one load. Main thread only.
    private val padLoads = HashMap<String, kotlinx.coroutines.Deferred<PcmSound?>>()
    // The slot the background copy is reading and its sound once kept, so a press on it waits
    // for that read instead of reading it again. Main thread only.
    private var copying: Pair<Int, kotlinx.coroutines.CompletableDeferred<PcmSound?>>? = null
    // Counts the sounds presses read from the device, so the copy notices one it was about to read.
    private var pressReads = 0
    // When the latest Live press (pad or key) was made, for the late-load rule in startHeld.
    private var lastPressAt = 0L
    private var preloadGen = 0
    private var preloadJob: Job? = null
    // Bluetooth's delay is pointed out once a run.
    private var toldBluetooth = false
    // Bumped to end the copying loop (mirror closed, project changed).
    private var cacheGen = 0
    // Actions waiting for the background copy's current sound to finish; the loop lets them go first.
    private val deviceWaiters = MutableStateFlow(0)

    // ---------- settings (an addition) ----------
    private val settingsStore = dev.arc.ep133.data.SettingsStore(context)
    val settings: StateFlow<dev.arc.ep133.data.AppSettings> = settingsStore.settings

    /** Live's click: on or off (never kept), and the phone's tempo ([dev.arc.ep133.data.AppSettings.liveTempo]). */
    val metronome: StateFlow<MetronomeUi> =
        combine(clickOn, settings) { on, s -> MetronomeUi(on, s.liveTempo) }
            .stateIn(scope, kotlinx.coroutines.flow.SharingStarted.Eagerly, MetronomeUi(false, settings.value.liveTempo))

    @Volatile
    private var session: Session? = null
    private var openDeviceId: Int? = null
    private var abortCurrent: CancelSignal? = null
    // SAMPLE's upload going on while Live plays on: its Cancel (the transfer notification's).
    private var abortBackground: CancelSignal? = null
    private val _backgroundTask = MutableStateFlow<TaskUi?>(null)

    /**
     * A transfer that runs while Live plays on, with no progress sheet
     * (SAMPLE's uploads): the transfer service keeps arc alive for it, with
     * its notification and Cancel, as for a [UiState.task].
     */
    val backgroundTask: StateFlow<TaskUi?> = _backgroundTask.asStateFlow()
    /** The running task doesn't use the EP-133 (the factory download): unplugging it doesn't cancel it. */
    @Volatile
    private var deviceless = false
    /** An EP-133 plugged in during such a task waits to connect until it ends. Main thread only. */
    private var connectAfterTask = false
    private val toastIds = AtomicLong()

    /** Device description for the debug log export. */
    @Volatile
    var midiDescription: String = ""
        private set

    init {
        scope.launch {
            library.backups
                .catch { e -> toast(Strings.libraryFailed(e.message ?: e.toString()), error = true) }
                .collect { list ->
                    _state.update { it.copy(backups = list, libraryLoaded = true, spaceLeft = runCatching { library.spaceLeft() }.getOrNull()) }
                    refreshOffline()
                }
        }
        library.settings = {
            buildMap {
                mirrorPrefs.getString("learned", null)?.let { put("mirror.learned", it) }
                mirrorPrefs.getString("order", null)?.let { put("mirror.order", it) }
                putAll(settingsStore.toIndex())
            }
        }
        library.onExternalError = { msg -> scope.launch { toast(FeatureText.copyFailed(msg), error = true) } }
        // The debug screen's engine choice, from the next time Live opens its output.
        liveAudio.engine = settingsStore.settings.value.liveEngine
        scope.launch { liveAudio.engineInfo.collect { info -> info?.let(latencyTest::opened) } }
        // The click follows the tempo, also one library.json gives back (nothing while it is off).
        scope.launch { settings.collect { liveAudio.setClickTempo(it.liveTempo) } }
        scope.launch { loadTakes() }
        _state.update { it.copy(keysPad = savedKeysPad()) }
        scope.launch {
            library.names.catch { /* shown by the backups collector */ }.collect {
                backupNames = it
                openPak = null
                // Which of the device's sounds Live can play offline follows the backups.
                refreshOffline()
            }
        }
        scope.launch {
            val pads = loadOfflinePads()
            _state.update { it.copy(offlinePads = pads.size) }
        }
        scope.launch {
            runCatching { library.sweep() }
            // Whatever is missing from Documents/arc (a library from before it, or a failed copy) goes there.
            runCatching { library.reconcile() }
            _state.update { it.copy(folderPicked = library.folderPicked) }
            // Backups saved before search existed get their sound names indexed once.
            _state.update { it.copy(search = it.search.copy(indexing = true)) }
            runCatching { library.indexMissing() }
            _state.update { it.copy(search = it.search.copy(indexing = false)) }
        }
        scope.launch {
            combine(library.names, library.backups, searchQuery) { names, backups, q -> Triple(names, backups, q) }
                .catch { /* the library error is already shown by the backups collector */ }
                .collectLatest { (names, backups, q) ->
                    val results = withContext(Dispatchers.Default) { dev.arc.ep133.features.LibrarySearch.search(names, backups, q) }
                    _state.update { it.copy(search = it.search.copy(results = results)) }
                }
        }
        midi.watch(
            onAdded = { info ->
                // Agreed addition: connect on its own when an EP-133 is plugged in.
                if (midi.looksLikeEp(info) && settingsStore.settings.value.autoConnect) scope.launch {
                    delay(300)
                    val s = _state.value
                    if (session == null && !s.busy) {
                        connect()
                    } else if (session == null && deviceless && !connectAfterTask) {
                        // The factory download holds busy without the device: connect once it ends,
                        // if the EP-133 is still there and auto-connect still on (one waiter at most).
                        connectAfterTask = true
                        try {
                            _state.first { !it.busy }
                        } finally {
                            connectAfterTask = false
                        }
                        if (session == null && settingsStore.settings.value.autoConnect && midi.find() != null) connect()
                    }
                }
            },
            onRemoved = { info ->
                scope.launch {
                    if (info.id == openDeviceId && session != null) {
                        trafficLog.note("device removed")
                        // A task that doesn't use the device (the factory download) goes on.
                        if (!deviceless) abortCurrent?.cancel()
                        dropSession(Strings.DISCONNECTED)
                    }
                }
            },
        )
    }

    // ---------- toast ----------

    fun toast(text: String, error: Boolean = false, action: String? = null, onAction: (() -> Unit)? = null) {
        _state.update { it.copy(toast = ToastMsg(toastIds.incrementAndGet(), text, error, action, onAction)) }
    }

    /**
     * A toast, unless the same one is up already: a glissando or a chord over
     * a sound that can't play says so once, rather than once per key.
     */
    fun toastOnce(text: String, error: Boolean = false) {
        if (_state.value.toast?.text != text) toast(text, error)
    }

    fun dismissToast(id: Long) {
        _state.update { if (it.toast?.id == id) it.copy(toast = null) else it }
    }

    // ---------- device ----------

    suspend fun refreshDevice() {
        val s = session ?: return
        val storage = Device.getStorage(s)
        val sounds = Device.listSounds(s)
        val projects = Device.listProjects(s)
        val info = s.info ?: return
        if (session !== s) return
        _state.update { it.copy(device = DeviceSummary(info, storage, sounds.size, projects.size)) }
    }

    private fun dropSession(message: String?) {
        session?.close()
        session = null
        openDeviceId = null
        stopMirror()
        liveEvents = null
        if (_state.value.mirror != null) scope.launch { openOfflineMirror() }
        // Recordings waiting to upload stay as offline changes, asked about at the next connection.
        sampleQueue.clear()
        samplesFailed.clear()
        showOfflineCount()
        playToken++ // a device sound still downloading must not start after the device is gone
        if (player.playing.value?.startsWith("device:") == true) player.stop()
        // A question about offline pad changes goes with the device; they are kept, and asked about at the next read.
        _state.update { it.copy(connected = false, device = null, browser = BrowserUi(), diff = null, offlinePrompt = null) }
        if (message != null) toast(message, error = true)
    }

    /** The Connect / Disconnect key. */
    fun connect(): Job = scope.launch {
        if (session != null) {
            trafficLog.note("disconnect")
            dropSession(null)
            return@launch
        }
        if (_state.value.busy) return@launch
        _state.update { it.copy(busy = true) }
        try {
            val open = midi.open()
            openDeviceId = open.deviceId
            midiDescription = "${open.portName}, id ${open.deviceId}"
            trafficLog.note("connect $midiDescription")
            val s = Session(LoggingTransport(open.transport, trafficLog))
            session = s
            liveEvents = open.transport.events
            _state.update { it.copy(connected = true) }
            s.handshake()
            refreshDevice()
        } catch (e: Throwable) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            dropSession(e.message ?: e.toString())
        } finally {
            _state.update { it.copy(busy = false) }
        }
    }

    // ---------- long-running tasks ----------

    /** [device] false: a task that doesn't use the EP-133 (a download), which only waits for nothing else to run. */
    private suspend fun <T> runTask(
        title: String,
        wait: Boolean = false,
        device: Boolean = true,
        fn: suspend (onProgress: (Progress) -> Unit, signal: CancelSignal) -> T,
    ): T? {
        if (if (device) !(if (wait) awaitDeviceWaiting() else awaitDevice()) else _state.value.busy) return null
        _state.update { it.copy(busy = true, task = TaskUi(title, "", 0.0, cancelling = false)) }
        val signal = CancelSignal()
        abortCurrent = signal
        deviceless = !device
        ContextCompat.startForegroundService(context, Intent(context, TransferService::class.java))
        val onProgress: (Progress) -> Unit = { p ->
            _state.update { st ->
                val t = st.task ?: return@update st
                st.copy(task = t.copy(fraction = p.fraction, label = if (p.label.isNotEmpty()) p.label else t.label))
            }
        }
        return try {
            fn(onProgress, signal)
        } catch (e: Throwable) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            if (e is CancelledError) toast(Strings.CANCELLED) else toast(e.message ?: e.toString(), error = true)
            null
        } finally {
            abortCurrent = null
            deviceless = false
            // The service stops itself when it sees the task end. Stopping it from
            // here could beat its startForeground() call, which Android punishes.
            _state.update { it.copy(busy = false, task = null) }
        }
    }

    /** Cancel stops between items, like the web version; with no task, it stops SAMPLE's upload ([backgroundTask]). */
    fun cancelTask() {
        abortCurrent?.let { a ->
            a.cancel()
            _state.update { st -> st.task?.let { st.copy(task = it.copy(cancelling = true, label = Strings.STOPPING)) } ?: st }
            return
        }
        val b = abortBackground ?: return
        b.cancel()
        _backgroundTask.update { it?.copy(cancelling = true, label = Strings.STOPPING) }
    }

    private fun fmtDate(ms: Long): String =
        Format.date(ms, DateFormat.getBestDateTimePattern(Locale.getDefault(), "MMMdjmm"))

    fun fmtDay(ms: Long): String =
        Format.date(ms, DateFormat.getBestDateTimePattern(Locale.getDefault(), "MMMdyyyy"))

    fun fmtDateTime(ms: Long): String = fmtDate(ms)

    fun backup(): Job = scope.launch {
        val s = session ?: return@launch
        val saved = runTask(Strings.BACKING_UP) { onProgress, signal ->
            val r = Backup.backupDevice(s, onProgress, signal)
            val d = withContext(Dispatchers.Default) { Paks.describe(Paks.open(r.bytes)) }
            library.save(
                record(
                    title = "Backup ${fmtDate(r.summary.createdAt)}",
                    createdAt = r.summary.createdAt,
                    source = "device",
                    fileName = null,
                    device = BackupDevice(r.summary.device.product, r.summary.device.sku, r.summary.device.serial, r.summary.device.osVersion),
                    d = d,
                ),
                r.bytes,
                d.soundNames,
            )
        }
        if (saved != null) {
            _state.update { it.copy(freshId = saved.record.id) }
            toastSaved(Strings.saved(saved.record.soundCount, saved.record.projectCount) + pruneOld(saved.record.id), saved.copyError)
        }
        refreshAll(quiet = true) // refreshDevice().catch(() => {})
    }

    fun restore(b: BackupRecord, sel: RestoreSelection): Job = scope.launch {
        val s = session ?: return@launch
        val done = runTask(Strings.RESTORING) { onProgress, signal ->
            val bytes = library.bytes(b.id)
            val pak = withContext(Dispatchers.Default) { Paks.open(bytes) }
            Backup.restorePak(s, pak, sel.slots, sel.projects, onProgress, signal)
        }
        if (done != null) toast(Strings.restored(done.sounds, done.projects))
        refreshAll(quiet = true) // refreshDevice().catch(() => {})
    }

    // ---------- device browser, sample upload, compare (additions) ----------

    /**
     * Runs a short device read that must not overlap a transfer (the device
     * handles one conversation at a time). Returns null if something else is busy.
     */
    private suspend fun <T> exclusive(reading: String, quiet: Boolean = false, wait: Boolean = false, block: suspend (Session) -> T): T? {
        val s = session ?: return null
        if (!(if (wait) awaitDeviceWaiting() else awaitDevice())) return null
        _state.update { it.copy(busy = true, browser = it.browser.copy(reading = reading)) }
        return try {
            block(s)
        } catch (e: Throwable) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            if (!quiet) toast(e.message ?: e.toString(), error = true)
            null
        } finally {
            _state.update { it.copy(busy = false, browser = it.browser.copy(reading = null)) }
        }
    }

    /**
     * Whether the device is free for an action: not while another one runs.
     * Live's background copy only makes it wait for the sound being read (a
     * read can't be cut short without the session falling out of step).
     * Runs on the main thread, and the caller marks [UiState.busy] straight
     * after, so the copy can't slip in between.
     */
    private suspend fun awaitDevice(): Boolean {
        if (_state.value.busy) return false
        if (_state.value.backgroundRead) {
            deviceWaiters.update { it + 1 }
            try {
                _state.first { !it.backgroundRead }
            } finally {
                deviceWaiters.update { it - 1 }
            }
        }
        return !_state.value.busy
    }

    /**
     * [awaitDevice] for an action the user already chose (a pick, an UNDO):
     * it waits out whatever holds the device, such as Live's read when the
     * app comes back from the file picker, rather than drop the action.
     * False only when the connection goes meanwhile.
     */
    private suspend fun awaitDeviceWaiting(): Boolean {
        val s = session ?: return false
        while (session === s) {
            if (awaitDevice()) return session === s
            _state.first { !it.busy || session !== s }
        }
        return false
    }

    fun refreshBrowser(): Job = scope.launch { refreshAll(quiet = false) }

    /**
     * Reads storage, sounds and projects once and updates both the device
     * panel and the browser. Runs inside the busy guard, so it never overlaps
     * another device operation (the web version's refreshDevice after a task
     * did not need this: it had no other screens that read the device).
     */
    private suspend fun refreshAll(quiet: Boolean) {
        val c = exclusive("contents", quiet) { s ->
            DeviceBrowser.contents(s).also { c ->
                val info = s.info
                if (session === s && info != null) {
                    _state.update { it.copy(device = DeviceSummary(info, c.storage, c.sounds.size, c.projects.size)) }
                }
            }
        } ?: return
        _state.update { st ->
            // Keep a slot's details only if the slot still holds the same sound;
            // project contents may have changed with any restore, so read them again.
            val before = st.browser.contents?.sounds?.associateBy { it.slot }.orEmpty()
            val now = c.sounds.associateBy { it.slot }
            val details = st.browser.details.filterKeys { slot -> now[slot] != null && now[slot] == before[slot] }
            st.copy(browser = st.browser.copy(contents = c, details = details, projectSounds = emptyMap(), projectPads = emptyMap()))
        }
    }

    fun loadSoundDetails(slot: Int): Job = scope.launch {
        val d = exclusive("slot:$slot") { DeviceBrowser.soundDetails(it, slot) } ?: return@launch
        _state.update { it.copy(browser = it.browser.copy(details = it.browser.details + (slot to d))) }
    }

    fun loadProjectSounds(project: Int): Job = scope.launch {
        val layout = exclusive("project:$project") { DeviceBrowser.projectLayout(it, project) } ?: return@launch
        _state.update {
            it.copy(
                browser = it.browser.copy(
                    projectSounds = it.browser.projectSounds + (project to layout.slots),
                    projectPads = it.browser.projectPads + (project to layout.pads),
                ),
            )
        }
    }

    /** Reads picked files and proposes a free slot for each. */
    fun pickForUpload(uris: List<android.net.Uri>): Job = scope.launch {
        if (uris.isEmpty()) return@launch
        val occupied = _state.value.browser.contents?.occupiedSlots ?: emptySet()
        val taken = HashSet<Int>()
        val items = ArrayList<UploadDraftItem>()
        for (uri in uris) {
            val (fileName, _) = withContext(Dispatchers.IO) { dev.arc.ep133.files.Files.describe(context, uri) }
            val bytes = try {
                withContext(Dispatchers.IO) { dev.arc.ep133.files.Files.read(context, uri) }
            } catch (e: Throwable) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                items.add(UploadDraftItem(fileName, SampleUpload.nameFor(fileName), null, null, e.message ?: e.toString()))
                continue
            }
            items.add(draftItem(fileName, bytes, occupied, taken))
        }
        _state.update { it.copy(browser = it.browser.copy(draft = items)) }
    }

    /** One file for the upload sheet, with the next free slot (marked [taken]); flagged when it isn't a usable WAV. */
    private suspend fun draftItem(fileName: String, bytes: ByteArray, occupied: Set<Int>, taken: MutableSet<Int>): UploadDraftItem = try {
        val w = withContext(Dispatchers.Default) { Wav.decode(bytes) } // fail early on files that are not usable WAVs
        val slot = SampleUpload.nextFree(occupied, taken)
        if (slot != null) taken.add(slot)
        UploadDraftItem(fileName, SampleUpload.nameFor(fileName), slot, bytes, null, sampleRate = w.sampleRate)
    } catch (e: Throwable) {
        if (e is kotlinx.coroutines.CancellationException) throw e
        UploadDraftItem(fileName, SampleUpload.nameFor(fileName), null, null, e.message ?: e.toString())
    }

    fun setDraftSlot(index: Int, slot: Int?) {
        _state.update { st ->
            val d = st.browser.draft ?: return@update st
            st.copy(browser = st.browser.copy(draft = d.mapIndexed { i, item -> if (i == index) item.copy(slot = slot) else item }))
        }
    }

    fun setDraftTrim(index: Int, trim: IntRange?) {
        _state.update { st ->
            val d = st.browser.draft ?: return@update st
            st.copy(browser = st.browser.copy(draft = d.mapIndexed { i, item -> if (i == index) item.copy(trim = trim) else item }))
        }
    }

    /**
     * Bumped by every play request and every stop. A request that took a while
     * (a download, a decode) plays only if nothing stopped or replaced it
     * meanwhile, so leaving a screen or the app can't start a sound later.
     * Only touched from [scope], which runs on the main thread.
     */
    private var playToken = 0L

    /**
     * Plays a sound on the device (an addition to the web version): from Live's
     * copy in memory or arc's copy on the phone when either is the device's
     * current sound, else downloaded. A download plays first and is kept after,
     * so Live (and the next play) needn't read it again.
     */
    fun playDeviceSound(slot: Int): Job = scope.launch {
        val token = ++playToken
        val key = "device:$slot"
        val listed = _state.value.browser.contents?.sounds?.firstOrNull { it.slot == slot } ?: deviceSounds[slot]
        if (listed != null) {
            val held = padMemory[memoryKey(slot, listed.name)]
                ?: withContext(Dispatchers.IO) {
                    if (padSounds.fresh(slot, listed.name, listed.size)) padSounds.get(slot, listed.name) else null
                }?.let { wav -> runCatching { withContext(Dispatchers.Default) { PcmSound.ofWav(wav) } }.getOrNull() }
            if (held != null) {
                if (token == playToken) startSound(key, held)
                return@launch
            }
        }
        // Played straight from the list: read the channels and rate first when they aren't known yet.
        val d = _state.value.browser.details[slot]
            ?: exclusive("play:$slot") { DeviceBrowser.soundDetails(it, slot) }
                ?.also { d -> _state.update { it.copy(browser = it.browser.copy(details = it.browser.details + (slot to d))) } }
            ?: return@launch
        if (token != playToken) return@launch
        // Not cancelled on stop: an interrupted download would leave the session out of step.
        val pcm = exclusive("play:$slot") { s -> dev.arc.ep133.protocol.Fs.download(s, slot) } ?: return@launch
        if (token == playToken) startSound(key, pcm, d.channels.toInt(), d.sampleRate.toInt())
        // Live can play it later without the device; kept after the sound started, not awaited.
        val known = _state.value.browser.contents?.sounds?.firstOrNull { it.slot == slot } ?: deviceSounds[slot]
        if (known != null) scope.launch { keepPadSound(slot, known.name, known.size, pcm, d.channels, d.sampleRate) }
    }

    /**
     * Plays a sound from EDIT's pad sheet: from the device's list
     * ([SoundSource.DEVICE]) or the factory pack's. Connected, the device's
     * sounds play as [playDeviceSound] does. Offline, from what arc has: the
     * sound in memory, arc's copy or a backup (the pack first for a factory
     * sound), decoded once for a quick replay; under the player's key
     * "device:N" or "factory:N". Nothing found: a toast says so.
     */
    fun playLiveSound(slot: Int, source: SoundSource): Job {
        if (source == SoundSource.DEVICE && session != null && _state.value.device != null) return playDeviceSound(slot)
        return scope.launch {
            val token = ++playToken
            val key = "${source.id}:$slot"
            val sounds = _state.value.mirror?.offlineSounds
            val name = (if (source == SoundSource.FACTORY) sounds?.factory else sounds?.device)?.firstOrNull { it.slot == slot }?.name ?: return@launch
            val previewKey = "$PAD_PREVIEW$key:${name.trim().lowercase()}"
            val sound = previews[previewKey] ?: padMemory[memoryKey(slot, name)]
                ?: try {
                    loadPadAudio(slot, name, source == SoundSource.FACTORY)?.also { previews.put(previewKey, it) }
                } catch (e: Throwable) {
                    if (e is kotlinx.coroutines.CancellationException) throw e
                    toast(e.message ?: e.toString(), error = true)
                    return@launch
                }
            if (sound == null) {
                toast(dev.arc.ep133.text.MirrorText.NO_COPY)
                return@launch
            }
            if (token == playToken) startSound(key, sound)
        }
    }

    /**
     * Plays on the phone and says so when nothing will be heard: a sound that
     * can't play, or media volume at zero. Where the sound went is noted in the
     * debug log, for reports of a sound that plays but isn't heard.
     */
    private fun startSound(key: String, pcm: ByteArray, channels: Int, sampleRate: Int) =
        played(key, player.play(key, pcm, channels, sampleRate), pcm.size / (2.0 * channels) / sampleRate, channels, sampleRate)

    /** [startSound] for a sound already decoded. */
    private fun startSound(key: String, sound: PcmSound) =
        played(key, player.play(key, sound), sound.pcm.size.toDouble() / sound.channels / sound.sampleRate, sound.channels, sound.sampleRate)

    private fun played(key: String, result: dev.arc.ep133.audio.PlayResult, seconds: Double, channels: Int, sampleRate: Int) {
        when (val r = result) {
            is dev.arc.ep133.audio.PlayResult.Failed -> {
                trafficLog.note("play $key failed: ${r.reason}")
                toast(FeatureText.cantPlay(r.reason), error = true)
            }
            is dev.arc.ep133.audio.PlayResult.Started -> {
                trafficLog.note(FeatureText.playNote(key, sampleRate, channels, seconds, r.route))
                if (player.volumeOff()) toast(FeatureText.VOLUME_OFF)
            }
        }
    }

    // ---------- backup contents (additions) ----------

    fun openContents(b: BackupRecord): Job = scope.launch {
        if (_state.value.contents?.backupId == b.id && _state.value.contents?.pak != null) return@launch
        _state.update { it.copy(contents = ContentsUi(b.id, null)) }
        val result = runCatching {
            val bytes = library.bytes(b.id)
            withContext(Dispatchers.Default) {
                val pak = Paks.open(bytes)
                val durations = LinkedHashMap<Int, Double>()
                for ((slot, snd) in pak.sounds) {
                    val w = runCatching { Wav.decode(snd.wav) }.getOrNull() ?: continue
                    durations[slot] = SampleTrim.seconds(SampleTrim.frames(w.pcm, w.channels), w.sampleRate)
                }
                pak to durations
            }
        }
        _state.update { st ->
            if (st.contents?.backupId != b.id) st
            else st.copy(
                contents = ContentsUi(
                    b.id,
                    result.getOrNull()?.first,
                    result.exceptionOrNull()?.let { it.message ?: it.toString() },
                    result.getOrNull()?.second ?: emptyMap(),
                ),
            )
        }
    }

    fun closeContents() {
        stopPlayback()
        _state.update { it.copy(contents = null) }
    }

    /** Plays a sound from an opened backup; no device needed. Decoded once, so a replay starts at once. */
    fun playBackupSound(slot: Int): Job = scope.launch {
        val token = ++playToken
        val c = _state.value.contents ?: return@launch
        val snd = c.pak?.sounds?.get(slot) ?: return@launch
        val key = "backup:${c.backupId}:$slot"
        try {
            val sound = previews[key] ?: withContext(Dispatchers.Default) { PcmSound.ofWav(snd.wav) }.also { previews.put(key, it) }
            if (token != playToken || _state.value.contents?.backupId != c.backupId) return@launch
            startSound(key, sound)
        } catch (e: Throwable) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            toast(e.message ?: e.toString(), error = true)
        }
    }

    /** Compares two saved backups, the older one as the starting point (an addition). */
    fun compareBackups(a: BackupRecord, b: BackupRecord): Job = scope.launch {
        val (old, new) = if (b.createdAt < a.createdAt) b to a else a to b
        val current = _state.value.pakCompare
        if (current != null && current.oldId == old.id && current.newId == new.id && (current.result != null || current.error == null)) return@launch
        _state.update { it.copy(pakCompare = PakCompareUi(old.id, new.id)) }
        val ui = try {
            val oldBytes = library.bytes(old.id)
            val newBytes = library.bytes(new.id)
            withContext(Dispatchers.Default) {
                val o = Paks.open(oldBytes)
                val n = Paks.open(newBytes)
                PakCompareUi(
                    old.id, new.id,
                    result = dev.arc.ep133.features.PakCompare.compare(o, n),
                    oldNames = o.sounds.mapValues { it.value.name },
                    newNames = n.sounds.mapValues { it.value.name },
                )
            }
        } catch (e: Throwable) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            PakCompareUi(old.id, new.id, error = e.message ?: e.toString())
        }
        _state.update { st ->
            val c = st.pakCompare
            if (c == null || c.oldId != old.id || c.newId != new.id) st else st.copy(pakCompare = ui)
        }
    }

    fun closeCompare() {
        _state.update { it.copy(pakCompare = null) }
    }

    /**
     * Starts the live mirror: reads the sound names, the active project and
     * its pads (the reads the browser already makes), then listens to MIDI
     * and pad pushes. It writes only when asked: a pad's sound in EDIT, and
     * the active project when PROJECT is tapped ([stepProject]).
     */
    fun openMirror(): Job {
        val open = ++liveOpens
        return scope.launch { openMirrorNow() }.also { job ->
            // Live is back (read, or found unreadable): a take kept meanwhile goes on ([awaitLive]).
            job.invokeOnCompletion { if (open == liveOpens) livePaused.value = false }
        }
    }

    private suspend fun openMirrorNow() {
        // Already running for this connection (opened twice): keep it.
        if (mirror != null && mirrorSession != null && mirrorSession === session) return
        stopMirror()
        val s = session
        val events = liveEvents
        // Not connected (or still connecting): the last read, if there is one.
        if (s == null || events == null || _state.value.device == null) {
            openOfflineMirror()
            return
        }
        val m = dev.arc.ep133.features.LiveMirror(
            learned = loadLearned(),
            padOrder = savedPadOrder(),
            onLearned = ::saveLearned,
        )
        mirror = m
        mirrorSession = s
        val follow = dev.arc.ep133.features.ClockFollow()
        clockFollow = follow
        _state.update { it.copy(mirror = MirrorUi(m.snapshot(System.nanoTime()), loading = true)) }
        // Listen first, so nothing played while reading is missed. Each change marks the
        // mirror dirty and wakes the publishing loop below.
        val dirty = java.util.concurrent.atomic.AtomicBoolean(true)
        val news = kotlinx.coroutines.channels.Channel<Unit>(kotlinx.coroutines.channels.Channel.CONFLATED)
        val listen = scope.launch(Dispatchers.Default) {
            events.collect {
                m.onMidi(it)
                // TEMPO's light: the device's beats while the click is off (on, the click's light it, as heard).
                follow.onMidi(it)?.let { b -> if (!liveAudio.clicking) _beats.value = b }
                dirty.set(true)
                news.trySend(Unit)
            }
        }
        mirrorPushOff = s.onPush { f ->
            val fid = dev.arc.ep133.features.PadPush.parse(f) ?: return@onPush
            m.onPadPush(fid, System.nanoTime())
            dirty.set(true)
            news.trySend(Unit)
            // Another project on the device: read its pads.
            if (fid.project != m.snapshot(System.nanoTime()).activeProject) loadMirrorProject(m, fid.project)
        }
        // A new state when something came in, at most one a frame (on the screen's frame clock,
        // so it lands in the next frame). Idle, it sleeps until the next news, waking only to let
        // time-based changes through (released pads pruned, a tempo gone stale). An unchanged
        // state (the tempo as the display shows it) is the last one again, so StateFlow drops it
        // and nothing redraws. The fade itself runs on the screen's frame clock.
        val tick = scope.launch(androidx.compose.ui.platform.AndroidUiDispatcher.Main) {
            var shown: dev.arc.ep133.features.MirrorState? = null
            while (true) {
                if (!dirty.get()) {
                    val wait = shown?.let { mirrorSettlesIn(it, System.nanoTime()) }
                    if (wait == null) news.receive() else kotlinx.coroutines.withTimeoutOrNull(wait) { news.receive() }
                }
                androidx.compose.runtime.withFrameNanos { }
                dirty.set(false)
                val st = shownMirror(shown, m.snapshot(System.nanoTime()))
                shown = st
                _state.update { cur -> cur.mirror?.let { cur.copy(mirror = it.copy(state = st)) } ?: cur }
            }
        }
        mirrorJobs = listOf(listen, tick)
        // The names and pads are read once. If the device is busy (a transfer, or the
        // read of a mirror opened just before), wait for it rather than give up.
        // exclusive() also gives null when the read fails (the error is shown), so a few tries at most.
        var ok: Boolean? = null
        var tries = 0
        while (mirror === m && ok == null && session === s && tries++ < 5) {
            _state.first { !it.busy || it.mirror == null }
            if (mirror !== m) break
            ok = exclusive("mirror", quiet = tries > 1) { ss ->
                val c = DeviceBrowser.contents(ss)
                setLiveSounds(m, c.sounds)
                val project = runCatching { Device.activeProject(ss) }.getOrNull()
                val layout = project?.let { p -> runCatching { DeviceBrowser.projectLayout(ss, p) }.getOrNull() }
                m.setProject(project, layout?.pads ?: emptyList())
                padsRead(project, layout)
                true
            }
        }
        if (mirror === m) {
            dirty.set(true)
            news.trySend(Unit)
            if (ok == true) {
                // Offline next time starts again from the last read.
                offlineProject = null
                // Recordings still uploading (or whose upload failed) play from arc meanwhile.
                samplesShown().takeIf { it.isNotEmpty() }?.let { m.setLocal(connectedLocal(loadOfflinePads(), it)) }
                offerOfflinePads(s)
                saveLastRead(m)
                preloadPads(m)
                copyPadSounds(m, s)
            }
            _state.update { cur -> cur.mirror?.let { cur.copy(mirror = it.copy(loading = false, state = m.snapshot(System.nanoTime()))) } ?: cur }
            if (ok == null) _state.update { cur -> cur.mirror?.let { cur.copy(mirror = it.copy(loading = false)) } ?: cur }
        }
    }

    /**
     * Live without the device: the pads and sample names of the last read,
     * marked offline, or of a factory project (never read, or PROJECT
     * stepped to it: [offlineProject]). Nothing lights, as nothing is
     * listened to.
     */
    private suspend fun openOfflineMirror() {
        stopMirror()
        val gen = mirrorGen
        val lastRead = loadLastRead()
        val factory = factorySnapshots()
        if (gen != mirrorGen) return
        val views = dev.arc.ep133.features.ProjectStep.offlineViews(lastRead?.activeProject, factory.keys)
        // The view PROJECT stepped to; else the last read; never read, the factory sounds' first project.
        val snap = when (val n = offlineProject?.takeIf { it in views }) {
            null -> lastRead ?: factory[FactorySounds.PROJECT] ?: factory.values.firstOrNull()
            lastRead?.activeProject -> lastRead
            else -> factory[n]
        }
        val fromRead = snap != null && snap === lastRead
        if (snap == null || session != null && _state.value.device != null) {
            if (snap == null) _state.update { it.copy(mirror = notConnectedMirror()) }
            return
        }
        // Nothing can be learned without the device: pads unlearned are numbered from the top, and nothing is saved.
        val m = dev.arc.ep133.features.LiveMirror(
            learned = dev.arc.ep133.features.LearnedLinks.offline(loadLearned()),
            padOrder = savedPadOrder(),
            onLearned = {},
        )
        m.load(snap)
        // The pads changed offline show and play their new sounds; the lists for EDIT's pad sheet.
        m.setLocal(loadOfflinePads())
        // And with the settings turned offline.
        padSettings = loadOfflinePadSettings().byPad()
        padSaved.clear()
        val sounds = offlineSounds(lastRead, if (fromRead) SoundSource.DEVICE else SoundSource.FACTORY)
        if (gen != mirrorGen || session != null && _state.value.device != null) return
        mirror = m
        preloadPads(m)
        // Every factory project's line is FACTORY (refreshOffline goes by it); offlineNote names the project.
        val offline = lastRead?.takeIf { fromRead }?.let { dev.arc.ep133.text.MirrorText.lastSeen(fmtDateTime(it.savedAt)) } ?: dev.arc.ep133.text.MirrorText.FACTORY
        _state.update {
            it.copy(mirror = MirrorUi(m.snapshot(System.nanoTime()), loading = false, offline = offline, offlineSounds = sounds, offlineProjects = views))
        }
    }

    /**
     * The lists Live offers offline ([OfflineSounds]): the device's sounds
     * from [lastRead], dimmed where arc has neither a copy, a backup nor the
     * factory pack's sound, and the factory pack's; [base] the view's own.
     */
    private suspend fun offlineSounds(lastRead: dev.arc.ep133.features.LiveSnapshot?, base: SoundSource): OfflineSounds {
        val factory = factorySnapshots().values.firstOrNull()
        val unavailable = lastRead?.let { r ->
            val copies = withContext(Dispatchers.IO) { runCatching { padSounds.copies() }.getOrDefault(emptyMap()) }
            val packSaved = FactorySounds.inLibrary(_state.value.backups) != null
            withContext(Dispatchers.Default) { dev.arc.ep133.features.PadSounds.unavailable(r.names, copies, backupNames, packSaved) }
        }
        return offlineSoundsOf(lastRead, factory, unavailable.orEmpty(), base)
    }

    /**
     * What Live can show from the factory sounds while no EP-133 is
     * connected: each of their projects with pads, by number, in order;
     * none when the library doesn't have them (FactorySounds).
     */
    private suspend fun factorySnapshots(): Map<Int, dev.arc.ep133.features.LiveSnapshot> {
        val b = FactorySounds.inLibrary(_state.value.backups) ?: return emptyMap()
        factorySnaps?.takeIf { it.first == b.id }?.let { return it.second }
        val snaps = try {
            val pak = pakOf(b.id)
            withContext(Dispatchers.Default) {
                FactorySounds.projects(pak).mapNotNull { p -> FactorySounds.snapshot(pak, b.createdAt, p)?.let { p to it } }.toMap()
            }
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            emptyMap()
        }
        factorySnaps = b.id to snaps
        return snaps
    }

    /**
     * Live without a device follows the library: it shows the factory sounds
     * once they are in it, and stops when they are deleted (it opens offline
     * again); otherwise the offline lists are made again, as which sounds
     * arc can play changes with the backups, the pack and the copies.
     */
    private fun refreshOffline() {
        val st = _state.value
        val mi = st.mirror ?: return
        if (session != null && st.device != null) return
        val has = FactorySounds.inLibrary(st.backups) != null
        if (has && mi.error == dev.arc.ep133.text.MirrorText.NOT_CONNECTED || !has && mi.offline == dev.arc.ep133.text.MirrorText.FACTORY) {
            scope.launch { openOfflineMirror() }
            return
        }
        val m = mirror ?: return
        if (mirrorSession != null || mi.offlineSounds == null) return
        val gen = mirrorGen
        scope.launch {
            val lastRead = loadLastRead()
            val sounds = offlineSounds(lastRead, mi.offlineSounds.base)
            // The pack saved or deleted under the last read: PROJECT gets its projects, or greys out.
            val views = dev.arc.ep133.features.ProjectStep.offlineViews(lastRead?.activeProject, factorySnapshots().keys)
            if (gen == mirrorGen && mirror === m) {
                _state.update { cur -> cur.mirror?.let { cur.copy(mirror = it.copy(offlineSounds = sounds, offlineProjects = views)) } ?: cur }
            }
        }
    }

    private suspend fun loadLastRead(): dev.arc.ep133.features.LiveSnapshot? {
        if (!lastReadLoaded) {
            val read = withContext(Dispatchers.IO) {
                runCatching { dev.arc.ep133.features.LiveSnapshot.fromJson(lastReadFile.readText()) }.getOrNull()
            }
            // A read saved meanwhile is newer than the file was.
            if (!lastReadLoaded) lastRead = read
            lastReadLoaded = true
        }
        return lastRead
    }

    private fun saveLastRead(m: dev.arc.ep133.features.LiveMirror) {
        val snap = m.saved(System.currentTimeMillis())
        // A read that found nothing (no project, no names) would only hide a useful one.
        if (snap.names.isEmpty() && snap.groups.isEmpty()) return
        writeLastRead(snap)
        // And to Documents/arc, so it comes back after a reinstall.
        scope.launch { library.saveLive(snap.toJson()) }
    }

    /** Live's last read from the folder after a reinstall, unless this install has a newer one. */
    private suspend fun restoreLastRead(json: String?) {
        val snap = json?.let(dev.arc.ep133.features.LiveSnapshot::fromJson) ?: return
        val cur = loadLastRead()
        if (cur != null && cur.savedAt >= snap.savedAt) return
        writeLastRead(snap)
    }

    private fun writeLastRead(snap: dev.arc.ep133.features.LiveSnapshot) {
        lastRead = snap
        lastReadLoaded = true
        scope.launch(Dispatchers.IO) {
            synchronized(lastReadFile) {
                if (lastRead !== snap) return@synchronized // a newer read is on its way
                val tmp = java.io.File(lastReadFile.path + ".tmp")
                runCatching {
                    tmp.writeText(snap.toJson())
                    if (!tmp.renameTo(lastReadFile)) tmp.delete()
                }
            }
        }
    }

    /** Live's pad changes made offline, read from their file once (none when it is missing or unreadable). */
    private suspend fun loadOfflinePads(): OfflinePads {
        offlinePads?.let { return it }
        val read = withContext(Dispatchers.IO) {
            runCatching { OfflinePads.fromJson(offlinePadsFile.readText()) }.getOrNull()
        } ?: OfflinePads.EMPTY
        // Changes saved meanwhile are newer than the file was.
        return offlinePads ?: read.also { offlinePads = it }
    }

    /** Live tools' count of offline changes: recordings uploading now aren't changes to reset. */
    private fun showOfflineCount() {
        val pads = offlinePads ?: return
        val uploading = samplesUploading()
        _state.update { it.copy(offlinePads = pads.list.count { p -> p.file == null || p.file !in uploading }) }
    }

    /** Keeps [pads] as Live's offline changes (written whole, then renamed over the file); none deletes the file. */
    private fun saveOfflinePads(pads: OfflinePads) {
        offlinePads = pads
        showOfflineCount()
        scope.launch(Dispatchers.IO) {
            synchronized(offlinePadsFile) {
                if (offlinePads !== pads) return@synchronized // newer changes are on their way
                runCatching {
                    if (pads.size == 0) {
                        offlinePadsFile.delete()
                    } else {
                        val tmp = java.io.File(offlinePadsFile.path + ".tmp")
                        tmp.writeText(pads.toJson())
                        if (!tmp.renameTo(offlinePadsFile)) tmp.delete()
                    }
                }
            }
        }
    }

    /**
     * Copies the sounds on the active project's pads from the device, one at
     * a time in the background, so Live can play them without it. Only sounds
     * arc has no current copy of are read; it stops when Live closes, the
     * project changes or the device goes away, and gives way to any action.
     */
    private fun copyPadSounds(m: dev.arc.ep133.features.LiveMirror, s: Session) {
        val gen = ++cacheGen
        scope.launch {
            while (gen == cacheGen && mirror === m && session === s) {
                // The KEYS sound first (asked again each round, as it changes with the pad tapped).
                val keysSlot = _state.value.keysPad?.let(m::slotOf)
                val slots = (listOfNotNull(keysSlot) + m.saved(0).groups.flatMap { it.pads.values }.filterNotNull().sorted()).distinct()
                // A sound a press is loading is left to that press (it keeps what it reads).
                val pressing = slots.filter(::pressLoading).toSet()
                val reads = pressReads
                val todo = withContext(Dispatchers.IO) {
                    slots.firstNotNullOfOrNull { slot ->
                        deviceSounds[slot]?.takeIf { e -> slot !in pressing && !padSounds.fresh(slot, e.name, e.size) }
                    }
                }
                if (todo == null) {
                    // Only sounds presses are loading left: look again once they have.
                    if (pressing.isEmpty()) break
                    padLoads.values.toList().forEach { it.join() }
                    continue
                }
                // The device must be free, and nobody waiting for it.
                combine(_state, deviceWaiters) { st, w -> !st.busy && !st.backgroundRead && w == 0 }.first { it }
                if (gen != cacheGen || mirror !== m || session !== s) break
                // A press took this sound meanwhile (or read one from the device): look again.
                if (pressLoading(todo.slot) || pressReads != reads) continue
                _state.update { it.copy(backgroundRead = true) }
                val read = kotlinx.coroutines.CompletableDeferred<PcmSound?>()
                copying = todo.slot to read
                try {
                    val pcm = try {
                        val d = DeviceBrowser.soundDetails(s, todo.slot)
                        d to dev.arc.ep133.protocol.Fs.download(s, todo.slot)
                    } catch (e: Throwable) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        trafficLog.note("live copy of ${todo.slot} failed: ${e.message}")
                        null
                    } finally {
                        _state.update { it.copy(backgroundRead = false) }
                    }
                    if (pcm == null) break
                    read.complete(keepPadSound(todo.slot, todo.name, todo.size, pcm.second, pcm.first.channels, pcm.first.sampleRate))
                } finally {
                    read.complete(null)
                    if (copying?.second === read) copying = null
                }
            }
        }
    }

    /** Saves a sound read from the device; with Live open it goes into memory too, and is returned. */
    private suspend fun keepPadSound(slot: Int, name: String, size: Long, pcm: ByteArray, channels: Double, sampleRate: Double): PcmSound? {
        // Live is open: ready to play too.
        val a = if (mirror != null) {
            withContext(Dispatchers.Default) { PcmSound.of(pcm, channels.toInt(), sampleRate.toInt()) }.also { keepInMemory(slot, name, it) }
        } else {
            null
        }
        withContext(Dispatchers.IO) {
            runCatching { padSounds.put(slot, name, size, Wav.encode(pcm, channels, sampleRate)) }
                .onFailure { trafficLog.note("saving pad sound $slot failed: ${it.message}") }
        }
        return a
    }

    /** Whether a press is loading [slot]'s sound now. */
    private fun pressLoading(slot: Int) = padLoads.keys.any { it.startsWith("$slot:") }

    // Live's pads and keys sound while held (a gate): the voices whose finger is still down.
    private val held = HashSet<String>()
    // Pads whose press turned out to be a scroll: one still loading doesn't sound at all.
    private val cut = HashSet<String>()
    // Presses on the scrolling page that may still turn into a scroll ([playPad] unsure), until
    // [keepPad] or [cutPad]: whether the sound already started (from memory) or waits to load.
    private val unsure = HashMap<String, UnsurePress>()

    private class UnsurePress(val started: Boolean, val pressedAt: Long, val token: Long)

    // Voices started after their sample had to load (or wait out the scroll window): their latency
    // is logged, but kept out of the latency test, which times only presses played from memory.
    private val unmeasured = HashSet<String>()

    // Whether Live's output is open (and so watches the volume for the presses).
    private var liveAudioOpen = false

    /**
     * Opens Live's sound output (Live came on screen), so the first press is as
     * quick as the rest; the volume is watched meanwhile, so a press doesn't ask for it,
     * and the pad sounds already in memory are handed to it ([prepareLive]).
     * The debug log gets how it was set up (native or AudioTrack) once per
     * open: not again for a recreated activity that finds it open.
     */
    fun openLiveAudio() {
        if (!liveAudioOpen) {
            liveAudioOpen = true
            player.volume.start()
        }
        if (liveAudio.isOpen) return
        val opened = liveAudio.open()
        trafficLog.note("live audio: " + if (opened) liveAudio.description else "no output")
        if (opened) prepareLive(padMemory.sounds())
        sampleOutputChanged()
    }

    /**
     * Hands [sounds] to Live's output off the main thread, so their first press
     * finds them ready (the native engine copies each into its own memory).
     * Nothing while Live's output is closed: [openLiveAudio] hands over all of
     * [padMemory] when it opens.
     */
    private fun prepareLive(sounds: List<PcmSound>) {
        if (!liveAudio.isOpen || sounds.isEmpty()) return
        scope.launch(Dispatchers.Default) {
            for (a in sounds) if (!a.silent) liveAudio.prepare(a.pcm, a.channels)
        }
    }

    /**
     * Closes it (Live left the screen), and the click and the pattern's
     * transport with it; [background] when arc itself left the screen,
     * which a take stopped by it says.
     */
    fun closeLiveAudio(background: Boolean = false) {
        // The transport stops (recording ends, kept) before the output goes.
        patternStop()
        // SAMPLE goes with it: its RSP takes the output's mix, and its mic is never left open.
        exitSample(background)
        // LiveAudio.close leaves the click on (the debug engine switch closes and opens again).
        setClick(false)
        tapTempo.reset()
        // A punch-in lasts while it is held; the next output starts with none.
        fxDesk.punchAllUp()
        // The arp's notes go with the output; it stays on. So do the STEP panel's auditions.
        arpClear()
        stepAuditions.values.forEach(Job::cancel)
        stepAuditions.clear()
        held.clear()
        cut.clear()
        unsure.clear()
        unmeasured.clear()
        liveAudio.close()
        if (liveAudioOpen) {
            liveAudioOpen = false
            player.volume.stop()
        }
    }

    // ---------- TEMPO: a click on the phone (an addition) ----------

    /**
     * TEMPO's tap: the click on or off. On, it plays at the phone's tempo,
     * or on the EP-133's beats while it sends MIDI clock ([clockFollow]), or
     * on the pattern's while the transport runs; its
     * own output, so REC leaves it out. Focus taken (a call) or the output
     * failing turns it off. No output: a toast, and it stays off.
     */
    fun setClick(on: Boolean) {
        if (!on) {
            liveAudio.stopClick()
            clickOn.value = false
            return
        }
        if (liveAudio.clicking) return
        // On first: a click that dies at once (a dead track) runs onStopped from its own
        // thread, maybe before startClick has returned, and that "off" must stand.
        clickOn.value = true
        val started = liveAudio.startClick(
            settings.value.liveTempo,
            // The pattern's beats while it runs, so the click lands on its bar 1 and counts it in.
            // The EP-133's beats are sound outside the phone, so the click for them goes out early by the output's
            // delay and is heard on the device's beat; the pattern's own are the phone's alone, and stay as they are.
            grid = { now -> heardTimeline()?.grid() ?: clockFollow?.grid(now)?.let { dev.arc.ep133.audio.OutputDelay.earlier(it, liveAudio.delayNs) } },
            onBeat = {
                _beats.value = it
                // SAMPLE's count-in counts the click's beats.
                countInBeat?.invoke(it)
            },
            onStopped = { clickOn.value = false },
        )
        if (!started) {
            clickOn.value = false
            toast(FeatureText.NO_AUDIO_OUTPUT, error = true)
        }
    }

    /** The phone's tempo, clamped to Tempo.MIN..MAX and kept; a click on takes it from the beat after the next. */
    fun setTempo(bpm: Int) {
        settingsStore.update { it.copy(liveTempo = dev.arc.ep133.features.Tempo.clamp(bpm)) }
        // Not changeSettings: library.json is written once the tempo rests.
        tempoSync?.cancel()
        tempoSync = scope.launch {
            delay(TEMPO_SYNC_MS)
            withContext(kotlinx.coroutines.NonCancellable) { library.syncIndex() }
        }
    }

    /**
     * A tap on the tempo sheet's TAP pad, at [at] (System.nanoTime, as
     * PressTime gives it): from the second tap of a run on, the tempo the
     * taps give is set and returned ([dev.arc.ep133.features.TapTempo]); null before.
     */
    fun tapTempo(at: Long): Int? = tapTempo.tap(at)?.also(::setTempo)

    /**
     * Plays a Live pad's sample on the phone (arc's copy of the device's
     * sound, else the newest backup holding it, else, connected, the device)
     * alongside whatever else is sounding, so several pads make a chord. It
     * sounds until [releasePad]; with [hold] false (a screen reader's Play) it
     * plays to the end. A stop (leaving Live) drops one still loading, and so
     * does letting go before a slow load ends; other taps don't, unlike the
     * lists' one-at-a-time Play.
     *
     * [unsure]: a press on the scrolling page, which may still turn into a
     * scroll. A sample in memory sounds at once all the same; the rest (the
     * KEYS pad, a load from the device, the "no sample" toast) waits for
     * [keepPad], and [cutPad] drops it.
     *
     * [pressedAt] (System.nanoTime) is when the finger came down, from the
     * touch event ([dev.arc.ep133.audio.PressTime]): the latency is counted from it.
     * While PATTERN records, the press is a note there from that moment (an
     * [unsure] one once kept), unless [record] is false (the pad sheet's cap,
     * which tries the sound out); with RECORD armed, it starts the recording
     * there ([patternPadDown]). With the arp on ([setArpOn]), a press but
     * the pad sheet's holds the pad for note repeat instead ([arpPress]).
     */
    fun playPad(
        pad: dev.arc.ep133.features.PhysicalPad,
        hold: Boolean = true,
        unsure: Boolean = false,
        pressedAt: Long = System.nanoTime(),
        record: Boolean = true,
    ): Job? {
        val key = "live:${pad.group}:${pad.offset}"
        // The PAD flow of SCENE's CLIP row waiting for a pad: the tap is its, neither played nor recorded (one
        // a scroll may yet take, once kept: [keepPad]).
        if (record && sceneDesk.padStage != PadStage.NONE) {
            if (unsure && hold) sceneTaps += key else scenePadTap(pad)
            return null
        }
        // The arp on (RPT): the press holds the pad for note repeat, not played or recorded itself.
        // One a scroll may yet take becomes the KEYS sound, and starts RECORD armed, once kept ([keepPad]).
        if (record && arpTakes(hold)) {
            if (!unsure) setKeysPad(pad)
            arpPress(key, dev.arc.ep133.features.ArpNote(pad, null), keys = false, pressedAt, hold, unsure)
            return null
        }
        if (hold) held += key
        cut -= key
        this.unsure -= key
        // The sound first: with the sample in memory it starts before any bookkeeping.
        val ready = padInMemory(pad)
        if (unsure && hold) {
            // Not yet the latest press either: a scroll mustn't drop another press's late load.
            if (ready != null) startHeld(key, hold, ready, 0, pressedAt, measured = true, shapeFor(pad))
            this.unsure[key] = UnsurePress(ready != null, pressedAt, playToken)
            return null
        }
        lastPressAt = pressedAt
        if (ready != null) startHeld(key, hold, ready, 0, pressedAt, measured = true, shapeFor(pad))
        // The pad tapped is also the sound KEYS plays; it is loaded right here, so no preload for it.
        setKeysPad(pad)
        if (record) recordPress(pad, null, key, pressedAt, hold, first = patternPadDown(pressedAt))
        return if (ready != null) null else loadAndStart(pad, key, hold, pressedAt, playToken)
    }

    /**
     * The press on the scrolling page was a press after all (the scroll window
     * closed, or the finger lifted inside it): the pad becomes the KEYS sound,
     * and one not in memory loads and plays now.
     */
    fun keepPad(pad: dev.arc.ep133.features.PhysicalPad): Job? {
        val key = "live:${pad.group}:${pad.offset}"
        // One the PAD flow was waiting for: its tap.
        if (sceneTaps.remove(key)) {
            scenePadTap(pad)
            return null
        }
        // One the arp holds: neither played nor recorded itself.
        arpDesk.keep(key)?.let { at ->
            setKeysPad(pad)
            patternPadDown(at)
            return null
        }
        val u = unsure.remove(key) ?: return null
        lastPressAt = maxOf(lastPressAt, u.pressedAt)
        setKeysPad(pad)
        recordPress(pad, null, key, u.pressedAt, hold = true, first = patternPadDown(u.pressedAt))
        return if (u.started) null else loadAndStart(pad, key, true, u.pressedAt, u.token)
    }

    /** Loads [pad]'s sample (copy, backup or device) and starts its voice, unless a stop came meanwhile. */
    private fun loadAndStart(pad: dev.arc.ep133.features.PhysicalPad, key: String, hold: Boolean, pressedAt: Long, token: Long): Job = scope.launch {
        val a = padAudio(pad) ?: return@launch
        if (token == playToken) startHeld(key, hold, a, 0, pressedAt, measured = false, shapeFor(pad))
    }

    /** The finger left the pad (at [releasedAt]): its sound fades out, and a note it recorded ends there. */
    fun releasePad(pad: dev.arc.ep133.features.PhysicalPad, releasedAt: Long = System.nanoTime()) = release("live:${pad.group}:${pad.offset}", releasedAt)

    /** The press on the pad was a scroll after all: its sound ends at once (one still loading never starts). */
    fun cutPad(pad: dev.arc.ep133.features.PhysicalPad) {
        val key = "live:${pad.group}:${pad.offset}"
        held -= key
        sceneTaps -= key
        // Nor does it repeat.
        if (arpDesk.cut(key)) publishArp()
        // A note it recorded (a sure press a swipe took over) was no press either.
        patternHeld.remove(key)?.let { setPatterns(withoutNote(projectPatterns, it)) }
        // One still unsure never loads, nor becomes the KEYS sound.
        if (unsure.remove(key) == null) cut += key
        liveAudio.cut(key)
    }

    private fun release(key: String, releasedAt: Long) {
        held -= key
        liveAudio.release(key)
        recordRelease(key, releasedAt)
        // A note the arp holds goes with the finger (unless latched).
        if (arpDesk.release(key, settings.value.arpLatch)) publishArp()
    }

    /**
     * Starts a Live voice. One let go of while it was loading still sounds,
     * briefly, after a quick load. After a slow one ([LATE_LOAD_NS]) only the
     * latest press does: a single quick tap on a sound not in memory yet is
     * still heard, but a first glissando over one doesn't end in a burst of
     * every note it slid over.
     *
     * [measured]: the sample was in memory at the press, so its latency goes
     * into the latency test; a load's time would only blur it.
     */
    private fun startHeld(
        key: String,
        hold: Boolean,
        a: PcmSound,
        semitones: Int,
        pressedAt: Long,
        measured: Boolean,
        shape: dev.arc.ep133.formats.VoiceShape = dev.arc.ep133.formats.VoiceShape.DEFAULT,
    ) {
        if (key in cut) return
        val lifted = hold && key !in held
        if (lifted && pressedAt != lastPressAt && System.nanoTime() - pressedAt > LATE_LOAD_NS) return
        when {
            a.silent -> toastOnce(FeatureText.SILENT_SOUND)
            !liveAudio.play(key, a.pcm, a.channels, a.sampleRate, semitones, pressedAt, shape) -> toastOnce(FeatureText.NO_AUDIO_OUTPUT, error = true)
            else -> {
                // One from memory clears a mark left by a loaded voice that was never heard (cut first).
                if (measured) unmeasured -= key else unmeasured += key
                if (lifted) liveAudio.release(key)
                if (player.volumeOff()) toastOnce(FeatureText.VOLUME_OFF)
            }
        }
    }

    /**
     * A voice was heard: how long after the press, in the debug log and (when
     * it played from memory) the latency test's times for [engine];
     * Bluetooth's delay pointed out once.
     * Called on the audio thread with the bare numbers, so the words are made
     * here, on the main thread.
     */
    private fun liveStarted(key: String, latencyMs: Double, route: android.media.AudioDeviceInfo?, engine: String) {
        scope.launch {
            if (!unmeasured.remove(key)) latencyTest.heard(engine, latencyMs)
            val where = dev.arc.ep133.audio.SoundPlayer.routeName(route?.type, route?.productName?.toString())
            trafficLog.note(dev.arc.ep133.text.MirrorText.latencyNote(key, latencyMs, where))
            if (!toldBluetooth && route != null && dev.arc.ep133.audio.SoundPlayer.isBluetooth(route.type)) {
                toldBluetooth = true
                toast(dev.arc.ep133.text.MirrorText.BLUETOOTH_DELAY)
            }
        }
    }

    /** Live's output changed while open (a native stream reopened or retuned, or the switch to AudioTrack): in the debug log. */
    private fun liveOutput(description: String) {
        scope.launch {
            trafficLog.note("live audio: $description")
            // A press or REC may have opened it ([openLiveAudio] had failed), or the switch to
            // AudioTrack: the sounds kept go to it too (those it holds already are only found).
            prepareLive(padMemory.sounds())
            // And SAMPLE's RSP takes its mix again.
            sampleOutputChanged()
        }
    }

    /**
     * The debug screen's engine choice for Live ([dev.arc.ep133.text.LiveEngine]),
     * kept in the preferences only. An output open now reopens on it; what
     * was sounding stops, as when Live closes.
     */
    fun setLiveEngine(engine: dev.arc.ep133.text.LiveEngine) {
        // Not changeSettings: the choice stays out of library.json.
        settingsStore.update { it.copy(liveEngine = engine) }
        if (liveAudio.engine == engine) return
        liveAudio.engine = engine
        if (!liveAudio.isOpen) return
        arpClear()
        held.clear()
        cut.clear()
        unsure.clear()
        unmeasured.clear()
        liveAudio.close()
        val opened = liveAudio.open()
        trafficLog.note("live audio: " + if (opened) liveAudio.description else "no output")
        if (opened) prepareLive(padMemory.sounds())
        sampleOutputChanged()
    }

    /** Forgets the latency test's times. */
    fun resetLatency() = latencyTest.reset()

    // ---------- takes: Live recorded (an addition) ----------

    private suspend fun loadTakes() {
        _takes.value = withContext(Dispatchers.IO) { runCatching { takeStore.list() }.getOrDefault(emptyList()) }
    }

    /** TAKE (REC before RECORD was the pattern's): arms a take (the next sound starts it), or stops the one going. */
    fun toggleRec() {
        if (liveAudio.rec.value != dev.arc.ep133.features.RecState.Idle) {
            liveAudio.stopRecording()
            return
        }
        val file = takeStore.newFile(System.currentTimeMillis())
        if (!liveAudio.arm(file)) toast(dev.arc.ep133.text.MirrorText.NO_OUTPUT, error = true)
    }

    /** TAKE (REC's new name, in Live tools): as [toggleRec]. */
    fun toggleTake() = toggleRec()

    /** A take ended (on its writer's thread): saved, nothing played, or not written. */
    private fun takeDone(file: java.io.File?, seconds: Double, limit: Boolean, error: String?) {
        scope.launch {
            when {
                error != null -> toast(dev.arc.ep133.text.MirrorText.takeFailed(error), error = true)
                file == null -> Unit
                else -> {
                    trafficLog.note("take ${file.name}: ${"%.1f".format(seconds)} s")
                    loadTakes()
                    toast(if (limit) dev.arc.ep133.text.MirrorText.takeAtLimit(seconds) else dev.arc.ep133.text.MirrorText.takeSaved(seconds))
                }
            }
        }
    }

    fun takeFile(t: dev.arc.ep133.data.TakeInfo): java.io.File = takeStore.file(t.name)

    /** The player's key for a take, to show Stop on its row. */
    fun takeKey(t: dev.arc.ep133.data.TakeInfo) = "take:" + t.name

    /** Plays a take on the phone (a list's single sound: it stops the one before). */
    fun playTake(t: dev.arc.ep133.data.TakeInfo): Job = scope.launch {
        val token = ++playToken
        val key = takeKey(t)
        val sound = previews[key] ?: try {
            withContext(Dispatchers.IO) { PcmSound.ofWav(takeFile(t).readBytes()) }.also { previews.put(key, it) }
        } catch (e: Exception) {
            toast(e.message ?: e.toString(), error = true)
            return@launch
        }
        if (token != playToken) return@launch
        startSound(key, sound)
    }

    fun deleteTake(t: dev.arc.ep133.data.TakeInfo): Job = scope.launch {
        if (player.playing.value == takeKey(t)) stopPlayback()
        previews.remove(takeKey(t))
        withContext(Dispatchers.IO) { takeStore.delete(t.name) }
        loadTakes()
    }

    /** Proposes a take for upload to a free slot (the Device tab's upload sheet, with its trim). */
    fun takeToDevice(t: dev.arc.ep133.data.TakeInfo): Job = scope.launch {
        val bytes = try {
            withContext(Dispatchers.IO) { takeFile(t).readBytes() }
        } catch (e: java.io.IOException) {
            toast(e.message ?: e.toString(), error = true)
            return@launch
        }
        // The Device tab reads the device as it opens; the free slot is picked once that is in.
        val contents = _state.value.browser.contents
            ?: kotlinx.coroutines.withTimeoutOrNull(10_000) { _state.first { it.browser.contents != null }.browser.contents }
        val item = draftItem(t.name, bytes, contents?.occupiedSlots ?: emptySet(), HashSet())
        _state.update { it.copy(browser = it.browser.copy(draft = listOf(item))) }
    }

    private fun memoryKey(slot: Int, name: String) = "$slot:${name.trim().lowercase()}"

    /** A pad sample's key in [padMemory]: a recording's by its file (it has no slot yet), else by slot and name. */
    private fun sampleKey(sample: PadSample) = sample.file?.let(::recordedKey) ?: memoryKey(sample.slot, sample.name)

    private fun keepInMemory(slot: Int, name: String, a: PcmSound) {
        padMemory.put(memoryKey(slot, name), a)
        prepareLive(listOf(a))
        refreshPatternPlan()
    }

    private fun forgetPadMemory() {
        preloadGen++
        padMemory.clear()
    }

    /**
     * Loads the samples on the active project's pads into memory, one at a
     * time in the background, from arc's copies or a backup (never the
     * device: the background copy does that), so pressing a pad plays at once.
     * The KEYS sound goes first, also when it changes along the way.
     */
    private fun preloadPads(m: dev.arc.ep133.features.LiveMirror) {
        val gen = ++preloadGen
        preloadJob = scope.launch {
            val samples = m.padSamples()
            val tried = HashSet<PadSample>()
            while (gen == preloadGen && mirror === m) {
                val keysSample = _state.value.keysPad?.let(m::sampleOf)
                val sample = (listOfNotNull(keysSample) + samples).firstOrNull { it !in tried } ?: break
                tried += sample
                val key = sampleKey(sample)
                // In memory already, or a press is loading it.
                if (padMemory.containsKey(key) || key in padLoads) continue
                val a = runCatching { loadSampleAudio(sample) }.getOrNull() ?: continue
                if (gen == preloadGen && mirror === m) {
                    padMemory.put(key, a)
                    prepareLive(listOf(a))
                    refreshPatternPlan()
                }
            }
        }
    }

    /** [sample]'s sound: a recording's from its file, else as [loadPadAudio] finds it. */
    private suspend fun loadSampleAudio(sample: PadSample): PcmSound? {
        val file = sample.file
        return if (file != null) loadRecorded(file) else loadPadAudio(sample.slot, sample.name, sample.factory)
    }

    /**
     * A sample from arc's copy or a backup, decoded; null when neither has it.
     * A factory sound put on a pad offline ([factory]) comes from the factory
     * pack first: the device's copy in that slot may be another sound.
     */
    private suspend fun loadPadAudio(slot: Int, name: String, factory: Boolean = false): PcmSound? {
        val wav = (if (factory) fromPack(slot, name) else null)
            ?: withContext(Dispatchers.IO) { padSounds.get(slot, name) }
            ?: fromBackup(slot, name)
            ?: return null
        return withContext(Dispatchers.Default) {
            val w = Wav.decode(wav)
            PcmSound.of(w.pcm, w.channels, w.sampleRate.toInt())
        }
    }

    /** A pad's sample when it is in memory already, without waiting. */
    private fun padInMemory(pad: dev.arc.ep133.features.PhysicalPad): PcmSound? {
        val s = mirror?.sampleOf(pad) ?: return null
        return padMemory[sampleKey(s)]
    }

    /** A pad's sample from the first place that has it; null after a toast says why. */
    private suspend fun padAudio(pad: dev.arc.ep133.features.PhysicalPad): PcmSound? {
        val sample = mirror?.sampleOf(pad)
        if (sample == null) {
            toastOnce(dev.arc.ep133.text.MirrorText.NO_SAMPLE)
            return null
        }
        val key = sampleKey(sample)
        padMemory[key]?.let { return it }
        // Lazy: in the map before it runs, so even one that ends at once takes itself out.
        val load = padLoads.getOrPut(key) {
            scope.async(start = kotlinx.coroutines.CoroutineStart.LAZY) {
                try {
                    loadForPress(sample)
                } finally {
                    padLoads.remove(key)
                }
            }
        }
        return load.await()
    }

    /** What [padAudio] waits for: arc's copy or a backup, else the device; null after a toast says why. */
    private suspend fun loadForPress(sample: PadSample): PcmSound? {
        // A recording not on the device yet plays from its file in arc, and only from there.
        sample.file?.let { file ->
            return try {
                loadRecorded(file)?.also {
                    if (mirror != null) {
                        padMemory.put(recordedKey(file), it)
                        prepareLive(listOf(it))
                    }
                } ?: null.also { toastOnce(dev.arc.ep133.text.MirrorText.NO_COPY) }
            } catch (e: Throwable) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                toast(e.message ?: e.toString(), error = true)
                null
            }
        }
        val (slot, name) = sample
        return try {
            // The background copy reading this very sound: wait for it rather than read it twice.
            val copied = loadPadAudio(slot, name, sample.factory) ?: copying?.takeIf { it.first == slot }?.second?.await()
            val audio = copied ?: padMemory[memoryKey(slot, name)] ?: if (session != null && _state.value.device != null) {
                val (d, pcm) = exclusive("play:$slot") { s -> DeviceBrowser.soundDetails(s, slot) to dev.arc.ep133.protocol.Fs.download(s, slot) }
                    // SAMPLE's upload holds the device while Live plays on: say why the pad is silent.
                    ?: return null.also { if (samplesGoingUp.isNotEmpty() && _state.value.busy) toastOnce(dev.arc.ep133.text.MirrorText.DEVICE_UPLOADING) }
                pressReads++
                deviceSounds[slot]?.let { keepPadSound(slot, it.name, it.size, pcm, d.channels, d.sampleRate) }
                    ?: withContext(Dispatchers.Default) { PcmSound.of(pcm, d.channels.toInt(), d.sampleRate.toInt()) }
            } else {
                val factory = (sample.factory || FactorySounds.unnamed(slot, name)) && FactorySounds.inLibrary(_state.value.backups) == null
                toastOnce(if (factory) dev.arc.ep133.text.MirrorText.NO_COPY_FACTORY else dev.arc.ep133.text.MirrorText.NO_COPY)
                return null
            }
            if (mirror != null) keepInMemory(slot, name, audio)
            audio
        } catch (e: Throwable) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            toast(e.message ?: e.toString(), error = true)
            null
        }
    }

    /** The sound KEYS plays: the pad last tapped, or last played on the device in the pads view. */
    fun selectKeysPad(pad: dev.arc.ep133.features.PhysicalPad) {
        if (!setKeysPad(pad)) return
        // Its sample goes into memory first: a preload under way takes it next; a finished
        // one runs again, passing over what memory has.
        if (preloadJob?.isActive != true) mirror?.let(::preloadPads)
    }

    /** Makes [pad] the KEYS sound; false when it already was. */
    private fun setKeysPad(pad: dev.arc.ep133.features.PhysicalPad): Boolean {
        if (_state.value.keysPad == pad) return false
        _state.update { it.copy(keysPad = pad) }
        mirrorPrefs.edit { putString("keysPad", "${pad.group}:${pad.offset}") }
        return true
    }

    /**
     * Plays MIDI [note] on the KEYS sound, repitched from its own pitch (C4)
     * as it is mixed, until [releaseNote] (or to the end, with [hold] false).
     * The screen names the note as the finger lands, so a change of key,
     * scale or octave under a held key still lets go of the note it plays.
     * [pressedAt]: as [playPad]'s, and so is a note PATTERN records. With
     * the arp on ([setArpOn]), the note joins the arp's instead ([arpPress]).
     */
    fun playNote(note: Int, hold: Boolean = true, pressedAt: Long = System.nanoTime()): Job {
        if (arpTakes(hold)) {
            val pad = _state.value.keysPad
            if (pad != null) arpPress("note:$note", dev.arc.ep133.features.ArpNote(pad, note - dev.arc.ep133.features.Keys.ROOT_NOTE), keys = true, pressedAt, hold)
            return scope.launch { if (pad == null) toastOnce(dev.arc.ep133.text.MirrorText.PICK_SOUND) }
        }
        lastPressAt = pressedAt
        val key = "note:$note"
        if (hold) held += key
        // Timed for the latency test only when the KEYS sound is in memory already.
        val measured = _state.value.keysPad?.let(::padInMemory) != null
        _state.value.keysPad?.let { recordPress(it, note - dev.arc.ep133.features.Keys.ROOT_NOTE, key, pressedAt, hold, first = patternPadDown(pressedAt)) }
        return scope.launch {
            val token = playToken
            val pad = _state.value.keysPad
            if (pad == null) {
                toastOnce(dev.arc.ep133.text.MirrorText.PICK_SOUND)
                return@launch
            }
            val a = padAudio(pad) ?: return@launch
            if (token == playToken) startHeld(key, hold, a, note - dev.arc.ep133.features.Keys.ROOT_NOTE, pressedAt, measured, shapeFor(pad, keys = true))
        }
    }

    /** The last finger left the note (at [releasedAt]): it fades out, and a note it recorded ends there. */
    fun releaseNote(note: Int, releasedAt: Long = System.nanoTime()) = release("note:$note", releasedAt)

    private fun savedKeysPad(): dev.arc.ep133.features.PhysicalPad? =
        mirrorPrefs.getString("keysPad", null)?.split(':')?.mapNotNull { it.toIntOrNull() }
            ?.takeIf { it.size == 2 && it[0] in 0..3 && it[1] in 0..11 }
            ?.let { dev.arc.ep133.features.PhysicalPad(it[0], it[1]) }

    /**
     * The WAV of a sound from the newest backup that has it, if any; a sound
     * the device lists unnamed ("343.pcm") from the factory pack.
     */
    private suspend fun fromBackup(slot: Int, name: String): ByteArray? {
        val b = dev.arc.ep133.features.PadSounds.newestBackupWith(slot, name, backupNames, _state.value.backups)
            ?: FactorySounds.inLibrary(_state.value.backups)?.takeIf { FactorySounds.unnamed(slot, name) }
            ?: return null
        return pakOf(b.id).sounds[slot]?.wav
    }

    /** The factory pack's sound in [slot], when the library has the pack and the sound there is still [name]. */
    private suspend fun fromPack(slot: Int, name: String): ByteArray? {
        val b = FactorySounds.inLibrary(_state.value.backups) ?: return null
        val snd = pakOf(b.id).sounds[slot] ?: return null
        return snd.wav.takeIf { dev.arc.ep133.features.PadSoundCache.sameName(snd.name, name) }
    }

    /** A library entry opened, the last one kept open. */
    private suspend fun pakOf(id: String): dev.arc.ep133.backup.Pak =
        openPak?.takeIf { it.first == id }?.second
            ?: withContext(Dispatchers.Default) { Paks.open(library.bytes(id)) }.also { openPak = id to it }

    /** Space taken by Live's copies of the device's sounds, in bytes. */
    suspend fun padSoundsSize(): Long = withContext(Dispatchers.IO) { padSounds.bytes() }

    fun clearPadSounds(): Job = scope.launch {
        forgetPadMemory()
        previews.removeAll { it.startsWith(PAD_PREVIEW) }
        withContext(Dispatchers.IO) { padSounds.clear() }
        // What a backup still has plays as quickly as before.
        mirror?.let(::preloadPads)
        // Offline, the device's sounds only copied are dimmed now.
        refreshOffline()
        toast(dev.arc.ep133.text.MirrorText.SOUNDS_CLEARED)
    }

    /**
     * Reads [project]'s pads for [m] (the device switched to it). It waits
     * for the device rather than give up, as SAMPLE's upload holds it for
     * seconds while Live plays on; pushes meanwhile ask once, and only the
     * project asked last lands.
     */
    private fun loadMirrorProject(m: dev.arc.ep133.features.LiveMirror, project: Int) {
        scope.launch {
            val ask = m to project
            if (mirrorProjectAsked == ask) return@launch
            mirrorProjectAsked = ask
            try {
                val layout = exclusive("mirror", quiet = true, wait = true) { ss -> DeviceBrowser.projectLayout(ss, project) } ?: return@launch
                if (mirror === m && mirrorProjectAsked == ask) {
                    m.setProject(project, layout.pads)
                    padsRead(project, layout)
                    saveLastRead(m)
                    preloadPads(m)
                    session?.let { copyPadSounds(m, it) }
                    _state.update { cur -> cur.mirror?.let { cur.copy(mirror = it.copy(state = m.snapshot(System.nanoTime()))) } ?: cur }
                }
            } finally {
                if (mirrorProjectAsked == ask) mirrorProjectAsked = null
            }
        }
    }

    // The project a read of Live's pads is on its way for ([loadMirrorProject]), and for which mirror.
    private var mirrorProjectAsked: Pair<dev.arc.ep133.features.LiveMirror, Int>? = null

    // ---------- SAMPLE: recording into a pad (an addition) ----------

    /** What SAMPLE mode holds here; the rest of [SampleUiState] is the settings' and the recorder's. */
    private data class SampleMode(
        val on: Boolean = false,
        /** The input open, null while closed: the one chosen, or RSP standing in for it. */
        val input: SampleInput? = null,
        val inputs: List<SampleInput> = emptyList(),
        val latch: Boolean = false,
        /** The open input's rate, and whether a take from it is stereo (a stereo mic may open mono). */
        val rate: Int = dev.arc.ep133.audio.SampleRecorder.DEFAULT_RATE,
        val stereo: Boolean = false,
        /** The EP-133's free space in bytes as last read; null offline. */
        val free: Double? = null,
        val usb: Boolean = false,
    )

    /**
     * A recording kept while connected, waiting its turn to upload: its
     * [file], [pad], and the [slot] picked (null: the next free one); [held]
     * is the slot its review showed, kept from the next review's choice
     * until it is up ([sampleSlotsTaken]).
     */
    private class QueuedSample(val pad: dev.arc.ep133.features.PhysicalPad, val file: String, val slot: Int?, val held: Int?)

    // The EP-133's USB input, watched while the mode is open.
    private val usbInputs = dev.arc.ep133.audio.UsbAudioInputs(context.getSystemService(android.media.AudioManager::class.java))
    private val recorder = dev.arc.ep133.audio.SampleRecorder(liveAudio, dev.arc.ep133.audio.InputCapture.opener(context, usbInputs), scope)
    private val sampleFiles by lazy { dev.arc.ep133.data.SampleFiles(java.io.File(context.filesDir, "samples")) }
    private val sampleMode = MutableStateFlow(SampleMode())
    // What the controller runs before a take of set bars: the count-in, or waiting for the EP-133's PLAY.
    private val sampleWaiting = MutableStateFlow<SamplePhase?>(null)
    // A recording going up to the EP-133, with how far.
    private val sampleUploading = MutableStateFlow<SamplePhase.Uploading?>(null)

    /** SAMPLE mode, for its panel and its line. */
    val sample: StateFlow<SampleUiState> =
        combine(sampleMode, settings, recorder.phase, sampleWaiting, sampleUploading) { m, s, rec, waiting, up -> sampleUi(m, s, rec, waiting, up) }
            .stateIn(scope, kotlinx.coroutines.flow.SharingStarted.Eagerly, sampleUi(SampleMode(), settings.value, SamplePhase.Ready, null, null))

    private val _sampleReview = MutableStateFlow<SampleReview?>(null)

    private val _sampleLastTake = MutableStateFlow<List<dev.arc.ep133.features.Peak>?>(null)

    /** The last take's waveform (kept or on the review sheet), for the SAMPLE panel's display while nothing records; null before the first. */
    val sampleLastTake: StateFlow<List<dev.arc.ep133.features.Peak>?> = _sampleLastTake.asStateFlow()

    /** The take on the review sheet, if any. */
    val sampleReview: StateFlow<SampleReview?> = _sampleReview.asStateFlow()

    // The review DISCARD dropped last, for its UNDO.
    private var discardedReview: SampleReview? = null
    // Whether the activity has the mic permission, as it last said: MIC and USB need it.
    private var micAllowed = false
    // The pad held down to record, and when it was pressed. Main thread only, as the rest here.
    private var sampleHeld: Pair<dev.arc.ep133.features.PhysicalPad, Long>? = null
    // With LATCH on, an unsure press (the scrolling page) and when it was pressed: it latches once kept.
    private var sampleLatchUnsure: Pair<dev.arc.ep133.features.PhysicalPad, Long>? = null
    // An unsure press on the hands-free take's pad, and when it was pressed: it stops the take once kept.
    private var sampleStopUnsure: Pair<dev.arc.ep133.features.PhysicalPad, Long>? = null
    // The pad whose press, still down, latched the hands-free take: a swipe or scroll taking it latches nothing.
    private var sampleLatchPress: dev.arc.ep133.features.PhysicalPad? = null
    // The pad of a hands-free take, from its latch (or count-in); over once the recorder no longer has a take going.
    private var sampleLatched: dev.arc.ep133.features.PhysicalPad? = null
    // Pads played as ever while a take records, to let go of with their finger.
    private val samplePlayed = HashSet<dev.arc.ep133.features.PhysicalPad>()
    // The count-in, or the wait for PLAY, before a take of set bars.
    private var sampleCount: Job? = null
    // The count-in's ear on the click's beats (the click's thread calls it).
    @Volatile
    private var countInBeat: ((dev.arc.ep133.features.Beat) -> Unit)? = null
    // A take stopped by leaving the screen: its arrival says so.
    private var stoppedInBackground = false
    // Recordings kept while connected, waiting for [uploadSamples].
    private val sampleQueue = ArrayList<QueuedSample>()
    // The queued recording going up now, while the worker uploads it: its slot is still held.
    private var sampleUpNow: QueuedSample? = null
    // Recordings on their way up, by file, from the moment they leave the queue (or Write's list) until
    // their upload ends: the worker's and Write's may both be in [uploadRecorded], one waiting its turn.
    private val samplesGoingUp = HashSet<String>()
    // Recordings whose upload failed in this connection: their pads go on playing them, as offline
    // changes, until Write tries them again or Discard puts them in Takes.
    private val samplesFailed = HashSet<String>()
    // One upload at a time, whoever asked: so a progress, a file read and a slot are one recording's.
    private val sampleUploadLock = kotlinx.coroutines.sync.Mutex()
    private var sampleUploader: Job? = null
    // Live paused with the app in the background, until it is back ([awaitLive]); which pause or open was last.
    private val livePaused = MutableStateFlow(false)
    private var liveOpens = 0
    // The LEVEL and threshold knobs turn many times a second: library.json is written once they rest.
    private var sampleSync: Job? = null

    init {
        recorder.onDone = ::sampleDone
        recorder.onLost = ::sampleLost
        // RSP reopened at Live's output's new rate: the mode shows it, and its longest take.
        recorder.onReopened = { if (sampleMode.value.on) syncSampleInput() }
        // Android silencing the mic (a call, another app recording): said each time it starts.
        scope.launch { recorder.silenced.collect { if (it) toast(dev.arc.ep133.text.MirrorText.MIC_BUSY, error = true) } }
        // The EP-133's USB input plugged in or out: −/+ offers it or not.
        scope.launch { usbInputs.present.collect { if (sampleMode.value.on) refreshSampleInputs() } }
        // Recordings arc was closed on before they were kept or let go of (a take on the review sheet,
        // a KEEP half done): into Takes, never lost. Only files from before this start count.
        val started = System.currentTimeMillis()
        scope.launch {
            val referenced = loadOfflinePads().list.mapNotNullTo(HashSet()) { it.file }
            val moved = withContext(Dispatchers.IO) {
                runCatching { sampleFiles.strays(referenced, started).count { sampleFiles.moveToTakes(it, takeStore) } }.getOrDefault(0)
            }
            if (moved > 0) {
                trafficLog.note("samples: $moved left from before moved to Takes")
                loadTakes()
            }
        }
    }

    private fun sampleUi(m: SampleMode, s: dev.arc.ep133.data.AppSettings, rec: SamplePhase, waiting: SamplePhase?, up: SamplePhase?): SampleUiState {
        val input = m.input ?: storedSampleInput(s)
        val stereo = if (m.input != null) m.stereo else input.stereo
        return SampleUiState(
            on = m.on,
            input = input,
            inputs = m.inputs,
            gainDb = s.sampleGain(input.source),
            thresholdDb = s.sampleThreshold,
            bars = s.sampleBars,
            pattern = s.samplePattern,
            latch = m.latch,
            // The count-in shows over the take it has scheduled; a take over the wait for PLAY or an upload.
            phase = waiting as? SamplePhase.CountIn ?: rec.takeIf { it != SamplePhase.Ready } ?: waiting ?: up ?: SamplePhase.Ready,
            maxSeconds = sampleMaxFrames(stereo, m.rate, m.free) / m.rate,
            lowSpace = dev.arc.ep133.features.SampleLimits.lowSpace(m.free, stereo),
            usb = m.usb,
        )
    }

    private fun storedSampleInput(s: dev.arc.ep133.data.AppSettings = settings.value) = SampleInput(s.sampleSource, s.sampleStereo)

    /** The input's level, 0..1 across −60..0 dBFS, read as the meter draws. */
    fun sampleLevel(): Float = recorder.level()

    /** Whether the input clipped in the last second, read as the meter draws. */
    fun sampleClip(): Boolean = recorder.clip()

    /**
     * The SAMPLE panel opened (a swipe on Live's pads): the mode opens on the
     * input last chosen, metering it at once; nothing records until a pad is
     * held. Without the mic
     * ([micAllowed] false, as the activity found it) MIC and USB aren't
     * offered and RSP stands in. STEP's and the scene panel and EDIT's pad sheet close, and TEMPO's click
     * stops: its key is under the panel, and the phone's speaker would play
     * into a MIC take (BARS' count-in starts it for its bar). PATTERN stops
     * recording, and plays on. Called again
     * when the permission came meanwhile, the mic and USB come in.
     */
    fun enterSample(micAllowed: Boolean) {
        val had = this.micAllowed
        this.micAllowed = micAllowed
        if (sampleMode.value.on) {
            if (micAllowed != had) {
                refreshSampleInputs()
                openSampleInput(storedSampleInput())
            }
            return
        }
        stoppedInBackground = false
        // The panels share the function keys' place: SAMPLE's closes STEP's and SCENE's.
        closeStep()
        closeScene()
        closePadEdit()
        setClick(false)
        // PATTERN stops recording; PLAY goes on, for a take of what it plays.
        patternAct { transport.punchOut() }
        usbInputs.start()
        // The free space as last read: a take that wouldn't fit stops sooner ("Disk low").
        sampleMode.update { it.copy(on = true, free = _state.value.device?.storage?.free) }
        refreshSampleInputs()
        recorder.setThreshold(settings.value.sampleThreshold)
        openSampleInput(storedSampleInput())
    }

    /**
     * Leaves SAMPLE mode: the input closes (the mic's privacy dot goes), a
     * count-in stops, and a take going on ends with what it has and is kept
     * like any other. [background]: arc left the screen, which the take's
     * arrival says.
     */
    fun exitSample(background: Boolean = false) {
        if (!sampleMode.value.on) return
        sampleCount?.cancel()
        if (background && recorder.phase.value is SamplePhase.Recording) stoppedInBackground = true
        sampleHeld = null
        sampleLatchUnsure = null
        sampleStopUnsure = null
        sampleLatchPress = null
        sampleLatched = null
        samplePlayed.forEach(::releasePad)
        samplePlayed.clear()
        recorder.close()
        usbInputs.stop()
        sampleMode.update { it.copy(on = false, input = null, usb = false) }
    }

    /** The inputs −/+ offers now: the mic and USB with the permission, USB while plugged in. */
    private fun refreshSampleInputs() {
        val audio = context.getSystemService(android.media.AudioManager::class.java)
        val mic = micAllowed && context.packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_MICROPHONE)
        val builtIn = audio?.getDevices(android.media.AudioManager.GET_DEVICES_INPUTS)?.firstOrNull { it.type == android.media.AudioDeviceInfo.TYPE_BUILTIN_MIC }
        val usb = usbInputs.present.value
        val inputs = sampleInputs(
            mic = mic,
            micStereo = builtIn != null && dev.arc.ep133.audio.UsbAudioInputs.stereo(builtIn),
            usb = micAllowed && usb != null,
            usbStereo = usb != null && dev.arc.ep133.audio.UsbAudioInputs.stereo(usb),
        )
        sampleMode.update { it.copy(inputs = inputs, usb = usb != null) }
    }

    /**
     * Opens [want] for the mode, or RSP when it isn't offered or won't open
     * (a toast says why); the choice kept in the settings stays [want].
     */
    private fun openSampleInput(want: SampleInput) {
        val input = pickSampleInput(want, sampleMode.value.inputs)
        // Another input: a hands-free take counting in goes with the one let go of, as one waiting for
        // the threshold does ([SampleRecorder.open] ends it with nothing).
        if (recorder.input != input) sampleCount?.cancel()
        val why = recorder.open(input, settings.value.sampleGain(input.source))
        if (why != null && input.source != SampleSource.RSP) {
            toast(dev.arc.ep133.text.MirrorText.inputFailed(why), error = true)
            return openSampleInput(SampleInput(SampleSource.RSP, input.stereo))
        }
        syncSampleInput(input)
    }

    /** The mode shows [input] (the open one) at the rate and channels the recorder has it at. */
    private fun syncSampleInput(input: SampleInput? = sampleMode.value.input) {
        sampleMode.update {
            it.copy(
                input = input,
                rate = recorder.rate ?: dev.arc.ep133.audio.SampleRecorder.DEFAULT_RATE,
                stereo = (recorder.channels ?: if (input?.stereo == true) 2 else 1) == 2,
            )
        }
    }

    /**
     * Live's output (re)opened: RSP, lost when it closed, opens on it again,
     * and its rate may be another.
     */
    private fun sampleOutputChanged() {
        val m = sampleMode.value
        if (!m.on) return
        if (recorder.input == null) openSampleInput(m.input ?: storedSampleInput()) else syncSampleInput()
    }

    /** −/+: the input [step] places on in the device's order, among those offered ([micAllowed] as the activity found it). */
    fun stepSampleInput(step: Int, micAllowed: Boolean) {
        if (micAllowed != this.micAllowed) {
            this.micAllowed = micAllowed
            if (sampleMode.value.on) refreshSampleInputs()
        }
        val m = sampleMode.value
        setSampleInput(SampleInput.cycle(m.inputs, m.input ?: storedSampleInput(), step))
    }

    /** Records from [i] from now on (kept for next time); one not offered now is left alone. */
    fun setSampleInput(i: SampleInput) {
        val m = sampleMode.value
        if (m.on && i !in m.inputs) return
        changeSettings { it.copy(sampleSource = i.source, sampleStereo = i.stereo) }
        if (m.on) openSampleInput(i)
    }

    /** LEVEL: the open input's gain in dB ([dev.arc.ep133.data.SAMPLE_GAINS]), kept per source. */
    fun setSampleGain(db: Float) {
        val v = db.coerceIn(dev.arc.ep133.data.SAMPLE_GAINS)
        val source = (sampleMode.value.input ?: storedSampleInput()).source
        changeSampleSettings { it.withSampleGain(source, v) }
        recorder.setGain(v)
    }

    /** The threshold in dBFS ([dev.arc.ep133.data.SAMPLE_THRESHOLDS]) a take waits for; null records from the press. */
    fun setSampleThreshold(db: Float?) {
        val v = db?.coerceIn(dev.arc.ep133.data.SAMPLE_THRESHOLDS)
        changeSampleSettings { it.copy(sampleThreshold = v) }
        recorder.setThreshold(v)
    }

    /** BARS: how long a hands-free take lasts ([dev.arc.ep133.data.SAMPLE_BARS]), after a bar's count-in; null is Free. */
    fun setSampleBars(bars: Int?) {
        if (bars != null && bars !in dev.arc.ep133.data.SAMPLE_BARS) return
        changeSettings { it.copy(sampleBars = bars, samplePattern = false) }
    }

    /** LATCH: a tap on a pad records hands-free, for one hand or a screen reader (not kept). */
    fun setSampleLatch(on: Boolean) = sampleMode.update { it.copy(latch = on) }

    /** Settings' "Review samples": each take opens the review sheet, or goes straight on its pad. */
    fun setReviewSamples(on: Boolean) = changeSettings { it.copy(reviewSamples = on) }

    /** A SAMPLE setting kept at once, and in library.json once the knob rests. */
    private fun changeSampleSettings(change: (dev.arc.ep133.data.AppSettings) -> dev.arc.ep133.data.AppSettings) {
        settingsStore.update(change)
        sampleSync?.cancel()
        sampleSync = scope.launch {
            delay(TEMPO_SYNC_MS)
            withContext(kotlinx.coroutines.NonCancellable) { library.syncIndex() }
        }
    }

    /** The longest take the open input can record now, in frames: its limit, or what the EP-133 has room for. */
    private fun sampleMaxFrames(): Int {
        val rate = recorder.rate ?: return 0
        return sampleMaxFrames(recorder.channels == 2, rate, sampleMode.value.free)
    }

    // A take goes on: held, counting in, or asked of the recorder and not over yet. The recorder says
    // when one is over however it ended, so a hands-free take that ended with nothing (its input
    // stepped with −/+ while it waited for the threshold) never leaves the pads only playing.
    private fun sampleGoing() = sampleHeld != null || sampleCount?.isActive == true || recorder.going

    /**
     * A pad pressed in SAMPLE mode at [pressedAtNanos] (the touch's time,
     * [dev.arc.ep133.audio.PressTime]): held, it records from that moment
     * (or from the first sound past the threshold) until [samplePadUp];
     * with LATCH on it starts a hands-free take ([latchSample]), an [unsure]
     * press only once [samplePadKept] says it was a press (a scroll starts
     * nothing). While a take goes on, another pad plays as ever ([playPad],
     * [unsure] as there), which is how a chord goes into RSP; a tap on the
     * pad of a hands-free take (recording, or counting in or waiting for it)
     * stops it at the press, as STOP does ([samplePress]; an [unsure] one
     * once kept). A press that latched and is then taken by a swipe or a
     * scroll latches nothing ([samplePadCut]).
     */
    fun samplePadDown(pad: dev.arc.ep133.features.PhysicalPad, pressedAtNanos: Long, unsure: Boolean = false) {
        if (!sampleMode.value.on) return
        val handsFree = sampleCount?.isActive == true || recorder.going
        when (samplePress(pad, sampleHeld?.first, sampleLatched, handsFree, sampleGoing(), sampleMode.value.latch, unsure)) {
            SamplePress.STOP -> stopSampleAt(pressedAtNanos)
            SamplePress.STOP_WHEN_KEPT -> sampleStopUnsure = pad to pressedAtNanos
            SamplePress.PLAY -> {
                samplePlayed += pad
                playPad(pad, unsure = unsure, pressedAt = pressedAtNanos)
            }
            SamplePress.LATCH -> {
                latchSample(pad, pressedAtNanos)
                if (sampleLatched == pad) sampleLatchPress = pad
            }
            SamplePress.LATCH_WHEN_KEPT -> sampleLatchUnsure = pad to pressedAtNanos
            SamplePress.HOLD -> {
                // An input lost on the way (Live's output closed under RSP): open it again for this press.
                if (recorder.input == null) openSampleInput(sampleMode.value.input ?: storedSampleInput())
                if (!armSample(pad, pressedAtNanos, latched = false)) return
                sampleHeld = pad to pressedAtNanos
            }
        }
    }

    /** Arms a take into [pad]; false after a toast when there is no room left for one. */
    private fun armSample(pad: dev.arc.ep133.features.PhysicalPad, at: Long, latched: Boolean): Boolean {
        if (recorder.arm(pad, at, latched, sampleMaxFrames())) return true
        toast(dev.arc.ep133.text.MirrorText.diskLow(0), error = true)
        return false
    }

    /**
     * The finger left [pad] at [releasedAtNanos]: the take stops at that
     * moment. A tap ([SAMPLE_TAP_NS]) records nothing: it plays a pad that
     * has a sound (the device's "push the pad again"), and on an empty one
     * a toast says to hold it.
     */
    fun samplePadUp(pad: dev.arc.ep133.features.PhysicalPad, releasedAtNanos: Long) {
        if (sampleLatchPress == pad) sampleLatchPress = null
        if (samplePlayed.remove(pad)) return releasePad(pad)
        val (held, at) = sampleHeld ?: return
        if (held != pad) return
        sampleHeld = null
        if (releasedAtNanos - at < SAMPLE_TAP_NS) {
            recorder.cancel()
            if (mirror?.sampleOf(pad) != null) playPad(pad, hold = false, pressedAt = releasedAtNanos)
            else toast(dev.arc.ep133.text.MirrorText.HOLD_TO_RECORD)
            return
        }
        recorder.stop(releasedAtNanos)
    }

    /**
     * A press on the scrolling page was a press after all: with LATCH on its
     * hands-free take starts now, from the press; on the hands-free take's
     * pad it stops the take, at the press; one played beside a take goes on
     * as [keepPad] says.
     */
    fun samplePadKept(pad: dev.arc.ep133.features.PhysicalPad) {
        sampleStopUnsure?.takeIf { it.first == pad }?.let { (_, at) ->
            sampleStopUnsure = null
            // Still that pad's take (it may have run out meanwhile).
            if (sampleLatched == pad) stopSampleAt(at)
            return
        }
        sampleLatchUnsure?.takeIf { it.first == pad }?.let { (_, at) ->
            sampleLatchUnsure = null
            latchSample(pad, at)
            if (sampleLatched == pad) sampleLatchPress = pad
            return
        }
        if (pad in samplePlayed) keepPad(pad)
    }

    /**
     * The press on [pad] turned into a scroll, or a swipe between Live's
     * cards took it: its take is thrown away, or never latched (a hands-free
     * take it latched, or that take's count-in, ends with nothing), never
     * stopped; played beside one, its sound is cut.
     */
    fun samplePadCut(pad: dev.arc.ep133.features.PhysicalPad) {
        if (sampleStopUnsure?.first == pad) {
            sampleStopUnsure = null
            return
        }
        if (sampleLatchUnsure?.first == pad) {
            sampleLatchUnsure = null
            return
        }
        if (sampleLatchPress == pad) {
            sampleLatchPress = null
            if (sampleLatched == pad) {
                sampleCount?.cancel()
                sampleLatched = null
                recorder.cancel()
            }
            return
        }
        if (samplePlayed.remove(pad)) return cutPad(pad)
        if (sampleHeld?.first != pad) return
        sampleHeld = null
        recorder.cancel()
    }

    /**
     * A tap on [pad] with LATCH on (or a screen reader's click on it): a
     * hands-free take into [pad], as SHIFT + pad on the EP-133, until [stopSample].
     * With BARS set it lasts that long, after a bar's count-in on the click
     * ([countInSample]); from USB while the EP-133 sends its clock, it waits
     * for the device's PLAY instead ([waitForPlay]); while PATTERN runs, it
     * starts on the next bar. On PTN (with notes in the project) it lasts the
     * pattern's length from its next loop start ([sampleOnPattern]). A latch
     * while one goes on stops it.
     */
    fun latchSample(pad: dev.arc.ep133.features.PhysicalPad, pressedAtNanos: Long = System.nanoTime()) {
        if (!sampleMode.value.on) return
        if (sampleCount?.isActive == true || sampleLatched != null && recorder.going) return stopSample()
        if (sampleHeld != null) return
        if (recorder.input == null) openSampleInput(sampleMode.value.input ?: storedSampleInput())
        sampleLatched = pad
        val bars = settings.value.sampleBars
        val usb = recorder.input?.source == SampleSource.USB
        when {
            settings.value.samplePattern && !projectPatterns.isEmpty -> sampleOnPattern(pad, null)
            bars == null -> if (!armSample(pad, pressedAtNanos, latched = true)) sampleLatched = null
            patternRunning() -> sampleOnPattern(pad, bars)
            usb && clockFollow?.grid(System.nanoTime()) != null -> waitForPlay(pad, bars)
            else -> countInSample(pad, bars)
        }
    }

    /** STOP (LATCH's key during a hands-free take): it stops now (a count-in or a wait for PLAY just ends). */
    fun stopSample() = stopSampleAt(System.nanoTime())

    /** The hands-free take stops at [at] (a tap on its pad: the touch's time), as [stopSample]. */
    private fun stopSampleAt(at: Long) {
        sampleCount?.cancel()
        sampleLatched = null
        sampleLatchPress = null
        recorder.stop(at)
    }

    /** How long a beat is at [at]: the EP-133's while it sends its clock, else the phone's tempo. */
    private fun beatPeriodNs(at: Long): Double = clockFollow?.grid(at)?.periodNs ?: (60e9 / settings.value.liveTempo)

    /**
     * A bar's count-in on the click before a take of [bars] bars into [pad]:
     * the click comes on for it (and goes off again at the downbeat, if it
     * was off), each beat shows as it is heard, and the take is scheduled
     * for the downbeat after the count, its length in bars of the tempo. A
     * click that stops (focus taken) or never comes ends it.
     */
    private fun countInSample(pad: dev.arc.ep133.features.PhysicalPad, bars: Int) {
        val clickWas = clickOn.value
        val beats = kotlinx.coroutines.channels.Channel<dev.arc.ep133.features.Beat>(kotlinx.coroutines.channels.Channel.UNLIMITED)
        sampleCount = scope.launch {
            var started = false
            try {
                countInBeat = { beats.trySend(it) }
                if (!clickWas) setClick(true)
                if (!clickOn.value) return@launch
                val count = dev.arc.ep133.features.CountIn()
                // Following the EP-133's clock before a Start, no beat is accented: a bar of them counts from the next.
                var plain = 0
                while (true) {
                    val beat = kotlinx.coroutines.withTimeoutOrNull(BEAT_WAIT_MS) { beats.receive() } ?: return@launch
                    val accented = beat.accent || ++plain > dev.arc.ep133.features.Tempo.BEATS_PER_BAR
                    if (accented) plain = 0
                    val period = beatPeriodNs(beat.at)
                    val step = count.onBeat(beat.copy(accent = accented), period)
                    if (step == dev.arc.ep133.features.CountIn.Step.Waiting) continue
                    delayUntil(beat.at)
                    when (step) {
                        is dev.arc.ep133.features.CountIn.Step.Counting -> sampleWaiting.value = SamplePhase.CountIn(pad, step.beat)
                        is dev.arc.ep133.features.CountIn.Step.Start -> {
                            sampleWaiting.value = SamplePhase.CountIn(pad, count.beats)
                            val rate = recorder.rate ?: return@launch
                            started = recorder.schedule(pad, step.atNanos, dev.arc.ep133.features.barFrames(bars, 60e9 / period, rate), sampleMaxFrames())
                            delayUntil(step.atNanos)
                            return@launch
                        }
                    }
                }
            } finally {
                countInBeat = null
                sampleWaiting.value = null
                if (!clickWas) setClick(false)
                if (!started && sampleLatched == pad) sampleLatched = null
            }
        }
    }

    /**
     * A take of [bars] bars into [pad] from USB while the EP-133 sends its
     * clock: it starts with the device's PLAY (its first beat), whatever the
     * threshold, its length in bars of the device's tempo.
     */
    private fun waitForPlay(pad: dev.arc.ep133.features.PhysicalPad, bars: Int) {
        sampleCount = scope.launch {
            var started = false
            try {
                sampleWaiting.value = SamplePhase.WaitingForPlay(pad)
                var was = _state.value.mirror?.state?.playing
                _state.first { st ->
                    val playing = st.mirror?.state?.playing
                    dev.arc.ep133.features.followStart(playing, was).also { was = playing }
                }
                val now = System.nanoTime()
                val grid = clockFollow?.grid(now)
                // The beat PLAY started on: the one nearest now, as the news of it comes a little late.
                val at = grid?.let { it.at(it.indexFrom(now - (it.periodNs / 2).toLong())) } ?: now
                val bpm = grid?.bpm ?: settings.value.liveTempo.toDouble()
                val rate = recorder.rate ?: return@launch
                started = recorder.schedule(pad, at, dev.arc.ep133.features.barFrames(bars, bpm, rate), sampleMaxFrames())
            } finally {
                sampleWaiting.value = null
                if (!started && sampleLatched == pad) sampleLatched = null
            }
        }
    }

    private suspend fun delayUntil(nanos: Long) = delay(((nanos - System.nanoTime()) / 1_000_000L).coerceAtLeast(0L))

    /**
     * A take came in (on [scope]), saved to a file of its own first
     * ([backed]): onto the review sheet, or with Review samples off straight
     * onto its pad with the switches as last set. A review still open (a
     * take kept from the background, say) is kept as it stands first.
     */
    private fun sampleDone(take: dev.arc.ep133.audio.SampleTake) {
        // A take latched anew into the same pad as this one ended keeps its latch.
        sampleLatched = latchAfterTake(sampleLatched, take.pad, sampleCount?.isActive == true || recorder.going)
        if (stoppedInBackground) {
            stoppedInBackground = false
            toast(dev.arc.ep133.text.MirrorText.SAMPLE_BACKGROUND)
        }
        trafficLog.note("sample ${take.input.source.id}: ${take.frames} frames, ${take.channels} ch at ${take.rate} Hz, ${take.end}")
        scope.launch {
            val s = settings.value
            val occupied = if (sampleOnline()) sampleSlotsTaken() else null
            val name = dev.arc.ep133.features.SampleName.of(take.input.source, System.currentTimeMillis())
            val r = backed(
                withContext(Dispatchers.Default) {
                    sampleReviewOf(take.pad, take.input, take.pcm, take.channels, take.rate, take.end, take.latched, name, s.sampleNormalize, s.sampleTrimSilence, occupied)
                },
            )
            _sampleLastTake.value = r.peaks
            if (!s.reviewSamples) {
                keepReviewed(r)
            } else {
                _sampleReview.value?.let { keepReviewed(it) }
                stopReview()
                _sampleReview.value = r
            }
        }
    }

    /**
     * The open input went away for good ([why]); a take going on was kept
     * first. USB unplugged or the mic lost: RSP stands in, and a toast says
     * so. RSP (Live's output closed) opens again with the output.
     */
    private fun sampleLost(input: SampleInput, why: String) {
        sampleHeld = null
        sampleLatched = null
        sampleLatchPress = null
        sampleStopUnsure = null
        sampleCount?.cancel()
        if (!sampleMode.value.on || input.source == SampleSource.RSP) return
        toast(if (input.source == SampleSource.USB) dev.arc.ep133.text.MirrorText.USB_GONE else dev.arc.ep133.text.MirrorText.inputFailed(why), error = true)
        refreshSampleInputs()
        openSampleInput(SampleInput(SampleSource.RSP, input.stereo))
    }

    // Connected, with Live's read of this connection: a kept recording uploads at once.
    private fun sampleOnline() = session != null && _state.value.device != null && mirrorSession != null && mirrorSession === session

    /** The review's part kept: from frame [start], [length] frames. */
    fun setReviewTrim(start: Int, length: Int) = _sampleReview.update { r -> r?.let { trimReview(it, start, length) } }

    /** The review's Normalize, kept for the next take. */
    fun setReviewNormalize(on: Boolean) {
        _sampleReview.update { it?.copy(normalize = on) }
        changeSettings { it.copy(sampleNormalize = on) }
    }

    /** The review's Trim silence, kept for the next take. */
    fun setReviewTrimSilence(on: Boolean) {
        _sampleReview.update { r -> r?.let { withTrimSilence(it, on) } }
        changeSettings { it.copy(sampleTrimSilence = on) }
    }

    /** The slot KEEP puts the take into, while connected: a free one, or null for the next free one. */
    fun setReviewSlot(slot: Int?) = _sampleReview.update { r ->
        val free = slot?.takeIf { it in SampleUpload.FIRST_SLOT..SampleUpload.LAST_SLOT && it !in sampleSlotsTaken() }
        r?.takeIf { !it.offline }?.copy(slot = free ?: r.nextFree) ?: r
    }

    /** The review's slot − and +: [step] free slots on. */
    fun stepReviewSlot(step: Int) = _sampleReview.update { r ->
        r?.takeIf { !it.offline }?.copy(slot = stepFreeSlot(sampleSlotsTaken(), r.slot, step)) ?: r
    }

    /** The slots a review counts as in use: the device's, and those the recordings kept and not up yet go into. */
    private fun sampleSlotsTaken(): Set<Int> = slotsTaken(deviceSounds.keys, sampleQueue.map { it.held } + sampleUpNow?.held)

    /** Plays the review's part kept, as KEEP would put it on the pad (a list's single sound: it stops the one before). */
    fun playReview(): Job = scope.launch {
        val r = _sampleReview.value ?: return@launch
        val token = ++playToken
        val pcm = withContext(Dispatchers.Default) { reviewedPcm(r) }
        if (token == playToken && _sampleReview.value === r) startSound(REVIEW_KEY, pcmSoundOf(pcm, r.channels, r.rate))
    }

    /** Stops the review's sound, if it plays. */
    fun stopReview() {
        if (player.playing.value == REVIEW_KEY) player.stop()
    }

    /** KEEP: the take goes on its pad ([keepReviewed]). */
    fun keepSample() {
        val r = _sampleReview.value ?: return
        stopReview()
        _sampleReview.value = null
        keepReviewed(r)
    }

    /** RETAKE: the take goes, and the pad records again: a hands-free one at once, a held one at the next hold. */
    fun retakeSample() {
        val r = _sampleReview.value ?: return
        stopReview()
        _sampleReview.value = null
        letGo(r)
        if (r.latched) latchSample(r.pad)
    }

    /** DISCARD (or the sheet dismissed): the take goes, with UNDO on the toast. */
    fun discardSample() {
        val r = _sampleReview.value ?: return
        stopReview()
        _sampleReview.value = null
        letGo(r)
        discardedReview = r.copy(file = null)
        toast(dev.arc.ep133.text.MirrorText.SAMPLE_DISCARDED, action = dev.arc.ep133.text.MirrorText.UNDO, onAction = ::undoDiscardSample)
    }

    /** UNDO after DISCARD: the take is back on the review sheet, unless another took its place. */
    fun undoDiscardSample() {
        val r = discardedReview ?: return
        if (_sampleReview.value != null) return
        discardedReview = null
        _sampleReview.value = r
        // Backed by a file again, as every take on the sheet is.
        scope.launch {
            val b = backed(r)
            val file = b.file ?: return@launch
            var kept = false
            _sampleReview.update { cur ->
                if (cur != null && cur.pcm === r.pcm && cur.file == null) cur.copy(file = file).also { kept = true } else cur
            }
            if (!kept) letGo(b)
        }
    }

    /**
     * [r] with its take written to a file of its own in arc's samples
     * folder ([SampleReview.file]), so it outlives arc being closed before
     * KEEP; as it was when that can't be written (the phone full: KEEP then
     * says so).
     */
    private suspend fun backed(r: SampleReview): SampleReview {
        if (r.file != null) return r
        val wav = withContext(Dispatchers.Default) { SampleEdit.toWavBytes(r.pcm, r.channels, r.rate) }
        return try {
            r.copy(file = withContext(Dispatchers.IO) { sampleFiles.write(System.currentTimeMillis(), wav) }.name)
        } catch (e: java.io.IOException) {
            trafficLog.note("sample: the take couldn't be saved for its review: ${e.message}")
            r
        }
    }

    /** The take [r] was is let go of (kept, discarded, retaken): its file goes. */
    private fun letGo(r: SampleReview) {
        val file = r.file ?: return
        scope.launch(Dispatchers.IO) { sampleFiles.delete(file) }
    }

    /**
     * KEEP: the part kept, normalized if asked, as a WAV at the take's rate,
     * onto its pad ([keepOnPad]), once Live is back if arc left the screen
     * ([awaitLive]). A pad with nowhere to go (no project read, a project
     * switching, Live closed) sends it to Takes instead, never away; one that
     * can't be written goes back on the review sheet.
     */
    private fun keepReviewed(r: SampleReview): Job = scope.launch {
        val (pcm, wav) = withContext(Dispatchers.Default) { reviewedPcm(r).let { it to SampleEdit.toWavBytes(it, r.channels, r.rate) } }
        // A take stopped by leaving the screen: its pad is found once Live is back and has read.
        awaitLive()
        val kept = pcm.isNotEmpty() && when (val w = padTargetOrWhy(r.pad)) {
            is PadTargetOrWhy.Found -> keepOnPad(r, w.target, pcm, wav)
            is PadTargetOrWhy.Why -> keepInTakes(wav)
        }
        if (kept) {
            letGo(r)
        } else if (_sampleReview.value == null) {
            // Not written (the phone full): back on the review sheet, not thrown away.
            _sampleReview.value = r
        }
        // Else another take is on the sheet: this one's file is put in Takes at the next start.
    }

    /** A take with no pad to go on, kept as a take; false after a toast when it can't be written. */
    private suspend fun keepInTakes(wav: ByteArray): Boolean {
        val failed = withContext(Dispatchers.IO) {
            val f = takeStore.newFile(System.currentTimeMillis())
            runCatching { f.writeBytes(wav) }.exceptionOrNull()?.also { f.delete() }
        }
        if (failed != null) {
            toast(dev.arc.ep133.text.MirrorText.takeFailed(failed.message ?: failed.toString()), error = true)
            return false
        }
        loadTakes()
        toast(dev.arc.ep133.text.MirrorText.KEPT_IN_TAKES)
        return true
    }

    /**
     * A kept take onto [t]'s pad: its WAV ([wav], [pcm] as samples) is saved
     * in arc's samples folder and put on the pad as a recorded change
     * ([SoundSource.RECORDED]), so the pad plays it at once, from memory,
     * and with fresh settings, as on the EP-133. Connected, it uploads in
     * the background ([uploadSamples]); offline, it waits for the next
     * connection's question. A recording still on the pad and not on its
     * way up goes to Takes. False after a toast when the file can't be
     * written (nothing is changed then).
     */
    private suspend fun keepOnPad(r: SampleReview, t: dev.arc.ep133.features.PadTarget, pcm: ShortArray, wav: ByteArray): Boolean {
        val file = try {
            withContext(Dispatchers.IO) { sampleFiles.write(System.currentTimeMillis(), wav) }
        } catch (e: java.io.IOException) {
            toast(dev.arc.ep133.text.MirrorText.takeFailed(e.message ?: e.toString()), error = true)
            return false
        }
        val before = loadOfflinePads()
        val pads = before.put(OfflinePad(t.project, t.group, t.pad, 0, r.name, SoundSource.RECORDED, file.name))
        // The recording it replaces, unless it is going up already: out of the queue, and into Takes.
        val replaced = recordingsLetGo(before, pads, samplesGoingUp)
        replaced.forEach { old -> sampleQueue.removeAll { it.file == old.file } }
        val m = mirror
        val online = sampleOnline() && m != null
        // Queued first, so it never counts as an offline change.
        if (online) sampleQueue += QueuedSample(r.pad, file.name, r.slot?.takeIf { it != r.nextFree }, r.slot)
        saveOfflinePads(pads)
        recordingsToTakes(replaced)
        // The new sound comes with its own settings, as on the device.
        saveOfflinePadSettings(loadOfflinePadSettings().drop(t.project, t.group, t.pad))
        forgetPadSettings(t)
        val sound = pcmSoundOf(pcm, r.channels, r.rate)
        padMemory.put(recordedKey(file.name), sound)
        prepareLive(listOf(sound))
        if (online && m != null) {
            localChanged(m, connectedLocal(pads, samplesShown()))
            uploadSamples()
        } else {
            m?.takeIf { mirrorSession == null }?.let { localChanged(it, pads) }
            toast(dev.arc.ep133.text.MirrorText.sampleQueued(r.pad))
        }
        return true
    }

    /** The recordings on their way up while connected, by file: queued, or going now. */
    private fun samplesUploading(): Set<String> = sampleQueue.mapTo(HashSet()) { it.file } + samplesGoingUp

    /** The recordings a connected mirror plays from arc: those on their way up, and those whose upload failed. */
    private fun samplesShown(): Set<String> = samplesUploading() + samplesFailed

    /**
     * The one worker uploading the recordings kept while connected, oldest
     * first, while Live plays on: SAMPLE's header shows the progress. Each
     * done goes on its pad and leaves arc's folder. One that fails stays an
     * offline change, its pad still playing it from arc, and the question
     * about offline changes asks at once whether to write it (try again) or
     * discard it (into Takes); those left when the connection goes are asked
     * about at the next one.
     */
    private fun uploadSamples() {
        if (sampleUploader?.isActive == true) return
        sampleUploader = scope.launch {
            while (true) {
                val q = sampleQueue.firstOrNull() ?: break
                val s = session
                if (s == null || _state.value.device == null) {
                    sampleQueue.clear()
                    break
                }
                sampleQueue.removeAt(0)
                // Going up from the moment it leaves the queue: a Reset, Discard or KEEP meanwhile leaves it be.
                samplesGoingUp += q.file
                val p = try {
                    // Replaced, discarded or reset before it left the queue.
                    loadOfflinePads().list.firstOrNull { it.file == q.file } ?: continue
                } finally {
                    samplesGoingUp -= q.file
                }
                val t = dev.arc.ep133.features.PadTarget(p.project, p.group, p.pad, mirror?.slotAt(p.group, p.pad))
                sampleUpNow = q
                val up = try {
                    uploadRecorded(s, p, t, q.pad, q.slot)
                } finally {
                    sampleUpNow = null
                }
                if (up != null) {
                    toast(dev.arc.ep133.text.MirrorText.sampleSaved(q.pad))
                } else if (q.file in samplesFailed && session === s) {
                    // Asked about now, not at the next connection: Write tries it again.
                    offerOfflinePads(s)
                }
                showOfflineCount()
                mirror?.takeIf { mirrorSession != null && mirrorSession === session }?.let { localChanged(it, connectedLocal(loadOfflinePads(), samplesShown())) }
                refreshSampleSpace()
            }
        }
    }

    /** The free space SAMPLE caps takes with, from the device as last read. */
    private fun refreshSampleSpace() {
        val free = _state.value.device?.storage?.free ?: return
        sampleMode.update { it.copy(free = free) }
    }

    /**
     * Uploads recording [p] onto [t]'s pad ([slot], else the next free one),
     * its progress in SAMPLE's header when its physical [pad] is known: one at
     * a time, whoever asks, and on its way up ([samplesGoingUp]) from the
     * call, waiting its turn included. Once on the device, the pad plays the
     * device's sound (kept from the recording, so not read back), and the
     * recording's change and file go. One replaced on its pad while it
     * waited goes to Takes instead. Returns the slot; null after a toast
     * said why not (a failure is marked in [samplesFailed]).
     */
    private suspend fun uploadRecorded(
        s: Session,
        p: OfflinePad,
        t: dev.arc.ep133.features.PadTarget,
        pad: dev.arc.ep133.features.PhysicalPad?,
        slot: Int? = null,
    ): Int? {
        val name = p.file ?: return null
        samplesGoingUp += name
        try {
            return sampleUploadLock.withLock {
                try {
                    uploadRecordedNow(s, p, name, t, pad, slot)
                } finally {
                    // Inside the lock: the next upload's progress is its own.
                    sampleUploading.value = null
                }
            }
        } finally {
            samplesGoingUp -= name
        }
    }

    private suspend fun uploadRecordedNow(
        s: Session,
        p: OfflinePad,
        name: String,
        t: dev.arc.ep133.features.PadTarget,
        pad: dev.arc.ep133.features.PhysicalPad?,
        slot: Int?,
    ): Int? {
        // A KEEP put a newer take on its pad while it waited: nothing to upload, and nothing else offers it.
        if (loadOfflinePads().list.none { it.file == name }) {
            recordingsToTakes(listOf(p))
            return null
        }
        val wav = try {
            withContext(Dispatchers.IO) { sampleFiles.file(name).readBytes() }
        } catch (e: java.io.IOException) {
            samplesFailed += name
            toast(dev.arc.ep133.text.MirrorText.uploadFailed(e.message ?: e.toString()), error = true)
            return null
        }
        pad?.let { sampleUploading.value = SamplePhase.Uploading(it, 0) }
        val keep: suspend (Int) -> Unit = { into ->
            // Kept before the pad's copy is looked for, so the background copy never reads it back.
            deviceSounds[into]?.let { e ->
                val w = withContext(Dispatchers.Default) { Wav.decode(wav) }
                keepPadSound(into, e.name, e.size, w.pcm, w.channels.toDouble(), w.sampleRate.toDouble())
            }
        }
        val into = uploadBytesToPad(s, p.name, wav, t, slot, task = false, kept = keep) { progress ->
            pad?.let { sampleUploading.value = SamplePhase.Uploading(it, (progress.fraction * 100).toInt().coerceIn(0, 100)) }
        }
        if (into == null) {
            if (session === s) samplesFailed += name
            return null
        }
        samplesFailed -= name
        saveOfflinePads(OfflinePads(loadOfflinePads().list.filterNot { it.file == name }))
        padMemory.remove(recordedKey(name))
        withContext(Dispatchers.IO) { sampleFiles.delete(name) }
        return into
    }

    /** Recordings among [entries] moved into Takes (their pad changes dropped elsewhere); how many were. */
    private suspend fun recordingsToTakes(entries: List<OfflinePad>): Int {
        val files = entries.filter { it.source == SoundSource.RECORDED }.mapNotNull { it.file }
        if (files.isEmpty()) return 0
        files.forEach { padMemory.remove(recordedKey(it)) }
        val moved = withContext(Dispatchers.IO) { files.count { sampleFiles.moveToTakes(it, takeStore) } }
        loadTakes()
        return moved
    }

    /** A recording's sound read from arc's samples folder; null when its file is gone. */
    private suspend fun loadRecorded(name: String): PcmSound? {
        val wav = withContext(Dispatchers.IO) { sampleFiles.file(name).takeIf { it.isFile }?.readBytes() } ?: return null
        return withContext(Dispatchers.Default) { PcmSound.ofWav(wav) }
    }

    // ---------- FX: the master effect, sends, compressor, sidechain, punch-ins (an addition) ----------

    // Every project's FX, read from their file once: in arc's own files, as they never go on the EP-133.
    // Before PATTERN's, whose plan asks [shapeFor] (the sidechain's source) as it starts.
    private val fxFile by lazy { java.io.File(context.filesDir, "fx.json") }
    // Each change goes straight to Live's output, which keeps the last of each for the next output.
    private val fxDesk = FxDesk(liveAudio::control) { saveFx() }
    // The knobs turn many times a second: fx.json is written once they rest.
    private var fxSave: Job? = null

    /** The FX of the project Live shows (the FX sheet and key). */
    val fx: StateFlow<dev.arc.ep133.features.FxSettings> get() = fxDesk.fx

    /** The punch-in slots held, in the order pressed (the display line's PUNCH). */
    val punches: StateFlow<Set<Int>> get() = fxDesk.punches

    init {
        scope.launch { loadFx() }
        // Another project (switched on the device, by PROJECT, or offline): its own FX.
        scope.launch {
            _state.map { it.mirror?.state?.activeProject }.filterNotNull().distinctUntilChanged().collect { fxDesk.switchTo(it) }
        }
        // The sidechain's source moved, on or off: the voices started from now duck as it says.
        scope.launch {
            fxDesk.fx.map { it.sidechain.on to (it.sidechain.group to it.sidechain.pad) }.distinctUntilChanged().drop(1)
                .collect { refreshPatternPlan() }
        }
        // The tempo Live plays at (the pattern's: the EP-133's while it sends its clock, else the
        // phone's), for the delay's divisions and the punch-ins' beats.
        scope.launch {
            combine(_state.map { s -> s.mirror?.state?.bpm }.distinctUntilChanged(), settings.map { it.liveTempo }.distinctUntilChanged()) { device, tempo ->
                patternBpm(device, tempo)
            }.distinctUntilChanged().collect { liveAudio.control(dev.arc.ep133.formats.fx.FxControl.TEMPO, 0, it.toFloat(), 0f) }
        }
    }

    /** fx.json, read once; what was changed before it was read is kept over it. Its settings reach the output then. */
    private suspend fun loadFx() {
        if (fxDesk.loaded) return
        val read = withContext(Dispatchers.IO) {
            runCatching { dev.arc.ep133.features.FxBook.fromJson(fxFile.readText()) }.getOrNull()
        }
        if (fxDesk.load(read)) saveFx()
    }

    /** Keeps every project's FX once the knobs rest (written whole, then renamed over the file); none deletes it. */
    private fun saveFx() {
        if (!fxDesk.loaded) return
        fxSave?.cancel()
        fxSave = scope.launch {
            delay(FX_SAVE_MS)
            val text = fxDesk.json()
            withContext(kotlinx.coroutines.NonCancellable + Dispatchers.IO) {
                synchronized(fxFile) {
                    runCatching {
                        if (text == null) {
                            fxFile.delete()
                        } else {
                            val tmp = java.io.File(fxFile.path + ".tmp")
                            tmp.writeText(text)
                            if (!tmp.renameTo(fxFile)) tmp.delete()
                        }
                    }
                }
            }
        }
    }

    /** The effect: [type], or none when [type] is on already (its key tapped again). */
    fun setFxType(type: dev.arc.ep133.features.FxType, group: Int? = null) = fxDesk.setType(type, group)

    /** The effect's X and Y knobs (0..1). */
    fun setFxXY(x: Float, y: Float) = fxDesk.setXY(x, y)

    /** Group [group]'s (0..3, A..D) send to the effect (0..1). */
    fun setFxSend(group: Int, v: Float) = fxDesk.setSend(group, v)

    /** The master compressor: on or off, its drive [x] and speed [y] (0..1); what is left out stays. */
    fun setComp(on: Boolean = fx.value.comp.on, x: Float = fx.value.comp.x, y: Float = fx.value.comp.y) = fxDesk.setComp(on, x, y)

    /** The sidechain on or off. */
    fun setSidechainOn(on: Boolean) = fxDesk.setSidechainOn(on)

    /** The sidechain's source: the selected pad, [pad] (0..11) of [group] (0..3). */
    fun setSidechainSource(group: Int, pad: Int) = fxDesk.setSidechainSource(group, pad)

    /** Group [group] (0..3) ducked by the sidechain, or no longer. */
    fun toggleSidechainDest(group: Int) = fxDesk.toggleSidechainDest(group)

    /** The duck's length [x] and shape [y] (0..1). */
    fun setSidechainXY(x: Float, y: Float) = fxDesk.setSidechainXY(x, y)

    /**
     * A punch-in pressed while FX is held: [slot] (0..11, [punchSlotForPad]
     * of the pad) at [depth] (0..1; a press however light punches in). Sent
     * on the caller's thread, so it is heard with the next burst.
     */
    fun punchDown(slot: Int, depth: Float) = fxDesk.punchDown(slot, depth)

    /** A punch-in held goes deeper or lighter (the finger's pressure or place on the pad). */
    fun punchMove(slot: Int, depth: Float) = fxDesk.punchMove(slot, depth)

    /** A punch-in's pad let go of. */
    fun punchUp(slot: Int) = fxDesk.punchUp(slot)

    /** FX let go of: every punch-in with it. */
    fun punchAllUp() = fxDesk.punchAllUp()

    // ---------- PATTERN: record and play on the phone (an addition) ----------

    // Every project's patterns, read from their file once: in arc's own files, as they never go on the EP-133.
    private val patternsFile by lazy { java.io.File(context.filesDir, "patterns.json") }
    @Volatile
    private var patterns = dev.arc.ep133.features.Patterns.EMPTY
    private var patternsLoaded = false
    // Something was recorded or changed before the file was read: it is newer than the file.
    private var patternsTouched = false
    // The project the patterns played and recorded are (0: none known yet), its sequencer as it stands, and the
    // patterns its scene plays (projectSeq.playing(), kept as one value so a change is told by identity).
    private var patternProject = 0
    private var projectSeq = dev.arc.ep133.features.ProjectSeq.DEFAULT
    @Volatile
    private var projectPatterns = ProjectPatterns()
    // A recorder (and its UNDO) for each project this run: a note's id is its recorder's own. Its seq is the project's.
    private val patternRecorders = HashMap<Int, dev.arc.ep133.features.PatternRecorder>()
    private val patternRecorder get() = patternRecorders.getOrPut(patternProject) { dev.arc.ep133.features.PatternRecorder() }
    private val transport = dev.arc.ep133.features.Transport()
    // The sequencer, fed by Live's output on its own thread.
    private val patternScheduler = dev.arc.ep133.audio.PatternScheduler()
    private val _pattern = MutableStateFlow(PatternUiState())

    /** PATTERN, for Live's line and the pattern sheet; where it is in the loop is [patternPosition]. */
    val pattern: StateFlow<PatternUiState> =
        combine(_pattern, settings) { p, s -> p.copy(timing = s.patternTiming, countInOn = s.patternCountIn, autoLength = s.patternAutoLength) }
            .stateIn(
                scope,
                kotlinx.coroutines.flow.SharingStarted.Eagerly,
                PatternUiState(timing = settings.value.patternTiming, countInOn = settings.value.patternCountIn, autoLength = settings.value.patternAutoLength),
            )

    // The pads and notes held while recording, by their voice's key ("live:g:o", "note:n"): their notes, for the gate.
    private val patternHeld = HashMap<String, Int>()
    // The ticks a held note's start was moved from where it was heard (by its id), for its release to follow.
    private val patternShifts = HashMap<Int, Double>()
    // The run began with a count-in: a press made while the player still hears it stays in it.
    private var patternCountedIn = false
    // The pass of each note recorded that was heard live as it was played (by its id): not played again.
    private var patternSkip: Map<Int, Long> = emptyMap()
    // The groups recorded into since the punch-in: each of their passes is an UNDO step.
    private val patternGroups = HashSet<Int>()
    // Pad sounds loading for the patterns, and those found nowhere (asked again at the next PLAY), by sample key.
    private val patternLoading = HashSet<String>()
    private val patternTried = HashSet<String>()
    // ERASE held on pads while playing, by "group:offset:semitones".
    private val eraseHolds = HashMap<String, EraseHold>()
    // Follows the transport while it runs: the count-in's beats, AUTO length, passes, ERASE held.
    private var patternLoop: Job? = null
    // The press a pad started this run with (tick 0 there), for the presses before its timeline is out.
    private var patternPressAt: Long? = null
    // The timeline of the run before the transport last started: one the sequencer never got to drop
    // (Live's output closed under it) isn't this run's. Read on the click's thread too.
    @Volatile
    private var staleTimeline: dev.arc.ep133.audio.Timeline? = null
    // The count-in asked for the click, and turned it on (off again at bar 1).
    private var countInClickAsked = false
    private var countInClick = false

    /** A pad (a KEYS note on it: [semitones]) held in ERASE from [downAt]; [from] is the tick it has erased to, once it holds. */
    private class EraseHold(val pad: dev.arc.ep133.features.PhysicalPad, val semitones: Int?, val downAt: Long) {
        var from: Double? = null
    }

    // The arp's notes, the pads loading for it and those found nowhere this run, and pressure's last plan and the next.
    private val arpDesk = ArpDesk()
    private val arpLoading = HashSet<dev.arc.ep133.features.PhysicalPad>()
    private val arpTried = HashSet<dev.arc.ep133.features.PhysicalPad>()
    private var arpPressureAt = 0L
    private var arpPressureJob: Job? = null
    private val _arp = MutableStateFlow(arpDesk.ui(settings.value.arpOn, settings.value.arp, settings.value.timing, settings.value.keysNames))

    /** ARP / RPT for Live: on, latched, the notes it plays, the settings and TIMING, and the display line while it plays. */
    val arp: StateFlow<ArpUi> = _arp.asStateFlow()

    // The STEP panel, the cursors and CORRECT; the notes auditioned (by voice key, let go of after their gate); the line's count's end.
    private val stepDesk = StepDesk { n -> stepWord(n, mirror?.nameOf(n.pad), settings.value.keysNames) }
    private val stepAuditions = HashMap<String, Job>()
    private var stepShown: Job? = null
    private val _step = MutableStateFlow(StepUi())

    /** STEP for Live: the panel, the cursor's step on the group's pattern, NUDGE and CORRECT, and the status line. */
    val step: StateFlow<StepUi> = _step.asStateFlow()

    // The scene panel, the picks waiting for their tick and the clipboard; the pads tapped on the scrolling page that the PAD flow may take.
    private val sceneDesk = SceneDesk { pad -> stepWord(StepNote(pad, null), mirror?.nameOf(pad), settings.value.keysNames) }
    private val sceneTaps = HashSet<String>()
    private val _scene = MutableStateFlow(SceneUi(switchTime = settings.value.sceneSwitch))

    /** SCENE for Live: the scene, each group's pattern and what waits to take over, the panel, the 1–99 grid, the CLIP row and the status line. */
    val scene: StateFlow<SceneUi> = _scene.asStateFlow()

    init {
        liveAudio.sequencer = patternScheduler
        // Make up for Bluetooth delay: the setting, to Live's output (which reads it on its own threads).
        liveAudio.makeUpDelay(settings.value.makeUpDelay)
        scope.launch { settings.map { it.makeUpDelay }.distinctUntilChanged().collect { liveAudio.makeUpDelay(it) } }
        // A note whose pad has no sound in the plan, told on the output's thread: the plan is made again here.
        patternScheduler.onMissing = { scope.launch { refreshPatternPlan() } }
        // A call, or another app's sound: the pattern and the arp stop, as the voices did.
        liveAudio.onFocusLost = {
            patternStop()
            arpClear()
        }
        scope.launch { loadPatterns() }
        // Another project (switched on the device, by PROJECT, or offline): its own patterns.
        scope.launch {
            _state.map { it.mirror?.state?.activeProject }.filterNotNull().distinctUntilChanged().collect { switchPatterns(it) }
        }
        // TEMPO's tempo: the EP-133's while it sends its clock, else the phone's.
        scope.launch {
            // As the plan rounds it: the clock's tempo, measured afresh with every state, changes in its last digits all along.
            combine(_state.map { s -> s.mirror?.state?.bpm?.let { patternBpm(it, dev.arc.ep133.features.Tempo.DEFAULT) } }.distinctUntilChanged(), settings.map { it.liveTempo }.distinctUntilChanged()) { _, _ -> }
                .collect {
                    refreshPatternPlan()
                    publishArp()
                }
        }
    }

    init {
        // TIMING's interval and swing: the STEP panel's cursor keeps its place on the new grid.
        scope.launch {
            settings.map { it.timing }.distinctUntilChanged().drop(1).collect { publishStep() }
        }
        // The scene change setting: the panel's CHANGE chip follows.
        scope.launch {
            settings.map { it.sceneSwitch }.distinctUntilChanged().drop(1).collect { publishScene() }
        }
    }

    init {
        // A step played while the pattern runs, told on the output's thread: recorded here.
        patternScheduler.onArpStep = { step -> scope.launch { recordArpStep(step) } }
        // The settings: TIMING, the arp's, ARP on or off (off, its notes go), the notes' names.
        scope.launch {
            settings.map { listOf(it.arpOn, it.arp, it.timing, it.keysNames) }.distinctUntilChanged().drop(1).collect {
                if (!settings.value.arpOn) arpDesk.clear()
                publishArp()
            }
        }
    }

    /** The patterns' file, read once; what was recorded before it was read is kept over it. */
    private suspend fun loadPatterns() {
        if (patternsLoaded) return
        val read = withContext(Dispatchers.IO) {
            runCatching { dev.arc.ep133.features.Patterns.fromJson(patternsFile.readText()) }.getOrNull()
        } ?: dev.arc.ep133.features.Patterns.EMPTY
        if (patternsLoaded) return
        patternsLoaded = true
        if (patternsTouched) {
            patterns = read.put(patternProject, projectSeq)
            savePatterns()
            return
        }
        patterns = read
        useSeq(read.of(patternProject))
        refreshPatternPlan()
        showPattern()
    }

    /** Keeps the patterns (written whole, then renamed over the file); none deletes the file. */
    private fun savePatterns() {
        if (!patternsLoaded) return
        val all = patterns.put(patternProject, projectSeq)
        patterns = all
        scope.launch(Dispatchers.IO) {
            synchronized(patternsFile) {
                if (patterns !== all) return@synchronized // newer patterns are on their way
                runCatching {
                    if (all.projects.isEmpty()) {
                        patternsFile.delete()
                    } else {
                        val tmp = java.io.File(patternsFile.path + ".tmp")
                        tmp.writeText(all.toJson())
                        if (!tmp.renameTo(patternsFile)) tmp.delete()
                    }
                }
            }
        }
    }

    /** Live shows [project]: the transport stops, the patterns are kept, and that project's come in. */
    private suspend fun switchPatterns(project: Int) {
        loadPatterns()
        if (project == patternProject) return
        // The scene panel, its picks waiting and its clipboard are the other project's: dropped, not applied by the STOP.
        sceneDesk.reset()
        sceneTaps.clear()
        patternStop()
        // The arp's notes were the other project's pads, and so was the STEP panel's pattern.
        arpClear()
        closeStep()
        savePatterns()
        patternProject = project
        stepDesk.project = project
        useSeq(patterns.of(project))
        patternSkip = emptyMap()
        patternTried.clear()
        _pattern.update { it.copy(project = project) }
        refreshPatternPlan()
        showPattern()
    }

    /** The project's sequencer is [seq] now, the patterns playing its scene's; the recorder's seq follows. */
    private fun useSeq(seq: dev.arc.ep133.features.ProjectSeq) {
        projectSeq = seq
        projectPatterns = seq.playing()
        patternRecorder.seq = seq
    }

    /** The project's patterns are [p] now (back in their scene's slots): the sequencer and the line follow, and (not recording) they are kept. */
    private fun setPatterns(p: ProjectPatterns) {
        if (p === projectPatterns) return
        projectSeq = projectSeq.withPlaying(p)
        projectPatterns = p
        patternRecorder.seq = projectSeq
        patternsTouched = true
        refreshPatternPlan()
        showPattern()
        // Recording, they are kept at the punch-out.
        if (!transport.state.recording) savePatterns()
    }

    /**
     * The project's sequencer is [seq] now after a pick, an edit of the scenes or the banks, or an UNDO: the
     * patterns playing, the sequencer and Live follow, and (not recording) it is kept.
     */
    private fun setSeq(seq: dev.arc.ep133.features.ProjectSeq) {
        if (seq === projectSeq) return
        useSeq(seq)
        patternsTouched = true
        refreshPatternPlan()
        showPattern()
        // Recording, it is kept at the punch-out.
        if (!transport.state.recording) savePatterns()
    }

    private fun showPattern() {
        _pattern.update { patternShown(it, projectPatterns, transport.state, patternRecorder.canUndo) }
        publishStep()
        publishScene()
    }

    /**
     * Hands the sequencer what it plays ([dev.arc.ep133.audio.SeqPlan]): the
     * patterns and those waiting to take over a group, the sounds of their
     * pads in memory as each pad plays them
     * (its settings as known), the passes heard live, and TEMPO's tempo. Not
     * when nothing changed. Pads whose sounds aren't in memory load quietly,
     * from arc's copies or a backup ([loadPatternPad]); the line counts them.
     */
    private fun refreshPatternPlan() {
        val p = projectPatterns
        val m = mirror
        // The picks waiting, as the patterns that take over: read from the sequencer as it stands, so a note recorded meanwhile is in them.
        val queued = sceneDesk.targets(projectSeq).mapValues { (g, q) -> dev.arc.ep133.audio.QueuedSwitch(projectSeq.pattern(g, q.to), q.at) }
        val pads = queued.entries.fold(p.usedPads()) { all, (g, q) -> all + q.pattern.playable().map { dev.arc.ep133.features.PhysicalPad(g, it.offset) } }
        val (voices, missing) = patternVoices(pads, ::padInMemory, { pad, keys -> shapeFor(pad, keys) }) { pad -> m?.sampleOf(pad) != null }
        val bpm = patternBpm(_state.value.mirror?.state?.bpm, settings.value.liveTempo)
        val old = patternScheduler.plan
        if (old.patterns !== p || old.skip !== patternSkip || old.bpm != bpm || old.queued != queued || !sameVoices(old.voices, voices)) {
            patternScheduler.plan = dev.arc.ep133.audio.SeqPlan(p, voices, patternSkip, bpm, queued)
        }
        for (pad in missing) loadPatternPad(pad)
        if (_pattern.value.missing != missing.size) _pattern.update { it.copy(missing = missing.size) }
    }

    /** [pad]'s sound into memory for the patterns, as the preload has it (no device, no toast); the plan follows. */
    private fun loadPatternPad(pad: dev.arc.ep133.features.PhysicalPad) {
        val m = mirror ?: return
        val sample = m.sampleOf(pad) ?: return
        val key = sampleKey(sample)
        // A press loading it puts it in memory, and the plan follows from there.
        if (padMemory.containsKey(key) || key in patternLoading || key in patternTried || key in padLoads) return
        patternLoading += key
        scope.launch {
            val a = runCatching { loadSampleAudio(sample) }.getOrNull()
            patternLoading -= key
            if (a == null) {
                patternTried += key
                return@launch
            }
            if (mirror !== m) return@launch
            padMemory.put(key, a)
            prepareLive(listOf(a))
            refreshPatternPlan()
        }
    }

    /** Where this run of the transport is heard, once it is; null while stopped. */
    private fun heardTimeline(): dev.arc.ep133.audio.Timeline? =
        patternScheduler.timeline.value?.takeIf { patternScheduler.playing && it !== staleTimeline }

    /**
     * The tick heard at [nanos] in this run: by its [heardTimeline], or
     * before that is out, from the pad's press that started it; null while
     * neither is known.
     */
    private fun patternTickAt(nanos: Long): Double? =
        heardTimeline()?.tickAt(nanos) ?: patternPressAt?.takeIf { patternScheduler.playing }?.let { pressTickAt(nanos, it, patternScheduler.plan.bpm) }

    /**
     * How late Live's output is heard now, in nanoseconds: what is made up for
     * ([dev.arc.ep133.audio.OutputDelay]); 0 wired, with the setting off or closed.
     */
    private fun heardDelay(): Long = liveAudio.delayNs

    /**
     * The tick the player hears at [nanos], as [patternTickAt] but through the
     * output's delay: what the playhead shows and where a live press lands.
     * The pattern's clock is arc's own and its notes stay where they are (see
     * [dev.arc.ep133.audio.PatternScheduler]); only what is lined up with the ear moves.
     * A press that started the run, before its timeline is out, is counted
     * from the press all the same.
     */
    private fun patternHeardTickAt(nanos: Long): Double? {
        val d = heardDelay()
        heardTimeline()?.let { return it.heardTickAt(nanos, d) }
        return patternPressAt?.takeIf { patternScheduler.playing }?.let { pressTickAt(nanos - d, it, patternScheduler.plan.bpm) }
    }

    /** The first [heardTimeline] of this run, waited for. */
    private suspend fun awaitTimeline(): dev.arc.ep133.audio.Timeline? =
        patternScheduler.timeline.first { it != null && it !== staleTimeline }

    /** Counting in or playing. */
    private fun patternRunning() = transport.state.phase.let { it == TransportPhase.COUNT_IN || it == TransportPhase.PLAYING }

    /** RECORD goes down at [at] (the touch's time): armed or disarmed; running, recording on or off. */
    fun patternRecordDown(at: Long) = patternAct { transport.recordDown(at) }

    /** RECORD comes up at [at]: held a while after it punched in, recording stops with it. */
    fun patternRecordUp(at: Long) = patternAct { transport.recordUp(at) }

    /**
     * PLAY: stopped, the patterns play from bar 1; armed, they record too,
     * after a bar's count-in (the setting) unless RECORD is held as PLAY is
     * pressed ([recordHeld]); running, they stop.
     */
    fun patternPlay(recordHeld: Boolean = false) = patternAct { transport.play(recordHeld, settings.value.patternCountIn) }

    /** Stops the transport (and recording, kept), and disarms RECORD. */
    fun patternStop() = patternAct { transport.stop() }

    /**
     * A pad or KEYS note played at [at] (not in SAMPLE or the STEP panel): with RECORD armed,
     * the recording starts right there, bar 1 on the press, as on the
     * device. True when it did: that press is the run's first note.
     */
    private fun patternPadDown(at: Long): Boolean {
        if (!pressArms(transport.state.phase, sampleMode.value.on, stepDesk.open)) return false
        patternAct { transport.padDown(at) }
        return transport.state.recording
    }

    /** What [step] asks of the transport, done; [extraLeadNs] puts a start that much later still. */
    private fun patternAct(extraLeadNs: Long = 0L, step: () -> TransportAction) {
        val was = transport.state
        when (val a = step()) {
            is TransportAction.Start -> startPattern(a, extraLeadNs)
            TransportAction.Stop -> stopPattern(was.recording)
            // Counting in, the recording of the start is asked for again: as from stop.
            TransportAction.PunchIn -> punchIn(fromStop = was.phase == TransportPhase.COUNT_IN)
            TransportAction.PunchOut -> punchOut()
            TransportAction.None -> Unit
        }
        // Armed, Live's output is open and tells its clock, so a pad's press finds the frame it was heard at.
        val armed = transport.state.phase == TransportPhase.ARMED
        patternScheduler.armed = armed
        if (armed && !liveAudio.isOpen) openLiveAudio()
        // The STEP panel is for a stopped transport: one that starts folds it.
        if (stepDesk.open && transport.state.phase != TransportPhase.STOPPED) closeStep()
        showPattern()
    }

    /**
     * The transport starts ([a]), on Live's output (opened for it if Live
     * hadn't): the sequencer anchors bar 1 after the count-in, if any (the
     * click comes on for it), or on the pad's press that started it, and its
     * loop follows. No output: a toast, and it stays stopped.
     */
    private fun startPattern(a: TransportAction.Start, extraLeadNs: Long) {
        if (!liveAudio.isOpen) openLiveAudio()
        if (!liveAudio.isOpen) {
            transport.stop()
            toast(dev.arc.ep133.text.MirrorText.NO_OUTPUT, error = true)
            return
        }
        // The STEP panel's auditions go: their release, due later, would cut the pattern's own notes on their keys.
        auditionsEnd()
        // PLAY starts the passes from 0: what was heard live in another run is played again.
        patternSkip = emptyMap()
        patternHeld.clear()
        patternShifts.clear()
        patternGroups.clear()
        patternTried.clear()
        countInClickAsked = false
        patternPressAt = a.at
        patternCountedIn = a.countInBars > 0
        staleTimeline = patternScheduler.timeline.value
        _pattern.update { it.copy(countIn = null) }
        if (a.record) setPatterns(patternRecorder.punchIn(projectPatterns, fromStop = true, settings.value.patternAutoLength))
        refreshPatternPlan()
        patternScheduler.play(a.countInBars, if (a.countInBars > 0) COUNT_IN_LEAD_NS else extraLeadNs, a.at)
        followPattern()
    }

    /** The transport stopped: recording ([wasRecording]) ends where it is heard, the sequencer lets go, and the patterns are kept. */
    private fun stopPattern(wasRecording: Boolean) {
        patternLoop?.cancel()
        patternLoop = null
        if (wasRecording) {
            // Where the player stops it is where they hear it.
            val tick = patternHeardTickAt(System.nanoTime()) ?: 0.0
            setPatterns(patternRecorder.punchOut(heldNotesEnded(projectPatterns, patternRecorder, patternHeld.values, tick, patternShifts), tick))
        }
        patternScheduler.stop()
        // A pick still waiting takes over at once, as every change does while stopped.
        sceneFlush()
        patternPressAt = null
        patternHeld.clear()
        eraseHolds.clear()
        // The pads held to correct let go; the line keeps their count a moment.
        if (stepDesk.holding) {
            stepDesk.holdsEnd(patternRecorder)
            stepCorrectedShown()
        }
        patternSkip = emptyMap()
        patternShifts.clear()
        countInClickOff()
        _pattern.update { it.copy(countIn = null) }
        refreshPatternPlan()
        savePatterns()
    }

    /** Recording starts while running ([fromStop]: in the count-in, where AUTO length may open empty groups). */
    private fun punchIn(fromStop: Boolean) {
        patternGroups.clear()
        setPatterns(patternRecorder.punchIn(projectPatterns, fromStop, settings.value.patternAutoLength))
    }

    /** Recording stops where it is heard, and the patterns are kept; playing goes on. */
    private fun punchOut() {
        val tick = patternHeardTickAt(System.nanoTime()) ?: 0.0
        // A pad or key still held ends its note here: a lift after the punch-out records nothing.
        val p = heldNotesEnded(projectPatterns, patternRecorder, patternHeld.values, tick, patternShifts)
        patternHeld.clear()
        patternShifts.clear()
        setPatterns(patternRecorder.punchOut(p, tick))
        savePatterns()
    }

    /**
     * While the transport runs, from the first time it is heard: the
     * count-in's beats as they are heard (then PLAYING), the picks waiting
     * for their tick, AUTO length and the passes of the groups recorded into,
     * ERASE and CORRECT held. It wakes on each beat, on the tick a pick waits
     * for, and more often while ERASE or CORRECT is held.
     */
    private fun followPattern() {
        patternLoop?.cancel()
        patternLoop = scope.launch {
            while (true) {
                val tl = heardTimeline() ?: awaitTimeline() ?: continue
                val now = System.nanoTime()
                // What the eye follows is what is heard.
                val late = heardDelay()
                val tick = tl.heardTickAt(now, late)
                followTick(tl, tick, now, late)
                val next = tl.heardNanosOf((floor(tick / Seq.PPQN).toLong() + 1) * Seq.PPQN, late)
                // A pick waiting is found on its tick (and its grace), not on the next beat.
                val due = sceneDesk.dueTick()?.let { (tl.heardNanosOf(it, late) + SCENE_GRACE_NS - now) / 1_000_000L + 1 } ?: Long.MAX_VALUE
                delay(minOf((next - now) / 1_000_000L + 1, due).coerceIn(1L, if (eraseHolds.isEmpty() && !stepDesk.holding) PATTERN_LOOP_MS else PATTERN_ERASE_MS))
            }
        }
    }

    // [tick] is the tick heard at [now], the output playing [late] nanoseconds late.
    private fun followTick(tl: dev.arc.ep133.audio.Timeline, tick: Double, now: Long, late: Long) {
        if (transport.state.phase == TransportPhase.COUNT_IN) {
            // The click comes on for the count-in once its beats are known, so it clicks them from the first.
            if (!countInClickAsked) {
                countInClickAsked = true
                if (!clickOn.value) {
                    setClick(true)
                    countInClick = clickOn.value
                }
            }
            if (tick < 0) {
                val beat = countInBeat(tick)
                if (_pattern.value.countIn != beat) _pattern.update { it.copy(countIn = beat) }
                return
            }
            transport.countedIn()
            countInClickOff()
            showPattern()
        }
        sceneDue(tl.heardTickAt(now - SCENE_GRACE_NS, late))
        val st = transport.state
        if (st.recording && tick >= 0) {
            markPasses(tick)
            setPatterns(patternRecorder.grow(projectPatterns, tick))
        }
        eraseHeld(tl, now)
        correctHeld(tl, now)
    }

    /** The click the count-in turned on goes off again. */
    private fun countInClickOff() {
        if (!countInClick) return
        countInClick = false
        setClick(false)
    }

    /** The groups recorded into start a new pass at [tick]: their next note is an UNDO step of its own. */
    private fun markPasses(tick: Double) {
        val t = floor(maxOf(tick, 0.0)).toLong()
        for (g in patternGroups) {
            val pat = projectPatterns.group(g)
            if (!pat.open) patternRecorder.passed(g, passOf(t, pat.lengthTicks))
        }
    }

    /**
     * The pads held in ERASE while playing erase their notes as the playhead
     * passes, from where each was pressed on, a lookahead ahead: the notes
     * about to be sent go before they are. A hold shorter than a tap erases
     * nothing here ([erasePadUp] takes the pad's every note).
     */
    private fun eraseHeld(tl: dev.arc.ep133.audio.Timeline, now: Long) {
        if (eraseHolds.isEmpty() || transport.state.phase != TransportPhase.PLAYING) return
        val to = tl.tickAt(now + dev.arc.ep133.audio.PatternScheduler.LOOKAHEAD_NS)
        var p = projectPatterns
        for (h in eraseHolds.values) {
            if (now - h.downAt < ERASE_TAP_NS) continue
            // From where the pad went down in what was heard; to a lookahead ahead of what is sent.
            val from = h.from ?: maxOf(tl.heardTickAt(h.downAt, heardDelay()), 0.0)
            if (to <= from) continue
            p = patternRecorder.eraseRange(p, h.pad, h.semitones, from, to)
            h.from = to
        }
        setPatterns(p)
    }

    /**
     * A press on [pad] (a KEYS note on it: [semitones]) at [pressedAt], its
     * voice [key] sounding: a note in the pattern while recording, on
     * TIMING's grid, its gate held until [recordRelease] ([hold]; else a
     * step of the grid). A note the grid puts after the moment it was heard
     * isn't played in that pass again, nor the [first] note of a run a press
     * started (on tick 0, heard already) in its first, nor any other heard
     * before that run's timeline is out (a chord's other fingers: [pressSkip]).
     */
    private fun recordPress(pad: dev.arc.ep133.features.PhysicalPad, semitones: Int?, key: String, pressedAt: Long, hold: Boolean, first: Boolean = false) {
        if (!transport.state.recording) return
        val stamped = patternTickAt(pressedAt) ?: return
        // The player reacts to what is heard, which a wireless output plays late: the press is where it was heard
        // (an earlier pass's end by its global tick; before the run is heard, see OutputDelay.placed). The press that
        // started the run is its tick 0.
        val heard = patternHeardTickAt(pressedAt) ?: return
        // A pick whose tick the press is past takes over first: the note goes to the pattern playing then.
        sceneDue(heard)
        patternGroups += pad.group
        val tick = pressPlace(first, stamped, heard, patternCountedIn)
        markPasses(tick)
        val r = patternRecorder.noteOn(projectPatterns, pad, semitones, tick, patternTickAt(System.nanoTime()) ?: tick, settings.value.patternTiming, settings.value.timingSwing)
        if (r.id == 0) return
        pressSkip(r.skipPass, first, early = patternPressAt != null && heardTimeline() == null)?.let { patternSkip = patternSkip + (r.id to it) }
        // The same key again before it was let go of (another finger): the first note's gate ends here.
        val before = patternHeld.remove(key)
        val p = if (before != null) patternRecorder.noteOff(r.patterns, before, tick) else r.patterns
        if (before != null) patternShifts.remove(before)
        if (hold) {
            patternHeld[key] = r.id
            // Its release follows the note: it is heard where it is let go, and moved as far as the start was.
            if (tick != heard) patternShifts[r.id] = tick - heard
        }
        _pattern.update { it.copy(focusGroup = pad.group) }
        setPatterns(p)
    }

    /** Voice [key] let go of at [releasedAt]: the note it recorded, if any, ends its gate there. */
    private fun recordRelease(key: String, releasedAt: Long) {
        val id = patternHeld.remove(key) ?: return
        val shift = patternShifts.remove(id) ?: 0.0
        val tick = (patternHeardTickAt(releasedAt) ?: return) + shift
        setPatterns(patternRecorder.noteOff(projectPatterns, id, tick))
    }

    /**
     * Where the focus group's pattern is heard at [now] (System.nanoTime),
     * for the line's counter and its loop hairline, read as it draws; null
     * while stopped or before the transport is first heard.
     */
    fun patternPosition(now: Long): PatternPosition? {
        if (!patternRunning()) return null
        val tl = heardTimeline() ?: return null
        return positionOf(tl.heardTickAt(now, heardDelay()), projectPatterns.group(_pattern.value.focusGroup.coerceIn(0, 3)))
    }

    /** TIMING: the grid recorded notes snap to (kept). */
    fun setPatternTiming(t: Timing) = changeSettings { it.withPatternTiming(t) }

    /** COUNT-IN: RECORD then PLAY counts a bar in first (kept). */
    fun setPatternCountIn(on: Boolean) = changeSettings { it.copy(patternCountIn = on) }

    /** AUTO length: an empty group recorded from stop ends where recording stops (kept). */
    fun setPatternAutoLength(on: Boolean) = changeSettings { it.copy(patternAutoLength = on) }

    // ---------- ARP: the arpeggiator (KEYS) and note repeat (PADS), on TIMING's interval (an addition) ----------

    /** ARP (KEYS) / RPT (PADS) on or off (kept); off, the notes it held go and it stops. */
    fun setArpOn(on: Boolean) {
        if (!on) arpClear()
        changeSettings { it.copy(arpOn = on) }
    }

    /** The order KEYS's held notes play in (kept). */
    fun setArpOrder(order: dev.arc.ep133.features.ArpOrder) = changeSettings { it.withArp(it.arp.withOrder(order)) }

    /** Over 1 to 3 octaves (kept). */
    fun setArpOctaves(n: Int) = changeSettings { it.withArp(it.arp.withOctaves(n)) }

    /** Each note held for 10..100 % of a step (kept). */
    fun setArpGate(percent: Int) = changeSettings { it.withArp(it.arp.withGate(percent)) }

    /** LATCH (kept): the notes play on after the fingers are up; off, those no finger holds go. */
    fun setArpLatch(on: Boolean) {
        if (!on && arpDesk.unlatch()) publishArp()
        changeSettings { it.withArp(it.arp.withLatch(on)) }
    }

    /** TIMING's interval (KNOB X; kept): the arp's step, and the grid recording snaps to while quantizing. */
    fun setTimingInterval(t: Timing) = changeSettings { it.withTiming(it.timing.withInterval(t)) }

    /** TIMING's swing, 50..75 % (KNOB Y; kept): 1/8 and 1/16 only. */
    fun setTimingSwing(percent: Int) = changeSettings { it.withTiming(it.timing.withSwing(percent)) }

    /** TIMING's - and + (kept): recording snaps to the interval, or keeps free time. */
    fun setTimingQuantize(on: Boolean) = changeSettings { it.withTiming(it.timing.withQuantize(on)) }

    /** KEYS [note] held at [pressure] (the touch's own, while the arp is on): its velocity, on a phone that tells pressure. */
    fun notePressure(note: Int, pressure: Float) = arpPressure("note:$note", pressure)

    /** [pad] held at [pressure] (the touch's own, while note repeat is on): its velocity, on a phone that tells pressure. */
    fun padPressure(pad: dev.arc.ep133.features.PhysicalPad, pressure: Float) = arpPressure("live:${pad.group}:${pad.offset}", pressure)

    // Whether the arp takes a press: it is on, and the press holds (a screen reader's tap, which never lets go, only latched);
    // not while the STEP panel is open, whose presses are its own.
    private fun arpTakes(hold: Boolean): Boolean = settings.value.let { arpTakesPress(it.arpOn, it.arpLatch, hold, stepDesk.open) }

    /**
     * A press on voice [key] at [pressedAt] while the arp is on: [note]
     * joins the arp's notes ([keys]: a KEYS note; else a pad for note
     * repeat), neither played nor recorded itself; the sequencer plays it
     * on the next step (the first of a run on the press). With RECORD armed,
     * the recording starts on it, as on a press's ([patternPadDown]; one
     * [unsure], once kept); the arp's steps are what it records ([recordArpStep]).
     */
    private fun arpPress(key: String, note: dev.arc.ep133.features.ArpNote, keys: Boolean, pressedAt: Long, hold: Boolean, unsure: Boolean = false) {
        lastPressAt = pressedAt
        // Unsure, RECORD starts once the press is kept ([keepPad]): a scroll starts nothing.
        if (!unsure) patternPadDown(pressedAt)
        val latch = settings.value.arpLatch
        if (arpDesk.press(key, note, keys, pressedAt, latch, unsure)) arpTried.clear()
        // A tap that never lets go (latched, or it wouldn't be here): up at once, its note kept.
        if (!hold) arpDesk.release(key, latch)
        publishArp()
    }

    // Pressure on a held note: its velocity, the plan handed on at most every ARP_PRESSURE_MS.
    private fun arpPressure(key: String, pressure: Float) {
        if (!arpDesk.pressure(key, pressure)) return
        if (arpPressureJob?.isActive == true) return
        val wait = ARP_PRESSURE_MS - (System.nanoTime() - arpPressureAt) / 1_000_000L
        if (wait <= 0) {
            arpPressureAt = System.nanoTime()
            publishArp()
            return
        }
        arpPressureJob = scope.launch {
            delay(wait)
            arpPressureAt = System.nanoTime()
            publishArp()
        }
    }

    /** The arp's notes go (another project, the output closed, playback stopped); it stays on. */
    private fun arpClear() {
        arpPressureJob?.cancel()
        arpDesk.clear()
        publishArp()
    }

    /**
     * Hands the sequencer what the arp plays ([dev.arc.ep133.audio.ArpPlan]):
     * on, its notes, on their pads' sounds in memory as a press plays them,
     * at TIMING and the arp's settings and TEMPO's tempo; null (it stops)
     * off or with none. A pad whose sound isn't in memory loads, as a press
     * would load it, and the plan follows. Live's line follows too.
     */
    private fun publishArp() {
        val s = settings.value
        val plan = if (s.arpOn && arpDesk.notes.isNotEmpty()) {
            val m = mirror
            val pads = arpDesk.notes.mapTo(HashSet()) { it.pad }
            val (voices, missing) = patternVoices(pads, ::padInMemory, { pad, keys -> shapeFor(pad, keys) }) { pad -> m?.sampleOf(pad) != null }
            for (pad in missing) loadArpPad(pad)
            arpDesk.plan(voices, s.timing, s.arp, patternBpm(_state.value.mirror?.state?.bpm, s.liveTempo))
        } else {
            null
        }
        patternScheduler.arp = plan
        _arp.value = arpDesk.ui(s.arpOn, s.arp, s.timing, s.keysNames)
    }

    // [pad]'s sound into memory for the arp, as a press loads it (once a run: one found nowhere isn't asked again).
    private fun loadArpPad(pad: dev.arc.ep133.features.PhysicalPad) {
        if (pad in arpTried || !arpLoading.add(pad)) return
        scope.launch {
            val a = try {
                padAudio(pad)
            } finally {
                arpLoading -= pad
            }
            if (a == null) arpTried += pad else publishArp()
        }
    }

    /**
     * A step the arp played on the pattern's clock (told on the output's
     * thread, handed here): while recording, a note of the pattern where it
     * played, at its velocity and as long as its gate. It is on the grid
     * already, so TIMING doesn't move it.
     */
    private fun recordArpStep(step: dev.arc.ep133.audio.ArpStep) {
        if (!transport.state.recording) return
        val n = step.note
        val tick = step.globalTick.toDouble()
        sceneDue(tick)
        patternGroups += n.pad.group
        markPasses(tick)
        val r = patternRecorder.noteOn(projectPatterns, n.pad, n.semitones, tick, tick, Timing.OFF, velocity = n.velocity)
        if (r.id == 0) return
        _pattern.update { it.copy(focusGroup = n.pad.group) }
        setPatterns(patternRecorder.noteOff(r.patterns, r.id, tick + step.gateTicks))
    }

    /** [group]'s length, 1 to 99 bars; notes past the end are kept, not played. */
    fun setPatternLength(group: Int, bars: Int) {
        if (group !in 0..3) return
        setPatterns(patternRecorder.setLength(projectPatterns, group, bars))
        showPattern()
    }

    /** ×2 (SHIFT + + on the device): [group] twice as long, its notes copied into the new half. */
    fun doublePattern(group: Int) {
        if (group !in 0..3) return
        setPatterns(patternRecorder.double(projectPatterns, group))
        showPattern()
    }

    /** CLEAR (asked first, in the sheet): [group]'s notes, or every group's (null); the lengths stay. */
    fun clearPattern(group: Int?) {
        if (group != null && group !in 0..3) return
        val p = patternRecorder.clear(projectPatterns, group)
        if (p === projectPatterns) return
        setPatterns(p)
        toast(dev.arc.ep133.text.MirrorText.cleared(group))
    }

    /**
     * UNDO (SHIFT + B on the device): back to before the last pass recorded, erase, clear, length change, or
     * edit of the scenes (COMMIT, CLR, DEL, a paste), the project's scenes, banks and picks as they were then.
     * A pick waiting goes.
     */
    fun undoPattern() {
        patternRecorder.undo(projectSeq)?.let { seq ->
            sceneDesk.cancel()
            setSeq(seq)
        }
        showPattern()
    }

    /** ERASE on or off: on, a pad tapped erases its notes, and one held while playing erases them as they pass. CORRECT goes off with it on. */
    fun setPatternErase(on: Boolean) {
        if (!on) eraseHolds.clear()
        // A pad tapped is erased, not the PAD flow's.
        if (on) endPadStage()
        if (on && stepDesk.correct) {
            stepDesk.correct(false, patternRecorder)
            publishStep()
        }
        _pattern.update { it.copy(erase = on) }
    }

    /** A pad (a KEYS note on it: [semitones]) pressed in ERASE at [at]: what it erases is known as it is let go of, or held. */
    fun erasePadDown(pad: dev.arc.ep133.features.PhysicalPad, at: Long, semitones: Int? = null) {
        eraseHolds[eraseKey(pad, semitones)] = EraseHold(pad, semitones, at)
    }

    /**
     * The pad pressed in ERASE let go of at [releasedAt]. A tap, or any
     * press while not playing, erases its every note (a toast says so); held
     * while playing, it erased its notes as they passed, up to here.
     */
    fun erasePadUp(pad: dev.arc.ep133.features.PhysicalPad, releasedAt: Long, semitones: Int? = null) {
        val h = eraseHolds.remove(eraseKey(pad, semitones)) ?: return
        val tl = heardTimeline()
        if (tl == null || transport.state.phase != TransportPhase.PLAYING || h.from == null && releasedAt - h.downAt < ERASE_TAP_NS) {
            val p = patternRecorder.erasePad(projectPatterns, pad, semitones)
            if (p === projectPatterns) return
            setPatterns(p)
            toast(dev.arc.ep133.text.MirrorText.erased(pad))
            return
        }
        val late = heardDelay()
        val from = h.from ?: maxOf(tl.heardTickAt(h.downAt, late), 0.0)
        val to = tl.heardTickAt(releasedAt, late)
        if (to > from) setPatterns(patternRecorder.eraseRange(projectPatterns, pad, semitones, from, to))
    }

    /** KEYS in ERASE: MIDI [note] on the KEYS sound pressed at [at], as [erasePadDown]. */
    fun eraseNoteDown(note: Int, at: Long) {
        val pad = _state.value.keysPad ?: return
        erasePadDown(pad, at, note - dev.arc.ep133.features.Keys.ROOT_NOTE)
    }

    /** KEYS in ERASE: the note let go of at [releasedAt], as [erasePadUp]. */
    fun eraseNoteUp(note: Int, releasedAt: Long) {
        val pad = _state.value.keysPad ?: return
        erasePadUp(pad, releasedAt, note - dev.arc.ep133.features.Keys.ROOT_NOTE)
    }

    private fun eraseKey(pad: dev.arc.ep133.features.PhysicalPad, semitones: Int?) = "${pad.group}:${pad.offset}:$semitones"

    /** SAMPLE's BARS on PTN (or off it): a hands-free take lasts the pattern's length (kept). */
    fun setSamplePattern(on: Boolean) = changeSettings { it.copy(samplePattern = on) }

    /**
     * A hands-free take into [pad] in step with the pattern: [bars] bars
     * from the next bar, or (null: PTN) the longest group's length from the
     * patterns' next loop start. Stopped, the patterns start for it (not
     * recording), the take from bar 1. RSP's take starts at that mix frame
     * itself; the mic's and USB's at the moment it is heard.
     */
    private fun sampleOnPattern(pad: dev.arc.ep133.features.PhysicalPad, bars: Int?) {
        // Started for the take: it starts at bar 1, however late the first stamp is told.
        val fromStop = !patternRunning()
        if (fromStop) {
            // Armed: the take plays the patterns, it doesn't record into them.
            patternAct { transport.punchOut() }
            patternAct(PATTERN_TAKE_LEAD_NS) { transport.play(recordHeld = false, countIn = false) }
            if (!patternRunning()) {
                sampleLatched = null
                return
            }
        }
        sampleCount = scope.launch {
            var started = false
            try {
                sampleWaiting.value = SamplePhase.Waiting(pad, latched = true)
                val tl = kotlinx.coroutines.withTimeoutOrNull(BEAT_WAIT_MS) { awaitTimeline() } ?: return@launch
                val len = bars?.let { it * Seq.TICKS_PER_BAR } ?: projectPatterns.longestTicks
                // The mix is taken where it is (RSP); a mic or USB input hears the loop as the player does, late over Bluetooth.
                val late = if (recorder.input?.source == SampleSource.RSP) 0L else heardDelay()
                // A moment ahead, so the take is asked for before it starts (one a little late takes what the input kept).
                val start = if (fromStop) 0L else nextLoopStart(tl.heardTickAt(System.nanoTime() + dev.arc.ep133.audio.PatternScheduler.LOOKAHEAD_NS, late), if (bars == null) len else Seq.TICKS_PER_BAR)
                val end = start + len
                started = if (recorder.input?.source == SampleSource.RSP) {
                    recorder.scheduleMix(pad, tl.frameOfTick(start), tl.frameOfTick(end) - tl.frameOfTick(start), sampleMaxFrames())
                } else {
                    val rate = recorder.rate ?: return@launch
                    recorder.schedule(pad, tl.heardNanosOf(start, late), ticksToFrames(len.toLong(), tl.clock.bpm, rate), sampleMaxFrames())
                }
            } finally {
                sampleWaiting.value = null
                if (!started && sampleLatched == pad) sampleLatched = null
            }
        }
    }

    // ---------- STEP: the pattern a step at a time while stopped, and timing correct (an addition: − / +, RECORD + pad, SHIFT + TIMING) ----------

    /**
     * The STEP panel opened ([on]) on [group] (Live's one group shown, or the
     * KEYS sound's), or closed (✕). It opens only while stopped (armed,
     * RECORD is disarmed first, as STOP does): ERASE goes off, SAMPLE's
     * panel and the scene panel close (they share the function keys' place), and the arp's
     * notes go, as its presses are the panel's own. Closing lets go of the
     * pick, NUDGE, the panel's RECORD and its status; CORRECT stays.
     */
    fun setStepOpen(on: Boolean, group: Int = stepDesk.group) {
        if (!on) {
            closeStep()
            return
        }
        if (stepDesk.open) {
            setStepGroup(group)
            return
        }
        if (!stepOpens(transport.state.phase)) return
        if (transport.state.phase == TransportPhase.ARMED) patternStop()
        setPatternErase(false)
        exitSample()
        closeScene()
        arpClear()
        stepDesk.open(patternProject, group)
        publishStep()
    }

    /** Live shows [group] now (another group, or the KEYS sound's): the panel steps through it, at that group's cursor. */
    fun setStepGroup(group: Int) {
        stepDesk.group(group)
        publishStep()
    }

    /** The panel's RECORD goes down: while it is held, a pad or key tapped goes on the cursor's step. Not the transport's RECORD. */
    fun stepRecordDown() = stepAct { stepDesk.record(true) }

    /** The panel's RECORD comes up: a tap only sounds again. */
    fun stepRecordUp() = stepAct { stepDesk.record(false) }

    /** The panel's PLAY: the panel folds and the patterns play from bar 1 (CORRECT stays as it is). */
    fun stepPlay() {
        closeStep()
        patternPlay()
    }

    /**
     * A pad pressed at [pressedAt] while the STEP panel is open, at the
     * touch's [pressure] (NaN: none told). With the panel's RECORD held it
     * goes on the cursor's step at the pressure's velocity (127 on a phone
     * that doesn't tell pressure) and sounds as a press does; with NUDGE
     * waiting it is picked instead ([stepPadPick]); else it only sounds,
     * and with CORRECT on its notes go onto the grid as it lets go. It
     * neither arms nor records into the pattern, and the arp doesn't take it.
     */
    fun stepPadDown(pad: dev.arc.ep133.features.PhysicalPad, pressedAt: Long = System.nanoTime(), pressure: Float = Float.NaN) {
        if (!stepDesk.open) return
        val r = stepDesk.press("live:${pad.group}:${pad.offset}", StepNote(pad, null), pressure, projectPatterns, patternRecorder, settings.value.timing)
        setPatterns(r.patterns)
        publishStep()
        if (r.plays) playPad(pad, pressedAt = pressedAt, record = false)
    }

    /** The pad pressed in the STEP panel let go of at [releasedAt]: its sound fades, and with CORRECT on (and no − / + meanwhile) its notes go onto the grid. */
    fun stepPadUp(pad: dev.arc.ep133.features.PhysicalPad, releasedAt: Long = System.nanoTime()) {
        releasePad(pad, releasedAt)
        stepRelease("live:${pad.group}:${pad.offset}")
    }

    /** KEYS in the STEP panel: MIDI [note] on the KEYS sound pressed at [pressedAt], as [stepPadDown] (the note goes on the step at its pitch). */
    fun stepNoteDown(note: Int, pressedAt: Long = System.nanoTime(), pressure: Float = Float.NaN) {
        if (!stepDesk.open) return
        val pad = _state.value.keysPad
        if (pad == null) {
            toastOnce(dev.arc.ep133.text.MirrorText.PICK_SOUND)
            return
        }
        val n = StepNote(pad, note - dev.arc.ep133.features.Keys.ROOT_NOTE)
        val r = stepDesk.press("note:$note", n, pressure, projectPatterns, patternRecorder, settings.value.timing)
        setPatterns(r.patterns)
        publishStep()
        if (r.plays) playNote(note, pressedAt = pressedAt)
    }

    /** KEYS in the STEP panel: the note let go of at [releasedAt], as [stepPadUp]. */
    fun stepNoteUp(note: Int, releasedAt: Long = System.nanoTime()) {
        releaseNote(note, releasedAt)
        stepRelease("note:$note")
    }

    /**
     * A long press on [pad] in the STEP panel: picked for − / + to nudge,
     * when it has a note on the cursor's step (every pitch on it); picked
     * already, it is let go of. False when it has none there (nothing
     * changes), and with CORRECT on, where − / + shift a held pad instead.
     */
    fun stepPadPick(pad: dev.arc.ep133.features.PhysicalPad): Boolean = stepPick(StepNote(pad, null))

    /** KEYS in the STEP panel: a long press on MIDI [note] of the KEYS sound picks that note, as [stepPadPick]. */
    fun stepNotePick(note: Int): Boolean {
        val pad = _state.value.keysPad ?: return false
        return stepPick(StepNote(pad, note - dev.arc.ep133.features.Keys.ROOT_NOTE))
    }

    /**
     * The panel's −: with CORRECT on and a pad held, its notes a tick
     * earlier; else, a note picked, it is nudged a step earlier (a tick in
     * free time) and the cursor follows it; else the cursor goes back a
     * step, wrapping round the pattern, and its notes sound.
     */
    fun stepMinus() = stepBy(-1)

    /** The panel's +: as [stepMinus], later. */
    fun stepPlus() = stepBy(1)

    /** The strip's step [step] tapped: the cursor jumps there and its notes sound; the pick goes. */
    fun stepJump(step: Int) {
        if (!stepDesk.open) return
        stepDesk.jump(step, projectPatterns, patternRecorder, settings.value.timing)
        publishStep()
        auditionStep()
    }

    /** BAR's page [bar] (from 0) tapped: the cursor jumps to that bar's first step, as [stepJump]. */
    fun stepPage(bar: Int) {
        if (!stepDesk.open) return
        stepDesk.page(bar, projectPatterns, patternRecorder, settings.value.timing)
        publishStep()
        auditionStep()
    }

    /** VEL's knob (SHIFT + KNOB X on the device): every note on the cursor's step at [velocity], 1..127. A turn is one UNDO step ([stepKnobEnd]). */
    fun setStepVelocity(velocity: Int) = stepAct { setPatterns(stepDesk.velocity(velocity, projectPatterns, patternRecorder, settings.value.timing)) }

    /** LEN's knob (SHIFT + KNOB Y): every note on the cursor's step [ticks] long, snapped to [STEP_GATES] (a tick to a bar). A turn is one UNDO step. */
    fun setStepGate(ticks: Int) = stepAct { setPatterns(stepDesk.gate(ticks, projectPatterns, patternRecorder, settings.value.timing)) }

    /** VEL's or LEN's knob let go of: the next turn is an UNDO step of its own. */
    fun stepKnobEnd() = patternRecorder.endRun()

    /** NUDGE latched ([on]): a tap picks its pad, as a long press does; off, the pick goes. CORRECT goes off with it on. */
    fun setStepNudge(on: Boolean) = stepAct { stepDesk.nudge(on, patternRecorder) }

    /**
     * CORRECT on or off (timing correct, SHIFT + TIMING on the device): in
     * the panel a pad tapped puts its every note on TIMING's grid and swing
     * (and sounds); while playing a pad held puts its notes on the grid as
     * they play ([correctPadDown]), the line counting them. NUDGE and the
     * pick go either way; ERASE (and the scene panel's PAD flow waiting)
     * goes off with it on.
     */
    fun setStepCorrect(on: Boolean) {
        if (on) setPatternErase(false)
        // A pad tapped is corrected, not the PAD flow's.
        if (on) endPadStage()
        stepDesk.correct(on, patternRecorder)
        stepShown?.cancel()
        publishStep()
    }

    /** A pad (a KEYS note on it: [semitones]) pressed at [at] with CORRECT on while playing: what it corrects is known as it is let go of, or held. */
    fun correctPadDown(pad: dev.arc.ep133.features.PhysicalPad, at: Long, semitones: Int? = null) {
        if (!stepDesk.correct) return
        stepShown?.cancel()
        stepDesk.holdDown(eraseKey(pad, semitones), StepNote(pad, semitones), at)
        publishStep()
    }

    /**
     * The pad pressed with CORRECT on let go of at [releasedAt]. A tap, or
     * any press while not playing, puts its every note on the grid; held
     * while playing, it corrected its notes as they passed, up to here. The
     * line says how many, a moment longer.
     */
    fun correctPadUp(pad: dev.arc.ep133.features.PhysicalPad, releasedAt: Long, semitones: Int? = null) {
        val tl = heardTimeline()?.takeIf { transport.state.phase == TransportPhase.PLAYING }
        val late = heardDelay()
        val tickAt = tl?.let { t -> { nanos: Long -> t.heardTickAt(nanos, late) } }
        setPatterns(stepDesk.holdUp(eraseKey(pad, semitones), releasedAt, projectPatterns, patternRecorder, settings.value.timing, tickAt))
        publishStep()
        if (!stepDesk.holding) stepCorrectedShown()
    }

    /** KEYS with CORRECT on: MIDI [note] on the KEYS sound pressed at [at], as [correctPadDown]. */
    fun correctNoteDown(note: Int, at: Long) {
        val pad = _state.value.keysPad ?: return
        correctPadDown(pad, at, note - dev.arc.ep133.features.Keys.ROOT_NOTE)
    }

    /** KEYS with CORRECT on: the note let go of at [releasedAt], as [correctPadUp]. */
    fun correctNoteUp(note: Int, releasedAt: Long) {
        val pad = _state.value.keysPad ?: return
        correctPadUp(pad, releasedAt, note - dev.arc.ep133.features.Keys.ROOT_NOTE)
    }

    /** Live's STEP follows the patterns, TIMING and the desk. */
    private fun publishStep() {
        _step.value = stepDesk.ui(projectPatterns, settings.value.timing)
    }

    // [change] done on the desk, while the panel is open, and Live follows.
    private inline fun stepAct(change: () -> Unit) {
        if (!stepDesk.open) return
        change()
        publishStep()
    }

    /** The panel closes (✕, PLAY, the transport starting, SAMPLE, another project), if it was open. */
    private fun closeStep() {
        if (!stepDesk.open) return
        stepDesk.close(patternRecorder)
        publishStep()
    }

    // A finger up on voice [key] in the panel: CORRECT's tap, or the end of − / +'s shift.
    private fun stepRelease(key: String) {
        if (!stepDesk.open) return
        setPatterns(stepDesk.release(key, projectPatterns, patternRecorder, settings.value.timing))
        publishStep()
    }

    private fun stepPick(n: StepNote): Boolean {
        if (!stepDesk.open) return false
        val picked = stepDesk.pick(n, projectPatterns, patternRecorder, settings.value.timing)
        publishStep()
        return picked
    }

    // − or + ([dir]): CORRECT's shift of a held pad, the picked note's nudge, or the cursor (whose notes sound).
    private fun stepBy(dir: Int) {
        if (!stepDesk.open) return
        val r = stepDesk.minusPlus(dir, projectPatterns, patternRecorder, settings.value.timing)
        setPatterns(r.patterns)
        publishStep()
        if (r.audition) auditionStep()
    }

    /**
     * The notes on the cursor's step sound, each as a press of its pad (or
     * KEYS note) would, at its velocity, untimed: let go of after its gate
     * at the pattern's tempo, 60 ms to 1.5 s. Only from memory (a sound not
     * there loads quietly, as the patterns' do); the last audition's notes
     * still sounding are let go of first.
     */
    private fun auditionStep() {
        auditionsEnd()
        val t = settings.value.timing
        val g = stepDesk.group
        val notes = dev.arc.ep133.features.Steps.notesOn(projectPatterns.group(g), stepDesk.cursor(projectPatterns, t.interval), t.interval, t.swing)
        if (notes.isEmpty()) return
        val bpm = patternBpm(_state.value.mirror?.state?.bpm, settings.value.liveTempo)
        val now = System.nanoTime()
        for (n in notes) {
            val pad = dev.arc.ep133.features.PhysicalPad(g, n.offset)
            val a = padInMemory(pad)
            if (a == null) {
                loadPatternPad(pad)
                continue
            }
            // The pattern's own voice keys: a pad hit rings its pad, a KEYS note its key.
            val key = n.semitones?.let { "seq:$g:${n.offset}:${dev.arc.ep133.features.Keys.ROOT_NOTE + it}" } ?: "live:$g:${n.offset}"
            // A finger holding it already sounds it.
            if (key in held || key in stepAuditions) continue
            val shape = dev.arc.ep133.audio.velocityShape(shapeFor(pad, keys = n.semitones != null), n.velocity)
            startHeld(key, hold = false, a, n.semitones ?: 0, now, measured = false, shape)
            stepAuditions[key] = scope.launch {
                delay(auditionMs(n.gate, bpm))
                stepAuditions.remove(key)
                if (key !in held) liveAudio.release(key)
            }
        }
    }

    /**
     * The notes the STEP panel auditions still sounding are let go of now (a
     * finger holding one keeps it): before the next audition, and as the
     * transport starts, whose notes ring on the same voice keys.
     */
    private fun auditionsEnd() {
        for ((key, job) in stepAuditions) {
            job.cancel()
            if (key !in held) liveAudio.release(key)
        }
        stepAuditions.clear()
    }

    /**
     * The pads held to correct while playing put their notes on the grid as
     * the playhead passes, a lookahead ahead, so the notes go before the
     * sequencer sends them, as [eraseHeld] does; the line counts them.
     */
    private fun correctHeld(tl: dev.arc.ep133.audio.Timeline, now: Long) {
        if (!stepDesk.holding || transport.state.phase != TransportPhase.PLAYING) return
        val to = tl.tickAt(now + dev.arc.ep133.audio.PatternScheduler.LOOKAHEAD_NS)
        val late = heardDelay()
        setPatterns(stepDesk.held(projectPatterns, patternRecorder, settings.value.timing, to, now) { tl.heardTickAt(it, late) })
        publishStep()
    }

    /** The line's count of the notes corrected while playing goes a moment after the last pad held lets go. */
    private fun stepCorrectedShown() {
        stepShown?.cancel()
        stepShown = scope.launch {
            delay(CORRECT_SHOWN_MS)
            stepDesk.correctedShown()
            publishStep()
        }
    }

    // ---------- SCENES: the pattern each group plays, switched while playing, and copy and paste (an addition: GROUP, MAIN, SHIFT + C / D) ----------

    /**
     * The scene panel opened ([on]) with column [group] focused (the group Live shows), or closed (✕). It opens
     * whatever the transport does and stays open while it plays. It shares the function keys' place with STEP's panel
     * and SAMPLE's: opening it closes them. The pads stay playable and recordable, but for the PAD flow's stages.
     * Closing drops the grid and the PAD flow; the picks waiting for their tick and the clipboard stay.
     */
    fun setSceneOpen(on: Boolean, group: Int = sceneDesk.group) {
        if (!on) {
            closeScene()
            return
        }
        if (sceneDesk.open) {
            setSceneGroup(group)
            return
        }
        closeStep()
        exitSample()
        sceneDesk.open(group)
        publishScene()
    }

    /** Live shows [group] now (another group, or its column was tapped): the CLIP row's pattern and bar work on it. */
    fun setSceneGroup(group: Int) {
        sceneDesk.focus(group)
        publishScene()
    }

    /**
     * [group]'s − (-1) or + (+1): the pattern number as shown (the queued one, if any) a step on, wrapping round
     * 1..99. Stopped (or armed) it plays at once; counting in or playing it is queued for the tick the scene change
     * setting gives ([setSceneSwitch]), replacing that group's queue and cancelling a scene's.
     */
    fun scenePatternStep(group: Int, dir: Int) = scenePick { at, time -> sceneDesk.stepPattern(projectSeq, group, dir, at, time) }

    /** [group]'s pattern [n] picked on the 1–99 grid (1..99): as [scenePatternStep]. The grid closes. */
    fun scenePatternPick(group: Int, n: Int) = scenePick { at, time -> sceneDesk.pickPattern(projectSeq, group, n, at, time) }

    /** NEXT FREE: the first pattern of [group] after the number shown with no notes (the number shown when every one has), as [scenePatternStep]. */
    fun scenePatternNextFree(group: Int) = scenePick { at, time -> sceneDesk.pickNextFree(projectSeq, group, at, time) }

    /** The 1–99 grid opens over the pads for [group], or closes (null). */
    fun sceneGrid(group: Int?) {
        sceneDesk.grid(group)
        publishScene()
    }

    /**
     * The scene's − (-1) or + (+1), from the one shown (the queued one, if any): another scene, and + past the last
     * is a new one ([dev.arc.ep133.features.SceneOps.newScene]: each group on its next free pattern). Stopped it plays
     * at once; running it is queued for all four groups at one tick: the next bar line under Bar end, the end of the
     * longest pattern playing under Pattern end. A group's queue goes with it.
     */
    fun sceneStep(dir: Int) = scenePick { at, time -> sceneDesk.stepScene(projectSeq, dir, at, time) }

    /**
     * COMMIT (SHIFT + MAIN on the device): the scene is copied right after itself, into the groups' next free
     * patterns, and selected: one UNDO step. At once even while playing, the copies being what plays; the picks
     * waiting go. At 99 scenes the status says so.
     */
    fun sceneCommit() = sceneEdit { sceneDesk.commit(projectSeq, patternRecorder) }

    /**
     * The CLR / DEL key held its 2 s (ERASE + MAIN on the device): an empty scene that isn't the only one is
     * deleted (DEL), any other is emptied of its notes (CLR); a toast says which. One UNDO step, at once; the picks
     * waiting go. Nothing when nothing changes (the only scene, already empty).
     */
    fun sceneEraseHold() {
        sceneTickNow()?.let(::sceneDue)
        val r = sceneDesk.erase(projectSeq, patternRecorder)
        if (r != null) {
            setSeq(r.seq)
            toast(if (r.erase == dev.arc.ep133.features.SceneErase.CLEARED) dev.arc.ep133.text.MirrorText.CLEARED_SCENE else dev.arc.ep133.text.MirrorText.DELETED_SCENE)
        }
        publishScene()
    }

    /** CHANGE (410 to 412 on the device; kept, and the pattern sheet's too): when a pick made while playing takes over. */
    fun setSceneSwitch(time: dev.arc.ep133.features.SwitchTime) = changeSettings { it.copy(sceneSwitch = time) }

    /** The CLIP row's PTN, BAR or PAD; a PAD flow waiting is dropped. */
    fun setClipMode(mode: ClipMode) {
        sceneDesk.mode(mode)
        publishScene()
    }

    /** The bar page BAR copies and pastes, [bar] from 0 (held to the focused group's length). */
    fun setClipBar(bar: Int) {
        sceneDesk.page(bar)
        publishScene()
    }

    /**
     * COPY: in PTN the focused group's pattern goes to the clipboard, in BAR its bar page's notes; in PAD it waits for
     * a tap on the pad to copy ([scenePadTap]; COPY again drops it), the pads taking no other press till then (ERASE
     * and CORRECT go off).
     */
    fun clipCopy() {
        sceneDesk.copy(projectSeq)
        stageBegun()
        publishScene()
    }

    /**
     * PASTE: in PTN the clipboard's pattern replaces the focused group's pattern, in BAR the clipboard's notes the bar
     * page's (one UNDO step each); in PAD it waits for a tap on the pad to paste onto, which may be in another group
     * once the group key is switched. With nothing of that kind copied the status says so.
     */
    fun clipPaste() = sceneEdit {
        sceneDesk.paste(projectSeq, patternRecorder).also { stageBegun() }
    }

    /**
     * A pad tapped while the PAD flow waits (the pads' own press goes here by itself, as [playPad]): the pad COPY takes,
     * or the pad PASTE puts the clipboard's notes on (one UNDO step). It neither plays nor records, and the flow ends.
     * False when none waits.
     */
    fun scenePadTap(pad: dev.arc.ep133.features.PhysicalPad): Boolean {
        if (sceneDesk.padStage == PadStage.NONE) return false
        sceneEdit { sceneDesk.padTap(pad, projectSeq, patternRecorder) }
        return true
    }

    /** Live's SCENE follows the sequencer, the settings and the desk. */
    private fun publishScene() {
        _scene.value = sceneDesk.ui(projectSeq, settings.value.sceneSwitch)
    }

    // A pick: the desk plays it at once while stopped ([at] null) or queues it for its tick; the sequencer, its plan and Live follow.
    // A pick waiting that the sequencer may have played from already takes over first, not replaced.
    private inline fun scenePick(pick: (at: Double?, time: dev.arc.ep133.features.SwitchTime) -> dev.arc.ep133.features.ProjectSeq) {
        val at = sceneTickNow()
        if (at != null) sceneDue(at)
        setSeq(pick(at, settings.value.sceneSwitch))
        // A queue made or dropped: the plan has it.
        refreshPatternPlan()
        publishScene()
        // On its tick, not the next beat's.
        if (sceneDesk.waiting > 0) wakePattern()
    }

    // An edit of the sequencer on the desk (already one UNDO step), and Live follows. A pick the sequencer may have played from
    // already takes over first: the edit's on what is heard, and one it drops would be heard undone.
    private inline fun sceneEdit(edit: () -> dev.arc.ep133.features.ProjectSeq) {
        sceneTickNow()?.let(::sceneDue)
        setSeq(edit())
        publishScene()
    }

    // The PAD flow began waiting for a pad: ERASE and CORRECT go off, whose taps are their own (and come first).
    private fun stageBegun() {
        if (sceneDesk.padStage == PadStage.NONE) return
        if (_pattern.value.erase) setPatternErase(false)
        if (stepDesk.correct) setStepCorrect(false)
    }

    // Running, the tick a pick made now goes from: the one heard, but no earlier than the sequencer can still switch at (what
    // it has sent ahead of the ear is the old pattern's). Null while stopped (or not heard yet): a pick plays at once.
    private fun sceneTickNow(): Double? =
        if (patternRunning()) patternHeardTickAt(System.nanoTime())?.let { maxOf(it, patternScheduler.freeTick.toDouble()) } else null

    // The PAD flow is dropped (ERASE came on).
    private fun endPadStage() {
        if (sceneDesk.padStage == PadStage.NONE) return
        sceneDesk.endStage()
        publishScene()
    }

    /** The panel closes (✕, STEP, SAMPLE, another project), if it was open. */
    private fun closeScene() {
        if (!sceneDesk.open) return
        sceneDesk.close()
        sceneTaps.clear()
        publishScene()
    }

    /**
     * The picks waiting whose tick the playhead has passed ([tick], as heard) take over, as [followTick] finds them
     * and a press past one: the sequencer takes the pattern, which the sequencer's plan was playing from the tick already.
     */
    private fun sceneDue(tick: Double) {
        val waiting = sceneDesk.waiting
        if (waiting == 0) return
        val out = sceneDesk.due(projectSeq, tick)
        if (sceneDesk.waiting == waiting && out === projectSeq) return
        setSeq(out)
        // The queue went: the plan has none.
        refreshPatternPlan()
        publishScene()
    }

    // STOP: every pick waiting takes over at once.
    private fun sceneFlush() {
        if (sceneDesk.waiting == 0) return
        setSeq(sceneDesk.flush(projectSeq))
        refreshPatternPlan()
        publishScene()
    }

    // The follow loop wakes now, so a pick just queued is found on its tick.
    private fun wakePattern() {
        if (patternLoop?.isActive == true) followPattern()
    }

    // ---------- PROJECT: the next project (an addition) ----------

    /**
     * PROJECT's tap. Connected, the EP-133 switches to the next project
     * (ProjectStep.next) and Live follows it once it is read; taps while it
     * switches move the target on, and one worker writes the newest
     * ([switchProjects]). Offline, Live shows the next of its views instead
     * (the last read's project and the factory pack's), in arc only.
     * Nothing while Live reads, another action holds the device, or there is
     * nothing to step to (as [dev.arc.ep133.ui.screens.projectKeyOf] greys it out).
     */
    fun stepProject() {
        val mi = _state.value.mirror ?: return
        if (mi.offline != null) {
            val views = mi.offlineProjects
            // A tap before the last one's view opened steps on from that one.
            val cur = offlineProject?.takeIf { it in views } ?: mi.state.activeProject
            dev.arc.ep133.features.ProjectStep.nextOffline(cur, views)?.let(::selectProject)
            return
        }
        val m = mirror ?: return
        selectProject(dev.arc.ep133.features.ProjectStep.next(projectTarget ?: m.snapshot(System.nanoTime()).activeProject))
    }

    /**
     * PROJECT held, a project picked on its sheet: [n] (1..9) as [stepProject]
     * would go there. Connected, the EP-133 switches to it (a pick while it
     * switches moves the target); offline, Live shows that view, when it is
     * one of [MirrorUi.offlineProjects]. Nothing for the project already
     * shown, nor under the same conditions as a tap.
     */
    fun selectProject(n: Int) {
        if (n !in 1..dev.arc.ep133.protocol.Device.PROJECT_COUNT) return
        val mi = _state.value.mirror ?: return
        if (mi.offline != null) {
            // Offline: a view of what arc has (no device, nothing written).
            val views = mi.offlineProjects
            if (n !in views || n == (offlineProject?.takeIf { it in views } ?: mi.state.activeProject)) return
            offlineProject = n
            scope.launch { openOfflineMirror() }
            return
        }
        val s = session
        val m = mirror
        if (s == null || m == null || mirrorSession !== s || _state.value.device == null || mi.loading) return
        // Another action holds the device (the key is greyed out); PROJECT's own switch takes more.
        if (_state.value.busy && projectTarget == null) return
        if (projectTarget == null && n == m.snapshot(System.nanoTime()).activeProject) return
        projectTarget = n
        showProjectTarget()
        if (projectJob?.isActive != true) projectJob = scope.launch { switchProjects() }
    }

    /**
     * Writes [projectTarget] as the device's active project and reads it
     * back, again while taps moved it on meanwhile. Only the newest's read
     * goes further: its pads, the saved read, preload and copies, as for a
     * project switched on the device ([loadMirrorProject]). A failed switch
     * says why, and Live stays on the project it read last. Each pass
     * finishes (a read cut short would put the session out of step); a
     * mirror closed or reopened meanwhile is looked at again.
     */
    private suspend fun switchProjects() {
        val done = passOnNewest({ projectTarget }) { want -> projectPass(want) } ?: return
        projectTarget = null
        val read = done.read
        if (read == null) {
            showProjectTarget()
            toast(dev.arc.ep133.text.MirrorText.projectFailed(done.failed ?: dev.arc.ep133.text.MirrorText.EDIT_OFFLINE), error = true)
            return
        }
        val m = done.mirror
        m.setProject(read.first, read.second)
        padsRead(read.first, done.layout)
        saveLastRead(m)
        preloadPads(m)
        copyPadSounds(m, done.session)
        _state.update { cur -> cur.mirror?.let { cur.copy(mirror = it.copy(state = m.snapshot(System.nanoTime()), projectTarget = null)) } ?: cur }
    }

    /** One [switchProjects] pass: what was read, or ([read] null) why it [failed]. */
    private class ProjectPass(
        val mirror: dev.arc.ep133.features.LiveMirror,
        val session: Session,
        val read: Pair<Int?, List<dev.arc.ep133.features.PadGroup>>?,
        val failed: String?,
        /** The project read, whole: its pad records' settings too. */
        val layout: dev.arc.ep133.features.ProjectLayout? = null,
    )

    /** Writes [want] and reads it back, then its pads; null when a tap moved on or the mirror went meanwhile. */
    private suspend fun projectPass(want: Int): ProjectPass? {
        val s = session
        val m = mirror
        if (s == null || m == null || mirrorSession !== s) {
            projectTarget = null
            return null
        }
        var failed: String? = null
        var tapped = false
        var layout: dev.arc.ep133.features.ProjectLayout? = null
        val read = exclusive<Pair<Int?, List<dev.arc.ep133.features.PadGroup>>?>("liveProject", quiet = true, wait = true) { ss ->
            try {
                Device.setActiveProject(ss, want)
                val now = Device.activeProject(ss)
                // Tapped on: the next pass writes the newest, these pads aren't needed.
                tapped = projectTarget != want
                // Empty projects may have no pads to read: they show empty.
                layout = if (tapped) null else now?.let { p -> runCatching { DeviceBrowser.projectLayout(ss, p) }.getOrNull() }
                if (tapped) null else now to (layout?.pads ?: emptyList())
            } catch (e: Throwable) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                failed = e.message ?: e.toString()
                null
            }
        }
        // Closed, reopened or disconnected meanwhile, or tapped on: the next pass sees.
        if (mirror !== m || session !== s || tapped) return null
        return ProjectPass(m, s, read, failed, layout)
    }

    /** The mirror shows [projectTarget] (connected; null when not switching). */
    private fun showProjectTarget() {
        _state.update { cur -> cur.mirror?.let { cur.copy(mirror = it.copy(projectTarget = projectTarget)) } ?: cur }
    }

    /** The sample on a pad in the mirror, once it is known. */
    fun mirrorName(pad: dev.arc.ep133.features.PhysicalPad): String? = mirror?.nameOf(pad)

    /** The sound put on a pad offline, in arc only, if any (for the pad sheet's list). */
    fun mirrorLocal(pad: dev.arc.ep133.features.PhysicalPad): OfflinePad? = mirror?.localOf(pad)

    /** The slot the read has on [t]'s pad, under any offline change: the pad sheet keeps it pickable. */
    fun mirrorReadSlot(t: dev.arc.ep133.features.PadTarget): Int? = mirror?.slotAt(t.group, t.pad)

    /** The device's sounds as Live read them: for its copies, its names and EDIT's pad sheet. */
    private fun setLiveSounds(m: dev.arc.ep133.features.LiveMirror, sounds: List<dev.arc.ep133.protocol.SoundEntry>) {
        deviceSounds = sounds.associateBy { it.slot }
        m.setNames(sounds.associate { it.slot to it.name })
        _state.update { cur -> cur.mirror?.let { cur.copy(mirror = it.copy(sounds = sounds)) } ?: cur }
    }

    // ---------- EDIT: another sound on a pad (an addition; community notes, see Device.assignPad) ----------

    /**
     * Where a tapped pad's sound is set, for EDIT's pad sheet; null (with a
     * toast saying why) while the device isn't connected and Live shows no
     * last read (or factory sounds) to change in arc, Live hasn't read the
     * active project yet, or PROJECT is switching it.
     */
    fun editTarget(pad: dev.arc.ep133.features.PhysicalPad): dev.arc.ep133.features.PadTarget? = when (val w = padTargetOrWhy(pad)) {
        is PadTargetOrWhy.Found -> w.target
        is PadTargetOrWhy.Why -> null.also { toast(w.text) }
    }

    /** [editTarget] without the toast: SAMPLE's KEEP sends a take with no pad to go on to Takes instead. */
    private fun padTargetOrWhy(pad: dev.arc.ep133.features.PhysicalPad): PadTargetOrWhy {
        val m = mirror
        // Offline, the pads change in arc only, until the device connects (assignOffline).
        val offline = m != null && mirrorSession == null && _state.value.device == null && _state.value.mirror?.offlineSounds != null
        val connected = session != null && _state.value.device != null && mirrorSession != null
        return padTargetOrWhy(m, offline, connected, projectTarget != null, pad)
    }

    /**
     * Puts sample [slot] on [pad] at once (where [t] says its sound is set).
     * The names follow straight away, and a toast offers UNDO when the pad's
     * old sound is known (an empty pad can't be emptied again). A SAMPLE
     * recording still waiting on the pad goes to Takes ([recordingsOverwritten]).
     * Offline it changes in arc only ([assignOffline]), picked from
     * [source]'s list.
     */
    fun assignPad(
        pad: dev.arc.ep133.features.PhysicalPad,
        t: dev.arc.ep133.features.PadTarget,
        slot: Int,
        source: SoundSource = SoundSource.DEVICE,
    ): Job = scope.launch {
        if (_state.value.device == null) return@launch assignOffline(pad, t, slot, source)
        // The factory list is only offered offline: its slot isn't the device's sound.
        if (source != SoundSource.DEVICE) return@launch
        if (writePad(t, slot, dev.arc.ep133.text.MirrorText::assignFailed)) {
            assignedToast(pad, t, slot, moved = recordingsOverwritten(t))
        }
    }

    /**
     * Another sound was written onto [t]'s pad while connected: a SAMPLE
     * recording kept on it and not up yet (queued, or failed) would play on
     * in its place and, its turn come, overwrite it. Its change goes, the
     * pad plays what the device has, and its file goes to Takes; how many
     * did. One going up now goes on (it leaves for Takes if it can't land).
     */
    private suspend fun recordingsOverwritten(t: dev.arc.ep133.features.PadTarget): Int {
        val before = loadOfflinePads()
        val pads = withoutRecordingsOn(before, t, samplesGoingUp)
        if (pads.list.size == before.list.size) return 0
        val gone = before.list.filter { it !in pads.list }
        val files = gone.mapNotNullTo(HashSet()) { it.file }
        sampleQueue.removeAll { it.file in files }
        samplesFailed -= files
        saveOfflinePads(pads)
        mirror?.takeIf { mirrorSession != null && mirrorSession === session }?.let { localChanged(it, connectedLocal(pads, samplesShown())) }
        return recordingsToTakes(gone)
    }

    /**
     * Offline: [slot] from [source]'s list on [pad] in arc only, kept until
     * the device connects ([offerOfflinePads]) or "Reset pads". Only a sound
     * arc can play is taken, and the device's own sound back on the pad
     * (playable or not) drops its change. No UNDO: picking the old sound
     * again does it.
     */
    private suspend fun assignOffline(
        pad: dev.arc.ep133.features.PhysicalPad,
        t: dev.arc.ep133.features.PadTarget,
        slot: Int,
        source: SoundSource,
    ) {
        val m = mirror?.takeIf { mirrorSession == null } ?: return toast(dev.arc.ep133.text.MirrorText.EDIT_OFFLINE)
        val readSlot = m.slotAt(t.group, t.pad)
        val entry = _state.value.mirror?.offlineSounds?.pick(slot, source, readSlot) ?: return toast(dev.arc.ep133.text.MirrorText.NEEDS_DEVICE)
        val before = loadOfflinePads()
        val pads = offlineAssign(before, t, slot, entry.name, source, readSlot)
        if (mirror !== m) return
        saveOfflinePads(pads)
        // A recording on the pad not on the device yet: into Takes, never left unseen in arc's folder.
        val moved = recordingsToTakes(recordingsLetGo(before, pads, samplesGoingUp))
        // The new sound comes with its own settings, as on the device.
        saveOfflinePadSettings(loadOfflinePadSettings().drop(t.project, t.group, t.pad))
        forgetPadSettings(t)
        localChanged(m, pads)
        val text = dev.arc.ep133.text.MirrorText.assignedOffline(pad, entry.name)
        toast(if (moved > 0) "$text.${samplesMoved(moved)}" else text)
    }

    /**
     * Live tools' "Reset pads": the offline pad changes go, and the pads play
     * the device's sounds as last read. Recordings among them go to Takes
     * (those uploading now go on).
     */
    fun resetOfflinePads(): Job = scope.launch {
        val moved = dropOfflinePads()
        saveOfflinePadSettings(dev.arc.ep133.features.OfflinePadSettings.EMPTY)
        if (mirrorSession == null) padSettings = emptyMap()
        mirror?.takeIf { mirrorSession == null }?.let { localChanged(it, loadOfflinePads()) }
        toast(dev.arc.ep133.text.MirrorText.PADS_RESET + samplesMoved(moved))
    }

    /**
     * Drops the offline pad changes but the recordings uploading now, the
     * other recordings moved to Takes; how many were.
     */
    private suspend fun dropOfflinePads(): Int {
        val pads = loadOfflinePads()
        val uploading = samplesUploading()
        val (keep, drop) = pads.list.partition { it.file != null && it.file in uploading }
        saveOfflinePads(OfflinePads(keep))
        return recordingsToTakes(drop)
    }

    /** " 2 samples kept in Takes." after a toast, when [n] recordings went there. */
    private fun samplesMoved(n: Int) = if (n > 0) " " + dev.arc.ep133.text.MirrorText.samplesToTakes(n) else ""

    /** The offline mirror [m] shows [pads]: names, samples and their preload follow. */
    private fun localChanged(m: dev.arc.ep133.features.LiveMirror, pads: OfflinePads) {
        m.setLocal(pads)
        refreshPatternPlan()
        preloadPads(m)
        _state.update { cur -> cur.mirror?.let { cur.copy(mirror = it.copy(state = m.snapshot(System.nanoTime()))) } ?: cur }
    }

    /** A good read of the device on [s]: offline pad changes kept are asked about ([writeOfflinePads] or [discardOfflinePads]). */
    private suspend fun offerOfflinePads(s: Session) {
        // Still writing them (the app left and came back meanwhile): not asked again.
        if (offlineWrite?.isActive == true) return
        // Recordings uploading now aren't asked about: they are on their way already.
        val uploading = samplesUploading()
        val pads = loadOfflinePads().list.filterNot { it.file != null && it.file in uploading }
        val samples = pads.count { it.source == SoundSource.RECORDED }
        val changes = pads.size - samples + loadOfflinePadSettings().size
        if (changes + samples > 0 && session === s) _state.update { it.copy(offlinePrompt = OfflinePrompt(changes, samples)) }
    }

    /**
     * Write: the offline pad changes go on the device, one after another,
     * each one only where it still fits ([OfflinePads.fits]): the project it
     * was made on is the active one, and the device still holds that sound in
     * that slot. Then they are cleared, and a toast counts what was put on
     * and what skipped. The connection going meanwhile keeps the ones not
     * written yet, for the next read to ask about. A Write while one runs
     * is the same one.
     */
    fun writeOfflinePads(): Job {
        _state.update { it.copy(offlinePrompt = null) }
        offlineWrite?.takeIf { it.isActive }?.let { return it }
        // Lazy, so it is the one running before its first step.
        return scope.launch(start = kotlinx.coroutines.CoroutineStart.LAZY) { writeOfflinePadsNow() }.also {
            offlineWrite = it
            it.start()
        }
    }

    private suspend fun writeOfflinePadsNow() {
        val s = session
        // The mirror's read is what the changes are checked against: wait for it.
        _state.first { it.mirror?.loading != true }
        val m = mirror
        if (s == null || session !== s || m == null || mirrorSession !== s) return toast(dev.arc.ep133.text.MirrorText.EDIT_OFFLINE)
        // Recordings uploading now are left to their upload ([uploadSamples]).
        val uploading = samplesUploading()
        val pads = loadOfflinePads().list.filterNot { it.file != null && it.file in uploading }
        var written = 0
        var skipped = 0
        // Recordings that couldn't go on: to Takes, never dropped.
        val unplaced = ArrayList<OfflinePad>()
        for ((i, p) in pads.withIndex()) {
            // Replaced meanwhile by a take kept on its pad (which goes up on its own, the old one into Takes).
            if (p !in loadOfflinePads().list) continue
            val names = deviceSounds.mapValues { it.value.name }
            when (val step = offlineStep(p, m.snapshot(System.nanoTime()).activeProject, names, m.slotAt(p.group, p.pad))) {
                OfflineStep.Skip -> {
                    skipped++
                    if (p.source == SoundSource.RECORDED) unplaced += p
                }
                OfflineStep.Done -> written++
                // writePad waits for the device when it is busy.
                is OfflineStep.Write -> when {
                    writePad(step.target, step.slot, dev.arc.ep133.text.MirrorText::assignFailed) -> written++
                    // The connection went: this change and the rest are kept (and what came since).
                    session !== s -> return keepUnwritten(pads.take(i), unplaced)
                    else -> skipped++
                }
                // The upload waits for the device too.
                is OfflineStep.Upload -> when {
                    uploadRecorded(s, p, step.target, physicalPadOf(m, p.group, p.pad)) != null -> written++
                    session !== s -> return keepUnwritten(pads.take(i), unplaced)
                    else -> {
                        skipped++
                        unplaced += p
                    }
                }
            }
        }
        // Changes made meanwhile (a recording kept) stay for their own upload or the next question.
        saveOfflinePads(OfflinePads(loadOfflinePads().list.filter { it !in pads }))
        val moved = recordingsToTakes(unplaced)
        // Then the settings turned offline, on the pads of the project they were turned in that still
        // hold the sound they were turned for: only what was turned changes, the rest is the device's now.
        val turned = loadOfflinePadSettings().list
        for ((i, p) in turned.withIndex()) {
            val active = m.snapshot(System.nanoTime()).activeProject
            val slot = m.slotAt(p.group, p.pad)
            if (active != p.project || slot == null || slot != p.slot) {
                skipped++
                continue
            }
            val t = dev.arc.ep133.features.PadTarget(p.project, p.group, p.pad, slot)
            val key = padKey(t)
            val meta = exclusive("pad", quiet = true, wait = true) { ss -> Device.readPad(ss, t.project, t.group, t.pad) }
            if (meta == null) {
                if (session !== s) return saveOfflinePadSettings(dev.arc.ep133.features.OfflinePadSettings(turned.drop(i)))
                skipped++
                continue
            }
            val record = padSettings[key] ?: dev.arc.ep133.features.PadSettings.DEFAULT
            val now = if (dev.arc.ep133.features.PadSettings.written(meta)) dev.arc.ep133.features.PadSettings.fromMeta(meta, record) else record
            val merged = p.settings.mergedOnto(p.base, now)
            when {
                writePadSettings(t, merged, p.frames, revert = false) -> {
                    written++
                    padSettings = padSettings + (key to merged)
                }
                session !== s -> return saveOfflinePadSettings(dev.arc.ep133.features.OfflinePadSettings(turned.drop(i)))
                else -> skipped++
            }
        }
        saveOfflinePadSettings(dev.arc.ep133.features.OfflinePadSettings.EMPTY)
        toast(dev.arc.ep133.text.MirrorText.offlineWritten(written, skipped) + samplesMoved(moved))
    }

    /**
     * The connection went during [writeOfflinePadsNow]: the changes [done]
     * are gone, the rest kept for the next question; the recordings among
     * those done that couldn't go on ([unplaced]) go to Takes.
     */
    private suspend fun keepUnwritten(done: List<OfflinePad>, unplaced: List<OfflinePad>) {
        saveOfflinePads(OfflinePads(loadOfflinePads().list.filter { it !in done }))
        val moved = recordingsToTakes(unplaced)
        if (moved > 0) toast(dev.arc.ep133.text.MirrorText.samplesToTakes(moved))
    }

    /**
     * Discard: the offline pad changes go, and the device keeps its pads as
     * they are. Recordings among them go to Takes.
     */
    fun discardOfflinePads(): Job = scope.launch {
        _state.update { it.copy(offlinePrompt = null) }
        val moved = dropOfflinePads()
        saveOfflinePadSettings(dev.arc.ep133.features.OfflinePadSettings.EMPTY)
        toast(dev.arc.ep133.text.MirrorText.OFFLINE_DISCARDED + samplesMoved(moved))
    }

    /**
     * UNDO: [t]'s old slot back on [pad]. It doesn't need the mirror the
     * toast came from: Live may have been closed or read again since.
     */
    private fun undoAssign(pad: dev.arc.ep133.features.PhysicalPad, t: dev.arc.ep133.features.PadTarget): Job = scope.launch {
        val old = t.slot ?: return@launch
        if (writePad(t, old, dev.arc.ep133.text.MirrorText::undoFailed)) {
            toast(dev.arc.ep133.text.MirrorText.restored(pad, soundName(old)))
        }
    }

    /**
     * "Upload a new sample…" from the pad sheet: the picked WAV goes into the
     * first free slot, then onto [pad] (a SAMPLE recording waiting on it goes
     * to Takes, as with [assignPad]). A file that isn't a usable WAV is
     * turned away before anything is written. The picker stops the app, so
     * Live's mirror is gone or being read again when the file comes back:
     * the upload waits for the device and doesn't need the mirror.
     */
    fun uploadToPad(uri: android.net.Uri, pad: dev.arc.ep133.features.PhysicalPad, t: dev.arc.ep133.features.PadTarget): Job = scope.launch {
        val s = session ?: return@launch toast(dev.arc.ep133.text.MirrorText.EDIT_OFFLINE)
        val (fileName, _) = withContext(Dispatchers.IO) { dev.arc.ep133.files.Files.describe(context, uri) }
        val bytes = try {
            withContext(Dispatchers.IO) { dev.arc.ep133.files.Files.read(context, uri) }.also { b ->
                withContext(Dispatchers.Default) { Wav.decode(b) }
            }
        } catch (e: Throwable) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            toast(dev.arc.ep133.text.MirrorText.uploadFailed(e.message ?: e.toString()), error = true)
            return@launch
        }
        val slot = uploadBytesToPad(s, fileName, bytes, t) ?: return@launch
        assignedToast(pad, t, slot, deviceSounds[slot]?.name ?: SampleUpload.nameFor(fileName), recordingsOverwritten(t))
    }

    /**
     * [wav] (named after [fileName]) into a free slot, then onto [t]'s pad:
     * [slot] when given (SAMPLE's review picked it; it must still be free),
     * else the first free one. As a task with the progress sheet, or ([task]
     * false, SAMPLE's uploads) while Live plays on, its progress going to
     * [onProgress], the transfer service keeping arc alive meanwhile (its
     * notification's Cancel stops it: [backgroundTask]). The mirror's names
     * and the pad follow, after [kept] (the slot written) has kept the pad's
     * copy, when the caller has the sound. Returns the slot, or null once a
     * toast said why not.
     */
    private suspend fun uploadBytesToPad(
        s: Session,
        fileName: String,
        wav: ByteArray,
        t: dev.arc.ep133.features.PadTarget,
        slot: Int? = null,
        task: Boolean = true,
        kept: suspend (Int) -> Unit = {},
        onProgress: (Progress) -> Unit = {},
    ): Int? {
        val into = if (task) {
            runTask(Strings.UPLOADING, wait = true) { progress, signal ->
                SampleUpload.uploadToPad(s, fileName, wav, deviceSounds.keys, t, onProgress = progress, signal = signal, slot = slot)
            }
        } else {
            var error: String? = null
            var cancelled = false
            val signal = CancelSignal()
            abortBackground = signal
            _backgroundTask.value = TaskUi(Strings.UPLOADING, SampleUpload.nameFor(fileName), 0.0, cancelling = false)
            // Not allowed from the background on newer Android (the upload then goes on as long as arc does).
            runCatching { ContextCompat.startForegroundService(context, Intent(context, TransferService::class.java)) }
            val progress: (Progress) -> Unit = { p ->
                onProgress(p)
                _backgroundTask.update { it?.copy(fraction = p.fraction) }
            }
            try {
                exclusive("upload", quiet = true, wait = true) { ss ->
                    try {
                        SampleUpload.uploadToPad(ss, fileName, wav, deviceSounds.keys, t, onProgress = progress, signal = signal, slot = slot)
                    } catch (e: Throwable) {
                        if (e is kotlinx.coroutines.CancellationException) throw e
                        if (e is CancelledError) cancelled = true else error = e.message ?: e.toString()
                        null
                    }
                }.also {
                    error?.let { toast(dev.arc.ep133.text.MirrorText.uploadFailed(it), error = true) }
                    if (cancelled) toast(Strings.CANCELLED)
                }
            } finally {
                if (abortBackground === signal) {
                    abortBackground = null
                    // The service stops itself when it sees the transfer end.
                    _backgroundTask.value = null
                }
            }
        }
        if (into == null) {
            // runTask showed its own error; a connection gone while waiting needs saying.
            if (session !== s) toast(dev.arc.ep133.text.MirrorText.EDIT_OFFLINE)
            return null
        }
        // The new sound's name and size, for the pad and its copy (a mirror opened since read them already),
        // and the space left, for SAMPLE's "Disk low".
        mirror?.let { m ->
            exclusive("mirror", quiet = true, wait = true) { ss -> DeviceBrowser.contents(ss) }?.let { c ->
                if (mirror === m) setLiveSounds(m, c.sounds)
                _state.update { st -> st.device?.let { d -> st.copy(device = d.copy(storage = c.storage, sounds = c.sounds.size)) } ?: st }
            }
        }
        kept(into)
        mirror?.let { padWritten(it, t, into) }
        return into
    }

    /**
     * Writes [slot] onto [t]'s pad, waiting for the device if it is busy; on
     * failure a toast with [failed] (or, disconnected, why) and false.
     */
    private suspend fun writePad(t: dev.arc.ep133.features.PadTarget, slot: Int, failed: (String) -> String): Boolean {
        var error: String? = null
        val ok = exclusive("pad", quiet = true, wait = true) { s ->
            try {
                Device.assignPad(s, t.project, t.group, t.pad, slot)
                true
            } catch (e: Throwable) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                error = e.message ?: e.toString()
                false
            }
        }
        when {
            error != null -> toast(failed(error!!), error = true)
            ok == null -> toast(dev.arc.ep133.text.MirrorText.EDIT_OFFLINE, error = true)
        }
        if (ok != true) return false
        mirror?.let { padWritten(it, t, slot) }
        return true
    }

    /**
     * The mirror, its saved read and the pad's copy follow a written pad.
     * Only a mirror of this connection that has read [t]'s project: another
     * one reads the pad from the device anyway.
     */
    private fun padWritten(m: dev.arc.ep133.features.LiveMirror, t: dev.arc.ep133.features.PadTarget, slot: Int) {
        if (mirrorSession == null || mirrorSession !== session || m.snapshot(System.nanoTime()).activeProject != t.project) return
        m.assigned(t, slot)
        forgetPadSettings(t)
        saveLastRead(m)
        preloadPads(m)
        session?.let { copyPadSounds(m, it) }
        _state.update { cur -> cur.mirror?.let { cur.copy(mirror = it.copy(state = m.snapshot(System.nanoTime()))) } ?: cur }
    }

    /** "Pad A 8: [name]", with UNDO where it can; and how many recordings on the pad went to Takes ([moved]). */
    private fun assignedToast(pad: dev.arc.ep133.features.PhysicalPad, t: dev.arc.ep133.features.PadTarget, slot: Int, name: String = soundName(slot), moved: Int = 0) {
        val said = dev.arc.ep133.text.MirrorText.assigned(pad, name)
        val text = if (moved > 0) "$said.${samplesMoved(moved)}" else said
        // UNDO only where the old sound is known, and isn't the one just put there.
        if (t.slot != null && t.slot != slot) {
            toast(text, action = dev.arc.ep133.text.MirrorText.UNDO, onAction = { undoAssign(pad, t) })
        } else {
            toast(text)
        }
    }

    /** A slot's sound name as Live read it, or its number. */
    private fun soundName(slot: Int): String = deviceSounds[slot]?.name ?: FeatureText.slot(slot)

    // ---------- EDIT: a pad's sound settings (an addition; community notes, see Device.writePadSettings) ----------

    private fun padKey(t: dev.arc.ep133.features.PadTarget) = Triple(t.project, t.group, t.pad)

    /**
     * EDIT's sheet opened on [pad] ([t] from [editTarget]): its settings
     * show at once as arc knows them, its sound loads for TRIM's length and
     * waveform, and, connected, the EP-133 is asked for the pad's own (it may
     * have been turned on the device since). The pad's metadata when it has
     * been written, else what its pad record holds, else the defaults.
     * Offline they are arc's own, kept until the device connects. An empty
     * pad has nothing to set.
     */
    fun openPadEdit(pad: dev.arc.ep133.features.PhysicalPad, t: dev.arc.ep133.features.PadTarget) {
        padEditJob?.cancel()
        val slot = t.slot
        if (slot == null) {
            _padEdit.value = null
            return
        }
        val offline = _state.value.device == null
        val key = padKey(t)
        val known = padSettings[key]
        _padEdit.value = PadEditState(pad, t, known ?: dev.arc.ep133.features.PadSettings.DEFAULT, reading = !offline, offline = offline)
        padEditJob = scope.launch {
            // The sound loads beside the read: only TRIM waits for it.
            launch {
                val a = padAudio(pad) ?: return@launch
                val frames = (a.pcm.size / a.channels).toLong()
                val peaks = withContext(Dispatchers.Default) { dev.arc.ep133.ui.screens.trimPeaks(a.pcm, a.channels) }
                _padEdit.update { e -> e?.takeIf { it.target == t }?.copy(frames = frames, sampleRate = a.sampleRate, peaks = peaks) ?: e }
            }
            if (offline) {
                // The base is what the first offline turn started from, kept with the change.
                val kept = loadOfflinePadSettings().at(t.project, t.group, t.pad)?.takeIf { it.slot == slot }
                if (kept != null) {
                    padSettings = padSettings + (key to kept.settings)
                    _padEdit.update { e -> e?.takeIf { it.target == t }?.copy(settings = kept.settings, base = kept.base) ?: e }
                }
                return@launch
            }
            val meta = exclusive("pad", quiet = true, wait = true) { s -> Device.readPad(s, t.project, t.group, t.pad) }
            // A turn made while it read is newer than what was read.
            val turned = padPending?.first?.let(::padKey) == key
            if (meta == null && !turned) {
                // No answer: nothing to turn from but guesses, which a write would put over the pad.
                toast(dev.arc.ep133.text.MirrorText.PAD_READ_FAILED, error = true)
                _padEdit.update { e -> e?.takeIf { it.target == t }?.copy(reading = false, failed = true) ?: e }
                return@launch
            }
            // Keys the metadata lacks keep what the pad record says.
            val read = meta?.takeIf { dev.arc.ep133.features.PadSettings.written(it) }
                ?.let { dev.arc.ep133.features.PadSettings.fromMeta(it, known ?: dev.arc.ep133.features.PadSettings.DEFAULT) }
            val settings = if (turned) padSettings[key] else read ?: known
            if (!turned) (read ?: known)?.let { padSaved[key] = it }
            if (settings != null) padSettings = padSettings + (key to settings)
            _padEdit.update { e -> e?.takeIf { it.target == t }?.let { it.copy(settings = settings ?: it.settings, reading = false) } ?: e }
        }
    }

    /** EDIT's sheet closed: a turn not yet written still goes on the device. */
    fun closePadEdit() {
        padEditJob?.cancel()
        _padEdit.value = null
    }

    /**
     * A knob turned on the open pad sheet: the pad plays with [settings]
     * on the phone at once, and they go on the EP-133 once the turning rests
     * ([PAD_WRITE_DELAY_MS]), the newest only; offline they are kept in arc.
     */
    fun adjustPad(settings: dev.arc.ep133.features.PadSettings) {
        val e = _padEdit.value?.takeIf { !it.reading && !it.failed } ?: return
        val v = settings.clamped(e.frames)
        if (v == e.settings) return
        val key = padKey(e.target)
        padSettings = padSettings + (key to v)
        _padEdit.value = e.copy(settings = v)
        // A pattern playing the pad plays it so from its next note.
        refreshPatternPlan()
        if (e.offline) {
            val slot = e.target.slot ?: return
            val change = dev.arc.ep133.features.OfflinePadSetting(e.target.project, e.target.group, e.target.pad, slot, v, e.base, e.frames)
            scope.launch { saveOfflinePadSettings(loadOfflinePadSettings().put(change)) }
            return
        }
        padPending = Triple(e.target, v, e.frames)
        if (padWriter?.isActive == true) return
        padWriter = scope.launch {
            delay(PAD_WRITE_DELAY_MS)
            while (true) {
                val (t, s, frames) = padPending ?: break
                padPending = null
                writePadSettings(t, s, frames)
            }
        }
    }

    /**
     * Puts [settings] on [t]'s pad, the whole record (a part could make the
     * device take the rest from the sample again). A failure says why, and
     * (with [revert]) the pad goes back to the settings last written or read.
     */
    private suspend fun writePadSettings(
        t: dev.arc.ep133.features.PadTarget,
        settings: dev.arc.ep133.features.PadSettings,
        frames: Long?,
        revert: Boolean = true,
    ): Boolean {
        val slot = t.slot ?: return false
        var error: String? = null
        val ok = exclusive("pad", quiet = true, wait = true) { s ->
            try {
                Device.writePadSettings(s, t.project, t.group, t.pad, slot, settings, frames)
                true
            } catch (e: Throwable) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                error = e.message ?: e.toString()
                false
            }
        }
        val key = padKey(t)
        if (ok == true) {
            padSaved[key] = settings
            return true
        }
        toast(error?.let(dev.arc.ep133.text.MirrorText::padSettingsFailed) ?: dev.arc.ep133.text.MirrorText.EDIT_OFFLINE, error = true)
        // Back to what the device has, unless a newer turn is on its way (or nothing is known of it).
        val back = padSaved[key]
        if (revert && back != null && padPending?.first?.let(::padKey) != key) {
            padSettings = padSettings + (key to back)
            _padEdit.update { e -> e?.takeIf { padKey(it.target) == key }?.copy(settings = back) ?: e }
        }
        return false
    }

    /**
     * How [pad] plays on the phone: its settings as known, made a voice
     * shape; unknown, as a pad always has (held, then let go of). KEYS
     * ([keys]) plays each note on its own, so LEGATO's one voice across notes
     * becomes a held note there. Either way it is on its group's FX bus, and
     * ducks the sidechain's groups when it is the source (KEYS' notes too,
     * when their pad is).
     */
    private fun shapeFor(pad: dev.arc.ep133.features.PhysicalPad?, keys: Boolean = false): dev.arc.ep133.formats.VoiceShape {
        pad ?: return dev.arc.ep133.formats.VoiceShape.DEFAULT
        val duck = duckSource(fxDesk.fx.value, pad)
        val s = mirror?.target(pad)?.let { padSettings[padKey(it)] } ?: return dev.arc.ep133.formats.VoiceShape(bus = pad.group, duckSource = duck)
        return voiceShape(s, pad.group, keys, duck)
    }

    /**
     * The EP-133's [project] read ([layout]): arc's settings for its pads
     * start again from what its pad records hold (they may have been turned
     * on the device); a pad's sheet still asks the device for its own.
     */
    private fun padsRead(project: Int?, layout: dev.arc.ep133.features.ProjectLayout?) {
        padSaved.clear()
        padSettings = if (project == null || layout == null) {
            emptyMap()
        } else {
            layout.settings.mapNotNull { (k, v) -> k.first.singleOrNull()?.minus('a')?.let { g -> Triple(project, g, k.second) to v } }.toMap()
        }
        // What the records hold is what the device has, until a read or write says otherwise.
        padSaved.putAll(padSettings)
        refreshPatternPlan()
    }

    /** A pad's place in arc's memory of settings changes: its sound changed, so the device takes them from the sample again. */
    private fun forgetPadSettings(t: dev.arc.ep133.features.PadTarget) {
        val key = padKey(t)
        padSettings = padSettings - key
        padSaved.remove(key)
        refreshPatternPlan()
    }

    /** EDIT's offline pad settings, read from their file once (none when it is missing or unreadable). */
    private suspend fun loadOfflinePadSettings(): dev.arc.ep133.features.OfflinePadSettings {
        offlinePadSettings?.let { return it }
        val read = withContext(Dispatchers.IO) {
            runCatching { dev.arc.ep133.features.OfflinePadSettings.fromJson(offlinePadSettingsFile.readText()) }.getOrNull()
        } ?: dev.arc.ep133.features.OfflinePadSettings.EMPTY
        return offlinePadSettings ?: read.also { offlinePadSettings = it }
    }

    /** Keeps [settings] as EDIT's offline pad settings (written whole, then renamed over the file); none deletes the file. */
    private fun saveOfflinePadSettings(settings: dev.arc.ep133.features.OfflinePadSettings) {
        offlinePadSettings = settings
        scope.launch(Dispatchers.IO) {
            synchronized(offlinePadSettingsFile) {
                if (offlinePadSettings !== settings) return@synchronized // newer changes are on their way
                runCatching {
                    if (settings.size == 0) {
                        offlinePadSettingsFile.delete()
                    } else {
                        val tmp = java.io.File(offlinePadSettingsFile.path + ".tmp")
                        tmp.writeText(settings.toJson())
                        if (!tmp.renameTo(offlinePadSettingsFile)) tmp.delete()
                    }
                }
            }
        }
    }

    fun setPadOrder(order: dev.arc.ep133.features.PadOrder) {
        mirrorPrefs.edit { putString("order", order.name) }
        scope.launch { library.syncIndex() }
        val m = mirror
        if (m != null) {
            m.setPadOrder(order)
            _state.update { cur -> cur.mirror?.let { cur.copy(mirror = it.copy(state = m.snapshot(System.nanoTime()))) } ?: cur }
        } else {
            // Not connected: still show the choice.
            _state.update { cur -> cur.mirror?.let { cur.copy(mirror = it.copy(state = it.state.copy(padOrder = order))) } ?: cur }
        }
    }

    /**
     * Stops listening while the app is in the background; the screen keeps
     * its last state, and a take kept meanwhile waits for Live to be back.
     */
    fun pauseMirror() {
        liveOpens++
        livePaused.value = true
        stopMirror()
    }

    /**
     * Waits while Live is paused with the app in the background, and while
     * its read is under way, so a take kept meanwhile (stopped by leaving
     * the screen) finds its pad; not once Live is closed (another tab),
     * where it goes to Takes.
     */
    private suspend fun awaitLive() {
        livePaused.first { !it }
        _state.first { it.mirror?.loading != true }
    }

    /** The pad order Live uses (for the settings page). */
    fun padOrder() = mirror?.snapshot(System.nanoTime())?.padOrder ?: savedPadOrder()

    private fun savedPadOrder() =
        runCatching { dev.arc.ep133.features.PadOrder.valueOf(mirrorPrefs.getString("order", null) ?: "") }
            .getOrDefault(dev.arc.ep133.features.PadOrder.FROM_TOP)

    private fun notConnectedMirror() = MirrorUi(
        state = dev.arc.ep133.features.MirrorState(padOrder = savedPadOrder()),
        loading = false,
        error = dev.arc.ep133.text.MirrorText.NOT_CONNECTED,
    )

    fun closeMirror() {
        liveOpens++
        livePaused.value = false
        stopMirror()
        forgetPadMemory()
        // A question about offline pad changes goes with Live; the next read asks again.
        _state.update { it.copy(offlinePrompt = null) }
        // When each copy was last played, kept for choosing what to drop when the copies fill up.
        scope.launch(Dispatchers.IO) { runCatching { padSounds.flush() } }
        _state.update { it.copy(mirror = null) }
    }

    private fun stopMirror() {
        mirrorGen++
        cacheGen++
        mirrorJobs.forEach { it.cancel() }
        mirrorJobs = emptyList()
        mirrorPushOff?.invoke()
        mirrorPushOff = null
        mirror = null
        mirrorSession = null
        clockFollow = null
        // A switch still writing finishes its pass, then sees the mirror gone (switchProjects).
        projectTarget = null
    }

    /** Learned pad links, "offset:pad" pairs: the keypad's numbering is the same in every project. */
    private fun loadLearned(): Map<Int, Int> = dev.arc.ep133.features.LearnedLinks.parse(mirrorPrefs.getString("learned", null))

    private fun saveLearned(learned: Map<Int, Int>) {
        mirrorPrefs.edit { putString("learned", dev.arc.ep133.features.LearnedLinks.format(learned)) }
        scope.launch { library.syncIndex() }
    }

    /**
     * Brings the library back from Documents/arc after a reinstall, through
     * the folder the user picked (an addition). Settings kept there return too.
     */
    fun restoreFromFolder(tree: android.net.Uri): Job = scope.launch {
        try {
            val restored = library.restoreFrom(tree) { bytes ->
                val d = Paks.describe(Paks.open(bytes))
                dev.arc.ep133.data.RestoredPak(
                    createdAt = d.generatedAt ?: System.currentTimeMillis(),
                    device = BackupDevice(d.device.product, d.device.sku, "", d.device.osVersion),
                    soundCount = d.soundCount,
                    projectCount = d.projectCount,
                    projects = d.projects,
                    slots = d.slots,
                    projectSlots = d.projectSlots,
                    soundNames = d.soundNames,
                )
            }
            val settings = restored.settings
            val n = restored.count
            // Pads learned since the reinstall stay; the folder's fill in the rest.
            val learned = settings["mirror.learned"]?.let { dev.arc.ep133.features.LearnedLinks.merge(dev.arc.ep133.features.LearnedLinks.parse(it), loadLearned()) }
            mirrorPrefs.edit {
                learned?.let { putString("learned", dev.arc.ep133.features.LearnedLinks.format(it)) }
                // A pad order chosen since the reinstall stays too.
                if (!mirrorPrefs.contains("order")) settings["mirror.order"]?.let { putString("order", it) }
            }
            settingsStore.fromIndex(settings)
            restoreLastRead(restored.live)
            // library.json was rewritten before these were applied: write them into it now.
            library.syncIndex()
            _state.update { it.copy(folderPicked = library.folderPicked) }
            toast(if (n == 0) FeatureText.NOTHING_TO_RESTORE else FeatureText.restored(n))
        } catch (e: Throwable) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            toast(e.message ?: e.toString(), error = true)
        }
    }

    fun setSearch(query: String) {
        // The field shows what was typed at once; results follow.
        _state.update { it.copy(search = it.search.copy(query = query)) }
        searchQuery.value = query
    }

    fun stopPlayback() {
        playToken++
        arpClear()
        held.clear()
        cut.clear()
        unsure.clear()
        unmeasured.clear()
        liveAudio.stopAll()
        player.stop()
    }

    /** Plays PCM that is already in memory (the trim preview). */
    fun playNow(key: String, pcm: ByteArray, channels: Int, sampleRate: Int) {
        playToken++
        startSound(key, pcm, channels, sampleRate)
    }

    /** The bytes to export: a sound's WAV, or a project as a .pak. */
    suspend fun exportBytes(backupId: String, what: String): ByteArray {
        // The open contents screen already holds the parsed backup; after a recreation it is read again.
        val pak = _state.value.contents?.takeIf { it.backupId == backupId }?.pak
            ?: library.bytes(backupId).let { bytes -> withContext(Dispatchers.Default) { Paks.open(bytes) } }
        return withContext(Dispatchers.Default) {
            when {
                what.startsWith("wav:") -> dev.arc.ep133.backup.PakExport.soundWav(pak, what.removePrefix("wav:").toInt())
                what.startsWith("project:") -> dev.arc.ep133.backup.PakExport.project(pak, what.removePrefix("project:").toInt())
                else -> throw IllegalArgumentException(what)
            }
        }
    }

    fun dropDraft() {
        _state.update { it.copy(browser = it.browser.copy(draft = null)) }
    }

    fun uploadDraft(): Job = scope.launch {
        val s = session ?: return@launch
        val draft = _state.value.browser.draft ?: return@launch
        val items = draft.filter { it.wav != null && it.slot != null }.map { UploadItem(it.slot!!, it.name, it.wav!!, it.trim) }
        if (items.isEmpty()) return@launch
        _state.update { it.copy(browser = it.browser.copy(draft = null)) }
        val done = runTask(Strings.UPLOADING) { onProgress, signal -> SampleUpload.upload(s, items, onProgress, signal) }
        if (done != null) toast(Strings.uploaded(done.sounds))
        refreshAll(quiet = true)
    }

    /** Compares the backup with the device for this selection; the result shows in the restore sheet. */
    fun compare(b: BackupRecord, sel: RestoreSelection): Job = scope.launch {
        val s = session ?: return@launch
        val result = runTask(Strings.COMPARING) { onProgress, signal ->
            val bytes = library.bytes(b.id)
            val pak = withContext(Dispatchers.Default) { Paks.open(bytes) }
            BackupDiff.compare(s, pak, sel.slots, sel.projects, onProgress, signal)
        }
        if (result != null) _state.update { it.copy(diff = DiffUi(b.id, sel, result)) }
    }

    fun clearDiff() {
        _state.update { it.copy(diff = null) }
    }

    // ---------- library ----------

    private fun record(title: String, createdAt: Long, source: String, fileName: String?, device: BackupDevice, d: PakDescription) =
        BackupRecord(
            id = "",
            title = title,
            notes = "",
            createdAt = createdAt,
            source = source,
            fileName = fileName,
            device = device,
            soundCount = d.soundCount,
            projectCount = d.projectCount,
            projects = d.projects,
            slots = d.slots,
            projectSlots = d.projectSlots,
            size = 0,
        )

    /** Import a .pak (from the picker, or opened from Files). */
    fun import(name: String, lastModified: Long?, read: suspend () -> ByteArray): Job = scope.launch {
        try {
            val bytes = withContext(Dispatchers.IO) { read() }
            val d = withContext(Dispatchers.Default) { Paks.describe(Paks.open(bytes)) }
            val saved = library.save(
                record(
                    title = dev.arc.ep133.text.LibraryRules.importTitle(name),
                    // generatedAt || file.lastModified || Date.now()
                    createdAt = d.generatedAt ?: lastModified?.takeIf { it != 0L } ?: System.currentTimeMillis(),
                    source = "import",
                    fileName = name,
                    device = BackupDevice(d.device.product, d.device.sku, "", d.device.osVersion),
                    d = d,
                ),
                bytes,
                d.soundNames,
            )
            _state.update { it.copy(freshId = saved.record.id) }
            toastSaved(Strings.imported(saved.record.soundCount, saved.record.projectCount) + pruneOld(saved.record.id), saved.copyError)
        } catch (e: Throwable) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            toast(Strings.importFailed(name, e.message ?: e.toString()), error = true)
        }
    }

    /**
     * Downloads the EP-133's factory sounds from teenage engineering's EP
     * Sample Tool and keeps them in the library (FactorySounds), as a task:
     * the progress sheet shows how much has come, and Cancel stops it.
     */
    fun getFactorySounds(): Job = scope.launch {
        if (FactorySounds.inLibrary(_state.value.backups) != null) return@launch
        // Tapped while something else runs (a read, a transfer): it goes next, not never.
        _state.first { !it.busy }
        if (FactorySounds.inLibrary(_state.value.backups) != null) return@launch
        val saved = runTask(FeatureText.GETTING_FACTORY, device = false) { onProgress, signal ->
            try {
                withContext(Dispatchers.IO) {
                    val path = FactorySounds.locate { p -> dev.arc.ep133.data.FactoryDownload.text(p, signal) }
                    val bytes = dev.arc.ep133.data.FactoryDownload.bytes(path, signal) { done, total ->
                        val all = maxOf(total ?: FactorySounds.KNOWN_SIZE, done)
                        onProgress(Progress(done.toDouble() / all, FeatureText.factoryProgress(done, all)))
                    }
                    val pak = Paks.open(bytes)
                    if (!FactorySounds.isFactory(pak)) throw java.io.IOException(FeatureText.NOT_FACTORY)
                    val d = Paks.describe(pak)
                    library.save(
                        record(
                            title = FeatureText.FACTORY_TITLE,
                            createdAt = d.generatedAt ?: System.currentTimeMillis(),
                            source = FactorySounds.SOURCE,
                            fileName = FactorySounds.FILE_NAME,
                            device = BackupDevice(d.device.product, d.device.sku, "", d.device.osVersion),
                            d = d,
                        ),
                        bytes,
                        d.soundNames,
                    )
                }
            } catch (e: Throwable) {
                if (e is kotlinx.coroutines.CancellationException || e is CancelledError) throw e
                // Cancel closes the connection: whatever the read then threw, it was the cancel.
                if (signal.isCancelled) throw CancelledError()
                throw java.io.IOException(FeatureText.factoryFailed(e.message ?: e.toString()), e)
            }
        } ?: return@launch
        _state.update { it.copy(freshId = saved.record.id) }
        toastSaved(FeatureText.factorySaved(saved.record.soundCount), saved.copyError)
    }

    /** Saves edits made in the detail sheet (`saveDetailEdits`). */
    fun saveEdits(b: BackupRecord, titleField: String, notes: String): Job = scope.launch {
        val title = titleField.trim().ifEmpty { b.title }
        if (title == b.title && notes == b.notes) return@launch
        runCatching { library.update(b.id, title, notes) }
            .onFailure { toast(it.message ?: it.toString(), error = true) }
    }

    /** Returns whether it worked; on failure the detail sheet stays open (as in the web version). */
    suspend fun delete(b: BackupRecord): Boolean = try {
        val copyError = library.delete(b.id)
        toastSaved(Strings.BACKUP_DELETED, copyError)
        true
    } catch (e: Throwable) {
        if (e is kotlinx.coroutines.CancellationException) throw e
        toast(e.message ?: e.toString(), error = true)
        false
    }

    /**
     * Deletes the oldest backups beyond the Keep setting (never [keepId], the
     * one just saved). Returns " Removed N old backups." for the toast, or "".
     */
    private suspend fun pruneOld(keepId: String? = null): String {
        val keep = settingsStore.settings.value.keepLast ?: return ""
        val drop = LibraryRules.toPrune(library.backups.first(), keep).filter { it.id != keepId }
        var removed = 0
        for (b in drop) {
            val ok = runCatching { library.delete(b.id) }
                .onFailure { e -> if (e is kotlinx.coroutines.CancellationException) throw e }
                .isSuccess
            if (ok) removed++
        }
        return if (removed > 0) " " + dev.arc.ep133.text.SettingsText.pruned(removed) else ""
    }

    fun setTheme(t: dev.arc.ep133.text.ThemeChoice) = changeSettings { it.copy(theme = t) }

    fun setAutoConnect(on: Boolean) = changeSettings { it.copy(autoConnect = on) }

    fun setKeepScreenOn(on: Boolean) = changeSettings { it.copy(keepScreenOn = on) }

    fun setLiveOneGroup(on: Boolean) = changeSettings { it.copy(liveOneGroup = on) }

    fun setLiveFollow(on: Boolean) = changeSettings { it.copy(liveFollow = on) }

    fun setLiveKeys(on: Boolean) = changeSettings { it.copy(liveKeys = on) }

    fun setKeysRoot(root: Int) = changeSettings { it.copy(keysRoot = root.coerceIn(0, 11)) }

    fun setKeysScale(scale: dev.arc.ep133.features.Scale) = changeSettings { it.copy(keysScale = scale) }

    fun setKeysOctave(octave: Int) = changeSettings {
        it.copy(keysOctave = octave.coerceIn(dev.arc.ep133.features.Keys.MIN_OCTAVE, dev.arc.ep133.features.Keys.MAX_OCTAVE))
    }

    fun setKeysNames(names: dev.arc.ep133.features.NoteNames) = changeSettings { it.copy(keysNames = names) }

    fun setKeysShowNames(on: Boolean) = changeSettings { it.copy(keysShowNames = on) }

    /** The piano's size: one of Piano.CHOICES (null is Auto). */
    /** KEYS on the grid or the piano, for a [wide] window or a tall one. */
    fun setKeysView(wide: Boolean, view: dev.arc.ep133.features.KeysView) =
        changeSettings { if (wide) it.copy(keysViewWide = view) else it.copy(keysViewTall = view) }

    fun setPianoWhites(whites: Int?) = changeSettings { it.copy(pianoWhites = dev.arc.ep133.features.Piano.choiceOf(whites)) }

    fun setHaptics(on: Boolean) = changeSettings { it.copy(haptics = on) }

    /** Make up for Bluetooth delay (kept): see [dev.arc.ep133.audio.OutputDelay] for what moves. */
    fun setMakeUpDelay(on: Boolean) = changeSettings { it.copy(makeUpDelay = on) }

    /** The guide overlay was shown (it opens by itself only once, also across reinstalls). */
    fun setGuideSeen() = changeSettings { it.copy(guideSeen = true) }

    /** How many backups [setKeepLast] would delete now, for the confirmation. */
    fun pruneCount(keep: Int?): Int = LibraryRules.toPrune(_state.value.backups, keep).size

    /** Sets how many backups to keep and deletes the older ones now (after the page confirmed). */
    fun setKeepLast(keep: Int?): Job = scope.launch {
        changeSettings { it.copy(keepLast = keep) }
        val note = pruneOld()
        if (note.isNotEmpty()) toast(note.trim())
    }

    /** Forgets which pad is which in Live (names are learned again as pads are pressed). */
    fun forgetLearned() {
        val m = mirror
        if (m != null) {
            m.forgetLearned()
            _state.update { cur -> cur.mirror?.let { cur.copy(mirror = it.copy(state = m.snapshot(System.nanoTime()))) } ?: cur }
        }
        mirrorPrefs.edit { remove("learned") }
        scope.launch { library.syncIndex() }
        toast(dev.arc.ep133.text.SettingsText.FORGOTTEN)
    }

    private fun changeSettings(change: (dev.arc.ep133.data.AppSettings) -> dev.arc.ep133.data.AppSettings) {
        settingsStore.update(change)
        scope.launch { library.syncIndex() }
    }

    /** One toast for the result, so a failed copy to Documents/arc is not hidden behind it. */
    private fun toastSaved(text: String, copyError: String?) {
        if (copyError == null) toast(text) else toast(text + " " + FeatureText.copyFailed(copyError), error = true)
    }

    /** Import a document by URI. Runs in the app scope, so activity recreation cannot cut it short. */
    fun importUri(uri: android.net.Uri): Job = scope.launch {
        val (name, modified) = withContext(Dispatchers.IO) { dev.arc.ep133.files.Files.describe(context, uri) }
        import(name, modified) { dev.arc.ep133.files.Files.read(context, uri) }.join()
    }

    fun pakFile(b: BackupRecord) = library.file(b.id)

    suspend fun pakBytes(b: BackupRecord): ByteArray = library.bytes(b.id)

    val isConnected: Boolean get() = session != null
}
