package dev.arc.ep133.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.input.pointer.PointerId
import androidx.compose.ui.input.pointer.changedToDownIgnoreConsumed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.features.KeyMark
import dev.arc.ep133.features.Keys
import dev.arc.ep133.features.MirrorState
import dev.arc.ep133.features.NoteEvent
import dev.arc.ep133.features.NoteNames
import dev.arc.ep133.features.NoteTouches
import dev.arc.ep133.features.Piano
import dev.arc.ep133.features.PianoKey
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.CapDx
import dev.arc.ep133.ui.components.CapDy
import dev.arc.ep133.ui.components.HwColors
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.PlateRadius
import dev.arc.ep133.ui.components.capEdge
import dev.arc.ep133.ui.theme.ArcColors
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlin.math.roundToInt

/*
 * Live's KEYS on a phone on its side (an addition): a chromatic piano in place
 * of the EP-133's 4×3 keypad. Every key plays; the key and scale only mark
 * them, as the grid's rings do: orange for the root, navy for the scale's
 * other notes, dimmed and unnamed outside it. A finger slides from key to
 * key (a glissando), and several fingers make a chord.
 *
 * The keys are caps, as every key in the app (see Cap.kt): each a flat face
 * over a flat edge offset down and to the right, sitting in the device's grey
 * body with a gap between white keys; a key sounding on the phone is down on
 * its edge.
 */

/** How far past a key's edge a sliding finger keeps it, so it doesn't flicker between two keys. */
private val SlideSlop = 6.dp

/** The body around the keys; on the right and below, the caps' edges sit in it too. */
private val DeckInset = 10.dp

/** The body showing between two white keys. */
private val WhiteGap = 4.dp

private val WhiteRadius = 6.dp
private val BlackRadius = 4.dp

/**
 * The piano over [range]: device notes light their own key (and one the
 * piano doesn't reach puts an orange tick at that end), the notes playing on
 * the phone are outlined. [now] is the fade's clock, read while drawing so a
 * fade redraws the keys without recomposing them.
 */
@Composable
internal fun PianoKeyboard(
    range: IntRange,
    st: MirrorState,
    keys: KeysUi,
    now: () -> Long,
    actions: KeysActions,
    modifier: Modifier = Modifier,
) {
    // Low notes on the left in every language, as on the instrument.
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Keyboard(range, st, keys, now, actions, modifier)
    }
}

