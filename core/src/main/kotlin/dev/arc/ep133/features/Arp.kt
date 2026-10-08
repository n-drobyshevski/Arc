package dev.arc.ep133.features

/**
 * The arp's order, as KEYS plays the notes held: as pressed (the device's
 * own), up or down by pitch, up then down, or at random. [id] is the word
 * kept in settings.
 */
enum class ArpOrder(val id: String) {
    PLAYED("played"),
    UP("up"),
    DOWN("down"),
    UP_DOWN("updown"),
    RANDOM("random");

    companion object {
        fun of(id: String): ArpOrder? = entries.firstOrNull { it.id == id }
    }
}

/**
 * The arp and note repeat (an addition to the device's TIMING + pads): the
 * [order] KEYS plays the held notes in, over 1 to 3 [octaves], each note
 * held for [gate] percent of a step (10..100), and [latch]: the notes go on
 * after the fingers are up. The step is TIMING's interval ([TimingSettings]).
 */
data class ArpSettings(
    val order: ArpOrder = ArpOrder.PLAYED,
    val octaves: Int = 1,
    val gate: Int = 50,
    val latch: Boolean = false,
) {
    fun withOrder(o: ArpOrder): ArpSettings = copy(order = o)

    /** Over [n] octaves, held to 1..3. */
    fun withOctaves(n: Int): ArpSettings = copy(octaves = n.coerceIn(MIN_OCTAVES, MAX_OCTAVES))

    /** Each note held for [percent] of a step, 10..100. */
    fun withGate(percent: Int): ArpSettings = copy(gate = percent.coerceIn(MIN_GATE, MAX_GATE))

    fun withLatch(on: Boolean): ArpSettings = copy(latch = on)

    companion object {
        const val MIN_OCTAVES = 1
        const val MAX_OCTAVES = 3
        const val MIN_GATE = 10
        const val MAX_GATE = 100

        val DEFAULT = ArpSettings()
    }
}

/**
 * A note held for the arp: on [pad], [semitones] from [Keys.ROOT_NOTE] for a
 * KEYS note or null for a PADS hit, at [velocity] (1..127).
 */
data class ArpNote(val pad: PhysicalPad, val semitones: Int?, val velocity: Int = 127)

/**
 * What the arp and note repeat play: one cycle of the held notes ([cycle]),
 * the note on each step ([noteAt]), and how long and loud each sounds. Pure,
 * so the scheduler and the tests step it alike.
 */
object Arp {
    /**
     * One cycle of [held] (in the order pressed) in [order], over [octaves]
     * (1..3): each octave up adds every KEYS note again, 12 semitones higher;
     * a PADS hit is never transposed and plays once. UP sorts by pitch (ties
     * as pressed), DOWN is UP backwards, UP_DOWN goes up and back without
     * playing the ends twice, and RANDOM picks from the UP notes.
     */
    fun cycle(held: List<ArpNote>, order: ArpOrder, octaves: Int): List<ArpNote> {
        val n = octaves.coerceIn(ArpSettings.MIN_OCTAVES, ArpSettings.MAX_OCTAVES)
        if (order == ArpOrder.PLAYED) return expand(held, n)
        val up = expand(held.sortedBy { it.semitones ?: 0 }, n)
        return when (order) {
            ArpOrder.DOWN -> up.asReversed().toList()
            ArpOrder.UP_DOWN -> if (up.size <= 2) up else up + up.subList(1, up.size - 1).asReversed()
            else -> up
        }
    }

    /**
     * The note on [step] of [cycle] (null with nothing held): round the cycle,
     * or for RANDOM a pick from it that [seed] and [step] alone decide, the
     * same in the web version.
     */
    fun noteAt(step: Long, cycle: List<ArpNote>, order: ArpOrder, seed: Int): ArpNote? {
        if (cycle.isEmpty()) return null
        if (order != ArpOrder.RANDOM) return cycle[Math.floorMod(step, cycle.size.toLong()).toInt()]
        return cycle[(lcg(seed, step) ushr 8) % cycle.size]
    }

    /** Note repeat (PADS): every pad held plays again together on each step. */
    fun repeatNotes(held: List<ArpNote>): List<ArpNote> = held

    /** How long a note sounds at [gate] percent of [interval]'s step: at least 1 tick. */
    fun gateTicks(interval: Timing, gate: Int): Int = maxOf(1, (interval.ticks * gate + 50) / 100)

    /** The gain for [velocity] (1..127, out of range held to it): (v / 127)², exactly 1 at 127. */
    fun velocityGain(velocity: Int): Float {
        val v = velocity.coerceIn(1, 127) / 127f
        return v * v
    }

    // Every note once per octave, KEYS notes transposed; PADS hits in the first octave only.
    private fun expand(notes: List<ArpNote>, octaves: Int): List<ArpNote> = buildList {
        for (o in 0 until octaves) {
            for (note in notes) {
                val semi = note.semitones
                if (o == 0) add(note) else if (semi != null) add(note.copy(semitones = semi + 12 * o))
            }
        }
    }

    // Two rounds of a 32-bit LCG on the seed and step: Int arithmetic wraps as the web's Math.imul does.
    private fun lcg(seed: Int, step: Long): Int {
        var x = seed xor step.toInt()
        repeat(2) { x = x * 1664525 + 1013904223 }
        return x
    }
}
