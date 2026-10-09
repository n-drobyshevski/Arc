package dev.arc.ep133.ui.screens

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.controller.ClipMode
import dev.arc.ep133.controller.PadStage
import dev.arc.ep133.controller.SceneUi
import dev.arc.ep133.controller.cycled
import dev.arc.ep133.features.Seq
import dev.arc.ep133.features.SwitchTime
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.ArcWindow
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

/*
 * Scenes on Live (an addition, after the EP-133's own patterns and scenes:
 * GROUP + − / +, MAIN + − / +, COMMIT, ERASE + MAIN held, SHIFT + C / D and
 * the scene change setting). An S01 chip on the display line (its words,
 * while the pattern plays: [PatternLine]) unrolls the line into the SCENE
 * panel over the function keys, as STEP's does ([SampleMorph],
 * [PanelKind.SCENE]), all of it on the line's dark screen: ▶, the scene's −
 * and + and the status in the line's own row ([SceneHeader]); then the four
 * groups' columns, each its pattern's number with − / + and NEXT FREE, COMMIT,
 * CLR (held 2 s; DEL on an empty scene) and CHANGE, and the CLIP row with its
 * bar pages ([SceneDeck]). Where the line rides in the top bar, the panel
 * comes out in the function keys' column with its own header ([SceneBodyFace]).
 * Unlike STEP's, the panel stays open while the pattern plays, so the pads
 * under it stay playable and a pick made on it waits for its bar or pattern
 * end, blinking where it will show. A tap on a number opens the 1–99 grid
 * over the pads ([PatternGrid]); the group keys carry the numbers too
 * ([GroupNumbers]).
 */

/**
 * Scenes for Live's page (an addition): [ui] as the controller has it, and
 * whether the pattern [running] (counting in or playing: the panel's ▶ reads
 * ■). The S01 chip opens the panel on Live's group ([onOpen]), ✕ closes it
 * ([onClose]), and a group shown moves its column's focus ([onGroup]). In
 * the panel: ▶ and ■ ([onPlay]), the scene's − and + ([onScene], -1 or +1),
 * a group's − and + ([onPatternStep]), NEXT FREE ([onNextFree]), its number
 * ([onGrid]: the 1–99 grid for that group, or closed) and a number tapped on
 * the grid ([onPatternPick]), COMMIT ([onCommit]), CLR / DEL once held 2 s
 * ([onErase]), CHANGE ([onSwitch]), the CLIP row's PTN, BAR and PAD
 * ([onClipMode]), a bar page ([onBar]), COPY and PASTE ([onCopy], [onPaste]).
 * [unroll] catches the panel that far along its motion, [holding] CLR / DEL
 * that far along its hold, and [still] keeps the blinks steady (screenshots).
 */
class LiveScene(
    val ui: SceneUi = SceneUi(),
    val running: Boolean = false,
    val unroll: Float? = null,
    val holding: Float = 0f,
    val still: Boolean = false,
    val onOpen: (group: Int) -> Unit = {},
    val onClose: () -> Unit = {},
    val onGroup: (Int) -> Unit = {},
    val onPlay: () -> Unit = {},
    val onScene: (dir: Int) -> Unit = {},
    val onPatternStep: (group: Int, dir: Int) -> Unit = { _, _ -> },
    val onPatternPick: (group: Int, n: Int) -> Unit = { _, _ -> },
    val onNextFree: (group: Int) -> Unit = {},
    val onGrid: (group: Int?) -> Unit = {},
    val onCommit: () -> Unit = {},
    val onErase: () -> Unit = {},
    val onSwitch: (SwitchTime) -> Unit = {},
    val onClipMode: (ClipMode) -> Unit = {},
    val onBar: (bar: Int) -> Unit = {},
    val onCopy: () -> Unit = {},
    val onPaste: () -> Unit = {},
)

/**
 * CLR / DEL's hold, as far along as it is (0..1 of [SCENE_HOLD_MS]): kept
 * where the panel is, so the key and the header's status read the same one,
 * and a change of the scene's state meanwhile doesn't lose it.
 */