@Composable
private fun Keyboard(range: IntRange, st: MirrorState, keys: KeysUi, now: () -> Long, actions: KeysActions, modifier: Modifier) {
    val c = LocalArcColors.current
    val hw = LocalHwColors.current
    val density = LocalDensity.current
    val measurer = rememberTextMeasurer()
    // The names stay legible at large text sizes, but never outgrow the keys.
    val labels = remember(keys.names, range, density) {
        Labels(measurer, keys.names, range, Density(density.density, minOf(density.fontScale, 1.3f)))
    }
    val geometry = remember { Geometry() }
    val touches = remember { NoteTouches() }
    val currentRange by rememberUpdatedState(range)
    val currentActions by rememberUpdatedState(actions)
    fun play(events: List<NoteEvent>) = events.forEach { e ->
        when (e) {
            is NoteEvent.Press -> currentActions.onNote(e.note, true)
            is NoteEvent.Release -> currentActions.onNoteUp(e.note)
        }
    }
    Layout(
        content = {
            // For screen readers, a node over each key (the plate itself takes the touches):
            // its name and mark, and Play, which sounds the note to its end.
            for (note in range) {
                val mark = Piano.mark(note, keys.root, keys.scale)
                Box(
                    Modifier.semantics {
                        contentDescription = MirrorText.pianoKey(note, keys.names, mark)
                        role = Role.Button
                        onClick(label = MirrorText.PLAY) {
                            currentActions.onNote(note, false)
                            true
                        }
                    },
                )
            }
        },
        modifier = modifier
            .clip(RoundedCornerShape(PlateRadius))
            .background(hw.body)
            // The keys, their touches and their screen-reader nodes all live inside the body.
            .padding(start = DeckInset, top = DeckInset, end = DeckInset + CapDx, bottom = DeckInset + CapDy)
            .semantics {
                isTraversalGroup = true
                contentDescription = MirrorText.pianoRange(range.first, range.last, keys.names)
            }
            .pointerInput(Unit) {
                val slop = SlideSlop.toPx()
                awaitEachGesture {
                    // Each finger: the note under it, where it was, and which layout that was in.
                    val fingers = HashMap<PointerId, Finger>()
                    try {
                        do {
                            val event = awaitPointerEvent()
                            val laid = geometry.keys(currentRange, size.width.toFloat(), size.height.toFloat())
                            for (ch in event.changes) {
                                val id = ch.id.value
                                val f = fingers[ch.id]
                                when {
                                    ch.changedToDownIgnoreConsumed() -> {
                                        val note = Piano.keyAt(laid, ch.position.x, ch.position.y, null, 0f)
                                        fingers[ch.id] = Finger(note, ch.position, geometry.generation)
                                        if (note != null) play(touches.down(id, note))
                                    }
                                    // Lifted, or taken over (a cancel lifts it too).
                                    !ch.pressed -> {
                                        fingers.remove(ch.id)
                                        play(touches.up(id))
                                    }
                                    ch.positionChanged() -> {
                                        // After − or +, a finger resting on a key keeps the note it
                                        // pressed until it really moves.
                                        val resting = f != null && f.generation != geometry.generation &&
                                            (ch.position - f.anchor).getDistance() <= viewConfiguration.touchSlop
                                        if (!resting) {
                                            val note = Piano.keyAt(laid, ch.position.x, ch.position.y, f?.note, slop)
                                            fingers[ch.id] = Finger(note, ch.position, geometry.generation)
                                            play(touches.move(id, note))
                                        }
                                    }
                                }
                                ch.consume()
                            }
                        } while (event.changes.any { it.pressed })
                    } finally {
                        // Also when the keys leave the screen (turned upright, or PADS) under a finger.
                        play(touches.releaseAll())
                    }
                }
            }
            .drawBehind {
                val laid = geometry.keys(range, size.width, size.height)
                drawPiano(laid, range, st, keys, now(), c, hw, labels)
            },
    ) { measurables, constraints ->
        val w = if (constraints.hasBoundedWidth) constraints.maxWidth else constraints.minWidth
        val h = if (constraints.hasBoundedHeight) constraints.maxHeight else constraints.minHeight
        val laid = geometry.keys(range, w.toFloat(), h.toFloat())
        val nodes = measurables.mapIndexed { i, m ->
            val r = laid[i].rect
            m.measure(Constraints.fixed(r.width.roundToInt().coerceAtLeast(0), r.height.roundToInt().coerceAtLeast(0)))
        }
        layout(w, h) {
            // Placed as drawn, left to right whatever the language; a black key over its white neighbours.
            nodes.forEachIndexed { i, p ->
                val k = laid[i]
                p.place(k.rect.left.roundToInt(), k.rect.top.roundToInt(), zIndex = if (k.black) 1f else 0f)
            }
        }
    }
}

/** One finger on the keys: its note (null off them), where it last moved, and the layout it was in. */
private data class Finger(val note: Int?, val anchor: Offset, val generation: Int)

/**
 * The keys laid out for one range and size (in pixels), kept until either
 * changes. [generation] counts the changes, so a finger can tell the keys
 * moved under it (− or +) from its own slide.
 */
private class Geometry {
    private var range: IntRange = IntRange.EMPTY
    private var w = -1f
    private var h = -1f
    private var laid: List<PianoKey> = emptyList()
    var generation = 0
        private set

    fun keys(range: IntRange, w: Float, h: Float): List<PianoKey> {
        if (range != this.range || w != this.w || h != this.h) {
            this.range = range
            this.w = w
            this.h = h
            laid = Piano.layout(range, w, h)
            generation++
        }
        return laid
    }
}

/** The keys' words, measured once per name style and range: the twelve note names and each C's octave. */
private class Labels(measurer: TextMeasurer, names: NoteNames, range: IntRange, density: Density) {
    private val whiteStyle = ArcType.semi.copy(fontSize = 13.sp, letterSpacing = 0.02.em, lineHeight = 1.em)
    private val blackStyle = whiteStyle.copy(fontSize = 11.sp)
    private val digitStyle = ArcType.tiny.copy(fontSize = 11.sp, lineHeight = 1.em)
    private val byClass: List<TextLayoutResult> = (0..11).map { pc ->
        measurer.measure(Keys.name(pc, names), if (Piano.isBlack(pc)) blackStyle else whiteStyle, maxLines = 1, softWrap = false, density = density)
    }
    private val digits: Map<Int, TextLayoutResult> = range.filter { it % 12 == 0 }.associateWith {
        measurer.measure(Keys.octaveOf(it).toString(), digitStyle, maxLines = 1, softWrap = false, density = density)
    }
    val digitHeight: Int = digits.values.firstOrNull()?.size?.height ?: 0
    /** The widest name on a white key and on a black one, so the rings can fit them. */
    val widestWhite: Int = byClass.filterIndexed { pc, _ -> !Piano.isBlack(pc) }.maxOf { it.size.width }
    val widestBlack: Int = byClass.filterIndexed { pc, _ -> Piano.isBlack(pc) }.maxOf { it.size.width }

