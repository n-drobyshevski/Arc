package dev.arc.ep133.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.text.selection.LocalTextSelectionColors
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.R

/**
 * Colour tokens from reference/styles.css, taken from the device itself: a grey
 * shell, pale keys, one orange key and a dark display panel.
 */
@Immutable
data class ArcColors(
    val shell: Color,
    val key: Color,
    val keyEdge: Color,
    val ink: Color,
    val graphite: Color,
    val signal: Color,
    val signalEdge: Color,
    val onSignal: Color,
    val display: Color,
    val displayInk: Color,
    val displayDim: Color,
    val segmentOff: Color,
    val danger: Color,
) {
    val scrim: Color get() = Color(20, 20, 18).copy(alpha = 0.45f)
}

val LightArcColors = ArcColors(
    shell = Color(0xFFDEDCD6),
    key = Color(0xFFF3F2EE),
    keyEdge = Color(0xFFC3C0B8),
    ink = Color(0xFF1E1F21),
    graphite = Color(0xFF66676A),
    signal = Color(0xFFFF4C00),
    signalEdge = Color(0xFFC23A00),
    onSignal = Color(0xFFFFFFFF),
    display = Color(0xFF262823),
    displayInk = Color(0xFFE9E7DF),
    displayDim = Color(0xFF8A8C83),
    segmentOff = Color(0xFF3A3D36),
    danger = Color(0xFFB3261E),
)

val DarkArcColors = LightArcColors.copy(
    shell = Color(0xFF1C1D1E),
    key = Color(0xFF2B2C2E),
    keyEdge = Color(0xFF0E0F10),
    ink = Color(0xFFECEBE6),
    graphite = Color(0xFF9A9B9D),
    display = Color(0xFF121410),
    displayInk = Color(0xFFE9E7DF),
    displayDim = Color(0xFF7C7E76),
    segmentOff = Color(0xFF2A2D27),
    signalEdge = Color(0xFFA83200),
    danger = Color(0xFFFF8A80),
)

val LocalArcColors = staticCompositionLocalOf { LightArcColors }

val Manrope = FontFamily(
    Font(R.font.manrope_400, FontWeight.Normal),
    Font(R.font.manrope_500, FontWeight.Medium),
    Font(R.font.manrope_600, FontWeight.SemiBold),
    Font(R.font.manrope_700, FontWeight.Bold),
    Font(R.font.manrope_800, FontWeight.ExtraBold),
)

/** `font: 500 16px/1.5 Manrope; font-variant-numeric: tabular-nums`. */
val BaseText = TextStyle(
    fontFamily = Manrope,
    fontWeight = FontWeight.Medium,
    fontSize = 16.sp,
    lineHeight = 24.sp,
    fontFeatureSettings = "tnum",
)

object ArcType {
    val wordmark = BaseText.copy(fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.04).em, lineHeight = 32.sp)
    val key = BaseText.copy(fontSize = 15.sp, fontWeight = FontWeight.Bold, lineHeight = 15.sp)
    val keySmall = key.copy(fontSize = 14.sp, lineHeight = 14.sp)
    val keyWide = key.copy(fontSize = 17.sp, lineHeight = 17.sp)
    val displayHead = BaseText.copy(fontSize = 17.sp, fontWeight = FontWeight.Bold)
    val displaySub = BaseText.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    val displayHint = BaseText.copy(fontSize = 15.sp)
    val statNum = BaseText.copy(fontSize = 44.sp, fontWeight = FontWeight.ExtraBold, lineHeight = 44.sp, letterSpacing = (-0.03).em)
    val statFree = statNum.copy(fontSize = 22.sp, lineHeight = 22.sp, letterSpacing = (-0.01).em)
    val statLabel = BaseText.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    val heading = BaseText.copy(fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.02).em)
    val small = BaseText.copy(fontSize = 14.sp)
    val tiny = BaseText.copy(fontSize = 13.sp)
    val fieldLabel = BaseText.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    val fieldInput = BaseText.copy(fontSize = 17.sp, fontWeight = FontWeight.SemiBold, lineHeight = 24.sp)
    val notesInput = BaseText.copy(fontSize = 15.sp)
    val body15 = BaseText.copy(fontSize = 15.sp)
    val bold = BaseText.copy(fontWeight = FontWeight.Bold)
    val semi = BaseText.copy(fontWeight = FontWeight.SemiBold)
}

@Composable
fun ArcTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val c = if (dark) DarkArcColors else LightArcColors
    val scheme = if (dark) {
        darkColorScheme(
            primary = c.signal, onPrimary = c.onSignal, secondary = c.graphite,
            background = c.shell, onBackground = c.ink, surface = c.shell, onSurface = c.ink,
            surfaceVariant = c.key, onSurfaceVariant = c.graphite, surfaceContainer = c.key,
            surfaceContainerHigh = c.key, surfaceContainerHighest = c.key, surfaceContainerLow = c.key,
            outline = c.keyEdge, outlineVariant = c.keyEdge.copy(alpha = 0.55f), error = c.danger,
            inverseSurface = c.display, inverseOnSurface = c.displayInk, scrim = Color(20, 20, 18),
        )
    } else {
        lightColorScheme(
            primary = c.signal, onPrimary = c.onSignal, secondary = c.graphite,
            background = c.shell, onBackground = c.ink, surface = c.shell, onSurface = c.ink,
            surfaceVariant = c.key, onSurfaceVariant = c.graphite, surfaceContainer = c.key,
            surfaceContainerHigh = c.key, surfaceContainerHighest = c.key, surfaceContainerLow = c.key,
            outline = c.keyEdge, outlineVariant = c.keyEdge.copy(alpha = 0.55f), error = c.danger,
            inverseSurface = c.display, inverseOnSurface = c.displayInk, scrim = Color(20, 20, 18),
        )
    }
    val t = Typography()
    fun TextStyle.m() = merge(TextStyle(fontFamily = Manrope, fontFeatureSettings = "tnum"))
    val typography = Typography(
        displayLarge = t.displayLarge.m(), displayMedium = t.displayMedium.m(), displaySmall = t.displaySmall.m(),
        headlineLarge = t.headlineLarge.m(), headlineMedium = t.headlineMedium.m(), headlineSmall = t.headlineSmall.m(),
        titleLarge = t.titleLarge.m(), titleMedium = t.titleMedium.m(), titleSmall = t.titleSmall.m(),
        bodyLarge = t.bodyLarge.m(), bodyMedium = t.bodyMedium.m(), bodySmall = t.bodySmall.m(),
        labelLarge = t.labelLarge.m(), labelMedium = t.labelMedium.m(), labelSmall = t.labelSmall.m(),
    )
    MaterialTheme(colorScheme = scheme, typography = typography) {
        CompositionLocalProvider(
            LocalArcColors provides c,
            LocalTextSelectionColors provides TextSelectionColors(handleColor = c.signal, backgroundColor = c.signal.copy(alpha = 0.3f)),
            content = content,
        )
    }
}
