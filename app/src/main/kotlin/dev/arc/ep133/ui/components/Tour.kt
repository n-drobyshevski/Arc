package dev.arc.ep133.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.Saver
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.Placeable
import androidx.compose.ui.layout.SubcomposeLayout
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import dev.arc.ep133.features.Tour
import dev.arc.ep133.features.TourSession
import dev.arc.ep133.features.TourStep
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.text.Strings
import dev.arc.ep133.text.TourText
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/*
 * "Try arc" on screen (an addition to the web version): the step's card over
 * the guide overlay's veil, cut away around what the step is about. Which step
 * shows and when it is done is core's Tour; this is how it looks.
 */

/** What a step's card shows, from the app's state. */
data class TourUi(
    val step: TourStep,
    /** WELCOME: progress was kept from an earlier start, so the card says Welcome back. */
    val resumed: Boolean = false,
    /** Welcome back: the step it stopped at. */
    val resumeAt: Int = 1,
    /** CONNECT's rows: MIDI allowed, EP-133 plugged in, connected (and read). */
    val midi: Boolean = true,
    val plugged: Boolean = false,
    val connected: Boolean = false,
    /** A task is running: Connect waits. */
    val busy: Boolean = false,
    /** PAD or BACKUP with the EP-133 gone: the card asks to connect again. */
    val needsConnect: Boolean = false,
    /** BACKUP's key: the device has been read and nothing is running. */
    val canBackup: Boolean = false,
    /** HEAR's Play it: the lit pad has a sample to play. */
    val canPlay: Boolean = false,
    /** DONE: a step was left that Try arc again can bring back. */
    val laterNote: Boolean = false,
)

/** What the card's keys do; every one runs the app's real action. */
class TourActions(
    /** Start, or Continue on Welcome back. */
    val onStart: () -> Unit = {},
    /** Not now and the ×: the tour no longer opens by itself. */
    val onNotNow: () -> Unit = {},
    /** Skip, Later, First time here, and Needs MIDI's Next. */
    val onSkip: () -> Unit = {},
    /** Next on the Connect card once every row is ticked. */
    val onNext: () -> Unit = {},
    val onConnect: () -> Unit = {},
    /** Restore from Documents/arc: the folder picker. */
    val onRestore: () -> Unit = {},
    val onBackup: () -> Unit = {},
    /** Plays the pad that lit, for those who can't hold it (screen readers). */
    val onPlay: () -> Unit = {},
    val onDone: () -> Unit = {},
)

/** The PAD and HEAR cards are short, so the pads they point at stay in view. */
fun TourUi.compact(): Boolean = (step == TourStep.PAD || step == TourStep.HEAR) && !needsConnect

/**
 * The overlay for a step: a card on the veil alone (WELCOME, RESTORE, MIDI),
 * the veil cut away around the control the step is about, or Done's three tags.
 * Only HEAR lets touches through, to the pads.
 */
fun tourMode(ui: TourUi): CoachMode {
    // Without the EP-133 the card asks to connect: point at the connection key.
    if (ui.needsConnect) return CoachMode(spotlight = "top.connection")
    if (ui.step == TourStep.DONE) return CoachMode(only = Tour.DONE_TAGS)
    val target = Tour.target(ui.step) ?: return CoachMode(only = emptySet())
    return CoachMode(spotlight = target, passThrough = Tour.passThrough(ui.step))
}

/**
 * The page with the guide overlay or the tour over it: [tour] shows the
 * tour's step (null: none), [coach] the guide overlay (the ? key). Back
 * pauses the tour ([onBack]) or closes the overlay.
 */
@Composable
fun TourHost(
    tour: TourUi?,
    actions: TourActions,
    onBack: () -> Unit,
    coach: Boolean,
    onCoachDismiss: () -> Unit,
    content: @Composable () -> Unit,
) {
    // The last step stays on the veil while it fades out.
    val shown = remember { mutableStateOf<TourUi?>(null) }.apply { if (tour != null) value = tour }.value
    val ui = if (tour == null && coach) null else tour ?: shown
    val card: (@Composable (target: () -> Rect?, clipHole: (Rect?) -> Unit) -> Unit)? = if (ui != null) {
        { target, clipHole -> TourCardLayout(target, clipHole, dockBottom = ui.step == TourStep.DONE) { headingOnly -> TourCard(ui, actions, headingOnly = headingOnly) } }
    } else {
        null
    }
    CoachHost(
        visible = tour != null || coach,
        onDismiss = if (tour != null) onBack else onCoachDismiss,
        mode = if (ui != null) tourMode(ui) else CoachMode(),
        card = card,
        content = content,
    )
}

