package dev.arc.ep133.ui.components

import androidx.compose.foundation.background
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.withFrameNanos
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
import dev.arc.ep133.features.KeyMotion
import dev.arc.ep133.text.SkinChoice

/*
 * Key caps, drawn as the EP-133 Sample Tool draws the K.O. II: a flat face over
 * a flat edge offset down and to the right, two solid layers with no gradient
 * or shadow. Pressed, the face travels onto its edge as the K.O. II's
 * mechanical keys do (core KeyMotion: straight down to a hard stop, then a
 * spring back up past rest). Every key in the app is
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
 * The EP-40 Riddim, drawn as the K.O. II is: a cream body, cream number pads
 * with dub green figures, a green PLAY, the orange X knob and the green Y.
 * As with the K.O. II the keys stay in the dark theme; the body darkens.
 */
val Ep40KoColors = KoColors(
    body = Color(0xFFC9BEA9),
    edge = Color(0xFFA99D84),
    panel = Color(0xFFECEBE6),
    label = Color(0xFF0B4A36),
    grille = Color(0xFFBEB39C),
    grilleHole = Color(0xFF121312),
    screen = Color(0xFF0E3326),
    screenInk = Color(0xFF6FD9AE),
    screenTag = Color(0xFFEAF6EF),
    screenTagInk = Color(0xFF0E2B20),
    darkFace = Color(0xFFEEEBE2),
    // A pale key's side is darker than its face.
    darkEdge = Color(0xFFB3A891),
    darkInk = Color(0xFF03382A),
    lightFace = Color(0xFFDCD3C0),
    lightEdge = Color(0xFFA99D84),
    lightInk = Color(0xFF0B4A36),
    tierInk = Color(0xFF0B4A36),
    tierLine = Color(0xFFCFC4AE),
    greyFace = Color(0xFF00503A),
    greyEdge = Color(0xFF00301F),
    greyInk = Color(0xFFF4F1E8),
    loopFace = Color(0xFF147C4B),
    ledOff = Color(0xFFA39880),
    ledOn = Color(0xFFF05A24),
    portLight = Color(0xFFECEBE6),
    portLightInk = Color(0xFF0B4A36),
    portDark = Color(0xFF00503A),
    portDarkInk = Color(0xFFF4F1E8),
    portInk = Color(0xFF0B4A36),
    yTag = Color(0xFF003A28),
    faderTrack = Color(0xFF121312),
    faderEdge = Color(0xFF5A5444),
    knobOrange = listOf(Color(0xFFF44E0F), Color(0xFFA8340A), Color(0xFFF86A30), Color(0xFFD2460D)),
    knobBlack = listOf(Color(0xFF003A28), Color(0xFF00180F), Color(0xFF0B4A36), Color(0xFF002A1C)),
)

val Ep40LightHwColors = LightHwColors.copy(
    body = Color(0xFFB3A78B),
    darkFace = Ep40KoColors.darkFace,
    darkEdge = Ep40KoColors.darkEdge,
    darkInk = Ep40KoColors.darkInk,
    darkDim = Color(0xFF4F6B5C),
    lightFace = Ep40KoColors.lightFace,
    lightEdge = Ep40KoColors.lightEdge,
    lightInk = Ep40KoColors.lightInk,
    ledOff = Ep40KoColors.ledOff,
    ko = Ep40KoColors,
)

val Ep40DarkHwColors = Ep40LightHwColors.copy(
    body = Color(0xFF22332A),
    ledOff = Color(0xFF4A5C51),
    ko = Ep40KoColors.copy(edge = Color(0xFF06100C)),
)

/**
 * The EP-1320 Medieval, drawn as the K.O. II is: an olive gold body, oxblood
 * number pads with parchment figures, parchment lower keys, a bottle green
 * PLAY, the red X knob and the brown Y.
 */
