package dev.arc.ep133.ui.components

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The window the app is drawn in. Layouts follow its size, not the phone's
 * orientation, so a split screen, a foldable or a tablet gets the layout
 * that fits it. A short window is a phone on its side: the top bar slims
 * down and toasts move up into it.
 */
data class ArcWindow(val width: Dp, val height: Dp) {
    val landscape: Boolean get() = width > height
    val short: Boolean get() = height < 480.dp
}

/** Changes as the phone turns or the window is resized; a portrait phone where nothing provides it. */
val LocalArcWindow = compositionLocalOf { ArcWindow(412.dp, 843.dp) }

/**
 * Where the top bar's empty middle is, in root coordinates: the top bar
 * writes it, and a toast in a short window takes that place.
 */
class BarSlot {
    var bounds by mutableStateOf<Rect?>(null)
}

val LocalBarSlot = staticCompositionLocalOf<BarSlot?> { null }

private val LocalWindowProvided = staticCompositionLocalOf { false }

/**
 * Measures the window for [content]. Only the outermost call measures, so
 * a nested theme (a screenshot inside a frame) keeps the whole window's size.
 */
@Composable
fun ProvideArcWindow(content: @Composable () -> Unit) {
    if (LocalWindowProvided.current) {
        content()
        return
    }
    val slot = remember { BarSlot() }
    BoxWithConstraints {
        CompositionLocalProvider(
            LocalArcWindow provides ArcWindow(maxWidth, maxHeight),
            LocalBarSlot provides slot,
            LocalWindowProvided provides true,
            content = content,
        )
    }
}
