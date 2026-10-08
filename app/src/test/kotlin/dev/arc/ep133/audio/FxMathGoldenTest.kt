package dev.arc.ep133.audio

import dev.arc.ep133.formats.fx.DENORMAL
import dev.arc.ep133.formats.fx.Lcg
import dev.arc.ep133.formats.fx.PI_F
import dev.arc.ep133.formats.fx.clamp01
import dev.arc.ep133.formats.fx.flush
import dev.arc.ep133.formats.fx.knobHz
import dev.arc.ep133.formats.fx.lerp
import dev.arc.ep133.formats.fx.onePoleCoef
import dev.arc.ep133.formats.fx.parabolicSine
import dev.arc.ep133.formats.fx.semitoneRatio
import dev.arc.ep133.formats.fx.softClip
import dev.arc.ep133.formats.fx.svfG
import dev.arc.ep133.formats.fx.tanApprox
import dev.arc.ep133.formats.fx.triangle
import dev.arc.ep133.formats.fx.wrap01
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.fail
import org.junit.jupiter.api.Test
import java.io.File
import kotlin.random.Random

/**
 * The vectors the FX bus's arithmetic is checked against in its other ports
 * (an addition): each FxMath function over a sweep of inputs (edges, zeros
 * of either sign, values either side of the denormal flush and the clip's
 * knee, and random ones), the semitone table, and the Lcg's sequences from a
 * few seeds, written out with what each gave as float bits. The host test
 * (src/test/cpp/FxMathParityTest.cpp, run by `./gradlew test` through
 * :app:hostMixerTest) and the web test (web/test/core/formats/fx/fxMath.test.ts)
 * replay them through their ports and want the same bits.
 *
 * This test fails when the Kotlin functions no longer write the committed file
 * (src/test/cpp/fx-math.golden): after a deliberate change to them, write the
 * file again with `./gradlew :app:testDebugUnitTest -Parc.updateGolden=true`,
 * and change the C++ and web ports until their tests pass.
 */
class FxMathGoldenTest {
    @Test
    fun `the Kotlin FxMath still writes the committed vectors`() {
        val golden = File(System.getProperty("arc.fxMathGolden") ?: fail("arc.fxMathGolden not set"))
        val text = vectors()
        if (System.getProperty("arc.updateGolden") == "true") {
            golden.writeText(text)
            return
        }
        assertTrue(golden.exists()) { "$golden is missing: run ./gradlew :app:testDebugUnitTest -Parc.updateGolden=true" }
        if (golden.readText() != text) {
            fail<Unit>(
                "The Kotlin FxMath no longer gives what $golden holds. If that was meant, write it again with " +
                    "./gradlew :app:testDebugUnitTest -Parc.updateGolden=true and bring the C++ (src/main/cpp/fx/FxMath.h) " +
                    "and web (web/src/core/formats/fx/fxMath.ts) ports along.",
            )
        }
    }

    @Test
    fun `the constants are the frozen bits`() {
        assertEquals(0x40490fdb, PI_F.toRawBits())
        assertEquals(1f, semitoneRatio(0))
        assertEquals(2f, semitoneRatio(12))
        assertEquals(0.5f, semitoneRatio(-12))
    }

    private fun bits(v: Float): String = Integer.toHexString(v.toRawBits())

