package dev.arc.ep133.ui.components

import androidx.compose.ui.semantics.stateDescription
import dev.arc.ep133.text.SettingsText
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.absoluteOffset
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.AbsoluteAlignment
import androidx.compose.ui.Alignment
import kotlinx.coroutines.launch
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.layout.onPlaced
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import dev.arc.ep133.ui.theme.ArcColors
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlinx.coroutines.delay
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.roundToInt

enum class KeyStyle { Normal, Signal, Quiet, Navy }

enum class KeySize { Normal, Small, Wide }

private val KeyEasing = CubicBezierEasing(0.25f, 0.1f, 0.25f, 1f)

/**
 * A physical key: pale (or orange) top with a bottom edge that the key
 * travels down onto while pressed (`.key` in styles.css). Flatter than the
 * web version's, with an uppercase label, after the pocket operator app.
 */
@Composable
fun ArcKey(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: KeyStyle = KeyStyle.Normal,
    size: KeySize = KeySize.Normal,
    enabled: Boolean = true,
    textColor: Color? = null,
) {
    val c = LocalArcColors.current
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val press by animateFloatAsState(
        targetValue = if (pressed && enabled && style != KeyStyle.Quiet) 1f else 0f,
        animationSpec = tween(60, easing = KeyEasing),
        label = "key",
    )
    val (bg, fg, edge) = when (style) {
        KeyStyle.Normal -> Triple(c.key, c.ink, c.keyEdge)
        KeyStyle.Signal -> Triple(c.signal, c.onSignal, c.signalEdge)
        KeyStyle.Quiet -> Triple(Color.Transparent, c.graphite, Color.Transparent)
        KeyStyle.Navy -> Triple(c.navy, c.onNavy, c.navy.copy(alpha = 0.55f))
    }
    val (minH, padV, padH, ts) = when (size) {
        KeySize.Normal -> KeyDims(48.dp, 15.dp, 18.dp, ArcType.capsKey)
        KeySize.Small -> KeyDims(40.dp, 10.dp, 14.dp, ArcType.capsKeySmall)
        KeySize.Wide -> KeyDims(60.dp, 15.dp, 18.dp, ArcType.capsKeyWide)
    }
    val shape = RoundedCornerShape(KeyRadius)
    val alpha = if (enabled) 1f else 0.45f
    Box(
        modifier = modifier
            .graphicsLayer { translationY = press * KeyTravel.toPx() }
            .drawBehind {
                // box-shadow: 0 3px 0 edge. Only the strip below the face is drawn,
                // outside the faded layer, so a disabled key keeps its (faded) edge.
                if (style != KeyStyle.Quiet) {
                    val edgePx = (1f - press) * KeyTravel.toPx()
                    if (edgePx > 0f) {
                        val r = CornerRadius(KeyRadius.toPx())
                        val face = Path().apply { addRoundRect(RoundRect(0f, 0f, this@drawBehind.size.width, this@drawBehind.size.height, r)) }
                        val below = Path().apply { addRoundRect(RoundRect(0f, edgePx, this@drawBehind.size.width, this@drawBehind.size.height + edgePx, r)) }
                        drawPath(Path().apply { op(below, face, PathOperation.Difference) }, edge.copy(alpha = edge.alpha * alpha))
                    }
                }
            }
            // opacity: .45 fades the face and label together
            .graphicsLayer { this.alpha = alpha }
            .clip(shape)
            .background(bg)
            .clickable(interactionSource = interaction, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
            .heightIn(min = minH)
            .padding(vertical = padV, horizontal = padH),
        contentAlignment = Alignment.Center,
    ) {
        Text(text.uppercase(), style = ts, color = textColor ?: fg, maxLines = 2, textAlign = TextAlign.Center)
    }
}

private val KeyRadius = 8.dp
private val KeyTravel = 2.dp

private data class KeyDims(val minH: Dp, val padV: Dp, val padH: Dp, val style: TextStyle)

/** "arc" followed by the orange dot. Long-press opens the hidden debug screen. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun Wordmark(onLongPress: () -> Unit) {
    val c = LocalArcColors.current
    val onePx = with(LocalDensity.current) { 1.dp.roundToPx() }
    Row(
        modifier = Modifier.combinedClickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = null,
            onClick = {},
            onLongClick = onLongPress,
        ),
    ) {
        Text("arc", style = ArcType.wordmark, color = c.ink, modifier = Modifier.alignByBaseline())
        // ::after { 9px dot, margin-left 3px, vertical-align: 1px } (its bottom sits 1px above the baseline)
        Box(
            Modifier
                .alignBy { it.measuredHeight + onePx }
                .padding(start = 3.dp)
                .size(9.dp)
                .clip(CircleShape)
                .background(c.signal),
        )
    }
}

/** The dark display panel: the one loud element on the page. */
@Composable
fun DisplayPanel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val c = LocalArcColors.current
    Column(
        modifier = modifier
            .fillMaxWidth()
            .drawBehind {
                val r = CornerRadius(PanelRadius.toPx())
                // 0 1px 0 rgba(255,255,255,.5) below the panel
                drawRoundRect(Color.White.copy(alpha = 0.5f), topLeft = Offset(0f, 1.dp.toPx()), size = size, cornerRadius = r)
                drawRoundRect(c.display, size = size, cornerRadius = r)
            }
            .drawWithContent {
                drawContent()
                // inset 0 2px 0 rgba(0,0,0,.35): a band along the top inner edge
                val r = CornerRadius(PanelRadius.toPx())
                val outer = Path().apply { addRoundRect(androidx.compose.ui.geometry.RoundRect(0f, 0f, size.width, size.height, r)) }
                val inner = Path().apply { addRoundRect(androidx.compose.ui.geometry.RoundRect(0f, 2.dp.toPx(), size.width, size.height + 2.dp.toPx(), r)) }
                val band = Path().apply { op(outer, inner, PathOperation.Difference) }
                drawPath(band, Color.Black.copy(alpha = 0.35f))
            }
            .semantics { liveRegion = LiveRegionMode.Polite }
            .padding(start = 18.dp, end = 18.dp, top = 18.dp, bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        content = content,
    )
}

private val PanelRadius = 22.dp

/**
 * The display as one dark line: Live's display line, and the device on a
 * phone on its side. [compact] fits it in the top bar.
 */
@Composable
fun DisplayLine(modifier: Modifier = Modifier, compact: Boolean = false, content: @Composable RowScope.() -> Unit) {
    val c = LocalArcColors.current
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(if (compact) 12.dp else 14.dp))
            .background(c.display)
            .heightIn(min = if (compact) 44.dp else 48.dp)
            .padding(horizontal = if (compact) 12.dp else 14.dp, vertical = if (compact) 4.dp else 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        content = content,
    )
}

