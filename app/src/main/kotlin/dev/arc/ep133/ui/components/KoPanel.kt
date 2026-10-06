package dev.arc.ep133.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.em
import dev.arc.ep133.text.GuideKeymap
import dev.arc.ep133.text.GuideText
import dev.arc.ep133.text.PanelKey
import dev.arc.ep133.text.StepKind
import dev.arc.ep133.ui.theme.LocalArcColors
import dev.arc.ep133.ui.theme.Manrope

/*
 * The K.O. II drawn whole, beside the Guide's list on a wide window (an
 * addition to the web version): the ports strip, the cream panel and its
 * grille, the display, the knob row, the LEDs and the function labels
 * between the rows of keys, the KEYS / FADER / SHIFT column and the fader,
 * the group keys, the pads and the two-tier function keys. Every key is a
 * cap like the app's (a flat face over a flat edge offset down and right),
 * and every knob a flat skirt and a raised flat cap, each over its own edge.
 *
 * It is laid out in units of a 560-wide drawing (the web draft's pixels) and
 * scaled to the size it is given. The keys of the selected shortcut are
 * outlined in signal orange with numbered step badges; the rest dim.
 */

/** Width over height of the drawing, its body's edge included. */
val KoAspect: Float = (Ko.W + Ko.EDGE_X) / (Ko.H + Ko.EDGE_Y)

/**
 * The K.O. II with [keymap]'s keys lit and their steps numbered; with no
 * keymap (or one with no keys on the panel) the device is drawn plain.
 */
@Composable
fun KoPanel(keymap: GuideKeymap?, modifier: Modifier = Modifier) {
    val ko = LocalHwColors.current.ko
    val c = LocalArcColors.current
    val measurer = rememberTextMeasurer()
    val lit = litOf(keymap)
    Canvas(
        modifier
            .aspectRatio(KoAspect)
            .semantics { contentDescription = GuideText.PANEL },
    ) {
        val s = size.width / (Ko.W + Ko.EDGE_X)
        KoDraw(this, measurer, s, ko, c.signal, c.signalEdge, c.onSignal, lit, keymap?.mode).draw()
    }
}

/** Where a step's keys sit: a key, or the fader itself (moved) rather than its FADER key. */
private data class Spot(val key: PanelKey, val slider: Boolean = false)

/** A badge over a spot: the steps it belongs to and what the first asks. */
private data class Badge(val steps: List<Int>, val kind: StepKind)

private class Lit(val spots: Set<Spot>, val badges: Map<Spot, Badge>)

/**
 * The spots a keymap lights and their badges. A step of one, two or three
 * keys numbers each of them; a step over a whole set (any pad, the digits,
 * the groups) is only outlined, as in the web draft: a badge over the top
 * row of pads would cover the labels between the rows, and the open row's
 * steps say it already.
 */
private fun litOf(keymap: GuideKeymap?): Lit {
    val steps = keymap?.steps.orEmpty()
    val spots = LinkedHashSet<Spot>()
    val numbers = LinkedHashMap<Spot, MutableList<Pair<Int, StepKind>>>()
    steps.forEachIndexed { i, step ->
        val here = step.keys.map { Spot(it, slider = it == PanelKey.FADER && step.kind == StepKind.MOVE) }
        spots += here
        if (here.size <= 3) for (spot in here) numbers.getOrPut(spot) { mutableListOf() } += (i + 1) to step.kind
    }
    return Lit(spots, numbers.mapValues { (_, l) -> Badge(l.map { it.first }, l.first().second) })
}

/** The drawing's layout, in units of a 560-wide device. */
private object Ko {
    const val W = 560f
    const val EDGE_X = 4f
    const val EDGE_Y = 6f
    const val RADIUS = 18f
    const val PORTS = 22f
    const val TOP = 92f
    const val SCREEN = 78f
    const val PAD_T = 14f
    const val PAD_X = 18f
    const val PAD_B = 20f
    const val GAP_X = 14f
    const val GAP_Y = 5f
    const val LABEL = 14f
    const val KEY_R = 6f

