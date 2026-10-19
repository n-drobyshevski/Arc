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
import dev.arc.ep133.text.SkinChoice
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.hwColors

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
    /** A warning: amber, 7:1 or more on the dark display in either theme (the top bar's Bluetooth key takes it as its face). */
    val warn: Color,
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
    /**
     * Live's landscape piano: its key faces, the names and rings on black
     * keys, and the faces of keys outside the scale (dimmed: each face pulled
     * toward a mid grey, to 1.4:1 from its own colour, and the two dimmed
     * faces 1.3:1 or more apart). The line between white keys also outlines
     * the black ones, so every key's edge is 3:1 or more against its
     * neighbours.
     */
    val pianoWhite: Color,
    val pianoBlack: Color,
    val onPianoBlack: Color,
    val keyOut: Color,
    val keyOutBlack: Color,
    val pianoLine: Color,
    /** The signal orange drawn on the piano's white keys, 3:1 or more there: a held key's outline, the tick for a note past the end, the dark theme's root. */
    val pianoSignal: Color,
    /** The octave digit on a C other than OCT's own (which is in ink). */
    val pianoDigit: Color,
    /** The tag naming the section, top left (the pocket operator app's mustard EDIT tag on the EP-133). */
    val tagFace: Color,
    val tagInk: Color,
    /** The guide overlay's tip tags for hints that aren't one key (the PO app's yellow on the EP-133). */
    val coach: Color,
    val onCoach: Color,
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
    warn = Color(0xFFE8A53E),
    navy = Color(0xFF1F2558),
    onNavy = Color(0xFFF4F2EE),
    tabOff = Color(0xFFD3D2DA),
    onTabOff = Color(0xFF5C5B6C),
    plate = Color(0xFFD7D8D4),
    line = Color(0xFF1E1F21),
    ok = Color(0xFF17613F),
    onOk = Color(0xFFF4F2EE),
    pianoWhite = Color(0xFFF5F4F0),
    pianoBlack = Color(0xFF1E1F21),
    // The dark theme's navy: pale enough to read on a black key.
    onPianoBlack = Color(0xFFAEB4F0),
    keyOut = Color(0xFFCDCCCC),
    keyOutBlack = Color(0xFF3A3B3F),
    pianoLine = Color(0xFF1E1F21),
    pianoSignal = Color(0xFFFF4C00),
    pianoDigit = Color(0xFF55545C),
    tagFace = Color(0xFFC9A227),
    tagInk = Color(0xFF1E1F21),
    coach = Color(0xFFD4A300),
    onCoach = Color(0xFF1E1F21),
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
    warn = Color(0xFFFFC15E),
    navy = Color(0xFFAEB4F0),
    onNavy = Color(0xFF14162B),
    tabOff = Color(0xFF3A3B44),
    onTabOff = Color(0xFFA3A4AE),
    plate = Color(0xFF2E2F33),
    line = Color(0xFF0E0F10),
    ok = Color(0xFF3FA877),
    onOk = Color(0xFF0E1A14),
    // White keys lifted off the shell; black keys darker than it, held apart from the
    // white ones by a light grey outline (their faces alone are under 3:1). Dimmed, the
    // white keys darken and the black ones lighten, still 1.4:1 apart.
    pianoWhite = Color(0xFF5D5E65),
    pianoBlack = Color(0xFF121314),
    keyOut = Color(0xFF46474C),
    keyOutBlack = Color(0xFF303135),
    pianoLine = Color(0xFFB2B3B5),
    // The signal orange is only 2:1 on those white keys: a lighter one there.
    pianoSignal = Color(0xFFFFA070),
    pianoDigit = Color(0xFFBCBDBF),
)

/**
 * The EP-40 Riddim (SkinChoice.EP40): its cream body and keys, dub green ink
 * and choice keys, the RECORD key's orange as the signal, and a dark green
 * display for the jade one (the orange must show on it). The section tag is
 * the display's sky blue, the tips its yellow.
 */
