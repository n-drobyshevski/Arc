package dev.arc.ep133.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.arc.ep133.text.NavText
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/** The sections along the bottom. */
enum class Tab(val label: String) {
    BACKUPS(NavText.BACKUPS),
    LIVE(NavText.LIVE),
    DEVICE(NavText.DEVICE),
    GUIDE(NavText.GUIDE),
}

/** How much the tab bar takes from the bottom of the screen, above the navigation bar. */
val TabBarHeight: Dp = 72.dp

/**
 * The page with a top bar and the tabs along the bottom, like the pocket
 * operator app. The content's own safe-drawing padding then only covers the sides.
 */
@Composable
fun ArcFrame(top: @Composable () -> Unit, bottom: @Composable () -> Unit, content: @Composable BoxScope.() -> Unit) {
    val c = LocalArcColors.current
    Column(Modifier.fillMaxSize().background(c.shell)) {
        Box(Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal))) {
            top()
        }
        Box(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .consumeWindowInsets(WindowInsets.safeDrawing.only(WindowInsetsSides.Top))
                .consumeWindowInsets(WindowInsets.systemBars.only(WindowInsetsSides.Bottom)),
            content = content,
        )
        Box(Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.systemBars.only(WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal))) {
            bottom()
        }
    }
}

/**
 * The wordmark, then the orange Back up block (REC in the pocket operator app)
 * and the connection block, green while the EP-133 is connected.
 */
@Composable
fun TopBar(
    connected: Boolean,
    canConnect: Boolean,
    canBackup: Boolean,
    onBackup: () -> Unit,
    onConnect: () -> Unit,
    onDebug: () -> Unit,
) {
    val c = LocalArcColors.current
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
        Row(
            Modifier.widthIn(max = 720.dp).fillMaxWidth().padding(start = 18.dp, end = 16.dp, top = 12.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Wordmark(onLongPress = onDebug)
            Spacer(Modifier.width(12.dp))
            // The blocks wrap as whole blocks when a large font leaves no room.
            FlowRow(
                Modifier.weight(1f),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Block(NavText.BACK_UP, c.signal, c.onSignal, onBackup, enabled = canBackup, dot = true, description = Strings.BACK_UP)
                if (connected) {
                    Block(Strings.DISCONNECT, c.ok, c.onOk, onConnect, enabled = canConnect, dot = true)
                } else {
                    Block(Strings.CONNECT, c.navy, c.onNavy, onConnect, enabled = canConnect)
                }
            }
        }
    }
}

/** A flat coloured block with an uppercase label (and a dot, like REC). */
@Composable
private fun Block(
    text: String,
    face: Color,
    ink: Color,
    onClick: () -> Unit,
    enabled: Boolean,
    dot: Boolean = false,
    description: String? = null,
) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Row(
        Modifier
            .graphicsLayer { alpha = if (enabled) 1f else 0.45f }
            .clip(RoundedCornerShape(8.dp))
            .background(face)
            .background(if (pressed && enabled) Color.Black.copy(alpha = 0.12f) else Color.Transparent)
            .clickable(interactionSource = source, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
            .then(if (description != null) Modifier.semantics { contentDescription = description } else Modifier)
            .heightIn(min = 44.dp)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (dot) Box(Modifier.size(12.dp).clip(CircleShape).background(ink))
        Text(text.uppercase(), style = ArcType.capsKeySmall, color = ink, maxLines = 1)
    }
}

/** The tabs: navy when selected, pale grey otherwise (TR 1 2 3 4 in the pocket operator app). */
@Composable
fun TabBar(tab: Tab, onTab: (Tab) -> Unit) {
    val c = LocalArcColors.current
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Row(
            Modifier
                .widthIn(max = 560.dp)
                .fillMaxWidth()
                .height(TabBarHeight)
                .padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 12.dp)
                .semantics { contentDescription = NavText.TABS },
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            for (t in Tab.entries) {
                val on = t == tab
                Box(
                    Modifier
                        .weight(1f)
                        .fillMaxSize()
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (on) c.navy else c.tabOff)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Tab,
                        ) { onTab(t) }
                        .semantics { selected = on },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(t.label.uppercase(), style = ArcType.tab, color = if (on) c.onNavy else c.onTabOff, textAlign = TextAlign.Center, maxLines = 1)
                }
            }
        }
    }
}
