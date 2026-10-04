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
import dev.arc.ep133.controller.ArcController
import dev.arc.ep133.files.Files
import dev.arc.ep133.text.BackupRecord
import dev.arc.ep133.text.LibraryRules
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcSheet
import dev.arc.ep133.ui.components.ArcToast
import dev.arc.ep133.ui.screens.DebugScreen
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

    /** Bytes waiting for the user to pick where to save them. */
    private var pendingSave: ByteArray? = null
    private var afterPermission: (() -> Unit)? = null

    private val importLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) importUri(uri)
    }

    // application/octet-stream: with application/zip some providers append ".zip" to "x.pak".
    private val savePakLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        writePending(uri)
    }

    private val saveLogLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
        writePending(uri)
    }

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        // Go ahead either way; the transfer works without the notification.
        afterPermission?.invoke()
        afterPermission = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) handleIntent(intent)
        setContent { ArcTheme { Root() } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    /** A .pak opened from Files (or another app) lands here. */
    private fun handleIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_VIEW) {
            intent.data?.let { importUri(it) }
            setIntent(Intent(this, MainActivity::class.java))
        }
    }

    private fun importUri(uri: Uri) {
        lifecycleScope.launch {
            val (name, modified) = withContext(Dispatchers.IO) { Files.describe(this@MainActivity, uri) }
            controller.import(name, modified) { Files.read(this@MainActivity, uri) }
        }
    }

    private fun writePending(uri: Uri?) {
        val bytes = pendingSave ?: return
        pendingSave = null
        if (uri == null) return
        lifecycleScope.launch {
            runCatching { withContext(Dispatchers.IO) { Files.writeTo(this@MainActivity, uri, bytes) } }
                .onFailure { controller.toast(it.message ?: it.toString(), error = true) }
        }
    }

    /** Ask for the notification permission once, on the first backup or restore (Android 13+). */
    private fun withNotifications(block: () -> Unit) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            !getPreferences(MODE_PRIVATE).getBoolean("asked_notifications", false)
        ) {
            getPreferences(MODE_PRIVATE).edit { putBoolean("asked_notifications", true) }
            afterPermission = block
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            block()
        }
    }

    private fun savePak(b: BackupRecord) {
        lifecycleScope.launch {
            runCatching { controller.pakBytes(b) }
                .onSuccess {
                    pendingSave = it
                    savePakLauncher.launch(LibraryRules.fileNameFor(b.title))
                }
                .onFailure { controller.toast(it.message ?: it.toString(), error = true) }
        }
    }

    private fun sharePak(b: BackupRecord) {
        lifecycleScope.launch {
            try {
                val bytes = controller.pakBytes(b)
                val uri = withContext(Dispatchers.IO) { Files.shareableUri(this@MainActivity, LibraryRules.fileNameFor(b.title), bytes) }
                Files.share(this@MainActivity, uri, "application/zip", b.title, Strings.SHARE_TITLE_PREFIX + b.title)
            } catch (e: java.io.IOException) {
                controller.toast(if (e.message == "no app to share with") Strings.SHARE_FAILED else e.message ?: Strings.SHARE_FAILED, error = true)
            } catch (e: SecurityException) {
                controller.toast(Strings.SHARE_FAILED, error = true)
            }
        }
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
        pendingSave = logText().toByteArray()
        saveLogLauncher.launch(logFileName())
    }

    private fun copyLog() {
        getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText(Strings.DEBUG_TITLE, logText()))
        controller.toast(Strings.DEBUG_COPIED)
    }

    @Composable
    private fun Root() {
        val state by controller.state.collectAsStateWithLifecycle()
        var debug by rememberSaveable { mutableStateOf(false) }
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

        Box(Modifier.fillMaxSize()) {
            if (debug) {
                DebugScreen(controller.trafficLog, ::shareLog, ::saveLog, ::copyLog) { debug = false }
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
                        onDelete = { confirmDelete = true },
                        onDone = { closeDetail(save = true) },
                    )
                }

                ArcSheet(visible = restore != null, onDismiss = { restoreId = null }) {
                    val b = shownRestore ?: return@ArcSheet
                    RestoreSheetContent(
                        b = b,
                        onRestore = { sel ->
                            restoreId = null
                            withNotifications { controller.restore(b, sel) }
                        },
                        onCancel = { restoreId = null },
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
                            controller.delete(detail)
                            closeDetail(save = false)
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

/** versionName without enabling the BuildConfig feature. */
object BuildConfigCompat {
    fun versionName(activity: ComponentActivity): String =
        runCatching { activity.packageManager.getPackageInfo(activity.packageName, 0).versionName }.getOrNull() ?: "?"
}
