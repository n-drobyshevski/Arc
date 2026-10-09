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
import androidx.compose.foundation.interaction.collectIsPressedAsState
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
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.GenericShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.size
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Immutable
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
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.arc.ep133.text.CoachText
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.text.NavText
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/** The sections, switched from the tag at the top left. */
enum class Tab(val label: String) {
    BACKUPS(NavText.BACKUPS),
    LIVE(NavText.LIVE),
    DEVICE(NavText.DEVICE),
}

/**
 * Live's SAMPLE key in the top bar (an addition): a mic key that is lit
 * while SAMPLE's panel is open ([on]). A tap ([onTap]) opens the panel, or
 * closes it while it is open.
 */
@Immutable
data class SampleKey(val on: Boolean, val onTap: () -> Unit)

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
    onConnect: () -> Unit,
    onDebug: () -> Unit,
    onSettings: () -> Unit,
    onHelp: () -> Unit,
    guideOpen: Boolean,
    onGuide: (Boolean) -> Unit,
    guide: @Composable () -> Unit,
    /** Fills the top bar's middle (Live's display line, in a short window). */
    middle: (@Composable BoxScope.() -> Unit)? = null,
    /** Live's SAMPLE key in the top bar (an addition; null for none, as on the other sections). */
    sample: SampleKey? = null,
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
                    onConnect = onConnect,
                    onDebug = onDebug,
                    onHelp = onHelp,
                    middle = middle,
                    sample = sample,
                )
            },
        ) {
            content()
            GuideEdgeTab({ onGuide(true) }, Modifier.align(Alignment.CenterStart).aboveMiddle())
            // Under the top bar, so the tag stays in view above the list.
            SectionMenu(
                menuOpen, tab,
                onPick = { menuOpen = false; onTab(it) },
                onSettings = { menuOpen = false; onSettings() },
                onDismiss = { menuOpen = false },
            )
        }
        AnimatedVisibility(guideOpen, enter = slideInHorizontally { -it }, exit = slideOutHorizontally { -it }) {
            guide()
        }
    }
}

/**
 * The section tag, then icon keys as in the pocket operator app's top row: the
 * connection key is green with a dot while the EP-133 is connected (a tap
 * disconnects) and navy with a ring when not, then the guide overlay (?).
 * Their names show on long-press, in the overlay and to screen readers. Back
 * up lives on the Backups screen, and Settings in Live's tools and the section
 * list under the tag ([SectionMenu]). Long-pressing the tag opens the debug
 * screen (as the wordmark did). The room between the tag and the keys holds
 * [middle]; a toast in a short window takes its place. On Live, a mic key
 * ([sample], an addition) comes before ?, round as it is, and orange while
 * SAMPLE's panel is open.
 */
@Composable
fun TopBar(
    section: Tab,
    onSections: () -> Unit,
    connected: Boolean,
    canConnect: Boolean,
    onConnect: () -> Unit,
    onDebug: () -> Unit,
    onHelp: () -> Unit = {},
    middle: (@Composable BoxScope.() -> Unit)? = null,
    sample: SampleKey? = null,
) {
    val c = LocalArcColors.current
    val window = LocalArcWindow.current
    val slot = LocalBarSlot.current
    DisposableEffect(slot) { onDispose { slot?.bounds = null } }
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
        Row(
            Modifier
                // Wider on a phone on its side, where the middle holds Live's display line.
                .widthIn(max = if (window.landscape) 1200.dp else 720.dp)
                .fillMaxWidth()
                // 56 dp tall instead of 66 when the window is short.
                .padding(start = 16.dp, end = 16.dp, top = if (window.short) 6.dp else 12.dp, bottom = if (window.short) 6.dp else 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SectionTag(
                section, onSections, onDebug,
                Modifier.coachMark("top.sections", CoachText.SECTIONS, c.navy, c.onNavy),
            )
            // As tall as the keys; empty, it is just the space between.
            Box(
                Modifier
                    .weight(1f)
                    .heightIn(min = 44.dp)
                    .onGloballyPositioned { slot?.bounds = it.boundsInRoot() },
                contentAlignment = Alignment.Center,
            ) {
                middle?.invoke(this)
            }
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
            if (sample != null) {
                IconBlock(
                    ArcIcon.MIC, MirrorText.SAMPLE_TAG,
                    if (sample.on) c.signal else c.tabOff,
                    if (sample.on) c.onSignal else c.navy,
                    sample.onTap,
                    Modifier.coachMark("top.sample", CoachText.SAMPLE, c.signal, c.onSignal),
                    round = true,
                    state = MirrorText.onOff(sample.on),
                )
            }
            IconBlock(
                ArcIcon.HELP, CoachText.HELP, c.tabOff, c.navy, onHelp,
                Modifier.coachMark("top.help", CoachText.HELP, c.ink, c.shell),
                round = true,
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
 * The sections, as caps stacked under the section tag (drawn in place, not
 * in a popup window): the current one navy and down. After them, under a thin
 * rule, Settings (an addition), a cap like an unselected tab with the gear
 * before its word. A tap outside closes the list.
 */
@Composable
fun SectionMenu(open: Boolean, current: Tab, onPick: (Tab) -> Unit, onSettings: () -> Unit, onDismiss: () -> Unit) {
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
                    val source = remember { MutableInteractionSource() }
                    val pressed by source.collectIsPressedAsState()
                    Box(
                        Modifier
                            .widthIn(min = 150.dp)
                            .heightIn(min = 48.dp)
                            .cap(
                                if (on) c.navy else c.key,
                                if (on) capEdge(c.navy) else c.keyEdge,
                                RoundedCornerShape(8.dp),
                                capPress(on || pressed),
                            )
                            .clickable(interactionSource = source, indication = null, role = Role.Tab) { onPick(t) }
                            .semantics { selected = on }
                            .padding(horizontal = 16.dp),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        Text(t.label.uppercase(), style = ArcType.tab, color = if (on) c.onNavy else c.ink)
                    }
                }
                // A wider gap, then the page that is no section (a rule would cross the page behind the scrim).
                Spacer(Modifier.height(8.dp))
                val source = remember { MutableInteractionSource() }
                val pressed by source.collectIsPressedAsState()
                Row(
                    Modifier
                        .widthIn(min = 150.dp)
                        .heightIn(min = 48.dp)
                        .cap(c.key, c.keyEdge, RoundedCornerShape(8.dp), capPress(pressed))
                        .clickable(interactionSource = source, indication = null, role = Role.Button, onClick = onSettings)
                        .semantics { contentDescription = CoachText.SETTINGS }
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(ArcIcon.GEAR, c.ink, size = 20.dp)
                    Text(CoachText.SETTINGS.uppercase(), style = ArcType.tab, color = c.ink)
                }
            }
        }
    }
}

