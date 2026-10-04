package dev.arc.ep133.protocol

import dev.arc.ep133.util.decodeUtf8
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.CopyOnWriteArraySet
import kotlin.random.Random

/** What the device said about itself during the handshake. */
data class DeviceInfo(
    val product: String,
    val sku: String,
    val osVersion: String,
    val serial: String,
    val mode: String,
)

/**
 * Request/response session over any MIDI-like [Transport] (session.js).
 *
 * Threading: the JS runs on one event loop, and the upload window relies on
 * that (ack callbacks mutate the window between awaits). Here every piece of
 * session state lives on [loop], a dispatcher that never runs two tasks at
 * once. Public suspend functions hop onto it; [send] and [forgetAck] must be
 * called from code already running on it (fs.kt does that).
 */
class Session(
    private val transport: Transport,
    /** Must not run tasks in parallel. Tests pass a virtual-time test dispatcher. */
    val loop: CoroutineDispatcher = Dispatchers.Default.limitedParallelism(1),
    random: Random = Random.Default,
) {
    @Volatile
    var deviceId: Int = DEFAULT_DEVICE_ID
        private set

    @Volatile
    var info: DeviceInfo? = null
        private set

    // Starts at a random id, like the JS (Math.random() * 4096); the first id used is that + 1.
    private var id = random.nextInt(4096)
    private val waiters = HashMap<Int, Waiter>()
    private val ackHandlers = HashMap<Int, (Frame) -> Unit>()
    private var identityWaiter: CompletableDeferred<Identity>? = null
    private val pushListeners = CopyOnWriteArraySet<(Frame) -> Unit>()

    @Volatile
    private var closed = false

    private val job = SupervisorJob()
    private val scope = CoroutineScope(job + loop)
    private val collector: Job = scope.launch {
        transport.incoming.collect { dispatch(it) }
    }

    private class Waiter(val id: Int, val timeout: Long, val progress: Boolean, val label: String) {
        val result = CompletableDeferred<Frame>()
        var timer: Job? = null
    }

    val isClosed: Boolean get() = closed

    /** Runs [block] on the session's loop. Backup and restore run entirely inside this. */
    suspend fun <T> onLoop(block: suspend () -> T): T = withContext(loop) { block() }

    private fun nextId(): Int {
        id = (id + 1) % 4096
        return id
    }

    private fun startTimer(w: Waiter) {
        w.timer?.cancel()
        w.timer = scope.launch {
            delay(w.timeout)
            if (w.result.isCompleted) return@launch
            // JS deletes by key unconditionally; checking identity only avoids
            // removing a newer waiter that reused the id after a wrap.
            if (waiters[w.id] === w) waiters.remove(w.id)
            w.result.completeExceptionally(TimeoutError(w.label))
        }
    }

    private fun dispatch(d: ByteArray) {
        if (d.size >= 2 && d[0] == 0xF0.toByte() && d[1] == 0x7E.toByte()) {
            // Every universal non-realtime message is consumed here, even if it
            // is not an identity reply or nobody is waiting for one.
            val ident = FrameCodec.parseIdentity(d)
            val w = identityWaiter
            if (ident != null && w != null) {
                identityWaiter = null
                w.complete(ident)
            }
            return
        }
        val f = FrameCodec.decodeFrame(d) ?: return
        if (f.isRequest) {
            // Only unsolicited pushes (request flag, no id) reach listeners;
            // device-originated requests with an id are ignored.
            if (!f.hasId) for (cb in pushListeners) runCatching { cb(f) }
            return
        }
        // Fire-and-forget acks are matched before waiters and fire once.
        val ack = ackHandlers.remove(f.requestId)
        if (ack != null) {
            runCatching { ack(f) }
            return
        }
        val w = waiters[f.requestId] ?: return
        if (w.progress && f.status >= Status.SPECIFIC_SUCCESS_START) {
            // Intermediate progress: keep waiting, restart the full timeout.
            startTimer(w)
            return
        }
        w.timer?.cancel()
        waiters.remove(f.requestId)
        w.result.complete(f)
    }

    /** Listen for unsolicited device pushes (file added / deleted / metadata changed). */
    fun onPush(cb: (Frame) -> Unit): () -> Unit {
        pushListeners.add(cb)
        return { pushListeners.remove(cb) }
    }

    /**
     * Send a request and wait for its reply.
     * With [check], a non-zero status throws a [DeviceError] naming the request.
     * With [progress], statuses of 64 and up are "still working" and restart the timeout.
     */
    suspend fun request(
        command: Int,
        payload: ByteArray = ByteArray(0),
        timeout: Long = 3000,
        check: Boolean = true,
        label: String? = null,
        progress: Boolean = false,
    ): Frame = withContext(loop) {
        if (closed) throw DeviceError("Not connected")
        val reqId = nextId()
        val name = label ?: "cmd $command"
        val frame = FrameCodec.encodeRequest(deviceId, reqId, command, payload)
        val w = Waiter(reqId, timeout, progress, name)
        // Register before sending so the reply can never arrive first.
        waiters[reqId] = w
        startTimer(w)
        try {
            transport.send(frame)
        } catch (e: Throwable) {
            if (waiters[reqId] === w) waiters.remove(reqId)
            w.timer?.cancel()
            throw e
        }
        val f = try {
            w.result.await()
        } catch (c: CancellationException) {
            if (waiters[reqId] === w) waiters.remove(reqId)
            w.timer?.cancel()
            throw c
        }
        if (check && f.status != Status.OK) {
            val reason = decodeUtf8(f.payload).trimEnd('\u0000')
            throw DeviceError(
                "$name failed: ${FrameCodec.statusText(f.status)}" + if (reason.isNotEmpty()) " ($reason)" else "",
                f.status,
            )
        }
        f
    }

    /**
     * Fire a request without waiting; [onAck] runs if the device answers it.
     * Must be called on [loop]. Like the JS it does not check whether the session is closed.
     */
    fun send(command: Int, payload: ByteArray = ByteArray(0), onAck: ((Frame) -> Unit)? = null): Int {
        val reqId = nextId()
        if (onAck != null) ackHandlers[reqId] = onAck
        transport.send(FrameCodec.encodeRequest(deviceId, reqId, command, payload))
        return reqId
    }

    /** Must be called on [loop]. */
    fun forgetAck(reqId: Int) {
        ackHandlers.remove(reqId)
    }

    suspend fun file(
        payload: ByteArray,
        timeout: Long = 3000,
        check: Boolean = true,
        label: String? = null,
        progress: Boolean = false,
    ): Frame = request(Cmd.FILE, payload, timeout, check, label, progress)

    /** Universal identity request. Resolves null on timeout instead of failing. */
    private suspend fun identify(timeout: Long = 1500): Identity? {
        val d = CompletableDeferred<Identity>()
        identityWaiter = d
        transport.send(IDENTITY_REQUEST)
        val r = withTimeoutOrNull(timeout) { d.await() }
        if (identityWaiter === d) identityWaiter = null
        return r
    }

    /**
     * Identity → GREET → FILE INIT. Also required after every completed file
     * transfer, otherwise the device drops the next command.
     */
    suspend fun handshake(): DeviceInfo = withContext(loop) {
        val ident = identify()
        // A device that does not answer identity keeps the previous device id.
        if (ident != null) deviceId = ident.deviceId
        val greet = request(Cmd.GREET, timeout = 3000, label = "greet")
        val meta = FrameCodec.parseGreet(decodeUtf8(greet.payload))
        file(byteArrayOf(FILE_INIT.toByte(), FILE_INIT_SUBSCRIBE.toByte()) + be32(MAX_RESPONSE), label = "file init")
        val i = DeviceInfo(
            product = meta["product"].orEmpty().ifEmpty { "EP" },
            sku = meta["sku"].orEmpty().ifEmpty { ident?.sku.orEmpty() },
            osVersion = meta["os_version"].orEmpty().ifEmpty { meta["sw_version"].orEmpty() },
            serial = meta["serial"].orEmpty(),
            mode = meta["mode"].orEmpty(),
        )
        info = i
        i
    }

    /**
     * Rejects everything pending with "Disconnected" and closes the transport.
     * Safe to call from any thread (for example a MIDI device callback).
     */
    fun close() {
        if (closed) return
        closed = true
        scope.launch {
            for (w in waiters.values) {
                w.timer?.cancel()
                w.result.completeExceptionally(DeviceError("Disconnected"))
            }
            waiters.clear()
            ackHandlers.clear()
            collector.cancel()
            runCatching { transport.close() }
            job.cancel()
        }
    }

    private companion object {
        const val FILE_INIT = 1
        const val FILE_INIT_SUBSCRIBE = 1
        const val MAX_RESPONSE = 4L * 1024 * 1024
    }
}
