package dev.arc.ep133.ui.screens

import dev.arc.ep133.features.PhysicalPad

/**
 * What Live's voices sounding on the phone ("live:<group>:<offset>" pads,
 * "note:<midi>" keys, as [dev.arc.ep133.audio.LiveAudio.keys] names them, and
 * the pattern's KEYS notes, "seq:<group>:<offset>:<midi>") mean for the rings:
 * the pads to ring, and the notes to outline, latest last.
 */
internal object LiveVoices {
    fun pads(voices: Set<String>): Set<PhysicalPad> = voices.mapNotNullTo(HashSet()) { k ->
        val p = k.split(':')
        // A pattern's KEYS note rings the pad it plays on.
        val pad = p.size == 3 && p[0] == "live" || p.size == 4 && p[0] == "seq" && p[3].toIntOrNull() != null
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
}