/** A small centred uppercase label above a panel ("VIDEO", "KEYPAD" in the pocket operator app). */
@Composable
fun Caption(text: String, modifier: Modifier = Modifier, color: Color? = null, align: TextAlign = TextAlign.Center) {
    val c = LocalArcColors.current
    Text(
        text.uppercase(),
        style = ArcType.caps,
        color = color ?: c.graphite,
        textAlign = align,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier.fillMaxWidth(),
    )
}

/**
 * A rounded pale plate whose rows are split by thin lines, like the pocket
 * operator app's pad grid. Put [PlateLine] between rows.
 */
@Composable
fun GridPlate(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val c = LocalArcColors.current
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(PlateRadius))
            .background(c.plate),
        content = content,
    )
}

/** The 1dp line between two rows of a [GridPlate]. */
@Composable
fun PlateLine() {
    val c = LocalArcColors.current
    Box(Modifier.fillMaxWidth().height(1.dp).background(c.line))
}

val PlateRadius = 18.dp

/**
 * One row of a plate drawn row by row (for lazy lists): only the plate's
 * outer corners are rounded, and a thin line sits above every row but the first.
 */
fun Modifier.plateRow(first: Boolean, last: Boolean, plate: Color, line: Color): Modifier =
    clip(
        RoundedCornerShape(
            topStart = if (first) PlateRadius else 0.dp, topEnd = if (first) PlateRadius else 0.dp,
            bottomStart = if (last) PlateRadius else 0.dp, bottomEnd = if (last) PlateRadius else 0.dp,
        ),
    )
        .background(plate)
        .drawBehind { if (!first) drawRect(line, size = androidx.compose.ui.geometry.Size(size.width, 1.dp.toPx())) }