@Stable
internal class SceneHold(start: Float = 0f) {
    var progress by mutableFloatStateOf(start)
}

/** How long CLR / DEL is held (ERASE + MAIN on the device) before it acts. */
internal const val SCENE_HOLD_MS = 2000

/**
 * The pattern numbers the group keys carry, A to D: each group's [numbers]
 * and, where a change waits, the one it goes to ([queued], blinking unless
 * [steady]).
 */
internal class GroupNumbers(val numbers: List<Int>, val queued: List<Int?>, val steady: Boolean)

/**
 * Whether the scene is worth saying: more than one scene, or a group on a
 * pattern other than 1. Only then do the group keys carry their numbers and
 * the line its readout while the pattern plays; else the S01 chip is all.
 */
internal fun SceneUi.worthSaying(): Boolean = count > 1 || groups.any { it.number != 1 }

/** The group keys' numbers for [ui], null while there is nothing worth saying ([worthSaying]). */
internal fun groupNumbers(ui: SceneUi, steady: Boolean): GroupNumbers? =
    if (ui.worthSaying()) GroupNumbers(ui.groups.map { it.number }, ui.groups.map { it.queued }, steady) else null

/**
 * The scene as the line reads it while the pattern plays: "S02 · A01 B03→05
 * C01 D02", its parts apart (the scene, then each group's pattern with the
 * number waiting after an arrow) for the queued one to blink alone.
 */
internal fun sceneReadout(ui: SceneUi): List<String> =
    listOf(ui.label, "·") + ui.groups.mapIndexed { g, c -> MirrorText.groupPattern(g, c.number) + (c.queued?.let { "→" + MirrorText.patternNumber(it) } ?: "") }

/** The scene's readout for screen readers: the scene and its patterns, and each change waiting. */
internal fun sceneSaid(ui: SceneUi): String =
    MirrorText.sceneSpoken(ui.index, ui.count, ui.groups.map { it.number }) +
        ui.groups.mapIndexedNotNull { g, c -> c.queued?.let { ". " + MirrorText.patternQueuedSpoken(g, it, ui.switchTime) } }.joinToString("")

/**
 * Whether the SCENE panel fits [window]: always upright, and on its side from [SceneMinHeight], under which (a phone's
 * shortest windows) its rows wouldn't fit the column.
 */
internal fun sceneFits(window: ArcWindow): Boolean = !window.landscape || window.height >= SceneMinHeight

/** The least height of a window on its side that has room for the SCENE panel. */
private val SceneMinHeight = 330.dp

/**
 * The SCENE panel's controls on the panel's dark screen, under its header
 * (or under the header in its own body, [SceneBodyFace]), as tall as [bar]
 * says: the four groups' columns; COMMIT, CLR and CHANGE; the CLIP row, and
 * under it, in BAR, the focused group's bar pages.
 */
internal fun sceneDeckHeight(bar: Boolean): Dp =
    SceneColumnsRow + SceneGap + SceneKeyRow + SceneGap + SceneKeyRow + if (bar) SceneGap + SceneBarRow else 0.dp

/**
 * SCENE's header, in the display line's own row as the line grows into the
 * panel ([SampleMorph]): ▶ (■ while the pattern runs), the scene's − and
 * + either side of its number, the status (in signal orange when it says
 * something: "B → 05 AT BAR END", "S03 COMMITTED", or "HOLD · DEL S05"
 * while CLR / DEL is held) and ✕. A screen reader hears it as the pane's
 * title, and each change once ([SceneUi.said]).
 */
