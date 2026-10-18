package dev.arc.ep133.ui.screens

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.data.TakeInfo
import dev.arc.ep133.features.RecState
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.Format
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.capEdge
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/**
 * The Takes page as the device's display (an addition): the takes numbered
 * on the glass, T01 the oldest, and under it one strip of keys. A tap on a
 * take lights it; PLAY, SHARE, SAVE, EP and DEL act on the lit one, and DEL
 * asks again on the glass. TAKE starts and stops a take, its time on the
 * glass while it records. Too narrow for six keys of [KeyMin], the strip is
 * two rows of three.
 */
@Composable
internal fun TakesDeck(t: TakesUi, take: TakeUi, still: Boolean) {
    val c = LocalArcColors.current
    var litName by rememberSaveable { mutableStateOf<String?>(null) }
    var confirm by rememberSaveable { mutableStateOf<String?>(null) }
    // The take lit by a tap while it is still there, else the one playing, else the newest.
    val lit = t.list.find { it.name == litName } ?: t.list.find { t.playing == t.keyOf(it) } ?: t.list.firstOrNull()
    val number = { info: TakeInfo -> t.list.size - t.list.indexOf(info) }
    val confirming = lit != null && confirm == lit.name
    TakesGlass(t, take, lit, number, confirming, still, onLight = {
        litName = it.name
        confirm = null
    }, onConfirm = {
        lit?.let(t.onDelete)
        confirm = null
        litName = null
    })
    if (t.list.isNotEmpty()) Text(MirrorText.TAKES_LIT_HINT, style = ArcType.tiny, color = c.graphite, modifier = Modifier.padding(horizontal = 4.dp))

    val recording = take.state as? RecState.Recording
    val playing = lit != null && t.playing == t.keyOf(lit)
    val n = lit?.let(number) ?: 0
    // Any key but DEL calls off a delete asked for.
    fun act(f: (TakeInfo) -> Unit) = { lit?.let { confirm = null; f(it) }; Unit }
    val keys = listOf<@Composable RowScope.() -> Unit>(
        {
            DeckKey(
                if (recording != null) DeckGlyph.STOP else DeckGlyph.DOT,
                recording?.let { MirrorText.takeLength(it.seconds.toDouble()) } ?: MirrorText.TAKE,
                MirrorText.takeDescription(take.state),
                { confirm = null; take.onTake() },
                style = if (take.state != RecState.Idle) DeckStyle.SIGNAL else DeckStyle.NORMAL,
                glyphColor = if (take.state == RecState.Idle) c.signal else null,
            )
        },
        {
            DeckKey(
                if (playing) DeckGlyph.STOP else DeckGlyph.PLAY,
                if (playing) FeatureText.STOP else FeatureText.PLAY,
                MirrorText.litTake(if (playing) FeatureText.STOP else FeatureText.PLAY, n),
                act { if (playing) t.onStop() else t.onPlay(it) },
                enabled = lit != null,
            )
        },
        { DeckKey(DeckGlyph.SHARE, MirrorText.TAKE_SHARE, MirrorText.litTake(FeatureText.SHARE_WAV, n), act(t.onShare), enabled = lit != null) },
        { DeckKey(DeckGlyph.SAVE, MirrorText.TAKE_SAVE, MirrorText.litTake(FeatureText.SAVE_WAV, n), act(t.onSave), enabled = lit != null) },
        { DeckKey(DeckGlyph.SEND, MirrorText.TAKE_SEND, MirrorText.litTake(MirrorText.TO_DEVICE, n), act(t.onToDevice), enabled = lit != null && t.connected) },
        {
            DeckKey(
                DeckGlyph.DELETE,
                MirrorText.TAKE_DEL,
                if (confirming) MirrorText.deleteTakeAgain(n) else MirrorText.litTake(Strings.DELETE, n),
                {
                    when {
                        lit == null -> Unit
                        confirming -> {
                            t.onDelete(lit)
                            confirm = null
                            litName = null
                        }
                        else -> confirm = lit.name
                    }
                },
                style = if (confirming) DeckStyle.NAVY else DeckStyle.NORMAL,
                enabled = lit != null,
            )
        },
    )
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val perRow = if (maxWidth >= KeyMin * keys.size + KeyGap * (keys.size - 1)) keys.size else keys.size / 2
        Column(verticalArrangement = Arrangement.spacedBy(KeyGap + 3.dp)) {
            for (row in keys.chunked(perRow)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(KeyGap)) { row.forEach { it() } }
            }
        }
    }
}

