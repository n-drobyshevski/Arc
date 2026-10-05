package dev.arc.ep133.controller

import android.content.Context
import android.content.Intent
import android.text.format.DateFormat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import dev.arc.ep133.backup.Backup
import dev.arc.ep133.backup.PakDescription
import dev.arc.ep133.backup.Paks
import dev.arc.ep133.backup.Progress
import dev.arc.ep133.data.Library
import dev.arc.ep133.features.BackupDiff
import dev.arc.ep133.features.DeviceBrowser
import dev.arc.ep133.features.DeviceContents
import dev.arc.ep133.features.DiffResult
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

data class ToastMsg(val id: Long, val text: String, val error: Boolean)

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
)

/**
 * The state and actions of app.js. Lives as long as the process (owned by
 * ArcApp), so a running transfer survives the activity being recreated; the
 * foreground service only keeps the process alive.
 */
/** How much of Live's pad samples is kept decoded in memory (16-bit, so 32M samples). */
private const val PAD_MEMORY_BYTES = 64L * 1024 * 1024

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
    private val mirrorPrefs by lazy { context.getSharedPreferences("mirror", Context.MODE_PRIVATE) }
    // The device's project, pads and names as Live last read them, shown while it is not connected.
    private val lastReadFile by lazy { java.io.File(context.filesDir, "live-last.json") }
    @Volatile
    private var lastRead: dev.arc.ep133.features.LiveSnapshot? = null
    private var lastReadLoaded = false

    // Live's pads play on the phone: from arc's copy of the device's sounds, a backup, or the device.
    private val padSounds by lazy { dev.arc.ep133.features.PadSoundCache(java.io.File(context.filesDir, "pad-sounds")) }
    /** The device's sound list from Live's read (names and sizes), to tell which copies are current. */
    private var deviceSounds: Map<Int, dev.arc.ep133.protocol.SoundEntry> = emptyMap()
    /** Every sound name in the saved backups, for finding a pad's sound in one. */
    private var backupNames: List<dev.arc.ep133.features.NameEntry> = emptyList()
    /** The last backup a pad played from, opened, so the next taps are quick. */
    private var openPak: Pair<String, dev.arc.ep133.backup.Pak>? = null
    /** Live's own low-latency output, open while Live is on screen. */
    private val liveAudio = dev.arc.ep133.audio.LiveAudio(context, ::liveStarted, ::takeDone)
    /** The Live voices sounding on the phone (pad and key ids), for the rings. */
    val liveKeys: StateFlow<Set<String>> get() = liveAudio.keys
    /** Live's REC key. */
    val rec: StateFlow<dev.arc.ep133.features.RecState> get() = liveAudio.rec
    private val takeStore by lazy { dev.arc.ep133.data.Takes(java.io.File(context.filesDir, "takes")) }
    private val _takes = MutableStateFlow<List<dev.arc.ep133.data.TakeInfo>>(emptyList())
    /** Live's recorded takes, newest first. */
    val takes: StateFlow<List<dev.arc.ep133.data.TakeInfo>> = _takes.asStateFlow()
    // Live's pad samples decoded and ready ("slot:name"), so a press plays at once; the
    // least recently played go past PAD_MEMORY_BYTES. Main thread only.
    private val padMemory = LinkedHashMap<String, PadAudio>(16, 0.75f, true)
    private var padMemoryBytes = 0L
    private var preloadGen = 0
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
    private val toastIds = AtomicLong()

    /** Device description for the debug log export. */
    @Volatile
    var midiDescription: String = ""
        private set

    init {
        scope.launch {
            library.backups
                .catch { e -> toast(Strings.libraryFailed(e.message ?: e.toString()), error = true) }
                .collect { list -> _state.update { it.copy(backups = list, libraryLoaded = true, spaceLeft = runCatching { library.spaceLeft() }.getOrNull()) } }
        }
        library.settings = {
            buildMap {
                mirrorPrefs.getString("learned", null)?.let { put("mirror.learned", it) }
                mirrorPrefs.getString("order", null)?.let { put("mirror.order", it) }
                putAll(settingsStore.toIndex())
            }
        }
        library.onExternalError = { msg -> scope.launch { toast(FeatureText.copyFailed(msg), error = true) } }
        scope.launch { loadTakes() }
        _state.update { it.copy(keysPad = savedKeysPad()) }
        scope.launch {
            library.names.catch { /* shown by the backups collector */ }.collect { backupNames = it; openPak = null }
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
                    if (session == null && !s.busy) connect()
                }
            },
            onRemoved = { info ->
                scope.launch {
                    if (info.id == openDeviceId && session != null) {
                        trafficLog.note("device removed")
                        abortCurrent?.cancel()
                        dropSession(Strings.DISCONNECTED)
                    }
                }
            },
        )
    }

    // ---------- toast ----------

    fun toast(text: String, error: Boolean = false) {
        _state.update { it.copy(toast = ToastMsg(toastIds.incrementAndGet(), text, error)) }
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
        _state.update { it.copy(connected = false, device = null, browser = BrowserUi(), diff = null) }
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

    private suspend fun <T> runTask(title: String, fn: suspend (onProgress: (Progress) -> Unit, signal: CancelSignal) -> T): T? {
        if (!awaitDevice()) return null
        _state.update { it.copy(busy = true, task = TaskUi(title, "", 0.0, cancelling = false)) }
        val signal = CancelSignal()
        abortCurrent = signal
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
    private suspend fun <T> exclusive(reading: String, quiet: Boolean = false, block: suspend (Session) -> T): T? {
        val s = session ?: return null
        if (!awaitDevice()) return null
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

    /** Downloads a sound from the device and plays it (an addition to the web version). */
    fun playDeviceSound(slot: Int): Job = scope.launch {
        val token = ++playToken
        // Played straight from the list: read the channels and rate first when they aren't known yet.
        val d = _state.value.browser.details[slot]
            ?: exclusive("play:$slot") { DeviceBrowser.soundDetails(it, slot) }
                ?.also { d -> _state.update { it.copy(browser = it.browser.copy(details = it.browser.details + (slot to d))) } }
            ?: return@launch
        if (token != playToken) return@launch
        // Not cancelled on stop: an interrupted download would leave the session out of step.
        val pcm = exclusive("play:$slot") { s -> dev.arc.ep133.protocol.Fs.download(s, slot) } ?: return@launch
        // Live can play it later without the device.
        val listed = _state.value.browser.contents?.sounds?.firstOrNull { it.slot == slot } ?: deviceSounds[slot]
        if (listed != null) keepPadSound(slot, listed.name, listed.size, pcm, d.channels, d.sampleRate)
        if (token != playToken) return@launch
        startSound("device:$slot", pcm, d.channels.toInt(), d.sampleRate.toInt())
    }

    /**
     * Plays on the phone and says so when nothing will be heard: a sound that
     * can't play, or media volume at zero. Where the sound went is noted in the
     * debug log, for reports of a sound that plays but isn't heard.
     */
    private fun startSound(key: String, pcm: ByteArray, channels: Int, sampleRate: Int) {
        val result = player.play(key, pcm, channels, sampleRate)
        when (val r = result) {
            is dev.arc.ep133.audio.PlayResult.Failed -> {
                trafficLog.note("play $key failed: ${r.reason}")
                toast(FeatureText.cantPlay(r.reason), error = true)
            }
            is dev.arc.ep133.audio.PlayResult.Started -> {
                val seconds = pcm.size / (2.0 * channels) / sampleRate
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

    /** Plays a sound from an opened backup; no device needed. */
    fun playBackupSound(slot: Int): Job = scope.launch {
        val token = ++playToken
        val c = _state.value.contents ?: return@launch
        val snd = c.pak?.sounds?.get(slot) ?: return@launch
        try {
            val w = withContext(Dispatchers.Default) { Wav.decode(snd.wav) }
            if (token != playToken || _state.value.contents?.backupId != c.backupId) return@launch
            startSound("backup:${c.backupId}:$slot", w.pcm, w.channels, w.sampleRate.toInt())
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
        // Listen first, so nothing played while reading is missed.
        val dirty = java.util.concurrent.atomic.AtomicBoolean(true)
        val listen = scope.launch(Dispatchers.Default) {
            events.collect {
                m.onMidi(it)
                dirty.set(true)
            }
        }
        mirrorPushOff = s.onPush { f ->
            val fid = dev.arc.ep133.features.PadPush.parse(f) ?: return@onPush
            m.onPadPush(fid, System.nanoTime())
            dirty.set(true)
            // Another project on the device: read its pads.
            if (fid.project != m.snapshot(System.nanoTime()).activeProject) loadMirrorProject(m, fid.project)
        }
        // At most ~30 states a second. An unchanged state is equal to the last one, so
        // StateFlow drops it and nothing redraws; time-based changes (pruned pads, a
        // tempo gone stale) still get through. The fade itself runs on the screen's frame clock.
        val tick = scope.launch {
            while (true) {
                kotlinx.coroutines.delay(33)
                dirty.set(false)
                val st = m.snapshot(System.nanoTime())
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
                deviceSounds = c.sounds.associateBy { it.slot }
                m.setNames(c.sounds.associate { it.slot to it.name })
                val active = runCatching { Fs.getMetadata(ss, Device.PROJECTS_NODE).asObject()["active"] }.getOrNull()
                val project = (active as? kotlinx.serialization.json.JsonPrimitive)?.content?.toDoubleOrNull()?.toInt()?.let(Device::projectFromNode)
                val groups = project?.let { p -> runCatching { DeviceBrowser.projectLayout(ss, p).pads }.getOrNull() } ?: emptyList()
                m.setProject(project, groups)
                true
            }
        }
        if (mirror === m) {
            dirty.set(true)
            if (ok == true) {
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
        val snap = loadLastRead()
        if (snap == null || session != null && _state.value.device != null) {
            if (snap == null) _state.update { it.copy(mirror = notConnectedMirror()) }
            return
        }
        val m = dev.arc.ep133.features.LiveMirror(
            learned = loadLearned(),
            padOrder = savedPadOrder(),
            onLearned = ::saveLearned,
        )
        m.load(snap)
        mirror = m
        preloadPads(m)
        _state.update {
            it.copy(mirror = MirrorUi(m.snapshot(System.nanoTime()), loading = false, offline = dev.arc.ep133.text.MirrorText.lastSeen(fmtDateTime(snap.savedAt))))
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
                val slots = m.saved(0).groups.flatMap { it.pads.values }.filterNotNull().distinct().sorted()
                val todo = withContext(Dispatchers.IO) {
                    slots.firstNotNullOfOrNull { slot ->
                        deviceSounds[slot]?.takeIf { e -> !padSounds.fresh(slot, e.name, e.size) }
                    }
                } ?: break
                // The device must be free, and nobody waiting for it.
                combine(_state, deviceWaiters) { st, w -> !st.busy && !st.backgroundRead && w == 0 }.first { it }
                if (gen != cacheGen || mirror !== m || session !== s) break
                _state.update { it.copy(backgroundRead = true) }
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
                keepPadSound(todo.slot, todo.name, todo.size, pcm.second, pcm.first.channels, pcm.first.sampleRate)
            }
        }
    }

    private suspend fun keepPadSound(slot: Int, name: String, size: Long, pcm: ByteArray, channels: Double, sampleRate: Double) {
        // Live is open: ready to play too.
        if (mirror != null) {
            val a = withContext(Dispatchers.Default) { PadAudio.of(pcm, channels.toInt(), sampleRate.toInt()) }
            keepInMemory(slot, name, a)
        }
        withContext(Dispatchers.IO) {
            runCatching { padSounds.put(slot, name, size, Wav.encode(pcm, channels, sampleRate)) }
                .onFailure { trafficLog.note("saving pad sound $slot failed: ${it.message}") }
        }
    }

    // Live's pads and keys sound while held (a gate): the voices whose finger is still down.
    private val held = HashSet<String>()

    /** Opens Live's sound output (Live came on screen), so the first press is as quick as the rest. */
    fun openLiveAudio() {
        trafficLog.note("live audio: " + if (liveAudio.open()) liveAudio.description else "no output")
    }

    /** Closes it (Live left the screen). */
    fun closeLiveAudio() {
        held.clear()
        liveAudio.close()
    }

    /**
     * Plays a Live pad's sample on the phone (arc's copy of the device's
     * sound, else the newest backup holding it, else, connected, the device)
     * alongside whatever else is sounding, so several pads make a chord. It
     * sounds until [releasePad]; with [hold] false (a screen reader's Play) it
     * plays to the end. Only a stop (leaving Live) drops one still loading;
     * other taps don't, unlike the lists' one-at-a-time Play.
     */
    fun playPad(pad: dev.arc.ep133.features.PhysicalPad, hold: Boolean = true): Job {
        val pressedAt = System.nanoTime()
        val key = "live:${pad.group}:${pad.offset}"
        if (hold) held += key
        // Main.immediate: with the sample in memory this runs to the end before returning.
        return scope.launch {
            val token = playToken
            // The pad tapped is also the sound KEYS plays.
            selectKeysPad(pad)
            val a = padAudio(pad) ?: return@launch
            if (token == playToken) startHeld(key, hold, a, 0, pressedAt)
        }
    }

    /** The finger left the pad: its sound fades out. */
    fun releasePad(pad: dev.arc.ep133.features.PhysicalPad) = release("live:${pad.group}:${pad.offset}")

    private fun release(key: String) {
        held -= key
        liveAudio.release(key)
    }

    /** Starts a Live voice; one let go while it was loading still sounds, briefly. */
    private fun startHeld(key: String, hold: Boolean, a: PadAudio, semitones: Int, pressedAt: Long) {
        when {
            a.silent -> toast(FeatureText.SILENT_SOUND)
            !liveAudio.play(key, a.pcm, a.channels, a.sampleRate, semitones, pressedAt) -> toast(FeatureText.NO_AUDIO_OUTPUT, error = true)
            else -> {
                if (hold && key !in held) liveAudio.release(key)
                if (player.volumeOff()) toast(FeatureText.VOLUME_OFF)
            }
        }
    }

    /** A voice was heard: how long after the press, in the debug log; Bluetooth's delay pointed out once. */
    private fun liveStarted(key: String, latencyMs: Double, route: android.media.AudioDeviceInfo?) {
        val where = dev.arc.ep133.audio.SoundPlayer.routeName(route?.type, route?.productName?.toString())
        trafficLog.note(dev.arc.ep133.text.MirrorText.latencyNote(key, latencyMs, where))
        if (!toldBluetooth && route != null && dev.arc.ep133.audio.SoundPlayer.isBluetooth(route.type)) {
            toldBluetooth = true
            scope.launch { toast(dev.arc.ep133.text.MirrorText.BLUETOOTH_DELAY) }
        }
    }

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
        val w = try {
            withContext(Dispatchers.IO) { Wav.decode(takeFile(t).readBytes()) }
        } catch (e: Exception) {
            toast(e.message ?: e.toString(), error = true)
            return@launch
        }
        if (token != playToken) return@launch
        startSound(takeKey(t), w.pcm, w.channels, w.sampleRate.toInt())
    }

    fun deleteTake(t: dev.arc.ep133.data.TakeInfo): Job = scope.launch {
        if (player.playing.value == takeKey(t)) stopPlayback()
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

    /** A pad's sample, ready to play: 16-bit PCM, [channels] interleaved. */
    private class PadAudio(val pcm: ShortArray, val channels: Int, val sampleRate: Int, val silent: Boolean) {
        val bytes get() = pcm.size * 2L

        companion object {
            /** From little-endian 16-bit PCM bytes. */
            fun of(pcm: ByteArray, channels: Int, sampleRate: Int): PadAudio {
                val shorts = ShortArray(pcm.size / 2)
                java.nio.ByteBuffer.wrap(pcm).order(java.nio.ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(shorts)
                return PadAudio(shorts, channels.coerceIn(1, 2), sampleRate, Wav.isSilent(pcm))
            }
        }
    }

    private fun memoryKey(slot: Int, name: String) = "$slot:${name.trim().lowercase()}"

    private fun keepInMemory(slot: Int, name: String, a: PadAudio) {
        padMemory.put(memoryKey(slot, name), a)?.let { padMemoryBytes -= it.bytes }
        padMemoryBytes += a.bytes
        val it = padMemory.entries.iterator()
        while (padMemoryBytes > PAD_MEMORY_BYTES && it.hasNext()) {
            val e = it.next()
            if (e.value === a) continue
            padMemoryBytes -= e.value.bytes
            it.remove()
        }
    }

    private fun forgetPadMemory() {
        preloadGen++
        padMemory.clear()
        padMemoryBytes = 0
    }

    /**
     * Loads the samples on the active project's pads into memory, one at a
     * time in the background, from arc's copies or a backup (never the
     * device: the background copy does that), so pressing a pad plays at once.
     */
    private fun preloadPads(m: dev.arc.ep133.features.LiveMirror) {
        val gen = ++preloadGen
        scope.launch {
            val snap = m.saved(0)
            for (slot in snap.groups.flatMap { it.pads.values }.filterNotNull().distinct().sorted()) {
                if (gen != preloadGen || mirror !== m) return@launch
                val name = snap.names[slot] ?: continue
                if (padMemory.containsKey(memoryKey(slot, name))) continue
                val a = runCatching { loadPadAudio(slot, name) }.getOrNull() ?: continue
                if (gen == preloadGen && mirror === m) keepInMemory(slot, name, a)
            }
        }
    }

    /** A sample from arc's copy or a backup, decoded; null when neither has it. */
    private suspend fun loadPadAudio(slot: Int, name: String): PadAudio? {
        val wav = withContext(Dispatchers.IO) { padSounds.get(slot, name) } ?: fromBackup(slot, name) ?: return null
        return withContext(Dispatchers.Default) {
            val w = Wav.decode(wav)
            PadAudio.of(w.pcm, w.channels, w.sampleRate.toInt())
        }
    }

    /** A pad's sample from the first place that has it; null after a toast says why. */
    private suspend fun padAudio(pad: dev.arc.ep133.features.PhysicalPad): PadAudio? {
        val m = mirror
        val slot = m?.slotOf(pad)
        val name = m?.nameOf(pad)
        if (slot == null || name == null) {
            toast(dev.arc.ep133.text.MirrorText.NO_SAMPLE)
            return null
        }
        padMemory[memoryKey(slot, name)]?.let { return it }
        return try {
            val audio = loadPadAudio(slot, name) ?: if (session != null && _state.value.device != null) {
                val (d, pcm) = exclusive("play:$slot") { s -> DeviceBrowser.soundDetails(s, slot) to dev.arc.ep133.protocol.Fs.download(s, slot) }
                    ?: return null
                deviceSounds[slot]?.let { keepPadSound(slot, it.name, it.size, pcm, d.channels, d.sampleRate) }
                withContext(Dispatchers.Default) { PadAudio.of(pcm, d.channels.toInt(), d.sampleRate.toInt()) }
            } else {
                toast(dev.arc.ep133.text.MirrorText.NO_COPY)
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
        if (_state.value.keysPad == pad) return
        _state.update { it.copy(keysPad = pad) }
        mirrorPrefs.edit { putString("keysPad", "${pad.group}:${pad.offset}") }
    }

    /**
     * Plays key [index] (0 = '.', the lowest): the KEYS sound, repitched to
     * that key's note as it is mixed, until [releaseKey] (or to the end, with
     * [hold] false).
     */
    fun playKey(index: Int, hold: Boolean = true): Job {
        val pressedAt = System.nanoTime()
        if (hold) held += "keys:$index"
        return scope.launch { startKey(index, hold, pressedAt) }
    }

    /** The finger left the key: its note fades out. */
    fun releaseKey(index: Int) = release("keys:$index")

    private suspend fun startKey(index: Int, hold: Boolean, pressedAt: Long) {
        val token = playToken
        val pad = _state.value.keysPad
        if (pad == null) {
            toast(dev.arc.ep133.text.MirrorText.PICK_SOUND)
            return
        }
        val st = settingsStore.settings.value
        val note = dev.arc.ep133.features.Keys.notes(st.keysRoot, st.keysScale, st.keysOctave).getOrNull(index) ?: return
        val a = padAudio(pad) ?: return
        if (token == playToken) startHeld("keys:$index", hold, a, note - dev.arc.ep133.features.Keys.ROOT_NOTE, pressedAt)
    }

    private fun savedKeysPad(): dev.arc.ep133.features.PhysicalPad? =
        mirrorPrefs.getString("keysPad", null)?.split(':')?.mapNotNull { it.toIntOrNull() }
            ?.takeIf { it.size == 2 && it[0] in 0..3 && it[1] in 0..11 }
            ?.let { dev.arc.ep133.features.PhysicalPad(it[0], it[1]) }

    /** The WAV of a sound from the newest backup that has it, if any. */
    private suspend fun fromBackup(slot: Int, name: String): ByteArray? {
        val b = dev.arc.ep133.features.PadSounds.newestBackupWith(slot, name, backupNames, _state.value.backups) ?: return null
        val pak = openPak?.takeIf { it.first == b.id }?.second
            ?: withContext(Dispatchers.Default) { Paks.open(library.bytes(b.id)) }.also { openPak = b.id to it }
        return pak.sounds[slot]?.wav
    }

    /** Space taken by Live's copies of the device's sounds, in bytes. */
    suspend fun padSoundsSize(): Long = withContext(Dispatchers.IO) { padSounds.bytes() }

    fun clearPadSounds(): Job = scope.launch {
        forgetPadMemory()
        withContext(Dispatchers.IO) { padSounds.clear() }
        // What a backup still has plays as quickly as before.
        mirror?.let(::preloadPads)
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
        // When each copy was last played, kept for choosing what to drop when the copies fill up.
        scope.launch(Dispatchers.IO) { runCatching { padSounds.flush() } }
        _state.update { it.copy(mirror = null) }
    }

    private fun stopMirror() {
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
