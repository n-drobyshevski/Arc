package dev.arc.ep133.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.features.DeviceBrowser
import dev.arc.ep133.features.PadTarget
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.SoundSource
import dev.arc.ep133.protocol.SoundEntry
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.Format
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.ArcField
import dev.arc.ep133.ui.components.ArcIcon
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.OneLine
import dev.arc.ep133.ui.components.PlayKey
import dev.arc.ep133.ui.components.Segmented
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capEdge
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.components.plateRow
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/**
 * EDIT's pad sheet (an addition): another sound for a Live pad. The pad's cap
 * and what is on it now, then the device's sounds (found by name or slot, a
 * hundred slots at a time) each with a preview; a tap on one puts it on the
 * pad at once (the toast offers UNDO). "Upload a new sample…" loads a WAV
 * into a free slot and puts that on the pad.
 *
 * [sounds] is the device's sound list as Live read it; [playing] is the
 * player's key ("device:<slot>" or "factory:<slot>" while a preview plays).
 *
 * Offline ([offline]) the pad changes in arc only: [sounds] is the last
 * read's list and [factory] the factory pack's, with a Device / Factory
 * switch when both are there; sizes aren't known, the device's sounds arc
 * can't play ([unavailable]) are dimmed, and there is no upload ([onUpload]
 * null). [padSource] is the list the pad's sound is from, opened first and
 * the one that marks it ON PAD. [readSlot] is the pad's sound in the read,
 * never dimmed: picking it takes the pad's change back. [localName] names
 * the pad's offline sound when its list is gone (the pack deleted).
 *
 * A pad with a sound shows its settings first ([edit], the EP-133's SOUND
 * EDIT pages: [PadEditPages]), each turn going to [onEdit]; the list of
 * sounds then folds away under "Change sound". The pad's cap plays the pad
 * while held ([onPadDown], [onPadUp]), as a pad does, with its settings.
 */
@Composable
fun ColumnScope.PadSheetContent(
    pad: PhysicalPad,
    target: PadTarget,
    sounds: List<SoundEntry>,
    playing: String?,
    busy: Boolean,
    onPlay: (Int, SoundSource) -> Unit,
    onStop: () -> Unit,
    onPick: (Int, SoundSource) -> Unit,
    onUpload: (() -> Unit)?,
    factory: List<SoundEntry>? = null,
    unavailable: Set<Int> = emptySet(),
    padSource: SoundSource = SoundSource.DEVICE,
    offline: Boolean = false,
    readSlot: Int? = null,
    localName: String? = null,
    edit: dev.arc.ep133.controller.PadEditState? = null,
    onEdit: (dev.arc.ep133.features.PadSettings) -> Unit = {},
    haptics: Boolean = false,
    editPage: EditPage = EditPage.SOUND,
    onPadDown: (() -> Unit)? = null,
    onPadUp: () -> Unit = {},
) {
    val c = LocalArcColors.current
    val now = target.slot
    // The pad's sound, in the list it is from.
    val nowName = (if (padSource == SoundSource.FACTORY) factory.orEmpty() else sounds).firstOrNull { it.slot == now }?.name ?: localName

    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        PadCap(pad, nowName, onPadDown, onPadUp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(MirrorText.padTitle(pad), style = ArcType.heading, color = c.ink)
            Text(MirrorText.padSheetLine(target.project, now, nowName), style = ArcType.small, color = c.graphite)
        }
    }
    val editing = edit != null && now != null
    if (editing) {
        PadEditPages(
            settings = edit!!.settings,
            onChange = onEdit,
            onDone = {},
            frames = edit.frames,
            sampleRate = edit.sampleRate,
            peaks = edit.peaks,
            haptics = haptics,
            enabled = !edit.reading && !edit.failed,
            initialPage = editPage,
        )
        Text(
            when {
                edit.reading -> MirrorText.PAD_READING
                edit.failed -> MirrorText.PAD_READ_FAILED
                offline -> MirrorText.PAD_SETTINGS_OFFLINE
                else -> MirrorText.PAD_SETTINGS_NOTE
            },
            style = ArcType.small,
            color = c.graphite,
        )
    }
    // With the settings shown, the sounds fold away until asked for. Only a choice made is kept:
    // the settings arrive a frame after the sheet opens.
    var listChoice by rememberSaveable(pad) { mutableStateOf<Boolean?>(null) }
    val listOpen = listChoice ?: !editing
    if (editing) {
        ArcKey(
            if (listOpen) MirrorText.HIDE_SOUNDS else MirrorText.CHANGE_SOUND,
            { listChoice = !listOpen },
            Modifier.fillMaxWidth(),
            style = KeyStyle.Quiet,
        )
    }
    if (!listOpen) return
    SoundChooser(
        key = pad,
        now = now,
        sounds = sounds,
        playing = playing,
        busy = busy,
        onPlay = onPlay,
        onStop = onStop,
        onPick = onPick,
        note = if (offline) MirrorText.ASSIGN_NOTE_OFFLINE else MirrorText.ASSIGN_NOTE,
        onUpload = onUpload,
        factory = factory,
        unavailable = unavailable,
        padSource = padSource,
        offline = offline,
        readSlot = readSlot,
    )
}

