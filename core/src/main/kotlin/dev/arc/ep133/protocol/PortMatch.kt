package dev.arc.ep133.protocol

import dev.arc.ep133.util.JS_SPACE_CLASS

/** Which MIDI device is the EP-133 (webmidi.js pickPort). */
object PortMatch {
    // /EP[- ]?(133|1320|40)|K\.?O\.?\s?II/i, with the case-insensitive letters spelled out.
    private val EP_PORT = Regex("[eE][pP][- ]?(?:133|1320|40)|[kK]\\.?[oO]\\.?$JS_SPACE_CLASS?[iI][iI]")

    fun matches(name: String?): Boolean = name != null && EP_PORT.containsMatchIn(name)

    /** First candidate whose name matches; otherwise the only candidate; otherwise null. */
    fun <T> pick(candidates: List<T>, name: (T) -> String?): T? {
        candidates.firstOrNull { matches(name(it)) }?.let { return it }
        return candidates.singleOrNull()
    }
}