// ---------- the card ----------

/**
 * One step's card. [headingOnly] is for a screen too short for the rest
 * (see [placeTourCard]): the heading and the ×.
 */
@Composable
fun TourCard(ui: TourUi, actions: TourActions, modifier: Modifier = Modifier, headingOnly: Boolean = false) {
    val c = LocalArcColors.current
    val compact = ui.compact()
    val shape = RoundedCornerShape(18.dp)
    Column(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(c.key)
            .border(1.dp, c.keyEdge, shape)
            .semantics { paneTitle = TourText.TITLE }
            .verticalScroll(rememberScrollState())
            .padding(start = 16.dp, end = 12.dp, top = 10.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(if (compact || headingOnly) 6.dp else 12.dp),
    ) {
        val number = Tour.number(ui.step)
        if (compact || headingOnly) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Heading(headingOf(ui), Modifier.weight(1f))
                CloseKey(actions.onNotNow, TourText.NOT_NOW)
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (number != null) {
                    Text(TourText.stepOf(number, Tour.STEPS).uppercase(), style = ArcType.caps, color = c.graphite, maxLines = 1)
                    StepDots(number)
                }
                Box(Modifier.weight(1f))
                CloseKey(actions.onNotNow, TourText.NOT_NOW)
            }
        }
        if (!headingOnly) {
            Column(Modifier.padding(end = 4.dp), verticalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 12.dp)) {
                when {
                    ui.needsConnect -> NeedsConnect(ui, actions)
                    else -> when (ui.step) {
                        TourStep.WELCOME -> Welcome(ui, actions)
                        TourStep.RESTORE -> {
                            Heading(headingOf(ui))
                            Body(FeatureText.RESTORE_HINT)
                            ArcKey(FeatureText.RESTORE_FOLDER, actions.onRestore, Modifier.fillMaxWidth(), style = KeyStyle.Signal)
                            ArcKey(TourText.FIRST_TIME, actions.onSkip, Modifier.fillMaxWidth(), style = KeyStyle.Quiet)
                        }
                        TourStep.CONNECT -> Connect(ui, actions)
                        TourStep.MIDI -> {
                            Heading(headingOf(ui))
                            Body(Strings.NO_MIDI_HINT)
                            Keys(TourText.NEXT, actions.onSkip)
                        }
                        TourStep.PAD -> {
                            Body(MirrorText.WAITING + " " + TourText.PAD_NOTE)
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                Box(Modifier.weight(1f))
                                ArcKey(TourText.SKIP, actions.onSkip, size = KeySize.Small, style = KeyStyle.Quiet)
                            }
                        }
                        TourStep.HEAR -> {
                            Body(TourText.HEAR_HINT)
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                ArcKey(TourText.PLAY_IT, actions.onPlay, Modifier.weight(1f), style = KeyStyle.Signal, size = KeySize.Small, enabled = ui.canPlay)
                                ArcKey(TourText.SKIP, actions.onSkip, size = KeySize.Small, style = KeyStyle.Quiet)
                            }
                        }
                        TourStep.BACKUP -> {
                            Heading(headingOf(ui))
                            Body(TourText.BACKUP_HINT)
                            Note(Strings.KEEP_SCREEN_ON)
                            Keys(Strings.BACK_UP, actions.onBackup, enabled = ui.canBackup, second = TourText.LATER, onSecond = actions.onSkip)
                        }
                        TourStep.DONE -> {
                            Heading(headingOf(ui))
                            Body(TourText.DONE_HINT)
                            if (ui.laterNote) Note(TourText.LATER_NOTE)
                            Keys(Strings.DONE, actions.onDone)
                        }
                    }
                }
            }
        }
    }
}

/** The card's heading; the compact cards and the heading-only card show it beside the ×. */
private fun headingOf(ui: TourUi): String = when (ui.step) {
    TourStep.WELCOME -> if (ui.resumed) TourText.RESUME_HEAD else TourText.TITLE
    TourStep.RESTORE -> TourText.RESTORE_HEAD
    TourStep.CONNECT -> TourText.CONNECT_HEAD
    TourStep.MIDI -> TourText.NEEDS_MIDI
    TourStep.PAD -> TourText.PAD_HEAD
    TourStep.HEAR -> TourText.HEAR_HEAD
    TourStep.BACKUP -> TourText.BACKUP_HEAD
    TourStep.DONE -> TourText.DONE_HEAD
}