@Composable
internal fun SceneHeader(scene: LiveScene, hold: SceneHold, haptics: Boolean, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    val ui = scene.ui
    BoxWithConstraints(modifier.fillMaxSize().semantics { paneTitle = MirrorText.SCENE_NAME }) {
        // A narrow header (a small phone's) closes its keys up, to leave the status its room.
        val tight = maxWidth < SceneHeaderTight
        val key = Modifier.size(if (tight) 28.dp else SceneStepWidth, SceneStepHeight)
        Row(
            Modifier.fillMaxSize().padding(horizontal = WaveSide),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(if (tight) 4.dp else 6.dp),
        ) {
            ScenePlayChip(scene)
            StepKey("−", MirrorText.PREV_SCENE, haptics, { scene.onScene(-1) }, key)
            Text(ui.label, style = ArcType.displayHead.copy(fontFeatureSettings = "tnum"), color = c.displayInk, maxLines = 1, softWrap = false)
            StepKey("+", if (ui.index == ui.count - 1) MirrorText.NEW_SCENE else MirrorText.NEXT_SCENE, haptics, { scene.onScene(1) }, key)
            val holding by remember(hold) { derivedStateOf { hold.progress > 0f } }
            val status = if (holding) MirrorText.eraseHolding(ui.canDelete, ui.label) else ui.status
            val said = spoken(ui.said ?: status ?: MirrorText.sceneStatus(ui.index, ui.count))
            BasicText(
                (status ?: MirrorText.sceneStatus(ui.index, ui.count)).uppercase(),
                style = ArcType.displayHead.copy(color = if (status != null) c.signal else c.displayDim, textAlign = TextAlign.End, fontFeatureSettings = "tnum"),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                autoSize = TextAutoSize.StepBased(minFontSize = SceneStatusMin, maxFontSize = ArcType.displayHead.fontSize, stepSize = 0.5.sp),
                modifier = Modifier.weight(1f).clearAndSetSemantics {
                    contentDescription = said
                    liveRegion = LiveRegionMode.Polite
                },
            )
            SceneClose(scene, if (tight) 26.dp else 32.dp)
        }
    }
}

/** The smallest type the header's status takes, where it is long or the header narrow. */
private val SceneStatusMin = 10.sp

/** A header narrower than this (a small phone's) closes its keys up. */
private val SceneHeaderTight = 330.dp

/** The header's − and +. */
private val SceneStepWidth = 32.dp
private val SceneStepHeight = 32.dp

/** The panel's ▶, and ■ while the pattern runs (a tap stops it): the panel stays open. */
@Composable
private fun ScenePlayChip(scene: LiveScene) {
    val running = scene.running
    LineChip(
        Modifier
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = scene.onPlay)
            .semantics(mergeDescendants = true) { contentDescription = if (running) FeatureText.STOP else MirrorText.PLAY },
        lit = running,
        filled = running,
        compact = false,
    ) { ink ->
        Canvas(Modifier.size(10.dp)) {
            if (running) {
                val s = size.width * 0.8f
                drawRect(ink, topLeft = Offset((size.width - s) / 2, (size.height - s) / 2), size = Size(s, s))
            } else {
                val p = Path().apply {
                    moveTo(size.width * 0.15f, 0f)
                    lineTo(size.width, size.height / 2)
                    lineTo(size.width * 0.15f, size.height)
                    close()
                }
                drawPath(p, ink)
            }
        }
    }
}

/** ✕ at the header's end: the panel rolls up into the line. */
@Composable
private fun SceneClose(scene: LiveScene, width: Dp) {
    val c = LocalArcColors.current
    Box(
        Modifier
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = scene.onClose)
            .semantics { contentDescription = MirrorText.CLOSE_SCENE }
            .size(width, 40.dp),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(10.dp)) {
            val w = 1.8.dp.toPx()
            drawLine(c.displayDim, Offset(0f, 0f), Offset(size.width, size.height), strokeWidth = w)
            drawLine(c.displayDim, Offset(size.width, 0f), Offset(0f, size.height), strokeWidth = w)
        }
    }
}

/**
 * SCENE's controls on the panel's dark screen: the four groups' columns
 * ([GroupColumn]); COMMIT, the CLR / DEL hold key and CHANGE; the CLIP row
 * (PTN, BAR, PAD, then COPY and PASTE) and, in BAR, the focused group's bar
 * pages. The rows fade and slide in as [panel] unrolls, one after the other.
 */
