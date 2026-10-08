package dev.arc.ep133.formats.fx

/**
 * The punch-in effects (the EP-133's FX + pad), on the whole mix after the
 * master effect: twelve slots ([FxControl.PITCH_RANDOM] to
 * [FxControl.DECIMATOR]), each held at a depth 0..1 while its pad is. A slot
 * fades in over 5 ms when it is pressed (an addition) and crossfades back out
 * to what it was given over 5 ms when it is let go of. Any of them can be
 * held at once; they play one after another, in [ORDER]:
 *
 * - the ones that replay the mix first, as they replace it: STUTTER loops
 *   the last 20 to 80 ms (by the depth) before its press; BEAT_REPEAT loops
 *   the last quarter, eighth, 16th or 32nd note (by the depth's quarters,
 *   held to a second); TAPE_STOP slows the mix from its press to a stop
 *   over 1.5 down to 0.3 s (by the depth), its pitch falling with it, then
 *   holds silence. These three read a 2 s stereo history of the mix (before
 *   the punch-ins), written every block ([record]). The loops play their
 *   slice out of the history the first time round, copying it as they go,
 *   and from their copy after, so they can be held for as long as wanted.
 *   Two of them held at once: the later one plays over the earlier;
 * - then the pitch shifters, on what comes to them: PITCH_RANDOM moves the
 *   pitch to a random step each beat (1 to 12 semitones either way, the
 *   most by the depth, from [Lcg]: the same each time); OCTAVE_DOWN an
 *   octave down, mixed in by the depth. Each is a granular shifter: two
 *   heads read a 50 ms line of its input, gliding through it at the new
 *   speed, each faded in and out by a triangle window half a window apart
 *   from the other, so the two always add up to one;
 * - then the ones that work sample by sample: SLICE gates each 16th note,
 *   open for 1 - 0.8 of the depth of it, with 2 ms edges; FILTER_LFO a
 *   band-pass sweeping 200 Hz to 4 kHz and back once a beat (along a
 *   triangle, on a square curve), its Q 1 to 8 by the depth; LPF a low-pass
 *   from 20 kHz down to 80 Hz, HPF a high-pass from 20 Hz up to 6 kHz (by
 *   the depth, on [knobHz]'s curve); TREMOLO a 16th-note [parabolicSine]
 *   swell, down to 1 - the depth; DECIMATOR holds every 1st to 16th sample
 *   and truncates it to 16 down to 4 bits (by the depth).
 *
 * SEND_FX does nothing here: [sendBoost] raises every group's send to its
 * depth, through the bus.
 *
 * The replays catch their slice, the tape its speed and the shifter its
 * first step at the press; the rest follow the depth as it moves, a block
 * at a time. The synced ones start their cycle at the press (the mixer has
 * no bar to line them up with). What a slot plays doesn't depend on how the
 * blocks are cut: the filter LFO's cutoff moves every [LFO_TICK] frames, and
 * the beats and cycles are counted in frames. The processing order (the
 * replays first, so a filter or the gate works on the loop) and the press's
 * fade are additions.
 *
 * Every step is one Float operation in the order written: the C++
 * (app/src/main/cpp/fx/Punch.h) and web (web/src/core/formats/fx/punch.ts)
 * ports do the same, and VoiceMixerGoldenTest's punch-in scenarios hold them
 * to it.
 */
