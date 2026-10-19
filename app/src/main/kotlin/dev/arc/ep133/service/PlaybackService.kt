package dev.arc.ep133.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import dev.arc.ep133.ArcApp
import dev.arc.ep133.MainActivity
import dev.arc.ep133.R
import dev.arc.ep133.text.PlaybackText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Background play (an addition): a foreground service (type mediaPlayback) that keeps the process, a partial wake
 * lock and a media session while Live's transport plays, so leaving arc or locking the phone doesn't stop the beat.
 * The notification and the lock screen show what plays with STOP; headphone buttons play and stop, and unplugging
 * them stops. Stopped with arc off the screen, the notification stays with PLAY until it is swiped away (Live's
 * output and mirror are let go then, or after a while: [dev.arc.ep133.controller.ArcController.releaseAway]).
 * The playing itself is ArcController's; this only holds the process and shows it.
 */
class PlaybackService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var wakeLock: PowerManager.WakeLock? = null
    private var session: MediaSession? = null
    private var noisy = false
    private var watching = false
    private val controller get() = (application as ArcApp).controller

    // Headphones pulled out: the beat stops rather than coming out of the speaker.
    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) controller.patternStop()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, PlaybackText.CHANNEL, NotificationManager.IMPORTANCE_LOW),
        )
        val arc = controller
        session = MediaSession(this, "arc").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() = arc.awayPlay()
                override fun onPause() = arc.patternStop()
                override fun onStop() = arc.patternStop()
            })
            isActive = true
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Started for the foreground (as the transport starts, or PLAY on the notification): it shows at once.
        // STOP and a swipe only ask, and may come with arc in the background, where going foreground is refused.
        if (intent?.action == null || intent.action == ACTION_PLAY) {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(true), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        }
        when (intent?.action) {
            ACTION_PLAY -> controller.awayPlay()
            ACTION_STOP -> controller.patternStop()
            ACTION_DISMISS -> controller.releaseAway()
        }
        if (!watching) {
            watching = true
            watch()
        }
        return START_NOT_STICKY
    }

    // The notification follows the transport: playing, foreground with STOP; stopped off the screen, PLAY until
    // swiped away; stopped on the screen, gone.
    private fun watch() {
        scope.launch {
            combine(controller.pattern.map { it.running }, controller.awayKept) { running, kept -> running to kept }
                .distinctUntilChanged()
                .collect { (running, kept) ->
                    when {
                        running -> playing()
                        kept -> stopped()
                        else -> {
                            // A notification left by stopped() outlives the service: it goes with it.
                            getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
                            stopSelf()
                        }
                    }
                }
        }
        // The scene and tempo change while it plays: the notification follows every few seconds.
        scope.launch {
            var shown = ""
            while (true) {
                delay(LABEL_MS)
                val now = controller.playbackLabel()
                if (now != shown && controller.pattern.value.running) {
                    shown = now
                    show(true)
                }
            }
        }
    }

    private fun playing() {
        // Played again from a headphone button while stopped off the screen, Android may refuse the foreground:
        // the beat plays on all the same, as long as the phone lets arc run.
        runCatching { ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(true), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK) }
        if (wakeLock == null) {
            wakeLock = getSystemService(PowerManager::class.java)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "arc:playback")
                .apply { acquire(WAKE_MS) }
        }
        if (!noisy) {
            noisy = true
            ContextCompat.registerReceiver(this, noisyReceiver, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED)
        }
        show(true)
    }

    private fun stopped() {
        letGo()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
        show(false)
    }

    private fun letGo() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        if (noisy) {
            noisy = false
            runCatching { unregisterReceiver(noisyReceiver) }
        }
    }

    // The session says what plays and what can be pressed; the notification says it too.
    private fun show(playing: Boolean) {
        val label = controller.playbackLabel()
        session?.setMetadata(
            MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, if (playing) PlaybackText.PLAYING else PlaybackText.STOPPED)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, label)
                .build(),
        )
        session?.setPlaybackState(
            PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_STOP)
                .setState(if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_STOPPED, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
                .build(),
        )
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(playing, label))
    }

    private fun notification(playing: Boolean, label: String = controller.playbackLabel()): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        // PLAY starts the service in the foreground again (allowed from a notification), STOP only asks.
        val press = if (playing) {
            PendingIntent.getService(this, 1, Intent(this, PlaybackService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        } else {
            PendingIntent.getForegroundService(this, 2, Intent(this, PlaybackService::class.java).setAction(ACTION_PLAY), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
        val dismiss = PendingIntent.getService(
            this, 3, Intent(this, PlaybackService::class.java).setAction(ACTION_DISMISS),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val action = Notification.Action.Builder(
            Icon.createWithResource(this, if (playing) R.drawable.ic_stop else R.drawable.ic_play),
            if (playing) PlaybackText.STOP else PlaybackText.PLAY,
            press,
        ).build()
        val builder = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(if (playing) PlaybackText.PLAYING else PlaybackText.STOPPED)
            .setContentText(label)
            .setContentIntent(open)
            .setDeleteIntent(dismiss)
            .setOngoing(playing)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(action)
            .setStyle(Notification.MediaStyle().setMediaSession(session?.sessionToken).setShowActionsInCompactView(0))
        // Android 12+ may hold a foreground notification back a few seconds: this one shows at once.
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        return builder.build()
    }

    override fun onDestroy() {
        scope.cancel()
        letGo()
        session?.release()
        session = null
        super.onDestroy()
    }

    companion object {
        const val CHANNEL = "playback"
        const val NOTIFICATION_ID = 134
        const val ACTION_PLAY = "dev.arc.ep133.PLAY"
        const val ACTION_STOP = "dev.arc.ep133.STOP"
        const val ACTION_DISMISS = "dev.arc.ep133.DISMISS"

        // How often the notification's scene and tempo are looked at while it plays.
        private const val LABEL_MS = 2_000L

        // The wake lock's own limit: a beat left playing all night lets the phone sleep in the end.
        private const val WAKE_MS = 6 * 60 * 60 * 1000L
    }
}
