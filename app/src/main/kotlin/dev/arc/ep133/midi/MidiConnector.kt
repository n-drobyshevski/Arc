package dev.arc.ep133.midi

import android.content.Context
import android.content.pm.PackageManager
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import dev.arc.ep133.protocol.PortMatch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/** A failure to find or open the EP-133 (webmidi.js MidiError). */
class MidiError(message: String) : Exception(message)

/** An open connection: the transport plus which device it is. */
class OpenMidi(val transport: MidiTransport, val deviceId: Int, val portName: String)

/**
 * Finds the EP-133 through [MidiManager], opens its ports and reports
 * attach/detach through a [MidiManager.DeviceCallback].
 */
class MidiConnector(context: Context) {
    private val manager: MidiManager? =
        if (context.packageManager.hasSystemFeature(PackageManager.FEATURE_MIDI)) context.getSystemService(MidiManager::class.java) else null

    private val thread = HandlerThread("arc-midi").apply { start() }
    private val handler = Handler(thread.looper)

    /** Whether this phone can talk MIDI at all (webMidiSupported). */
    val supported: Boolean get() = manager != null

    private fun allDevices(): List<MidiDeviceInfo> {
        val m = manager ?: return emptyList()
        return if (Build.VERSION.SDK_INT >= 33) {
            m.getDevicesForTransport(MidiManager.TRANSPORT_MIDI_BYTE_STREAM).toList()
        } else {
            @Suppress("DEPRECATION")
            m.devices.toList()
        }
    }

    /** Devices we could talk to: at least one port each way. */
    private fun candidates(): List<MidiDeviceInfo> =
        allDevices().filter { it.inputPortCount > 0 && it.outputPortCount > 0 }

    fun nameOf(info: MidiDeviceInfo): String {
        val p = info.properties
        return listOfNotNull(
            p.getString(MidiDeviceInfo.PROPERTY_NAME),
            p.getString(MidiDeviceInfo.PROPERTY_PRODUCT),
            p.getString(MidiDeviceInfo.PROPERTY_MANUFACTURER),
        ).distinct().joinToString(" ")
    }

    /** The EP-133 if one is plugged in (first named match, else the only MIDI device). */
    fun find(): MidiDeviceInfo? = PortMatch.pick(candidates()) { nameOf(it) }

    /** True when a newly attached device looks like an EP-133 (by name). */
    fun looksLikeEp(info: MidiDeviceInfo): Boolean =
        info.inputPortCount > 0 && info.outputPortCount > 0 && PortMatch.matches(nameOf(info))

    suspend fun open(): OpenMidi {
        val m = manager ?: throw MidiError("This phone can't connect to your EP-133. Your saved backups still work here.")
        val info = find() ?: throw MidiError("No EP-133 found. Plug it in with a USB-C cable, turn it on, then connect again.")
        val device = withTimeoutOrNull(5000) {
            suspendCancellableCoroutine<MidiDevice?> { cont ->
                m.openDevice(info, { d -> cont.resume(d) }, handler)
            }
        } ?: throw MidiError("MIDI access was blocked. Unplug the EP-133, plug it back in, then connect again.")
        val inPort = info.ports.firstOrNull { it.type == MidiDeviceInfo.PortInfo.TYPE_INPUT }?.portNumber ?: 0
        val outPort = info.ports.firstOrNull { it.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT }?.portNumber ?: 0
        val input = device.openInputPort(inPort)
        val output = device.openOutputPort(outPort)
        if (input == null || output == null) {
            runCatching { input?.close() }
            runCatching { output?.close() }
            runCatching { device.close() }
            throw MidiError("MIDI access was blocked. Unplug the EP-133, plug it back in, then connect again.")
        }
        return OpenMidi(MidiTransport(device, input, output), info.id, nameOf(info).ifEmpty { "EP-133" })
    }

    /** Attach/detach notifications for the lifetime of the app. */
    fun watch(onAdded: (MidiDeviceInfo) -> Unit, onRemoved: (MidiDeviceInfo) -> Unit): () -> Unit {
        val m = manager ?: return {}
        val cb = object : MidiManager.DeviceCallback() {
            override fun onDeviceAdded(device: MidiDeviceInfo) = onAdded(device)
            override fun onDeviceRemoved(device: MidiDeviceInfo) = onRemoved(device)
        }
        if (Build.VERSION.SDK_INT >= 33) {
            m.registerDeviceCallback(MidiManager.TRANSPORT_MIDI_BYTE_STREAM, { it.run() }, cb)
        } else {
            @Suppress("DEPRECATION")
            m.registerDeviceCallback(cb, handler)
        }
        return { m.unregisterDeviceCallback(cb) }
    }
}
