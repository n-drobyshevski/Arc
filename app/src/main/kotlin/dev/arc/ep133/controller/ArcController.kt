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
        _state.update { it.copy(connected = false, device = null) }
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
        runCatching { refreshDevice() }
    }

    fun restore(b: BackupRecord, sel: RestoreSelection): Job = scope.launch {
        val s = session ?: return@launch
        val done = runTask(Strings.RESTORING) { onProgress, signal ->
            val bytes = library.bytes(b.id)
            val pak = withContext(Dispatchers.Default) { Paks.open(bytes) }
            Backup.restorePak(s, pak, sel.slots, sel.projects, onProgress, signal)
        }
        if (done != null) toast(Strings.restored(done.sounds, done.projects))
        runCatching { refreshDevice() }
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
