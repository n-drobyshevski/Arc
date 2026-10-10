package dev.arc.ep133.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.LocalMinimumInteractiveComponentSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.arc.ep133.controller.BeatFxUi
import dev.arc.ep133.controller.BeatGridUi
import dev.arc.ep133.controller.BeatImportUi
import dev.arc.ep133.controller.PadShapeRowUi
import dev.arc.ep133.controller.PadShapingUi
import dev.arc.ep133.controller.SilentRowUi
import dev.arc.ep133.controller.SilentUi
import dev.arc.ep133.controller.SoundRowUi
import dev.arc.ep133.controller.SoundsUi
import dev.arc.ep133.controller.Weight
import dev.arc.ep133.controller.pickedRow
import dev.arc.ep133.features.CardProblem
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.SoundSource
import dev.arc.ep133.features.SoundStatus
import dev.arc.ep133.features.Tempo
import dev.arc.ep133.text.ClaudeText
import dev.arc.ep133.text.CoachText
import dev.arc.ep133.text.Format
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.text.SettingsText
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.CaptionInfo
import dev.arc.ep133.ui.components.GridPlate
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.LinkRow
import dev.arc.ep133.ui.components.PlateLine
import dev.arc.ep133.ui.components.coachMark
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/**
 * Beat cards in Live tools and on their sheet (an addition): CLAUDE, the
 * section after the view settings and before TAKES, and the sheet a pasted
 * card opens.
 */

/**
 * The CLAUDE section's state: the scene playing ([scene], "S02") with each
 * group's playing pattern number ([numbers], A to D) and whether it has notes
 * ([hasNotes]), which the share keys name and are off without; how many
 * sounds Arc knows ([sounds]; 0 hides "With my sound list", [withSounds] being
 * its tick box); and what its keys and links do. SHARE A · 01 is the group
 * shown, as [MirrorScreen] has it.
 */
class ClaudeUi(
    val scene: String = MirrorText.sceneLabel(0),
    val numbers: List<Int> = List(4) { 1 },
    val hasNotes: List<Boolean> = List(4) { false },
    val sounds: Int = 0,
    val withSounds: Boolean = true,
    val onWithSounds: (Boolean) -> Unit = {},
    val onShareScene: () -> Unit = {},
    val onSharePattern: (group: Int) -> Unit = {},
    val onPaste: () -> Unit = {},
    val onGetSkill: () -> Unit = {},
    val onLearn: () -> Unit = {},
) {
    val sceneHasNotes: Boolean get() = hasNotes.any { it }
}

/**
 * Live tools' CLAUDE: the header with its info key (what a beat card is, and
 * how to give Claude the arc-beats skill), a card with SHARE SCENE, SHARE for
 * the [group] shown (the shares are dimmed, and still announced, when there is
 * nothing to share), the tick box "With my sound list" under them (when Arc
 * knows sounds) and PASTE BEAT, and under it two links: the skill's zip, and a
 * starter prompt to learn the EP-133 with Claude.
 */
@Composable
internal fun ClaudeSection(claude: ClaudeUi, group: Int) {
    val c = LocalArcColors.current
    val g = group.coerceIn(0, 3)
    val number = claude.numbers.getOrElse(g) { 1 }
    val patternEmpty = !claude.hasNotes.getOrElse(g) { false }
    val sceneEmpty = !claude.sceneHasNotes
    CaptionInfo(ClaudeText.CLAUDE, listOf(ClaudeText.INFO_CARDS, ClaudeText.INFO_SKILL))
    GridPlate(Modifier.coachMark("live.claude", CoachText.CLAUDE, c.navy, c.onNavy)) {
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(ClaudeText.BEAT_CARDS, style = ArcType.semi, color = c.ink)
            Text(ClaudeText.BEAT_HINT, style = ArcType.small, color = c.graphite)
            ArcKey(
                ClaudeText.shareScene(claude.scene),
                claude.onShareScene,
                Modifier
                    .fillMaxWidth()
                    .semantics(mergeDescendants = true) { contentDescription = ClaudeText.shareSceneName(claude.scene, sceneEmpty) },
                size = KeySize.Small,
                enabled = !sceneEmpty,
            )
            ArcKey(
                ClaudeText.sharePattern(g, number),
                { claude.onSharePattern(g) },
                Modifier
                    .fillMaxWidth()
                    .semantics(mergeDescendants = true) { contentDescription = ClaudeText.sharePatternName(g, number, patternEmpty) },
                size = KeySize.Small,
                enabled = !patternEmpty,
            )
            if (claude.sounds > 0) SoundListTick(claude.sounds, claude.withSounds, claude.onWithSounds)
            ArcKey(
                ClaudeText.PASTE_BEAT,
                claude.onPaste,
                Modifier
                    .fillMaxWidth()
                    .semantics(mergeDescendants = true) { contentDescription = ClaudeText.PASTE_BEAT_NAME },
                style = KeyStyle.Signal,
                size = KeySize.Small,
            )
        }
    }
    GridPlate { LinkRow(ClaudeText.GET_SKILL, claude.onGetSkill) }
    GridPlate { LinkRow(ClaudeText.LEARN, claude.onLearn) }
}

