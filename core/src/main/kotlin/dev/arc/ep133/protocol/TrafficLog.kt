package dev.arc.ep133.protocol

import dev.arc.ep133.util.toHex
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.onEach
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Raw SysEx in and out, for the hidden debug screen. Nobody has run arc on
 * real hardware yet; this log is how the first run gets debugged.
 * Keeps the most recent [capacity] messages.
 */
class TrafficLog(private val capacity: Int = 5000, private val clock: () -> Long = System::currentTimeMillis) {
    enum class Dir { OUT, IN, NOTE }

    class Entry(val time: Long, val dir: Dir, val bytes: ByteArray, val note: String? = null)

    private val entries = ArrayDeque<Entry>()
    private var droppedCount = 0L
    private val _version = MutableStateFlow(0L)

    /** Changes whenever the log does (for UIs to observe). */
    val version: StateFlow<Long> = _version

    @Volatile
    var enabled: Boolean = true

    fun out(bytes: ByteArray) = add(Entry(clock(), Dir.OUT, bytes.copyOf()))
    fun inbound(bytes: ByteArray) = add(Entry(clock(), Dir.IN, bytes.copyOf()))
    fun note(text: String) = add(Entry(clock(), Dir.NOTE, ByteArray(0), text), force = true)

    private fun add(e: Entry, force: Boolean = false) {
        if (!enabled && !force) return
        synchronized(entries) {
            entries.addLast(e)
            while (entries.size > capacity) {
                entries.removeFirst()
                droppedCount++
            }
        }
        _version.value = _version.value + 1
    }

    fun snapshot(): List<Entry> = synchronized(entries) { entries.toList() }

    val size: Int get() = synchronized(entries) { entries.size }

    fun clear() {
        synchronized(entries) {
            entries.clear()
            droppedCount = 0
        }
        _version.value = _version.value + 1
    }

    /** A plain text export: one message per line, full hex, with a short decoded summary. */
    fun export(header: List<String> = emptyList(), zone: ZoneId = ZoneId.systemDefault()): String {
        val fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS").withZone(zone)
        val sb = StringBuilder()
        sb.append("arc SysEx log\n")
        for (h in header) sb.append(h).append('\n')
        val list: List<Entry>
        val dropped: Long
        synchronized(entries) {
            list = entries.toList()
            dropped = droppedCount
        }
        if (dropped > 0) sb.append("(").append(dropped).append(" older messages not kept)\n")
        sb.append('\n')
        for (e in list) {
            sb.append(fmt.format(Instant.ofEpochMilli(e.time))).append("  ")
            when (e.dir) {
                Dir.NOTE -> sb.append("--   ").append(e.note)
                else -> {
                    sb.append(if (e.dir == Dir.OUT) "OUT  " else "IN   ")
                    sb.append(describe(e.bytes)).append("  ").append(e.bytes.toHex())
                }
            }
            sb.append('\n')
        }
        return sb.toString()
    }

    companion object {
        private val FILE_SUBS = mapOf(1 to "init", 2 to "put", 3 to "get", 4 to "list", 7 to "meta", 11 to "info")

        /** A short human summary of a message: "[len] FILE list id=123 status=0". */
        fun describe(b: ByteArray): String {
            val head = "[${b.size}]"
            if (b.size >= 2 && b[0] == 0xF0.toByte() && b[1] == 0x7E.toByte()) {
                return if (FrameCodec.parseIdentity(b) != null) "$head identity reply" else "$head universal"
            }
            val f = FrameCodec.decodeFrame(b) ?: return "$head ?"
            val cmd = when (f.command) {
                Cmd.GREET -> "GREET"
                Cmd.FILE -> "FILE " + (FILE_SUBS[f.payload.firstOrNull()?.toInt()?.and(0xFF) ?: -1] ?: "?")
                else -> "cmd ${f.command}"
            }
            val id = if (f.hasId) " id=${f.requestId}" else " push"
            val st = if (f.isRequest) "" else " status=${f.status}"
            return "$head $cmd$id$st"
        }
    }
}

/** Wraps a transport so everything sent and received is recorded in [log]. */
class LoggingTransport(private val inner: Transport, private val log: TrafficLog) : Transport {
    override fun send(bytes: ByteArray) {
        log.out(bytes)
        inner.send(bytes)
    }

    override val incoming: Flow<ByteArray> = inner.incoming.onEach { log.inbound(it) }

    override fun close() {
        log.note("transport closed")
        inner.close()
    }
}
