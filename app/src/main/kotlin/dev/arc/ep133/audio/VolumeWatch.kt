package dev.arc.ep133.audio

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import androidx.core.content.ContextCompat

/**
 * Whether media volume is at zero, so nothing is heard even when a sound
 * plays (an addition). Asking the audio service takes a call into another
 * process, too slow for every press: while watched ([start] to [stop], which
 * may nest) the answer is read once and then kept up to date from Android's
 * volume broadcasts. Unwatched, [off] asks each time.
 */
class VolumeWatch(context: Context?) {
    private val context = context?.applicationContext
    private val audio = context?.getSystemService(AudioManager::class.java)
    private var watchers = 0
    @Volatile private var cached: Boolean? = null

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
            cached = read()
        }
    }

    private fun read(): Boolean = audio?.getStreamVolume(AudioManager.STREAM_MUSIC) == 0

    /** Whether media volume is at zero now. */
    val off: Boolean get() = cached ?: read()

    /** Starts keeping the answer (Live open, a preview output open). */
    @Synchronized
    fun start() {
        val c = context ?: return
        if (watchers++ > 0) return
        val filter = IntentFilter().apply {
            addAction(VOLUME_CHANGED)
            addAction(MUTE_CHANGED)
        }
        // Sent by the system only; nothing from other apps is wanted.
        ContextCompat.registerReceiver(c, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        cached = read()
    }

    /** Stops, once each [start] has had its stop. */
    @Synchronized
    fun stop() {
        val c = context ?: return
        if (watchers == 0 || --watchers > 0) return
        cached = null
        runCatching { c.unregisterReceiver(receiver) }
    }

    private companion object {
        // AudioManager's own (hidden) broadcasts for a stream's volume and mute.
        const val VOLUME_CHANGED = "android.media.VOLUME_CHANGED_ACTION"
        const val MUTE_CHANGED = "android.media.STREAM_MUTE_CHANGED_ACTION"
    }
}
