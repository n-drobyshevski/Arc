package dev.arc.ep133.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.arc.ep133.features.FxSettings
import dev.arc.ep133.features.FxType
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.Tempo
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.GridPlate
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.Knob
import dev.arc.ep133.ui.components.PlateLine
import dev.arc.ep133.ui.components.Segmented
import dev.arc.ep133.ui.components.SwitchRow
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capEdge
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/**
 * The FX sheet's state and what its controls do (an addition, after the
 * EP-133's FX page): the project's [settings], the tempo Live plays at
 * ([bpm], which the delay's readout follows), and the pad played last
 * ([selected], with its sound from [nameOf]): its group's send is the one in
 * signal orange, and the sidechain's SOURCE takes it.
 */
class FxUi(
    val settings: FxSettings = FxSettings.DEFAULT,
    val bpm: Float = Tempo.DEFAULT.toFloat(),
    val selected: PhysicalPad? = null,
    val nameOf: (PhysicalPad) -> String? = { null },
    /** An effect's key: that effect, or none when it is on already (the controller decides). */
    val onType: (FxType) -> Unit = {},
    val onXY: (x: Float, y: Float) -> Unit = { _, _ -> },
    val onSend: (group: Int, v: Float) -> Unit = { _, _ -> },
    val onComp: (on: Boolean, x: Float, y: Float) -> Unit = { _, _, _ -> },
    val onSidechainOn: (Boolean) -> Unit = {},
    val onSidechainSource: (group: Int, pad: Int) -> Unit = { _, _ -> },
    val onSidechainDest: (group: Int) -> Unit = {},
    val onSidechainXY: (x: Float, y: Float) -> Unit = { _, _ -> },
    /** A light tick as a knob turns a step (Settings → Haptics). */
    val haptics: Boolean = true,
)

/** The FX sheet's two pages. */
enum class FxPage { EFFECT, OUTPUT }

/**
 * FX tapped (an addition): the master effect and what goes to it, after the
 * EP-133's FX page. EFFECT: the six effects (the one on tapped again turns
 * it off), an XY pad for its two knobs, and each group's send to it.
 * OUTPUT: the compressor after everything, and the sidechain (a pad's hits
 * duck the groups picked). Everything goes through [fx]; [onDone] closes it.
 */
@Composable
fun ColumnScope.FxSheetContent(fx: FxUi, onDone: () -> Unit, initialPage: FxPage = FxPage.EFFECT) {
    val c = LocalArcColors.current
    var page by rememberSaveable { mutableIntStateOf(initialPage.ordinal) }
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(MirrorText.FX_TITLE, style = ArcType.heading, color = c.ink, modifier = Modifier.weight(1f))
        Segmented(
            listOf(MirrorText.FX_EFFECT, MirrorText.FX_OUTPUT),
            selected = page,
            onSelect = { page = it },
            // Its own width at the end, the title keeping the rest (a compact row takes all it is given).
            modifier = Modifier.width(TabsWidth),
            compact = true,
        )
    }
    if (page == FxPage.EFFECT.ordinal) EffectPage(fx) else OutputPage(fx)
    Text(MirrorText.FX_NOTE, style = ArcType.small, color = c.graphite)
    ArcKey(Strings.DONE, onDone, Modifier.fillMaxWidth(), style = KeyStyle.Quiet)
}

/** The effects in the sheet's row: every one but none (the one on, tapped again). */
private val EFFECTS = FxType.entries.filter { it != FxType.NONE }

/** How far a screen reader's step moves X or Y. */
private const val XY_STEP = 0.05f

/** EFFECT and OUTPUT beside the title. */
private val TabsWidth = 200.dp

/** The XY pad's and the faders' height. */
private val PadHeight = 196.dp

