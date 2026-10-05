package dev.arc.ep133.screens

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.android.tools.screenshot.PreviewTest
import dev.arc.ep133.ui.screens.GuideScreen
import dev.arc.ep133.ui.theme.ArcTheme

@PreviewTest
@Preview(name = "Guide", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun GuidePreview() {
    ArcTheme(dark = false) {
        // The guide as it opens from its tab on the left edge: over the whole screen.
        GuideScreen(onBack = {})
    }
}