    fun name(note: Int): TextLayoutResult = byClass[note % 12]

    fun digit(note: Int): TextLayoutResult? = digits[note]
}

private fun DrawScope.drawPiano(
    laid: List<PianoKey>,
    range: IntRange,
    st: MirrorState,
    keys: KeysUi,
    now: Long,
    c: ArcColors,
    hw: HwColors,
    labels: Labels,
) {
    if (laid.isEmpty()) return
    // How lit each key is (the device's notes, by their exact pitch), and the
    // brightest note past either end.
    val lit = HashMap<Int, Float>()
    var below = 0f
    var above = 0f
    for ((n, l) in st.notes) {
        val g = glow(l, now)
        if (g <= 0f) continue
        when {
            n < range.first -> below = maxOf(below, g)
            n > range.last -> above = maxOf(above, g)
            else -> lit[n] = g
        }
    }
    val line = 1.dp.toPx()
    val held = 2.dp.toPx()
    val rootOnWhite = c.rootOn(c.pianoWhite)
    // A key down on its edge: the face, and all drawn on it, moved by the edge's offset.
    val travel = Offset(CapDx.toPx(), CapDy.toPx())
    val gap = WhiteGap.toPx()
    val whiteCorner = CornerRadius(WhiteRadius.toPx())

    // White keys: caps with the body between them, then their marks (under the black keys).
    val white = laid.first { !it.black }.rect
    val faceWidth = white.width - gap
    val foot = 14.dp.toPx()
    val spare = white.height * (1f - Piano.BLACK_HEIGHT) - foot - labels.digitHeight - 8.dp.toPx()
    // Round the name with room to spare, within the key.
    val ring = minOf(34.dp.toPx(), faceWidth - 14.dp.toPx(), spare)
        .coerceAtLeast(labels.widestWhite + 14.dp.toPx())
        .coerceAtMost(faceWidth - 6.dp.toPx())
    for (k in laid) {
        if (k.black) continue
        val r = k.rect
        val mark = Piano.mark(k.note, keys.root, keys.scale)
        val g = lit[k.note] ?: 0f
        val playing = k.note in keys.playingNotes
        val color = lerp(if (mark == KeyMark.OUT) c.keyOut else c.pianoWhite, c.signal, g)
        val face = drawCap(Rect(r.left + gap / 2, r.top, r.right - gap / 2, r.bottom), whiteCorner, color, capEdge(color), playing, travel)
        val cx = face.center.x
        val cy = face.bottom - foot - ring / 2
        val onLit = g > 0.3f
        if (mark != KeyMark.OUT) {
            val ink = if (onLit) c.onSignal else if (mark == KeyMark.ROOT) rootOnWhite else c.navy
            drawMark(mark, ink, Offset(cx, cy), ring, face.bottom)
            drawLabel(labels.name(k.note), if (onLit) c.onSignal else c.ink, Offset(cx, cy))
        }
        // Each C carries its octave; OCT's own C in ink.
        labels.digit(k.note)?.let { d ->
            val own = k.note == Piano.lowest(keys.octave) + 12
            val ink = if (onLit) c.onSignal else if (own) c.ink else c.pianoDigit
            drawText(d, ink, Offset(cx - d.size.width / 2f, cy - ring / 2 - 4.dp.toPx() - d.size.height))
        }
        if (playing) drawHeld(face, whiteCorner, held, c.pianoSignal)
    }

    // Black keys over them: dark caps, outlined (in the dark theme the outline is what
    // holds a black key apart from its white neighbours).
    val black = laid.firstOrNull { it.black }?.rect
    val blackRing = black?.let {
        minOf(24.dp.toPx(), it.width - 6.dp.toPx()).coerceAtLeast(labels.widestBlack + 10.dp.toPx()).coerceAtMost(it.width - 4.dp.toPx())
    } ?: 0f
    val blackCorner = CornerRadius(BlackRadius.toPx())
    for (k in laid) {
        if (!k.black) continue
        val r = k.rect
        val mark = Piano.mark(k.note, keys.root, keys.scale)
        val g = lit[k.note] ?: 0f
        val playing = k.note in keys.playingNotes
        val color = lerp(if (mark == KeyMark.OUT) c.keyOutBlack else c.pianoBlack, c.signal, g)
        val face = drawCap(Rect(r.left, r.top, r.right, r.bottom), blackCorner, color, lerp(hw.darkEdge, c.signalEdge, g), playing, travel)
        drawRoundRect(c.pianoLine, face.topLeft, face.size, blackCorner, style = Stroke(line))
        val onLit = g > 0.3f
        if (mark != KeyMark.OUT) {
            val cx = face.center.x
            val cy = face.bottom - 12.dp.toPx() - blackRing / 2
            val ink = if (onLit) c.onSignal else if (mark == KeyMark.ROOT) c.signal else c.onPianoBlack
            drawMark(mark, ink, Offset(cx, cy), blackRing, face.bottom)
            // Narrow keys: the name only while the note sounds.
            if (g > 0f || playing) drawLabel(labels.name(k.note), if (onLit) c.onSignal else c.onPianoBlack, Offset(cx, cy))
        }
        if (playing) drawHeld(face, blackCorner, held, c.pianoSignal)
    }

    // A device note the piano doesn't reach: an orange tick at that end.
    if (below > 0f) drawTick(white.height, left = true, alpha = below, color = c.pianoSignal)
    if (above > 0f) drawTick(white.height, left = false, alpha = above, color = c.pianoSignal)
}