class Punch(val outRate: Int) {
    companion object {
        /** The slots in the order they play. */
        val ORDER = intArrayOf(
            FxControl.STUTTER, FxControl.BEAT_REPEAT, FxControl.TAPE_STOP, FxControl.PITCH_RANDOM, FxControl.OCTAVE_DOWN,
            FxControl.SLICE, FxControl.FILTER_LFO, FxControl.LPF, FxControl.HPF, FxControl.TREMOLO, FxControl.DECIMATOR,
        )
        /** How much of the mix the history keeps. */
        const val HISTORY_SECONDS = 2
        /** A slot's fade in and out. */
        const val FADE_MS = 5
        /** The stutter's loop at depth 0, and what depth 1 adds to it. */
        const val STUTTER_MS = 20f
        const val STUTTER_MS_RANGE = 60f
        /** The beat repeat's longest loop. */
        const val REPEAT_SECONDS = 1
        /** The tape's stop at depth 0, and what depth 1 takes off it. */
        const val TAPE_SECONDS = 1.5f
        const val TAPE_SECONDS_RANGE = 1.2f
        /** The pitch shifters' window. */
        const val GRAIN_MS = 50
        /** The pitch shifter's seed: its steps are the same each time. */
        const val SEED = 133
        /** How much of each 16th the slice's gate closes at depth 1, and its edges. */
        const val SLICE_CLOSE = 0.8f
        const val SLICE_EDGE_MS = 2
        /** The filter LFO's sweep, its Q at depth 0 and what depth 1 adds, and the frames between cutoffs. */
        const val LFO_FROM = 200f
        const val LFO_TO = 4000f
        const val LFO_Q = 1f
        const val LFO_Q_RANGE = 7f
        const val LFO_TICK = 16
        /** The low-pass's cutoff at depth 1 and 0, the high-pass's at 0 and 1, both at Q 1/√2. */
        const val LPF_FROM = 80f
        const val LPF_TO = 20000f
        const val HPF_FROM = 20f
        const val HPF_TO = 6000f
        const val BUTTERWORTH = 0.70710677f
        /** The decimator's hold at depth 1 (less the one frame at 0), and the bits it takes off. */
        const val DECIMATE_HOLD = 15f
        const val DECIMATE_BITS = 12f
        /** What the decimator truncates is held to this first, so it is an Int in every port. */
        private const val BIG = 1e9f
    }

    /** The history: the mix before the punch-ins, stereo, the next block going in at [head]. */
    private val historySize = HISTORY_SECONDS * outRate
    private val history = FloatArray(historySize * 2)
    private var head = 0

    private val depths = FloatArray(FxControl.SLOTS)
    private val held = BooleanArray(FxControl.SLOTS)
    /** Pressed from silence: it starts at the next [process]. */
    private val fresh = BooleanArray(FxControl.SLOTS)
    /** Each slot's fade, 0 (out) to [fadeFrames] (all in). */
    private val ramps = IntArray(FxControl.SLOTS)
    private val fadeFrames = maxOf(1, FADE_MS * outRate / 1000)
    private val fadeStep = 1f / fadeFrames.toFloat()
    private var bpm = FxBus.BPM_DEFAULT

    private val stutter = Loop((STUTTER_MS + STUTTER_MS_RANGE).toInt() * outRate / 1000 + 1)
    private val repeat = Loop(REPEAT_SECONDS * outRate)

    private var tapeAt = 0
    private var tapeFrames = 1
    private var tapeStep = 1f
    private var tapeLag = 0f

    private val pitch = Shifter(outRate)
    private val octave = Shifter(outRate)
    private var lcg = Lcg(SEED)
    private var beatAt = 0

    private val sliceEdge = maxOf(1, SLICE_EDGE_MS * outRate / 1000)
    private var slicePhase = 0f

    private val lfoL = Svf()
    private val lfoR = Svf()
    private var lfoPhase = 0f
    private var lfoTick = 0
    private var lfoGain = 1f

    private val lpL = Svf()
    private val lpR = Svf()
    private val hpL = Svf()
    private val hpR = Svf()

    private var tremoloPhase = 0f

    private var decimateAt = 0
    private var decimateL = 0f
    private var decimateR = 0f

    /** Whether a slot is held or still fading out: the bus calls [process] only then. */
    val active: Boolean
        get() {
            for (slot in ORDER) if (held[slot] || ramps[slot] > 0) return true
            return false
        }

    /** Holds [slot] at [depth] (0..1); 0 lets go of it. */
    fun set(slot: Int, depth: Float) {
        if (slot !in 0 until FxControl.SLOTS) return
        val d = clamp01(depth)
        if (d > 0f) {
            if (!held[slot] && ramps[slot] == 0) fresh[slot] = true
            held[slot] = true
            depths[slot] = d
        } else {
            // The depth stays, for the fade out.
            held[slot] = false
        }
    }

    /** The tempo the synced slots follow, in BPM. */
    fun setTempo(bpm: Float) {
        this.bpm = bpm
    }

    /** SEND_FX's depth: every group's send is at least this while it is held. */
    fun sendBoost(): Float = if (held[FxControl.SEND_FX]) depths[FxControl.SEND_FX] else 0f