/** A tick box row: [text] after a box, a tap anywhere on the row switches it. */
@Composable
private fun TickRow(text: String, on: Boolean, onChange: (Boolean) -> Unit) {
    val c = LocalArcColors.current
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .toggleable(value = on, interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Checkbox, onValueChange = onChange),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        TickBox(on)
        Text(text, style = ArcType.small, color = c.ink, modifier = Modifier.weight(1f))
    }
}

/** The box of a [TickRow] or a sound row: the row it sits in is what is tapped. */
@Composable
private fun TickBox(on: Boolean, enabled: Boolean = true) {
    val c = LocalArcColors.current
    CompositionLocalProvider(LocalMinimumInteractiveComponentSize provides 0.dp) {
        Checkbox(
            checked = on, onCheckedChange = null, enabled = enabled, modifier = Modifier.size(22.dp),
            colors = CheckboxDefaults.colors(checkedColor = c.signal, uncheckedColor = c.graphite, checkmarkColor = c.onSignal, disabledCheckedColor = c.signal, disabledUncheckedColor = c.graphite),
        )
    }
}

/** "With my sound list · 212 sounds": the shared card is followed by the sounds Arc knows. */
@Composable
private fun SoundListTick(count: Int, on: Boolean, onChange: (Boolean) -> Unit) =
    TickRow(ClaudeText.withSoundList(count), on, onChange)

/**
 * A beat card's sheet (a pasted card, or Claude's reply shared to arc): the
 * card's name and what is in it, a read-only grid for each section (a row for
 * each pad with notes, cells lit by how hard it is hit; the first two bars of a
 * long pattern), where each section goes, the new scene a card of several
 * groups adds, its tempo (a chip sets it: off until chosen), its swing, and its
 * problems with their lines (COPY PROBLEMS copies them for Claude). When the
 * card has sound lines a SOUNDS block follows the rows: a line for each, ticked
 * to be put on its pad (PUT ON PADS switches them all). A card with FX lines has
 * an FX block before the sounds (a row for each kind it sets, the project's FX
 * struck through and the card's after them; APPLY FX switches them), and a card
 * with pad lines a PAD SHAPING block after them (a row for each pad, ticked).
 * IMPORT puts it all in as one UNDO step; it is off, and says why, when the card
 * can't be read or a group is full. [onImport] gets whether the tempo is to be
 * set, the pads whose sounds are to be put on, whether the FX are to be applied,
 * the pads whose settings are to be written and the sounds picked for silent pads.
 *
 * A card that plays pads with no sound has a SILENT PADS block before the sounds
 * (amber): a row for each, with PICK SOUND, which swaps the sheet for the pad
 * sheet's sound list ([SoundChooser]: search, hundreds, preview) listed with
 * [player]. A pick doesn't touch the pad: it adds a ticked row to SOUNDS (nothing
 * to something) that IMPORT puts on the pad with the card's own sounds, in the same
 * UNDO step; the silent row then says "\u2192 512 PIANO" with a CHANGE key.
 */
