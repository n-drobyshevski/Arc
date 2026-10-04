package dev.arc.ep133

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import dev.arc.ep133.backup.PakExport
import dev.arc.ep133.backup.PakSound
import dev.arc.ep133.controller.ArcController
import dev.arc.ep133.files.Files
import dev.arc.ep133.text.BackupRecord
import dev.arc.ep133.text.LibraryRules
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcSheet
import dev.arc.ep133.ui.components.ArcToast
import dev.arc.ep133.ui.screens.ContentsScreen
import dev.arc.ep133.ui.screens.DebugScreen
import dev.arc.ep133.ui.screens.GuideScreen
import dev.arc.ep133.ui.screens.DeviceScreen
import dev.arc.ep133.ui.screens.TRIM_PLAY_KEY
import dev.arc.ep133.ui.screens.TrimSheetContent
import dev.arc.ep133.ui.screens.UploadSheetContent
import dev.arc.ep133.ui.screens.DeleteDialog
import dev.arc.ep133.ui.screens.DetailSheetContent
import dev.arc.ep133.ui.screens.MainScreen
import dev.arc.ep133.ui.screens.ProgressSheetContent
import dev.arc.ep133.ui.screens.RestoreSheetContent
import dev.arc.ep133.ui.theme.ArcTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class MainActivity : ComponentActivity() {
    private val controller: ArcController get() = (application as ArcApp).controller

    /**
     * What the open save picker is for: "pak:<id>", "wav:<id>:<slot>",
     * "project:<id>:<n>" or "log". Kept in the saved
     * state, because the result can reach a recreated activity; the bytes are
     * read again then.
     */
    private var pendingSave: String? = null

    // Sample upload: pick one or more audio files (only WAV can be read; others are flagged).
    private val samplesLauncher = registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        controller.pickForUpload(uris)
    }

    private val importLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) controller.importUri(uri)
    }

    // application/octet-stream: with application/zip some providers append ".zip" to "x.pak".
    private val savePakLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        writePending(uri)
    }

    private val saveWavLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("audio/wav")) { uri ->
        writePending(uri)
    }

    private val saveLogLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
        writePending(uri)
    }

    // The transfer does not wait for the answer: it works without the notification.
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {}

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        pendingSave = savedInstanceState?.getString(KEY_PENDING_SAVE)
        if (savedInstanceState == null) handleIntent(intent)
        setContent { ArcTheme { Root() } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onStop() {
        super.onStop()
        // Nothing keeps playing in the background (a rotation is not leaving the app).
        if (!isChangingConfigurations) controller.stopPlayback()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(KEY_PENDING_SAVE, pendingSave)
    }

    /** A .pak opened from Files (or another app) lands here. */
    private fun handleIntent(intent: Intent?) {
        if (intent?.action != Intent.ACTION_VIEW) return
        // Reopening the task from Recents replays the original intent: don't import twice.
        if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY == 0) {
            intent.data?.let { controller.importUri(it) }
        }
        setIntent(Intent(this, MainActivity::class.java))
    }

    private fun writePending(uri: Uri?) {
        val what = pendingSave
        pendingSave = null
        if (uri == null) return
        lifecycleScope.launch {
            try {
                val bytes = when {
                    what == "log" -> logText().toByteArray()
                    what != null && what.startsWith("pak:") -> {
                        val b = controller.state.value.backups.firstOrNull { it.id == what.removePrefix("pak:") }
                            ?: throw java.io.IOException(Strings.FILE_MISSING)
                        controller.pakBytes(b)
                    }
                    // "wav:<id>:<slot>" / "project:<id>:<n>": ids are UUIDs, so the last ':' splits.
                    what != null && (what.startsWith("wav:") || what.startsWith("project:")) -> {
                        val kind = what.substringBefore(':')
                        val rest = what.substringAfter(':')
                        controller.exportBytes(rest.substringBeforeLast(':'), kind + ":" + rest.substringAfterLast(':'))
                    }
                    else -> throw java.io.IOException(Strings.SAVE_FAILED)
                }
                withContext(Dispatchers.IO) { Files.writeTo(this@MainActivity, uri, bytes) }
            } catch (e: Exception) {
                // Don't leave an empty file behind.
                runCatching { android.provider.DocumentsContract.deleteDocument(contentResolver, uri) }
                controller.toast(e.message ?: e.toString(), error = true)
            }
        }
    }

    /**
     * Asks for the notification permission once, on the first backup or
     * restore (Android 13+), and starts the transfer straight away.
     */
    private fun withNotifications(block: () -> Unit) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            !getPreferences(MODE_PRIVATE).getBoolean("asked_notifications", false)
        ) {
            getPreferences(MODE_PRIVATE).edit { putBoolean("asked_notifications", true) }
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        block()
    }

    private fun savePak(b: BackupRecord) {
        if (!controller.pakFile(b).isFile) {
            controller.toast(Strings.FILE_MISSING, error = true)
            return
        }
        pendingSave = "pak:${b.id}"
        savePakLauncher.launch(LibraryRules.fileNameFor(b.title))
    }

    private fun sharePak(b: BackupRecord) =
        shareBytes(LibraryRules.fileNameFor(b.title), "application/zip", b.title) { controller.pakBytes(b) }

    /** Shares [read]'s bytes as a file named [name] through the system share sheet. */
    private fun shareBytes(name: String, mime: String, title: String, read: suspend () -> ByteArray) {
        lifecycleScope.launch {
            try {
                val bytes = read()
                val uri = withContext(Dispatchers.IO) { Files.shareableUri(this@MainActivity, name, bytes) }
                Files.share(this@MainActivity, uri, mime, title, Strings.SHARE_TITLE_PREFIX + title)
            } catch (e: java.io.IOException) {
                controller.toast(if (e.message == "no app to share with") Strings.SHARE_FAILED else e.message ?: Strings.SHARE_FAILED, error = true)
            } catch (e: SecurityException) {
                controller.toast(Strings.SHARE_FAILED, error = true)
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                // A damaged backup (PakError and the like) while exporting a piece of it.
                controller.toast(e.message ?: e.toString(), error = true)
            }
        }
    }

    private fun shareWav(b: BackupRecord, snd: PakSound) {
        val name = PakExport.soundFileName(snd)
        shareBytes(name, "audio/wav", name) { controller.exportBytes(b.id, "wav:${snd.slot}") }
    }

    private fun saveWav(b: BackupRecord, snd: PakSound) {
        pendingSave = "wav:${b.id}:${snd.slot}"
        saveWavLauncher.launch(PakExport.soundFileName(snd))
    }

    private fun shareProject(b: BackupRecord, n: Int) {
        val name = PakExport.projectFileName(LibraryRules.fileNameFor(b.title), n)
        shareBytes(name, "application/zip", name) { controller.exportBytes(b.id, "project:$n") }
    }

    private fun saveProject(b: BackupRecord, n: Int) {
        pendingSave = "project:${b.id}:$n"
        savePakLauncher.launch(PakExport.projectFileName(LibraryRules.fileNameFor(b.title), n))
    }

    private fun logText(): String = controller.trafficLog.export(
        listOf(
            "arc ${BuildConfigCompat.versionName(this)} on Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}), ${Build.MANUFACTURER} ${Build.MODEL}",
            "MIDI: ${controller.midiDescription.ifEmpty { "not connected" }}",
            "Exported ${DateTimeFormatter.ISO_INSTANT.format(Instant.now())}",
        ),
    )

    private fun logFileName(): String =
        "arc-sysex-" + DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneId.systemDefault()).format(Instant.now()) + ".txt"

    private fun shareLog() {
        lifecycleScope.launch {
            try {
                val text = logText()
                val uri = withContext(Dispatchers.IO) { Files.shareableUri(this@MainActivity, logFileName(), text.toByteArray()) }
                Files.share(this@MainActivity, uri, "text/plain", Strings.DEBUG_TITLE, Strings.DEBUG_TITLE)
            } catch (e: Exception) {
                controller.toast(e.message ?: e.toString(), error = true)
            }
        }
    }

    private fun saveLog() {
        pendingSave = "log"
        saveLogLauncher.launch(logFileName())
    }

    /** The clipboard goes through a 1 MB binder transaction: copy only the latest part of the log. */
    private fun copyLog() {
        val full = logText()
        val text = if (full.length <= COPY_LIMIT) full else Strings.DEBUG_COPY_TRUNCATED + "\n" + full.takeLast(COPY_LIMIT)
        try {
            getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText(Strings.DEBUG_TITLE, text))
            controller.toast(Strings.DEBUG_COPIED)
        } catch (e: RuntimeException) {
            controller.toast(e.message ?: e.toString(), error = true)
        }
    }

    @Composable
    private fun Root() {
        val state by controller.state.collectAsStateWithLifecycle()
        var debug by rememberSaveable { mutableStateOf(false) }
        var browse by rememberSaveable { mutableStateOf(false) }
        var guide by rememberSaveable { mutableStateOf(false) }
        var contentsId by rememberSaveable { mutableStateOf<String?>(null) }
        // The upload draft row being trimmed; the trim view replaces the upload sheet's content.
        var trimIndex by rememberSaveable { mutableStateOf<Int?>(null) }
        var detailId by rememberSaveable { mutableStateOf<String?>(null) }
        var restoreId by rememberSaveable { mutableStateOf<String?>(null) }
        var confirmDelete by rememberSaveable { mutableStateOf(false) }
        var titleField by rememberSaveable { mutableStateOf("") }
        var notesField by rememberSaveable { mutableStateOf("") }

        // Keep the screen on while the progress sheet is open.
        val view = LocalView.current
        val transferring = state.task != null
        DisposableEffect(transferring) {
            view.keepScreenOn = transferring
            onDispose { view.keepScreenOn = false }
        }

        val detail = state.backups.firstOrNull { it.id == detailId }
        val restore = state.backups.firstOrNull { it.id == restoreId }
        // Keep showing the last record while a sheet animates out.
        val shownDetail = remember { mutableStateOf<BackupRecord?>(null) }.apply { if (detail != null) value = detail }.value
        val shownRestore = remember { mutableStateOf<BackupRecord?>(null) }.apply { if (restore != null) value = restore }.value

        fun closeDetail(save: Boolean) {
            val b = detail
            if (save && b != null) controller.saveEdits(b, titleField, notesField)
            detailId = null
        }

        val contentsBackup = state.backups.firstOrNull { it.id == contentsId }
        // After a recreation (or process death) the opened backup has to be read again.
        LaunchedEffect(contentsBackup?.id) { contentsBackup?.let { controller.openContents(it) } }
        val playing by controller.player.playing.collectAsStateWithLifecycle()

        Box(Modifier.fillMaxSize()) {
            if (debug) {
                DebugScreen(controller.trafficLog, ::shareLog, ::saveLog, ::copyLog) { debug = false }
            } else if (guide) {
                GuideScreen { guide = false }
            } else if (contentsBackup != null) {
                ContentsScreen(
                    b = contentsBackup,
                    contents = state.contents?.takeIf { it.backupId == contentsBackup.id },
                    playing = playing,
                    onPlay = { controller.playBackupSound(it) },
                    onStop = controller::stopPlayback,
                    onShareWav = { shareWav(contentsBackup, it) },
                    onSaveWav = { saveWav(contentsBackup, it) },
                    onShareProject = { shareProject(contentsBackup, it) },
                    onSaveProject = { saveProject(contentsBackup, it) },
                    onBack = {
                        contentsId = null
                        controller.closeContents()
                    },
                )
            } else if (browse) {
                DeviceScreen(
                    state = state,
                    onRefresh = { controller.refreshBrowser() },
                    onSoundDetails = { controller.loadSoundDetails(it) },
                    onProjectSounds = { controller.loadProjectSounds(it) },
                    onAddSamples = { samplesLauncher.launch(arrayOf("audio/*", "application/octet-stream")) },
                    onBack = {
                        browse = false
                        controller.stopPlayback()
                    },
                    playing = playing,
                    onPlay = { controller.playDeviceSound(it) },
                    onStop = controller::stopPlayback,
                )
                val draft = state.browser.draft
                val lastDraft = remember { mutableStateOf(draft) }.apply { if (draft != null) value = draft }.value
                // A new draft never opens straight into the trim view of an old one.
                LaunchedEffect(draft == null) {
                    if (draft == null) {
                        trimIndex = null
                        if (controller.player.playing.value == TRIM_PLAY_KEY) controller.stopPlayback()
                    }
                }
                fun closeTrim() {
                    trimIndex = null
                    if (playing == TRIM_PLAY_KEY) controller.stopPlayback()
                }
                ArcSheet(
                    visible = draft != null,
                    onDismiss = {
                        if (trimIndex != null) closeTrim() else controller.dropDraft()
                    },
                ) {
                    val trimming = trimIndex?.let { lastDraft?.getOrNull(it) }
                    if (trimming != null) {
                        TrimSheetContent(
                            item = trimming,
                            playing = playing,
                            onPlay = { pcm, ch, rate -> controller.playNow(TRIM_PLAY_KEY, pcm, ch, rate) },
                            onStop = controller::stopPlayback,
                            onDone = { range ->
                                controller.setDraftTrim(trimIndex!!, range)
                                closeTrim()
                            },
                            onCancel = { closeTrim() },
                        )
                    } else lastDraft?.let { d ->
                        UploadSheetContent(
                            draft = d,
                            occupied = state.browser.contents?.sounds?.associate { it.slot to it.name } ?: emptyMap(),
                            busy = state.busy,
                            onSlot = controller::setDraftSlot,
                            onUpload = { withNotifications { controller.uploadDraft() } },
                            onCancel = { controller.dropDraft() },
                            onTrim = { trimIndex = it },
                        )
                    }
                }
                val task = state.task
                val lastTask = remember { mutableStateOf(task) }.apply { if (task != null) value = task }.value
                ArcSheet(visible = task != null, onDismiss = null, grip = false) {
                    lastTask?.let { ProgressSheetContent(it, onCancel = controller::cancelTask) }
                }
            } else {
                MainScreen(
                    state = state,
                    fmtDay = controller::fmtDay,
                    onConnect = { controller.connect() },
                    onBackup = { withNotifications { controller.backup() } },
                    onImport = { importLauncher.launch(arrayOf("*/*")) },
                    onOpen = { b ->
                        titleField = b.title
                        notesField = b.notes
                        detailId = b.id
                    },
                    onDebug = { debug = true },
                    onBrowse = {
                        browse = true
                        controller.refreshBrowser()
                    },
                    onGuide = { guide = true },
                )

                ArcSheet(visible = detail != null, onDismiss = { closeDetail(save = true) }) {
                    val b = shownDetail ?: return@ArcSheet
                    DetailSheetContent(
                        b = b,
                        title = titleField,
                        onTitle = { titleField = it },
                        notes = notesField,
                        onNotes = { notesField = it },
                        madeText = controller.fmtDateTime(b.createdAt),
                        canRestore = state.device != null && !state.busy,
                        connected = state.device != null,
                        onRestore = {
                            closeDetail(save = true)
                            restoreId = b.id
                        },
                        onShare = { sharePak(b) },
                        onSave = { savePak(b) },
                        onContents = {
                            closeDetail(save = true)
                            contentsId = b.id
                        },
                        onDelete = { confirmDelete = true },
                        onDone = { closeDetail(save = true) },
                    )
                }

                fun closeRestore() {
                    restoreId = null
                    controller.clearDiff()
                }
                ArcSheet(visible = restore != null, onDismiss = { closeRestore() }) {
                    val b = shownRestore ?: return@ArcSheet
                    RestoreSheetContent(
                        b = b,
                        onRestore = { sel ->
                            closeRestore()
                            withNotifications { controller.restore(b, sel) }
                        },
                        onCancel = { closeRestore() },
                        diff = state.diff,
                        canCompare = state.device != null && !state.busy,
                        onCompare = { sel -> controller.compare(b, sel) },
                    )
                }

                val task = state.task
                val lastTask = remember { mutableStateOf(task) }.apply { if (task != null) value = task }.value
                ArcSheet(visible = task != null, onDismiss = null, grip = false) {
                    lastTask?.let { ProgressSheetContent(it, onCancel = controller::cancelTask) }
                }

                if (confirmDelete && detail != null) {
                    DeleteDialog(
                        title = detail.title,
                        onConfirm = {
                            confirmDelete = false
                            lifecycleScope.launch {
                                // Close (without saving edits) only once the delete worked.
                                if (controller.delete(detail)) closeDetail(save = false)
                            }
                        },
                        onDismiss = { confirmDelete = false },
                    )
                }
            }

            val toast = state.toast
            ArcToast(
                id = toast?.id,
                text = toast?.text.orEmpty(),
                error = toast?.error ?: false,
                onTimeout = controller::dismissToast,
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
    }
}

private const val KEY_PENDING_SAVE = "pending_save"
private const val COPY_LIMIT = 200_000

/** versionName without enabling the BuildConfig feature. */
object BuildConfigCompat {
    fun versionName(activity: ComponentActivity): String =
        runCatching { activity.packageManager.getPackageInfo(activity.packageName, 0).versionName }.getOrNull() ?: "?"
}