    /** Writes [mix] (stereo, interleaved, [frames] long, before the punch-ins) into the history; every block. */
    fun record(mix: FloatArray, frames: Int) {
        var from = 0
        var left = frames
        while (left > 0) {
            val n = minOf(left, historySize - head)
            System.arraycopy(mix, from * 2, history, head * 2, n * 2)
            head += n
            if (head == historySize) head = 0
            from += n
            left -= n
        }
    }

    /** Plays the held slots over [mix] (stereo, interleaved, [frames] long, just [record]ed), in place. */
    fun process(mix: FloatArray, frames: Int) {
        if (frames <= 0) return
        // The history's frame for the block's first.
        var s = (head - frames) % historySize
        if (s < 0) s += historySize
        for (slot in ORDER) {
            val on = held[slot]
            val r0 = ramps[slot]
            if (!on && r0 == 0) continue
            if (fresh[slot]) {
                start(slot, s)
                fresh[slot] = false
            }
            // Let go of: until its fade is out.
            val n = if (on) frames else minOf(frames, r0 - 1)
            when (slot) {
                FxControl.STUTTER -> loop(stutter, mix, n, on, r0)
                FxControl.BEAT_REPEAT -> loop(repeat, mix, n, on, r0)
                FxControl.TAPE_STOP -> tape(mix, n, s, on, r0)
                FxControl.PITCH_RANDOM -> pitchRandom(mix, n, on, r0)
                FxControl.OCTAVE_DOWN -> octaveDown(mix, n, on, r0)
                FxControl.SLICE -> slice(mix, n, on, r0)
                FxControl.FILTER_LFO -> filterLfo(mix, n, on, r0)
                FxControl.LPF -> pass(lpL, lpR, false, mix, n, on, r0)
                FxControl.HPF -> pass(hpL, hpR, true, mix, n, on, r0)
                FxControl.TREMOLO -> tremolo(mix, n, on, r0)
                FxControl.DECIMATOR -> decimate(mix, n, on, r0)
            }
            ramps[slot] = if (on) minOf(fadeFrames, r0 + frames) else maxOf(0, r0 - frames)
        }
    }

    /** Every slot let go of at once, the history silent. */
    fun reset() {
        depths.fill(0f)
        held.fill(false)
        fresh.fill(false)
        ramps.fill(0)
        history.fill(0f)
        head = 0
        lcg = Lcg(SEED)
    }

    /** [slot] pressed from silence, the block's first frame at history frame [s]: its state from the start. */
    private fun start(slot: Int, s: Int) {
        val d = depths[slot]
        when (slot) {
            FxControl.STUTTER -> stutter.start((STUTTER_MS + STUTTER_MS_RANGE * d) * outRate.toFloat() / 1000f, s, historySize)
            FxControl.BEAT_REPEAT -> {
                val q = (d * 4f).toInt()
                val division = 1 shl (if (q > 3) 3 else q)
                repeat.start(outRate.toFloat() * 60f / bpm / division.toFloat(), s, historySize)
            }
            FxControl.TAPE_STOP -> {
                val t = ((TAPE_SECONDS - TAPE_SECONDS_RANGE * d) * outRate.toFloat()).toInt()
                tapeFrames = if (t > 1) t else 1
                tapeStep = 1f / tapeFrames.toFloat()
                tapeAt = 0
                tapeLag = 0f
            }
            FxControl.PITCH_RANDOM -> {
                pitch.start(randomStep(d), history, s, historySize)
                beatAt = 0
            }
            FxControl.OCTAVE_DOWN -> octave.start(0.5f, history, s, historySize)
            FxControl.SLICE -> slicePhase = 0f
            FxControl.FILTER_LFO -> {
                // From the bottom of the sweep.
                lfoPhase = 0.75f
                lfoTick = 0
                lfoL.reset()
                lfoR.reset()
            }
            FxControl.LPF -> {
                lpL.reset()
                lpR.reset()
            }
            FxControl.HPF -> {
                hpL.reset()
                hpR.reset()
            }
            // From the top of the swell.
            FxControl.TREMOLO -> tremoloPhase = 0.25f
            FxControl.DECIMATOR -> decimateAt = 0
        }
    }

    /** A slot's fade at its block's frame [i]: in by a frame each while [on], out by one each after. */
    private fun rampAt(on: Boolean, r0: Int, i: Int): Int {
        if (!on) return r0 - i - 1
        val r = r0 + i + 1
        return if (r < fadeFrames) r else fadeFrames
    }