/** The narrowest a key of the strip gets; under it the strip takes two rows. */
private val KeyMin = 48.dp
private val KeyGap = 7.dp

/**
 * The glass: its head (how many takes and their size; while a take records,
 * REC with a blinking dot, its number and the time large; armed, that it waits
 * for the first sound), then a line per take, newest first. The lit take is
 * in signal orange, ▶ on the one playing; under the takes, a delete asked for.
 */
@Composable
private fun TakesGlass(
    t: TakesUi,
    take: TakeUi,
    lit: TakeInfo?,
    number: (TakeInfo) -> Int,
    confirming: Boolean,
    still: Boolean,
    onLight: (TakeInfo) -> Unit,
    onConfirm: () -> Unit,
) {
    val c = LocalArcColors.current
    val recording = take.state as? RecState.Recording
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(c.display)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Row(Modifier.fillMaxWidth().heightIn(min = 28.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (take.state == RecState.Idle) {
                Text(MirrorText.takesCount(t.list.size).uppercase(), style = GlassHead, color = c.displayDim, modifier = Modifier.weight(1f))
                if (t.list.isNotEmpty()) Text(Format.bytes(t.list.sumOf { it.bytes }), style = GlassHead, color = c.displayDim)
            } else {
                val blink = if (still || recording == null) {
                    null
                } else {
                    rememberInfiniteTransition(label = "takes rec").animateFloat(
                        1f,
                        0.15f,
                        infiniteRepeatable(tween(RECORD_BLINK_MS), RepeatMode.Reverse),
                        label = "takes rec",
                    )
                }
                Canvas(Modifier.size(9.dp)) { drawCircle(c.signal.copy(alpha = blink?.value ?: 1f)) }
                val head = if (recording != null) "${MirrorText.REC} ${MirrorText.takeNumber(t.list.size + 1)}" else MirrorText.TAKE
                Text(head.uppercase(), style = GlassHead, color = c.signal, modifier = Modifier.weight(1f))
                // The time is for the eye: the TAKE key says it for screen readers.
                if (recording != null) {
                    Text(
                        MirrorText.takeLength(recording.seconds.toDouble()),
                        style = ArcType.statNum.copy(fontSize = 26.sp),
                        color = c.signal,
                        modifier = Modifier.clearAndSetSemantics {},
                    )
                }
            }
        }
        if (take.state == RecState.Armed) Text(MirrorText.TAKE_ARMED, style = ArcType.displayHint, color = c.displayDim, modifier = Modifier.padding(top = 2.dp, bottom = 8.dp))
        if (t.list.isEmpty()) {
            GlassLine(c.displayInk)
            Text(MirrorText.NO_TAKES.uppercase(), style = GlassHead, color = c.displayDim, modifier = Modifier.padding(vertical = 14.dp))
        }
        for (info in t.list) {
            val on = info == lit
            val playing = t.playing == t.keyOf(info)
            val n = number(info)
            GlassLine(c.displayInk)
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .selectable(on, interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.RadioButton) { onLight(info) }
                    .semantics(mergeDescendants = true) { contentDescription = MirrorText.takeRow(n, info.seconds, t.fmtWhen(info.createdAt), playing) },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                val ink = if (on) c.signal else c.displayInk
                Text(MirrorText.takeNumber(n), style = GlassRow, color = ink, modifier = Modifier.width(38.dp))
                Text(MirrorText.takeLength(info.seconds), style = GlassRow, color = ink, maxLines = 1)
                Text(
                    t.fmtWhen(info.createdAt).replace(",", "").uppercase(),
                    style = GlassHead,
                    color = if (on) c.signal else c.displayDim,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Box(Modifier.size(14.dp)) { if (playing) Canvas(Modifier.size(14.dp)) { draw(DeckGlyph.PLAY, ink) } }
            }
        }
        if (confirming && lit != null) {
            Text(
                MirrorText.deleteTakeAgain(number(lit)).uppercase(),
                style = GlassHead,
                color = c.signal,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .padding(top = 8.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .border(1.dp, c.signal, RoundedCornerShape(8.dp))
                    .clickable(role = Role.Button, onClick = onConfirm)
                    .heightIn(min = 48.dp)
                    .padding(horizontal = 12.dp, vertical = 14.dp),
            )
        }
    }
}

@Composable
private fun GlassLine(ink: Color) = Box(Modifier.fillMaxWidth().height(1.dp).background(ink.copy(alpha = 0.08f)))

private val GlassHead = ArcType.displaySub.copy(fontSize = 13.sp, letterSpacing = 0.08.em)
private val GlassRow = ArcType.displayHead.copy(fontSize = 17.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold, letterSpacing = 0.06.em)

private enum class DeckStyle { NORMAL, SIGNAL, NAVY }

private enum class DeckGlyph { DOT, PLAY, STOP, SHARE, SAVE, SEND, DELETE }

/** A key of the strip: a cap with [glyph] over its [label], read as [description]. */
@Composable
private fun RowScope.DeckKey(
    glyph: DeckGlyph,
    label: String,
    description: String,
    onClick: () -> Unit,
    style: DeckStyle = DeckStyle.NORMAL,
    enabled: Boolean = true,
    glyphColor: Color? = null,
) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val (face, ink, edge) = when (style) {
        DeckStyle.NORMAL -> Triple(c.key, c.ink, c.keyEdge)
        DeckStyle.SIGNAL -> Triple(c.signal, c.onSignal, c.signalEdge)
        DeckStyle.NAVY -> Triple(c.navy, c.onNavy, capEdge(c.navy))
    }
    Column(
        Modifier
            .weight(1f)
            .padding(bottom = 3.dp)
            .heightIn(min = 56.dp)
            .cap(face, edge, RoundedCornerShape(8.dp), capPress(pressed && enabled), alpha = if (enabled) 1f else 0.45f)
            .clickable(source, indication = null, enabled = enabled, onClick = onClick)
            .semantics(mergeDescendants = true) {
                contentDescription = description
                role = Role.Button
            }
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
    ) {
        Canvas(Modifier.size(18.dp)) { draw(glyph, glyphColor ?: ink) }
        Text(label.uppercase(), style = ArcType.capsKeySmall.copy(fontSize = 11.sp), color = ink, maxLines = 1)
    }
}

