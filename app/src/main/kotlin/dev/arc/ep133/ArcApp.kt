package dev.arc.ep133

import android.app.Application
import dev.arc.ep133.controller.ArcController
import dev.arc.ep133.data.ArcDatabase
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

    override fun onCreate() {
        super.onCreate()
        val library = Library(ArcDatabase.open(this), PakStore(filesDir))
        controller = ArcController(
            context = this,
            library = library,
            midi = MidiConnector(this),
            trafficLog = TrafficLog(),
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
        )
    }
}
