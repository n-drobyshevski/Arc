package dev.arc.ep133.testing

import dev.arc.ep133.formats.Crc32
import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.protocol.Frame
import dev.arc.ep133.protocol.FrameCodec
import dev.arc.ep133.protocol.Packed7
import dev.arc.ep133.protocol.Transport
import dev.arc.ep133.util.decodeUtf8
import dev.arc.ep133.util.encodeUtf8
import dev.arc.ep133.util.sub
import dev.arc.ep133.util.u8
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.io.ByteArrayOutputStream

/** A sound to preload into the simulator. */
class MockSound(val slot: Int, val name: String, val pcm: ByteArray, val meta: Map<String, JsonElement> = emptyMap())

/**
 * A simulated EP-133 that speaks the FILE protocol as we understand it
 * (port of reference/test/mock-device.js). It is strict in the places real
 * hardware is known to be strict:
 *  - after a completed GET/PUT it ignores commands until FILE INIT is resent
 *  - list/metadata/data pages must be requested in order
 *
 * Kotlin-only additions for assertions: [metaWrites], and the knobs
 * [echoPagesBigEndian] and [corruptCrcUploads] used by the quirk tests.
 */
class MockEP133(
    sounds: List<MockSound> = emptyList(),
    projects: List<Pair<Int, ByteArray>> = emptyList(),
    var capacity: Long = 64L * 1024 * 1024,
    val ackChunks: Boolean = true,
    active: Int = 3000,
) {
    class Sound(val name: String, val pcm: ByteArray, val meta: LinkedHashMap<String, JsonElement>)

    private class Writing(
        val flags: Int, val node: Int, val parent: Int, val size: Long, val name: String,
        val meta: Map<String, JsonElement>, val chunks: MutableList<ByteArray> = ArrayList(), var next: Int = 0,
    )

    private class Reading(val data: ByteArray, var next: Int = 0, var offset: Int = 0)

    val sounds = LinkedHashMap<Int, Sound>()
    val projects = LinkedHashMap<Int, ByteArray>()
    val projectsMeta = LinkedHashMap<String, JsonElement>()
    var deviceId = 0x33
    var needsInit = false
    private var reading: Reading? = null
    private var writing: Writing? = null
    private var afterPut = false
    var dropped = 0
    val log = ArrayList<Int>()

    /** Every GET open, by node. */
    val opens = ArrayList<Int>()
    /** Every META set as (node, json text), in order. */
    val metaWrites = ArrayList<Pair<Int, String>>()
    /** Reply to data pages with a big-endian page echo (the download accepts either order). */
    var echoPagesBigEndian = false
    /** How many of the next sound uploads should report a wrong crc. */
    var corruptCrcUploads = 0
    /** Whether sound metadata includes a crc (real firmware is not confirmed to report one). */
    var reportCrc = true
    /** Ignore everything (to provoke timeouts). */
    var silent = false
    /** List /projects as empty (some firmware does), so the backup has to probe. */
    var hideProjectList = false
    /** Answer this many data pages with no data (and without advancing). */
    var emptyPages = 0

    private val out = Channel<ByteArray>(Channel.UNLIMITED)

    init {
        for (s in sounds) addSound(s.slot, s.name, s.pcm, s.meta)
        for ((n, tar) in projects) this.projects[n] = tar
        projectsMeta["active"] = JsJson.number(active)
    }

    fun addSound(slot: Int, name: String, pcm: ByteArray, meta: Map<String, JsonElement> = emptyMap()) {
        // { channels: 1, samplerate: 46875, format: 's16', ...meta, name, crc: crc32(pcm) }
        val m = LinkedHashMap<String, JsonElement>()
        m["channels"] = JsJson.number(1)
        m["samplerate"] = JsJson.number(46875)
        m["format"] = JsonPrimitive("s16")
        m.putAll(meta)
        m["name"] = JsonPrimitive(name)
        var crc = Crc32.of(pcm)
        if (corruptCrcUploads > 0) {
            corruptCrcUploads--
            crc = crc xor 1
        }
        if (reportCrc) m["crc"] = JsJson.number(crc)
        // Map.set on an existing slot keeps its position, like the JS Map.
        sounds[slot] = Sound(name, pcm, m)
    }

    val used: Long get() = sounds.values.sumOf { it.pcm.size.toLong() }

    /** Host-side transport. Messages are delivered asynchronously, like setTimeout(0) in the JS. */
    fun transport(scope: CoroutineScope): Transport = object : Transport {
        override fun send(bytes: ByteArray) {
            val copy = bytes.copyOf()
            scope.launch { receive(copy) }
        }

        override val incoming: Flow<ByteArray> = out.receiveAsFlow()
    }

    private fun emit(bytes: ByteArray) {
        out.trySend(bytes)
    }

    private fun reply(req: Frame, status: Int, payload: ByteArray = ByteArray(0)) {
        emit(responseFrame(deviceId, req.requestId, req.command, status, payload))
    }

    private fun rd16(d: ByteArray, i: Int) = (d.u8(i) shl 8) or d.u8(i + 1)
    private fun rd32(d: ByteArray, i: Int) = (d.u8(i).toLong() shl 24) + (d.u8(i + 1) shl 16) + (d.u8(i + 2) shl 8) + d.u8(i + 3)
    private fun rdU14(d: ByteArray, i: Int) = d.u8(i) or (d.u8(i + 1) shl 7)
    private fun be16(v: Int) = byteArrayOf((v shr 8).toByte(), v.toByte())
    private fun be32(v: Long) = byteArrayOf((v ushr 24).toByte(), (v ushr 16).toByte(), (v ushr 8).toByte(), v.toByte())
    private fun u14(v: Int) = byteArrayOf((v and 0x7F).toByte(), ((v shr 7) and 0x7F).toByte())

    fun receive(d: ByteArray) {
        if (silent) return
        if (d.u8(0) == 0xF0 && d.u8(1) == 0x7E && d.u8(3) == 0x06 && d.u8(4) == 0x01) {
            emit(intArrayOf(0xF0, 0x7E, deviceId, 0x06, 0x02, 0x00, 0x20, 0x76, 0x20, 0x00, 0x01, 0x00, 0, 0, 0, 0, 0xF7).let { a -> ByteArray(a.size) { a[it].toByte() } })
            return
        }
        val f = FrameCodec.decodeFrame(d)
        if (f == null || !f.isRequest) return
        val p = f.payload
        if (f.command == 1) {
            val text = "chip_id:0;mode:normal;os_version:2.0.5;product:EP-133;serial:MOCK0001;sku:TE032AS001;sw_version:2.0.5"
            reply(f, 0, encodeUtf8(text))
            return
        }
        if (f.command != 5) return reply(f, 2)
        val sub = p.u8(0)
        val isInit = sub == 1
        val isPutData = sub == 2 && p.u8(1) == 1
        if (needsInit && !isInit && !isPutData) {
            dropped++
            return
        }
        log.add(sub)
        // The barrier request after an upload is still answered, then the device
        // wants a re-init. (queueMicrotask in the JS: it runs after this reply is
        // delivered but before the host can send anything else.)
        var initAfterReply = false
        if (afterPut && sub != 11 && sub != 2) {
            afterPut = false
            initAfterReply = true
        }
        when (sub) {
            1 -> {
                needsInit = false
                reply(f, 0, byteArrayOf(0x00, 0x0C, 0x00, 0x00, 0x02, 0x00))
            }
            4 -> list(f, rd16(p, 1), rd16(p, 3))
            7 -> if (p.u8(1) == 2) getMeta(f, rd16(p, 2), rd16(p, 4)) else setMeta(f, rd16(p, 2), p.sub(4))
            3 -> if (p.u8(1) == 0) getOpen(f, rd16(p, 2)) else getData(f, rdU14(p, 2))
            2 -> if (p.u8(1) == 0) putOpen(f, p) else putData(f, rd16(p, 2), p.sub(4))
            11 -> reply(f, 0)
            else -> reply(f, 3)
        }
        if (initAfterReply) needsInit = true
    }

    private data class Node(val node: Int, val flags: Int, val size: Long, val name: String)

    private fun nodes(parent: Int): List<Node> = when (parent) {
        0 -> listOf(Node(1000, 0x0E, 0, "sounds"), Node(2000, 0x0E, 0, "projects"))
        1000 -> sounds.entries.sortedBy { it.key }.map { (slot, s) -> Node(slot, 0x05, s.pcm.size.toLong(), s.name) }
        2000 -> if (hideProjectList) emptyList() else projects.keys.sorted().map { n -> Node(3000 + (n - 1) * 1000, 0x06, 0, n.toString().padStart(2, '0')) }
        else -> emptyList()
    }

    private fun list(f: Frame, page: Int, parent: Int) {
        val all = nodes(parent)
        val per = 5
        val body = ByteArrayOutputStream()
        body.write(be16(page))
        for (e in all.drop(page * per).take(per)) {
            body.write(be16(e.node))
            body.write(e.flags)
            body.write(be32(e.size))
            body.write(encodeUtf8(e.name))
            body.write(0)
        }
        reply(f, 0, body.toByteArray())
    }

    private fun metaFor(node: Int): Map<String, JsonElement>? = when {
        node == 1000 -> linkedMapOf(
            "max_capacity" to JsJson.number(capacity),
            "free_space_in_bytes" to JsJson.number(capacity - used),
        )
        node == 2000 -> projectsMeta
        sounds.containsKey(node) -> sounds.getValue(node).meta
        else -> null
    }

    private fun getMeta(f: Frame, node: Int, page: Int) {
        val meta = metaFor(node) ?: return reply(f, 1, encodeUtf8("no such node"))
        val bytes = encodeUtf8(JsJson.stringify(JsonObject(meta))) + byteArrayOf(0)
        val per = 60
        reply(f, 0, be16(page) + bytes.sub(page * per, page * per + per))
    }

    private fun setMeta(f: Frame, node: Int, json: ByteArray) {
        val patch = JsJson.parseOrNull(decodeUtf8(json)) ?: return reply(f, 3)
        metaWrites.add(node to decodeUtf8(json))
        val obj = patch as? JsonObject ?: JsonObject(emptyMap()) // Object.assign ignores non-objects
        when {
            node == 2000 -> projectsMeta.putAll(obj)
            sounds.containsKey(node) -> sounds.getValue(node).meta.putAll(obj)
            else -> return reply(f, 1)
        }
        reply(f, 0)
    }

    private fun projectOf(node: Int): Int? =
        if ((node - 3000) % 1000 == 0) (node - 3000) / 1000 + 1 else null

    private fun getOpen(f: Frame, node: Int) {
        opens.add(node)
        val data: ByteArray
        val name: String
        val s = sounds[node]
        if (s != null) {
            data = s.pcm
            name = s.name
        } else {
            val n = projectOf(node)
            if (n == null || !projects.containsKey(n)) return reply(f, 1, encodeUtf8("not found"))
            data = projects.getValue(n)
            name = n.toString().padStart(2, '0')
        }
        reading = Reading(data)
        reply(f, 0, be16(node) + byteArrayOf(0x05) + be32(data.size.toLong()) + encodeUtf8(name) + byteArrayOf(0))
    }

    private fun getData(f: Frame, page: Int) {
        val r = reading
        if (r == null || page != r.next) return reply(f, 1)
        val per = 327
        val echo = if (echoPagesBigEndian) be16(page) else u14(page)
        r.next++
        if (emptyPages > 0) {
            // A page with no data: the host moves on to the next page number.
            emptyPages--
            return reply(f, 0, echo)
        }
        // The JS mock slices at page * per; a separate cursor gives the same
        // bytes and also works after an empty page.
        val chunk = r.data.sub(r.offset, r.offset + per)
        r.offset += chunk.size
        reply(f, 0, echo + chunk)
        if (r.offset >= r.data.size) {
            reading = null
            needsInit = true
        }
    }

    private fun putOpen(f: Frame, p: ByteArray) {
        val flags = p.u8(2)
        val node = rd16(p, 3)
        val parent = rd16(p, 5)
        val size = rd32(p, 7)
        var end = 11
        while (end < p.size && p[end].toInt() != 0) end++ // bounded, unlike the JS
        val name = decodeUtf8(p.sub(11, end))
        val json = p.sub(end + 1)
        val meta = if (json.isNotEmpty()) (JsJson.parse(decodeUtf8(json)) as? JsonObject ?: JsonObject(emptyMap())) else JsonObject(emptyMap())
        if (parent == 1000) {
            val existing = sounds[node]?.pcm?.size?.toLong() ?: 0L
            if (used - existing + size > capacity) return reply(f, 16, encodeUtf8("full"))
        }
        writing = Writing(flags, node, parent, size, name, meta)
        reply(f, 0)
    }

    private fun putData(f: Frame, idx: Int, data: ByteArray) {
        val w = writing
        if (w == null || idx != w.next) return reply(f, 1)
        w.next++
        if (data.isNotEmpty()) {
            w.chunks.add(data.copyOf())
            if (ackChunks) reply(f, 0)
            return
        }
        val total = w.chunks.sumOf { it.size }
        val buf = ByteArray(total)
        var o = 0
        for (c in w.chunks) {
            c.copyInto(buf, o)
            o += c.size
        }
        if (total.toLong() != w.size) {
            writing = null
            return reply(f, 1)
        }
        if (w.parent == 1000) addSound(w.node, w.name, buf, w.meta)
        else projects[(w.node - 3000) / 1000 + 1] = buf
        writing = null
        afterPut = true
        if (ackChunks) reply(f, 0)
    }
}
