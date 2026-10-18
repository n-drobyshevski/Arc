package dev.arc.ep133.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.arc.ep133.controller.MirrorUi
import dev.arc.ep133.features.FactoryKit
import dev.arc.ep133.features.FactorySounds
import dev.arc.ep133.features.MirrorState
import dev.arc.ep133.features.NoteNames
import dev.arc.ep133.features.PadOrder
import dev.arc.ep133.features.RecState
import dev.arc.ep133.text.ClaudeText
import dev.arc.ep133.text.CoachText
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcIcon
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.Caption
import dev.arc.ep133.ui.components.Chevron
import dev.arc.ep133.ui.components.Disclosure
import dev.arc.ep133.ui.components.CaptionInfo
import dev.arc.ep133.ui.components.GridPlate
import dev.arc.ep133.ui.components.Icon
import dev.arc.ep133.ui.components.InfoButton
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.OneLine
import dev.arc.ep133.ui.components.PlateLine
import dev.arc.ep133.ui.components.Segmented
import dev.arc.ep133.ui.components.SettingRow
import dev.arc.ep133.ui.components.SwitchRow
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.coachMark
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import androidx.compose.ui.text.style.TextAlign

/**
 * Live tools as a front page and four pages (an addition to the web version).
 * The front page is what is going on: a dark display of the state now (a take
 * recording, a beat card awaited from Claude, or else what the EP-133 played last),
 * then a plate of rows, each opening a page. A row says what its page holds in
 * one live line, so most visits end on the front page.
 */

/** The pages the front page's rows open (null is the front page). */
enum class ToolsPage { PLAY, CLAUDE, TAKES, HELP }

/** The page's name, on its row and on the back control. */
private fun pageName(page: ToolsPage) = when (page) {
    ToolsPage.PLAY -> MirrorText.PLAY
    ToolsPage.CLAUDE -> ClaudeText.CLAUDE
    ToolsPage.TAKES -> MirrorText.TAKES
    ToolsPage.HELP -> MirrorText.HELP
}

/** How long Live tools take to slide out; the page goes back to the front once they have. */
internal const val TOOLS_CLOSE_MS = 400L

/**
 * What the pages show and do. [group] is the group shown (the KEYS sound's in
 * KEYS), which the Claude page's SHARE names; [tapToPlay] and [sideways] pick
 * the notes on the Help page.
 */
internal class ToolsUi(
    val mirror: MirrorUi?,
    val keys: KeysUi,
    val keysActions: KeysActions,
    val piano: Boolean,
    val oneGroup: Boolean,
    val onOneGroup: (Boolean) -> Unit,
    val follow: Boolean,
    val onFollow: (Boolean) -> Unit,
    val arp: LiveArp?,
    val group: Int,
    val claude: ClaudeUi?,
    val take: TakeUi?,
    val takes: TakesUi,
    val onGetFactory: (() -> Unit)?,
    val offlinePads: Int,
    val onResetPads: () -> Unit,
    /** Two or more factory kits saved: the one Live plays, the saved ones the switch offers, and its pick. */
    val factoryKit: FactoryKit?,
    val factoryKits: List<FactoryKit>,
    val onFactoryKit: (FactoryKit) -> Unit,
    val tapToPlay: Boolean,
    val sideways: Boolean,
    /** No blinking, and the page changes at once. */
    val still: Boolean,
)

/**
 * The tools panel: the front page, or [page] with a slide. Back on a page
 * returns to the front (this handler is composed inside the panel, so it
 * comes before the panel's own Back, which closes it); each page starts at
 * the top of [scroll]. A page whose data goes away while it is open (Claude's
 * or the take's) goes back to the front too.
 */