    /** A pad column's width; the first column (KEYS, FADER, SHIFT) is 0.78 of it. */
    const val UNIT = (W - 2 * PAD_X - 6 * GAP_X) / 6.78f
    const val COL0 = 0.78f * UNIT
    const val PAD = UNIT / 1.08f
    const val KNOB = UNIT * 0.92f
    const val BODY = PORTS + TOP + SCREEN

    /** The body's rows: labels, knobs, then an LED row over each row of keys. */
    val ROWS = floatArrayOf(LABEL, KNOB, LABEL, PAD, LABEL, PAD, LABEL, PAD, LABEL, PAD)
    val H = BODY + PAD_T + ROWS.sum() + GAP_Y * (ROWS.size - 1) + PAD_B

    fun colX(i: Int) = if (i == 0) PAD_X else PAD_X + COL0 + GAP_X + (i - 1) * (UNIT + GAP_X)
    fun colW(i: Int) = if (i == 0) COL0 else UNIT
    fun rowY(i: Int): Float {
        var y = BODY + PAD_T
        for (r in 0 until i) y += ROWS[r] + GAP_Y
        return y
    }

    /** A box [w] × [h] centred in row [row] and column [col]. */
    fun cell(col: Int, row: Int, w: Float = colW(col), h: Float = ROWS[row]): Rect {
        val x = colX(col) + (colW(col) - w) / 2
        val y = rowY(row) + (ROWS[row] - h) / 2
        return Rect(x, y, x + w, y + h)
    }

    /** The fader's slot: the first column, from the LED row under FADER to the one over SHIFT. */
    val FADER_SLOT: Rect = run {
        val top = rowY(6) + 10f
        val bottom = rowY(8) + LABEL - 10f
        val x = colX(0) + COL0 / 2
        Rect(x - 4f, top, x + 4f, bottom)
    }
    val FADER_KNOB: Rect = run {
        val cy = FADER_SLOT.top + FADER_SLOT.height * 0.38f
        Rect(FADER_SLOT.center.x - 15f, cy - 15f, FADER_SLOT.center.x + 15f, cy + 15f)
    }

    /** Where each key sits. Knobs are their square box. */
    val RECTS: Map<PanelKey, Rect> = buildMap {
        put(PanelKey.VOL, cell(0, 1, COL0 * 0.92f, COL0 * 0.92f))
        put(PanelKey.SOUND, cell(1, 1, h = UNIT / 1.6f))
        put(PanelKey.MAIN, cell(2, 1, h = UNIT / 1.6f))
        put(PanelKey.TEMPO, cell(3, 1, h = UNIT / 1.6f))
        put(PanelKey.X, cell(5, 1, KNOB, KNOB))
        put(PanelKey.Y, cell(6, 1, KNOB, KNOB))
        val wide = COL0 / 2.1f
        put(PanelKey.KEYS, cell(0, 3, h = wide))
        put(PanelKey.FADER, cell(0, 5, h = wide))
        put(PanelKey.SHIFT, cell(0, 9, h = wide))
        val rows = listOf(
            listOf(PanelKey.A, PanelKey.P7, PanelKey.P8, PanelKey.P9, PanelKey.SAMPLE, PanelKey.TIMING),
            listOf(PanelKey.B, PanelKey.P4, PanelKey.P5, PanelKey.P6, PanelKey.FX, PanelKey.ERASE),
            listOf(PanelKey.C, PanelKey.P1, PanelKey.P2, PanelKey.P3, PanelKey.MINUS, PanelKey.PLUS),
            listOf(PanelKey.D, PanelKey.DOT, PanelKey.P0, PanelKey.ENTER, PanelKey.REC, PanelKey.PLAY),
        )
        rows.forEachIndexed { r, keys -> keys.forEachIndexed { i, k -> put(k, cell(i + 1, 3 + 2 * r, h = PAD)) } }
    }

    fun rect(spot: Spot): Rect = if (spot.slider) FADER_KNOB else RECTS.getValue(spot.key)

    val KNOBS = setOf(PanelKey.VOL, PanelKey.X, PanelKey.Y)
}