/** A row of blocks to switch between views: navy when selected, pale grey otherwise (like the tabs). */
@Composable
fun Segmented(options: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEachIndexed { i, label ->
            val on = i == selected
            Box(
                Modifier
                    .weight(1f)
                    .heightIn(min = 44.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (on) c.navy else c.tabOff)
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Tab) { onSelect(i) }
                    .semantics { this.selected = on }
                    .padding(horizontal = 4.dp, vertical = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(label.uppercase(), style = ArcType.capsKeySmall, color = if (on) c.onNavy else c.onTabOff, maxLines = 1, textAlign = TextAlign.Center)
            }
        }
    }
}

/** A setting that is on or off: its name and note, and an ON / OFF block (navy when on). */
@Composable
fun SwitchRow(title: String, note: String, on: Boolean, onChange: (Boolean) -> Unit) {
    val c = LocalArcColors.current
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Switch) { onChange(!on) }
            .semantics { stateDescription = if (on) SettingsText.ON else SettingsText.OFF }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = ArcType.bold, color = c.ink)
            Text(note, style = ArcType.small, color = c.graphite)
        }
        Box(
            Modifier
                .widthIn(min = 56.dp)
                .heightIn(min = 34.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(if (on) c.navy else c.tabOff)
                .padding(horizontal = 10.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text((if (on) SettingsText.ON else SettingsText.OFF).uppercase(), style = ArcType.capsKeySmall, color = if (on) c.onNavy else c.onTabOff)
        }
    }
}

/**
 * A quiet switch between views: words side by side, the chosen one in ink and
 * underlined (like the pocket operator app's DRUMS / KEYPAD), the others grey.
 */
@Composable
fun TextToggle(options: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        options.forEachIndexed { i, label ->
            val on = i == selected
            Column(
                Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Tab) { onSelect(i) }
                    .semantics { this.selected = on }
                    .heightIn(min = 40.dp)
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(label.uppercase(), style = ArcType.capsKeySmall, color = if (on) c.ink else c.graphite, maxLines = 1)
                Box(Modifier.height(2.dp).width(18.dp).background(if (on) c.navy else Color.Transparent))
            }
        }
    }
}

/** A word's ink: quiet caption grey, so the pads stay the loudest thing on the page; paler when [dim] (not taken, or not available). */
fun ArcColors.wordInk(dim: Boolean = false): Color = if (dim) graphite.copy(alpha = 0.45f) else graphite

/**
 * A word under the grid as the pocket operator app shows DRUMS / KEYPAD:
 * small and uppercase. [mark] puts the two-squares mark before it (a word
 * that switches modes); [dim] draws it pale (a choice not taken). Screen
 * readers read [description] when given.
 */
@Composable
fun WordButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    mark: Boolean = false,
    dim: Boolean = false,
    description: String? = null,
    /** Text at the top of the touch area rather than its middle (a row hugging the grid above). */
    top: Boolean = false,
) {
    val c = LocalArcColors.current
    val ink = c.wordInk(dim)
    // The touch area is 44dp tall; the mark and the word stay centred on each other,
    // at its middle or (with [top]) its top.
    Box(
        modifier
            .clip(RoundedCornerShape(6.dp))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = onClick)
            .then(if (description != null) Modifier.semantics(mergeDescendants = true) { contentDescription = description } else Modifier)
            .heightIn(min = 44.dp)
            .padding(top = if (top) 0.dp else 6.dp, bottom = 6.dp),
        contentAlignment = if (top) Alignment.TopStart else Alignment.CenterStart,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (mark) Icon(ArcIcon.SWAP, ink, size = 12.dp)
            Text(label.uppercase(), style = ArcType.word, color = ink, maxLines = 1)
        }
    }
}

/**
 * A round play key for a list row: navy with a triangle, orange with a square
 * while playing, faded while the device is busy with something else.
 */
@Composable
fun PlayKey(playing: Boolean, enabled: Boolean, description: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    // Quiet until it plays: an outline with a navy triangle, filled orange while playing.
    val face = if (playing) c.signal else Color.Transparent
    val ink = if (playing) c.onSignal else c.navy
    Box(
        modifier
            .size(40.dp)
            .graphicsLayer { alpha = if (enabled || playing) 1f else 0.4f }
            .clip(CircleShape)
            .background(face)
            .then(if (playing) Modifier else Modifier.border(1.5.dp, c.navy.copy(alpha = 0.6f), CircleShape))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                enabled = enabled || playing,
                role = Role.Button,
                onClick = onClick,
            )
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.foundation.Canvas(Modifier.size(14.dp)) {
            if (playing) {
                drawRect(ink)
            } else {
                // A triangle nudged right so it looks centred.
                val p = Path().apply {
                    moveTo(size.width * 0.12f, 0f)
                    lineTo(size.width, size.height / 2)
                    lineTo(size.width * 0.12f, size.height)
                    close()
                }
                drawPath(p, ink)
            }
        }
    }
}