@Composable
internal fun ColumnScope.LiveToolsPanel(ui: ToolsUi, page: ToolsPage?, onPage: (ToolsPage?) -> Unit, scroll: ScrollState) {
    BackHandler(enabled = page != null) { onPage(null) }
    LaunchedEffect(page) { scroll.scrollTo(0) }
    val gone = page == ToolsPage.CLAUDE && ui.claude == null || page == ToolsPage.TAKES && ui.take == null
    LaunchedEffect(gone) { if (gone) onPage(null) }
    AnimatedContent(
        targetState = page,
        transitionSpec = {
            if (ui.still) {
                EnterTransition.None togetherWith ExitTransition.None
            } else {
                // A page comes in from the end, the front page back from the start.
                val into = targetState != null
                (slideInHorizontally(tween(PAGE_MS)) { if (into) it / 6 else -it / 6 } + fadeIn(tween(PAGE_MS))) togetherWith
                    (slideOutHorizontally(tween(PAGE_MS)) { if (into) -it / 6 else it / 6 } + fadeOut(tween(PAGE_MS / 2)))
            }
        },
        label = "toolsPage",
    ) { p ->
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            when (p) {
                null -> FrontPage(ui, onPage)
                ToolsPage.PLAY -> PlayPage(ui)
                ToolsPage.CLAUDE -> ui.claude?.let { ClaudePage(it, ui.group) }
                ToolsPage.TAKES -> ui.take?.let { TakesPage(ui.takes, it) }
                ToolsPage.HELP -> HelpPage(ui)
            }
        }
    }
}

private const val PAGE_MS = 220