@Composable
private fun EffectPage(fx: FxUi) {
    val s = fx.settings
    Segmented(
        EFFECTS.map(MirrorText::fxCode),
        selected = EFFECTS.indexOf(s.type),
        onSelect = { fx.onType(EFFECTS[it]) },
        descriptions = EFFECTS.map { MirrorText.fxChoice(it, it == s.type) },
    )
    Row(Modifier.fillMaxWidth().height(PadHeight), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        XyPad(s.type, s.x, s.y, fx.bpm, fx.onXY, Modifier.weight(1f).fillMaxHeight())
        Row(Modifier.fillMaxHeight(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (g in 0 until FxSettings.GROUPS) {
                SendFader(g, s.sends.getOrElse(g) { 0f }, g == fx.selected?.group, { fx.onSend(g, it) }, Modifier.fillMaxHeight())
            }
        }
    }
}

/**
 * The effect's X and Y as one pad on the display (an addition, after the
 * EP-133's two knobs): the dot is where they are, X across and Y up; a
 * finger puts it where it touches and drags it. The effect's name and what
 * the knobs do now read top left, what each axis is along its edge. With no
 * effect on it rests, dimmed. A screen reader hears the values and steps
 * either way by [XY_STEP].
 */
@Composable
private fun XyPad(type: FxType, x: Float, y: Float, bpm: Float, onXY: (Float, Float) -> Unit, modifier: Modifier) {
    val c = LocalArcColors.current
    val on = type != FxType.NONE
    val move by rememberUpdatedState(onXY)
    val xLabel = FxSettings.xLabel(type)
    val yLabel = FxSettings.yLabel(type)
    val word = viewWordStyle(10.dp)
    Box(
        modifier
            .clip(RoundedCornerShape(14.dp))
            .background(c.display)
            // The pad takes the finger from its first touch, so the sheet under it stays put.
            .pointerInput(on) {
                if (!on) return@pointerInput
                awaitEachGesture {
                    val down = awaitFirstDown()
                    down.consume()
                    fun at(p: Offset) = move((p.x / size.width).coerceIn(0f, 1f), (1f - p.y / size.height).coerceIn(0f, 1f))
                    at(down.position)
                    while (true) {
                        val e = awaitPointerEvent()
                        val ch = e.changes.firstOrNull { it.id == down.id } ?: break
                        if (!ch.pressed) {
                            ch.consume()
                            break
                        }
                        if (ch.positionChange() != Offset.Zero) at(ch.position)
                        ch.consume()
                    }
                }
            }
            .semantics {
                contentDescription = MirrorText.XY_PAD
                if (on) {
                    stateDescription = MirrorText.fxName(type) + ", " + MirrorText.xyState(type, x, y, bpm)
                    customActions = listOf(
                        CustomAccessibilityAction(MirrorText.xyStep(xLabel, true)) { move((x + XY_STEP).coerceAtMost(1f), y); true },
                        CustomAccessibilityAction(MirrorText.xyStep(xLabel, false)) { move((x - XY_STEP).coerceAtLeast(0f), y); true },
                        CustomAccessibilityAction(MirrorText.xyStep(yLabel, true)) { move(x, (y + XY_STEP).coerceAtMost(1f)); true },
                        CustomAccessibilityAction(MirrorText.xyStep(yLabel, false)) { move(x, (y - XY_STEP).coerceAtLeast(0f)); true },
                    )
                } else {
                    stateDescription = MirrorText.XY_OFF
                    disabled()
                }
            },
    ) {
        val grid = c.displayDim.copy(alpha = 0.35f)
        val dot = c.signal
        Canvas(Modifier.fillMaxSize()) {
            // The centre lines, then the dot (kept whole inside the pad) in its glow; off, a plain dark pad.
            if (on) {
                val line = 1.dp.toPx()
                drawLine(grid, Offset(size.width / 2f, 0f), Offset(size.width / 2f, size.height), line)
                drawLine(grid, Offset(0f, size.height / 2f), Offset(size.width, size.height / 2f), line)
                val r = 9.dp.toPx()
                val glow = 16.dp.toPx()
                val at = Offset(
                    (x * size.width).coerceIn(r, size.width - r),
                    ((1f - y) * size.height).coerceIn(r, size.height - r),
                )
                drawCircle(dot.copy(alpha = 0.3f), glow, at)
                drawCircle(dot, r, at)
            }
        }
        Column(
            Modifier.align(Alignment.TopStart).padding(10.dp).clearAndSetSemantics { },
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(MirrorText.fxName(type).uppercase(), style = word, color = if (on) c.displayInk else c.displayDim, maxLines = 1)
            if (on) Text(MirrorText.xyReadout(type, x, y, bpm), style = word, color = c.displayInk, maxLines = 1)
        }
        if (on) {
            Text("↑ $yLabel", style = word, color = c.displayDim, maxLines = 1, modifier = Modifier.align(Alignment.TopEnd).padding(10.dp).clearAndSetSemantics { })
            Text("$xLabel →", style = word, color = c.displayDim, maxLines = 1, modifier = Modifier.align(Alignment.BottomStart).padding(10.dp).clearAndSetSemantics { })
        } else {
            Text(
                MirrorText.XY_OFF,
                style = word,
                color = c.displayDim,
                textAlign = TextAlign.Center,
                modifier = Modifier.align(Alignment.Center).padding(16.dp).clearAndSetSemantics { },
            )
        }
    }
}

/**
 * A group's send to the effect: a fader filled from the bottom (in signal
 * orange for the pad played last's group, navy for the others), its letter
 * and its value (0 to 100) under it. A finger sets it where it touches and
 * drags it; a screen reader hears a slider.
 */
@Composable
private fun SendFader(group: Int, value: Float, selected: Boolean, onChange: (Float) -> Unit, modifier: Modifier) {
    val c = LocalArcColors.current
    val change by rememberUpdatedState(onChange)
    Column(
        modifier
            .width(28.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = MirrorText.sendName(group)
                stateDescription = MirrorText.sendValue(value)
                progressBarRangeInfo = ProgressBarRangeInfo(value, 0f..1f, steps = 19)
                setProgress { v ->
                    change(v.coerceIn(0f, 1f))
                    true
                }
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        val fill = if (selected) c.signal else c.navy
        Box(
            Modifier
                .weight(1f)
                .width(22.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(c.plate)
                .pointerInput(Unit) {
                    awaitEachGesture {
                        val down = awaitFirstDown()
                        down.consume()
                        fun at(p: Offset) = change((1f - p.y / size.height).coerceIn(0f, 1f))
                        at(down.position)
                        while (true) {
                            val e = awaitPointerEvent()
                            val ch = e.changes.firstOrNull { it.id == down.id } ?: break
                            if (!ch.pressed) {
                                ch.consume()
                                break
                            }
                            if (ch.positionChange() != Offset.Zero) at(ch.position)
                            ch.consume()
                        }
                    }
                },
        ) {
            Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().fillMaxHeight(value.coerceIn(0f, 1f)).background(fill))
        }
        Text(MirrorText.groupKey(group), style = ArcType.capsKeySmall, color = if (selected) c.signal else c.ink, maxLines = 1)
        Text(MirrorText.sendValue(value), style = ArcType.tiny.copy(fontFeatureSettings = "tnum"), color = c.graphite, maxLines = 1)
    }
}

@Composable
private fun OutputPage(fx: FxUi) {
    val c = LocalArcColors.current
    val s = fx.settings
    val comp = s.comp
    val sc = s.sidechain
    GridPlate {
        SwitchRow(MirrorText.OUTPUT_COMP, MirrorText.OUTPUT_COMP_NOTE, comp.on, { fx.onComp(it, comp.x, comp.y) })
        PlateLine()
        KnobPair {
            FxKnob(MirrorText.DRIVE, comp.x, FxSettings.xReadout(FxType.COMPRESSOR, comp.x), FxSettings.DEFAULT.comp.x, fx.haptics) { fx.onComp(comp.on, it, comp.y) }
            FxKnob(MirrorText.SPEED, comp.y, FxSettings.yReadout(FxType.COMPRESSOR, comp.y), FxSettings.DEFAULT.comp.y, fx.haptics) { fx.onComp(comp.on, comp.x, it) }
        }
    }
    GridPlate {
        SwitchRow(MirrorText.SIDECHAIN, MirrorText.SIDECHAIN_NOTE, sc.on, fx.onSidechainOn)
        PlateLine()
        // SOURCE: the pad whose hits duck, and a key that makes it the pad played last.
        val source = PhysicalPad(sc.group, sc.pad)
        val name = fx.nameOf(source)
        val picked = fx.selected
        Row(
            Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(
                Modifier.weight(1f).semantics(mergeDescendants = true) { contentDescription = MirrorText.sidechainSourceDescription(source, name) },
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(MirrorText.SC_SOURCE, style = ArcType.semi, color = c.ink)
                Text(MirrorText.sidechainSource(source, name), style = ArcType.small, color = c.graphite, maxLines = 1)
            }
            ArcKey(
                if (picked != null) MirrorText.setSource(picked) else MirrorText.PLAY_FOR_SOURCE,
                { picked?.let { fx.onSidechainSource(it.group, it.offset) } },
                size = KeySize.Small,
                enabled = picked != null && picked != source,
            )
        }
        PlateLine()
        // DUCKS: the groups each hit ducks.
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(MirrorText.DUCKS, style = ArcType.semi, color = c.ink, modifier = Modifier.padding(end = 4.dp))
            for (g in 0 until FxSettings.GROUPS) {
                DuckChip(g, sc.dests and (1 shl g) != 0, Modifier.weight(1f)) { fx.onSidechainDest(g) }
            }
        }
        PlateLine()
        KnobPair {
            FxKnob(MirrorText.LENGTH, sc.x, MirrorText.sidechainLength(sc.x), FxSettings.DEFAULT.sidechain.x, fx.haptics) { fx.onSidechainXY(it, sc.y) }
            FxKnob(MirrorText.SHAPE, sc.y, MirrorText.sidechainShape(sc.y), FxSettings.DEFAULT.sidechain.y, fx.haptics) { fx.onSidechainXY(sc.x, it) }
        }
    }
}

/** Two knobs side by side in a plate's row. */
@Composable
private fun KnobPair(content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.Top,
        content = content,
    )
}