@Composable
internal fun SceneDeck(scene: LiveScene, panel: SamplePanel, hold: SceneHold, haptics: Boolean, modifier: Modifier = Modifier) {
    val ui = scene.ui
    BoxWithConstraints(modifier.fillMaxSize()) {
        // A narrow deck (a small phone's) sets its words a size down and its keys closer.
        val tight = maxWidth < SceneTight
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(SceneGap)) {
            Row(
                Modifier.fadeIn { panel.row(false) }.fillMaxWidth().height(SceneColumnsRow),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                for (g in 0..3) GroupColumn(g, scene, haptics, tight, Modifier.weight(1f).fillMaxHeight())
            }
            Row(
                Modifier.fadeIn { panel.row(true) }.fillMaxWidth().height(SceneKeyRow),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(if (tight) 4.dp else 6.dp),
            ) {
                SceneKey(
                    MirrorText.COMMIT, tight,
                    Modifier
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = scene.onCommit)
                        .semantics { stateDescription = MirrorText.COMMIT_NOTE },
                )
                EraseKey(scene, hold, haptics, tight)
                Spacer(Modifier.weight(1f))
                SceneWord(MirrorText.CHANGE)
                SceneKey(
                    MirrorText.switchName(ui.switchTime), tight,
                    Modifier
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button) { scene.onSwitch(ui.switchTime.cycled()) }
                        .semantics {
                            contentDescription = MirrorText.changeName(ui.switchTime)
                            stateDescription = MirrorText.CHANGE_NOTE
                        },
                    lit = ui.switchTime != SwitchTime.IMMEDIATE,
                )
            }
            Row(
                Modifier.fadeIn { panel.row(true) }.fillMaxWidth().height(SceneKeyRow),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(if (tight) 4.dp else 6.dp),
            ) {
                SceneWord(MirrorText.CLIP)
                ClipModes(scene, tight)
                Spacer(Modifier.weight(1f))
                SceneKey(
                    MirrorText.COPY, tight,
                    Modifier
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = scene.onCopy)
                        .semantics { contentDescription = MirrorText.COPY },
                    filled = ui.padStage == PadStage.SOURCE,
                )
                SceneKey(
                    MirrorText.PASTE, tight,
                    Modifier
                        .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = scene.onPaste)
                        .semantics { contentDescription = MirrorText.PASTE },
                    filled = ui.padStage == PadStage.TARGET,
                )
            }
            if (ui.clipMode == ClipMode.BAR) {
                Row(
                    Modifier.fadeIn { panel.row(true) }.fillMaxWidth().height(SceneBarRow),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    BarPageKeys(MirrorText.barPagesGroup(ui.group).uppercase(), ui.groups[ui.group].bars, ui.bar, scene.onBar, Modifier.weight(1f), SceneBarRow)
                    ui.clip?.takeIf { it.mode == ClipMode.BAR }?.let {
                        SceneWord(MirrorText.clipHeld(it.what), Modifier.clearAndSetSemantics { })
                    }
                }
            }
        }
    }
}

/**
 * The SCENE panel where the display line can't grow into it (in the top bar,
 * a phone on its side): at the top of the function keys' column
 * ([SampleSlot]), one dark rounded body with its own header ([SceneHeader])
 * over the controls ([SceneDeck]), as tall as they are (no taller than the
 * column).
 */
@Composable
internal fun SceneBodyFace(scene: LiveScene, panel: SamplePanel, hold: SceneHold, haptics: Boolean, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    BoxWithConstraints(modifier.fillMaxSize()) {
        val deck = sceneDeckHeight(scene.ui.clipMode == ClipMode.BAR)
        Column(Modifier.fillMaxWidth().heightIn(max = maxHeight).clip(RoundedCornerShape(BodyCorner)).background(c.display)) {
            Box(Modifier.fillMaxWidth().height(BodyHeader)) { SceneHeader(scene, hold, haptics) }
            SceneDeck(scene, panel, hold, haptics, Modifier.weight(1f, fill = false).height(deck + WaveFoot).padding(start = WaveSide, end = WaveSide, bottom = WaveFoot))
        }
    }
}