@Composable
private fun Welcome(ui: TourUi, actions: TourActions) {
    val c = LocalArcColors.current
    if (ui.resumed) {
        Heading(TourText.RESUME_HEAD)
        Body(TourText.resumeHint(ui.resumeAt, Tour.STEPS))
        Keys(TourText.CONTINUE, actions.onStart, second = TourText.NOT_NOW, onSecond = actions.onNotNow)
        return
    }
    DisplayPanel {
        Column {
            // The wordmark on the display, as the device would show it; read out as the tour's name.
            Row(Modifier.clearAndSetSemantics { heading(); contentDescription = TourText.TITLE }) {
                Text("arc", style = ArcType.wordmark, color = c.displayInk, modifier = Modifier.alignByBaseline())
                Box(
                    Modifier
                        .alignBy { it.measuredHeight }
                        .padding(start = 3.dp)
                        .size(9.dp)
                        .clip(CircleShape)
                        .background(c.signal),
                )
            }
            Text(TourText.WELCOME_SUB, style = ArcType.displaySub, color = c.displayDim)
        }
    }
    Body(TourText.WELCOME_HINT)
    Body(TourText.WELCOME_STEPS)
    Keys(TourText.START, actions.onStart, second = TourText.NOT_NOW, onSecond = actions.onNotNow)
}

@Composable
private fun Connect(ui: TourUi, actions: TourActions) {
    Heading(TourText.CONNECT_HEAD)
    Body(TourText.CONNECT_HINT)
    val plugged = ui.plugged || ui.connected
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        CheckRow(TourText.ROW_MIDI, ui.midi)
        CheckRow(TourText.ROW_PLUGGED, plugged)
        CheckRow(TourText.ROW_CONNECTED, ui.connected)
    }
    // Every row ticked: the card waits for Next, so the ticks are seen.
    if (ui.connected) {
        Keys(TourText.NEXT, actions.onNext)
    } else {
        Keys(Strings.CONNECT, actions.onConnect, enabled = ui.midi && !ui.busy, second = TourText.SKIP, onSecond = actions.onSkip)
    }
}

/** PAD or BACKUP after the EP-133 went away: connect again, or skip the step. */
@Composable
private fun NeedsConnect(ui: TourUi, actions: TourActions) {
    Heading(headingOf(ui))
    Body(TourText.NEEDS_DEVICE)
    CheckRow(TourText.ROW_CONNECTED, false)
    Keys(
        Strings.CONNECT, actions.onConnect, enabled = ui.midi && !ui.busy,
        second = if (ui.step == TourStep.BACKUP) TourText.LATER else TourText.SKIP, onSecond = actions.onSkip,
    )
}

@Composable
private fun Heading(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = ArcType.heading,
        color = LocalArcColors.current.ink,
        modifier = modifier.semantics {
            heading()
            liveRegion = LiveRegionMode.Polite
        },
    )
}

@Composable
private fun Body(text: String) {
    Text(text, style = ArcType.body15, color = LocalArcColors.current.ink)
}

@Composable
private fun Note(text: String) {
    Text(text, style = ArcType.small, color = LocalArcColors.current.graphite)
}

/** The step's main key (orange) and a quiet second one. */
@Composable
private fun Keys(text: String, onClick: () -> Unit, enabled: Boolean = true, second: String? = null, onSecond: () -> Unit = {}) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        ArcKey(text, onClick, Modifier.weight(1f), style = KeyStyle.Signal, enabled = enabled)
        if (second != null) ArcKey(second, onSecond, style = KeyStyle.Quiet)
    }
}

/** A check: a green tick when done, an empty ring when not. Read out as "label: done". */
@Composable
private fun CheckRow(label: String, done: Boolean) {
    val c = LocalArcColors.current
    Row(
        Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = TourText.row(label, done) },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Canvas(Modifier.size(20.dp)) {
            val r = size.minDimension / 2
            if (done) {
                drawCircle(c.ok, r)
                val w = 2.dp.toPx()
                drawPath(
                    Path().apply {
                        moveTo(size.width * 0.28f, size.height * 0.52f)
                        lineTo(size.width * 0.44f, size.height * 0.68f)
                        lineTo(size.width * 0.73f, size.height * 0.36f)
                    },
                    c.onOk,
                    style = Stroke(w, cap = StrokeCap.Round),
                )
            } else {
                val w = 2.dp.toPx()
                drawCircle(c.keyEdge, r - w / 2, style = Stroke(w))
            }
        }
        Text(label, style = ArcType.semi, color = if (done) c.ink else c.graphite)
    }
}