@Composable
fun ColumnScope.BeatImportSheetContent(
    ui: BeatImportUi,
    onCancel: () -> Unit,
    onImport: (setTempo: Boolean, soundPads: Set<PhysicalPad>, applyFx: Boolean, shapePads: Set<PhysicalPad>, picked: Map<PhysicalPad, Int>) -> Unit,
    onCopyProblems: (List<CardProblem>) -> Unit,
    /** For screenshots: start with the tempo chip chosen. */
    initialSetTempo: Boolean = false,
    /** The preview of the sounds PICK SOUND lists: what plays, and the keys that play and stop it. */
    player: PickPlayerUi = PickPlayerUi(),
    /** For screenshots: start with these sounds picked for silent pads (pad, slot), or the picker of this pad open. */
    initialPicked: List<Pair<PhysicalPad, Int>> = emptyList(),
    initialPicking: PhysicalPad? = null,
) {
    val c = LocalArcColors.current
    // Chosen on this sheet only: a card's tempo never replaces Arc's unasked.
    var setTempo by rememberSaveable { mutableStateOf(initialSetTempo) }
    // The sounds: all put on pads, bar the rows unticked (a pad is group * 16 + offset).
    var putOnPads by rememberSaveable { mutableStateOf(true) }
    var unticked by rememberSaveable { mutableStateOf(emptyList<Int>()) }
    // The sounds picked for silent pads (a pad's key and a slot, [pickedCode]) and the pad whose picker is open (-1: none).
    var picked by rememberSaveable { mutableStateOf(initialPicked.map { (pad, slot) -> pickedCode(pad, slot) }) }
    var picking by rememberSaveable { mutableStateOf(initialPicking?.let(::padKey) ?: -1) }
    // The FX: applied unless switched off. The pad shaping rows: all ticked, bar the ones unticked.
    var applyFx by rememberSaveable { mutableStateOf(true) }
    var shapeOff by rememberSaveable { mutableStateOf(emptyList<Int>()) }
    val silent = ui.silent
    if (silent != null && picking >= 0) {
        val row = silent.rows.firstOrNull { padKey(it.pad) == picking }
        if (row != null) {
            SoundPicker(
                row, silent, player,
                onPick = { slot, _ ->
                    picked = picked.filter { pickedPad(it) != picking } + pickedCode(row.pad, slot)
                    // A pick is ticked to begin with, even where the pad's earlier pick was unticked.
                    unticked = unticked - picking
                    picking = -1
                },
                onBack = { picking = -1 },
            )
            return
        }
        picking = -1
    }
    // The picks as SOUNDS rows, in pad order: only for pads the card still leaves silent.
    val pickedRows = if (silent == null) emptyList() else picked.sorted().mapNotNull { code ->
        val row = silent.rows.firstOrNull { padKey(it.pad) == pickedPad(code) } ?: return@mapNotNull null
        val slot = pickedSlot(code)
        pickedRow(row.pad, slot, silent.choices?.names?.get(slot))
    }
    // The card's own sound rows, with the picked ones after them.
    val sounds = if (pickedRows.isEmpty() || silent == null) ui.sounds
    else SoundsUi(ui.sounds?.rows.orEmpty() + pickedRows, ui.sounds?.offline ?: silent.offline, ui.sounds?.project ?: silent.project)
    // Whether a new sound is going onto the pad (its row ticked): its settings start again, which the shaping rows start from.
    val soundGoing = { pad: PhysicalPad -> putOnPads && sounds?.changes.orEmpty().any { it.pad == pad && padKey(it.pad) !in unticked } }
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(ui.title, style = ArcType.heading, color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
        ui.summary?.let { Text(it, style = ArcType.small, color = c.graphite) }
    }
    for (g in ui.grids) BeatGrid(g)
    val tempo = ui.tempo
    val rows = ui.grids.count { it.goesTo != null } + (if (ui.scene != null) 1 else 0) + (if (tempo != null) 1 else 0)
    if (rows > 0) {
        GridPlate {
            var first = true
            @Composable
            fun line() {
                if (!first) PlateLine()
                first = false
            }
            for (g in ui.grids) {
                val n = g.goesTo ?: continue
                line()
                ValueRow(ClaudeText.GOES_TO, ClaudeText.goesTo(g.group, n))
            }
            ui.scene?.let {
                line()
                ValueRow(MirrorText.NEW_SCENE, MirrorText.sceneLabel(it))
            }
            if (tempo != null) {
                line()
                ValueRow(ClaudeText.TEMPO, tempo.toString()) {
                    TempoChip(ui.tempoNow, tempo, setTempo) { setTempo = !setTempo }
                }
            }
        }
    }
    ui.fx?.let { FxBlock(it, applyFx) { applyFx = !applyFx } }
    if (silent != null) {
        SilentBlock(
            silent,
            // A pad's pick counts while its SOUNDS row is ticked (and PUT ON PADS is on): otherwise the pad stays silent.
            soundOf = { pad ->
                val code = picked.firstOrNull { pickedPad(it) == padKey(pad) }
                if (code == null || !putOnPads || padKey(pad) in unticked) null
                else ClaudeText.soundName(pickedSlot(code), silent.choices?.names?.get(pickedSlot(code)))
            },
            onPick = { picking = padKey(it) },
        )
    }
    sounds?.let { all ->
        val ticked = if (putOnPads) all.changes.filter { padKey(it.pad) !in unticked } else emptyList()
        SoundsBlock(
            all, putOnPads, { putOnPads = !putOnPads }, ticked.size,
            isTicked = { putOnPads && padKey(it.pad) !in unticked },
            onTick = { row -> unticked = if (padKey(row.pad) in unticked) unticked - padKey(row.pad) else unticked + padKey(row.pad) },
        )
    }
    ui.shaping?.let { shaping ->
        PadShapingBlock(
            shaping, soundGoing,
            isTicked = { padKey(it.pad) !in shapeOff },
            onTick = { row -> shapeOff = if (padKey(row.pad) in shapeOff) shapeOff - padKey(row.pad) else shapeOff + padKey(row.pad) },
        )
    }
    ui.swing?.let { Text(ClaudeText.swingLine(it), style = ArcType.small, color = c.graphite) }
    if (ui.problems.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for (p in ui.problems) Problem(p)
            ArcKey(ClaudeText.COPY_PROBLEMS, { onCopyProblems(ui.problems) }, Modifier.fillMaxWidth(), size = KeySize.Small)
        }
    }
    val blocked = ui.blocked
    if (blocked != null) {
        Text(
            blocked,
            style = ArcType.small,
            color = c.danger,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        ArcKey(Strings.CANCEL, onCancel, Modifier.weight(1f))
        ArcKey(
            ClaudeText.IMPORT,
            {
                val pads = if (putOnPads) sounds?.changes.orEmpty().filter { padKey(it.pad) !in unticked }.mapTo(HashSet()) { it.pad } else emptySet()
                val shaped = ui.shaping?.rows.orEmpty().filter { it.changes(soundGoing(it.pad)) && padKey(it.pad) !in shapeOff }.mapTo(HashSet()) { it.pad }
                // The picked sounds that are ticked: they are in [pads] too, being SOUNDS rows.
                val chosen = pickedRows.filter { it.pad in pads }.associate { it.pad to it.pick.slot!! }
                onImport(setTempo && tempo != null, pads, applyFx && ui.fx != null, shaped, chosen)
            },
            Modifier.weight(1f),
            style = KeyStyle.Signal,
            enabled = blocked == null,
        )
    }
}