/**
 * A group's column: its letter (a dot while the pattern it plays has notes)
 * and number, − and + under them and NEXT FREE. A tap on the column makes it
 * the focused one (the group the CLIP row works on, a shade lighter and
 * outlined); a tap on the number opens the 1–99 grid for it. Where a change
 * waits the number reads "03→05", blinking, and the column is outlined in
 * signal orange.
 */
@Composable
private fun GroupColumn(group: Int, scene: LiveScene, haptics: Boolean, tight: Boolean, modifier: Modifier) {
    val c = LocalArcColors.current
    val ui = scene.ui
    val col = ui.groups[group]
    val focused = ui.group == group
    val queued = col.queued
    val notes = col.number in col.filled
    val shape = RoundedCornerShape(7.dp)
    val blink = queueBlink(scene.still || reducedMotion())
    val on = ui.gridGroup == group
    Column(
        modifier
            .clip(shape)
            .background(lerp(c.display, c.displayDim, if (focused) 0.22f else 0.10f), shape)
            .then(
                when {
                    queued != null -> Modifier.border(1.5.dp, c.signal, shape)
                    focused -> Modifier.border(1.2.dp, lerp(c.display, c.displayDim, 0.7f), shape)
                    else -> Modifier
                },
            )
            .pointerInput(group) { detectTapGestures { scene.onGroup(group) } }
            .semantics {
                role = Role.Tab
                selected = focused
                contentDescription = MirrorText.groupColumn(group, col.number, notes)
                onClick {
                    scene.onGroup(group)
                    true
                }
            }
            .padding(5.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().height(SceneNumberRow),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(MirrorText.groupKey(group), style = viewWordStyle(13.dp, 0f).copy(fontWeight = FontWeight.ExtraBold, lineHeight = 1.em), color = c.displayInk, maxLines = 1)
                // The dot gives way to a number waiting where the column is tight.
                if (notes && (queued == null || !tight)) Box(Modifier.size(4.dp).clip(CircleShape).background(c.signal))
            }
            Spacer(Modifier.weight(1f))
            Box(
                Modifier
                    .fillMaxHeight()
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button) { scene.onGrid(if (on) null else group) }
                    .semantics { contentDescription = MirrorText.groupColumn(group, col.number, notes) + ". " + MirrorText.PICK_PATTERN },
                contentAlignment = Alignment.CenterEnd,
            ) {
                val number = if (queued == null) MirrorText.patternNumber(col.number) else MirrorText.numberMove(col.number, queued)
                Text(
                    number,
                    style = ArcType.statFree.copy(fontSize = if (queued == null) 20.sp else if (tight) 11.sp else 13.sp, lineHeight = 1.em, fontFeatureSettings = "tnum"),
                    color = if (queued == null) c.displayInk else lerp(c.signal, c.displayInk, 0.35f),
                    maxLines = 1,
                    softWrap = false,
                    modifier = Modifier.clearAndSetSemantics { }.graphicsLayer { if (queued != null) alpha = blink.value },
                )
            }
        }
        Row(Modifier.fillMaxWidth().height(SceneColumnKey), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            StepKey("−", MirrorText.groupPrevious(group), haptics, { scene.onPatternStep(group, -1) }, Modifier.weight(1f).fillMaxHeight(), SceneKeyShade)
            StepKey("+", MirrorText.groupNext(group), haptics, { scene.onPatternStep(group, 1) }, Modifier.weight(1f).fillMaxHeight(), SceneKeyShade)
        }
        Box(
            Modifier
                .fillMaxWidth()
                .height(SceneFreeKey)
                .border(1.dp, c.displayDim.copy(alpha = 0.6f), RoundedCornerShape(6.dp))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button) { scene.onNextFree(group) }
                .semantics { contentDescription = MirrorText.groupNextFree(group) },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                MirrorText.NEXT_FREE.uppercase(),
                style = viewWordStyle(8.dp, 0.08f),
                color = c.displayInk,
                maxLines = 1,
                softWrap = false,
                modifier = Modifier.clearAndSetSemantics { },
            )
        }
    }
}

