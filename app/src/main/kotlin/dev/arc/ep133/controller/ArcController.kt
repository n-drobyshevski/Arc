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
import dev.arc.ep133.features.SoundSource
import dev.arc.ep133.features.SampleUpload
import dev.arc.ep133.features.SoundDetails
import dev.arc.ep133.features.UploadItem
import dev.arc.ep133.formats.Wav
import dev.arc.ep133.features.SampleTrim
import dev.arc.ep133.midi.MidiConnector
import dev.arc.ep133.protocol.CancelSignal
import dev.arc.ep133.protocol.CancelledError
import dev.arc.ep133.protocol.Device
import dev.arc.ep133.protocol.Fs
import dev.arc.ep133.formats.asObject
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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale
import java.util.concurrent.atomic.AtomicLong

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
)

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
    val offlinePrompt: Int? = null,
)

/**
 * The state and actions of app.js. Lives as long as the process (owned by
 * ArcApp), so a running transfer survives the activity being recreated; the
 * foreground service only keeps the process alive.
 */
/** How much of Live's pad samples is kept decoded in memory (16-bit, so 32M samples). */
private const val PAD_MEMORY_BYTES = 64L * 1024 * 1024

/** How much of the backup sounds and takes played in lists is kept decoded, for a quick replay. */
private const val PREVIEW_MEMORY_BYTES = 16L * 1024 * 1024

/** The previews' keys for the pad sheet's offline sounds ("pad:<source>:<slot>:<name>"); backups are "backup:<id>:<slot>". */
private const val PAD_PREVIEW = "pad:"

/** A Live press let go of while its sound loaded for longer than this sounds only if no press came after it. */
private const val LATE_LOAD_NS = 120_000_000L

/** How often an idle mirror with a tempo showing looks whether it went stale. */
private const val TEMPO_CHECK_MS = 250L

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
 * The lists Live offers offline: the device's sounds from [lastRead] and the
 * factory pack's from [factory] (its first project as Live shows it), by
 * slot, sizes unknown; [unavailable] from [dev.arc.ep133.features.PadSounds.unavailable].
 */
