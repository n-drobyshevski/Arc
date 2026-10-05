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
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.R

/**
 * Colour tokens from reference/styles.css, taken from the device itself: a
 * shell, pale keys, one orange key and a dark display panel. The page, ink and
 * the navy/grey tab blocks lean towards teenage engineering's pocket operator
 * app (an addition to the web version).
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
    /** Selected tab and choice keys. */
    val navy: Color,
    val onNavy: Color,
    /** Tabs that are not selected. */
    val tabOff: Color,
    val onTabOff: Color,
    /** The pad-grid plate and its thin lines. */
    val plate: Color,
    val line: Color,
    /** The "connected" block. */
    val ok: Color,
    val onOk: Color,
) {
    val scrim: Color get() = Color(20, 20, 18).copy(alpha = 0.45f)
}

val LightArcColors = ArcColors(
    shell = Color(0xFFE6E2DB),
    key = Color(0xFFF4F2EE),
    keyEdge = Color(0xFFC6C2B9),
    ink = Color(0xFF1F2558),
    graphite = Color(0xFF6B6A72),
    signal = Color(0xFFFF4C00),
    signalEdge = Color(0xFFC23A00),
    onSignal = Color(0xFFFFFFFF),
    display = Color(0xFF262823),
    displayInk = Color(0xFFE9E7DF),
    displayDim = Color(0xFF8A8C83),
    segmentOff = Color(0xFF3A3D36),
    danger = Color(0xFFB3261E),
    navy = Color(0xFF1F2558),
    onNavy = Color(0xFFF4F2EE),
    tabOff = Color(0xFFD3D2DA),
    onTabOff = Color(0xFF5C5B6C),
    plate = Color(0xFFD7D8D4),
    line = Color(0xFF1E1F21),
    ok = Color(0xFF17613F),
    onOk = Color(0xFFF4F2EE),
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
    navy = Color(0xFFAEB4F0),
    onNavy = Color(0xFF14162B),
    tabOff = Color(0xFF3A3B44),
    onTabOff = Color(0xFFA3A4AE),
    plate = Color(0xFF2E2F33),
    line = Color(0xFF0E0F10),
    ok = Color(0xFF3FA877),
    onOk = Color(0xFF0E1A14),
)

val LocalArcColors = staticCompositionLocalOf { LightArcColors }

val Manrope = FontFamily(
    Font(R.font.manrope_400, FontWeight.Normal),
    Font(R.font.manrope_500, FontWeight.Medium),
    Font(R.font.manrope_600, FontWeight.SemiBold),
    Font(R.font.manrope_700, FontWeight.Bold),
    Font(R.font.manrope_800, FontWeight.ExtraBold),
)

/**
 * `font: 500 16px/1.5 Manrope; font-variant-numeric: tabular-nums`.
 * Line heights are proportional (em) like CSS, and not trimmed, so single
 * lines get the full CSS line box (Compose trims by default).
 */
val BaseText = TextStyle(
    fontFamily = Manrope,
    fontWeight = FontWeight.Medium,
    fontSize = 16.sp,
    lineHeight = 1.5.em,
    lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None),
    fontFeatureSettings = "tnum",
)

object ArcType {
    val wordmark = BaseText.copy(fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.04).em)
    // .key { font: 700 15px/1 }
    val key = BaseText.copy(fontSize = 15.sp, fontWeight = FontWeight.Bold, lineHeight = 1.em)
    val keySmall = key.copy(fontSize = 14.sp)
    val keyWide = key.copy(fontSize = 17.sp)
    val displayHead = BaseText.copy(fontSize = 17.sp, fontWeight = FontWeight.Bold)
    val displaySub = BaseText.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    val displayHint = BaseText.copy(fontSize = 15.sp)
    val statNum = BaseText.copy(fontSize = 44.sp, fontWeight = FontWeight.ExtraBold, lineHeight = 1.em, letterSpacing = (-0.03).em)
    val statFree = statNum.copy(fontSize = 22.sp, letterSpacing = (-0.01).em)
    val statLabel = BaseText.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    val heading = BaseText.copy(fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.02).em)
    val small = BaseText.copy(fontSize = 14.sp)
    val tiny = BaseText.copy(fontSize = 13.sp)
    val fieldLabel = BaseText.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    // .field input { font: 600 17px/1.4 }
    val fieldInput = BaseText.copy(fontSize = 17.sp, fontWeight = FontWeight.SemiBold, lineHeight = 1.4.em)
    val notesInput = BaseText.copy(fontSize = 15.sp, lineHeight = 1.4.em)
    val body15 = BaseText.copy(fontSize = 15.sp)
    val bold = BaseText.copy(fontWeight = FontWeight.Bold)
    // Uppercase, letter-spaced labels after the pocket operator app (callers uppercase the text).
    val caps = BaseText.copy(fontSize = 13.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.12.em, lineHeight = 1.2.em)
    val capsKey = BaseText.copy(fontSize = 14.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.06.em, lineHeight = 1.1.em)
    val capsKeySmall = capsKey.copy(fontSize = 13.sp)
    val capsKeyWide = capsKey.copy(fontSize = 16.sp)
    /** The PO app's mode words under its grid (DRUMS / KEYPAD). */
    val word = BaseText.copy(fontSize = 16.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.02.em, lineHeight = 1.1.em)
    val tab = BaseText.copy(fontSize = 14.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.05.em, lineHeight = 1.em)
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