private fun padKey(pad: PhysicalPad) = pad.group * 16 + pad.offset

// A sound picked for a silent pad as one number: the pad's key and the slot (1..999), so the picks keep through a rotation.
private fun pickedCode(pad: PhysicalPad, slot: Int) = padKey(pad) * 1024 + slot

private fun pickedPad(code: Int) = code / 1024

private fun pickedSlot(code: Int) = code % 1024

/** The preview of the sounds PICK SOUND lists: the player's key of the one playing ([playing]), whether the device is [busy], and the keys that play and stop. */
class PickPlayerUi(
    val playing: String? = null,
    val busy: Boolean = false,
    val onPlay: (Int, SoundSource) -> Unit = { _, _ -> },
    val onStop: () -> Unit = {},
)

/**
 * The SILENT PADS block (amber): its header and a row for each pad the card plays that has no sound ([SilentRow]), and under
 * them what a pick does. [soundOf] gives the sound picked for a pad ("512 PIANO") while its SOUNDS row is ticked, else null.
 */
@Composable
private fun SilentBlock(silent: SilentUi, soundOf: (PhysicalPad) -> String?, onPick: (PhysicalPad) -> Unit) {
    val c = LocalArcColors.current
    GridPlate {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(Modifier.width(4.dp).height(16.dp).clip(RoundedCornerShape(2.dp)).background(c.warn))
            Text(ClaudeText.SILENT_PADS.uppercase(), style = ArcType.caps, color = c.graphite, maxLines = 1, modifier = Modifier.weight(1f))
        }
        for (row in silent.rows) {
            PlateLine()
            SilentRow(row, soundOf(row.pad), silent.choices != null) { onPick(row.pad) }
        }
    }
    Text(ClaudeText.SILENT_NOTE, style = ArcType.small, color = c.graphite)
}

/**
 * One silent pad: an amber bar, "D7 \u00B7 12 notes, no sound: they will be silent" and its PICK SOUND key (no key when Arc
 * knows no sounds to pick from). Once a sound is picked ([sound], "512 PIANO") the bar is navy, the row says "\u2192 512 PIANO" and
 * the key is CHANGE.
 */
@Composable
private fun SilentRow(row: SilentRowUi, sound: String?, canPick: Boolean, onPick: () -> Unit) {
    val c = LocalArcColors.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.width(4.dp).height(32.dp).clip(RoundedCornerShape(2.dp)).background(if (sound == null) c.warn else c.navy))
        Column(
            Modifier
                .weight(1f)
                .semantics(mergeDescendants = true) {
                    contentDescription = if (sound == null) ClaudeText.silentRowName(row.pad, row.notes) else ClaudeText.pickedRowName(row.pad, sound)
                },
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            if (sound == null) {
                Text(ClaudeText.silentRow(row.pad, row.notes), style = ArcType.small, color = c.ink)
            } else {
                Text(ClaudeText.padLabel(row.pad) + " \u00B7 " + Format.plural(row.notes, "note"), style = ArcType.small, color = c.graphite)
                Text("\u2192 $sound", style = ArcType.small, fontWeight = FontWeight.Bold, color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        if (canPick) {
            ArcKey(
                if (sound == null) ClaudeText.PICK_SOUND else ClaudeText.CHANGE_PICK,
                onPick,
                Modifier.semantics(mergeDescendants = true) {
                    contentDescription = if (sound == null) ClaudeText.pickSoundName(row.pad) else ClaudeText.changePickName(row.pad, sound)
                },
                size = KeySize.Small,
            )
        }
    }
}

/**
 * PICK SOUND's picker, in place of the sheet: the pad's cap and what it plays in the card, the pad sheet's sound list
 * ([SoundChooser]: the search, the hundreds, a preview on each sound) and a key back to the card. A tap on a sound
 * picks it ([onPick]; nothing is written yet, see [BeatImportSheetContent]). The list is the one IMPORT picks from: the
 * EP-133's while connected, offline the view's (so no Device / Factory switch, and no upload).
 */
@Composable
private fun ColumnScope.SoundPicker(row: SilentRowUi, silent: SilentUi, player: PickPlayerUi, onPick: (Int, SoundSource) -> Unit, onBack: () -> Unit) {
    val c = LocalArcColors.current
    val choices = silent.choices
    val stop = { if (player.playing != null) player.onStop() }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        PadCap(row.pad, null)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(ClaudeText.pickTitle(row.pad), style = ArcType.heading, color = c.ink)
            Text(ClaudeText.pickLine(row.notes), style = ArcType.small, color = c.graphite)
        }
    }
    if (choices != null) {
        val fromPack = choices.source == SoundSource.FACTORY
        SoundChooser(
            key = "pick:${padKey(row.pad)}",
            now = null,
            sounds = if (fromPack) emptyList() else choices.entries,
            playing = player.playing,
            busy = player.busy,
            onPlay = player.onPlay,
            onStop = player.onStop,
            onPick = { slot, source ->
                stop()
                onPick(slot, source)
            },
            note = ClaudeText.PICK_NOTE,
            factory = if (fromPack) choices.entries else null,
            unavailable = choices.unavailable,
            padSource = choices.source,
            offline = silent.offline,
        )
    }
    ArcKey(
        ClaudeText.PICK_BACK,
        {
            stop()
            onBack()
        },
        Modifier.fillMaxWidth(),
        style = KeyStyle.Quiet,
    )
}