internal fun offlineSoundsOf(
    lastRead: dev.arc.ep133.features.LiveSnapshot?,
    factory: dev.arc.ep133.features.LiveSnapshot?,
    unavailable: Set<Int>,
): OfflineSounds {
    fun list(names: Map<Int, String>) = names.entries.sortedBy { it.key }.map { dev.arc.ep133.protocol.SoundEntry(it.key, it.value, 0) }
    return OfflineSounds(
        base = if (lastRead != null) SoundSource.DEVICE else SoundSource.FACTORY,
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
}

/**
 * The step for [p] on the device as Live just read it: its [activeProject],
 * its sound names by slot ([deviceNames]) and the slot on [p]'s pad now
 * ([readSlot]).
 */
internal fun offlineStep(p: OfflinePad, activeProject: Int?, deviceNames: Map<Int, String>, readSlot: Int?): OfflineStep = when {
    !OfflinePads.fits(p, activeProject, deviceNames) -> OfflineStep.Skip
    readSlot == p.slot -> OfflineStep.Done
    else -> OfflineStep.Write(dev.arc.ep133.features.PadTarget(p.project, p.group, p.pad, readSlot), p.slot)
}

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

    // Live's pads play on the phone: from arc's copy of the device's sounds, a backup, or the device.
    private val padSounds by lazy { dev.arc.ep133.features.PadSoundCache(java.io.File(context.filesDir, "pad-sounds")) }
    /** The device's sound list from Live's read (names and sizes), to tell which copies are current. */
    private var deviceSounds: Map<Int, dev.arc.ep133.protocol.SoundEntry> = emptyMap()
    /** Every sound name in the saved backups, for finding a pad's sound in one. */
    private var backupNames: List<dev.arc.ep133.features.NameEntry> = emptyList()
    /** The last backup a pad played from, opened, so the next taps are quick. */
    private var openPak: Pair<String, dev.arc.ep133.backup.Pak>? = null
    /** The factory sounds' first project as Live shows it, by the library entry it came from. */
    private var factorySnap: Pair<String, dev.arc.ep133.features.LiveSnapshot?>? = null
    /** Live's own low-latency output, open while Live is on screen. */
    private val liveAudio = dev.arc.ep133.audio.LiveAudio(context, ::liveStarted, ::takeDone, ::liveOutput)
    /** The Live voices sounding on the phone ("live:<group>:<offset>" pads, "note:<midi>" keys), for the rings. */
    val liveKeys: StateFlow<Set<String>> get() = liveAudio.keys
    /** Live's REC key. */
    val rec: StateFlow<dev.arc.ep133.features.RecState> get() = liveAudio.rec
    /** Whether Live's sound goes to Bluetooth or a hearing aid, which plays late: its display line says so. */
    val liveWireless: StateFlow<Boolean> get() = liveAudio.wireless
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

    @Volatile
    private var session: Session? = null
    private var openDeviceId: Int? = null
    private var abortCurrent: CancelSignal? = null
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

    /** Cancel stops between items, like the web version. */
    fun cancelTask() {
        val a = abortCurrent ?: return
        a.cancel()
        _state.update { st -> st.task?.let { st.copy(task = it.copy(cancelling = true, label = Strings.STOPPING)) } ?: st }
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
     * its pads (the reads the browser already makes), then only listens to
     * MIDI and pad pushes. Nothing is sent while it runs.
     */
    fun openMirror(): Job = scope.launch {
        // Already running for this connection (opened twice): keep it.
        if (mirror != null && mirrorSession != null && mirrorSession === session) return@launch
        stopMirror()
        val s = session
        val events = liveEvents
        // Not connected (or still connecting): the last read, if there is one.
        if (s == null || events == null || _state.value.device == null) {
            openOfflineMirror()
            return@launch
        }
        val m = dev.arc.ep133.features.LiveMirror(
            learned = loadLearned(),
            padOrder = savedPadOrder(),
            onLearned = ::saveLearned,
        )
        mirror = m
        mirrorSession = s
        _state.update { it.copy(mirror = MirrorUi(m.snapshot(System.nanoTime()), loading = true)) }
        // Listen first, so nothing played while reading is missed. Each change marks the
        // mirror dirty and wakes the publishing loop below.
        val dirty = java.util.concurrent.atomic.AtomicBoolean(true)
        val news = kotlinx.coroutines.channels.Channel<Unit>(kotlinx.coroutines.channels.Channel.CONFLATED)
        val listen = scope.launch(Dispatchers.Default) {
            events.collect {
                m.onMidi(it)
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
                val active = runCatching { Fs.getMetadata(ss, Device.PROJECTS_NODE).asObject()["active"] }.getOrNull()
                val project = (active as? kotlinx.serialization.json.JsonPrimitive)?.content?.toDoubleOrNull()?.toInt()?.let(Device::projectFromNode)
                val groups = project?.let { p -> runCatching { DeviceBrowser.projectLayout(ss, p).pads }.getOrNull() } ?: emptyList()
                m.setProject(project, groups)
                true
            }
        }
        if (mirror === m) {
            dirty.set(true)
            news.trySend(Unit)
            if (ok == true) {
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
     * marked offline. Nothing lights, as nothing is listened to.
     */
    private suspend fun openOfflineMirror() {
        stopMirror()
        val gen = mirrorGen
        val lastRead = loadLastRead()
        // Never read: the factory sounds, if the library has them.
        val snap = lastRead ?: factorySnapshot()
        if (gen != mirrorGen) return
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
        val sounds = offlineSounds(lastRead)
        if (gen != mirrorGen || session != null && _state.value.device != null) return
        mirror = m
        preloadPads(m)
        val offline = if (lastRead != null) dev.arc.ep133.text.MirrorText.lastSeen(fmtDateTime(lastRead.savedAt)) else dev.arc.ep133.text.MirrorText.FACTORY
        _state.update { it.copy(mirror = MirrorUi(m.snapshot(System.nanoTime()), loading = false, offline = offline, offlineSounds = sounds)) }
    }

    /**
     * The lists Live offers offline ([OfflineSounds]): the device's sounds
     * from [lastRead], dimmed where arc has neither a copy, a backup nor the
     * factory pack's sound, and the factory pack's.
     */
    private suspend fun offlineSounds(lastRead: dev.arc.ep133.features.LiveSnapshot?): OfflineSounds {
        val factory = factorySnapshot()
        val unavailable = lastRead?.let { r ->
            val copies = withContext(Dispatchers.IO) { runCatching { padSounds.copies() }.getOrDefault(emptyMap()) }
            val packSaved = FactorySounds.inLibrary(_state.value.backups) != null
            withContext(Dispatchers.Default) { dev.arc.ep133.features.PadSounds.unavailable(r.names, copies, backupNames, packSaved) }
        }
        return offlineSoundsOf(lastRead, factory, unavailable.orEmpty())
    }

    /**
     * What Live shows while no EP-133 has been read: the factory sounds' first
     * project, when the library has them (FactorySounds); else null.
     */
    private suspend fun factorySnapshot(): dev.arc.ep133.features.LiveSnapshot? {
        val b = FactorySounds.inLibrary(_state.value.backups) ?: return null
        factorySnap?.takeIf { it.first == b.id }?.let { return it.second }
        val snap = try {
            FactorySounds.snapshot(pakOf(b.id), b.createdAt)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            null
        }
        factorySnap = b.id to snap
        return snap
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
            val sounds = offlineSounds(loadLastRead())
            if (gen == mirrorGen && mirror === m) _state.update { cur -> cur.mirror?.let { cur.copy(mirror = it.copy(offlineSounds = sounds)) } ?: cur }
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

    /** Keeps [pads] as Live's offline changes (written whole, then renamed over the file); none deletes the file. */
    private fun saveOfflinePads(pads: OfflinePads) {
        offlinePads = pads
        _state.update { it.copy(offlinePads = pads.size) }
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

    /** Closes it (Live left the screen). */
    fun closeLiveAudio() {
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
     */
    fun playPad(
        pad: dev.arc.ep133.features.PhysicalPad,
        hold: Boolean = true,
        unsure: Boolean = false,
        pressedAt: Long = System.nanoTime(),
    ): Job? {
        val key = "live:${pad.group}:${pad.offset}"
        if (hold) held += key
        cut -= key
        this.unsure -= key
        // The sound first: with the sample in memory it starts before any bookkeeping.
        val ready = padInMemory(pad)
        if (unsure && hold) {
            // Not yet the latest press either: a scroll mustn't drop another press's late load.
            if (ready != null) startHeld(key, hold, ready, 0, pressedAt, measured = true)
            this.unsure[key] = UnsurePress(ready != null, pressedAt, playToken)
            return null
        }
        lastPressAt = pressedAt
        if (ready != null) startHeld(key, hold, ready, 0, pressedAt, measured = true)
        // The pad tapped is also the sound KEYS plays; it is loaded right here, so no preload for it.
        setKeysPad(pad)
        return if (ready != null) null else loadAndStart(pad, key, hold, pressedAt, playToken)
    }

    /**
     * The press on the scrolling page was a press after all (the scroll window
     * closed, or the finger lifted inside it): the pad becomes the KEYS sound,
     * and one not in memory loads and plays now.
     */
    fun keepPad(pad: dev.arc.ep133.features.PhysicalPad): Job? {
        val key = "live:${pad.group}:${pad.offset}"
        val u = unsure.remove(key) ?: return null
        lastPressAt = maxOf(lastPressAt, u.pressedAt)
        setKeysPad(pad)
        return if (u.started) null else loadAndStart(pad, key, true, u.pressedAt, u.token)
    }

    /** Loads [pad]'s sample (copy, backup or device) and starts its voice, unless a stop came meanwhile. */
    private fun loadAndStart(pad: dev.arc.ep133.features.PhysicalPad, key: String, hold: Boolean, pressedAt: Long, token: Long): Job = scope.launch {
        val a = padAudio(pad) ?: return@launch
        if (token == playToken) startHeld(key, hold, a, 0, pressedAt, measured = false)
    }

    /** The finger left the pad: its sound fades out. */
    fun releasePad(pad: dev.arc.ep133.features.PhysicalPad) = release("live:${pad.group}:${pad.offset}")

    /** The press on the pad was a scroll after all: its sound ends at once (one still loading never starts). */
    fun cutPad(pad: dev.arc.ep133.features.PhysicalPad) {
        val key = "live:${pad.group}:${pad.offset}"
        held -= key
        // One still unsure never loads, nor becomes the KEYS sound.
        if (unsure.remove(key) == null) cut += key
        liveAudio.cut(key)
    }

    private fun release(key: String) {
        held -= key
        liveAudio.release(key)
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
    private fun startHeld(key: String, hold: Boolean, a: PcmSound, semitones: Int, pressedAt: Long, measured: Boolean) {
        if (key in cut) return
        val lifted = hold && key !in held
        if (lifted && pressedAt != lastPressAt && System.nanoTime() - pressedAt > LATE_LOAD_NS) return
        when {
            a.silent -> toastOnce(FeatureText.SILENT_SOUND)
            !liveAudio.play(key, a.pcm, a.channels, a.sampleRate, semitones, pressedAt) -> toastOnce(FeatureText.NO_AUDIO_OUTPUT, error = true)
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
        held.clear()
        cut.clear()
        unsure.clear()
        unmeasured.clear()
        liveAudio.close()
        val opened = liveAudio.open()
        trafficLog.note("live audio: " + if (opened) liveAudio.description else "no output")
        if (opened) prepareLive(padMemory.sounds())
    }

    /** Forgets the latency test's times. */
    fun resetLatency() = latencyTest.reset()

    // ---------- takes: Live recorded (an addition) ----------

    private suspend fun loadTakes() {
        _takes.value = withContext(Dispatchers.IO) { runCatching { takeStore.list() }.getOrDefault(emptyList()) }
    }

    /** REC: arms a take (the next sound starts it), or stops the one going. */
    fun toggleRec() {
        if (liveAudio.rec.value != dev.arc.ep133.features.RecState.Idle) {
            liveAudio.stopRecording()
            return
        }
        val file = takeStore.newFile(System.currentTimeMillis())
        if (!liveAudio.arm(file)) toast(dev.arc.ep133.text.MirrorText.NO_OUTPUT, error = true)
    }

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

    private fun keepInMemory(slot: Int, name: String, a: PcmSound) {
        padMemory.put(memoryKey(slot, name), a)
        prepareLive(listOf(a))
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
                val (slot, name) = sample
                val key = memoryKey(slot, name)
                // In memory already, or a press is loading it.
                if (padMemory.containsKey(key) || key in padLoads) continue
                val a = runCatching { loadPadAudio(slot, name, sample.factory) }.getOrNull() ?: continue
                if (gen == preloadGen && mirror === m) keepInMemory(slot, name, a)
            }
        }
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
        return padMemory[memoryKey(s.slot, s.name)]
    }

    /** A pad's sample from the first place that has it; null after a toast says why. */
    private suspend fun padAudio(pad: dev.arc.ep133.features.PhysicalPad): PcmSound? {
        val sample = mirror?.sampleOf(pad)
        if (sample == null) {
            toastOnce(dev.arc.ep133.text.MirrorText.NO_SAMPLE)
            return null
        }
        val key = memoryKey(sample.slot, sample.name)
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
        val (slot, name) = sample
        return try {
            // The background copy reading this very sound: wait for it rather than read it twice.
            val copied = loadPadAudio(slot, name, sample.factory) ?: copying?.takeIf { it.first == slot }?.second?.await()
            val audio = copied ?: padMemory[memoryKey(slot, name)] ?: if (session != null && _state.value.device != null) {
                val (d, pcm) = exclusive("play:$slot") { s -> DeviceBrowser.soundDetails(s, slot) to dev.arc.ep133.protocol.Fs.download(s, slot) }
                    ?: return null
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
     * [pressedAt]: as [playPad]'s.
     */
    fun playNote(note: Int, hold: Boolean = true, pressedAt: Long = System.nanoTime()): Job {
        lastPressAt = pressedAt
        val key = "note:$note"
        if (hold) held += key
        // Timed for the latency test only when the KEYS sound is in memory already.
        val measured = _state.value.keysPad?.let(::padInMemory) != null
        return scope.launch {
            val token = playToken
            val pad = _state.value.keysPad
            if (pad == null) {
                toastOnce(dev.arc.ep133.text.MirrorText.PICK_SOUND)
                return@launch
            }
            val a = padAudio(pad) ?: return@launch
            if (token == playToken) startHeld(key, hold, a, note - dev.arc.ep133.features.Keys.ROOT_NOTE, pressedAt, measured)
        }
    }

    /** The last finger left the note: it fades out. */
    fun releaseNote(note: Int) = release("note:$note")

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

    private fun loadMirrorProject(m: dev.arc.ep133.features.LiveMirror, project: Int) {
        scope.launch {
            val groups = exclusive("mirror", quiet = true) { ss -> DeviceBrowser.projectLayout(ss, project).pads } ?: return@launch
            if (mirror === m) {
                m.setProject(project, groups)
                saveLastRead(m)
                preloadPads(m)
                session?.let { copyPadSounds(m, it) }
                _state.update { cur -> cur.mirror?.let { cur.copy(mirror = it.copy(state = m.snapshot(System.nanoTime()))) } ?: cur }
            }
        }
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
     * last read (or factory sounds) to change in arc, or Live hasn't read the
     * active project yet.
     */
    fun editTarget(pad: dev.arc.ep133.features.PhysicalPad): dev.arc.ep133.features.PadTarget? {
        val m = mirror
        // Offline, the pads change in arc only, until the device connects (assignOffline).
        val offline = m != null && mirrorSession == null && _state.value.device == null && _state.value.mirror?.offlineSounds != null
        if (!offline && (session == null || _state.value.device == null || mirrorSession == null) || m == null) {
            toast(dev.arc.ep133.text.MirrorText.EDIT_OFFLINE)
            return null
        }
        return m.target(pad) ?: null.also {
            // A known project but no pad number: the device numbers its pads otherwise than arc guessed.
            val unknownPad = m.snapshot(System.nanoTime()).activeProject != null && m.padNumber(pad) == null
            toast(if (unknownPad) dev.arc.ep133.text.MirrorText.EDIT_PRESS_FIRST else dev.arc.ep133.text.MirrorText.EDIT_NO_PROJECT)
        }
    }

    /**
     * Puts sample [slot] on [pad] at once (where [t] says its sound is set).
     * The names follow straight away, and a toast offers UNDO when the pad's
     * old sound is known (an empty pad can't be emptied again). Offline it
     * changes in arc only ([assignOffline]), picked from [source]'s list.
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
        if (writePad(t, slot, dev.arc.ep133.text.MirrorText::assignFailed)) assignedToast(pad, t, slot)
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
        val pads = offlineAssign(loadOfflinePads(), t, slot, entry.name, source, readSlot)
        if (mirror !== m) return
        saveOfflinePads(pads)
        localChanged(m, pads)
        toast(dev.arc.ep133.text.MirrorText.assignedOffline(pad, entry.name))
    }

    /** Live tools' "Reset pads": the offline pad changes go, and the pads play the device's sounds as last read. */
    fun resetOfflinePads() {
        saveOfflinePads(OfflinePads.EMPTY)
        mirror?.takeIf { mirrorSession == null }?.let { localChanged(it, OfflinePads.EMPTY) }
        toast(dev.arc.ep133.text.MirrorText.PADS_RESET)
    }

    /** The offline mirror [m] shows [pads]: names, samples and their preload follow. */
    private fun localChanged(m: dev.arc.ep133.features.LiveMirror, pads: OfflinePads) {
        m.setLocal(pads)
        preloadPads(m)
        _state.update { cur -> cur.mirror?.let { cur.copy(mirror = it.copy(state = m.snapshot(System.nanoTime()))) } ?: cur }
    }

    /** A good read of the device on [s]: offline pad changes kept are asked about ([writeOfflinePads] or [discardOfflinePads]). */
    private suspend fun offerOfflinePads(s: Session) {
        // Still writing them (the app left and came back meanwhile): not asked again.
        if (offlineWrite?.isActive == true) return
        val pads = loadOfflinePads()
        if (pads.size > 0 && session === s) _state.update { it.copy(offlinePrompt = pads.size) }
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
        val pads = loadOfflinePads().list
        var written = 0
        var skipped = 0
        for ((i, p) in pads.withIndex()) {
            val names = deviceSounds.mapValues { it.value.name }
            when (val step = offlineStep(p, m.snapshot(System.nanoTime()).activeProject, names, m.slotAt(p.group, p.pad))) {
                OfflineStep.Skip -> skipped++
                OfflineStep.Done -> written++
                // writePad waits for the device when it is busy.
                is OfflineStep.Write -> when {
                    writePad(step.target, step.slot, dev.arc.ep133.text.MirrorText::assignFailed) -> written++
                    // The connection went: this change and the rest are kept.
                    session !== s -> return saveOfflinePads(OfflinePads(pads.drop(i)))
                    else -> skipped++
                }
            }
        }
        saveOfflinePads(OfflinePads.EMPTY)
        toast(dev.arc.ep133.text.MirrorText.offlineWritten(written, skipped))
    }

    /** Discard: the offline pad changes go, and the device keeps its pads as they are. */
    fun discardOfflinePads() {
        _state.update { it.copy(offlinePrompt = null) }
        saveOfflinePads(OfflinePads.EMPTY)
        toast(dev.arc.ep133.text.MirrorText.OFFLINE_DISCARDED)
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
     * first free slot, then onto [pad]. A file that isn't a usable WAV is
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
        val slot = runTask(Strings.UPLOADING, wait = true) { onProgress, signal ->
            SampleUpload.uploadToPad(s, fileName, bytes, deviceSounds.keys, t, onProgress = onProgress, signal = signal)
        }
        if (slot == null) {
            // runTask showed its own error; a connection gone while waiting needs saying.
            if (session !== s) toast(dev.arc.ep133.text.MirrorText.EDIT_OFFLINE)
            return@launch
        }
        // The new sound's name and size, for the pad and its copy (a mirror opened since read them already).
        mirror?.let { m ->
            exclusive("mirror", quiet = true, wait = true) { ss -> DeviceBrowser.contents(ss) }?.let { c -> if (mirror === m) setLiveSounds(m, c.sounds) }
        }
        mirror?.let { padWritten(it, t, slot) }
        assignedToast(pad, t, slot, deviceSounds[slot]?.name ?: SampleUpload.nameFor(fileName))
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
        saveLastRead(m)
        preloadPads(m)
        session?.let { copyPadSounds(m, it) }
        _state.update { cur -> cur.mirror?.let { cur.copy(mirror = it.copy(state = m.snapshot(System.nanoTime()))) } ?: cur }
    }

    private fun assignedToast(pad: dev.arc.ep133.features.PhysicalPad, t: dev.arc.ep133.features.PadTarget, slot: Int, name: String = soundName(slot)) {
        val text = dev.arc.ep133.text.MirrorText.assigned(pad, name)
        // UNDO only where the old sound is known, and isn't the one just put there.
        if (t.slot != null && t.slot != slot) {
            toast(text, action = dev.arc.ep133.text.MirrorText.UNDO, onAction = { undoAssign(pad, t) })
        } else {
            toast(text)
        }
    }

    /** A slot's sound name as Live read it, or its number. */
    private fun soundName(slot: Int): String = deviceSounds[slot]?.name ?: FeatureText.slot(slot)

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

    /** Stops listening while the app is in the background; the screen keeps its last state. */
    fun pauseMirror() = stopMirror()

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