/** On a page, the back control in the head's place: a chevron and the page's name, all of it a tap. */
@Composable
internal fun RowScope.ToolsBack(page: ToolsPage, onBack: () -> Unit) {
    val c = LocalArcColors.current
    Row(
        Modifier
            .weight(1f)
            .heightIn(min = 48.dp)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = onBack)
            .semantics { contentDescription = MirrorText.BACK_TO_TOOLS },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Chevron(Modifier.rotate(180f), color = c.ink)
        Text(pageName(page), style = ArcType.bold.copy(fontSize = 18.sp), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Settings, a key by the close key (the tools close, then Settings opens); on the front page only. */
@Composable
internal fun SettingsKey(onClick: () -> Unit) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Box(
        Modifier
            .padding(end = 8.dp)
            .size(46.dp, 49.dp)
            .coachMark("tools.settings", CoachText.SETTINGS, c.graphite, c.shell)
            .clickable(interactionSource = source, indication = null, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = CoachText.SETTINGS }
            .drawBehind {
                val r = CornerRadius(8.dp.toPx())
                val drop = if (pressed) 3.dp.toPx() else 0f
                val face = Size(size.width, size.height - 3.dp.toPx())
                if (!pressed) drawRoundRect(c.keyEdge, topLeft = Offset(0f, 3.dp.toPx()), size = face, cornerRadius = r)
                drawRoundRect(c.key, topLeft = Offset(0f, drop), size = face, cornerRadius = r)
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.padding(bottom = 3.dp).graphicsLayer { translationY = if (pressed) 3.dp.toPx() else 0f }) {
            Icon(ArcIcon.GEAR, c.ink, size = 22.dp)
        }
    }
}

// ---------- The front page ----------

@Composable
private fun FrontPage(ui: ToolsUi, onPage: (ToolsPage) -> Unit) {
    val c = LocalArcColors.current
    val st = ui.mirror?.state ?: MirrorState()
    FactoryNotice(ui.mirror, ui.onGetFactory)
    FactoryKitRow(ui.mirror, ui.factoryKit, ui.factoryKits, ui.onFactoryKit)
    OfflinePadsNotice(ui.offlinePads, ui.onResetPads)
    NowDisplay(ui, st)
    // On its side the display is one line (in the top bar), so what clock out is for is told here.
    if (ui.sideways && !ui.keys.on && ui.mirror?.offline == null && st.playing == null && st.bpm == null) {
        Text(MirrorText.NO_TRANSPORT, style = ArcType.small, color = c.graphite)
    }
    GridPlate {
        val rows = buildList<@Composable () -> Unit> {
            add {
                ToolsRow(
                    { PadsGlyph(c.ink) },
                    pageName(ToolsPage.PLAY),
                    playSummary(ui),
                    onClick = { onPage(ToolsPage.PLAY) },
                )
            }
            ui.claude?.let { claude ->
                add {
                    ToolsRow(
                        { SparkGlyph(c.ink) },
                        pageName(ToolsPage.CLAUDE),
                        if (claude.waiting != null) ClaudeText.ROW_WAITING else ClaudeText.ROW_IDLE,
                        Modifier.coachMark("live.claude", CoachText.CLAUDE, c.navy, c.onNavy),
                        onClick = { onPage(ToolsPage.CLAUDE) },
                    )
                }
            }
            ui.take?.let { take ->
                add {
                    ToolsRow(
                        { Icon(ArcIcon.DOT, c.signal, size = 18.dp) },
                        pageName(ToolsPage.TAKES),
                        takesSummary(ui.takes, take),
                        onClick = { onPage(ToolsPage.TAKES) },
                    )
                }
            }
            add {
                ToolsRow(
                    { Icon(ArcIcon.HELP, c.ink, size = 18.dp) },
                    pageName(ToolsPage.HELP),
                    if (ui.keys.on) MirrorText.HOW_KEYS_WORKS else MirrorText.HOW_LIVE_READS,
                    onClick = { onPage(ToolsPage.HELP) },
                )
            }
        }
        rows.forEachIndexed { i, row ->
            if (i > 0) PlateLine()
            row()
        }
    }
}

/** The Play row's line: the view and its switches in PADS, the key and scale in KEYS. */
private fun playSummary(ui: ToolsUi): String = when {
    ui.keys.on -> MirrorText.playKeys(ui.keys.root, ui.keys.scale, ui.keys.names)
    ui.oneGroup -> MirrorText.playOneGroup(ui.follow)
    else -> MirrorText.playAllGroups(ui.arp?.ui?.on)
}

/** The Takes row's line: the time while a take records (or that it waits for the first sound), else how many there are and when the last was made. */
private fun takesSummary(t: TakesUi, take: TakeUi): String {
    val recording = take.state as? RecState.Recording
    return when {
        recording != null -> MirrorText.takesRecording(recording.seconds.toDouble())
        take.state == RecState.Armed -> MirrorText.TAKE_ARMED
        t.list.isEmpty() -> MirrorText.NO_TAKES
        else -> MirrorText.takesSummary(t.list.size, t.fmtWhen(t.list.maxOf { it.createdAt }))
    }
}

/**
 * One row of the front page's plate: a small key with its icon, the page's
 * name over a live line about it, and a chevron. The whole row opens the page,
 * read as "Name, line".
 */
@Composable
private fun ToolsRow(icon: @Composable () -> Unit, name: String, summary: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val c = LocalArcColors.current
    Row(
        modifier
            .fillMaxWidth()
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = MirrorText.toolsRow(name, summary) }
            .heightIn(min = 60.dp)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier
                .padding(bottom = 2.dp)
                .size(34.dp)
                .cap(c.key, c.keyEdge, RoundedCornerShape(10.dp), 0f, dx = 0.dp, dy = 2.dp),
            contentAlignment = Alignment.Center,
        ) { icon() }
        Column(Modifier.weight(1f)) {
            Text(name, style = ArcType.bold, color = c.ink, maxLines = 1)
            Text(summary, style = ArcType.tiny, color = c.graphite, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Chevron(Modifier.padding(horizontal = 4.dp))
    }
}

/** A grid of pads, drawn: the Play row's icon. */
@Composable
private fun PadsGlyph(color: Color) {
    Canvas(Modifier.size(18.dp)) {
        val gap = 2.dp.toPx()
        val cell = (size.width - 2 * gap) / 3
        for (row in 0..2) for (col in 0..2) {
            drawRoundRect(color, Offset(col * (cell + gap), row * (cell + gap)), Size(cell, cell), CornerRadius(1.5.dp.toPx()))
        }
    }
}

/** A four-point spark: the Claude row's icon. */
@Composable
private fun SparkGlyph(color: Color) {
    Canvas(Modifier.size(18.dp)) {
        val m = size.width / 2
        val pinch = size.width * 0.14f
        val spark = Path().apply {
            moveTo(m, 0f)
            quadraticTo(m + pinch, m - pinch, size.width, m)
            quadraticTo(m + pinch, m + pinch, m, size.height)
            quadraticTo(m - pinch, m + pinch, 0f, m)
            quadraticTo(m - pinch, m - pinch, m, 0f)
            close()
        }
        drawPath(spark, color)
    }
}

// ---------- Notices ----------

/** Not connected (nothing read, or offline from the last read): the factory sounds to get. */
@Composable
private fun FactoryNotice(mirror: MirrorUi?, onGetFactory: (() -> Unit)?) {
    if (onGetFactory == null || mirror?.error != MirrorText.NOT_CONNECTED && mirror?.offline == null) return
    Notice(FeatureText.FACTORY_SOUNDS, FeatureText.FACTORY_NOTE, FeatureText.GET, onGetFactory)
}

/** Showing factory sounds with two or more kits saved: the switch among them, as on the display's factory line. */
@Composable
private fun FactoryKitRow(mirror: MirrorUi?, kit: FactoryKit?, kits: List<FactoryKit>, onKit: (FactoryKit) -> Unit) {
    if (kit == null || mirror?.offline != MirrorText.FACTORY) return
    GridPlate {
        SettingRow(FeatureText.FACTORY_KIT) { KitSwitch(kit, kits, onKit) }
    }
}

/** Pads changed offline, in arc only: how many, and the key that puts the device's sounds back on them. */
@Composable
private fun OfflinePadsNotice(count: Int, onReset: () -> Unit) {
    if (count == 0) return
    Notice(MirrorText.OFFLINE_PADS, MirrorText.offlinePadsNote(count), MirrorText.RESET_PADS, onReset)
}

/**
 * Something to deal with, on a signal-tinted plate above the display: one
 * line, its small key, and its [note] behind an info key.
 */
@Composable
private fun Notice(text: String, note: String, key: String, onKey: () -> Unit) {
    val c = LocalArcColors.current
    var open by rememberSaveable(text) { mutableStateOf(false) }
    val shape = RoundedCornerShape(14.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(lerp(c.shell, c.signal, 0.13f))
            .border(1.dp, c.signal.copy(alpha = 0.4f), shape)
            .padding(start = 12.dp, end = 8.dp, top = 6.dp, bottom = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                Text(text, style = ArcType.small.copy(fontWeight = FontWeight.SemiBold), color = c.ink, modifier = Modifier.weight(1f, fill = false))
                InfoButton(open, { open = !open }, Modifier.padding(start = 2.dp))
            }
            ArcKey(key, onKey, size = KeySize.Small)
        }
        AnimatedVisibility(open, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
            Text(note, style = ArcType.small, color = c.graphite, modifier = Modifier.padding(top = 4.dp, end = 4.dp))
        }
    }
}