    private fun vectors(): String {
        val out = StringBuilder("# Written by FxMathGoldenTest from the Kotlin FxMath; replayed by FxMathParityTest.cpp and fxMath.test.ts. Do not edit.\n")
        // A line: the function, its arguments (floats as bits, ints in decimal), then what it gave.
        fun line(name: String, vararg args: Any, result: Float) {
            out.append(name)
            for (a in args) out.append(' ').append(if (a is Float) bits(a) else a.toString())
            out.append(' ').append(bits(result)).append('\n')
        }
        val random = Random(133)

        out.append("const DENORMAL ").append(bits(DENORMAL)).append('\n')
        out.append("const PI_F ").append(bits(PI_F)).append('\n')

        // Zeros of either sign, the smallest denormal, either side of the flush and of 0..1 and of the clip's knee, and far out.
        val edges = listOf(
            0f, -0f, Float.MIN_VALUE, -Float.MIN_VALUE, 1e-16f, -1e-16f, 9.9999e-16f, DENORMAL, -DENORMAL,
            Math.nextUp(DENORMAL), Math.nextDown(DENORMAL), 1e-14f, 1e-6f, 0.001f, 0.1f, 0.25f, 0.3f, 0.5f, 0.75f,
            Math.nextDown(1f), 1f, Math.nextUp(1f), 1.5f, 2f, Math.nextDown(3f), 3f, Math.nextUp(3f), 4f, 10f,
            1000f, 32767f, 32768f, -0.1f, -0.5f, -1f, -2f, -3f, Math.nextDown(-3f), -10f, -32768f, 1e30f, -1e30f,
        )
        val general = edges + List(64) { random.nextFloat() * 8f - 4f } + List(32) { random.nextFloat() * 65536f - 32768f }
        for (x in general) line("flush", x, result = flush(x))
        for (x in general) line("clamp01", x, result = clamp01(x))

        val lerps = listOf(Triple(0f, 1f, 0f), Triple(0f, 1f, 1f), Triple(-1f, 1f, 0.5f), Triple(3f, 3f, 0.7f), Triple(1f, 0f, 0.3f)) +
            List(64) { Triple(random.nextFloat() * 65536f - 32768f, random.nextFloat() * 65536f - 32768f, random.nextFloat()) }
        for ((a, b, t) in lerps) line("lerp", a, b, t, result = lerp(a, b, t))

        val rates = listOf(1000, 22050, 44100, 48000, 96000)
        for (ms in listOf(-1f, 0f, 0.5f, 1f, 2f, 5f, 10f, 20f, 30f, 40f, 60f, 100f, 600f, 1000f)) {
            for (rate in rates) line("onePoleCoef", ms, rate, result = onePoleCoef(ms, rate))
        }

        // Up to 0.4π, either sign, plus random ones in that reach.
        val ws = List(65) { it * (0.4f * PI_F) / 64f } + List(16) { -(it + 1) * 0.08f } + List(32) { (random.nextFloat() * 2f - 1f) * 1.25f }
        for (w in ws) line("tanApprox", w, result = tanApprox(w))

        for (hz in listOf(0f, 20f, 60f, 80f, 100f, 440f, 1000f, 4000f, 5000f, 8000f, 12000f, 18000f, 20000f, 30000f, 50000f)) {
            for (rate in rates) line("svfG", hz, rate, result = svfG(hz, rate))
        }

        val clips = general + List(65) { it * 0.125f - 4f }
        for (x in clips) line("softClip", x, result = softClip(x))

        val ranges = listOf(60f to 20000f, 20f to 8000f, 0.05f to 5f, 200f to 4000f, 80f to 20000f)
        val ks = List(33) { it / 32f } + List(8) { random.nextFloat() }
        for ((lo, hi) in ranges) for (k in ks) line("knobHz", k, lo, hi, result = knobHz(k, lo, hi))

        val phases = List(64) { it / 64f } + listOf(Math.nextDown(0.25f), Math.nextDown(0.5f), Math.nextDown(0.75f), Math.nextDown(1f)) +
            List(32) { random.nextFloat() }
        for (p in phases) line("triangle", p, result = triangle(p))
        for (p in phases) line("parabolicSine", p, result = parabolicSine(p))

        val wraps = List(49) { it / 16f - 1f } + listOf(Math.nextDown(0f), Math.nextDown(1f), Math.nextDown(2f), -1f) +
            List(32) { random.nextFloat() * 3f - 1f }
        for (p in wraps) line("wrap01", p, result = wrap01(p))

        for (n in -14..14) line("semitoneRatio", n, result = semitoneRatio(n))

        // Each seed's first states, then (from the seed again) its first numbers in 0..1.
        for (seed in listOf(0, 1, -1, 133, 12345, Int.MAX_VALUE, Int.MIN_VALUE, 0x7f3a9c21)) {
            val lcg = Lcg(seed)
            out.append("lcg ").append(seed).append(" 16")
            repeat(16) { out.append(' ').append(lcg.next()) }
            out.append('\n')
            val units = Lcg(seed)
            out.append("lcgunit ").append(seed).append(" 16")
            repeat(16) { out.append(' ').append(bits(units.unit())) }
            out.append('\n')
        }
        out.append("end\n")
        return out.toString()
    }
}