/** A queued number's blink: 1 down to [BLINK_LOW] and back over [QUEUE_BLINK_MS] each way; steady (1) where [steady]. */
@Composable
internal fun queueBlink(steady: Boolean): State<Float> {
    if (steady) return remember { mutableFloatStateOf(1f) }
    return androidx.compose.animation.core.rememberInfiniteTransition(label = "queued").animateFloat(
        1f,
        BLINK_LOW,
        androidx.compose.animation.core.infiniteRepeatable(
            androidx.compose.animation.core.tween(QUEUE_BLINK_MS),
            androidx.compose.animation.core.RepeatMode.Reverse,
        ),
        label = "queued",
    )
}

/** The queued number's blink: gentle, down to this (not dark) over this long each way. */
private const val BLINK_LOW = 0.35f
private const val QUEUE_BLINK_MS = 600

/**
 * CLR, held (ERASE + MAIN on the device): it fills over [SCENE_HOLD_MS], and
 * then acts: the scene is emptied of its notes, or (reading DEL, the scene
 * being empty and not the only one) deleted. Let go before, nothing happens.
 * A screen reader's long click does the same, without the wait.
 */
@Composable
private fun EraseKey(scene: LiveScene, hold: SceneHold, haptics: Boolean, tight: Boolean) {
    val current by rememberUpdatedState(scene)
    val tick by rememberUpdatedState(if (haptics) LocalHapticFeedback.current else null)
    val delete = scene.ui.canDelete
    val gesture = Modifier
        .pointerInput(Unit) {
            coroutineScope {
                awaitEachGesture {
                    awaitFirstDown().consume()
                    val run = launch {
                        animate(0f, 1f, animationSpec = tween(SCENE_HOLD_MS, easing = LinearEasing)) { v, _ -> hold.progress = v }
                        tick?.performHapticFeedback(HapticFeedbackType.LongPress)
                        current.onErase()
                    }
                    try {
                        waitForUpOrCancellation()
                    } finally {
                        run.cancel()
                        hold.progress = 0f
                    }
                }
            }
        }
        .semantics {
            role = Role.Button
            contentDescription = MirrorText.eraseSceneName(delete)
            stateDescription = MirrorText.HOLD_NOTE
            onLongClick(label = MirrorText.eraseSceneName(delete)) {
                current.onErase()
                true
            }
        }
    SceneKey(if (delete) MirrorText.DEL else MirrorText.CLR, tight, gesture, fill = { hold.progress })
}

/** A small word on the panel's rows (CHANGE, CLIP), dim, not read. */
@Composable
private fun SceneWord(word: String, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    Text(word.uppercase(), style = viewWordStyle(9.dp, 0.1f), color = c.displayDim, maxLines = 1, softWrap = false, modifier = modifier.clearAndSetSemantics { })
}

/**
 * A key on the panel's rows: [word], upper-cased, in a thin dim border; the
 * border signal orange where [lit], the key filled signal orange where
 * [filled] or, from the left, as far as [fill] says (read as it draws). As
 * tall as the row to touch, however small it looks.
 */