// ---------- The now display ----------

/**
 * The state now, on a dark plate like the display line. By priority: a take
 * recording (its time and a STOP key) or armed (waiting for the first sound,
 * the key calls it off), a beat card awaited from Claude (PASTE BEAT), else
 * the state in a line and what the EP-133 played last: the note on two
 * octaves of piano, or the pad hit.
 */
@Composable
private fun NowDisplay(ui: ToolsUi, st: MirrorState) {
    val c = LocalArcColors.current
    val taking = ui.take?.takeIf { it.state != RecState.Idle }
    val waiting = ui.claude?.takeIf { it.waiting != null }
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(c.display)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        when {
            taking != null -> TakeCard(taking, ui.still)
            waiting != null -> WaitingCard(waiting)
            else -> PlayedCard(ui, st)
        }
    }
}

/**
 * A take on the display: TAKE with a dot, "phone mix", then the time large in
 * signal orange and STOP while it records (the dot blinks), or, armed, a dim
 * line that it waits for the first sound and the TAKE key, which calls it off.
 */
@Composable
private fun TakeCard(take: TakeUi, still: Boolean) {
    val c = LocalArcColors.current
    val recording = take.state as? RecState.Recording
    val blink = if (still || recording == null) {
        null
    } else {
        rememberInfiniteTransition(label = "tools take").animateFloat(
            1f,
            0.15f,
            infiniteRepeatable(tween(RECORD_BLINK_MS), RepeatMode.Reverse),
            label = "tools take",
        )
    }
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Canvas(Modifier.size(9.dp)) { drawCircle(c.signal.copy(alpha = blink?.value ?: 1f)) }
        Text(MirrorText.TAKE.uppercase(), style = ArcType.displaySub, color = c.displayInk, modifier = Modifier.weight(1f))
        Text(MirrorText.PHONE_MIX, style = ArcType.displaySub, color = c.displayDim)
    }
    if (recording != null) {
        // The time is for the eye: the STOP key says it for screen readers.
        Text(
            MirrorText.takeLength(recording.seconds.toDouble()),
            style = ArcType.statNum.copy(fontSize = 34.sp, fontFeatureSettings = "tnum"),
            color = c.signal,
            maxLines = 1,
            modifier = Modifier.clearAndSetSemantics {},
        )
    } else {
        Text(MirrorText.TAKE_ARMED, style = ArcType.displayHint, color = c.displayDim)
    }
    ArcKey(
        if (recording != null) FeatureText.STOP else "● " + MirrorText.TAKE,
        take.onTake,
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = MirrorText.takeDescription(take.state) },
        style = KeyStyle.Signal,
    )
}