/**
 * The sound list of a pad sheet (and of the beat card sheet's PICK SOUND): a Device / Factory switch when both lists are
 * there, a search field, a key for each hundred of slots, and the sounds of the one listed, each with a preview key; a tap
 * on one goes to [onPick] with its slot and list. [key] keeps the search and the hundred listed for one pad. [now] is the
 * slot on the pad (marked ON PAD, and the hundred listed first); [padSource] the list it is from. [note] is the line under the
 * list, and "Upload a new sample…" follows when [onUpload] is given. For the lists, [unavailable], [offline] and [readSlot]
 * see [PadSheetContent].
 */
@Composable
internal fun ColumnScope.SoundChooser(
    key: Any,
    now: Int?,
    sounds: List<SoundEntry>,
    playing: String?,
    busy: Boolean,
    onPlay: (Int, SoundSource) -> Unit,
    onStop: () -> Unit,
    onPick: (Int, SoundSource) -> Unit,
    note: String,
    onUpload: (() -> Unit)? = null,
    factory: List<SoundEntry>? = null,
    unavailable: Set<Int> = emptySet(),
    padSource: SoundSource = SoundSource.DEVICE,
    offline: Boolean = false,
    readSlot: Int? = null,
) {
    val c = LocalArcColors.current
    val switch = factory != null && sounds.isNotEmpty()
    var picked by rememberSaveable(key, padSource) { mutableStateOf(padSource) }
    // Only the lists there are: without the device's, the factory's; without the pack, the device's.
    val source = when {
        factory == null -> SoundSource.DEVICE
        sounds.isEmpty() -> SoundSource.FACTORY
        else -> picked
    }
    val list = if (source == SoundSource.FACTORY) factory.orEmpty() else sounds
    // The pad's sound, in the list it is from.
    val onPadSlot = now.takeIf { source == padSource }
    var query by rememberSaveable { mutableStateOf("") }
    // The hundred of slots listed (its first slot): the pad's own at first.
    var shown by rememberSaveable { mutableStateOf<Int?>(null) }
    val groups = remember(list, query) { DeviceBrowser.hundreds(DeviceBrowser.findSounds(list, query)) }
    val range = groups.firstOrNull { it.first.first == shown }
        ?: groups.firstOrNull { onPadSlot != null && onPadSlot in it.first }
        ?: groups.firstOrNull()
    if (switch) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(MirrorText.SOURCE, style = ArcType.small, color = c.graphite)
            Segmented(
                listOf(MirrorText.SOURCE_DEVICE, MirrorText.SOURCE_FACTORY),
                selected = if (source == SoundSource.FACTORY) 1 else 0,
                onSelect = { picked = if (it == 1) SoundSource.FACTORY else SoundSource.DEVICE },
                compact = true,
                descriptions = listOf("${MirrorText.SOURCE} ${MirrorText.SOURCE_DEVICE}", "${MirrorText.SOURCE} ${MirrorText.SOURCE_FACTORY}"),
            )
        }
    }
    ArcField(
        null, query, { query = it },
        placeholder = MirrorText.FIND_FOR_PAD,
        maxLength = 40,
        icon = ArcIcon.SEARCH,
    )
    if (groups.isEmpty()) {
        Text(if (list.isEmpty()) FeatureText.NO_SOUNDS else FeatureText.NO_FIND_MATCHES, style = ArcType.body15, color = c.graphite)
    } else {
        // The hundreds as keys, the one listed navy and down; they scroll sideways when many.
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(end = 4.dp, bottom = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            for ((r, _) in groups) RangeKey(r, on = r == range?.first) { shown = r.first }
        }
        val rows = range?.second.orEmpty()
        Column {
            rows.forEachIndexed { i, e ->
                SoundPick(
                    e,
                    first = i == 0,
                    last = i == rows.lastIndex,
                    onPad = e.slot == onPadSlot,
                    playing = playing == "${source.id}:${e.slot}",
                    enabled = !busy,
                    available = source == SoundSource.FACTORY || e.slot !in unavailable || e.slot == readSlot,
                    sized = !offline,
                    onPlay = { onPlay(e.slot, source) },
                    onStop = onStop,
                    onPick = { onPick(e.slot, source) },
                )
            }
        }
    }
    Text(note, style = ArcType.small, color = c.graphite)
    if (onUpload != null) ArcKey(MirrorText.UPLOAD_NEW, onUpload, Modifier.fillMaxWidth(), enabled = !busy, textColor = c.navy)
}

/**
 * The pad itself, small: its label top left and the sound on it at the foot,
 * as on the grid. With [onDown] it plays the pad while held, its face going
 * down as a pad's does; otherwise it is only a picture (screen readers have
 * the title beside it).
 */