private fun DrawScope.draw(glyph: DeckGlyph, color: Color) {
    val w = size.minDimension
    val s = w * 0.12f
    fun line(a: Offset, b: Offset) = drawLine(color, a, b, s, StrokeCap.Round)
    when (glyph) {
        DeckGlyph.DOT -> drawCircle(color, radius = w * 0.3f)
        DeckGlyph.PLAY -> drawPath(
            Path().apply {
                moveTo(w * 0.22f, w * 0.12f)
                lineTo(w * 0.88f, w * 0.5f)
                lineTo(w * 0.22f, w * 0.88f)
                close()
            },
            color,
        )
        DeckGlyph.STOP -> drawRect(color, Offset(w * 0.2f, w * 0.2f), Size(w * 0.6f, w * 0.6f))
        DeckGlyph.SHARE -> {
            line(Offset(w * 0.22f, w * 0.78f), Offset(w * 0.78f, w * 0.22f))
            line(Offset(w * 0.38f, w * 0.22f), Offset(w * 0.78f, w * 0.22f))
            line(Offset(w * 0.78f, w * 0.22f), Offset(w * 0.78f, w * 0.62f))
        }
        DeckGlyph.SAVE -> {
            line(Offset(w * 0.5f, w * 0.1f), Offset(w * 0.5f, w * 0.66f))
            line(Offset(w * 0.26f, w * 0.44f), Offset(w * 0.5f, w * 0.68f))
            line(Offset(w * 0.74f, w * 0.44f), Offset(w * 0.5f, w * 0.68f))
            line(Offset(w * 0.18f, w * 0.9f), Offset(w * 0.82f, w * 0.9f))
        }
        DeckGlyph.SEND -> {
            line(Offset(w * 0.12f, w * 0.5f), Offset(w * 0.86f, w * 0.5f))
            line(Offset(w * 0.56f, w * 0.22f), Offset(w * 0.86f, w * 0.5f))
            line(Offset(w * 0.56f, w * 0.78f), Offset(w * 0.86f, w * 0.5f))
        }
        DeckGlyph.DELETE -> {
            line(Offset(w * 0.24f, w * 0.24f), Offset(w * 0.76f, w * 0.76f))
            line(Offset(w * 0.76f, w * 0.24f), Offset(w * 0.24f, w * 0.76f))
        }
    }
}
