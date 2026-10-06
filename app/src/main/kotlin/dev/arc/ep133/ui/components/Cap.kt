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
    /** The whole K.O. II as the Guide draws it beside its list. */
    val ko: KoColors = KoColors(),
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
    ko = KoColors(edge = Color(0xFF0E0F10)),
)

/**
 * The Guide's K.O. II illustration: the device's own colours, the same in
 * both themes but for the body's edge, which must show on a dark page. Keys
 * come as face, edge (the side under it) and ink; knobs as skirt, skirt
 * edge, cap, cap edge.
 */
@Immutable
data class KoColors(
    val body: Color = Color(0xFFD6D5D0),
    val edge: Color = Color(0xFFAFAEA8),
    /** The cream panel at the top, the ports strip and the labels printed on the body. */
    val panel: Color = Color(0xFFE6E4DF),
    val label: Color = Color(0xFF3B3C3E),
    val grille: Color = Color(0xFF9A9A97),
    val grilleHole: Color = Color(0xFF1B1B1B),
    val screen: Color = Color(0xFF111210),
    val screenInk: Color = Color(0xFFE9E7DF),
    val screenTag: Color = Color(0xFFEDECE8),
    val screenTagInk: Color = Color(0xFF111111),
    val darkFace: Color = Color(0xFF232425),
    val darkEdge: Color = Color(0xFF050505),
    val darkInk: Color = Color(0xFFEDECE8),
    val lightFace: Color = Color(0xFFEEEDE9),
    val lightEdge: Color = Color(0xFFA9A8A2),
    val lightInk: Color = Color(0xFF6A6B6E),
    /** A two-tier key's pale lower half: its ink, and the rule under ERASE. */
    val tierInk: Color = Color(0xFF5A5B5D),
    val tierLine: Color = Color(0xFFD0CFCA),
    /** PLAY, and the grey lower half of TEMPO / LOOP. */
    val greyFace: Color = Color(0xFF7E7F81),
    val greyEdge: Color = Color(0xFF5A5B5D),
    val greyInk: Color = Color(0xFFF0EFEB),
    val loopFace: Color = Color(0xFF8E8F91),
    val ledOff: Color = Color(0xFF8E8E8B),
    val ledOn: Color = Color(0xFFFF3B1A),
    val portLight: Color = Color(0xFFF1F0EC),
    val portLightInk: Color = Color(0xFF444444),
    val portDark: Color = Color(0xFF111111),
    val portDarkInk: Color = Color(0xFFDDDDDD),
    val portInk: Color = Color(0xFF555555),
    /** The Y knob's tag. */
    val yTag: Color = Color(0xFF1E1F21),
    val faderTrack: Color = Color(0xFF111111),
    val faderEdge: Color = Color(0xFF555555),
    val knobWhite: List<Color> = listOf(Color(0xFFEAE9E5), Color(0xFFBDBCB7), Color(0xFFF7F6F3), Color(0xFFD3D2CD)),
    val knobOrange: List<Color> = listOf(Color(0xFFFF5410), Color(0xFFB83600), Color(0xFFFF6A26), Color(0xFFD94300)),
    val knobBlack: List<Color> = listOf(Color(0xFF28292B), Color(0xFF050506), Color(0xFF36373A), Color(0xFF0B0B0C)),
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