@Composable
internal fun PadCap(pad: PhysicalPad, name: String?, onDown: (() -> Unit)? = null, onUp: () -> Unit = {}) {
    val hw = LocalHwColors.current
    var pressed by remember { mutableStateOf(false) }
    Box(
        Modifier
            .size(64.dp)
            .then(
                if (onDown == null) {
                    Modifier.clearAndSetSemantics {}
                } else {
                    Modifier
                        .pointerInput(onDown) {
                            detectTapGestures(onPress = {
                                pressed = true
                                onDown()
                                tryAwaitRelease()
                                pressed = false
                                onUp()
                            })
                        }
                        .clearAndSetSemantics {
                            role = Role.Button
                            contentDescription = FeatureText.play(name ?: pad.label)
                            onClick {
                                onDown()
                                onUp()
                                true
                            }
                        }
                },
            )
            .cap(hw.darkFace, hw.darkEdge, RoundedCornerShape(8.dp), capPress(pressed))
            .padding(start = 8.dp, top = 6.dp, end = 6.dp, bottom = 6.dp),
    ) {
        Text(
            pad.label,
            style = ArcType.semi.copy(fontSize = if (pad.label.length > 1) 11.sp else 20.sp, lineHeight = 1.em),
            color = hw.darkInk,
            maxLines = 1,
            softWrap = false,
        )
        if (name != null) {
            Text(
                name,
                style = ArcType.tiny.copy(fontSize = 10.sp, lineHeight = 1.1.em),
                color = hw.darkDim,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.align(Alignment.BottomStart),
            )
        }
    }
}

/** A hundred of slots as a key: "100–199" over its kind of sound in the factory layout ("SNARES"); the Device tab jumps with it too. */
@Composable
internal fun RangeKey(r: IntRange, on: Boolean, onClick: () -> Unit) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val kind = FeatureText.factoryCategory(r.first)
    Column(
        Modifier
            .heightIn(min = 48.dp)
            .widthIn(min = 76.dp)
            .cap(if (on) c.navy else c.key, if (on) capEdge(c.navy) else c.keyEdge, RoundedCornerShape(10.dp), capPress(on || pressed))
            .clickable(interactionSource = source, indication = null, role = Role.Tab) { onClick() }
            .semantics { selected = on }
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(FeatureText.range(r), style = ArcType.capsKeySmall, color = if (on) c.onNavy else c.ink, maxLines = 1)
        if (kind != null) Text(kind.uppercase(), style = ArcType.caps.copy(fontSize = 10.sp), color = if (on) c.onNavy.copy(alpha = 0.75f) else c.graphite, maxLines = 1)
    }
}

/**
 * One sound in the pad sheet: slot, name, size and a preview key. A tap puts
 * it on the pad; the sound on the pad now is marked ON PAD (signal tint and
 * edge) and does nothing. Offline: no size ([sized] false), and a device
 * sound arc can't play ([available] false) is dimmed, says it needs the
 * EP-133, and neither plays nor goes on the pad.
 */
@Composable
private fun SoundPick(
    e: SoundEntry,
    first: Boolean,
    last: Boolean,
    onPad: Boolean,
    playing: Boolean,
    enabled: Boolean,
    onPlay: () -> Unit,
    onStop: () -> Unit,
    onPick: () -> Unit,
    available: Boolean = true,
    sized: Boolean = true,
) {
    val c = LocalArcColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .plateRow(first, last, c.plate, c.line)
            .background(
                when {
                    onPad -> c.signal.copy(alpha = 0.16f)
                    pressed -> c.keyEdge.copy(alpha = 0.35f)
                    else -> Color.Transparent
                },
            )
            // The sound on the pad has a signal edge on its left.
            .drawBehind { if (onPad) drawRect(c.signal, size = Size(4.dp.toPx(), size.height)) }
            .clickable(interactionSource = source, indication = null, enabled = enabled && available && !onPad, role = Role.Button, onClick = onPick)
            .semantics(mergeDescendants = true) {
                if (onPad) stateDescription = MirrorText.ON_PAD else if (!available) stateDescription = MirrorText.NEEDS_DEVICE
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier.weight(1f).then(if (available) Modifier else Modifier.alpha(0.45f)).padding(start = 14.dp, end = 10.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(6.dp).clip(CircleShape).background(if (playing) c.signal else LocalHwColors.current.ledOff))
            Text(FeatureText.slot(e.slot), style = ArcType.bold, color = if (onPad) c.signal else c.graphite)
            OneLine(e.name.uppercase(), ArcType.bold, c.ink, Modifier.weight(1f))
            val note = when {
                onPad -> MirrorText.ON_PAD.uppercase()
                !available -> MirrorText.NEEDS_DEVICE
                sized -> Format.bytes(e.size)
                else -> null
            }
            if (note != null) Text(note, style = ArcType.small, color = c.graphite, maxLines = 1)
            PlayKey(
                playing = playing,
                enabled = enabled && available,
                description = if (playing) FeatureText.stop(e.name) else FeatureText.play(e.name),
                onClick = { if (playing) onStop() else onPlay() },
            )
        }
    }
}
