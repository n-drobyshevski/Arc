package dev.arc.ep133.ui.screens

import dev.arc.ep133.features.PhysicalPad

/**
 * What Live's voices sounding on the phone ("live:<group>:<offset>" pads,
 * "note:<midi>" keys, as [dev.arc.ep133.audio.LiveAudio.keys] names them)
 * mean for the rings: the pads to ring, and the notes to outline, latest last.
 */
internal object LiveVoices {
    fun pads(voices: Set<String>): Set<PhysicalPad> = voices.mapNotNullTo(HashSet()) { k ->
        k.split(':').takeIf { it.size == 3 && it[0] == "live" }?.let { p ->
            val g = p[1].toIntOrNull()
            val o = p[2].toIntOrNull()
            if (g != null && o != null) PhysicalPad(g, o) else null
        }
    }

    fun notes(voices: Set<String>): Set<Int> =
        voices.mapNotNullTo(LinkedHashSet()) { v -> if (v.startsWith("note:")) v.removePrefix("note:").toIntOrNull() else null }
}
