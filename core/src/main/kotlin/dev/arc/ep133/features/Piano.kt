package dev.arc.ep133.features

/** Where a note stands in KEYS' key: its root, another note of the scale, or outside it. */
enum class KeyMark { ROOT, IN, OUT }

/** A rectangle on the piano, in whatever unit its width and height came in (dp or px). */
data class KeyRect(val left: Float, val top: Float, val width: Float, val height: Float) {
    val right: Float get() = left + width
    val bottom: Float get() = top + height

    /** Inside, with the left and top edges in and the right and bottom out, so neighbours never share a point. */
    fun contains(x: Float, y: Float): Boolean = x >= left && x < right && y >= top && y < bottom
}

/**
 * One key of the piano: [rect] is drawn, [hitRect] is what a finger hits.
 * A black key is hit wider than it is drawn; a white key is hit on its whole
 * face, the black keys over it winning where they overlap.
 */
data class PianoKey(val note: Int, val black: Boolean, val rect: KeyRect, val hitRect: KeyRect)

/**
 * Live's landscape KEYS (an addition): a chromatic piano across the phone in
 * place of the EP-133's 4×3 keypad. Every note plays; the key and scale only
 * mark the keys ([mark]). It starts on a C, an octave under OCT's own C, so
 * OCT 4 shows C3–C5 with the sound's own pitch (C4) in the middle.
 */
object Piano {
    /** The white keys it can show, widest first: three octaves, two, one and a half (C–G), one. */
    val WHITES = listOf(22, 15, 12, 8)
    /** A white key is never narrower than this (dp): under it the grid stays instead. */
    const val MIN_WHITE = 44f

    // Black keys against a white one: drawn as KeysStrip draws them (a touch longer),
    // hit a little wider so a finger meant for the narrow key finds it.
    const val BLACK_WIDTH = 0.6f
    const val BLACK_HEIGHT = 0.62f
    const val BLACK_HIT_WIDTH = 0.72f

    private val BLACK = setOf(1, 3, 6, 8, 10)

    /** How many white keys fit [widthDp] at [minWhite] or wider each; 0 when even one octave doesn't. */
    fun whitesFor(widthDp: Float, minWhite: Float = MIN_WHITE): Int = WHITES.firstOrNull { widthDp / it >= minWhite } ?: 0

    /** The piano's lowest note at [octave]: C of the octave below (OCT 4 → C3, 48). */
    fun lowest(octave: Int): Int = 12 * octave

    /** The notes [whites] white keys cover from [lowest], black keys included; the plate ends at 127 (G9). */
    fun range(octave: Int, whites: Int): IntRange {
        val lo = lowest(octave)
        if (whites <= 0 || lo !in 0..127) return IntRange.EMPTY
        var hi = lo
        var count = 1
        while (count < whites && hi < 127) if (!isBlack(++hi)) count++
        return lo..hi
    }

    fun isBlack(note: Int): Boolean = ((note % 12) + 12) % 12 in BLACK

    /**
     * The keys of [range] on a [w] × [h] plate, lowest first: the white keys
     * side by side, each black key centred on the seam between its two whites.
     */
    fun layout(range: IntRange, w: Float, h: Float): List<PianoKey> {
        val whites = range.count { !isBlack(it) }
        if (whites == 0) return emptyList()
        val white = w / whites
        var seen = 0
        return range.map { note ->
            if (isBlack(note)) {
                val seam = seen * white
                val drawn = white * BLACK_WIDTH
                val hit = white * BLACK_HIT_WIDTH
                PianoKey(
                    note,
                    true,
                    KeyRect(seam - drawn / 2, 0f, drawn, h * BLACK_HEIGHT),
                    KeyRect(seam - hit / 2, 0f, hit, h * BLACK_HEIGHT),
                )
            } else {
                val r = KeyRect(seen++ * white, 0f, white, h)
                PianoKey(note, false, r, r)
            }
        }
    }

    /**
     * The note under ([x], [y]), or null off the plate. A finger already on
     * [current] keeps it within [slop] of its edges, so a key doesn't flicker
     * between two neighbours: from a white key a black one takes over only
     * once the finger is [slop] inside it; a black key holds until the finger
     * is [slop] outside it. A fresh touch (no [current]) takes a black key
     * over the white under it.
     */
    fun keyAt(keys: List<PianoKey>, x: Float, y: Float, current: Int?, slop: Float): Int? {
        val held = current?.let { n -> keys.firstOrNull { it.note == n } }
        if (held != null) {
            val r = held.hitRect
            val near = x >= r.left - slop && x < r.right + slop && y >= r.top - slop && y < r.bottom + slop
            if (held.black) {
                if (near) return held.note
            } else {
                // Its top is the plate's: a black key is shrunk only on the sides it shares with whites.
                keys.firstOrNull {
                    it.black && x >= it.hitRect.left + slop && x < it.hitRect.right - slop && y >= it.hitRect.top && y < it.hitRect.bottom - slop
                }?.let { return it.note }
                if (near) return held.note
            }
        }
        return keys.firstOrNull { it.black && it.hitRect.contains(x, y) }?.note
            ?: keys.firstOrNull { !it.black && it.hitRect.contains(x, y) }?.note
    }

    /** Whether [note] is the root of [root]'s [scale] (any octave), in it, or outside it. */
    fun mark(note: Int, root: Int, scale: Scale): KeyMark {
        val step = ((note - root) % 12 + 12) % 12
        return when {
            step == 0 -> KeyMark.ROOT
            step in scale.intervals -> KeyMark.IN
            else -> KeyMark.OUT
        }
    }
}
