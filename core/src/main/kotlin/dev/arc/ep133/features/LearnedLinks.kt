package dev.arc.ep133.features

/**
 * Live's learned pad links as kept in preferences and library.json (an
 * addition): "offset:pad" pairs, offset 0..11 to the pad's number 1..12 in
 * project files. See [LiveMirror].
 */
object LearnedLinks {
    fun parse(text: String?): Map<Int, Int> =
        text.orEmpty().split(',').mapNotNull { pair ->
            val (o, p) = pair.split(':').takeIf { it.size == 2 } ?: return@mapNotNull null
            val offset = o.toIntOrNull() ?: return@mapNotNull null
            val pad = p.toIntOrNull() ?: return@mapNotNull null
            if (offset in 0..11 && pad in 1..12) offset to pad else null
        }.toMap()

    fun format(learned: Map<Int, Int>): String = learned.entries.joinToString(",") { "${it.key}:${it.value}" }

    /**
     * Live's pad links offline, where nothing can be learned (no device): the
     * [learned] ones, the rest numbered from the top row as arc writes pads
     * before any press (PadPush.topNumber), never over a learned number. So
     * the last read (or the factory sounds, whose kicks then sit on '.' and
     * '0') shows names and plays with none learned. Never saved as learned.
     */
    fun offline(learned: Map<Int, Int>): Map<Int, Int> {
        val out = LinkedHashMap(learned)
        for (offset in 0..11) {
            val n = PadPush.topNumber(offset)
            if (offset !in out && n !in out.values) out[offset] = n
        }
        return out
    }

    /**
     * Links brought back from the folder, with the ones learned here on top.
     * A pad number belongs to one key only, so a restored link to a number
     * learned here for another key is dropped.
     */
    fun merge(restored: Map<Int, Int>, local: Map<Int, Int>): Map<Int, Int> {
        val taken = local.values.toSet()
        return LinkedHashMap<Int, Int>().apply {
            for ((o, p) in restored) if (o !in local && p !in taken) put(o, p)
            putAll(local)
        }
    }
}
