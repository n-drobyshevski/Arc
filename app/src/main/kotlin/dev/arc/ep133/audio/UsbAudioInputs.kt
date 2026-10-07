package dev.arc.ep133.audio

import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * The USB audio input SAMPLE can record the EP-133 from (an addition;
 * experimental): Android's audio inputs watched while [start]ed, and the
 * best USB one of them in [present]. A device whose name says EP-133 (or
 * K.O, from its full name, EP-133 K.O. II) comes first, then any other USB
 * input, so the EP-133 is found beside a USB headset. The input goes when it
 * is unplugged, and [present] says so as Android does.
 */
class UsbAudioInputs(private val audio: AudioManager?) {
    /** A device as [pick] sees it: its [type], whether it is a [source] (an input), and its [name]. */
    data class Candidate(val type: Int, val source: Boolean, val name: String)

    companion object {
        /** Words in a product name that make it the EP-133's input. */
        val EP_NAMES = listOf("EP-133", "K.O")

        /**
         * Which of [devices] to record from: the first USB input (a USB
         * device or headset) named like the EP-133, else the first USB input;
         * null when there is none.
         */
        fun pick(devices: List<Candidate>): Int? {
            val usb = devices.indices.filter { devices[it].source && isUsb(devices[it].type) }
            return usb.firstOrNull { i -> EP_NAMES.any { devices[i].name.contains(it, ignoreCase = true) } } ?: usb.firstOrNull()
        }

        /** Whether device [type] is USB audio: a device or a headset. */
        fun isUsb(type: Int): Boolean = type == AudioDeviceInfo.TYPE_USB_DEVICE || type == AudioDeviceInfo.TYPE_USB_HEADSET

        /** Whether an input with [channelCounts] records in stereo; one that lists none takes any, stereo too. */
        fun stereo(channelCounts: IntArray): Boolean = channelCounts.isEmpty() || channelCounts.any { it >= 2 }

        /** Whether [device] records in stereo, from its channel counts. */
        fun stereo(device: AudioDeviceInfo): Boolean = stereo(device.channelCounts)
    }

    private val _present = MutableStateFlow<AudioDeviceInfo?>(null)

    /** The USB input to record from, null while none is plugged in (or before [start]). */
    val present: StateFlow<AudioDeviceInfo?> = _present

    private var watching = false

    private val callback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) = refresh()

        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) = refresh()
    }

    /** Starts watching the inputs; Android tells the ones there now at once. Main thread. */
    fun start() {
        if (watching || audio == null) return
        watching = true
        audio.registerAudioDeviceCallback(callback, null)
        refresh()
    }

    /** Stops watching; [present] goes back to null. Main thread. */
    fun stop() {
        if (!watching) return
        watching = false
        audio?.unregisterAudioDeviceCallback(callback)
        _present.value = null
    }

    private fun refresh() {
        if (!watching) return
        val devices = audio?.getDevices(AudioManager.GET_DEVICES_INPUTS) ?: return
        val i = pick(devices.map { Candidate(it.type, it.isSource, it.productName?.toString().orEmpty()) })
        _present.value = i?.let { devices[it] }
    }
}
