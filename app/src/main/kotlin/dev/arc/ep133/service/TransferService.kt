package dev.arc.ep133.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import dev.arc.ep133.ArcApp
import dev.arc.ep133.MainActivity
import dev.arc.ep133.R
import dev.arc.ep133.text.Strings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.sample
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * Foreground service (type dataSync) that keeps the process alive while a
 * backup or restore runs, so locking the phone does not kill the transfer.
 * The work itself runs in ArcController; this only holds the process, a
 * partial wake lock and the progress notification.
 */
class TransferService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, Strings.NOTIFICATION_CHANNEL, NotificationManager.IMPORTANCE_LOW),
        )
    }

    @OptIn(kotlinx.coroutines.FlowPreview::class)
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val controller = (application as ArcApp).controller
        if (intent?.action == ACTION_CANCEL) {
            controller.cancelTask()
            return START_NOT_STICKY
        }
        val task = controller.state.value.task
        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            notification(task?.title ?: Strings.BACKING_UP, task?.label.orEmpty(), task?.fraction ?: 0.0),
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
        )
        if (task == null) {
            // The task already finished before the service came up.
            stopSelf()
            return START_NOT_STICKY
        }
        if (wakeLock == null) {
            wakeLock = getSystemService(PowerManager::class.java)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "arc:transfer")
                .apply { acquire(4 * 60 * 60 * 1000L) }
        }
        scope.launch {
            controller.state.map { it.task }.distinctUntilChanged().sample(250).collect { t ->
                if (t == null) {
                    stopSelf()
                } else {
                    getSystemService(NotificationManager::class.java)
                        .notify(NOTIFICATION_ID, notification(t.title, t.label, t.fraction))
                }
            }
        }
        return START_NOT_STICKY
    }

    /** Android 15+: a dataSync service ran out of time. Stop after the current item. */
    override fun onTimeout(startId: Int, fgsType: Int) {
        (application as ArcApp).controller.cancelTask()
        stopSelf()
    }

    override fun onDestroy() {
        scope.cancel()
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        super.onDestroy()
    }

    private fun notification(title: String, label: String, fraction: Double): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val cancel = PendingIntent.getService(
            this, 1, Intent(this, TransferService::class.java).setAction(ACTION_CANCEL),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(label)
            .setProgress(100, (fraction * 100).roundToInt(), false)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(open)
            .addAction(0, Strings.CANCEL, cancel)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    companion object {
        const val CHANNEL = "transfers"
        const val NOTIFICATION_ID = 133
        const val ACTION_CANCEL = "dev.arc.ep133.CANCEL"
    }
}