@Composable
private fun SceneKey(word: String, tight: Boolean, modifier: Modifier, lit: Boolean = false, filled: Boolean = false, fill: () -> Float = { 0f }) {
    val c = LocalArcColors.current
    val shape = RoundedCornerShape(7.dp)
    // The word reads on the fill once it has covered the word's start; read as states, so a frame of the hold doesn't compose it again.
    val started by remember(fill) { derivedStateOf { fill() > 0f } }
    val covered by remember(fill) { derivedStateOf { fill() > 0.2f } }
    val on = filled || covered
    Box(modifier.heightIn(min = SceneKeyRow), contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .clip(shape)
                .then(if (filled) Modifier.background(c.signal) else Modifier)
                .drawBehind {
                    val f = fill()
                    if (f > 0f) drawRect(c.signal, size = Size(size.width * f, size.height))
                }
                .border(1.dp, if (filled || lit || started) c.signal else c.displayDim.copy(alpha = 0.6f), shape)
                .padding(horizontal = if (tight) 6.dp else 9.dp, vertical = 6.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                word.uppercase(),
                style = viewWordStyle(if (tight) 10.dp else 11.dp, 0.07f),
                color = if (on) c.onSignal else c.displayInk,
                maxLines = 1,
                softWrap = false,
                modifier = Modifier.clearAndSetSemantics { },
            )
        }
    }
}

/** PTN, BAR and PAD: what COPY and PASTE take, the one picked in signal orange. */
@Composable
private fun ClipModes(scene: LiveScene, tight: Boolean) {
    val c = LocalArcColors.current
    val ui = scene.ui
    val face = lerp(c.display, c.displayDim, SceneKeyShade)
    Row(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        for (mode in ClipMode.entries) {
            val on = ui.clipMode == mode
            val (word, name) = when (mode) {
                ClipMode.PTN -> MirrorText.PTN to MirrorText.CLIP_PTN_NAME
                ClipMode.BAR -> MirrorText.BAR to MirrorText.CLIP_BAR_NAME
                ClipMode.PAD -> MirrorText.CLIP_PAD to MirrorText.CLIP_PAD_NAME
            }
            Box(
                Modifier
                    .heightIn(min = SceneKeyRow)
                    .selectable(selected = on, role = Role.Tab, interactionSource = remember { MutableInteractionSource() }, indication = null) { scene.onClipMode(mode) }
                    .semantics { contentDescription = name },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    word.uppercase(),
                    style = viewWordStyle(if (tight) 10.dp else 11.dp, 0.07f),
                    color = if (on) c.onSignal else c.displayInk,
                    maxLines = 1,
                    softWrap = false,
                    modifier = Modifier
                        .clip(RoundedCornerShape(7.dp))
                        .background(if (on) c.signal else face)
                        .padding(horizontal = if (tight) 6.dp else 9.dp, vertical = 6.dp)
                        .clearAndSetSemantics { },
                )
            }
        }
    }
}

/**
 * The 1–99 grid, over the pads (the room it is given) for the group that
 * opened it: ten to a row, a pattern with notes filled, the one playing in
 * signal orange, the next free one outlined; a tap picks it (it waits for its
 * bar or pattern end while the pattern plays) and the grid closes. ✕ closes it
 * without. A screen reader hears each cell as "Pattern 5, has notes".
 */