/**
 * The root's orange ring on [face], 3:1 or more: the signal orange where it
 * holds that, its darker edge on a pale face (the light theme's keys and
 * plate), the lighter piano orange on a mid one (the dark theme's white keys).
 */
internal fun ArcColors.rootOn(face: Color): Color = when {
    face.luminance() > 0.5f -> signalEdge
    contrast(signal, face) >= 3f -> signal
    else -> pianoSignal
}

private fun contrast(a: Color, b: Color): Float {
    val (hi, lo) = a.luminance().let { la -> b.luminance().let { lb -> maxOf(la, lb) to minOf(la, lb) } }
    return (hi + 0.05f) / (lo + 0.05f)
}

/** A key's ring around [center]: navy in the scale; thicker on the root, with a bar at the key's foot. */
private fun DrawScope.drawMark(mark: KeyMark, color: Color, center: Offset, d: Float, bottom: Float) {
    val root = mark == KeyMark.ROOT
    val stroke = (if (root) 3.dp else 2.dp).toPx()
    drawCircle(color, radius = d / 2 - stroke / 2, center = center, style = Stroke(stroke))
    if (root) {
        val w = d * 0.6f
        val h = 3.dp.toPx()
        drawRoundRect(color, Offset(center.x - w / 2, bottom - 7.dp.toPx() - h), Size(w, h), CornerRadius(h / 2))
    }
}

private fun DrawScope.drawLabel(text: TextLayoutResult, color: Color, center: Offset) =
    drawText(text, color, Offset(center.x - text.size.width / 2f, center.y - text.size.height / 2f))

/**
 * A key as a cap: its [edge] offset by [travel] under a [color] face in [rect]
 * with [corner] corners, or, [down], the face moved onto the edge. Returns
 * where the face is drawn, for what goes on it.
 */
private fun DrawScope.drawCap(rect: Rect, corner: CornerRadius, color: Color, edge: Color, down: Boolean, travel: Offset): Rect {
    if (!down) drawRoundRect(edge, rect.topLeft + travel, rect.size, corner)
    val face = if (down) rect.translate(travel) else rect
    drawRoundRect(color, face.topLeft, face.size, corner)
    return face
}

/** Playing on the phone: the signal orange inside the key's face, as on the grid. */
private fun DrawScope.drawHeld(face: Rect, corner: CornerRadius, stroke: Float, color: Color) {
    val inset = stroke / 2
    drawRoundRect(
        color,
        Offset(face.left + inset, face.top + inset),
        Size(face.width - stroke, face.height - stroke),
        CornerRadius((corner.x - inset).coerceAtLeast(0f)),
        style = Stroke(stroke),
    )
}

/** ◂ or ▸ near the top of the piano's end: a note sounding past the keys that way. */
private fun DrawScope.drawTick(height: Float, left: Boolean, alpha: Float, color: Color) {
    val w = 8.dp.toPx()
    val h = 12.dp.toPx()
    val inset = 8.dp.toPx()
    val y = minOf(20.dp.toPx(), height * 0.3f)
    val tip = if (left) inset else size.width - inset
    val base = if (left) tip + w else tip - w
    val p = Path().apply {
        moveTo(tip, y)
        lineTo(base, y - h / 2)
        lineTo(base, y + h / 2)
        close()
    }
    drawPath(p, color.copy(alpha = alpha.coerceIn(0f, 1f)))
}
