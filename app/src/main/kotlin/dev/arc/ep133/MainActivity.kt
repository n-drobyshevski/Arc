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
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import dev.arc.ep133.backup.PakExport
import dev.arc.ep133.backup.PakSound
import dev.arc.ep133.controller.ArcController
import dev.arc.ep133.files.Files
import dev.arc.ep133.text.BackupRecord
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.LibraryRules
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcSheet
import dev.arc.ep133.ui.components.ArcFrame
import dev.arc.ep133.ui.components.CoachHost
import dev.arc.ep133.ui.components.ArcToast
import dev.arc.ep133.ui.components.Tab
import dev.arc.ep133.ui.components.ArcShell
import dev.arc.ep133.ui.screens.ContentsScreen
import dev.arc.ep133.ui.screens.CompareScreen
import dev.arc.ep133.ui.screens.ComparePickerContent
import dev.arc.ep133.ui.screens.DebugScreen
import dev.arc.ep133.ui.screens.GuideScreen
import dev.arc.ep133.ui.screens.MirrorScreen
import dev.arc.ep133.ui.screens.PadsSheetContent
import dev.arc.ep133.ui.screens.SearchScreen
import dev.arc.ep133.ui.screens.SettingsScreen
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

    // After a reinstall: the user picks Documents/arc so the library can be read back.
    private val folderLauncher = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        if (uri != null) {
            runCatching {
                contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            }
            controller.restoreFromFolder(uri)
        }
    }

    // The transfer does not wait for the answer: it works without the notification.
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {}

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        pendingSave = savedInstanceState?.getString(KEY_PENDING_SAVE)
        if (savedInstanceState == null) handleIntent(intent)
        setContent {
            val settings by controller.settings.collectAsStateWithLifecycle()
            val dark = when (settings.theme) {
                dev.arc.ep133.text.ThemeChoice.SYSTEM -> androidx.compose.foundation.isSystemInDarkTheme()
                dev.arc.ep133.text.ThemeChoice.LIGHT -> false
                dev.arc.ep133.text.ThemeChoice.DARK -> true
            }
            ArcTheme(dark = dark) { Root() }
        }
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
        var settingsOpen by rememberSaveable { mutableStateOf(false) }
        var fontLicence by rememberSaveable { mutableStateOf(false) }
        // The guide overlay: from the ? key, and once by itself on the first start.
        var coach by rememberSaveable { mutableStateOf(false) }
        LaunchedEffect(Unit) {
            val prefs = getPreferences(MODE_PRIVATE)
            if (!prefs.getBoolean("coach_seen", false)) {
                prefs.edit { putBoolean("coach_seen", true) }
                coach = true
            }
        }
        // The section under the top bar; the other screens stack over it without the bars.
        var tab by rememberSaveable { mutableStateOf(Tab.BACKUPS) }
        var search by rememberSaveable { mutableStateOf(false) }
        // Comparing two backups: the backup whose "compare" picker is open, then "<idA>|<idB>".
        var comparePickFor by rememberSaveable { mutableStateOf<String?>(null) }
        var compareIds by rememberSaveable { mutableStateOf<String?>(null) }
        // The pad sheet: "backup:<id>:<project>" or "device:<project>".
        var padsFor by rememberSaveable { mutableStateOf<String?>(null) }
        var contentsId by rememberSaveable { mutableStateOf<String?>(null) }
        // The upload draft row being trimmed; the trim view replaces the upload sheet's content.
        var trimIndex by rememberSaveable { mutableStateOf<Int?>(null) }
        var detailId by rememberSaveable { mutableStateOf<String?>(null) }
        var restoreId by rememberSaveable { mutableStateOf<String?>(null) }
        var confirmDelete by rememberSaveable { mutableStateOf(false) }
        var titleField by rememberSaveable { mutableStateOf("") }
        var notesField by rememberSaveable { mutableStateOf("") }
        // The EP-133 shortcut guide, slid in from the left-edge tab.
        var guideOpen by rememberSaveable { mutableStateOf(false) }
        // The mirror listens only while its tab is in front (not under the debug, settings or guide screen).
        val live = tab == Tab.LIVE && !debug && !settingsOpen && !guideOpen
        val appSettings by controller.settings.collectAsStateWithLifecycle()

        fun selectTab(t: Tab) {
            if (t == tab) return
            // Leaving a tab does what its Done key used to.
            when (tab) {
                Tab.LIVE -> controller.closeMirror()
                Tab.DEVICE -> {
                    padsFor = null
                    controller.stopPlayback()
                }
                else -> {}
            }
            tab = t
            if (t == Tab.DEVICE) controller.refreshBrowser()
        }

        // Keep the screen on while the progress sheet or the live mirror is open.
        val view = LocalView.current
        val keepOn = state.task != null || (live && appSettings.keepScreenOn)
        DisposableEffect(keepOn) {
            view.keepScreenOn = keepOn
            onDispose { view.keepScreenOn = false }
        }
        // The mirror (re)starts when it opens and whenever a device is (re)connected or
        // goes away; without one it shows the last read.
        val ready = state.device != null
        // Only while the app is in front: in the background nothing listens or redraws.
        val lifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
        LaunchedEffect(live, ready) {
            if (live) {
                lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.STARTED) {
                    controller.openMirror()
                    try {
                        kotlinx.coroutines.awaitCancellation()
                    } finally {
                        controller.pauseMirror()
                    }
                }
            }
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
        val compareA = compareIds?.substringBefore('|')?.let { id -> state.backups.firstOrNull { it.id == id } }
        val compareB = compareIds?.substringAfter('|')?.let { id -> state.backups.firstOrNull { it.id == id } }
        // Also runs again after a recreation, when the result is gone.
        LaunchedEffect(compareA?.id, compareB?.id) {
            if (compareA != null && compareB != null) controller.compareBackups(compareA, compareB)
        }

        val onTabs = !debug && !settingsOpen && (compareA == null || compareB == null) && contentsBackup == null && !search
        Box(Modifier.fillMaxSize()) {
            if (debug) {
                DebugScreen(controller.trafficLog, ::shareLog, ::saveLog, ::copyLog) { debug = false }
            } else if (settingsOpen) {
                val uri = androidx.compose.ui.platform.LocalUriHandler.current
                SettingsScreen(
                    settings = appSettings,
                    state = state,
                    padOrder = controller.padOrder(),
                    version = BuildConfigCompat.versionName(this@MainActivity),
                    onTheme = controller::setTheme,
                    onAutoConnect = controller::setAutoConnect,
                    onKeepScreenOn = controller::setKeepScreenOn,
                    pruneCount = controller::pruneCount,
                    onKeepLast = { controller.setKeepLast(it) },
                    onPadOrder = controller::setPadOrder,
                    onForgetNames = controller::forgetLearned,
                    onRestoreFolder = { folderLauncher.launch(dev.arc.ep133.data.ExternalLibrary.INITIAL_FOLDER) },
                    // No browser installed: nothing to open.
                    onSource = { runCatching { uri.openUri(dev.arc.ep133.text.SettingsText.SOURCE_URL) } },
                    onFontLicence = { fontLicence = true },
                    onDebug = { debug = true },
                    onBack = { settingsOpen = false },
                )
                val licenceText = remember { runCatching { assets.open("OFL-Manrope.txt").bufferedReader().use { it.readText() } }.getOrDefault("") }
                ArcSheet(visible = fontLicence, onDismiss = { fontLicence = false }) {
                    androidx.compose.material3.Text(
                        licenceText,
                        style = dev.arc.ep133.ui.theme.ArcType.tiny,
                        color = dev.arc.ep133.ui.theme.LocalArcColors.current.graphite,
                    )
                    dev.arc.ep133.ui.components.ArcKey(Strings.DONE, { fontLicence = false }, Modifier.fillMaxWidth(), style = dev.arc.ep133.ui.components.KeyStyle.Quiet)
                }
            } else if (compareA != null && compareB != null) {
                val (old, new) = if (compareB.createdAt < compareA.createdAt) compareB to compareA else compareA to compareB
                CompareScreen(
                    old = old,
                    new = new,
                    compare = state.pakCompare?.takeIf { it.oldId == old.id && it.newId == new.id },
                    fmtDay = controller::fmtDay,
                    onBack = {
                        compareIds = null
                        controller.closeCompare()
                    },
                )
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
                        padsFor = null
                        controller.closeContents()
                    },
                    onPads = { n -> padsFor = "backup:${contentsBackup.id}:$n" },
                )
                val pak = state.contents?.takeIf { it.backupId == contentsBackup.id }?.pak
                val padsProject = padsFor?.takeIf { it.startsWith("backup:${contentsBackup.id}:") }?.substringAfterLast(':')?.toIntOrNull()
                val tar = padsProject?.let { pak?.projects?.get(it) }
                val groups = remember(tar) { tar?.let { dev.arc.ep133.features.ProjectPads.read(it) } }
                val lastPads = remember { mutableStateOf<Pair<Int, List<dev.arc.ep133.features.PadGroup>>?>(null) }
                    .apply { if (padsProject != null && groups != null) value = padsProject to groups }.value
                val playingPrefix = "backup:${contentsBackup.id}:"
                ArcSheet(visible = groups != null, onDismiss = { padsFor = null }) {
                    lastPads?.let { (n, g) ->
                        PadsSheetContent(
                            title = FeatureText.padsTitle(n),
                            groups = g,
                            nameOf = { slot -> pak?.sounds?.get(slot)?.name },
                            playingSlot = playing?.takeIf { it.startsWith(playingPrefix) }?.removePrefix(playingPrefix)?.toIntOrNull(),
                            onPad = { slot ->
                                if (playing == playingPrefix + slot) controller.stopPlayback() else controller.playBackupSound(slot)
                            },
                            onDone = { padsFor = null },
                        )
                    }
                }
            } else if (search) {
                SearchScreen(
                    search = state.search,
                    fmtDay = controller::fmtDay,
                    onQuery = controller::setSearch,
                    onOpen = { b -> contentsId = b.id },
                    onBack = { search = false },
                )
            } else CoachHost(visible = coach, onDismiss = { coach = false }) {
                ArcShell(
                    tab = tab,
                    onTab = { selectTab(it) },
                    connected = state.connected,
                    canConnect = state.midiSupported && !state.busy,
                    canBackup = state.midiSupported && state.device != null && !state.busy,
                    onBackup = { withNotifications { controller.backup() } },
                    onConnect = { controller.connect() },
                    onDebug = { debug = true },
                    onSettings = { settingsOpen = true },
                    onHelp = { coach = true },
                    guideOpen = guideOpen,
                    onGuide = { guideOpen = it },
                    guide = { GuideScreen(onBack = { guideOpen = false }) },
                ) {
                    // Back from another tab returns to Backups first.
                    BackHandler(enabled = tab != Tab.BACKUPS) { selectTab(Tab.BACKUPS) }
                    when (tab) {
                        Tab.LIVE -> MirrorScreen(
                            mirror = state.mirror ?: if (!ready) {
                                dev.arc.ep133.controller.MirrorUi(loading = false, error = dev.arc.ep133.text.MirrorText.NOT_CONNECTED)
                            } else {
                                null
                            },
                            nameOf = controller::mirrorName,
                            onPadOrder = controller::setPadOrder,
                            oneGroup = appSettings.liveOneGroup,
                            onOneGroup = controller::setLiveOneGroup,
                            follow = appSettings.liveFollow,
                            onFollow = controller::setLiveFollow,
                        )
                        Tab.DEVICE -> DeviceScreen(
                            state = state,
                            onRefresh = { controller.refreshBrowser() },
                            onSoundDetails = { controller.loadSoundDetails(it) },
                            onProjectSounds = { controller.loadProjectSounds(it) },
                            onAddSamples = { samplesLauncher.launch(arrayOf("audio/*", "application/octet-stream")) },
                            onPads = { n -> padsFor = "device:$n" },
                            playing = playing,
                            onPlay = { controller.playDeviceSound(it) },
                            onStop = controller::stopPlayback,
                        )
                        Tab.BACKUPS -> MainScreen(
                            state = state,
                            fmtDay = controller::fmtDay,
                            onBackup = { withNotifications { controller.backup() } },
                            onImport = { importLauncher.launch(arrayOf("*/*")) },
                            onOpen = { b ->
                                titleField = b.title
                                notesField = b.notes
                                detailId = b.id
                            },
                            onSearch = { search = true },
                            onRestoreFolder = { folderLauncher.launch(dev.arc.ep133.data.ExternalLibrary.INITIAL_FOLDER) },
                        )
                    }
                }
            }
            // The tab screens' sheets, over the frame (same condition as the branch above).
            if (onTabs) {
                if (tab == Tab.DEVICE) {
                    val draft = state.browser.draft
                    val lastDraft = remember { mutableStateOf(draft) }.apply { if (draft != null) value = draft }.value
                    // A new draft never opens straight into the trim view of an old one.
                    LaunchedEffect(draft == null) {
                        if (draft == null) {
                            trimIndex = null
                            if (controller.player.playing.value == TRIM_PLAY_KEY) controller.stopPlayback()
                        }
                    }
                    val devicePadsProject = padsFor?.takeIf { it.startsWith("device:") }?.removePrefix("device:")?.toIntOrNull()
                    val deviceGroups = devicePadsProject?.let { state.browser.projectPads[it] }
                    // A disconnect, refresh or process death drops the pads; forget the request then,
                    // or the sheet would pop up by itself when the project is read again. (The Pads
                    // key only shows once the pads are there, so a fresh tap never lands here.)
                    val devicePadsGone = devicePadsProject != null && deviceGroups == null
                    LaunchedEffect(devicePadsGone) { if (devicePadsGone) padsFor = null }
                    val lastDevicePads = remember { mutableStateOf<Pair<Int, List<dev.arc.ep133.features.PadGroup>>?>(null) }
                        .apply { if (devicePadsProject != null && deviceGroups != null) value = devicePadsProject to deviceGroups }.value
                    ArcSheet(visible = deviceGroups != null, onDismiss = { padsFor = null }) {
                        lastDevicePads?.let { (n, g) ->
                            val names = state.browser.contents?.sounds?.associate { it.slot to it.name } ?: emptyMap()
                            PadsSheetContent(
                                title = FeatureText.padsTitle(n),
                                groups = g,
                                nameOf = { names[it] },
                                playingSlot = null,
                                onPad = null,
                                onDone = { padsFor = null },
                            )
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
                }
                if (tab == Tab.BACKUPS) {
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
                            onCompareBackups = if (state.backups.size >= 2) {
                                {
                                    closeDetail(save = true)
                                    comparePickFor = b.id
                                }
                            } else {
                                null
                            },
                            onDelete = { confirmDelete = true },
                            onDone = { closeDetail(save = true) },
                        )
                    }

                    val pickFor = state.backups.firstOrNull { it.id == comparePickFor }
                    val lastPickFor = remember { mutableStateOf<BackupRecord?>(null) }.apply { if (pickFor != null) value = pickFor }.value
                    ArcSheet(visible = pickFor != null, onDismiss = { comparePickFor = null }) {
                        lastPickFor?.let { a ->
                            ComparePickerContent(
                                others = state.backups.filter { it.id != a.id },
                                fmtDay = controller::fmtDay,
                                onPick = { other ->
                                    comparePickFor = null
                                    compareIds = a.id + "|" + other.id
                                },
                                onCancel = { comparePickFor = null },
                            )
                        }
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

                // Transfers can start from any tab (Back up is in the top bar).
                val task = state.task
                val lastTask = remember { mutableStateOf(task) }.apply { if (task != null) value = task }.value
                ArcSheet(visible = task != null, onDismiss = null, grip = false) {
                    lastTask?.let { ProgressSheetContent(it, onCancel = controller::cancelTask) }
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
