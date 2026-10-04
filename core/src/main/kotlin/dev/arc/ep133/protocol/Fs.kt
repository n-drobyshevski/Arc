package dev.arc.ep133.protocol

import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.util.bytes
import dev.arc.ep133.util.decodeUtf8
import dev.arc.ep133.util.encodeUtf8
import dev.arc.ep133.util.sub
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.yield
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

// FILE sub-commands, all sent inside Cmd.FILE = 5 (fs.js).
//
//   INIT      [1, flags, be32 maxResponse]
//   PUT open  [2, 0, flags, be16 node, be16 parent, be32 size, name\0, json?]
//   PUT data  [2, 1, be16 index, ...bytes]          (empty data = end of file)
//   GET open  [3, 0, be16 node, be32 offset, 0]  -> [be16 node, flags, be32 size, name\0]
//   GET data  [3, 1, u14le page]                 -> [u14le page, ...bytes]
//   LIST      [4, be16 page, be16 node]          -> [be16 page, {be16 node, flags, be32 size, name\0}*]
//   META set  [7, 1, be16 node, json]
//   META get  [7, 2, be16 node, be16 page]       -> [be16 page, json chunk]
//   INFO      [11, be16 node]

data class ListEntry(val node: Int, val flags: Int, val size: Long, val name: String, val isDir: Boolean)

object Fs {
    private const val PUT = 2
    private const val GET = 3
    private const val LIST = 4
    private const val META = 7
    private const val INFO = 11

    const val PUT_FLAGS_SOUND = 0x05
    const val PUT_FLAGS_DIR = 0x06
    const val UPLOAD_CHUNK = 433
    const val MAX_METADATA_BYTES = 320

    private const val MAX_LIST_PAGES = 128
    private const val MAX_META_PAGES = 64

    /** No acks for this long while the window is full: give up windowing (see [upload]). */
    const val ACK_STALL_MS = 600L

    fun parseListPage(payload: ByteArray): List<ListEntry> {
        val entries = ArrayList<ListEntry>()
        var i = 2
        while (i + 7 <= payload.size) {
            val node = readBe16(payload, i)
            val flags = payload[i + 2].toInt() and 0xFF
            val size = readBe32(payload, i + 3)
            val (text, next) = readCString(payload, i + 7)
            if (next > payload.size + 1) break
            entries.add(ListEntry(node, flags, size, text, flags and 0x02 != 0))
            i = next
        }
        return entries
    }

    /** One LIST page. Also used as a barrier after uploads. */
    suspend fun listPage(session: Session, node: Int, page: Int = 0, timeout: Long = 3000, progress: Boolean = false): Frame =
        session.file(bytes(LIST, be16(page), be16(node)), timeout = timeout, label = "list $node", progress = progress)

    suspend fun listNode(session: Session, node: Int): List<ListEntry> {
        val all = ArrayList<ListEntry>()
        for (page in 0 until MAX_LIST_PAGES) {
            val res = session.file(bytes(LIST, be16(page), be16(node)), label = "list $node")
            if (res.payload.size < 2) return all
            val echo = readBe16(res.payload, 0)
            if (echo != page) throw DeviceError("List page mismatch (asked $page, got $echo)")
            val entries = parseListPage(res.payload)
            if (entries.isEmpty()) return all
            all.addAll(entries)
        }
        throw DeviceError("Listing node $node did not finish")
    }

    // The device sometimes leaves stray quotes inside string values.
    private val STRAY_QUOTES = Regex(":\"([^\"]*?)\"([^,}]*)")

    fun parseJsonLoose(text: String): JsonElement {
        val clean = text.trimEnd('\u0000')
        JsJson.parseOrNull(clean)?.let { return it }
        val repaired = STRAY_QUOTES.replace(clean) { m ->
            ":\"" + (m.groupValues[1] + m.groupValues[2]).replace("\"", "\\\"") + "\""
        }
        JsJson.parseOrNull(repaired)?.let { return it }
        throw DeviceError("Could not read device metadata: ${clean.take(60)}")
    }