/** The vertical tab on the left edge that opens the EP-133 shortcut guide (the PO's TUTORIAL tab). */
@Composable
fun GuideEdgeTab(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    EdgeTab(
        NavText.GUIDE_TAB, onClick, modifier,
        Modifier
            .semantics {
                role = Role.Button
                contentDescription = CoachText.GUIDE_TAB
            }
            .coachMark("edge.guide", CoachText.GUIDE_TAB, c.navy, c.onNavy),
    )
}

/**
 * A vertical tab on the left edge, its [word] reading bottom to top, as the
 * PO's side tabs: quiet, like an unselected key, unless [face] says otherwise.
 * [led]: a small LED near its top. [marks] (what screen readers and the
 * guide overlay read) go on the tab itself, inside the safe area.
 */
@Composable
private fun EdgeTab(
    word: String,
    onClick: () -> Unit,
    modifier: Modifier,
    marks: Modifier,
    face: Color? = null,
    ink: Color? = null,
    led: Color? = null,
    ledGlow: Boolean = false,
) {
    val c = LocalArcColors.current
    Box(
        modifier
            // Clear of a navigation bar or a cutout on that side.
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Start))
            .width(EdgeTabWidth)
            .height(EdgeTabHeight)
            .clip(RoundedCornerShape(topEnd = 8.dp, bottomEnd = 8.dp))
            // Quiet, like an unselected key: always there, never the loudest thing on the page.
            .background(face ?: c.tabOff)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClick)
            .then(marks),
        contentAlignment = Alignment.Center,
    ) {
        if (led != null) {
            Box(
                Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 9.dp)
                    .size(6.dp)
                    .then(if (ledGlow) Modifier.dropShadow(CircleShape, Shadow(radius = 6.dp, color = led)) else Modifier)
                    .clip(CircleShape)
                    .background(led),
            )
        }
        // The tab is only so wide, so the word grows with the text size only so far.
        val density = LocalDensity.current
        CompositionLocalProvider(LocalDensity provides Density(density.density, minOf(density.fontScale, 1.3f))) {
            Text(
                word.uppercase(),
                style = ArcType.capsKeySmall,
                color = ink ?: c.onTabOff,
                maxLines = 1,
                softWrap = false,
                // Below the LED, if there is one.
                modifier = Modifier.padding(top = if (led != null) 10.dp else 0.dp).rotateVertical(),
            )
        }
    }
}

private val EdgeTabHeight = 112.dp

/**
 * Lifts the guide tab 80 dp above the page's middle, or less on a short page,
 * so it keeps 8 dp clear of the top bar.
 */
private fun Modifier.aboveMiddle(): Modifier = layout { measurable, constraints ->
    val p = measurable.measure(constraints)
    val lift = guideLift(constraints)
    layout(p.width, p.height) { p.place(0, -lift) }
}

/** How far [aboveMiddle] lifts the guide tab, in px. */
private fun androidx.compose.ui.layout.MeasureScope.guideLift(constraints: androidx.compose.ui.unit.Constraints): Int =
    if (constraints.hasBoundedHeight) minOf(80.dp.roundToPx(), constraints.maxHeight / 2 - 64.dp.roundToPx()) else 80.dp.roundToPx()

/** Turns a single line of text a quarter turn anticlockwise, swapping its width and height for layout. */
internal fun Modifier.rotateVertical(): Modifier = layout { measurable, constraints ->
    val p = measurable.measure(constraints.copy(minWidth = 0, maxWidth = androidx.compose.ui.unit.Constraints.Infinity, minHeight = 0))
    layout(p.height, p.width) {
        p.placeWithLayer(-(p.width - p.height) / 2, (p.width - p.height) / 2) { rotationZ = -90f }
    }
}
