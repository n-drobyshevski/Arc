package dev.arc.ep133.controller

import android.content.Context
import android.content.Intent
import android.text.format.DateFormat
import androidx.core.content.ContextCompat
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
import dev.arc.ep133.protocol.DeviceInfo
import dev.arc.ep133.protocol.LoggingTransport
import dev.arc.ep133.protocol.Session
import dev.arc.ep133.protocol.Storage
import dev.arc.ep133.protocol.TrafficLog
import dev.arc.ep133.service.TransferService
import dev.arc.ep133.text.BackupDevice
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
)

/**
 * The state and actions of app.js. Lives as long as the process (owned by
 * ArcApp), so a running transfer survives the activity being recreated; the
 * foreground service only keeps the process alive.
 */
class ArcController(
    private val context: Context,
    private val library: Library,
    private val midi: MidiConnector,
    val trafficLog: TrafficLog,
    private val scope: CoroutineScope,
    val player: dev.arc.ep133.audio.SoundPlayer = dev.arc.ep133.audio.SoundPlayer(),
) {
    private val _state = MutableStateFlow(UiState(midiSupported = midi.supported))
    val state: StateFlow<UiState> = _state.asStateFlow()

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
        scope.launch { runCatching { library.sweep() } }
        midi.watch(
            onAdded = { info ->
                // Agreed addition: connect on its own when an EP-133 is plugged in.
                if (midi.looksLikeEp(info)) scope.launch {
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
        if (_state.value.busy) return null
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
            )
        }
        if (saved != null) {
            _state.update { it.copy(freshId = saved.id) }
            toast(Strings.saved(saved.soundCount, saved.projectCount))
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
        if (_state.value.busy) return null
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
            try {
                val bytes = withContext(Dispatchers.IO) { dev.arc.ep133.files.Files.read(context, uri) }
                val w = withContext(Dispatchers.Default) { Wav.decode(bytes) } // fail early on files that are not usable WAVs
                val slot = SampleUpload.nextFree(occupied, taken)
                if (slot != null) taken.add(slot)
                items.add(UploadDraftItem(fileName, SampleUpload.nameFor(fileName), slot, bytes, null, sampleRate = w.sampleRate))
            } catch (e: Throwable) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                items.add(UploadDraftItem(fileName, SampleUpload.nameFor(fileName), null, null, e.message ?: e.toString()))
            }
        }
        _state.update { it.copy(browser = it.browser.copy(draft = items)) }
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
        val d = _state.value.browser.details[slot] ?: return@launch
        // Not cancelled on stop: an interrupted download would leave the session out of step.
        val pcm = exclusive("play:$slot") { s -> dev.arc.ep133.protocol.Fs.download(s, slot) } ?: return@launch
        if (token != playToken) return@launch
        player.play("device:$slot", pcm, d.channels.toInt(), d.sampleRate.toInt())
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
            player.play("backup:${c.backupId}:$slot", w.pcm, w.channels, w.sampleRate.toInt())
        } catch (e: Throwable) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            toast(e.message ?: e.toString(), error = true)
        }
    }

    fun stopPlayback() {
        playToken++
        player.stop()
    }

    /** Plays PCM that is already in memory (the trim preview). */
    fun playNow(key: String, pcm: ByteArray, channels: Int, sampleRate: Int) {
        playToken++
        player.play(key, pcm, channels, sampleRate)
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
            )
            _state.update { it.copy(freshId = saved.id) }
            toast(Strings.imported(saved.soundCount, saved.projectCount))
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
        library.delete(b.id)
        toast(Strings.BACKUP_DELETED)
        true
    } catch (e: Throwable) {
        if (e is kotlinx.coroutines.CancellationException) throw e
        toast(e.message ?: e.toString(), error = true)
        false
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
