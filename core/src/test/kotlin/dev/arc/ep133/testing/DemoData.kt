package dev.arc.ep133.testing

import dev.arc.ep133.formats.JsJson
import dev.arc.ep133.util.jsRound
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Small, deterministic device contents for the simulator (port of reference/test/demo-data.js). */
object DemoData {
    /** A decaying sine. StrictMath is fdlibm, the same family V8's Math.sin/exp come from. */
    fun tone(frames: Int, freq: Int, channels: Int = 1): ByteArray {
        val b = ByteBuffer.allocate(frames * channels * 2).order(ByteOrder.LITTLE_ENDIAN)
        for (i in 0 until frames) {
            val v = jsRound(StrictMath.sin((i.toDouble() * freq * 2 * Math.PI) / 46875) * 12000 * StrictMath.exp(-i / (frames / 3.0))).toInt()
            for (c in 0 until channels) b.putShort(v.toShort())
        }
        return b.array()
    }

    val NAMES = listOf("kick", "snare", "hat closed", "hat open", "clap", "rim", "tom low", "perc", "bass c1", "vox chop", "stab", "riser")

    fun sounds(): List<MockSound> = NAMES.mapIndexed { i, name ->
        MockSound(
            slot = if (i < 8) i + 1 else 100 + i,
            name = name,
            pcm = tone(4000 + i * 1500, 60 + i * 40, if (i == 9) 2 else 1),
            meta = if (i == 9) mapOf("channels" to JsJson.number(2)) else emptyMap(),
        )
    }

    fun projects(sounds: List<MockSound> = sounds()): List<Pair<Int, ByteArray>> = listOf(1, 2, 5).mapIndexed { k, n ->
        val pads = sounds.drop(k * 3).take(5).mapIndexed { j, s ->
            "pads/${"abcd"[j % 4]}/p${(j + 1).toString().padStart(2, '0')}" to pad(s.slot)
        }
        n to tarFile(pads + ("settings" to ByteArray(222)))
    }

    fun device(): MockEP133 {
        val s = sounds()
        return MockEP133(sounds = s, projects = projects(s), capacity = 64L * 1024 * 1024)
    }
}
