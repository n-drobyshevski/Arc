package dev.arc.ep133.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.controller.MirrorUi
import dev.arc.ep133.features.MirrorState
import dev.arc.ep133.features.PadLight
import dev.arc.ep133.features.PadNotes
import dev.arc.ep133.features.PadOrder
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.CloseKey
import dev.arc.ep133.ui.components.DisplayPanel
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/*
 * The device's own colours for the pads, as in the guide's key caps; a lit
 * pad turns the signal orange, brighter with velocity, and fades on release.
 */
private val PadFace = Color(0xFF4A4B4D)
private val PadEdge = Color(0xFF1E1F21)
private val PadInk = Color(0xFFEDECE8)
private val PadDim = Color(0xFFA9AAAC)
private val FADE_NS = 300_000_000L

/**
 * A live mirror of the EP-133 (an addition to the web version): the four
 * groups' pads light as the device plays them, with the sample on each once
 * it is known, plus play state, tempo and KEYS notes. It only listens.
 *
 * [nameOf] gives the sample on a pad (null while not known); [now] is the
 * System.nanoTime of this frame, for the fade.
 */
@Composable
fun MirrorScreen(
    mirror: MirrorUi?,
    nameOf: (PhysicalPad) -> String?,
    onPadOrder: (PadOrder) -> Unit,
    onBack: () -> Unit,
    /** A fixed time for screenshots; normally the screen's frame clock drives the fade. */
    fixedNow: Long? = null,
) {
    val c = LocalArcColors.current
    BackHandler(onBack = onBack)
    val st = mirror?.state ?: MirrorState()
    // The fade runs on the frame clock while a released pad is fading, and stops after.
    val fading = fixedNow == null && st.pads.values.any { it.offAt != null }
    var frame by remember { mutableLongStateOf(System.nanoTime()) }
    LaunchedEffect(fading) {
        while (fading) withFrameNanos { frame = System.nanoTime() }
    }
    val now = fixedNow ?: if (fading) frame else System.nanoTime()
    Box(Modifier.fillMaxSize().background(c.shell), contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier
                .widthIn(max = 720.dp)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(Modifier.fillMaxWidth()) {
                Text(
                    MirrorText.TITLE.uppercase(),
                    style = ArcType.heading.copy(fontWeight = FontWeight.Medium, letterSpacing = 0.08.em),
                    color = c.graphite,
                    modifier = Modifier.align(Alignment.Center),
                )
                CloseKey(onBack, dev.arc.ep133.text.GuideText.CLOSE, Modifier.align(Alignment.CenterEnd))
            }
            Display(st, mirror)
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                // Four groups in a row when there is room, two by two on a phone.
                val perRow = if (maxWidth >= 640.dp) 4 else 2
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    for (row in (0..3).chunked(perRow)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            for (g in row) Group(g, st, nameOf, now, Modifier.weight(1f))
                        }
                    }
                }
            }
            if (st.lastKeysNote != null) KeysStrip(st)
            Notes(st, mirror, onPadOrder)
        }
    }
}

@Composable
private fun Display(st: MirrorState, mirror: MirrorUi?) {
    val c = LocalArcColors.current
    DisplayPanel {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            val transport = when (st.playing) {
                true -> "\u25B6 " + MirrorText.PLAYING
                false -> "\u25A0 " + MirrorText.STOPPED
                null -> ""
            }
            Text(transport, style = ArcType.displayHead, color = c.displayInk, modifier = Modifier.weight(1f))
            st.bpm?.let { Text(MirrorText.bpm(it), style = ArcType.displaySub, color = c.displayInk) }
            st.activeProject?.let { Text(MirrorText.project(it), style = ArcType.displaySub, color = c.displayDim) }
        }
        val hit = st.lastHit
        Text(
            when {
                mirror?.error != null -> mirror.error
                mirror?.loading == true && hit == null -> MirrorText.READING
                hit != null -> MirrorText.hit(hit)
                else -> MirrorText.WAITING
            },
            style = ArcType.statFree.copy(fontSize = 26.sp),
            color = c.displayInk,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (st.playing == null && st.bpm == null) Text(MirrorText.NO_TRANSPORT, style = ArcType.displayHint, color = c.displayDim)
    }
}

@Composable
private fun Group(group: Int, st: MirrorState, nameOf: (PhysicalPad) -> String?, now: Long, modifier: Modifier) {
    val c = LocalArcColors.current
    val lit = st.pads.filterKeys { it.group == group }
    val groupGlow = lit.values.maxOfOrNull { glow(it, now) } ?: 0f
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // The group key, lit while one of its pads sounds.
            Box(
                Modifier
                    .size(34.dp, 26.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(lerp(PadFace, c.signal, groupGlow)),
                contentAlignment = Alignment.Center,
            ) {
                Text(('A' + group).toString(), style = ArcType.bold.copy(fontFamily = FontFamily.Monospace), color = PadInk)
            }
            Text(MirrorText.GROUP + " " + ('A' + group), style = ArcType.small, color = c.graphite)
        }
        for (rowOffsets in PadNotes.ROWS) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (o in rowOffsets) {
                    val pad = PhysicalPad(group, o)
                    Pad(pad, lit[pad], nameOf(pad), now, Modifier.weight(1f))
                }
            }
        }
    }
}

