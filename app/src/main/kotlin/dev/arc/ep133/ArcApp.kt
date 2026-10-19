package dev.arc.ep133

import android.app.Application
import dev.arc.ep133.controller.ArcController
import dev.arc.ep133.data.ArcDatabase
import dev.arc.ep133.data.ExternalLibrary
import dev.arc.ep133.data.Library
import dev.arc.ep133.data.PakStore
import dev.arc.ep133.midi.MidiConnector
import dev.arc.ep133.protocol.TrafficLog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** Owns everything that must outlive an activity: the device session, the library and the SysEx log. */
class ArcApp : Application() {
    lateinit var controller: ArcController
        private set

    @OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
    override fun onCreate() {
        super.onCreate()
        // Compose's content capture (the screen's text for the system's intelligence features) walks the whole
        // semantics tree each time a screen appears or goes: on Live that held the main thread a second at a time
        // on a Pixel, pads included. arc's pads and keys are nothing to capture.
        androidx.compose.ui.contentcapture.ContentCaptureManager.isEnabled = false
        CrashReport.install(this)
        val trafficLog = TrafficLog()
        StallWatch.start(trafficLog)
        val library = Library(ArcDatabase.open(this), PakStore(filesDir), ExternalLibrary(this))
        controller = ArcController(
            context = this,
            library = library,
            midi = MidiConnector(this),
            trafficLog = trafficLog,
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
        )
        // Why arc stopped last time, if it crashed: first in the debug log.
        CrashReport.report(this, trafficLog)
        StallWatch.since(trafficLog, "app ready")
    }
}