/** Diagonal hatching in [color], as on the pocket operator app's empty side panels. */
fun Modifier.hatch(color: Color, spacing: Dp = 9.dp, width: Dp = 1.dp): Modifier = clipToBounds().drawBehind {
    val step = spacing.toPx()
    val stroke = width.toPx()
    var x = -size.height
    while (x < size.width) {
        drawLine(color, Offset(x, size.height), Offset(x + size.height, 0f), strokeWidth = stroke)
        x += step
    }
}

/**
 * The 24-segment meter (renderMeter in app.js). With [tipHot] only the last lit
 * segment is orange (progress); otherwise everything lit turns orange once the
 * fraction reaches [hotAbove] (storage nearly full).
 */
@Composable
fun Meter(
    fraction: Double,
    modifier: Modifier = Modifier,
    segments: Int = 24,
    hotAbove: Double = 0.9,
    tipHot: Boolean = false,
    height: Dp = 22.dp,
) {
    val c = LocalArcColors.current
    val f = fraction.coerceIn(0.0, 1.0)
    val lit = if (f > 0) max(1, floor(f * segments + 0.5).toInt()) else 0
    Row(modifier.fillMaxWidth().height(height), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        for (i in 0 until segments) {
            val color = when {
                i >= lit -> c.segmentOff
                tipHot -> if (i == lit - 1) c.signal else c.displayInk
                fraction >= hotAbove -> c.signal
                else -> c.displayInk
            }
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxSize()
                    .clip(RoundedCornerShape(2.dp))
                    .background(color),
            )
        }
    }
}

/** The progress meter: tip-hot segments in a small display-coloured box. */
@Composable
fun ProgressMeter(fraction: Double) {
    val c = LocalArcColors.current
    Box(
        Modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(c.display)
            .padding(10.dp)
            .semantics { progressBarRangeInfo = ProgressBarRangeInfo(fraction.toFloat().coerceIn(0f, 1f), 0f..1f) },
    ) {
        Meter(fraction, tipHot = true, height = 24.dp)
    }
}

private val SheetEasing = CubicBezierEasing(0.2f, 0.8f, 0.2f, 1f)

/**
 * A bottom sheet over a scrim (the web version's <dialog class="sheet">).
 * [onDismiss] null makes it modal: no scrim tap, no back (the progress sheet).
 */
@Composable
fun ArcSheet(visible: Boolean, onDismiss: (() -> Unit)?, grip: Boolean = true, content: @Composable ColumnScope.() -> Unit) {
    val c = LocalArcColors.current
    BackHandler(enabled = visible) { onDismiss?.invoke() }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val wide = maxWidth >= 640.dp
        val rise = with(LocalDensity.current) { 40.dp.roundToPx() }
        AnimatedVisibility(visible, enter = fadeIn(tween(220)), exit = ExitTransition.None) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(c.scrim)
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { onDismiss?.invoke() },
            )
        }
        // The sheet keeps to the safe area, so its height cap counts from under the status bar and it
        // centres between side bars. A bottom sheet's face still reaches under the navigation bar (its
        // content keeps clear of it); the dialog keeps clear of it, and of the keyboard, altogether.
        val insets = if (wide) WindowInsets.safeDrawing else WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)
        BoxWithConstraints(Modifier.fillMaxSize().windowInsetsPadding(insets)) {
            val screenHeight = maxHeight
            // @keyframes rise: from translateY(40px) and opacity 0, 220ms; dialog.close() has no animation.
            // On wide screens (min-width: 640px) the sheet is a centred dialog.
            AnimatedVisibility(
                visible,
                modifier = Modifier.align(if (wide) Alignment.Center else Alignment.BottomCenter),
                enter = slideInVertically(tween(220, easing = SheetEasing)) { rise } + fadeIn(tween(220, easing = SheetEasing)),
                exit = ExitTransition.None,
            ) {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.BottomCenter) {
                    val shape = if (wide) RoundedCornerShape(22.dp) else RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp)
                    Column(
                        Modifier
                            .widthIn(max = 560.dp)
                            .fillMaxWidth()
                            .heightIn(max = screenHeight * 0.92f)
                            .clip(shape)
                            .background(c.shell)
                            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
                            .imePadding()
                            .verticalScroll(rememberScrollState())
                            // Nothing left to add in the dialog: its box took the bars.
                            .windowInsetsPadding(WindowInsets.navigationBars)
                            .padding(start = 18.dp, end = 18.dp, top = if (grip) 10.dp else 22.dp, bottom = 22.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        if (grip) {
                            Box(
                                Modifier
                                    .align(Alignment.CenterHorizontally)
                                    .size(40.dp, 5.dp)
                                    .clip(RoundedCornerShape(3.dp))
                                    .background(c.keyEdge),
                            )
                        }
                        content()
                    }
                }
            }
        }
    }
}