/**
 * The SOUNDS block: its header with the PUT ON PADS chip (shown when some row can be ticked; [on] by default), a row
 * for each sound line ([SoundRow]), and under it what writing them does ([ticked] pads): to the EP-133 and its project,
 * or kept in Arc until it connects.
 */
@Composable
private fun SoundsBlock(
    sounds: SoundsUi,
    on: Boolean,
    onToggle: () -> Unit,
    ticked: Int,
    isTicked: (SoundRowUi) -> Boolean,
    onTick: (SoundRowUi) -> Unit,
) {
    val c = LocalArcColors.current
    val changes = sounds.changes.size
    GridPlate {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(ClaudeText.SOUNDS.uppercase(), style = ArcType.caps, color = c.graphite, maxLines = 1, modifier = Modifier.weight(1f))
            if (changes > 0) PutOnPadsChip(on, changes, onToggle)
        }
        for (row in sounds.rows) {
            PlateLine()
            SoundRow(row, isTicked(row), on) { onTick(row) }
        }
    }
    if (sounds.noneFound) Text(ClaudeText.NONE_ON_DEVICE, style = ArcType.small, color = c.graphite)
    if (on && ticked > 0) {
        Text(
            if (sounds.offline) {
                ClaudeText.SOUNDS_OFFLINE_NOTE
            } else {
                // A pad with no sound can't be emptied again by UNDO: a ticked pick (or any such row) stays on it.
                val keeps = sounds.rows.any { it.changes && isTicked(it) && (it.picked || it.oldName == ClaudeText.NO_SOUND) }
                ClaudeText.soundsNote(ticked, sounds.project, keeps)
            },
            style = ArcType.small,
            color = c.graphite,
        )
    }
}

/** The PUT ON PADS chip: navy while the ticked sounds go onto the pads, a flat pill while they don't. */
@Composable
private fun PutOnPadsChip(on: Boolean, count: Int, onToggle: () -> Unit) =
    SwitchChip(ClaudeText.PUT_ON_PADS, ClaudeText.putOnPadsName(on, count), on, onToggle)

/** A block's chip: [text] in navy while [on], a flat pill while it isn't; a tap switches it, and screen readers hear [description]. */
@Composable
private fun SwitchChip(text: String, description: String, on: Boolean, onToggle: () -> Unit) {
    val c = LocalArcColors.current
    Box(
        Modifier
            .heightIn(min = 40.dp)
            .clip(RoundedCornerShape(50))
            .background(if (on) c.navy else c.shell)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Switch, onClick = onToggle)
            .semantics {
                contentDescription = description
                stateDescription = if (on) SettingsText.ON else SettingsText.OFF
            }
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text.uppercase(), style = ArcType.capsKeySmall, color = if (on) c.onNavy else c.ink, maxLines = 1)
    }
}

/**
 * The FX block: its header with the APPLY FX chip (on by default; shown when some row changes the FX), a row for each
 * kind of FX the card has a line for ([FxRow]), and under them what applying does ([on]). With the chip off the rows are
 * dimmed: the project's FX stay as they are.
 */
@Composable
private fun FxBlock(fx: BeatFxUi, on: Boolean, onToggle: () -> Unit) {
    val c = LocalArcColors.current
    GridPlate {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(ClaudeText.FX.uppercase(), style = ArcType.caps, color = c.graphite, maxLines = 1, modifier = Modifier.weight(1f))
            if (fx.changes) SwitchChip(ClaudeText.APPLY_FX, ClaudeText.applyFxName(on), on, onToggle)
        }
        for (row in fx.rows) {
            PlateLine()
            FxRow(row, on)
        }
    }
    if (on && fx.changes) Text(ClaudeText.FX_BLOCK_NOTE, style = ArcType.small, color = c.graphite)
}

