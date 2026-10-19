package dev.arc.ep133.ui.screens

import dev.arc.ep133.features.Keys
import dev.arc.ep133.features.PhysicalPad

/**
 * What Live's voices sounding on the phone ("live:<group>:<offset>" pads,
 * "note:<midi>" keys, as [dev.arc.ep133.audio.LiveAudio.keys] names them, the
 * pattern's KEYS notes, "seq:<group>:<offset>:<midi>", and the arp's,
 * "arp:<group>:<offset>:<semitones from Keys.ROOT_NOTE>", "n" for a pad hit)
 * mean for the rings: the pads to ring, and the notes to outline, latest
 * last; and for the arp's lights, the pads and notes it sounds now.
 */
internal object LiveVoices {
    fun pads(voices: Set<String>): Set<PhysicalPad> = voices.mapNotNullTo(HashSet()) { k ->
        val p = k.split(':')
        // A pattern's KEYS note, and the arp's, ring the pad it plays on.
        val pad = p.size == 3 && p[0] == "live" || p.size == 4 && p[0] == "seq" && p[3].toIntOrNull() != null || arpKey(p)
        if (!pad) return@mapNotNullTo null
        val g = p[1].toIntOrNull()
        val o = p[2].toIntOrNull()
        if (g != null && o != null) PhysicalPad(g, o) else null
    }

    /** The notes to outline: the keys played, and the pattern's notes on [keysPad] (the sound KEYS plays; null for none). */
    fun notes(voices: Set<String>, keysPad: PhysicalPad? = null): Set<Int> = voices.mapNotNullTo(LinkedHashSet()) { v ->
        when {
            v.startsWith("note:") -> v.removePrefix("note:").toIntOrNull()
            keysPad != null && v.startsWith("seq:") -> v.split(':').takeIf { it.size == 4 }?.let { p ->
                p[3].toIntOrNull()?.takeIf { p[1].toIntOrNull() == keysPad.group && p[2].toIntOrNull() == keysPad.offset }
            }
            else -> null
        }
    }

    /** The pads the arp sounds now (note repeat's hits, and the pad a KEYS arp plays on): lit. */
    fun arpPads(voices: Set<String>): Set<PhysicalPad> = voices.mapNotNullTo(HashSet()) { k ->
        val p = k.split(':')
        if (!arpKey(p)) return@mapNotNullTo null
        val g = p[1].toIntOrNull()
        val o = p[2].toIntOrNull()
        if (g != null && o != null) PhysicalPad(g, o) else null
    }

    /** The KEYS notes (MIDI) the arp sounds now on [keysPad] (the sound KEYS plays; null for none): lit. */
    fun arpNotes(voices: Set<String>, keysPad: PhysicalPad?): Set<Int> {
        if (keysPad == null) return emptySet()
        return voices.mapNotNullTo(HashSet()) { k ->
            val p = k.split(':')
            if (!arpKey(p) || p[1].toIntOrNull() != keysPad.group || p[2].toIntOrNull() != keysPad.offset) return@mapNotNullTo null
            p[3].toIntOrNull()?.let { Keys.ROOT_NOTE + it }
        }
    }

    // An arp voice's key split at ':': "arp", group, offset, and semitones or "n".
    private fun arpKey(p: List<String>): Boolean = p.size == 4 && p[0] == "arp" && (p[3] == "n" || p[3].toIntOrNull() != null)
}