@Composable
internal fun PatternGrid(scene: LiveScene, modifier: Modifier = Modifier) {
    val c = LocalArcColors.current
    val ui = scene.ui
    val group = ui.gridGroup ?: return
    val col = ui.groups[group]
    val shape = RoundedCornerShape(16.dp)
    val empty = lerp(c.key, c.ink, 0.1f)
    Column(
        modifier
            .clip(shape)
            .background(c.key)
            .border(1.dp, c.keyEdge, shape)
            .padding(horizontal = 10.dp, vertical = 8.dp)
            // A touch on the grid's face is the grid's, not the pads' under it.
            .pointerInput(Unit) { detectTapGestures { } }
            .semantics { paneTitle = MirrorText.GRID_NAME },
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Row(Modifier.fillMaxWidth().heightIn(min = 32.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(MirrorText.gridTitle(group).uppercase(), style = ArcType.capsKey.copy(letterSpacing = 0.12.em), color = c.navy, maxLines = 1)
            Text(
                MirrorText.gridDetail(col.number, col.bars).uppercase(),
                style = viewWordStyle(10.dp, 0.07f),
                color = c.graphite,
                maxLines = 1,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f),
            )
            Box(
                Modifier
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button) { scene.onGrid(null) }
                    .semantics { contentDescription = MirrorText.CLOSE_GRID }
                    .size(32.dp, 32.dp),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Canvas(Modifier.size(10.dp)) {
                    val w = 1.8.dp.toPx()
                    drawLine(c.graphite, Offset(0f, 0f), Offset(size.width, size.height), strokeWidth = w)
                    drawLine(c.graphite, Offset(size.width, 0f), Offset(0f, size.height), strokeWidth = w)
                }
            }
        }
        for (row in 0 until GRID_ROWS) {
            Row(Modifier.fillMaxWidth().weight(1f), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                for (i in 0 until GRID_COLUMNS) {
                    val n = row * GRID_COLUMNS + i + 1
                    if (n > Seq.MAX_PATTERNS) {
                        Spacer(Modifier.weight(1f))
                        continue
                    }
                    val notes = n in col.filled
                    val playing = n == col.number
                    val free = n == col.nextFree && !playing
                    val cellShape = RoundedCornerShape(5.dp)
                    Box(
                        Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .clip(cellShape)
                            .background(if (playing) c.signal else if (notes) c.display else if (free) c.key else empty)
                            .then(if (free) Modifier.border(1.5.dp, c.ink, cellShape) else Modifier)
                            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button) { scene.onPatternPick(group, n) }
                            .semantics {
                                contentDescription = MirrorText.patternCell(n, notes)
                                selected = playing
                                if (free) stateDescription = MirrorText.NEXT_FREE
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            MirrorText.patternNumber(n),
                            style = ArcType.tiny.copy(fontSize = 11.sp, lineHeight = 1.em, fontWeight = if (playing || free) FontWeight.Bold else FontWeight.Medium, fontFeatureSettings = "tnum"),
                            color = if (playing) c.onSignal else if (notes) c.displayInk else if (free) c.ink else c.graphite,
                            maxLines = 1,
                            softWrap = false,
                            modifier = Modifier.clearAndSetSemantics { },
                        )
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            GridLegend(c.display, null, MirrorText.GRID_HAS_NOTES)
            GridLegend(empty, null, MirrorText.GRID_EMPTY)
            GridLegend(c.signal, null, MirrorText.GRID_PLAYING)
            GridLegend(c.key, c.ink, MirrorText.NEXT_FREE)
        }
    }
}

/** The grid's rows and columns: 1..99, ten to a row. */
private const val GRID_COLUMNS = 10
private const val GRID_ROWS = 10

/** One entry of the grid's legend: a swatch (with an outline, [edge]) and its [word]. */
@Composable
private fun GridLegend(swatch: Color, edge: Color?, word: String) {
    val c = LocalArcColors.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.clearAndSetSemantics { }) {
        Box(Modifier.size(10.dp).clip(RoundedCornerShape(2.dp)).background(swatch).then(if (edge != null) Modifier.border(1.2.dp, edge, RoundedCornerShape(2.dp)) else Modifier))
        Text(word.uppercase(), style = viewWordStyle(8.dp, 0.06f), color = c.graphite, maxLines = 1, softWrap = false)
    }
}

/** A deck narrower than this (a small phone's) is set tight. */
private val SceneTight = 300.dp

/** The panel's rows: the groups' columns, a row of keys, and the bar pages' row; the room between rows. */
private val SceneColumnsRow = 98.dp
private val SceneKeyRow = 36.dp
private val SceneBarRow = 32.dp
private val SceneGap = 6.dp

/** A column's number row, its − and +, and NEXT FREE. */
private val SceneNumberRow = 26.dp
private val SceneColumnKey = 30.dp
private val SceneFreeKey = 22.dp

/** How far a column's − and + and the CLIP row's keys are from the display's dark toward its dim ink: lighter than the column under them. */
private const val SceneKeyShade = 0.36f
