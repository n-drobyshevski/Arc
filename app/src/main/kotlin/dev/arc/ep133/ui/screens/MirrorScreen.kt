package dev.arc.ep133.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.heightIn
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.stateDescription
import dev.arc.ep133.ui.components.Segmented
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
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
import dev.arc.ep133.ui.components.Caption
import dev.arc.ep133.ui.components.GridPlate
import dev.arc.ep133.ui.components.PlateLine
import dev.arc.ep133.ui.components.CloseKey
import dev.arc.ep133.ui.components.DisplayPanel
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/*
 * Pads are drawn as the pocket operator app draws its pad grid: one pale
 * plate split by thin lines. A lit pad turns the signal orange, brighter with
 * velocity, and fades on release.
 */
private val KeyBlack = Color(0xFF1E1F21)
private val KeyWhite = Color(0xFFF3F2EE)
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
    /** Null on the Live tab, which has no close key. */
    onBack: (() -> Unit)? = null,
    /** A fixed time for screenshots; normally the screen's frame clock drives the fade. */
    fixedNow: Long? = null,
    /** One group at a time, large, with A–D keys to switch (like the pocket operator app's grid). */
    oneGroup: Boolean = false,
    onOneGroup: (Boolean) -> Unit = {},
    /** In that view, switch to the group of the pad just played. */
    follow: Boolean = true,
    onFollow: (Boolean) -> Unit = {},
    initialGroup: Int = 0,
) {
    val c = LocalArcColors.current
    if (onBack != null) BackHandler(onBack = onBack)
    val st = mirror?.state ?: MirrorState()
    // The fade runs on the frame clock while a released pad is fading, and stops after.
    val fading = fixedNow == null && st.pads.values.any { it.offAt != null }
    var frame by remember { mutableLongStateOf(System.nanoTime()) }
    LaunchedEffect(fading) {
        while (fading) withFrameNanos { frame = System.nanoTime() }
    }
    val now = fixedNow ?: if (fading) frame else System.nanoTime()
    val viewSwitch = @Composable {
        Segmented(
            listOf(MirrorText.ALL_GROUPS, MirrorText.ONE_GROUP),
            selected = if (oneGroup) 1 else 0,
            onSelect = { onOneGroup(it == 1) },
        )
    }
    Box(Modifier.fillMaxSize().background(c.shell), contentAlignment = Alignment.TopCenter) {
        if (oneGroup) {
            // One group fills the screen without scrolling: the display, the switch, the
            // grid (its rows share whatever height is left) and the group keys.
            var group by rememberSaveable { mutableIntStateOf(initialGroup) }
            // Follow: show the group of the pad just played.
            val hitGroup = st.lastHit?.pad?.group
            LaunchedEffect(hitGroup, st.lastHit, follow) {
                if (follow && hitGroup != null) group = hitGroup
            }
            Column(
                Modifier
                    // Not much wider than a phone, so a tablet's pads don't turn into long bars.
                    .widthIn(max = 520.dp)
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (onBack != null) {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        Caption(MirrorText.TITLE)
                        CloseKey(onBack, dev.arc.ep133.text.GuideText.CLOSE, Modifier.align(Alignment.CenterEnd))
                    }
                }
                Display(st, mirror, compact = true)
                viewSwitch()
                Group(group, st, nameOf, now, Modifier.fillMaxWidth().weight(1f), big = true)
                GroupKeys(group, st, now, onSelect = { group = it }, follow = follow, onFollow = onFollow)
            }
            return@Box
        }
        Column(
            Modifier
                .widthIn(max = 720.dp)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Caption(MirrorText.TITLE)
                if (onBack != null) CloseKey(onBack, dev.arc.ep133.text.GuideText.CLOSE, Modifier.align(Alignment.CenterEnd))
            }
            Display(st, mirror)
            viewSwitch()
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                // Four groups in a row when there is room, two by two on a phone.
                val perRow = if (maxWidth >= 640.dp) 4 else 2
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    for (row in (0..3).chunked(perRow)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
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
private fun Display(st: MirrorState, mirror: MirrorUi?, compact: Boolean = false) {
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
            style = ArcType.statFree.copy(fontSize = if (compact) 22.sp else 26.sp),
            color = c.displayInk,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        // The one-group view keeps to one screen; the all-groups view explains clock out.
        if (!compact && st.playing == null && st.bpm == null) Text(MirrorText.NO_TRANSPORT, style = ArcType.displayHint, color = c.displayDim)
    }
}

@Composable
private fun Group(group: Int, st: MirrorState, nameOf: (PhysicalPad) -> String?, now: Long, modifier: Modifier, big: Boolean = false) {
    val c = LocalArcColors.current
    val lit = st.pads.filterKeys { it.group == group }
    val groupGlow = lit.values.maxOfOrNull { glow(it, now) } ?: 0f
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        // The caption turns orange while one of the group's pads sounds (the big grid's
        // group shows on its key below instead).
        if (!big) Caption(MirrorText.GROUP + " " + ('A' + group), color = lerp(c.graphite, c.signal, groupGlow))
        GridPlate(if (big) Modifier.weight(1f) else Modifier) {
            PadNotes.ROWS.forEachIndexed { r, rowOffsets ->
                if (r > 0) PlateLine()
                // The big grid's rows share the height left on screen; the small ones are square.
                Row(if (big) Modifier.weight(1f) else Modifier.height(IntrinsicSize.Min)) {
                    rowOffsets.forEachIndexed { i, o ->
                        if (i > 0) Box(Modifier.width(1.dp).fillMaxHeight().background(c.line))
                        val pad = PhysicalPad(group, o)
                        Pad(pad, lit[pad], nameOf(pad), now, Modifier.weight(1f).then(if (big) Modifier.fillMaxHeight() else Modifier.aspectRatio(1f)), big)
                    }
                }
            }
        }
    }
}