    /** [x] (what came to a slot) toward [p] (what it makes of it) by its fade [r]. */
    private fun wet(x: Float, p: Float, r: Int): Float {
        if (r >= fadeFrames) return p
        return x + (p - x) * (r.toFloat() * fadeStep)
    }

    /** A loop's slice over [n] frames of [mix]: out of the history the first time round, copied as it goes. */
    private fun loop(loop: Loop, mix: FloatArray, n: Int, on: Boolean, r0: Int) {
        val h = history
        val copy = loop.copy
        var at = loop.at
        var first = loop.first
        for (i in 0 until n) {
            val r = rampAt(on, r0, i)
            if (first) {
                var k = loop.from + at
                if (k >= historySize) k -= historySize
                copy[2 * at] = h[2 * k]
                copy[2 * at + 1] = h[2 * k + 1]
            }
            mix[2 * i] = wet(mix[2 * i], copy[2 * at], r)
            mix[2 * i + 1] = wet(mix[2 * i + 1], copy[2 * at + 1], r)
            at++
            if (at == loop.length) {
                at = 0
                first = false
            }
        }
        loop.at = at
        loop.first = first
    }

    /** The tape: the history read further and further behind, slower and slower, then silence. */
    private fun tape(mix: FloatArray, n: Int, s: Int, on: Boolean, r0: Int) {
        val h = history
        var cur = s
        var at = tapeAt
        var lag = tapeLag
        for (i in 0 until n) {
            val r = rampAt(on, r0, i)
            var l = 0f
            var rr = 0f
            if (at < tapeFrames) {
                // Between the two samples lag frames back; the speed is 1 - at / tapeFrames, so the lag
                // grows by at / tapeFrames a frame.
                val whole = lag.toInt()
                val frac = lag - whole.toFloat()
                var k0 = cur - whole
                if (k0 < 0) k0 += historySize
                var k1 = k0 - 1
                if (k1 < 0) k1 += historySize
                l = lerp(h[2 * k0], h[2 * k1], frac)
                rr = lerp(h[2 * k0 + 1], h[2 * k1 + 1], frac)
                at++
                lag += at.toFloat() * tapeStep
            }
            mix[2 * i] = wet(mix[2 * i], l, r)
            mix[2 * i + 1] = wet(mix[2 * i + 1], rr, r)
            cur++
            if (cur == historySize) cur = 0
        }
        tapeAt = at
        tapeLag = lag
    }

    /** A random step of 1 to 1 + 11 [d] semitones, up or down, as a speed. */
    private fun randomStep(d: Float): Float {
        val most = (1f + 11f * d).toInt()
        var k = (lcg.unit() * (2 * most).toFloat()).toInt()
        if (k > 2 * most - 1) k = 2 * most - 1
        var n = k - most
        if (n >= 0) n++
        return semitoneRatio(n)
    }

    private fun pitchRandom(mix: FloatArray, n: Int, on: Boolean, r0: Int) {
        val d = depths[FxControl.PITCH_RANDOM]
        val b = (outRate.toFloat() * 60f / bpm).toInt()
        val beat = if (b > 1) b else 1
        for (i in 0 until n) {
            val r = rampAt(on, r0, i)
            val l = mix[2 * i]
            val rr = mix[2 * i + 1]
            pitch.frame(l, rr)
            mix[2 * i] = wet(l, pitch.outL, r)
            mix[2 * i + 1] = wet(rr, pitch.outR, r)
            beatAt++
            if (beatAt >= beat) {
                beatAt = 0
                pitch.retune(randomStep(d))
            }
        }
    }

    private fun octaveDown(mix: FloatArray, n: Int, on: Boolean, r0: Int) {
        val d = depths[FxControl.OCTAVE_DOWN]
        for (i in 0 until n) {
            val r = rampAt(on, r0, i)
            val amount = if (r >= fadeFrames) d else d * (r.toFloat() * fadeStep)
            val l = mix[2 * i]
            val rr = mix[2 * i + 1]
            octave.frame(l, rr)
            mix[2 * i] = l + (octave.outL - l) * amount
            mix[2 * i + 1] = rr + (octave.outR - rr) * amount
        }
    }

