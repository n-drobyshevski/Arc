package dev.arc.ep133.features

import dev.arc.ep133.formats.Tar

/** One pad group of a project: pad number to the sample slot on it (null when empty). */
data class PadGroup(val name: String, val pads: Map<Int, Int?>)

/**
 * Which sound sits on each pad of a project (an addition to the web version).
 * It reads the same pad records as [Tar.slotsUsedByProject]: entries named
 * `pads/<group>/p<number>` whose bytes 1-2 hold the slot. The rest of a
 * record is only known from community notes ([settings], PadSettings.fromRecord),
 * and how pad numbers map to the physical pads is not known either, so pads
 * are only ordered by number.
 */
object ProjectPads {
    private val GROUP_ORDER = listOf("a", "b", "c", "d")

    /** Groups a, b, c, d first, then any others by name. */
    val groupOrder: Comparator<String> =
        compareBy<String>({ GROUP_ORDER.indexOf(it).let { i -> if (i < 0) GROUP_ORDER.size else i } }, { it })

    fun read(tar: ByteArray): List<PadGroup> {
        val groups = LinkedHashMap<String, java.util.TreeMap<Int, Int?>>()
        try {
            for ((name, rec) in Tar.read(tar)) {
                val m = Tar.PAD.find(name) ?: continue
                if (rec.size < 3) continue
                val pad = m.groupValues[2].toIntOrNull() ?: continue
                val slot = (rec[1].toInt() and 0xFF) or ((rec[2].toInt() and 0xFF) shl 8)
                groups.getOrPut(m.groupValues[1]) { java.util.TreeMap() }[pad] = slot.takeIf { it in 1..999 }
            }
        } catch (_: Exception) {
            // Unknown layout, like slotsUsedByProject: no information.
            return emptyList()
        }
        return groups.entries
            .sortedWith(compareBy(groupOrder) { it.key })
            .map { PadGroup(it.key, it.value) }
    }

    /**
     * Each pad's SOUND EDIT settings from its record, by (group, pad), for the
     * records that look like settings (PadSettings.fromRecord; an addition).
     * Groups come in [groupOrder], pads by number; a pad whose record isn't
     * plausible is left out, and a TAR that can't be read gives none.
     */
    fun settings(tar: ByteArray): Map<Pair<String, Int>, PadSettings> {
        val groups = java.util.TreeMap<String, java.util.TreeMap<Int, PadSettings>>(groupOrder)
        try {
            for ((name, rec) in Tar.read(tar)) {
                val m = Tar.PAD.find(name) ?: continue
                if (rec.size < 3) continue
                val pad = m.groupValues[2].toIntOrNull() ?: continue
                // The last record of a pad counts, as in read().
                val pads = groups.getOrPut(m.groupValues[1]) { java.util.TreeMap() }
                val s = PadSettings.fromRecord(rec)
                if (s != null) pads[pad] = s else pads.remove(pad)
            }
        } catch (_: Exception) {
            return emptyMap()
        }
        val out = LinkedHashMap<Pair<String, Int>, PadSettings>()
        for ((g, pads) in groups) for ((pad, ps) in pads) out[g to pad] = ps
        return out
    }

    /** Every (group, pad) to its slot, for comparing two layouts. */
    fun flatten(groups: List<PadGroup>): Map<Pair<String, Int>, Int?> =
        groups.flatMap { g -> g.pads.map { (pad, slot) -> (g.name to pad) to slot } }.toMap()
}