    /**
     * A node's JSON metadata, or null if the device refuses page 0.
     * Note the result can be any JSON value; callers read it through `asObject()`.
     */
    suspend fun getMetadata(session: Session, node: Int): JsonElement? {
        var text = ""
        for (page in 0 until MAX_META_PAGES) {
            val res = session.file(
                bytes(META, 2, be16(node), be16(page)),
                label = "metadata $node",
                check = page > 0,
            )
            if (page == 0 && res.status != 0) return null
            if (res.payload.size < 2) break
            val echo = readBe16(res.payload, 0)
            if (echo != page) throw DeviceError("Metadata page mismatch (asked $page, got $echo)")
            val chunk = res.payload.sub(2)
            if (chunk.isEmpty()) break
            // Each page is decoded on its own, as the JS does.
            text += decodeUtf8(chunk)
            if (chunk[chunk.size - 1].toInt() == 0) break
            JsJson.parseOrNull(text)?.let { return it }
        }
        return if (text.isNotEmpty()) parseJsonLoose(text) else JsonObject(emptyMap())
    }

    /** Metadata writes are capped at 320 bytes of JSON. */
    suspend fun setMetadata(session: Session, node: Int, patch: JsonObject, timeout: Long = 3000, progress: Boolean = false): Frame {
        val json = encodeUtf8(JsJson.stringify(patch))
        if (json.size > MAX_METADATA_BYTES) {
            throw DeviceError("Metadata for node $node is too large (${json.size} bytes)")
        }
        return session.file(bytes(META, 1, be16(node), json), timeout = timeout, label = "set metadata $node", progress = progress)
    }

    /** The device drops the next command after a transfer unless we re-handshake. */
    private suspend fun reinit(session: Session, pending: Throwable?) {
        // Runs even while the caller is being cancelled, so the device is left usable.
        withContext(NonCancellable) {
            try {
                session.handshake()
            } catch (err: Throwable) {
                if (pending == null) throw err
            }
        }
    }

    /** Download a file node (a sound's PCM, or a project directory as a TAR). */
    suspend fun download(
        session: Session,
        node: Int,
        onProgress: ((got: Long, total: Long) -> Unit)? = null,
        signal: CancelSignal? = null,
    ): ByteArray = session.onLoop {
        signal.checkAbort()
        val init = session.file(bytes(GET, 0, be16(node), 0, 0, 0, 0, 0), timeout = 5000, label = "open $node")
        var pending: Throwable? = null
        try {
            if (init.payload.size < 7) throw DeviceError("Bad download header for node $node")
            val total = readBe32(init.payload, 3)
            if (total > 512L * 1024 * 1024) throw DeviceError("Implausible file size $total")
            val out = ByteArray(total.toInt())
            var got = 0
            var page = 0
            var empties = 0
            while (got < total) {
                if (page > 0x3FFF) throw DeviceError("File $node is larger than the transfer protocol allows")
                val res = session.file(
                    bytes(GET, 1, u14le(page)),
                    timeout = 4000,
                    check = false,
                    label = "read $node page $page",
                )
                if (res.status != 0 && res.payload.size < 2) {
                    throw DeviceError("Reading node $node failed at $got/$total bytes (status ${res.status})")
                }
                // Page numbers are 14-bit little-endian, but the echo is accepted in
                // either byte order. A short payload reads as 0 here, like the JS.
                val echoLe = readU14le(res.payload, 0)
                val echoBe = readBe16(res.payload, 0)
                if (echoLe != page && echoBe != page) {
                    throw DeviceError("Page mismatch reading node $node: asked $page, got $echoLe")
                }
                val data = res.payload.sub(2)
                if (data.isEmpty()) {
                    if (++empties >= 2) throw DeviceError("Device stopped sending node $node at $got/$total bytes")
                } else {
                    empties = 0
                }
                val take = minOf(data.size.toLong(), total - got).toInt()
                data.copyInto(out, got, 0, take)
                got += take
                page++
                onProgress?.invoke(got.toLong(), total)
            }
            out
        } catch (err: Throwable) {
            pending = err
            throw err
        } finally {
            reinit(session, pending)
        }
    }

