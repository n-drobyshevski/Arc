package dev.arc.ep133.protocol

import dev.arc.ep133.testing.FixedRandom
import dev.arc.ep133.testing.ScriptedTransport
import dev.arc.ep133.testing.hex
import dev.arc.ep133.util.encodeUtf8
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class SessionTest {
    private fun TestScope.session(
        first: Int = 4094,
        respond: suspend ScriptedTransport.(ByteArray) -> Unit,
    ): Pair<Session, ScriptedTransport> {
        val t = ScriptedTransport(this, respond)
        return Session(t, StandardTestDispatcher(testScheduler), FixedRandom(first)) to t
    }

    private fun idOf(frame: ByteArray) = FrameCodec.decodeFrame(frame)!!.requestId

    @Test
    fun `request ids are 12 bit and wrap after 4095`() = runTest {
        val (s, t) = session(first = 4094) { reply(it, 0) }
        s.request(1)
        s.request(1)
        assertEquals(listOf(4095, 0), t.sent.map(::idOf))
        // bytes 6 and 7 carry the id: 0x40|0x20|(4095>>7) and 4095&0x7f
        assertEquals(0x7F, t.sent[0][6].toInt() and 0xFF)
        assertEquals(0x7F, t.sent[0][7].toInt() and 0xFF)
        s.close()
    }

    @Test
    fun `replies are matched by request id`() = runTest {
        val (s, _) = session { req ->
            val id = idOf(req)
            // A reply for some other id first; it must be ignored.
            emit(dev.arc.ep133.testing.responseFrame(0x33, (id + 7) % 4096, 5, 1))
            reply(req, 0, byteArrayOf(9))
        }
        val f = s.request(5, byteArrayOf(4, 0, 0, 0, 0))
        assertEquals(0, f.status)
        assertEquals(9, f.payload[0].toInt())
        s.close()
    }

    @Test
    fun `fire-and-forget acks run once`() = runTest {
        val (s, t) = session { req ->
            reply(req, 0)
            reply(req, 0)
        }
        var acks = 0
        s.onLoop { s.send(5, byteArrayOf(2, 1, 0, 0)) { acks++ } }
        advanceUntilIdle()
        assertEquals(1, acks)
        assertEquals(1, t.sent.size)
        s.close()
    }

    @Test
    fun `a progress status restarts the timeout`() = runTest {
        val (s, _) = session { req ->
            delay(800); reply(req, 64)
            delay(800); reply(req, 65)
            delay(800); reply(req, 0)
        }
        val start = currentTime
        val f = s.request(5, timeout = 1000, progress = true, label = "barrier")
        assertEquals(0, f.status)
        assertEquals(2400, currentTime - start)
        s.close()
    }

    @Test
    fun `without progress a status of 64 or more is final`() = runTest {
        val (s, _) = session { reply(it, 64) }
        val e = assertThrows<DeviceError> { s.request(5, label = "x") }
        assertEquals("x failed: in progress", e.message)
        s.close()
    }

    @Test
    fun `a missing reply times out with the JS message`() = runTest {
        val (s, _) = session { }
        val e = assertThrows<TimeoutError> { s.request(1, label = "greet") }
        assertEquals("The device did not answer (greet). Check the cable and try again.", e.message)
        assertEquals(3000, currentTime)
        s.close()
    }

    @Test
    fun `a failure status carries the device reason`() = runTest {
        val (s, _) = session { reply(it, 1, encodeUtf8("nope") + byteArrayOf(0, 0)) }
        val e = assertThrows<DeviceError> { s.request(5, label = "list 1000") }
        assertEquals("list 1000 failed: error (nope)", e.message)
        assertEquals(1, e.status)
        val e2 = assertThrows<DeviceError> { session { reply(it, 17) }.first.request(5) }
        assertEquals("cmd 5 failed: device error 17", e2.message)
        s.close()
    }

    @Test
    fun `check false returns any status`() = runTest {
        val (s, _) = session { reply(it, 2) }
        assertEquals(2, s.request(5, check = false).status)
        s.close()
    }

    @Test
    fun `close rejects pending requests and later ones`() = runTest {
        val (s, t) = session { }
        val pending = async { runCatching { s.request(1, label = "greet") } }
        testScheduler.advanceTimeBy(10)
        s.close()
        val r = pending.await()
        assertEquals("Disconnected", r.exceptionOrNull()?.message)
        val e = assertThrows<DeviceError> { s.request(1) }
        assertEquals("Not connected", e.message)
        assertTrue(t.closed)
    }

    @Test
    fun `handshake sends identity, greet and file init and applies fallbacks`() = runTest {
        val (s, t) = session { req ->
            if (req[1] == 0x7E.toByte()) {
                emit(hex("F0 7E 21 06 02 00 20 76 20 00 01 00 00 00 00 00 F7"))
                return@session
            }
            val f = FrameCodec.decodeFrame(req)!!
            if (f.command == 1) reply(req, 0, encodeUtf8("product:;sw_version:1.2;serial:X1;mode:normal") + byteArrayOf(0))
            else reply(req, 0)
        }
        val info = s.handshake()
        assertEquals(DeviceInfo(product = "EP", sku = "TE032AS001", osVersion = "1.2", serial = "X1", mode = "normal"), info)
        assertEquals(0x21, s.deviceId)
        assertEquals(3, t.sent.size)
        assertEquals("F0 7E 7F 06 01 F7", t.sent[0].joinToString(" ") { "%02X".format(it) })
        // FILE INIT payload 01 01 00 40 00 00, sent to the device id learnt from identity
        val init = FrameCodec.decodeFrame(t.sent[2])!!
        assertEquals(0x21, init.deviceId)
        assertEquals(listOf(1, 1, 0, 0x40, 0, 0), init.payload.map { it.toInt() and 0xFF })
        s.close()
    }

    @Test
    fun `handshake tolerates a device that ignores identity`() = runTest {
        val (s, _) = session { req ->
            if (req[1] == 0x7E.toByte()) return@session
            val f = FrameCodec.decodeFrame(req)!!
            if (f.command == 1) reply(req, 0, encodeUtf8("product:EP-133;os_version:2.0.5;sku:TE032AS001"))
            else reply(req, 0)
        }
        val info = s.handshake()
        assertEquals("EP-133", info.product)
        assertEquals("2.0.5", info.osVersion)
        assertEquals(0x33, s.deviceId)
        s.close()
    }

    @Test
    fun `unrelated messages are ignored`() = runTest {
        val (s, _) = session { req ->
            emit(hex("90 3C 7F")) // note on
            emit(hex("F0 41 10 42 12 F7")) // other manufacturer
            emit(hex("F0 7E 7F 09 01 F7")) // universal non-identity
            reply(req, 0)
        }
        assertEquals(0, s.request(5).status)
        s.close()
    }

    @Test
    fun `nothing is delivered after close`() = runTest {
        val (s, t) = session { }
        val pending = async { runCatching { s.request(5, label = "x") } }
        testScheduler.advanceTimeBy(10)
        // A reply that arrives after close() must not resolve the request.
        val req = t.sent.last()
        s.close()
        t.reply(req, 0)
        assertEquals("Disconnected", pending.await().exceptionOrNull()?.message)
    }

    @Test
    fun `a timed out request removes its id even if a newer request reused it`() = runTest {
        // JS deletes the waiter by id. With the id wrapped, the older request's
        // timeout also drops the newer one, whose reply is then ignored.
        val (s, t) = session(first = 9) { }
        val old = async { runCatching { s.request(5, timeout = 100, label = "old") } } // id 10
        testScheduler.advanceTimeBy(1)
        // Use up the other 4095 ids so the next request gets id 10 again.
        s.onLoop { repeat(4095) { s.send(11) } }
        val young = async { runCatching { s.request(5, timeout = 300, label = "young") } } // id 10 again
        testScheduler.advanceTimeBy(150)
        assertEquals(10, idOf(t.sent.last()))
        t.reply(t.sent.last(), 0)
        assertEquals("The device did not answer (old). Check the cable and try again.", old.await().exceptionOrNull()?.message)
        assertEquals("The device did not answer (young). Check the cable and try again.", young.await().exceptionOrNull()?.message)
        s.close()
    }

    @Test
    fun `a throwing push listener stops the rest for that frame`() = runTest {
        val (s, t) = session { }
        val calls = ArrayList<String>()
        s.onPush { calls.add("a"); error("boom") }
        s.onPush { calls.add("b") }
        t.emit(hex("F0 00 20 76 33 40 40 00 05 00 07 F7"))
        testScheduler.advanceUntilIdle()
        assertEquals(listOf("a"), calls)
        s.close()
    }
}