/** A card shared to Claude and not answered: what went, PASTE BEAT, and a dismiss. */
@Composable
private fun WaitingCard(claude: ClaudeUi) {
    val c = LocalArcColors.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(ClaudeText.SHARED_TO_CLAUDE.uppercase(), style = ArcType.displaySub, color = c.displayInk, maxLines = 1, softWrap = false)
        Text(
            claude.waiting.orEmpty(),
            style = ArcType.displaySub,
            color = c.displayDim,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(1f),
        )
    }
    Text(ClaudeText.WAITING_HINT, style = ArcType.displayHint, color = c.displayInk)
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ArcKey(
            ClaudeText.PASTE_BEAT,
            claude.onPaste,
            Modifier.weight(1f).semantics(mergeDescendants = true) { contentDescription = ClaudeText.PASTE_BEAT_NAME },
            style = KeyStyle.Signal,
        )
        // A cross, in the display's dim ink, with a full touch target.
        Box(
            Modifier
                .size(48.dp)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button, onClick = claude.onDismissWaiting)
                .semantics { contentDescription = ClaudeText.STOP_WAITING },
            contentAlignment = Alignment.Center,
        ) {
            Canvas(Modifier.size(14.dp)) {
                val w = 2.dp.toPx()
                drawLine(c.displayDim, Offset(0f, 0f), Offset(size.width, size.height), w, StrokeCap.Round)
                drawLine(c.displayDim, Offset(size.width, 0f), Offset(0f, size.height), w, StrokeCap.Round)
            }
        }
    }
}

/** Nothing awaited: the state in a line, the project, and the last thing the EP-133 played (the phone's own taps are not kept, only their lit keys). */
@Composable
private fun PlayedCard(ui: ToolsUi, st: MirrorState) {
    val c = LocalArcColors.current
    val line = when {
        ui.keys.on -> MirrorText.keysLine(ui.keys.root, ui.keys.scale, ui.keys.names)
        ui.oneGroup -> MirrorText.groupLine(ui.group, ui.follow)
        else -> MirrorText.ALL_GROUPS
    }
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(line.uppercase(), style = ArcType.displaySub, color = c.displayInk, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        st.activeProject?.let { Text(MirrorText.projectShort(it), style = ArcType.displaySub, color = c.displayDim, maxLines = 1) }
    }
    val note = st.lastKeysNote
    val hit = st.lastHit
    when {
        note != null -> {
            // The channel is the held note's, or the last hit's when that was this note.
            val channel = st.keysHeld[note] ?: hit?.takeIf { it.pad == null && it.note == note }?.channel
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    MirrorText.noteName(note, ui.keys.names).uppercase(),
                    style = ArcType.statNum.copy(fontSize = 34.sp),
                    color = c.displayInk,
                    maxLines = 1,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    channel?.let(MirrorText::lastNoteChannel) ?: MirrorText.LAST_NOTE,
                    style = ArcType.displaySub,
                    color = c.displayDim,
                    maxLines = 1,
                    modifier = Modifier.padding(bottom = 4.dp),
                )
            }
            KeysStrip(note, st.keysHeld.keys, ui.keys.names)
        }
        hit != null -> Text(MirrorText.hit(hit), style = ArcType.displaySub, color = c.displayInk, maxLines = 1, overflow = TextOverflow.Ellipsis)
        else -> Text(MirrorText.PLAY_HINT, style = ArcType.displayHint, color = c.displayDim)
    }
}

/**
 * The last note sent outside the pads (the EP-133's own KEYS mode) on two
 * octaves of piano around it, the [held] notes lit.
 */
@Composable
internal fun KeysStrip(last: Int, held: Set<Int>, names: NoteNames) {
    val c = LocalArcColors.current
    val start = ((last / 12) * 12 - 12).coerceIn(0, 103)
    val black = setOf(1, 3, 6, 8, 10)
    Canvas(
        Modifier
            .fillMaxWidth()
            .height(54.dp)
            .semantics { contentDescription = MirrorText.KEYS + " " + MirrorText.noteName(last, names) },
    ) {
        val whites = (start until start + 25).filter { it % 12 !in black }
        val w = size.width / whites.size
        whites.forEachIndexed { i, n ->
            drawRoundRect(
                if (n in held) c.signal else c.pianoWhite,
                topLeft = Offset(i * w + 1, 0f),
                size = Size(w - 2, size.height),
                cornerRadius = CornerRadius(3.dp.toPx()),
            )
        }
        for (n in start until start + 25) {
            if (n % 12 !in black) continue
            val leftWhites = whites.count { it < n }
            drawRoundRect(
                if (n in held) c.signal else c.pianoBlack,
                topLeft = Offset(leftWhites * w - w * 0.3f, 0f),
                size = Size(w * 0.6f, size.height * 0.6f),
                cornerRadius = CornerRadius(2.dp.toPx()),
            )
        }
    }
}