    /**
     * Upload a file. Chunks are pipelined with a small window of unacknowledged
     * frames so a slow USB link is never flooded; if the device stops acking we
     * keep going and rely on the barrier request at the end.
     *
     * [barrier] is sent after the last chunk. It only returns once the device
     * has processed everything queued before it.
     */
    suspend fun upload(
        session: Session,
        node: Int,
        parent: Int,
        flags: Int,
        name: String,
        meta: JsonObject? = null,
        data: ByteArray,
        barrier: suspend () -> Unit,
        onProgress: ((got: Long, total: Long) -> Unit)? = null,
        window: Int = 16,
    ): Unit = session.onLoop {
        val nameBytes = encodeUtf8(name)
        val jsonBytes = if (meta != null) encodeUtf8(JsJson.stringify(meta)) else ByteArray(0)
        if (jsonBytes.size > MAX_METADATA_BYTES) throw DeviceError("Sound settings too large to upload")
        val chunks = (data.size + UPLOAD_CHUNK - 1) / UPLOAD_CHUNK
        if (chunks > 0xFFFF) throw DeviceError("File too large to upload")

        // The reply is not checked (check = false): if the device refuses the
        // file, the data chunks are rejected and that error is reported instead.
        session.file(
            bytes(PUT, 0, flags, be16(node), be16(parent), be32(data.size), nameBytes, 0, jsonBytes),
            timeout = 6000,
            check = false,
            label = "create $node",
        )

        var deviceError: DeviceError? = null
        var pending: Throwable? = null
        val inFlight = LinkedHashSet<Int>()
        try {
            var wake: (() -> Unit)? = null
            var acksSeen = 0
            var limit = window
            val onAck = { id: Int, f: Frame ->
                acksSeen++
                inFlight.remove(id)
                if (f.status > 0 && f.status < 64 && deviceError == null) {
                    val reason = decodeUtf8(f.payload).trimEnd('\u0000')
                    deviceError = DeviceError(
                        "Device rejected data for node $node" + if (reason.isNotEmpty()) ": $reason" else "",
                        f.status,
                    )
                }
                wake?.invoke()
            }
            suspend fun waitForRoom() {
                val room = CompletableDeferred<Unit>()
                wake = {
                    wake = null
                    room.complete(Unit)
                }
                val woke = withTimeoutOrNull(ACK_STALL_MS) { room.await() }
                if (woke == null) {
                    // No acks arriving. If none ever came, this firmware doesn't ack
                    // chunks at all: stop windowing and just stream.
                    for (id in inFlight) session.forgetAck(id)
                    inFlight.clear()
                    if (acksSeen == 0) limit = Int.MAX_VALUE
                }
            }

            for (idx in 0 until chunks) {
                deviceError?.let { throw it }
                while (inFlight.size >= limit) waitForRoom()
                val off = idx * UPLOAD_CHUNK
                val slice = data.sub(off, minOf(off + UPLOAD_CHUNK, data.size))
                // Acks cannot arrive before send() returns: they are dispatched on
                // this same loop, which is busy until the next suspension.
                var id = -1
                id = session.send(Cmd.FILE, bytes(PUT, 1, be16(idx), slice)) { f -> onAck(id, f) }
                inFlight.add(id)
                onProgress?.invoke(minOf(off + UPLOAD_CHUNK, data.size).toLong(), data.size.toLong())
                // Let queued acks dispatch now and then (setTimeout(0) in the JS).
                if (idx % 32 == 31) yield()
            }
            session.send(Cmd.FILE, bytes(PUT, 1, be16(chunks)))
            if (flags == PUT_FLAGS_SOUND) session.send(Cmd.FILE, bytes(INFO, be16(node)))
            barrier()
            for (id in inFlight) session.forgetAck(id)
            deviceError?.let { throw it }
        } catch (err: Throwable) {
            pending = err
            // Deviation from the JS (agreed): also forget in-flight ack handlers
            // on the error path, so a stale handler can never swallow a later
            // reply once the 12-bit request id wraps around.
            for (id in inFlight) session.forgetAck(id)
            throw err
        } finally {
            reinit(session, pending)
        }
    }

    /** Rethrows coroutine cancellation from a catch-all, like a JS catch never sees it. */
    internal fun rethrowIfCancelled(e: Throwable) {
        if (e is CancellationException) throw e
    }
}
