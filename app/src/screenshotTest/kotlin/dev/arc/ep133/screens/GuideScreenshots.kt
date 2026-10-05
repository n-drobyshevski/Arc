package dev.arc.ep133.screens

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.android.tools.screenshot.PreviewTest
import dev.arc.ep133.ui.components.ArcFrame
import dev.arc.ep133.ui.components.Tab
import dev.arc.ep133.ui.components.TabBar
import dev.arc.ep133.ui.components.TopBar
import dev.arc.ep133.ui.screens.GuideScreen
import dev.arc.ep133.ui.theme.ArcTheme

@PreviewTest
@Preview(name = "Guide", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun GuidePreview() {
    ArcTheme(dark = false) {
        ArcFrame(
            top = { TopBar(connected = true, canConnect = true, canBackup = true, onBackup = {}, onConnect = {}, onDebug = {}) },
            bottom = { TabBar(Tab.GUIDE) {} },
        ) { GuideScreen() }
    }
}