/** The width of the label column of an FX row, and of a pad shaping row's pad. */
private val FxLabelWidth = 62.dp

/**
 * One kind of FX: its label (EFFECT, SENDS, COMP, DUCK), the project's value struck through and the card's after an
 * arrow; "Already set" under the value when the project has it. Dimmed while APPLY FX is off ([on]).
 */
@Composable
private fun FxRow(row: ClaudeText.Change, on: Boolean) {
    val c = LocalArcColors.current
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .alpha(if (row.same || on) 1f else 0.5f)
            .semantics(mergeDescendants = true) { contentDescription = ClaudeText.changeName(row) },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(row.label.uppercase(), style = ArcType.caps, color = c.graphite, maxLines = 1, modifier = Modifier.width(FxLabelWidth))
        if (row.same) {
            Column(Modifier.weight(1f)) {
                Text(row.new, style = ArcType.small, fontWeight = FontWeight.Bold, color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(ClaudeText.ALREADY_SET, style = ArcType.tiny, color = c.graphite, maxLines = 1)
            }
        } else {
            Column(Modifier.weight(1f)) {
                Text(
                    row.old, style = ArcType.small, color = c.graphite, maxLines = 2, overflow = TextOverflow.Ellipsis,
                    textDecoration = TextDecoration.LineThrough,
                )
                Text("\u2192 " + row.new, style = ArcType.small, fontWeight = FontWeight.Bold, color = c.ink, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/**
 * The PAD SHAPING block: its header and a row for each pad line of the card ([PadShapeRow]), and under them what writing
 * them does when some row is ticked: on the EP-133, or kept in Arc until it connects. [soundGoing]: a new sound is going onto
 * the pad (the rows start from the defaults then).
 */
@Composable
private fun PadShapingBlock(shaping: PadShapingUi, soundGoing: (PhysicalPad) -> Boolean, isTicked: (PadShapeRowUi) -> Boolean, onTick: (PadShapeRowUi) -> Unit) {
    val c = LocalArcColors.current
    val ticked = shaping.rows.count { it.changes(soundGoing(it.pad)) && isTicked(it) }
    GridPlate {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(ClaudeText.PAD_SHAPING.uppercase(), style = ArcType.caps, color = c.graphite, maxLines = 1)
        }
        for (row in shaping.rows) {
            PlateLine()
            PadShapeRow(row, soundGoing(row.pad), isTicked(row)) { onTick(row) }
        }
    }
    if (ticked > 0) Text(if (shaping.offline) ClaudeText.PAD_SHAPING_OFFLINE_NOTE else ClaudeText.PAD_SHAPING_NOTE, style = ArcType.small, color = c.graphite)
}

/**
 * One pad line: a tick box (when there is something to change), the pad, and each setting it changes, the old value struck
 * through and the new one after an arrow ("pitch 0 \u2192 +2 \u00B7 release 255 \u2192 40"). A pad that has them says "Already set",
 * and one with no sound (and none going onto it) is amber with the reason; neither has a box.
 */
@Composable
private fun PadShapeRow(row: PadShapeRowUi, soundGoing: Boolean, ticked: Boolean, onTick: () -> Unit) {
    val c = LocalArcColors.current
    val parts = row.parts(soundGoing)
    val noSound = !row.hasSound && !soundGoing
    val changes = row.changes(soundGoing)
    val change = parts.takeIf { it.isNotEmpty() }?.let { ClaudeText.padChange(row.pad, row.base(soundGoing), row.after(soundGoing)) }
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .then(
                if (changes) Modifier.toggleable(value = ticked, interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Checkbox) { onTick() }
                else Modifier,
            )
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .semantics(mergeDescendants = true) { contentDescription = ClaudeText.padRowName(change, row.pad, noSound) },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) {
            when {
                changes -> TickBox(ticked)
                noSound -> Box(Modifier.width(4.dp).height(28.dp).clip(RoundedCornerShape(2.dp)).background(c.warn))
            }
        }
        Text(ClaudeText.padLabel(row.pad), style = ArcType.fieldLabel, color = c.ink, maxLines = 1, modifier = Modifier.width(28.dp))
        Column(Modifier.weight(1f).alpha(if (changes && !ticked) 0.5f else 1f)) {
            when {
                noSound -> Text(ClaudeText.PAD_NO_SOUND, style = ArcType.small, color = c.ink, maxLines = 2)
                parts.isEmpty() -> {
                    row.name?.let { Text(it, style = ArcType.fieldLabel, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    Text(ClaudeText.ALREADY_SET, style = ArcType.tiny, color = c.graphite, maxLines = 1)
                }
                else -> {
                    Text(
                        buildAnnotatedString {
                            for ((i, p) in parts.withIndex()) {
                                if (i > 0) append("  \u00B7  ")
                                withStyle(SpanStyle(color = c.graphite)) { append(p.name.lowercase() + " ") }
                                withStyle(SpanStyle(color = c.graphite, textDecoration = TextDecoration.LineThrough)) { append(p.old) }
                                append(" \u2192 ")
                                withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = c.ink)) { append(p.new) }
                            }
                        },
                        style = ArcType.small, maxLines = 3, overflow = TextOverflow.Ellipsis,
                    )
                    row.name?.let { Text(it, style = ArcType.tiny, color = c.graphite, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                }
            }
        }
    }
}

/**
 * One sound line: a tick box (changes only), the pad, and what happens. A change shows the pad's old sound struck
 * through and the new one after an arrow; a pad that plays the sound already says so, with no box; a sound that isn't in
 * the user's list is amber, with the reason, and no box. [chipOn] is the chip: off, the rows are dimmed and can't be ticked.
 */
@Composable
private fun SoundRow(row: SoundRowUi, ticked: Boolean, chipOn: Boolean, onTick: () -> Unit) {
    val c = LocalArcColors.current
    val pick = row.pick
    val wanted = pick.wanted
    val missing = pick.status == SoundStatus.MISSING
    // A sound listed unnamed is its file name ("012.pcm") already: the slot isn't said twice.
    val now = if (missing) null else if (pick.unverified && pick.name != null) pick.name else ClaudeText.soundName(pick.slot ?: wanted.slot, pick.name)
    val cardSays = row.cardSays
    val description = when {
        missing -> ClaudeText.soundRowMissing(pick.pad, wanted.slot, wanted.name)
        pick.status == SoundStatus.SAME -> ClaudeText.soundRowSame(pick.pad, now.orEmpty())
        else -> ClaudeText.soundRowName(pick.pad, row.oldName, now.orEmpty())
    } + (cardSays?.let { ". " + ClaudeText.cardSays(it) } ?: "")
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .then(
                if (row.changes) Modifier.toggleable(value = ticked, enabled = chipOn, interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Checkbox) { onTick() }
                else Modifier,
            )
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .semantics(mergeDescendants = true) { contentDescription = description },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) {
            when {
                row.changes -> TickBox(ticked && chipOn, enabled = chipOn)
                missing -> Box(Modifier.width(4.dp).height(28.dp).clip(RoundedCornerShape(2.dp)).background(c.warn))
            }
        }
        Text(ClaudeText.padLabel(pick.pad), style = ArcType.fieldLabel, color = c.ink, maxLines = 1, modifier = Modifier.width(28.dp))
        val dim = if (row.changes && !chipOn) 0.5f else 1f
        when {
            missing -> Text(
                ClaudeText.soundMissing(wanted.slot, wanted.name),
                style = ArcType.small, color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
            )
            pick.status == SoundStatus.SAME -> Column(Modifier.weight(1f)) {
                Text(now.orEmpty(), style = ArcType.fieldLabel, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(ClaudeText.ALREADY_THERE, style = ArcType.tiny, color = c.graphite, maxLines = 1)
            }
            else -> Column(Modifier.weight(1f).alpha(dim)) {
                Text(
                    buildAnnotatedString {
                        row.oldName?.let {
                            withStyle(SpanStyle(color = c.graphite, textDecoration = TextDecoration.LineThrough)) { append(it) }
                            append("  \u2192  ")
                        }
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = c.ink)) { append(now.orEmpty()) }
                    },
                    style = ArcType.small, maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
                // A factory sound the EP-133 lists without a name: used by its slot, the card's name not checked.
                cardSays?.let { Text(ClaudeText.cardSays(it), style = ArcType.tiny, color = c.graphite, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                // A sound the user picked for a silent pad, not the card's.
                if (row.picked) Text(ClaudeText.PICKED_HERE, style = ArcType.tiny, color = c.graphite, maxLines = 1)
            }
        }
    }
}

/** A row of the sheet: [label] at the start, [value] after it, and [end] (a chip) at the end. */
@Composable
private fun ValueRow(label: String, value: String, end: (@Composable () -> Unit)? = null) {
    val c = LocalArcColors.current
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(label, style = ArcType.small, color = c.graphite, maxLines = 1)
        Text(value, style = ArcType.bold, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        end?.invoke()
    }
}

/**
 * The tempo chip: "SET · NOW 122". Off it is a flat pill (the tempo stays Arc's), on it is navy with
 * the tempo to be set ([card]); a tap switches it. Screen readers hear what it does.
 */
@Composable
private fun TempoChip(now: Int, card: Int, on: Boolean, onToggle: () -> Unit) {
    val c = LocalArcColors.current
    Box(
        Modifier
            .heightIn(min = 40.dp)
            .clip(RoundedCornerShape(50))
            .background(if (on) c.navy else c.shell)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Switch, onClick = onToggle)
            .semantics {
                contentDescription = ClaudeText.tempoChipName(card.toString(), now, on)
                stateDescription = if (on) SettingsText.ON else SettingsText.OFF
            }
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(ClaudeText.tempoChip(now).uppercase(), style = ArcType.capsKeySmall, color = if (on) c.onNavy else c.ink, maxLines = 1)
    }
}

/** A problem, its line named: a bar in the amber of a warning or the red of an error, then its words in full. */
@Composable
private fun Problem(p: CardProblem) {
    val c = LocalArcColors.current
    Row(
        Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .clearAndSetSemantics { contentDescription = ClaudeText.problemName(p) },
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.width(4.dp).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(if (p.error) c.danger else c.warn))
        Text(ClaudeText.problemLine(p), style = ArcType.small, color = c.ink, modifier = Modifier.weight(1f))
    }
}

/** The width of a pad's name column on the grid, a cell's height, and the gaps between cells, beats and bars. */
private val LabelWidth = 84.dp
private val CellHeight = 18.dp
private val CellGap = 1.dp
private val BeatGap = 3.dp
private val BarGap = 5.dp

/** A cell never narrower than this (a long grid scrolls) nor wider than that (one bar of 1/16). */
private val CellMin = 5.dp
private val CellMax = 14.dp

/**
 * A section's step grid, read-only: its heading (group, length, step), "+N bars" for what isn't drawn, and a
 * row for each pad with notes: its label and sound name, then its cells, lit by weight, a little apart each beat
 * and each bar. The cells share the room the sheet has and scroll together when a long grid needs more.
 */
@Composable
private fun BeatGrid(g: BeatGridUi) {
    val c = LocalArcColors.current
    val scroll = rememberScrollState()
    Column(
        Modifier
            .fillMaxWidth()
            .semantics { contentDescription = ClaudeText.gridName(g.group, g.bars, g.step.id, g.rows.size) },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(ClaudeText.sectionTitle(g.group, g.bars, g.step.id), style = ArcType.semi, color = c.ink, modifier = Modifier.weight(1f, fill = false))
            if (g.moreBars > 0) Text(ClaudeText.moreBars(g.moreBars), style = ArcType.small, color = c.graphite, modifier = Modifier.padding(bottom = 1.dp))
        }
        GridPlate {
            BoxWithConstraints(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp)) {
                val cells = g.perBar * g.shownBars
                val room = maxWidth - LabelWidth - 8.dp
                val cell = cellWidth(g, room)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (row in g.rows) {
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .semantics(mergeDescendants = true) { contentDescription = ClaudeText.rowName(row.pad, row.name, row.hits) },
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                buildAnnotatedString {
                                    withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = c.ink)) { append(ClaudeText.padLabel(row.pad)) }
                                    row.name?.let { withStyle(SpanStyle(color = c.graphite)) { append(" " + it) } }
                                },
                                style = ArcType.tiny,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.width(LabelWidth),
                            )
                            Box(Modifier.weight(1f).horizontalScroll(scroll)) {
                                CellRow(row.cells, g.perBar, cell, Modifier.size(rowWidth(cells, g.perBar, cell), CellHeight))
                            }
                        }
                    }
                }
            }
        }
    }
}