/** The narrowest top-bar middle a toast takes: two lines of a message still read there. */
private val BarToastMin = 200.dp

/**
 * A toast at the bottom of the screen; errors get an orange left border and
 * stay longer. Swiping it sideways or down dismisses it at once, as with a
 * notification. In a short window (a phone on its side) it takes the top
 * bar's middle instead, so it never covers the keys: two lines at most until
 * a tap unfolds the rest, and it is swiped away up or sideways. Where that
 * middle is too narrow to read (a split screen) or there is no top bar (a
 * full-screen page), it stays at the bottom.
 */
@Composable
fun ArcToast(
    id: Long?,
    text: String,
    error: Boolean,
    onTimeout: (Long) -> Unit,
    modifier: Modifier = Modifier,
    /** Room left at the bottom, above the tab bar. */
    bottomInset: Dp = 0.dp,
) {
    val c = LocalArcColors.current
    val density = LocalDensity.current
    // In the bar: over its middle, measured from where this toast's own box sits.
    val slot = LocalBarSlot.current?.bounds?.takeIf { LocalArcWindow.current.short && it.width >= with(density) { BarToastMin.toPx() } }
    val inBar = slot != null
    // One already up when this is first drawn (a screenshot) shows in that first frame.
    var shown by remember { mutableStateOf(id?.let { Triple(it, text, error) }) }
    // Unfolding a toast in the bar starts its time again, to read the rest.
    var unfolded by remember(shown?.first) { mutableStateOf(false) }
    LaunchedEffect(id, unfolded) {
        if (id != null) {
            shown = Triple(id, text, error)
            delay(if (error) 7000 else 3200)
            onTimeout(id)
        }
    }
    var origin by remember { mutableStateOf(Offset.Zero) }
    AnimatedVisibility(
        id != null,
        modifier = if (inBar) modifier.fillMaxSize().onPlaced { origin = it.positionInRoot() } else modifier,
        enter = fadeIn(),
        exit = fadeOut(),
    ) {
        val s = shown ?: return@AnimatedVisibility
        val scope = androidx.compose.runtime.rememberCoroutineScope()
        // How far the toast has been dragged; each toast starts in place.
        val dx = remember(s.first) { androidx.compose.animation.core.Animatable(0f) }
        val dy = remember(s.first) { androidx.compose.animation.core.Animatable(0f) }
        var box by remember { mutableStateOf(androidx.compose.ui.unit.IntSize(1, 1)) }
        val fling = with(density) { 700.dp.toPx() }
        // Which way it leaves along the height: down at the bottom, up out of the bar.
        val away = if (inBar) -1f else 1f
        val dismiss = {
            scope.launch {
                // Off the way it was going, then gone.
                if (kotlin.math.abs(dx.value) >= kotlin.math.abs(dy.value)) {
                    dx.animateTo(if (dx.value < 0) -box.width * 1.2f else box.width * 1.2f, tween(160))
                } else {
                    dy.animateTo(away * box.height * 1.5f, tween(160))
                }
                onTimeout(s.first)
            }
            Unit
        }
        val place = if (slot == null) {
            Modifier
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(bottom = bottomInset)
                .padding(16.dp)
                .widthIn(max = 528.dp)
                .fillMaxWidth()
        } else {
            // (Its box fills the screen, so it measures loose from the top left.) The slot is
            // where it is on screen, so it is placed left to right in a right-to-left layout too.
            Modifier
                .wrapContentSize(AbsoluteAlignment.TopLeft)
                .absoluteOffset { IntOffset((slot.left - origin.x).roundToInt(), (slot.center.y - origin.y).roundToInt() - 22.dp.roundToPx()) }
                .width(with(density) { slot.width.toDp() })
        }
        Row(
            place
                .onSizeChanged { box = it }
                // Read before the layer moves the toast, so the finger's speed is measured on screen.
                .pointerInput(s.first, inBar) {
                    val tracker = androidx.compose.ui.input.pointer.util.VelocityTracker()
                    detectDragGestures(
                        onDragStart = { tracker.resetTracking() },
                        onDrag = { change, drag ->
                            change.consume()
                            tracker.addPosition(change.uptimeMillis, change.position)
                            scope.launch {
                                dx.snapTo(dx.value + drag.x)
                                // Down only: up would cover the page. In the bar, up only: down would cover the keys.
                                dy.snapTo(if (inBar) (dy.value + drag.y).coerceAtMost(0f) else (dy.value + drag.y).coerceAtLeast(0f))
                            }
                        },
                        onDragEnd = {
                            val v = tracker.calculateVelocity()
                            val sideways = kotlin.math.abs(dx.value) > box.width * 0.3f ||
                                kotlin.math.abs(v.x) > fling && kotlin.math.abs(v.x) > kotlin.math.abs(v.y)
                            val off = away * dy.value > box.height * 0.5f || away * v.y > fling && away * v.y > kotlin.math.abs(v.x)
                            if (sideways || off) {
                                dismiss()
                            } else {
                                scope.launch { dx.animateTo(0f) }
                                scope.launch { dy.animateTo(0f) }
                            }
                        },
                        onDragCancel = {
                            scope.launch { dx.animateTo(0f) }
                            scope.launch { dy.animateTo(0f) }
                        },
                    )
                }
                .then(if (inBar) Modifier.pointerInput(s.first) { detectTapGestures { unfolded = !unfolded } } else Modifier)
                .graphicsLayer {
                    translationX = dx.value
                    translationY = dy.value
                    // Fades as it leaves.
                    val gone = maxOf(kotlin.math.abs(dx.value) / box.width, kotlin.math.abs(dy.value) / box.height)
                    alpha = 1f - 0.7f * gone.coerceIn(0f, 1f)
                }
                .clip(RoundedCornerShape(12.dp))
                .background(c.display)
                .then(
                    when {
                        !inBar -> Modifier.height(androidx.compose.foundation.layout.IntrinsicSize.Min)
                        // Unfolded, as tall as the text, growing down from the bar.
                        unfolded -> Modifier.heightIn(min = 44.dp).height(androidx.compose.foundation.layout.IntrinsicSize.Min)
                        else -> Modifier.height(44.dp)
                    },
                )
                .semantics {
                    liveRegion = LiveRegionMode.Polite
                    customActions = listOf(
                        androidx.compose.ui.semantics.CustomAccessibilityAction(SettingsText.DISMISS) {
                            onTimeout(s.first)
                            true
                        },
                    )
                },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // .toast.error { border-left: 5px solid var(--signal) }
            if (s.third) Box(Modifier.width(5.dp).fillMaxHeight().background(c.signal))
            if (inBar) {
                // Two lines of 13 sp fit the bar's 44 dp; what doesn't fit ends in an ellipsis.
                Text(
                    s.second,
                    style = ArcType.tiny.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold, lineHeight = 1.2.em),
                    color = c.displayInk,
                    maxLines = if (unfolded) Int.MAX_VALUE else 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(vertical = 4.dp, horizontal = 12.dp),
                )
            } else {
                Text(
                    s.second,
                    style = ArcType.body15.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold),
                    color = c.displayInk,
                    modifier = Modifier.padding(vertical = 14.dp, horizontal = 16.dp),
                )
            }
        }
    }
}

