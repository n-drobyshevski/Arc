package dev.arc.ep133.screens

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.android.tools.screenshot.PreviewTest
import dev.arc.ep133.text.GuideText
import dev.arc.ep133.ui.screens.GuideScreen
import dev.arc.ep133.ui.screens.entryId
import dev.arc.ep133.ui.theme.ArcTheme

/** "Load a sample directly by entering its slot number": a held key, then typing on the pads. */
private val Typed = GuideText.sections[0].let { entryId(it, it.entries[3]) }

@PreviewTest
@Preview(name = "Guide", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun GuidePreview() {
    ArcTheme(dark = false) {
        // The guide as it opens from its tab on the left edge: over the whole screen.
        GuideScreen(onBack = {})
    }
}

@PreviewTest
@Preview(name = "Guide open", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun GuideOpenPreview() {
    ArcTheme(dark = false) {
        // A phone has no drawing of the device: the open row numbers its steps.
        GuideScreen(onBack = {}, initialOpen = Typed)
    }
}

@PreviewTest
@Preview(name = "Guide wide", widthDp = 1280, heightDp = 800, showBackground = true)
@Composable
fun GuideWidePreview() {
    ArcTheme(dark = false) {
        // A tablet on its side: the K.O. II beside the list, the open entry's keys lit.
        GuideScreen(onBack = {}, initialOpen = Typed)
    }
}

@PreviewTest
@Preview(name = "Guide wide dark", widthDp = 1280, heightDp = 800, showBackground = true)
@Composable
fun GuideWideDarkPreview() {
    ArcTheme(dark = true) {
        GuideScreen(onBack = {}, initialOpen = Typed)
    }
}

@PreviewTest
@Preview(name = "Guide wide plain", widthDp = 1280, heightDp = 800, showBackground = true)
@Composable
fun GuideWidePlainPreview() {
    ArcTheme(dark = false) {
        // Nothing open: the device drawn plain, nothing dimmed.
        GuideScreen(onBack = {})
    }
}