val Ep40LightArcColors = LightArcColors.copy(
    shell = Color(0xFFD3C9B5),
    key = Color(0xFFECE8DE),
    keyEdge = Color(0xFFB3A891),
    ink = Color(0xFF0B4A36),
    graphite = Color(0xFF4A5548),
    signal = Color(0xFFF05A24),
    signalEdge = Color(0xFFB8400F),
    onSignal = Color(0xFFFFFFFF),
    display = Color(0xFF0E3326),
    displayInk = Color(0xFF6FD9AE),
    displayDim = Color(0xFF3E9273),
    segmentOff = Color(0xFF1C5240),
    danger = Color(0xFF7F1616),
    warn = Color(0xFFF2C230),
    navy = Color(0xFF00503A),
    onNavy = Color(0xFFF4F1E8),
    tabOff = Color(0xFFE2DCCB),
    onTabOff = Color(0xFF3F5547),
    plate = Color(0xFFCFC4AE),
    line = Color(0xFF10261D),
    ok = Color(0xFF79B84A),
    onOk = Color(0xFF0E2B20),
    pianoWhite = Color(0xFFF2EFE6),
    pianoBlack = Color(0xFF0B2A20),
    onPianoBlack = Color(0xFF9FD8BA),
    keyOut = Color(0xFFCDC6B5),
    keyOutBlack = Color(0xFF2E4238),
    pianoLine = Color(0xFF0B2A20),
    // The orange is under 3:1 on the cream keys: a deeper one there.
    pianoSignal = Color(0xFFC2410F),
    pianoDigit = Color(0xFF4A5548),
    tagFace = Color(0xFF3EB0D1),
    tagInk = Color(0xFF0E2B20),
    coach = Color(0xFFF2C230),
    onCoach = Color(0xFF0B4A36),
)

/** The EP-40 at night: a green-black page, cream ink, mint choice keys. */
val Ep40DarkArcColors = Ep40LightArcColors.copy(
    shell = Color(0xFF0E1813),
    key = Color(0xFF1A2A22),
    keyEdge = Color(0xFF2C4136),
    ink = Color(0xFFE8DFCC),
    graphite = Color(0xFF9DA993),
    danger = Color(0xFFFF9C8F),
    navy = Color(0xFF9FD8BA),
    onNavy = Color(0xFF0B2A1E),
    tabOff = Color(0xFF24352C),
    onTabOff = Color(0xFFA8B9A9),
    plate = Color(0xFF1F2E26),
    line = Color(0xFF06100C),
    ok = Color(0xFF1F6B47),
    onOk = Color(0xFFE8DFCC),
    pianoWhite = Color(0xFF4A5C51),
    pianoBlack = Color(0xFF08110D),
    keyOut = Color(0xFF3A4A41),
    keyOutBlack = Color(0xFF22302A),
    pianoLine = Color(0xFFA8B9A9),
    pianoSignal = Color(0xFFFF9A6E),
    pianoDigit = Color(0xFFB5C2B4),
    onCoach = Color(0xFF0B2A20),
)

/**
 * The EP-1320 Medieval (SkinChoice.EP1320): an olive gold page, parchment
 * keys with brown ink, bottle green choice keys, vermilion for the signal and
 * a deeper crimson for danger, and its smoked display with red digits. The
 * oxblood number keys are Live's pads ([dev.arc.ep133.ui.components.HwColors]).
 */
val Ep1320LightArcColors = LightArcColors.copy(
    shell = Color(0xFFD0B97E),
    key = Color(0xFFE4D6C4),
    keyEdge = Color(0xFFA08A50),
    ink = Color(0xFF3A2418),
    graphite = Color(0xFF524228),
    signal = Color(0xFFB8301E),
    signalEdge = Color(0xFF7E1B12),
    onSignal = Color(0xFFFFFFFF),
    display = Color(0xFF0E0B0A),
    displayInk = Color(0xFFF2553A),
    displayDim = Color(0xFF9A6A3A),
    segmentOff = Color(0xFF33251F),
    danger = Color(0xFF7A1418),
    warn = Color(0xFFE8A13A),
    navy = Color(0xFF2E4B3E),
    onNavy = Color(0xFFE8DCC8),
    tabOff = Color(0xFFDCD8CF),
    onTabOff = Color(0xFF5A4632),
    plate = Color(0xFFA8945A),
    line = Color(0xFF3A2418),
    ok = Color(0xFF7FAE8A),
    onOk = Color(0xFF0E1A12),
    pianoWhite = Color(0xFFEFE5D3),
    pianoBlack = Color(0xFF2A1410),
    onPianoBlack = Color(0xFFE8A13A),
    keyOut = Color(0xFFCBBFA9),
    keyOutBlack = Color(0xFF4A352C),
    pianoLine = Color(0xFF2A1410),
    pianoSignal = Color(0xFFB8301E),
    pianoDigit = Color(0xFF5A4632),
    tagFace = Color(0xFF9A8550),
    tagInk = Color(0xFF1A0E0B),
    coach = Color(0xFFE8A13A),
    onCoach = Color(0xFF2A1410),
)