/** A labelled text field (`.field` in styles.css). */
@Composable
fun ArcField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
    minLines: Int = 1,
    placeholder: String = "",
    maxLength: Int = Int.MAX_VALUE,
    keyboardOptions: KeyboardOptions? = null,
    /** The field's colour; the pale key colour unless it sits on a pale page. */
    background: Color? = null,
) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label.uppercase(), style = ArcType.caps, color = c.graphite)
        val style = (if (singleLine) ArcType.fieldInput else ArcType.notesInput).copy(color = c.ink)
        BasicTextField(
            value = value,
            onValueChange = { onValueChange(it.take(maxLength)) },
            singleLine = singleLine,
            minLines = minLines,
            textStyle = style,
            cursorBrush = SolidColor(c.signal),
            keyboardOptions = keyboardOptions ?: KeyboardOptions(imeAction = if (singleLine) ImeAction.Done else ImeAction.Default),
            interactionSource = source,
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    // :focus-visible { outline: 3px solid signal; outline-offset: 2px }
                    if (focused) {
                        val o = 2.dp.toPx() + 1.5.dp.toPx()
                        drawRoundRect(
                            c.signal,
                            topLeft = Offset(-o, -o),
                            size = androidx.compose.ui.geometry.Size(size.width + 2 * o, size.height + 2 * o),
                            cornerRadius = CornerRadius(10.dp.toPx() + o),
                            style = Stroke(3.dp.toPx()),
                        )
                    }
                }
                .clip(RoundedCornerShape(10.dp))
                .background(background ?: c.key)
                .drawBehind {
                    // A thin rule along the bottom, in place of the web version's inset shadow.
                    val h = 1.dp.toPx()
                    drawRect(c.line.copy(alpha = 0.5f), topLeft = Offset(0f, size.height - h), size = androidx.compose.ui.geometry.Size(size.width, h))
                },
            decorationBox = { inner ->
                Box(Modifier.padding(vertical = 12.dp, horizontal = 14.dp)) {
                    if (value.isEmpty() && placeholder.isNotEmpty()) Text(placeholder, style = style.copy(color = c.graphite))
                    inner()
                }
            },
        )
    }
}