    private fun slice(mix: FloatArray, n: Int, on: Boolean, r0: Int) {
        val d = depths[FxControl.SLICE]
        // A 16th note's share of a cycle a frame, how much of it is open, and 1 over an edge's share.
        val inc = bpm / (15f * outRate.toFloat())
        val open = 1f - SLICE_CLOSE * d
        val sharp = 1f / (sliceEdge.toFloat() * inc)
        var p = slicePhase
        for (i in 0 until n) {
            val r = rampAt(on, r0, i)
            val up = p * sharp
            val down = (open - p) * sharp
            val e = if (up < down) up else down
            val g = if (e > 1f) 1f else if (e > 0f) e else 0f
            val l = mix[2 * i]
            val rr = mix[2 * i + 1]
            mix[2 * i] = wet(l, l * g, r)
            mix[2 * i + 1] = wet(rr, rr * g, r)
            p = wrap01(p + inc)
        }
        slicePhase = p
    }

    private fun filterLfo(mix: FloatArray, n: Int, on: Boolean, r0: Int) {
        val q = LFO_Q + LFO_Q_RANGE * depths[FxControl.FILTER_LFO]
        val inc = bpm / (60f * outRate.toFloat())
        var p = lfoPhase
        var tick = lfoTick
        for (i in 0 until n) {
            val r = rampAt(on, r0, i)
            if (tick == 0) {
                val u = 0.5f + 0.5f * triangle(p)
                val g = svfG(LFO_FROM + (LFO_TO - LFO_FROM) * (u * u), outRate)
                lfoL.set(g, q)
                lfoR.set(g, q)
                // The band-pass at 1 in its middle.
                lfoGain = 1f / q
            }
            tick++
            if (tick == LFO_TICK) tick = 0
            val l = mix[2 * i]
            val rr = mix[2 * i + 1]
            lfoL.process(l)
            lfoR.process(rr)
            mix[2 * i] = wet(l, lfoL.bp * lfoGain, r)
            mix[2 * i + 1] = wet(rr, lfoR.bp * lfoGain, r)
            p = wrap01(p + inc)
        }
        lfoPhase = p
        lfoTick = tick
    }

    /** The low-pass ([high] false) or the high-pass. */
    private fun pass(left: Svf, right: Svf, high: Boolean, mix: FloatArray, n: Int, on: Boolean, r0: Int) {
        val hz = if (high) {
            knobHz(depths[FxControl.HPF], HPF_FROM, HPF_TO)
        } else {
            knobHz(1f - depths[FxControl.LPF], LPF_FROM, LPF_TO)
        }
        val g = svfG(hz, outRate)
        left.set(g, BUTTERWORTH)
        right.set(g, BUTTERWORTH)
        for (i in 0 until n) {
            val r = rampAt(on, r0, i)
            val l = mix[2 * i]
            val rr = mix[2 * i + 1]
            left.process(l)
            right.process(rr)
            mix[2 * i] = wet(l, if (high) left.hp else left.lp, r)
            mix[2 * i + 1] = wet(rr, if (high) right.hp else right.lp, r)
        }
    }

    private fun tremolo(mix: FloatArray, n: Int, on: Boolean, r0: Int) {
        val d = depths[FxControl.TREMOLO]
        val inc = bpm / (15f * outRate.toFloat())
        var p = tremoloPhase
        for (i in 0 until n) {
            val r = rampAt(on, r0, i)
            val g = 1f - d * (0.5f - 0.5f * parabolicSine(p))
            val l = mix[2 * i]
            val rr = mix[2 * i + 1]
            mix[2 * i] = wet(l, l * g, r)
            mix[2 * i + 1] = wet(rr, rr * g, r)
            p = wrap01(p + inc)
        }
        tremoloPhase = p
    }

    private fun decimate(mix: FloatArray, n: Int, on: Boolean, r0: Int) {
        val d = depths[FxControl.DECIMATOR]
        val hold = (1f + DECIMATE_HOLD * d).toInt()
        // A power of two: dividing by it is exact.
        val step = (1 shl (DECIMATE_BITS * d).toInt()).toFloat()
        val inv = 1f / step
        var at = decimateAt
        var hl = decimateL
        var hr = decimateR
        for (i in 0 until n) {
            val r = rampAt(on, r0, i)
            val l = mix[2 * i]
            val rr = mix[2 * i + 1]
            if (at == 0) {
                hl = quantise(l, step, inv)
                hr = quantise(rr, step, inv)
            }
            at++
            if (at >= hold) at = 0
            mix[2 * i] = wet(l, hl, r)
            mix[2 * i + 1] = wet(rr, hr, r)
        }
        decimateAt = at
        decimateL = hl
        decimateR = hr
    }