/** The EP-1320 by candlelight: a bottle green page, parchment ink. */
val Ep1320DarkArcColors = Ep1320LightArcColors.copy(
    shell = Color(0xFF121714),
    key = Color(0xFF25312D),
    keyEdge = Color(0xFF34433C),
    ink = Color(0xFFE8DCC8),
    graphite = Color(0xFFA89C84),
    signal = Color(0xFFE8442C),
    signalEdge = Color(0xFFA83020),
    danger = Color(0xFFFF948A),
    navy = Color(0xFFA9C4B0),
    onNavy = Color(0xFF13201A),
    tabOff = Color(0xFF26332D),
    onTabOff = Color(0xFFA9B3A0),
    plate = Color(0xFF544C2A),
    line = Color(0xFF0A0E0C),
    ok = Color(0xFF245A38),
    onOk = Color(0xFFF2E8D6),
    pianoWhite = Color(0xFF5A5246),
    pianoBlack = Color(0xFF0E0A08),
    keyOut = Color(0xFF48413A),
    keyOutBlack = Color(0xFF2E2620),
    pianoLine = Color(0xFFBDB29E),
    pianoSignal = Color(0xFFFF8F70),
    pianoDigit = Color(0xFFC4B8A2),
)

/** The colours for [skin], light or [dark]. */
fun arcColors(skin: SkinChoice, dark: Boolean): ArcColors = when (skin) {
    SkinChoice.EP133 -> if (dark) DarkArcColors else LightArcColors
    SkinChoice.EP40 -> if (dark) Ep40DarkArcColors else Ep40LightArcColors
    SkinChoice.EP1320 -> if (dark) Ep1320DarkArcColors else Ep1320LightArcColors
}

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
    val word = BaseText.copy(fontSize = 13.sp, fontWeight = FontWeight.Normal, letterSpacing = 0.04.em, lineHeight = 1.1.em)
    val tab = BaseText.copy(fontSize = 14.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.05.em, lineHeight = 1.em)
    val semi = BaseText.copy(fontWeight = FontWeight.SemiBold)
}

@Composable
fun ArcTheme(dark: Boolean = isSystemInDarkTheme(), skin: SkinChoice = SkinChoice.EP133, content: @Composable () -> Unit) {
    val c = arcColors(skin, dark)
    // The same mapping both ways; only the scheme's own defaults differ.
    val scheme = (if (dark) darkColorScheme() else lightColorScheme()).copy(
        primary = c.signal, onPrimary = c.onSignal, secondary = c.graphite,
        background = c.shell, onBackground = c.ink, surface = c.shell, onSurface = c.ink,
        surfaceVariant = c.key, onSurfaceVariant = c.graphite, surfaceContainer = c.key,
        surfaceContainerHigh = c.key, surfaceContainerHighest = c.key, surfaceContainerLow = c.key,
        outline = c.keyEdge, outlineVariant = c.keyEdge.copy(alpha = 0.55f), error = c.danger,
        inverseSurface = c.display, inverseOnSurface = c.displayInk, scrim = Color(20, 20, 18),
    )
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
            LocalHwColors provides hwColors(skin, dark),
            LocalTextSelectionColors provides TextSelectionColors(handleColor = c.signal, backgroundColor = c.signal.copy(alpha = 0.3f)),
        ) {
            // Here, so the app and every screenshot get the window's size.
            dev.arc.ep133.ui.components.ProvideArcWindow(content)
        }
    }
}