/** One of the sheet's knobs, 0..1 in hundredths, back to [default] on a double tap. */
@Composable
private fun androidx.compose.foundation.layout.RowScope.FxKnob(label: String, value: Float, readout: String, default: Float, haptics: Boolean, onChange: (Float) -> Unit) {
    Knob(
        label, value, 0f..1f, readout,
        onChange = onChange,
        modifier = Modifier.weight(1f),
        default = default,
        step = 0.01f,
        haptics = haptics,
        description = MirrorText.knobDescription(label, readout),
    )
}

/** A group's key under DUCKS: navy and down while the sidechain ducks it. */
@Composable
private fun DuckChip(group: Int, on: Boolean, modifier: Modifier, onToggle: () -> Unit) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val face = if (on) c.navy else c.key
    Box(
        modifier
            .heightIn(min = 36.dp)
            .cap(face, if (on) capEdge(c.navy) else c.keyEdge, RoundedCornerShape(8.dp), capPress(on || pressed))
            .toggleable(value = on, interactionSource = source, indication = null, role = Role.Checkbox) { onToggle() }
            .semantics { contentDescription = MirrorText.duckChoice(group) },
        contentAlignment = Alignment.Center,
    ) {
        Text(MirrorText.groupKey(group), style = ArcType.capsKeySmall, color = if (on) c.onNavy else c.graphite)
    }
}
