package dev.arc.ep133.ui.components

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/*
 * Key caps, drawn as the EP-133 Sample Tool draws the K.O. II: a flat face over
 * a flat edge offset down and to the right, two solid layers with no gradient
 * or shadow. Pressed, the face travels onto its edge. Every key in the app is
 * one: ArcKey, IconBlock, Segmented, the section menu, PlayKey, and Live's
 * pads, KEYS keys and group keys (the web's theme/cap.css).
 */

/** How far the edge sits right of the face, and how far the face travels right when pressed. */
val CapDx = 2.dp

/** How far the edge sits below the face, and how far the face travels down when pressed. */
val CapDy = 3.dp

/** A small round cap's shorter edge (a knob's). */
val RoundCapDx = 1.dp
val RoundCapDy = 2.dp

private val CapEasing = CubicBezierEasing(0.25f, 0.1f, 0.25f, 1f)

/**
 * The K.O. II's own colours: dark number pads with pale labels, pale group keys
 * with grey labels (the guide caps' colours), the body the pads sit in and an
 * unlit LED. The keys are the same in both themes; the body, the LED and the
 * dark keys' side change so the edges still show on a dark page.
 */
@Immutable
data class HwColors(
    val body: Color,
    val darkFace: Color,
    /** Lighter than the face, as the Sample Tool draws a dark key's side. */
    val darkEdge: Color,
    val darkInk: Color,
    val darkDim: Color,
    val lightFace: Color,
    val lightEdge: Color,
    val lightInk: Color,
    val ledOff: Color,
) {
    /** A KEYS key's ring for the first octave (the next is signal orange). */
    val ring: Color get() = darkInk.copy(alpha = 0.7f)
}

val LightHwColors = HwColors(
    body = Color(0xFFC9CAC5),
    darkFace = Color(0xFF232425),
    darkEdge = Color(0xFF3B3C3E),
    darkInk = Color(0xFFEDECE8),
    darkDim = Color(0xFFA9AAA6),
    lightFace = Color(0xFFDAD9D5),
    lightEdge = Color(0xFFA9A8A2),
    lightInk = Color(0xFF55575A),
    ledOff = Color(0xFF9C9C97),
)

val DarkHwColors = LightHwColors.copy(
    body = Color(0xFF3A3B3F),
    darkEdge = Color(0xFF606165),
    ledOff = Color(0xFF55565A),
)

val LocalHwColors = staticCompositionLocalOf { LightHwColors }

/** A cap's default edge: its face 30% darker. */
fun capEdge(face: Color): Color = lerp(face, Color.Black, 0.3f)

/** 0..1: how far a cap is down, moving over 60 ms (the keys' press). */
@Composable
fun capPress(down: Boolean): Float {
    val p by animateFloatAsState(if (down) 1f else 0f, tween(60, easing = CapEasing), label = "cap")
    return p
}

/**
 * Draws this element as a cap: [face] in [shape] over an [edge] offset by
 * [dx], [dy]. [press] (0..1, see [capPress]) moves the face onto its edge.
 * [alpha] fades face, content and edge together (a disabled key).
 */
fun Modifier.cap(
    face: Color,
    edge: Color,
    shape: Shape,
    press: Float,
    dx: Dp = CapDx,
    dy: Dp = CapDy,
    alpha: Float = 1f,
): Modifier = this
    .drawBehind {
        if (press >= 1f) return@drawBehind
        val ox = dx.toPx()
        val oy = dy.toPx()
        val outline = shape.createOutline(size, layoutDirection, this)
        // Only the part of the edge the face doesn't cover, so a faded key keeps a clean edge.
        val below = Path().apply { addOutline(outline); translate(Offset(ox, oy)) }
        val faceAt = Path().apply { addOutline(outline); translate(Offset(ox * press, oy * press)) }
        drawPath(Path().apply { op(below, faceAt, PathOperation.Difference) }, edge, alpha = alpha)
    }
    .graphicsLayer {
        translationX = press * dx.toPx()
        translationY = press * dy.toPx()
        this.alpha = alpha
    }
    .clip(shape)
    .background(face)
