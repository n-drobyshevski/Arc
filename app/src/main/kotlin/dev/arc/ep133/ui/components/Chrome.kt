package dev.arc.ep133.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.GenericShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.arc.ep133.text.CoachText
import dev.arc.ep133.text.NavText
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/** The sections, switched from the tag at the top left. */
enum class Tab(val label: String) {
    BACKUPS(NavText.BACKUPS),
    LIVE(NavText.LIVE),
    DEVICE(NavText.DEVICE),
}

/** How wide the left-edge guide tab is (screens keep this much gutter on the left). */
val EdgeTabWidth: Dp = 22.dp

/** The pocket operator app's mustard EDIT tag. */
private val TagFace = Color(0xFFC9A227)
private val TagInk = Color(0xFF1E1F21)

/**
 * The page under a top bar. The content's own safe-drawing padding then only
 * covers the sides; the bottom keeps clear of the navigation bar.
 */
@Composable
fun ArcFrame(top: @Composable () -> Unit, bottom: @Composable () -> Unit = {}, content: @Composable BoxScope.() -> Unit) {
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
 * The app around the sections, after the pocket operator app: no bar along the
 * bottom. The top left holds a tag naming the section (like the PO's EDIT tag);
 * a tap lists the sections. The EP-133 shortcut guide is a tab on the left edge
 * (like the PO's TUTORIAL tab) that slides the guide in over the page.
 */
@Composable
fun ArcShell(
    tab: Tab,
    onTab: (Tab) -> Unit,
    connected: Boolean,
    canConnect: Boolean,
    canBackup: Boolean,
    onBackup: () -> Unit,
    onConnect: () -> Unit,
    onDebug: () -> Unit,
    onSettings: () -> Unit,
    onHelp: () -> Unit,
    guideOpen: Boolean,
    onGuide: (Boolean) -> Unit,
    guide: @Composable () -> Unit,
    /** For screenshots: start with the section list open. */
    initialMenuOpen: Boolean = false,
    content: @Composable () -> Unit,
) {
    var menuOpen by rememberSaveable { mutableStateOf(initialMenuOpen) }
    Box(Modifier.fillMaxSize()) {
        ArcFrame(
            top = {
                TopBar(
                    section = tab,
                    // The tag opens and closes the list.
                    onSections = { menuOpen = !menuOpen },
                    connected = connected,
                    canConnect = canConnect,
                    canBackup = canBackup,
                    onBackup = onBackup,
                    onConnect = onConnect,
                    onDebug = onDebug,
                    onSettings = onSettings,
                    onHelp = onHelp,
                )
            },
        ) {
            content()
            GuideEdgeTab({ onGuide(true) }, Modifier.align(Alignment.CenterStart).offset(y = (-80).dp))
            // Under the top bar, so the tag stays in view above the list.
            SectionMenu(menuOpen, tab, onPick = { menuOpen = false; onTab(it) }, onDismiss = { menuOpen = false })
        }
        AnimatedVisibility(guideOpen, enter = slideInHorizontally { -it }, exit = slideOutHorizontally { -it }) {
            guide()
        }
    }
}

/**
 * The section tag, then icon keys as in the pocket operator app's top row: the
 * orange REC-style dot backs up, the connection key is green with a dot while
 * the EP-133 is connected (a tap disconnects) and navy with a ring when not,
 * then the guide overlay (?) and settings. Their names show on long-press,
 * in the overlay and to screen readers. Long-pressing the tag opens the
 * debug screen (as the wordmark did).
 */
@Composable
fun TopBar(
    section: Tab,
    onSections: () -> Unit,
    connected: Boolean,
    canConnect: Boolean,
    canBackup: Boolean,
    onBackup: () -> Unit,
    onConnect: () -> Unit,
    onDebug: () -> Unit,
    onSettings: () -> Unit = {},
    onHelp: () -> Unit = {},
) {
    val c = LocalArcColors.current
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
        Row(
            Modifier.widthIn(max = 720.dp).fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SectionTag(
                section, onSections, onDebug,
                Modifier.coachMark("top.sections", CoachText.SECTIONS, c.navy, c.onNavy),
            )
            Spacer(Modifier.weight(1f))
            IconBlock(
                ArcIcon.DOT, CoachText.BACK_UP, c.signal, c.onSignal, onBackup,
                Modifier.coachMark("top.backup", CoachText.BACK_UP, c.signal, c.onSignal),
                enabled = canBackup,
            )
            if (connected) {
                IconBlock(
                    ArcIcon.DOT, CoachText.CONNECTED, c.ok, c.onOk, onConnect,
                    Modifier.coachMark("top.connection", CoachText.CONNECTION, c.ok, c.onOk),
                    enabled = canConnect, iconSize = 16.dp,
                )
            } else {
                IconBlock(
                    ArcIcon.RING, CoachText.DISCONNECTED, c.navy, c.onNavy, onConnect,
                    Modifier.coachMark("top.connection", CoachText.CONNECTION, c.navy, c.onNavy),
                    enabled = canConnect, iconSize = 18.dp,
                )
            }
            Spacer(Modifier.width(4.dp))
            IconBlock(
                ArcIcon.HELP, CoachText.HELP, c.tabOff, c.navy, onHelp,
                Modifier.coachMark("top.help", CoachText.HELP, c.ink, c.shell),
                round = true,
            )
            IconBlock(
                ArcIcon.GEAR, CoachText.SETTINGS, c.tabOff, c.navy, onSettings,
                Modifier.coachMark("top.settings", CoachText.SETTINGS, c.graphite, c.shell),
                round = true, iconSize = 24.dp,
            )
        }
    }
}

/** A block with an arrow point on its right, like the pocket operator app's EDIT tag. */
private val TagShape = GenericShape { size, _ ->
    val point = size.height * 0.38f
    moveTo(0f, 0f)
    lineTo(size.width - point, 0f)
    lineTo(size.width, size.height / 2)
    lineTo(size.width - point, size.height)
    lineTo(0f, size.height)
    close()
}

/** The tag naming the section; a tap lists the sections, a long-press opens the debug screen. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SectionTag(section: Tab, onClick: () -> Unit, onLongPress: () -> Unit, modifier: Modifier) {
    Box(
        modifier
            .heightIn(min = 44.dp)
            .clip(TagShape)
            .background(TagFace)
            .combinedClickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
                onLongClick = onLongPress,
                role = Role.DropdownList,
            )
            .semantics { contentDescription = NavText.sectionTag(section.label) }
            .padding(start = 14.dp, end = 26.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(section.label.uppercase(), style = ArcType.tab.copy(fontSize = androidx.compose.ui.unit.TextUnit(17f, androidx.compose.ui.unit.TextUnitType.Sp)), color = TagInk, maxLines = 1)
    }
}

/**
 * The sections, as blocks stacked under the section tag (drawn in place, not
 * in a popup window): the current one navy. A tap outside closes the list.
 */
@Composable
fun SectionMenu(open: Boolean, current: Tab, onPick: (Tab) -> Unit, onDismiss: () -> Unit) {
    val c = LocalArcColors.current
    AnimatedVisibility(open, enter = fadeIn(), exit = fadeOut()) {
        Box(
            Modifier
                .fillMaxSize()
                .background(c.scrim)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onDismiss),
        ) {
            Column(
                Modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal)).padding(start = 16.dp, top = 4.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                for (t in Tab.entries) {
                    val on = t == current
                    Box(
                        Modifier
                            .widthIn(min = 150.dp)
                            .heightIn(min = 48.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (on) c.navy else c.key)
                            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Tab) { onPick(t) }
                            .semantics { selected = on }
                            .padding(horizontal = 16.dp),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        Text(t.label.uppercase(), style = ArcType.tab, color = if (on) c.onNavy else c.ink)
                    }
                }
            }
        }
    }
}

