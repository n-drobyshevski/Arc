package dev.arc.ep133.text

/** How a key is drawn: the EP-133's pale keys, its dark keys, a pad, a knob or the fader. */
enum class KeyKind { LIGHT, DARK, PAD, KNOB, FADER }

/** What to do with a key, shown above it: hold it, type a number on the pads, turn it, move it, press it twice. */
enum class KeyAction { HOLD, DIAL, TURN, MOVE, TWICE }

data class KeyCap(val label: String, val kind: KeyKind, val action: KeyAction? = null)

/** Keys pressed together, or (when [alternatives]) any one of them. */
data class ComboStep(val keys: List<KeyCap>, val alternatives: Boolean = false)

/** Steps one after another; [options] are separate ways to do the same thing. */
data class Combo(val context: String?, val options: List<List<ComboStep>>)

/**
 * A small notation for drawing a guide entry's keys as key caps (an addition
 * to the web version). Each entry's combo is written from that entry's own
 * key text and checked against it by a test, so the caps never show a key
 * the official guide does not name.
 *
 * `[context] option | option`; an option is `step > step`; a step is keys
 * joined by ` + ` (together) or ` / ` (either). A key is `action:NAME` or
 * `NAME`, where action is hold, dial, turn, move or x2.
 */
object GuideCombo {
    private val LIGHT = setOf("SHIFT", "-", "+")
    private val DARK = setOf("MAIN", "SOUND", "SAMPLE", "FX", "TEMPO", "RECORD", "PLAY", "ERASE", "KEYS", "TIMING", "A", "B", "C", "D", "A-D")
    private val PAD = setOf("pad", "ENTER", "1-9", "0-9")
    private val KNOB = setOf("KNOB X", "KNOB Y")
    private val ACTIONS = mapOf(
        "hold" to KeyAction.HOLD, "dial" to KeyAction.DIAL, "turn" to KeyAction.TURN,
        "move" to KeyAction.MOVE, "x2" to KeyAction.TWICE,
    )

    /** Every key name the notation knows, for checking combos against their text. */
    val KEY_NAMES: Set<String> = LIGHT + DARK + PAD + KNOB + "FADER" + "-/+"

    fun parse(text: String): Combo {
        var rest = text.trim()
        var context: String? = null
        if (rest.startsWith("[")) {
            val close = rest.indexOf(']')
            require(close > 0) { "unclosed context in \"$text\"" }
            context = rest.substring(1, close).trim()
            rest = rest.substring(close + 1).trim()
        }
        val options = rest.split(" | ").map { option ->
            option.split(" > ").map { step -> parseStep(step.trim(), text) }
        }
        return Combo(context, options)
    }

    private fun parseStep(step: String, whole: String): ComboStep {
        val together = step.contains(" + ")
        val either = step.contains(" / ")
        require(!(together && either)) { "mixed + and / in \"$whole\"" }
        val parts = if (either) step.split(" / ") else step.split(" + ")
        val keys = parts.flatMap { parseKey(it.trim(), whole) }
        return ComboStep(keys, alternatives = either)
    }

    private fun parseKey(token: String, whole: String): List<KeyCap> {
        val colon = token.indexOf(':')
        val action = if (colon > 0) ACTIONS[token.substring(0, colon)] ?: error("unknown action in \"$whole\"") else null
        val name = if (colon > 0) token.substring(colon + 1) else token
        // "- / +" is two pale keys side by side, as on the device.
        if (name == "-/+") return listOf(KeyCap("-", KeyKind.LIGHT, action), KeyCap("+", KeyKind.LIGHT))
        val kind = when (name) {
            in LIGHT -> KeyKind.LIGHT
            in DARK -> KeyKind.DARK
            in PAD -> KeyKind.PAD
            in KNOB -> KeyKind.KNOB
            "FADER" -> KeyKind.FADER
            else -> error("unknown key \"$name\" in \"$whole\"")
        }
        return listOf(KeyCap(name, kind, action))
    }
}