    /** [x] truncated (toward 0) to a multiple of [step]. */
    private fun quantise(x: Float, step: Float, inv: Float): Float {
        val q = x * inv
        val c = if (q > BIG) BIG else if (q < -BIG) -BIG else q
        return c.toInt().toFloat() * step
    }

    /** A loop's own copy of its slice ([capacity] frames at most), and where it is in it. */
    private class Loop(val capacity: Int) {
        val copy = FloatArray(capacity * 2)
        var length = 1
        /** The history frame the slice starts at. */
        var from = 0
        var at = 0
        /** Still going round the first time: reading the history. */
        var first = true

        /** A slice [frames] long (held to 1..[capacity]), ending at history frame [s]. */
        fun start(frames: Float, s: Int, historySize: Int) {
            val f = frames.toInt()
            length = if (f > capacity) capacity else if (f > 1) f else 1
            from = s - length
            if (from < 0) from += historySize
            at = 0
            first = true
        }
    }

    /**
     * A granular pitch shifter, stereo: two heads read a line of its input
     * [window] long (50 ms), each [delayA] and [delayB] behind what was just
     * written, the delay growing by 1 - ratio a frame (so they read at the
     * ratio's speed), and starting over (at 0 going down, at the window's
     * share going up) as its triangle window closes; the two windows are half
     * a window apart.
     */
    private class Shifter(rate: Int) {
        val window = maxOf(1, rate * GRAIN_MS / 2000) * 2
        private val half = window / 2
        private val most = window.toFloat()
        private val gainStep = 2f / window.toFloat()
        /** The line: the window, and one more frame either side of the read. */
        private val size = window + 2
        private val left = FloatArray(size)
        private val right = FloatArray(size)
        private var write = 0
        /** Where head A is in its window (head B half a window on). */
        private var grain = 0
        private var delayA = 0f
        private var delayB = 0f
        private var ratio = 1f
        /** Where a head's delay starts over. */
        private var restart = 0f

        var outL = 0f
            private set
        var outR = 0f
            private set

        /** At [ratio], the line filled with the history before frame [s], head A's window opening. */
        fun start(ratio: Float, history: FloatArray, s: Int, historySize: Int) {
            retune(ratio)
            var k = s - size
            if (k < 0) k += historySize
            for (j in 0 until size) {
                left[j] = history[2 * k]
                right[j] = history[2 * k + 1]
                k++
                if (k == historySize) k = 0
            }
            write = 0
            grain = 0
            delayA = restart
            delayB = inLine(restart + half.toFloat() * (1f - ratio))
        }

        /** A new speed: the heads glide on from where they are. */
        fun retune(ratio: Float) {
            this.ratio = ratio
            restart = if (ratio > 1f) inLine((ratio - 1f) * most) else 0f
        }

        /** Takes in a frame: [outL] and [outR] are then the shifted one. */
        fun frame(l: Float, r: Float) {
            left[write] = l
            right[write] = r
            val gA = (if (grain < half) grain else window - grain).toFloat() * gainStep
            var kb = grain + half
            if (kb >= window) kb -= window
            val gB = (if (kb < half) kb else window - kb).toFloat() * gainStep
            val wa = delayA.toInt()
            val fa = delayA - wa.toFloat()
            var a0 = write - wa
            if (a0 < 0) a0 += size
            var a1 = a0 - 1
            if (a1 < 0) a1 += size
            val wb = delayB.toInt()
            val fb = delayB - wb.toFloat()
            var b0 = write - wb
            if (b0 < 0) b0 += size
            var b1 = b0 - 1
            if (b1 < 0) b1 += size
            outL = lerp(left[a0], left[a1], fa) * gA + lerp(left[b0], left[b1], fb) * gB
            outR = lerp(right[a0], right[a1], fa) * gA + lerp(right[b0], right[b1], fb) * gB
            val glide = 1f - ratio
            delayA = inLine(delayA + glide)
            delayB = inLine(delayB + glide)
            write++
            if (write == size) write = 0
            grain++
            if (grain == window) grain = 0
            // A head starts over as its window closes (its gain 0).
            if (grain == 0) delayA = restart else if (grain == half) delayB = restart
        }

        /** A delay held to the line. */
        private fun inLine(d: Float): Float = if (d < 0f) 0f else if (d > most) most else d
    }
}