/** One frame of the drawing: [s] is device pixels per unit. */
private class KoDraw(
    val scope: DrawScope,
    val measurer: TextMeasurer,
    val s: Float,
    val ko: KoColors,
    val signal: Color,
    val signalEdge: Color,
    val onSignal: Color,
    val lit: Lit,
    val mode: String?,
) {
    private val dimming = lit.spots.isNotEmpty()

    private fun dim(spot: Spot) = dimming && spot !in lit.spots

    /** A colour faded to 30% over the body, as a key that isn't part of the shortcut. */
    private fun Color.d(dim: Boolean) = if (dim) lerp(ko.body, this, 0.3f) else this

    private fun o(x: Float, y: Float) = Offset(x * s, y * s)
    private fun sz(w: Float, h: Float) = Size(w * s, h * s)
    private fun Rect.px() = Rect(left * s, top * s, right * s, bottom * s)

    private val base = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Medium, fontFeatureSettings = "tnum")

    /**
     * Text [size] units tall at [x], [y]: [align] -1 starts it at x, 0 centres
     * it, 1 ends it there; [top] puts its top at y instead of its middle.
     */
    private fun text(
        t: String, size: Float, color: Color, x: Float, y: Float,
        align: Int = 0, weight: FontWeight = FontWeight.Medium, spacing: Float = 0f,
        mono: Boolean = false, top: Boolean = false,
    ) = with(scope) {
        val style = base.copy(
            color = color, fontSize = (size * s).toSp(), fontWeight = weight, letterSpacing = spacing.em,
            fontFamily = if (mono) FontFamily.Monospace else Manrope,
        )
        val layout = measurer.measure(t, style)
        val w = layout.size.width
        val h = layout.size.height
        val left = when (align) {
            -1 -> x * s
            1 -> x * s - w
            else -> x * s - w / 2f
        }
        drawText(layout, topLeft = Offset(left, if (top) y * s else y * s - h / 2f))
    }

    /** How wide [t] would be, in units. */
    private fun width(t: String, size: Float, weight: FontWeight, spacing: Float = 0f, mono: Boolean = false): Float = with(scope) {
        val style = base.copy(fontSize = (size * s).toSp(), fontWeight = weight, letterSpacing = spacing.em, fontFamily = if (mono) FontFamily.Monospace else Manrope)
        measurer.measure(t, style).size.width / s
    }

    /** A cap: [face] over [edge] offset 2 right and 3 down. */
    private fun cap(r: Rect, face: Color, edge: Color, radius: Float = Ko.KEY_R) = with(scope) {
        val cr = CornerRadius(radius * s)
        drawRoundRect(edge, topLeft = o(r.left + 2f, r.top + 3f), size = sz(r.width, r.height), cornerRadius = cr)
        drawRoundRect(face, topLeft = o(r.left, r.top), size = sz(r.width, r.height), cornerRadius = cr)
    }

    fun draw() {
        body()
        scope.clipPath(Path().apply { addRoundRect(RoundRect(Rect(0f, 0f, Ko.W * s, Ko.H * s), CornerRadius(Ko.RADIUS * s))) }) {
            ports()
            top()
            screen()
            labels()
            keys()
            knobs()
            fader()
            outlines()
            badges()
        }
    }

    private fun body() = with(scope) {
        val cr = CornerRadius(Ko.RADIUS * s)
        drawRoundRect(ko.edge, topLeft = o(Ko.EDGE_X, Ko.EDGE_Y), size = sz(Ko.W, Ko.H), cornerRadius = cr)
        drawRoundRect(ko.body, size = sz(Ko.W, Ko.H), cornerRadius = cr)
    }

    /** OUTPUT, INPUT, SYNC · MIDI, USB and POWER along the top edge. */
    private fun ports() = with(scope) {
        drawRect(ko.panel, size = sz(Ko.W, Ko.PORTS))
        val cols = floatArrayOf(0.06f, 0.13f, 0.08f, 0.09f, 0.19f, 0.13f, 0.09f)
        val xs = FloatArray(cols.size + 1)
        for (i in cols.indices) xs[i + 1] = xs[i] + cols[i] * Ko.W
        val (output, input, sync, usb, power) = GuideText.PORTS
        fun port(i: Int, label: String, face: Color?, ink: Color) {
            val l = xs[i]
            val r = xs[i + 1]
            if (face != null) drawRect(face, topLeft = o(l, 0f), size = sz(r - l, Ko.PORTS))
            text(label.uppercase(), 8.5f, ink, (l + r) / 2, Ko.PORTS / 2, spacing = 0.1f)
        }
        port(1, output, ko.portLight, ko.portLightInk)
        port(3, input, signal, onSignal)
        port(4, sync, ko.portDark, ko.portDarkInk)
        port(6, usb, ko.greyFace, ko.greyInk)
        text(power.uppercase(), 8.5f, ko.portInk, Ko.W - 10f, Ko.PORTS / 2, align = 1, spacing = 0.1f)
    }

    /** The cream panel with its rule, and the speaker grille. */
    private fun top() = with(scope) {
        val y = Ko.PORTS
        val grille = Ko.W * 0.34f
        val panelW = Ko.W - grille
        drawRect(ko.panel, topLeft = o(0f, y), size = sz(panelW, Ko.TOP))
        drawRect(ko.label.copy(alpha = 0.18f), topLeft = o(14f, y + Ko.TOP - 12f), size = sz(panelW * 0.46f, 2f))
        drawRect(ko.grille, topLeft = o(panelW, y), size = sz(grille, Ko.TOP))
        clipRect(panelW * s, y * s, Ko.W * s, (y + Ko.TOP) * s) {
            var gy = y + 5.5f
            while (gy < y + Ko.TOP + 4f) {
                var gx = panelW + 5.5f
                while (gx < Ko.W + 4f) {
                    drawCircle(ko.grilleHole, radius = 3.4f * s, center = o(gx, gy))
                    gx += 11f
                }
                gy += 11f
            }
        }
    }

    /** The display: the mode's name, three digits and the group. */
    private fun screen() = with(scope) {
        val y = Ko.PORTS + Ko.TOP
        drawRect(ko.screen, topLeft = o(0f, y), size = sz(Ko.W, Ko.SCREEN))
        val cy = y + Ko.SCREEN / 2
        val tag = (mode ?: GuideText.panelLabel(PanelKey.SOUND)).uppercase()
        val digits = listOf(PanelKey.P1, PanelKey.P2, PanelKey.P3).joinToString(" ") { GuideText.panelLabel(it) }
        val group = GuideText.panelLabel(PanelKey.A)
        val tagW = width(tag, 11f, FontWeight.Bold, 0.12f) + 12f
        val digitsW = width(digits, 34f, FontWeight.Normal, 0.12f, mono = true)
        val groupW = width(group, 11f, FontWeight.Medium, 0.1f) + 10f
        var x = (Ko.W - (tagW + digitsW + groupW + 36f)) / 2
        drawRoundRect(ko.screenTag, topLeft = o(x, cy - 10f), size = sz(tagW, 20f), cornerRadius = CornerRadius(3f * s))
        text(tag, 11f, ko.screenTagInk, x + tagW / 2, cy, weight = FontWeight.Bold, spacing = 0.12f)
        x += tagW + 18f
        text(digits, 34f, ko.screenInk, x, cy, align = -1, weight = FontWeight.Normal, spacing = 0.12f, mono = true)
        x += digitsW + 18f
        drawRoundRect(signal, topLeft = o(x, cy - 10f), size = sz(groupW, 20f), cornerRadius = CornerRadius(3f * s), style = Stroke(1.5f * s))
        text(group, 11f, signal, x + groupW / 2, cy, spacing = 0.1f)
    }

    /** VOLUME, BPM and METRONOME over the knobs; the LEDs and their labels; the X and Y tags. */
    private fun labels() {
        for (k in Ko.KNOBS) {
            val col = when (k) {
                PanelKey.VOL -> 0
                PanelKey.X -> 5
                else -> 6
            }
            GuideText.knobLabel(k)?.let { text(it.uppercase(), 9.5f, ko.label, Ko.colX(col) + Ko.colW(col) / 2, Ko.rowY(0) + Ko.LABEL / 2, spacing = 0.06f) }
        }
        // Which LEDs are lit, as on the device mid-song: by column, per LED row.
        val on = listOf(setOf(1, 4), setOf(2, 3), emptySet(), setOf(3, 6))
        GuideText.LED_ROWS.forEachIndexed { r, words ->
            val row = 2 + 2 * r
            val cy = Ko.rowY(row) + Ko.LABEL / 2
            for (col in 1..4) {
                val x = Ko.colX(col) + Ko.colW(col) * 0.22f
                led(x + 3f, cy, col in on[r])
                if (col > 1) text(words[col - 2].uppercase(), 9.5f, ko.label, x + 12f, cy, align = -1, spacing = 0.06f)
            }
            if (r == 3) for (col in 5..6) led(Ko.colX(col) + Ko.colW(col) / 2, cy, col in on[r])
        }
        val cy = Ko.rowY(2) + Ko.LABEL / 2
        xyTag(GuideText.panelLabel(PanelKey.X), Ko.colX(5) + Ko.UNIT / 2, cy, signal, onSignal)
        xyTag(GuideText.panelLabel(PanelKey.Y), Ko.colX(6) + Ko.UNIT / 2, cy, ko.yTag, onSignal)
    }

    private fun led(cx: Float, cy: Float, on: Boolean) = with(scope) {
        if (on) drawCircle(ko.ledOn.copy(alpha = 0.3f), radius = 5.5f * s, center = o(cx, cy))
        drawCircle(if (on) ko.ledOn else ko.ledOff, radius = 3f * s, center = o(cx, cy))
    }

    private fun xyTag(t: String, cx: Float, cy: Float, face: Color, ink: Color) = with(scope) {
        val w = width(t, 10f, FontWeight.ExtraBold) + 10f
        drawRoundRect(face, topLeft = o(cx - w / 2, cy - 7f), size = sz(w, 14f), cornerRadius = CornerRadius(3f * s))
        text(t, 10f, ink, cx, cy, weight = FontWeight.ExtraBold)
    }

    private fun keys() {
        for ((k, r) in Ko.RECTS) {
            if (k in Ko.KNOBS) continue
            val dim = dim(Spot(k))
            when (k) {
                PanelKey.SOUND -> split(r, k, ko.darkFace, ko.darkEdge, ko.darkInk, ko.lightFace, ko.tierInk, dim)
                PanelKey.MAIN -> split(r, k, ko.darkFace, ko.darkEdge, ko.darkInk, signal, onSignal, dim)
                PanelKey.TEMPO -> split(r, k, ko.darkFace, ko.darkEdge, ko.darkInk, ko.loopFace, onSignal, dim)
                PanelKey.SAMPLE -> split(r, k, signal, signalEdge, onSignal, ko.lightFace, ko.tierInk, dim)
                PanelKey.TIMING, PanelKey.FX -> split(r, k, ko.darkFace, ko.darkEdge, ko.darkInk, ko.lightFace, ko.tierInk, dim)
                PanelKey.ERASE -> split(r, k, ko.lightFace, ko.lightEdge, ko.tierInk, ko.lightFace, ko.tierInk, dim, rule = true)
                PanelKey.KEYS, PanelKey.FADER -> wide(r, k, ko.darkFace, ko.darkEdge, ko.darkInk, dim)
                PanelKey.SHIFT -> wide(r, k, ko.lightFace, ko.lightEdge, ko.lightInk, dim)
                PanelKey.A, PanelKey.B, PanelKey.C, PanelKey.D -> group(r, k, dim)
                PanelKey.MINUS, PanelKey.PLUS -> sign(r, k == PanelKey.PLUS, dim)
                PanelKey.ENTER -> word(r, k, ko.darkFace, ko.darkEdge, ko.darkInk, dim)
                PanelKey.REC -> word(r, k, signal, signalEdge, onSignal, dim)
                PanelKey.PLAY -> word(r, k, ko.greyFace, ko.greyEdge, ko.greyInk, dim)
                else -> pad(r, k, dim)
            }
        }
    }

    /** A number pad: the digit in its top-left corner (the dot drawn as one). */
    private fun pad(r: Rect, k: PanelKey, dim: Boolean) {
        cap(r, ko.darkFace.d(dim), ko.darkEdge.d(dim))
        if (k == PanelKey.DOT) {
            scope.drawCircle(ko.darkInk.d(dim), radius = 2.2f * s, center = o(r.left + 12f, r.top + 17f))
        } else {
            text(GuideText.panelLabel(k), 18f, ko.darkInk.d(dim), r.left + 8f, r.top + 4f, align = -1, top = true)
        }
    }

    /** ENTER, RECORD and PLAY: pad-sized, their word small in the corner. */
    private fun word(r: Rect, k: PanelKey, face: Color, edge: Color, ink: Color, dim: Boolean) {
        cap(r, face.d(dim), edge.d(dim))
        text(GuideText.panelLabel(k).uppercase(), 11f, ink.d(dim), r.left + 8f, r.top + 7f, align = -1, spacing = 0.06f, top = true)
    }

    /** KEYS, FADER and SHIFT: short wide keys in the first column. */
    private fun wide(r: Rect, k: PanelKey, face: Color, edge: Color, ink: Color, dim: Boolean) {
        cap(r, face.d(dim), edge.d(dim))
        text(GuideText.panelLabel(k).uppercase(), 9.5f, ink.d(dim), r.center.x, r.center.y, spacing = 0.08f)
    }

    /** A two-tier key: its own word on the upper face, the shifted one on the lower. */
    private fun split(r: Rect, k: PanelKey, face: Color, edge: Color, ink: Color, lower: Color, lowerInk: Color, dim: Boolean, rule: Boolean = false) = with(scope) {
        cap(r, face.d(dim), edge.d(dim))
        val mid = r.top + r.height / 2
        clipPath(Path().apply { addRoundRect(RoundRect(Rect(r.left, mid, r.right, r.bottom).px(), CornerRadius(0f), CornerRadius(0f), CornerRadius(Ko.KEY_R * s), CornerRadius(Ko.KEY_R * s))) }) {
            drawRect(lower.d(dim), topLeft = o(r.left, mid), size = sz(r.width, r.height / 2))
        }
        if (rule) drawRect(ko.tierLine.d(dim), topLeft = o(r.left, mid), size = sz(r.width, 1f))
        text(GuideText.panelLabel(k).uppercase(), 9.5f, ink.d(dim), r.center.x, (r.top + mid) / 2, spacing = 0.08f)
        GuideText.panelSub(k)?.let { text(it.uppercase(), 9.5f, lowerInk.d(dim), r.center.x, (mid + r.bottom) / 2, spacing = 0.08f) }
    }

    /** A group key: its letter in the corner and its function's glyph under it. */
    private fun group(r: Rect, k: PanelKey, dim: Boolean) = with(scope) {
        cap(r, ko.lightFace.d(dim), ko.lightEdge.d(dim))
        val ink = ko.lightInk.d(dim)
        text(GuideText.panelLabel(k), 18f, ink, r.left + 8f, r.top + 4f, align = -1, top = true)
        // The glyph printed under the letter, in a 12-unit box: A ✳ (fill), B ↩ (repeat), C ⤒ (copy), D ↓ (paste).
        val g = ink.copy(alpha = ink.alpha * 0.8f)
        val x = r.left + 8f
        val y = r.bottom - 18f
        val w = 1.2f * s
        fun line(x1: Float, y1: Float, x2: Float, y2: Float) = drawLine(g, o(x + x1, y + y1), o(x + x2, y + y2), strokeWidth = w, cap = StrokeCap.Round)
        when (k) {
            PanelKey.A -> {
                line(6f, 1.5f, 6f, 10.5f); line(1.5f, 6f, 10.5f, 6f)
                line(2.8f, 2.8f, 9.2f, 9.2f); line(9.2f, 2.8f, 2.8f, 9.2f)
            }
            PanelKey.B -> {
                line(10f, 2f, 10f, 7f); line(10f, 7f, 2f, 7f)
                line(2f, 7f, 4.5f, 4.5f); line(2f, 7f, 4.5f, 9.5f)
            }
            PanelKey.C -> {
                line(2f, 1.5f, 10f, 1.5f); line(6f, 11f, 6f, 4f)
                line(6f, 4f, 3.5f, 6.5f); line(6f, 4f, 8.5f, 6.5f)
            }
            else -> {
                line(6f, 1.5f, 6f, 10.5f)
                line(6f, 10.5f, 3.5f, 8f); line(6f, 10.5f, 8.5f, 8f)
            }
        }
    }

    /** − and +, pale and pad-sized, the sign drawn in the middle. */
    private fun sign(r: Rect, plus: Boolean, dim: Boolean) = with(scope) {
        cap(r, ko.lightFace.d(dim), ko.lightEdge.d(dim))
        val ink = ko.lightInk.d(dim)
        val c = r.center
        val w = 1.6f * s
        drawLine(ink, o(c.x - 7f, c.y), o(c.x + 7f, c.y), strokeWidth = w)
        if (plus) drawLine(ink, o(c.x, c.y - 7f), o(c.x, c.y + 7f), strokeWidth = w)
    }

    /** VOLUME (white), X (orange) and Y (black): a skirt and a raised cap, each over its own offset edge. */
    private fun knobs() = with(scope) {
        for (k in Ko.KNOBS) {
            val r = Ko.RECTS.getValue(k)
            val dim = dim(Spot(k))
            val (skirt, skirtEdge, cap, capEdge) = when (k) {
                PanelKey.VOL -> ko.knobWhite
                PanelKey.X -> ko.knobOrange
                else -> ko.knobBlack
            }.map { it.d(dim) }
            val u = r.width / 100f
            fun at(x: Float, y: Float) = o(r.left + x * u, r.top + y * u)
            drawCircle(skirtEdge, radius = 45f * u * s, center = at(53f, 55f))
            drawCircle(skirt, radius = 45f * u * s, center = at(50f, 50f))
            drawCircle(skirtEdge.copy(alpha = 0.35f), radius = 38f * u * s, center = at(50f, 50f), style = Stroke(1.5f * u * s))
            drawCircle(capEdge, radius = 25f * u * s, center = at(51.5f, 52.5f))
            drawCircle(cap, radius = 25f * u * s, center = at(49f, 48f))
        }
    }

    /** The fader: a black slot and its round grey knob. */
    private fun fader() = with(scope) {
        val slot = Ko.FADER_SLOT
        drawRoundRect(ko.faderTrack, topLeft = o(slot.left, slot.top), size = sz(slot.width, slot.height), cornerRadius = CornerRadius(4f * s))
        val dim = dim(Spot(PanelKey.FADER, slider = true))
        val k = Ko.FADER_KNOB
        drawCircle(ko.faderEdge.d(dim), radius = 15f * s, center = o(k.center.x + 1f, k.center.y + 2f))
        drawCircle(ko.loopFace.d(dim), radius = 15f * s, center = o(k.center.x, k.center.y))
    }

    /** A signal outline around each lit key's face, 3 units off it; a ring around a lit knob or the fader's knob. */
    private fun outlines() = with(scope) {
        val stroke = Stroke(3f * s)
        for (spot in lit.spots) {
            val r = Ko.rect(spot)
            if (spot.slider || spot.key in Ko.KNOBS) {
                drawCircle(signal, radius = (r.width / 2 + 4.5f) * s, center = o(r.center.x, r.center.y), style = stroke)
            } else {
                val g = 4.5f
                drawRoundRect(
                    signal, topLeft = o(r.left - g, r.top - g), size = sz(r.width + 2 * g, r.height + 2 * g),
                    cornerRadius = CornerRadius((Ko.KEY_R + g) * s), style = stroke,
                )
            }
        }
    }

    /** "1 HOLD" over a key's top-right corner: its steps and, for all but a press, what to do. */
    private fun badges() = with(scope) {
        for ((spot, b) in lit.badges) {
            val r = Ko.rect(spot)
            val label = b.steps.joinToString("·") + (GuideText.stepTag(b.kind)?.let { " $it" } ?: "")
            val hold = b.kind == StepKind.HOLD
            val w = maxOf(22f, width(label, 11f, FontWeight.ExtraBold, 0.04f) + 12f)
            val right = minOf(r.right + 10f, Ko.W - 4f)
            val top = r.top - 12f
            drawRoundRect(if (hold) HoldFace else signal, topLeft = o(right - w, top), size = sz(w, 22f), cornerRadius = CornerRadius(11f * s))
            text(label, 11f, if (hold) HoldInk else onSignal, right - w / 2, top + 11f, weight = FontWeight.ExtraBold, spacing = 0.04f)
        }
    }
}
