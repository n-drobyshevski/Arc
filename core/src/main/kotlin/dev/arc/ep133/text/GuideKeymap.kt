package dev.arc.ep133.text

/**
 * A key, knob or the fader on the K.O. II's panel, as the Guide's
 * illustration draws it (an addition to the web version): the knob row
 * (VOLUME, SOUND, MAIN, TEMPO, KNOB X, KNOB Y), the KEYS / FADER / SHIFT
 * column, the group keys A-D, the twelve pads top row first, and the
 * function keys beside them.
 */
enum class PanelKey {
    VOL, SOUND, MAIN, TEMPO, X, Y,
    KEYS, FADER, SHIFT,
    A, B, C, D,
    P7, P8, P9, P4, P5, P6, P1, P2, P3, DOT, P0, ENTER,
    SAMPLE, TIMING, FX, ERASE, MINUS, PLUS, REC, PLAY,
    ;

    companion object {
        /** The twelve pads, top row first, as they sit on the device. */
        val PADS = listOf(P7, P8, P9, P4, P5, P6, P1, P2, P3, DOT, P0, ENTER)
        val DIGITS = listOf(P0, P1, P2, P3, P4, P5, P6, P7, P8, P9)
        val GROUPS = listOf(A, B, C, D)
    }
}

/** What a step asks of its keys: press, press twice, hold, type a number on the pads, turn a knob, move the fader. */
enum class StepKind { PRESS, TWICE, HOLD, TYPE, TURN, MOVE }

/**
 * One step of a combo on the panel: the [keys] it lights and what it asks of
 * them ([kind]); [either] when any one of them will do ("A / B / C / D").
 */
data class KeymapStep(val keys: List<PanelKey>, val kind: StepKind, val either: Boolean = false)

/**
 * A combo as panel keys, for the Guide's illustration. [context] is the
 * bracketed situation as written; [mode] the mode it names, upper-case
 * ("SOUND" for "[In SOUND mode]", "MAIN" for "[In MAIN]"), else null.
 * [options] are separate ways to do the same thing, each its steps in order.
 */
data class GuideKeymap(val context: String?, val mode: String?, val options: List<List<KeymapStep>>) {
    /** The first way, the one the illustration numbers. */
    val steps: List<KeymapStep> get() = options.firstOrNull().orEmpty()

    /** Every key the first way lights. */
    val keys: Set<PanelKey> get() = steps.flatMapTo(LinkedHashSet()) { it.keys }
}

/**
 * Reads a guide entry's combo ([GuideCombo] notation) as steps on the panel.
 * Keys pressed together stay one step; keys held while others are pressed
 * become a HOLD step of their own first ("hold:SOUND + dial:0-9" is hold
 * SOUND, then type on the pads). A step's kind comes from its keys' actions:
 * turn, then move, then dial (TYPE), then twice; else a press.
 */
object PanelKeymap {
    private val MODE = Regex("^In (\\S+)(?: mode)?$", RegexOption.IGNORE_CASE)

    private val NAMED = mapOf(
        "SOUND" to PanelKey.SOUND, "MAIN" to PanelKey.MAIN, "TEMPO" to PanelKey.TEMPO,
        "KNOB X" to PanelKey.X, "KNOB Y" to PanelKey.Y,
        "KEYS" to PanelKey.KEYS, "FADER" to PanelKey.FADER, "SHIFT" to PanelKey.SHIFT,
        "A" to PanelKey.A, "B" to PanelKey.B, "C" to PanelKey.C, "D" to PanelKey.D,
        "ENTER" to PanelKey.ENTER, "SAMPLE" to PanelKey.SAMPLE, "TIMING" to PanelKey.TIMING,
        "FX" to PanelKey.FX, "ERASE" to PanelKey.ERASE, "-" to PanelKey.MINUS, "+" to PanelKey.PLUS,
        "RECORD" to PanelKey.REC, "PLAY" to PanelKey.PLAY,
    )

    /** The panel keys a [GuideCombo] key name stands for: "pad" is any pad, "0-9" the digits, "A-D" the groups. */
    fun keysFor(label: String): List<PanelKey> = when (label) {
        "pad" -> PanelKey.PADS
        "0-9" -> PanelKey.DIGITS
        "1-9" -> PanelKey.DIGITS.drop(1)
        "A-D" -> PanelKey.GROUPS
        else -> listOf(NAMED[label] ?: error("no panel key for \"$label\""))
    }

    /** The mode a context names: "In SOUND mode" is SOUND, "In MAIN" is MAIN; anything else none. */
    fun modeOf(context: String?): String? = context?.let { MODE.find(it.trim()) }?.groupValues?.get(1)?.uppercase()

    fun parse(combo: String): GuideKeymap {
        val c = GuideCombo.parse(combo)
        return GuideKeymap(c.context, modeOf(c.context), c.options.map(::steps))
    }

    /** An entry's keymap, or null when it has no combo (the text says it all). */
    fun of(entry: GuideEntry): GuideKeymap? = entry.combo?.let(::parse)

    /** One way's steps; keys still held from the step before are not held again ("hold:pad + SHIFT + C > hold:pad + SHIFT + D"). */
    private fun steps(option: List<ComboStep>): List<KeymapStep> {
        val out = ArrayList<KeymapStep>()
        var holding = emptyList<PanelKey>()
        for (step in option) {
            val held = panel(step.keys.filter { it.action == KeyAction.HOLD })
            for (s in steps(step)) if (!(s.kind == StepKind.HOLD && s.keys == holding && held == holding && out.isNotEmpty())) out += s
            holding = held
        }
        return out
    }

    private fun steps(step: ComboStep): List<KeymapStep> {
        val held = step.keys.filter { it.action == KeyAction.HOLD }
        val rest = step.keys.filter { it.action != KeyAction.HOLD }
        if (rest.isEmpty()) return listOf(KeymapStep(panel(held), StepKind.HOLD, step.alternatives))
        val actions = rest.mapNotNull { it.action }.toSet()
        val kind = when {
            KeyAction.TURN in actions -> StepKind.TURN
            KeyAction.MOVE in actions -> StepKind.MOVE
            KeyAction.DIAL in actions -> StepKind.TYPE
            KeyAction.TWICE in actions -> StepKind.TWICE
            else -> StepKind.PRESS
        }
        val main = KeymapStep(panel(rest), kind, step.alternatives)
        return if (held.isEmpty()) listOf(main) else listOf(KeymapStep(panel(held), StepKind.HOLD), main)
    }

    private fun panel(caps: List<KeyCap>): List<PanelKey> = caps.flatMap { keysFor(it.label) }.distinct()
}