// ---------- The pages ----------

/** Play: in PADS the view and its switches, in KEYS the key and what the colours mean. */
@Composable
private fun PlayPage(ui: ToolsUi) {
    if (ui.keys.on) {
        KeysPanel(ui.keys, ui.keysActions, piano = ui.piano)
        return
    }
    GridPlate {
        SettingRow(MirrorText.VIEW, stacked = true) {
            Segmented(
                listOf(MirrorText.ALL_GROUPS, MirrorText.ONE_GROUP),
                selected = if (ui.oneGroup) 1 else 0,
                onSelect = { ui.onOneGroup(it == 1) },
                compact = true,
            )
        }
        if (ui.oneGroup) {
            PlateLine()
            SwitchRow(MirrorText.FOLLOW, MirrorText.FOLLOW_NOTE, ui.follow, ui.onFollow)
        } else {
            // The four groups have no one plate to print KEYS / PADS on (ModeStrip): the mode is here.
            PlateLine()
            SettingRow(MirrorText.MODE, stacked = true) {
                Segmented(
                    listOf(MirrorText.MODE_PADS, MirrorText.MODE_KEYS),
                    selected = 0,
                    onSelect = { if (it == 1) ui.keysActions.onMode(true) },
                    compact = true,
                )
            }
            // Nor ARP / RPT and LATCH: note repeat is here too.
            ui.arp?.let { arp ->
                PlateLine()
                SwitchRow(MirrorText.RPT_NAME, null, arp.ui.on, arp.onOn)
                if (arp.ui.on) {
                    PlateLine()
                    SwitchRow(MirrorText.LATCH, MirrorText.ARP_LATCH_NOTE, arp.ui.latch, arp.onLatch)
                }
            }
        }
    }
}

/** Claude: the share and paste keys and the links, and what a beat card is folded at the foot. */
@Composable
private fun ClaudePage(claude: ClaudeUi, group: Int) {
    ClaudeSection(claude, group, header = false)
    Disclosure(ClaudeText.ABOUT_CARDS) {
        val c = LocalArcColors.current
        Text(ClaudeText.INFO_CARDS, style = ArcType.small, color = c.graphite)
        Text(ClaudeText.INFO_SKILL, style = ArcType.small, color = c.graphite)
    }
}

/** Takes: the TAKE key and the takes, and how recording works folded at the foot. */
@Composable
private fun TakesPage(t: TakesUi, take: TakeUi) {
    TakesSection(t, take, header = false)
    Disclosure(MirrorText.ABOUT_TAKES) {
        val c = LocalArcColors.current
        Text(MirrorText.TAKES_HINT, style = ArcType.small, color = c.graphite)
        Text(MirrorText.TAKES_NOTE, style = ArcType.small, color = c.graphite)
    }
}

/** Help: how Live reads the EP-133 (PADS) or how Keys works (KEYS), in the open under a caption. */
@Composable
private fun HelpPage(ui: ToolsUi) {
    val c = LocalArcColors.current
    val st = ui.mirror?.state ?: MirrorState()
    val (title, texts) = if (ui.keys.on) {
        MirrorText.HOW_KEYS_WORKS to keysNotes()
    } else {
        MirrorText.HOW_LIVE_READS to liveNotes(st, ui.mirror, ui.tapToPlay, ui.sideways)
    }
    Caption(title, align = TextAlign.Start)
    GridPlate {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            for (t in texts) Text(t, style = ArcType.small, color = c.graphite)
        }
    }
}

/** What KEYS does, and the piano when the phone is upright (sideways already, it is there or has no room). */
@Composable
private fun keysNotes(): List<String> =
    listOfNotNull(MirrorText.KEYS_NOTE, MirrorText.PIANO_HINT.takeIf { !dev.arc.ep133.ui.components.LocalArcWindow.current.landscape })