/** 0..1: how lit a pad is now. Velocity sets the brightness; release fades it out. */
private fun glow(l: PadLight, now: Long): Float {
    val strength = 0.45f + 0.55f * (l.velocity.coerceIn(1, 127) / 127f)
    val off = l.offAt ?: return strength
    val left = 1f - ((now - off).toFloat() / FADE_NS)
    return (strength * left).coerceIn(0f, 1f)
}

@Composable
private fun Pad(pad: PhysicalPad, light: PadLight?, name: String?, now: Long, modifier: Modifier) {
    val c = LocalArcColors.current
    val g = light?.let { glow(it, now) } ?: 0f
    val face = lerp(PadFace, c.signal, g)
    Box(
        modifier
            .aspectRatio(1f)
            .semantics { contentDescription = "${pad.groupLetter} ${pad.label}" + (name?.let { ", $it" } ?: "") }
            .drawBehind {
                val r = CornerRadius(7.dp.toPx())
                val edge = 3.dp.toPx()
                drawRoundRect(PadEdge, topLeft = Offset(1.dp.toPx(), edge), size = Size(size.width - 1.dp.toPx(), size.height - edge), cornerRadius = r)
                drawRoundRect(face, size = Size(size.width - 1.dp.toPx(), size.height - edge), cornerRadius = r)
            }
            .padding(start = 6.dp, top = 4.dp, end = 6.dp, bottom = 7.dp),
    ) {
        Text(
            pad.label,
            style = ArcType.tiny.copy(fontFamily = FontFamily.Monospace, fontSize = if (pad.label.length > 1) 9.sp else 12.sp),
            color = PadInk,
            modifier = Modifier.align(Alignment.TopStart),
        )
        if (name != null) {
            Text(
                name,
                style = ArcType.tiny.copy(fontSize = 10.sp, lineHeight = 1.1.em),
                color = if (g > 0.3f) c.onSignal else PadDim,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.align(Alignment.BottomStart),
            )
        }
    }
}

/** Two octaves around the last note outside the pads, with held notes lit. */
@Composable
private fun KeysStrip(st: MirrorState) {
    val c = LocalArcColors.current
    val last = st.lastKeysNote ?: return
    val start = ((last / 12) * 12 - 12).coerceIn(0, 103)
    val black = setOf(1, 3, 6, 8, 10)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            MirrorText.KEYS + " \u00B7 " + PadNotes.noteName(last) + (st.keysHeld[last]?.let { " \u00B7 " + MirrorText.channel(it) } ?: ""),
            style = ArcType.small,
            color = c.graphite,
        )
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(56.dp)
                .semantics { contentDescription = MirrorText.KEYS + " " + PadNotes.noteName(last) },
        ) {
            val whites = (start until start + 25).filter { it % 12 !in black }
            val w = size.width / whites.size
            whites.forEachIndexed { i, n ->
                val on = st.keysHeld.containsKey(n)
                drawRoundRect(
                    if (on) c.signal else Color(0xFFF3F2EE),
                    topLeft = Offset(i * w + 1, 0f),
                    size = Size(w - 2, size.height),
                    cornerRadius = CornerRadius(3.dp.toPx()),
                )
            }
            for (n in start until start + 25) {
                if (n % 12 !in black) continue
                val leftWhites = whites.count { it < n }
                val on = st.keysHeld.containsKey(n)
                drawRoundRect(
                    if (on) c.signal else PadEdge,
                    topLeft = Offset(leftWhites * w - w * 0.3f, 0f),
                    size = Size(w * 0.6f, size.height * 0.6f),
                    cornerRadius = CornerRadius(2.dp.toPx()),
                )
            }
        }
    }
}

@Composable
private fun Notes(st: MirrorState, mirror: MirrorUi?, onPadOrder: (PadOrder) -> Unit) {
    val c = LocalArcColors.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (st.padOrder == PadOrder.FROM_TOP) {
            Text(MirrorText.LEARN_NOTE, style = ArcType.small, color = c.graphite)
            if (!st.pushesSeen && st.learned.isEmpty() && st.lastHit?.pad != null && mirror?.loading == false) {
                Text(MirrorText.NO_PUSHES, style = ArcType.small, color = c.graphite)
            }
        }
        Text(MirrorText.PAD_ORDER, style = ArcType.fieldLabel, color = c.ink, modifier = Modifier.padding(top = 4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            for ((order, label) in listOf(PadOrder.FROM_TOP to MirrorText.FROM_TOP, PadOrder.FROM_BOTTOM to MirrorText.FROM_BOTTOM)) {
                ArcKey(
                    label,
                    { onPadOrder(order) },
                    Modifier.weight(1f),
                    size = KeySize.Small,
                    style = if (st.padOrder == order) KeyStyle.Signal else KeyStyle.Normal,
                )
            }
        }
        Text(MirrorText.ORDER_NOTE, style = ArcType.small, color = c.graphite)
        Text(MirrorText.COMMUNITY_NOTE, style = ArcType.small, color = c.graphite)
        Text(MirrorText.LISTEN_ONLY, style = ArcType.small, color = c.graphite)
    }
}