/** ●●○○: the steps reached, up to [n] of four. */
@Composable
private fun StepDots(n: Int) {
    val c = LocalArcColors.current
    Row(Modifier.clearAndSetSemantics {}, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        for (i in 1..Tour.STEPS) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(if (i <= n) c.signal else c.keyEdge))
        }
    }
}

// ---------- where the card goes ----------

/**
 * Where a card goes, in dp from the screen's top left: [card] (its height
 * capped to the screen), the part of the screen the cut-out is kept to where
 * the card had to cover the target's edge ([holeClip], null for none), and
 * whether only the heading fits.
 */
data class TourPlacement(val card: Rect, val holeClip: Rect? = null, val headingOnly: Boolean = false)

/** The card's room around it and next to its target, in dp. */
object TourPlace {
    const val MARGIN = 16f
    const val MAX_WIDTH = 400f
    const val GAP = 12f
    /** Room between a key and a card below or above it, for the key's tag. */
    const val TAG_ROOM = 48f
    /** A card beside the pad grid needs at least this much width. */
    const val MIN_SIDE_WIDTH = 260f
    /** Rows of pads in the grid: a docked card may cover one. */
    const val PAD_ROWS = 4
    /** A target taller than this share of the screen is an area (the pad grid), not a key. */
    const val TALL = 0.25f
}

/**
 * Where the card goes on a [vw] × [vh] screen (dp), next to [target] (null for
 * a card on the veil alone). [cardHeight] and [headingHeight] measure the
 * card, whole and heading only, at a width. [safeTop] and [safeBottom] are the
 * system bars. The card is min(vw − 32, 400) wide and at most the screen less
 * 32 tall (it scrolls beyond that).
 *
 * - No target: from 45% down the screen, moved up to fit; docked to the bottom
 *   with [dockBottom] (Done, whose tags sit around the middle of the screen).
 * - A key: below it when it is in the top half, else above it, with room for its tag.
 * - The pad grid, the first that works: beside it; below it; above it; docked
 *   to the side with more room, covering at most one row of pads (the cut-out
 *   stops at the card); heading only, docked the same way.
 */
fun placeTourCard(
    vw: Float,
    vh: Float,
    target: Rect?,
    cardHeight: (width: Float) -> Float,
    headingHeight: (width: Float) -> Float,
    safeTop: Float = 0f,
    safeBottom: Float = 0f,
    dockBottom: Boolean = false,
): TourPlacement {
    val m = TourPlace.MARGIN
    val gap = TourPlace.GAP
    val w = min(vw - 2 * m, TourPlace.MAX_WIDTH).coerceAtLeast(0f)
    val left = (vw - w) / 2
    val minTop = safeTop + m
    val maxBottom = vh - safeBottom - m
    val cap = (maxBottom - minTop).coerceAtLeast(0f)
    fun box(l: Float, top: Float, width: Float, h: Float) = Rect(l, top, l + width, top + h)
    // Kept on screen: moved up to fit, but never above the top.
    fun fit(top: Float, h: Float) = min(top, maxBottom - h).coerceAtLeast(minTop)

    if (target == null) {
        val h = min(cardHeight(w), cap)
        return TourPlacement(box(left, fit(if (dockBottom) maxBottom - h else vh * 0.45f, h), w, h))
    }
    if (target.height <= vh * TourPlace.TALL) {
        val h = min(cardHeight(w), cap)
        val top = if (target.center.y < vh / 2) target.bottom + TourPlace.TAG_ROOM else target.top - TourPlace.TAG_ROOM - h
        return TourPlacement(box(left, fit(top, h), w, h))
    }
    // 1. Beside the grid, on the side with more room.
    val roomLeft = target.left - gap - m
    val roomRight = vw - m - target.right - gap
    val sideW = min(max(roomLeft, roomRight), TourPlace.MAX_WIDTH)
    if (sideW >= TourPlace.MIN_SIDE_WIDTH) {
        val h = cardHeight(sideW)
        if (h <= cap) {
            val l = if (roomRight >= roomLeft) target.right + gap else target.left - gap - sideW
            return TourPlacement(box(l, fit(target.center.y - h / 2, h), sideW, h))
        }
    }
    val h = min(cardHeight(w), cap)
    // 2. Below it, 3. above it.
    if (target.bottom + gap + h <= maxBottom) return TourPlacement(box(left, target.bottom + gap, w, h))
    if (target.top - gap - h >= minTop) return TourPlacement(box(left, target.top - gap - h, w, h))
    // 4. Docked to the side with more room, over at most one row of pads; 5. heading only.
    val roomBelow = maxBottom - target.bottom
    val roomAbove = target.top - minTop
    val below = roomBelow >= roomAbove
    fun dock(h: Float, headingOnly: Boolean): TourPlacement = if (below) {
        val top = maxBottom - h
        TourPlacement(box(left, top, w, h), Rect(0f, 0f, vw, top - gap), headingOnly)
    } else {
        TourPlacement(box(left, minTop, w, h), Rect(0f, minTop + h + gap, vw, vh), headingOnly)
    }
    val row = target.height / TourPlace.PAD_ROWS
    if (h + gap <= max(roomBelow, roomAbove) + row) return dock(h, false)
    return dock(min(headingHeight(w), cap), true)
}