/**
 * The group keys under the single grid: navy for the group shown, lit orange
 * while one of a group's pads sounds, and Follow (navy when on).
 */
@Composable
private fun GroupKeys(group: Int, st: MirrorState, now: Long, onSelect: (Int) -> Unit, follow: Boolean, onFollow: (Boolean) -> Unit) {
    val c = LocalArcColors.current
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (g in 0..3) {
            val on = g == group
            val sounding = st.pads.filterKeys { it.group == g }.values.maxOfOrNull { glow(it, now) } ?: 0f
            val face = if (on) c.navy else lerp(c.tabOff, c.signal, sounding)
            val ink = if (on) c.onNavy else if (sounding > 0.3f) c.onSignal else c.onTabOff
            Box(
                Modifier
                    .weight(1f)
                    .heightIn(min = 52.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(face)
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Tab) { onSelect(g) }
                    .semantics {
                        selected = on
                        contentDescription = MirrorText.GROUP + " " + MirrorText.groupKey(g)
                    },
                contentAlignment = Alignment.Center,
            ) {
                Text(MirrorText.groupKey(g), style = ArcType.tab.copy(fontSize = 22.sp), color = ink)
            }
        }
        Box(
            Modifier
                .weight(1.4f)
                .heightIn(min = 52.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(if (follow) c.navy else c.tabOff)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Switch) { onFollow(!follow) }
                .semantics {
                    // The note is spoken, since the screen has no room to show it.
                    contentDescription = MirrorText.FOLLOW + ". " + MirrorText.FOLLOW_NOTE
                    stateDescription = if (follow) dev.arc.ep133.text.SettingsText.ON else dev.arc.ep133.text.SettingsText.OFF
                },
            contentAlignment = Alignment.Center,
        ) {
            Text(MirrorText.FOLLOW.uppercase(), style = ArcType.capsKeySmall, color = if (follow) c.onNavy else c.onTabOff)
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
private fun Pad(pad: PhysicalPad, light: PadLight?, name: String?, now: Long, modifier: Modifier, big: Boolean = false) {
    val c = LocalArcColors.current
    val g = light?.let { glow(it, now) } ?: 0f
    val ink = if (g > 0.3f) c.onSignal else c.ink
    Box(
        modifier
            .background(lerp(c.plate, c.signal, g))
            .semantics { contentDescription = "${pad.groupLetter} ${pad.label}" + (name?.let { ", $it" } ?: "") }
            .padding(if (big) PaddingValues(10.dp) else PaddingValues(start = 6.dp, top = 5.dp, end = 7.dp, bottom = 5.dp)),
    ) {
        if (name != null) {
            Text(
                name,
                style = ArcType.tiny.copy(fontSize = if (big) 14.sp else 10.sp, lineHeight = 1.1.em),
                color = if (g > 0.3f) c.onSignal else c.graphite,
                maxLines = if (big) 3 else 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.align(Alignment.TopStart),
            )
        }
        // The key's own label in the corner, like the pocket operator app's pad numbers.
        Text(
            pad.label,
            style = ArcType.semi.copy(
                fontSize = when {
                    big -> if (pad.label.length > 1) 15.sp else 28.sp
                    else -> if (pad.label.length > 1) 10.sp else 15.sp
                },
                lineHeight = 1.em,
                letterSpacing = 0.04.em,
            ),
            color = ink,
            modifier = Modifier.align(Alignment.BottomEnd),
        )
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
                    if (on) c.signal else KeyWhite,
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
                    if (on) c.signal else KeyBlack,
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
        Caption(MirrorText.PAD_ORDER, Modifier.padding(top = 8.dp), align = androidx.compose.ui.text.style.TextAlign.Start)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            for ((order, label) in listOf(PadOrder.FROM_TOP to MirrorText.FROM_TOP, PadOrder.FROM_BOTTOM to MirrorText.FROM_BOTTOM)) {
                ArcKey(
                    label,
                    { onPadOrder(order) },
                    Modifier.weight(1f),
                    size = KeySize.Small,
                    style = if (st.padOrder == order) KeyStyle.Navy else KeyStyle.Normal,
                )
            }
        }
        Text(MirrorText.ORDER_NOTE, style = ArcType.small, color = c.graphite)
        Text(MirrorText.COMMUNITY_NOTE, style = ArcType.small, color = c.graphite)
        Text(MirrorText.LISTEN_ONLY, style = ArcType.small, color = c.graphite)
    }
}