/** The vertical tab on the left edge that opens the EP-133 shortcut guide (the PO's TUTORIAL tab). */
@Composable
fun GuideEdgeTab(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    Box(
        modifier
            .width(EdgeTabWidth)
            .height(112.dp)
            .clip(RoundedCornerShape(topEnd = 8.dp, bottomEnd = 8.dp))
            // Quiet, like an unselected key: always there, never the loudest thing on the page.
            .background(c.tabOff)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClick)
            .semantics {
                role = Role.Button
                contentDescription = CoachText.GUIDE_TAB
            }
            .coachMark("edge.guide", CoachText.GUIDE_TAB, c.navy, c.onNavy),
        contentAlignment = Alignment.Center,
    ) {
        // The word reads bottom to top, as on the PO's side tabs.
        Text(
            NavText.GUIDE_TAB.uppercase(),
            style = ArcType.capsKeySmall,
            color = c.onTabOff,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier.rotateVertical(),
        )
    }
}

/** Turns a single line of text a quarter turn anticlockwise, swapping its width and height for layout. */
private fun Modifier.rotateVertical(): Modifier = layout { measurable, constraints ->
    val p = measurable.measure(constraints.copy(minWidth = 0, maxWidth = androidx.compose.ui.unit.Constraints.Infinity, minHeight = 0))
    layout(p.height, p.width) {
        p.placeWithLayer(-(p.width - p.height) / 2, (p.width - p.height) / 2) { rotationZ = -90f }
    }
}