/** A radio or checkbox row on a pale key-coloured plate (`.radio` / `.check`). */
@Composable
fun ChoiceRow(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    radio: Boolean,
    enabled: Boolean = true,
    trailing: String? = null,
) {
    val c = LocalArcColors.current
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(c.key)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null, // .radio / .check have no press styling
                enabled = enabled,
                role = if (radio) Role.RadioButton else Role.Checkbox,
                onClick = onClick,
            )
            .padding(vertical = 12.dp, horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
            if (radio) {
                RadioButton(
                    selected = selected, onClick = null, enabled = enabled, modifier = Modifier.size(20.dp),
                    colors = RadioButtonDefaults.colors(selectedColor = c.signal, unselectedColor = c.graphite, disabledSelectedColor = c.signal, disabledUnselectedColor = c.graphite),
                )
            } else {
                Checkbox(
                    checked = selected, onCheckedChange = null, enabled = enabled, modifier = Modifier.size(20.dp),
                    colors = CheckboxDefaults.colors(checkedColor = c.signal, uncheckedColor = c.graphite, checkmarkColor = c.onSignal, disabledCheckedColor = c.signal, disabledUncheckedColor = c.graphite),
                )
            }
        }
        Text(text, style = ArcType.semi, color = c.ink, modifier = Modifier.weight(1f))
        if (trailing != null) Text(trailing, style = ArcType.small, color = c.graphite)
    }
}

/** The "No backups yet." box: a dashed outline with a hatched strip, after the pocket operator app. */
@Composable
fun DashedBox(content: @Composable ColumnScope.() -> Unit) {
    val c = LocalArcColors.current
    Column(
        Modifier
            .fillMaxWidth()
            .drawBehind {
                val w = 2.dp.toPx()
                drawRoundRect(
                    c.keyEdge,
                    topLeft = Offset(w / 2, w / 2),
                    size = androidx.compose.ui.geometry.Size(size.width - w, size.height - w),
                    cornerRadius = CornerRadius(12.dp.toPx()),
                    style = Stroke(width = w, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 6.dp.toPx()))),
                )
            }
            .padding(vertical = 22.dp, horizontal = 18.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        content = content,
    )
}

/** Text with a one-line ellipsis. */
@Composable
fun OneLine(text: String, style: TextStyle, color: Color, modifier: Modifier = Modifier) {
    Text(text, style = style, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = modifier)
}

@Composable
fun Gap(h: Dp) = Spacer(Modifier.height(h))

/** contentDescription helper for decorative groups. */
fun Modifier.describe(text: String): Modifier = if (text.isEmpty()) this else semantics { contentDescription = text }