val Ep1320KoColors = KoColors(
    body = Color(0xFFA8945A),
    edge = Color(0xFF7E6C3A),
    panel = Color(0xFFE4D6C4),
    label = Color(0xFF3A2418),
    grille = Color(0xFF7A4A2E),
    grilleHole = Color(0xFF362017),
    screen = Color(0xFF0E0B0A),
    screenInk = Color(0xFFF2553A),
    screenTag = Color(0xFFE8DCC8),
    screenTagInk = Color(0xFF1A0E0B),
    darkFace = Color(0xFF3E1E18),
    darkEdge = Color(0xFF1E0E0B),
    darkInk = Color(0xFFE8DCC8),
    lightFace = Color(0xFFE4D6C4),
    lightEdge = Color(0xFFB09C78),
    lightInk = Color(0xFF3A2418),
    tierInk = Color(0xFF3A2418),
    tierLine = Color(0xFFCBBFA9),
    greyFace = Color(0xFF1A2A25),
    greyEdge = Color(0xFF0B1411),
    greyInk = Color(0xFFE8DCC8),
    loopFace = Color(0xFF25312D),
    ledOff = Color(0xFF7A6A48),
    ledOn = Color(0xFFE8331F),
    portLight = Color(0xFFD8D6D2),
    portLightInk = Color(0xFF3A2418),
    portDark = Color(0xFF2F3F3A),
    portDarkInk = Color(0xFFE8DCC8),
    portInk = Color(0xFF3A2418),
    yTag = Color(0xFF3A211C),
    faderTrack = Color(0xFF1D2925),
    faderEdge = Color(0xFF5A4632),
    knobWhite = listOf(Color(0xFFE5DCCF), Color(0xFFB8AC98), Color(0xFFF0E8DC), Color(0xFFCFC3B0)),
    knobOrange = listOf(Color(0xFFB80D05), Color(0xFF7A0803), Color(0xFFC8281E), Color(0xFF9A0F07)),
    knobBlack = listOf(Color(0xFF3A211C), Color(0xFF1A0E0B), Color(0xFF4A2B24), Color(0xFF2A1712)),
)

val Ep1320LightHwColors = LightHwColors.copy(
    body = Color(0xFF8A7848),
    darkFace = Ep1320KoColors.darkFace,
    darkEdge = Color(0xFF5A3329),
    darkInk = Ep1320KoColors.darkInk,
    darkDim = Color(0xFFB9A58A),
    lightFace = Ep1320KoColors.lightFace,
    lightEdge = Ep1320KoColors.lightEdge,
    lightInk = Ep1320KoColors.lightInk,
    ledOff = Ep1320KoColors.ledOff,
    ko = Ep1320KoColors,
)

val Ep1320DarkHwColors = Ep1320LightHwColors.copy(
    body = Color(0xFF544C2A),
    ledOff = Color(0xFF5C5036),
    ko = Ep1320KoColors.copy(edge = Color(0xFF0E0F10)),
)

/** The keys and the drawn device for [skin], light or [dark]. */
fun hwColors(skin: SkinChoice, dark: Boolean): HwColors = when (skin) {
    SkinChoice.EP133 -> if (dark) DarkHwColors else LightHwColors
    SkinChoice.EP40 -> if (dark) Ep40DarkHwColors else Ep40LightHwColors
    SkinChoice.EP1320 -> if (dark) Ep1320DarkHwColors else Ep1320LightHwColors
}

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

/**
 * How far a cap is down: 0 up, 1 on its edge, a little under 0 as it springs
 * back past rest (KeyMotion: down in 24 ms, at least 50 ms, then the spring).
 */
@Composable
fun capPress(down: Boolean): Float {
    val key = remember { KeyMotion.Key(if (down) 1f else 0f) }
    val pos = remember { mutableFloatStateOf(key.pos) }
    val held by rememberUpdatedState(down)
    LaunchedEffect(down) {
        // From now, so the first frame after the touch already shows the key on its way down.
        var last = System.nanoTime()
        do {
            val t = withFrameNanos { it }
            val moving = KeyMotion.step(key, held, frameMs(t - last))
            last = t
            pos.floatValue = key.pos
        } while (moving)
    }
    return pos.floatValue
}

/** A frame's step in ms, for KeyMotion: never backwards, and a stalled frame no more than two. */
internal fun frameMs(ns: Long): Float = (ns / 1_000_000f).coerceIn(0f, 32f)

/**
 * Draws this element as a cap: [face] in [shape] over an [edge] offset by
 * [dx], [dy]. [press] (0..1, see [capPress]) moves the face onto its edge;
 * under 0, the face lifts off it.
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