/**
 * Measures the card and puts it where [placeTourCard] says, next to the
 * spotlit control ([target], root pixels, read once the page is laid out),
 * and trims the cut-out where the card covers it ([clipHole]).
 */
@Composable
fun TourCardLayout(
    target: () -> Rect?,
    clipHole: (Rect?) -> Unit,
    dockBottom: Boolean = false,
    card: @Composable (headingOnly: Boolean) -> Unit,
) {
    val insets = WindowInsets.safeDrawing
    SubcomposeLayout(Modifier.fillMaxSize()) { constraints ->
        val d = density
        val vw = constraints.maxWidth / d
        val vh = constraints.maxHeight / d
        val safeTop = insets.getTop(this) / d
        val safeBottom = insets.getBottom(this) / d
        val capPx = ((vh - safeTop - safeBottom - 2 * TourPlace.MARGIN) * d).roundToInt().coerceAtLeast(0)
        // Each version of the card is measured once per pass, at the width asked for.
        val measured = HashMap<Pair<Boolean, Int>, Placeable>()
        fun measure(headingOnly: Boolean, width: Float): Placeable {
            val wPx = (width * d).roundToInt().coerceAtLeast(0)
            return measured.getOrPut(headingOnly to wPx) {
                subcompose(headingOnly to wPx) { card(headingOnly) }.first()
                    .measure(Constraints(minWidth = wPx, maxWidth = wPx, minHeight = 0, maxHeight = capPx))
            }
        }
        val t = target()?.let { Rect(it.left / d, it.top / d, it.right / d, it.bottom / d) }
        val place = placeTourCard(
            vw, vh, t,
            cardHeight = { measure(false, it).height / d },
            headingHeight = { measure(true, it).height / d },
            safeTop = safeTop,
            safeBottom = safeBottom,
            dockBottom = dockBottom,
        )
        val p = measure(place.headingOnly, place.card.width)
        clipHole(place.holeClip?.let { Rect(it.left * d, it.top * d, it.right * d, it.bottom * d) })
        layout(constraints.maxWidth, constraints.maxHeight) {
            p.place((place.card.left * d).roundToInt(), (place.card.top * d).roundToInt())
        }
    }
}

/** Keeps a run of the tour across a rotation or a trip to the background (it is never stored for longer). */
val TourSessionSaver: Saver<TourSession?, String> = Saver(
    save = { s ->
        s?.run {
            listOf(seenAtOpen, tourDoneAtOpen, openBackups, resumed, welcomed, step?.id.orEmpty(), stepAt, stepBackups, heardSince, connectTickedNow, connectAcked, reachedDone)
                .joinToString(",")
        }
    },
    restore = { text ->
        runCatching {
            val f = text.split(',')
            TourSession(
                seenAtOpen = f[0].toBooleanStrict(),
                tourDoneAtOpen = f[1].toBooleanStrict(),
                openBackups = f[2].toInt(),
                resumed = f[3].toBooleanStrict(),
                welcomed = f[4].toBooleanStrict(),
                step = TourStep.entries.firstOrNull { it.id == f[5] },
                stepAt = f[6].toLong(),
                stepBackups = f[7].toInt(),
                heardSince = f[8].toBooleanStrict(),
                connectTickedNow = f[9].toBooleanStrict(),
                connectAcked = f[10].toBooleanStrict(),
                reachedDone = f[11].toBooleanStrict(),
            )
        }.getOrNull()
    },
)