/**
 * The pads' notes: tapping a pad, the piano, why Live is offline, how pad
 * numbers are learned, and what the app reads from the device.
 */
private fun liveNotes(st: MirrorState, mirror: MirrorUi?, tapToPlay: Boolean, sideways: Boolean): List<String> {
    val learning = st.padOrder == PadOrder.FROM_TOP
    return buildList {
        if (tapToPlay) add(MirrorText.TAP_NOTE)
        // Pads that play on the phone mean keys that do too, and sideways they are a piano.
        if (tapToPlay && !sideways) add(MirrorText.PIANO_HINT)
        // Offline the display line says so too, with this note under a tap.
        if (mirror?.offline != null) add(MirrorText.offlineNote(mirror.offline, st.activeProject ?: FactorySounds.PROJECT, mirror.kit))
        if (learning) add(MirrorText.LEARN_NOTE)
        if (learning && !st.pushesSeen && st.learned.isEmpty() && st.lastHit?.pad != null && mirror?.loading == false) add(MirrorText.NO_PUSHES)
        add(MirrorText.COMMUNITY_NOTE)
        add(MirrorText.LISTEN_ONLY)
    }
}

/**
 * The Takes page: the TAKE key, which starts a take (it records from the
 * first sound) and stops it, its time on it while it records; then the
 * takes, each of which plays, and unfolds to share, save, send to the EP-133
 * or delete. With [header] the section starts with a TAKES caption and an
 * info key for how to record and what a take holds; the page folds those at
 * its foot instead.
 */
@Composable
internal fun TakesSection(t: TakesUi, take: TakeUi, header: Boolean = true) {
    val c = LocalArcColors.current
    var open by rememberSaveable { mutableStateOf<String?>(null) }
    var confirm by rememberSaveable { mutableStateOf<String?>(null) }
    if (header) CaptionInfo(MirrorText.TAKES, listOf(MirrorText.TAKES_HINT, MirrorText.TAKES_NOTE))
    val recording = take.state as? RecState.Recording
    ArcKey(
        "● " + (recording?.let { MirrorText.takeBadge(it.seconds.toDouble()) } ?: MirrorText.TAKE),
        take.onTake,
        Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                contentDescription = MirrorText.takeDescription(take.state)
                stateDescription = MirrorText.onOff(take.state != RecState.Idle)
            },
        style = if (take.state != RecState.Idle) KeyStyle.Signal else KeyStyle.Normal,
        size = KeySize.Small,
    )
    for (take in t.list) {
        val playing = t.playing == t.keyOf(take)
        val unfolded = open == take.name
        Plate(onClick = { open = if (unfolded) null else take.name; confirm = null }, enabled = true) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(Modifier.weight(1f)) {
                    OneLine(t.fmtWhen(take.createdAt), ArcType.bold, c.ink)
                    Text(MirrorText.takeLength(take.seconds), style = ArcType.small, color = c.graphite)
                }
                ArcKey(
                    if (playing) FeatureText.STOP else FeatureText.PLAY,
                    { if (playing) t.onStop() else t.onPlay(take) },
                    size = KeySize.Small,
                )
            }
            if (unfolded) {
                if (confirm == take.name) {
                    Text(MirrorText.DELETE_TAKE, style = ArcType.small, color = c.graphite, modifier = Modifier.padding(top = 6.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        ArcKey(Strings.DELETE, {
                            confirm = null
                            open = null
                            t.onDelete(take)
                        }, Modifier.weight(1f), size = KeySize.Small, style = KeyStyle.Signal)
                        ArcKey(Strings.CANCEL, { confirm = null }, Modifier.weight(1f), size = KeySize.Small)
                    }
                } else {
                    Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        ArcKey(FeatureText.SHARE_WAV, { t.onShare(take) }, Modifier.weight(1f), size = KeySize.Small)
                        ArcKey(FeatureText.SAVE_WAV, { t.onSave(take) }, Modifier.weight(1f), size = KeySize.Small)
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (t.connected) ArcKey(MirrorText.TO_DEVICE, { t.onToDevice(take) }, Modifier.weight(1f), size = KeySize.Small)
                        ArcKey(Strings.DELETE, { confirm = take.name }, Modifier.weight(1f), size = KeySize.Small)
                    }
                }
            }
        }
    }
}
