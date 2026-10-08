package dev.arc.ep133

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
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
import dev.arc.ep133.ui.screens.PadSheetContent
import dev.arc.ep133.ui.screens.ProjectSheetContent
import dev.arc.ep133.ui.screens.SampleReviewSheetContent
import dev.arc.ep133.ui.screens.TempoSheetContent
import dev.arc.ep133.ui.screens.PatternSheetContent
import dev.arc.ep133.ui.screens.FxSheetContent
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

    // EDIT's "Upload a new sample…": one file, for the pad whose sheet asked for it.
    private var padUploadFor: Pair<dev.arc.ep133.features.PhysicalPad, dev.arc.ep133.features.PadTarget>? = null
    private val padUploadLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val (pad, target) = padUploadFor ?: return@registerForActivityResult
        padUploadFor = null
        if (uri != null) withNotifications { controller.uploadToPad(uri, pad, target) }
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

    /**
     * What SAMPLE asked the mic permission for ([withMicrophone]): [MIC_ENTER]
     * or "step:<n>". Kept in the saved state, because the answer can reach a
     * recreated activity; it is acted on then.
     */
    private var pendingMic: String? = null

    // Android's question about the mic is out ([withMicrophone]); a second one is never sent meanwhile,
    // as Android would answer it "no" at once. With whether it would have shown a rationale then, and
    // when it went (SystemClock.elapsedRealtime), for [refusedForGood].
    private var micAsking = false
    private var micRationaleBefore = false
    private var micAskedAt = 0L

    // SAMPLE's mic and USB inputs: the answer goes to what asked ([pendingMic]); refused, RSP stands in.
    private val micPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val what = pendingMic
        pendingMic = null
        val asking = micAsking
        micAsking = false
        val prefs = getPreferences(MODE_PRIVATE)
        if (granted) {
            prefs.edit { remove(PREF_MIC_REFUSED) }
        } else if (refusedForGood(asking)) {
            prefs.edit { putBoolean(PREF_MIC_REFUSED, true) }
            noMicToast()
        }
        micAnswered(what, granted)
    }

    // Whether Live is in front, so its touches go unbuffered ([unbufferedTouch]); main thread only.
    private var liveTouch = false

    /**
     * While Live is in front ([on]), touches reach the pads and keys as they
     * come rather than batched to the next frame, so a press or a slide onto a
     * key sounds up to a frame sooner. Elsewhere the app keeps Android's
     * batching. Android 11 and later take it for all pointer input (the
     * touchscreen, a mouse or stylus) on [view]; Android 10 only gesture by
     * gesture, asked at each first touch ([dispatchTouchEvent]).
     */
    private fun unbufferedTouch(view: View, on: Boolean) {
        liveTouch = on
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) view.requestUnbufferedDispatch(if (on) InputDevice.SOURCE_CLASS_POINTER else InputDevice.SOURCE_CLASS_NONE)
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (liveTouch && Build.VERSION.SDK_INT < Build.VERSION_CODES.R && ev.actionMasked == MotionEvent.ACTION_DOWN) {
            window.decorView.requestUnbufferedDispatch(ev)
        }
        return super.dispatchTouchEvent(ev)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        pendingSave = savedInstanceState?.getString(KEY_PENDING_SAVE)
        pendingMic = savedInstanceState?.getString(KEY_PENDING_MIC)
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
        outState.putString(KEY_PENDING_MIC, pendingMic)
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
                // A take is copied straight from its file: it can be long.
                if (what != null && what.startsWith("take:")) {
                    val f = controller.takes.value.firstOrNull { it.name == what.removePrefix("take:") }?.let(controller::takeFile)
                        ?: throw java.io.IOException(Strings.FILE_MISSING)
                    withContext(Dispatchers.IO) { Files.copyTo(this@MainActivity, uri, f) }
                    return@launch
                }
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

    private fun micGranted(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    /**
     * SAMPLE's mic, for [what] ([MIC_ENTER], or "step:<n>" for −/+): with the
     * permission it goes ahead at once. Refused for good (as an answer found
     * it, [refusedForGood], and Android still shows no rationale), a toast
     * says so with a key to the app's settings, and [what] goes ahead without
     * it (RSP stands in). Else Android asks, and [what] goes ahead with the
     * answer, even in a recreated activity ([pendingMic]); while it asks, a
     * second ask (a quick double tap on −/+) does nothing.
     */
    private fun withMicrophone(what: String) {
        if (micGranted()) return micAnswered(what, true)
        val rationale = shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO)
        if (getPreferences(MODE_PRIVATE).getBoolean(PREF_MIC_REFUSED, false) && !rationale) {
            noMicToast()
            return micAnswered(what, false)
        }
        if (micAsking) return
        micAsking = true
        micRationaleBefore = rationale
        micAskedAt = android.os.SystemClock.elapsedRealtime()
        pendingMic = what
        micPermission.launch(Manifest.permission.RECORD_AUDIO)
    }

    /**
     * Whether a "no" from Android means it won't ask again: no rationale now,
     * and either there was one before the question (the "no" that ends the
     * asking) or the answer came back too soon for anyone to have seen a
     * question ([MIC_AUTO_REFUSAL_MS]). The question dismissed, or the first
     * "no", leaves it to ask again, as does an "Only this time" that has run
     * out. [asked]: this activity sent the question (else, recreated
     * meanwhile, only the rationale is known).
     */
    private fun refusedForGood(asked: Boolean): Boolean {
        if (shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO)) return false
        if (!asked) return false
        return micRationaleBefore || android.os.SystemClock.elapsedRealtime() - micAskedAt < MIC_AUTO_REFUSAL_MS
    }

    /** The mic refused for good: a toast says so, with a key to the app's settings. */
    private fun noMicToast() {
        // The application's context, so the toast's key doesn't keep this activity.
        val app = applicationContext
        controller.toast(dev.arc.ep133.text.MirrorText.NO_MIC, error = true, action = dev.arc.ep133.text.MirrorText.MIC_SETTINGS) {
            runCatching {
                app.startActivity(
                    Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", app.packageName, null))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            }
        }
    }

    /**
     * SAMPLE's [what] goes ahead, the mic [granted] or not. A −/+ refused
     * leaves the input where it was rather than stepping on past the mic and
     * USB to another RSP input nobody picked.
     */
    private fun micAnswered(what: String?, granted: Boolean) {
        when {
            what == MIC_ENTER -> controller.enterSample(granted)
            what != null && what.startsWith(MIC_STEP) && granted -> what.removePrefix(MIC_STEP).toIntOrNull()?.let { controller.stepSampleInput(it, true) }
        }
    }

    /**
     * The SAMPLE panel opened (a swipe, or the mic key in the top bar): the
     * mode opens, asking for the mic first when the input last chosen needs
     * it (MIC or USB); RSP doesn't, and opens with whatever Android last said.
     */
    private fun enterSample() {
        val input = controller.sample.value.input
        if (input.source == dev.arc.ep133.features.SampleSource.RSP) controller.enterSample(micGranted()) else withMicrophone(MIC_ENTER)
    }

    /**
     * SAMPLE's − or + ([step]): with the mic allowed, the input that many
     * places on among all offered. Without it, a step that lands on the mic
     * or USB (as they would be offered, [now] showing whether USB is plugged
     * in) asks for the mic first ([withMicrophone]); one that lands on RSP
     * goes ahead as it is.
     */
    private fun stepSampleSource(step: Int, now: dev.arc.ep133.controller.SampleUiState) {
        if (micGranted()) return controller.stepSampleInput(step, true)
        val offered = dev.arc.ep133.features.SampleInput.ORDER.filter {
            when (it.source) {
                dev.arc.ep133.features.SampleSource.MIC -> !it.stereo
                dev.arc.ep133.features.SampleSource.RSP -> true
                dev.arc.ep133.features.SampleSource.USB -> now.usb
            }
        }
        val next = dev.arc.ep133.features.SampleInput.cycle(offered, now.input, step)
        if (next.source == dev.arc.ep133.features.SampleSource.RSP) controller.stepSampleInput(step, false) else withMicrophone(MIC_STEP + step)
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

    private fun shareTake(t: dev.arc.ep133.data.TakeInfo) {
        try {
            val uri = androidx.core.content.FileProvider.getUriForFile(this, Files.AUTHORITY, controller.takeFile(t))
            Files.share(this, uri, "audio/wav", t.name, t.name)
        } catch (e: java.io.IOException) {
            controller.toast(dev.arc.ep133.text.MirrorText.SHARE_TAKE_FAILED, error = true)
        } catch (e: IllegalArgumentException) {
            controller.toast(dev.arc.ep133.text.MirrorText.SHARE_TAKE_FAILED, error = true)
        }
    }

    private fun saveTake(t: dev.arc.ep133.data.TakeInfo) {
        pendingSave = "take:${t.name}"
        saveWavLauncher.launch(t.name)
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
        // The debug screen's latency test folded out, kept while Live is played in between.
        var latencyOpen by rememberSaveable { mutableStateOf(false) }
        var settingsOpen by rememberSaveable { mutableStateOf(false) }
        var fontLicence by rememberSaveable { mutableStateOf(false) }
        // The guide overlay: from the ? key, and once by itself on the first start.
        var coach by rememberSaveable { mutableStateOf(false) }
        LaunchedEffect(Unit) {
            // Kept with the settings (and so in Documents/arc); "coach_seen" is where it was before.
            if (!controller.settings.value.guideSeen) {
                if (!getPreferences(MODE_PRIVATE).getBoolean("coach_seen", false)) coach = true
                controller.setGuideSeen()
            }
        }
        // The section under the top bar; the other screens stack over it without the bars.
        // Live is the home section: the app opens on it.
        var tab by rememberSaveable { mutableStateOf(Tab.LIVE) }
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
        // Live's EDIT (the tab under GUIDE), and the pad whose sheet is open with where its sound is set.
        var liveEdit by rememberSaveable { mutableStateOf(false) }
        var padSheet by remember { mutableStateOf<Pair<dev.arc.ep133.features.PhysicalPad, dev.arc.ep133.features.PadTarget>?>(null) }
        // The pad sheet's settings: asked for as it opens, let go of as it closes.
        val padEdit by controller.padEdit.collectAsStateWithLifecycle()
        LaunchedEffect(padSheet) {
            val open = padSheet
            if (open != null) controller.openPadEdit(open.first, open.second) else controller.closePadEdit()
        }
        // TEMPO held: the tempo sheet; PROJECT held: the project sheet; RECORD held: the pattern sheet; FX tapped: the FX sheet.
        var tempoSheet by rememberSaveable { mutableStateOf(false) }
        var projectSheet by rememberSaveable { mutableStateOf(false) }
        var patternSheet by rememberSaveable { mutableStateOf(false) }
        var fxSheet by rememberSaveable { mutableStateOf(false) }
        // FX held: the pads play the punch-ins until it lets go, which lets go of every one held.
        var punchMode by remember { mutableStateOf(false) }
        fun punchOff() {
            if (punchMode) controller.punchAllUp()
            punchMode = false
        }
        // The mirror listens only while its tab is in front (not under the debug, settings or guide screen).
        val live = tab == Tab.LIVE && !debug && !settingsOpen && !guideOpen
        val appSettings by controller.settings.collectAsStateWithLifecycle()

        fun selectTab(t: Tab) {
            if (t == tab) return
            // Leaving a tab does what its Done key used to.
            when (tab) {
                Tab.LIVE -> {
                    // SAMPLE goes with Live (closing its sound, below, would end it too).
                    controller.exitSample()
                    controller.closeMirror()
                    controller.stopPlayback()
                    liveEdit = false
                    padSheet = null
                    tempoSheet = false
                    projectSheet = false
                    patternSheet = false
                    fxSheet = false
                    punchOff()
                    controller.setPatternErase(false)
                }
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
        DisposableEffect(live) {
            unbufferedTouch(view, live)
            onDispose { unbufferedTouch(view, false) }
        }
        // The mirror (re)starts when it opens and whenever a device is (re)connected or
        // goes away; without one it shows the last read.
        val ready = state.device != null
        // EDIT writes to the device, or offline changes pads in arc only: it ends when the device
        // comes or goes, so no pad sheet stays open on the other side (not on a recreation).
        var editReady by rememberSaveable { mutableStateOf(ready) }
        LaunchedEffect(ready) {
            if (ready != editReady) {
                editReady = ready
                liveEdit = false
                padSheet = null
            }
        }
        // Only while the app is in front: in the background nothing listens or redraws.
        val lifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
        LaunchedEffect(live, ready) {
            if (live) {
                lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.STARTED) {
                    controller.openMirror()
                    try {
                        kotlinx.coroutines.awaitCancellation()
                    } finally {
                        // A recreation (dark mode, language) keeps the mirror; the new activity takes it over.
                        if (!isChangingConfigurations) controller.pauseMirror()
                    }
                }
            }
        }

        // Live's sound output stays open while Live is in front, so a press doesn't wait for one.
        LaunchedEffect(live) {
            if (live) {
                lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.STARTED) {
                    controller.openLiveAudio()
                    try {
                        kotlinx.coroutines.awaitCancellation()
                    } finally {
                        // Nor does it cut the notes still sounding. Stopped (below STARTED), arc left the screen
                        // rather than Live: a take it stops says so when it arrives.
                        if (!isChangingConfigurations) {
                            controller.closeLiveAudio(background = !lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED))
                        }
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
        val rec by controller.rec.collectAsStateWithLifecycle()
        // Live's sound goes to Bluetooth: its display line says it plays late.
        val liveWireless by controller.liveWireless.collectAsStateWithLifecycle()
        val takes by controller.takes.collectAsStateWithLifecycle()
        // TAKE in Live tools, and its badge on Live's display line while it records, on the page or in the top bar.
        val liveTake = dev.arc.ep133.ui.screens.TakeUi(rec, controller::toggleTake)
        // RECORD and PLAY on Live's display line: the pads played into a pattern that plays on the phone. A hold on
        // RECORD opens the pattern sheet; where the pattern is is read as the line draws, not collected.
        val pattern by controller.pattern.collectAsStateWithLifecycle()
        val liveTransport = remember(pattern) {
            dev.arc.ep133.ui.screens.TransportUi(
                phase = pattern.phase,
                recording = pattern.recording,
                countIn = pattern.countIn,
                timing = pattern.timing,
                countInOn = pattern.countInOn,
                autoLength = pattern.autoLength,
                bars = pattern.bars,
                hasNotes = pattern.hasNotes,
                focusGroup = pattern.focusGroup,
                erase = pattern.erase,
                canUndo = pattern.canUndo,
                missing = pattern.missing,
                notePads = pattern.notePads,
                position = controller::patternPosition,
                onRecordDown = controller::patternRecordDown,
                onRecordUp = controller::patternRecordUp,
                onPlay = { recordHeld -> controller.patternPlay(recordHeld) },
                onSheet = { patternSheet = true },
                onErase = { on ->
                    // A pad tapped erases instead of opening its sheet: EDIT goes.
                    if (on) liveEdit = false
                    controller.setPatternErase(on)
                },
                onUndo = controller::undoPattern,
                onTiming = controller::setPatternTiming,
                onCountIn = controller::setPatternCountIn,
                onAutoLength = controller::setPatternAutoLength,
                onLength = controller::setPatternLength,
                onDouble = controller::doublePattern,
                onClear = controller::clearPattern,
                onErasePadDown = { pad, at -> controller.erasePadDown(pad, at) },
                onErasePadUp = { pad, at -> controller.erasePadUp(pad, at) },
                onEraseNoteDown = controller::eraseNoteDown,
                onEraseNoteUp = controller::eraseNoteUp,
            )
        }
        val compareA = compareIds?.substringBefore('|')?.let { id -> state.backups.firstOrNull { it.id == id } }
        val compareB = compareIds?.substringAfter('|')?.let { id -> state.backups.firstOrNull { it.id == id } }
        // Also runs again after a recreation, when the result is gone.
        LaunchedEffect(compareA?.id, compareB?.id) {
            if (compareA != null && compareB != null) controller.compareBackups(compareA, compareB)
        }

        val onTabs = !debug && !settingsOpen && (compareA == null || compareB == null) && contentsBackup == null && !search
        // Live's view of the device and of KEYS, for its screen and (on a phone on its side) the top bar.
        val mirror = state.mirror ?: if (!ready) {
            dev.arc.ep133.controller.MirrorUi(loading = false, error = dev.arc.ep133.text.MirrorText.NOT_CONNECTED)
        } else {
            null
        }
        val keys = dev.arc.ep133.ui.screens.KeysUi(
            on = appSettings.liveKeys,
            root = appSettings.keysRoot,
            scale = appSettings.keysScale,
            octave = appSettings.keysOctave,
            names = appSettings.keysNames,
            showNames = appSettings.keysShowNames,
            pianoWhites = appSettings.pianoWhites,
            viewWide = appSettings.keysViewWide,
            viewTall = appSettings.keysViewTall,
            pad = state.keysPad,
            padName = state.keysPad?.let(controller::mirrorName),
        )
        // Live's function keys: PROJECT steps through the projects, KEYS is the mode, TEMPO the phone's click.
        val metronome by controller.metronome.collectAsStateWithLifecycle()
        val sample by controller.sample.collectAsStateWithLifecycle()
        val lastTake by controller.sampleLastTake.collectAsStateWithLifecycle()
        // SAMPLE's take before KEEP: dismissed, it is discarded (the toast offers UNDO).
        val review by controller.sampleReview.collectAsStateWithLifecycle()
        // FX: the project's effect, sends, output compressor and sidechain, for the FX key and sheet.
        val fx by controller.fx.collectAsStateWithLifecycle()
        val functions = dev.arc.ep133.ui.screens.FunctionKeysUi(
            // SOUND held: the sheet of the pad played last (its tap is EDIT, below).
            onPadSound = {
                val pad = state.keysPad
                if (pad == null) controller.toast(dev.arc.ep133.text.MirrorText.PLAY_A_PAD) else controller.editTarget(pad)?.let { padSheet = pad to it }
            },
            project = dev.arc.ep133.ui.screens.projectKeyOf(mirror, state.busy),
            onProject = controller::stepProject,
            onPickProject = { projectSheet = true },
            onSelectProject = controller::selectProject,
            clickOn = metronome.on,
            bpm = metronome.bpm,
            beats = controller.beats,
            onClick = controller::setClick,
            onTempo = { tempoSheet = true },
            fx = fx.type,
            onFx = { fxSheet = true },
            onFxHold = { down -> if (down) punchMode = true else punchOff() },
            fxHeld = punchMode,
        )
        // The SAMPLE panel in the function keys' place: a swipe on Live's pads opens it and SAMPLE mode (asking for
        // the mic first where the input needs it), a swipe back or Back leaves it; the pads record while
        // it is open. The mic key in the top bar works the mode, and the panel follows.
        val sampleUi = dev.arc.ep133.ui.screens.SampleUi(
            state = sample,
            level = controller::sampleLevel,
            clip = controller::sampleClip,
            lastTake = lastTake,
            // A sheet over Live keeps Back: the SAMPLE panel's would otherwise take it first.
            sheetOpen = review != null || padSheet != null || tempoSheet || projectSheet || patternSheet || fxSheet || fontLicence || padsFor != null ||
                detail != null || restore != null || comparePickFor != null || state.task != null,
            onOpen = {
                if (!sample.on) {
                    // The pads record in the mode: EDIT and the sheets over them go.
                    liveEdit = false
                    padSheet = null
                    tempoSheet = false
                    patternSheet = false
                    fxSheet = false
                    enterSample()
                }
            },
            onClose = { controller.exitSample() },
            onStop = controller::stopSample,
            onSource = { step -> stepSampleSource(step, sample) },
            onStereo = { stereo -> controller.setSampleInput(sample.input.copy(stereo = stereo)) },
            onGain = controller::setSampleGain,
            onThreshold = controller::setSampleThreshold,
            onBars = controller::setSampleBars,
            // PTN, after 16 BARS while the project has notes: a take the pattern's length.
            hasPattern = pattern.anyNotes,
            pattern = sample.pattern,
            onPattern = controller::setSamplePattern,
            onLatch = controller::setSampleLatch,
            onPadDown = { pad, at, unsure -> controller.samplePadDown(pad, at, unsure) },
            onPadUp = controller::samplePadUp,
            onPadKept = controller::samplePadKept,
            onPadCut = controller::samplePadCut,
            onLatchPad = { pad -> controller.latchSample(pad) },
        )
        // The piano's notes while it shows, so the bar's display line can name a device note past its ends.
        var pianoRange by remember { mutableStateOf<IntRange?>(null) }
        // How far Live's SAMPLE panel has cross-faded its header in, while Live shows: the bar's line follows it.
        var sampleHeader by remember { mutableStateOf<(() -> Float)?>(null) }
        val liveBar = tab == Tab.LIVE && dev.arc.ep133.ui.screens.liveInBar(dev.arc.ep133.ui.components.LocalArcWindow.current)
        // Live's mic key in the top bar, while Live has a mirror or offline pads: lit while SAMPLE's panel is open. A
        // tap opens it as a swipe does (from KEYS, Live goes to PADS for it in the same tap), or closes it, with a tick.
        val feel = androidx.compose.ui.platform.LocalHapticFeedback.current
        val sampleKey = if (tab == Tab.LIVE && mirror != null) {
            val panelOpen = sample.on && !appSettings.liveKeys
            dev.arc.ep133.ui.components.SampleKey(panelOpen) {
                if (appSettings.haptics) feel.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.SegmentTick)
                if (panelOpen) {
                    controller.exitSample()
                } else {
                    if (appSettings.liveKeys) controller.setLiveKeys(false)
                    sampleUi.onOpen()
                }
            }
        } else {
            null
        }
        Box(Modifier.fillMaxSize()) {
            if (debug) {
                val latency by controller.latency.collectAsStateWithLifecycle()
                DebugScreen(
                    controller.trafficLog, ::shareLog, ::saveLog, ::copyLog,
                    latency = dev.arc.ep133.ui.screens.LatencyUi(
                        state = latency,
                        engine = appSettings.liveEngine,
                        onEngine = controller::setLiveEngine,
                        onReset = controller::resetLatency,
                        open = latencyOpen,
                        onOpen = { latencyOpen = it },
                    ),
                ) { debug = false }
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
                    padSoundsSize = controller::padSoundsSize,
                    onClearPadSounds = { controller.clearPadSounds() },
                    onGetFactory = { controller.getFactorySounds() },
                    onNoteNames = controller::setKeysNames,
                    onShowNames = controller::setKeysShowNames,
                    onPianoWhites = controller::setPianoWhites,
                    onHaptics = controller::setHaptics,
                    onReviewSamples = controller::setReviewSamples,
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
                    // On a phone on its side, Live's display line rides in the top bar.
                    middle = if (liveBar) ({ dev.arc.ep133.ui.screens.LivePill(mirror, keys, transport = liveTransport, take = liveTake, pianoRange = pianoRange, editing = liveEdit, voices = controller.liveKeys, wireless = liveWireless, sample = sampleUi, header = sampleHeader) }) else null,
                    sample = sampleKey,
                ) {
                    // Back from another section returns to Live, the home section, first.
                    BackHandler(enabled = tab != Tab.LIVE) { selectTab(Tab.LIVE) }
                    when (tab) {
                        Tab.LIVE -> MirrorScreen(
                            mirror = mirror,
                            nameOf = controller::mirrorName,
                            onGetFactory = if (dev.arc.ep133.features.FactorySounds.inLibrary(state.backups) == null) ({ controller.getFactorySounds() }) else null,
                            offlinePads = state.offlinePads,
                            onResetPads = { controller.resetOfflinePads() },
                            onPad = { pad, hold, unsure, pressedAt -> controller.playPad(pad, hold, unsure, pressedAt) },
                            onPadKept = { pad -> controller.keepPad(pad) },
                            onPadUp = controller::releasePad,
                            onPadCut = controller::cutPad,
                            keys = keys,
                            keysActions = remember(controller) {
                                dev.arc.ep133.ui.screens.KeysActions(
                                    // The keys play notes, not pads to record into: SAMPLE closes for them.
                                    onMode = { on ->
                                        if (on) controller.exitSample()
                                        controller.setLiveKeys(on)
                                    },
                                    onRoot = controller::setKeysRoot,
                                    onScale = controller::setKeysScale,
                                    onOctave = controller::setKeysOctave,
                                    onNote = { note, hold, pressedAt -> controller.playNote(note, hold, pressedAt) },
                                    onNoteUp = controller::releaseNote,
                                    onSelect = controller::selectKeysPad,
                                    onView = controller::setKeysView,
                                )
                            },
                            // Everything sounding, for the rings (several pads or notes for a chord):
                            // collected inside Live, so a voice starting doesn't recompose the whole app.
                            voices = controller.liveKeys,
                            haptics = appSettings.haptics,
                            wireless = liveWireless,
                            oneGroup = appSettings.liveOneGroup,
                            onOneGroup = controller::setLiveOneGroup,
                            follow = appSettings.liveFollow,
                            onFollow = controller::setLiveFollow,
                            onPianoRange = { pianoRange = it },
                            transport = liveTransport,
                            take = liveTake,
                            takes = dev.arc.ep133.ui.screens.TakesUi(
                                list = takes,
                                playing = playing,
                                keyOf = controller::takeKey,
                                fmtWhen = controller::fmtDateTime,
                                connected = state.device != null,
                                onPlay = { controller.playTake(it) },
                                onStop = controller::stopPlayback,
                                onShare = ::shareTake,
                                onSave = ::saveTake,
                                onToDevice = {
                                    controller.takeToDevice(it)
                                    selectTab(Tab.DEVICE)
                                },
                                onDelete = { controller.deleteTake(it) },
                            ),
                            edit = dev.arc.ep133.ui.screens.EditUi(
                                on = liveEdit,
                                onEdit = { on ->
                                    // With the device there to write to, or offline a last read (or the factory sounds) to change in arc.
                                    if (on && !ready && mirror?.offline == null) {
                                        controller.toast(dev.arc.ep133.text.MirrorText.EDIT_OFFLINE)
                                    } else {
                                        // A tap on a pad gives it another sound: SAMPLE and ERASE close for it.
                                        if (on) {
                                            controller.exitSample()
                                            controller.setPatternErase(false)
                                        }
                                        liveEdit = on
                                    }
                                },
                                onPad = { pad -> controller.editTarget(pad)?.let { padSheet = pad to it } },
                            ),
                            functions = functions,
                            sample = sampleUi,
                            onSampleHeader = { sampleHeader = it },
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
                if (tab == Tab.LIVE) {
                    val lastPadSheet = remember { mutableStateOf(padSheet) }.apply { if (padSheet != null) value = padSheet }.value
                    fun closePadSheet() {
                        padSheet = null
                        if (playing?.startsWith("device:") == true || playing?.startsWith("factory:") == true) controller.stopPlayback()
                    }
                    ArcSheet(visible = padSheet != null, onDismiss = { closePadSheet() }) {
                        lastPadSheet?.let { (pad, target) ->
                            // Offline: the last read's and the factory pack's lists, the pad changing in arc only.
                            val offline = mirror?.offlineSounds?.takeIf { !ready }
                            PadSheetContent(
                                pad = pad,
                                target = target,
                                sounds = if (offline != null) offline.device.orEmpty() else mirror?.sounds.orEmpty(),
                                playing = playing,
                                busy = state.busy && offline == null,
                                onPlay = { slot, source -> controller.playLiveSound(slot, source) },
                                onStop = controller::stopPlayback,
                                onPick = { slot, source ->
                                    closePadSheet()
                                    controller.assignPad(pad, target, slot, source)
                                },
                                onUpload = if (offline != null) null else ({
                                    closePadSheet()
                                    padUploadFor = pad to target
                                    padUploadLauncher.launch(arrayOf("audio/*", "application/octet-stream"))
                                }),
                                factory = offline?.factory,
                                unavailable = offline?.unavailable.orEmpty(),
                                padSource = offline?.let { controller.mirrorLocal(pad)?.source ?: it.base } ?: dev.arc.ep133.features.SoundSource.DEVICE,
                                offline = offline != null,
                                readSlot = offline?.let { controller.mirrorReadSlot(target) },
                                localName = offline?.let { controller.mirrorLocal(pad)?.name },
                                edit = padEdit?.takeIf { it.target == target },
                                onEdit = controller::adjustPad,
                                // The cap plays the pad as Live does, with its settings (a try, never a pattern's note).
                                onPadDown = { controller.playPad(pad, record = false) },
                                onPadUp = { controller.releasePad(pad) },
                                haptics = appSettings.haptics,
                            )
                        }
                    }
                    ArcSheet(visible = projectSheet, onDismiss = { projectSheet = false }) {
                        ProjectSheetContent(
                            choices = dev.arc.ep133.ui.screens.projectChoicesOf(mirror, state.busy),
                            onPick = controller::selectProject,
                            onDone = { projectSheet = false },
                        )
                    }
                    ArcSheet(visible = tempoSheet, onDismiss = { tempoSheet = false }) {
                        TempoSheetContent(
                            bpm = metronome.bpm,
                            deviceBpm = mirror?.state?.bpm,
                            on = metronome.on,
                            onOn = controller::setClick,
                            onBpm = controller::setTempo,
                            onTap = { controller.tapTempo(it) },
                            onDone = { tempoSheet = false },
                        )
                    }
                    ArcSheet(visible = patternSheet, onDismiss = { patternSheet = false }) {
                        PatternSheetContent(liveTransport, onDone = { patternSheet = false })
                    }
                    ArcSheet(visible = fxSheet, onDismiss = { fxSheet = false }) {
                        FxSheetContent(
                            dev.arc.ep133.ui.screens.FxUi(
                                settings = fx,
                                // The tempo Live plays at: the EP-133's while it sends its clock, else the phone's.
                                bpm = dev.arc.ep133.controller.patternBpm(mirror?.state?.bpm, appSettings.liveTempo).toFloat(),
                                selected = state.keysPad,
                                nameOf = controller::mirrorName,
                                onType = controller::setFxType,
                                onXY = controller::setFxXY,
                                onSend = controller::setFxSend,
                                onComp = { on, x, y -> controller.setComp(on, x, y) },
                                onSidechainOn = controller::setSidechainOn,
                                onSidechainSource = controller::setSidechainSource,
                                onSidechainDest = controller::toggleSidechainDest,
                                onSidechainXY = controller::setSidechainXY,
                                haptics = appSettings.haptics,
                            ),
                            onDone = { fxSheet = false },
                        )
                    }
                    // SAMPLE's review sheet (its take collected above).
                    val lastReview = remember { mutableStateOf(review) }.apply { if (review != null) value = review }.value
                    ArcSheet(visible = review != null, onDismiss = { controller.discardSample() }) {
                        lastReview?.let { r ->
                            SampleReviewSheetContent(
                                review = r,
                                playing = playing == dev.arc.ep133.controller.REVIEW_KEY,
                                haptics = appSettings.haptics,
                                onTrim = controller::setReviewTrim,
                                onNormalize = controller::setReviewNormalize,
                                onTrimSilence = controller::setReviewTrimSilence,
                                onSlot = controller::stepReviewSlot,
                                onPlay = { controller.playReview() },
                                onStop = controller::stopReview,
                                onRetake = controller::retakeSample,
                                onKeep = controller::keepSample,
                                onDiscard = controller::discardSample,
                            )
                        }
                    }
                }
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

            // The EP-133 connected with offline pad changes kept: write them or leave the device as it is.
            state.offlinePrompt?.let { p ->
                dev.arc.ep133.ui.screens.OfflinePadsDialog(p.changes, p.samples, onWrite = { controller.writeOfflinePads() }, onDiscard = { controller.discardOfflinePads() })
            }

            val toast = state.toast
            ArcToast(
                id = toast?.id,
                text = toast?.text.orEmpty(),
                error = toast?.error ?: false,
                onTimeout = controller::dismissToast,
                action = toast?.action,
                onAction = toast?.onAction,
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
    }
}

private const val KEY_PENDING_SAVE = "pending_save"
private const val KEY_PENDING_MIC = "pending_mic"

/** What SAMPLE asks the mic for ([MainActivity.withMicrophone]): to open the mode, or −/+ by the number after it. */
private const val MIC_ENTER = "enter"
private const val MIC_STEP = "step:"

/** The preference that says Android refused the mic for good, as an answer found it ([MainActivity.refusedForGood]). */
private const val PREF_MIC_REFUSED = "mic_refused"

/** A "no" to the mic sooner than this after asking came without a question shown: Android no longer asks. */
private const val MIC_AUTO_REFUSAL_MS = 300L
private const val COPY_LIMIT = 200_000

/** versionName without enabling the BuildConfig feature. */
object BuildConfigCompat {
    fun versionName(activity: ComponentActivity): String =
        runCatching { activity.packageManager.getPackageInfo(activity.packageName, 0).versionName }.getOrNull() ?: "?"
}