// The cells in a beat of a bar of [perBar] cells: 4 on 1/16, 6 on 1/16T, 8 on 1/32.
private fun perBeat(perBar: Int) = perBar / Tempo.BEATS_PER_BAR

// The cell width that fits [room] (a bar of 1/16 fills it up to CellMax), at least CellMin.
private fun cellWidth(g: BeatGridUi, room: Dp): Dp {
    val cells = g.perBar * g.shownBars
    val fixed = rowWidth(cells, g.perBar, 0.dp)
    return ((room - fixed) / cells).coerceIn(CellMin, CellMax)
}

// A row's width: [cells] of [cell] with the gaps between cells, the wider gap after each beat and bar.
private fun rowWidth(cells: Int, perBar: Int, cell: Dp): Dp {
    val bars = cells / perBar
    val beats = cells / perBeat(perBar)
    val inBeat = cells - beats
    return cell * cells + CellGap * inBeat + BeatGap * (beats - bars) + BarGap * (bars - 1)
}

/** One pad's cells: a rounded cell for each step, tinted by the weight of its hit (a faint one where nothing sits). */
@Composable
private fun CellRow(cells: List<Weight?>, perBar: Int, cell: Dp, modifier: Modifier) {
    val c = LocalArcColors.current
    val perBeat = perBeat(perBar)
    val empty = c.ink.copy(alpha = 0.1f)
    val ghost = c.navy.copy(alpha = 0.4f)
    Canvas(modifier.clearAndSetSemantics {}) {
        var x = 0f
        val w = cell.toPx()
        val radius = CornerRadius(1.5.dp.toPx())
        for ((i, weight) in cells.withIndex()) {
            val color = when (weight) {
                Weight.ACCENT -> c.signal
                Weight.NORMAL -> c.navy
                Weight.GHOST -> ghost
                null -> empty
            }
            drawRoundRect(color, Offset(x, 0f), Size(w, size.height), radius)
            x += w
            val next = i + 1
            x += when {
                next == cells.size -> 0f
                next % perBar == 0 -> BarGap.toPx()
                next % perBeat == 0 -> BeatGap.toPx()
                else -> CellGap.toPx()
            }
        }
    }
}
