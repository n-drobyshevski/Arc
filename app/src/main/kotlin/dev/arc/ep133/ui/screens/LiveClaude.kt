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
import dev.arc.ep133.controller.BeatGridUi
import dev.arc.ep133.controller.BeatImportUi
import dev.arc.ep133.controller.SoundRowUi
import dev.arc.ep133.controller.SoundsUi
import dev.arc.ep133.controller.Weight
import dev.arc.ep133.features.CardProblem
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.features.SoundStatus
import dev.arc.ep133.features.Tempo
import dev.arc.ep133.text.ClaudeText
import dev.arc.ep133.text.CoachText
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
 * to be put on its pad (PUT ON PADS switches them all). IMPORT puts it all in
 * as one UNDO step; it is off, and says why, when the card can't be read or a
 * group is full. [onImport] gets whether the tempo is to be set and the pads
 * whose sounds are to be put on.
 */
@Composable
fun ColumnScope.BeatImportSheetContent(
    ui: BeatImportUi,
    onCancel: () -> Unit,
    onImport: (setTempo: Boolean, soundPads: Set<PhysicalPad>) -> Unit,
    onCopyProblems: (List<CardProblem>) -> Unit,
    /** For screenshots: start with the tempo chip chosen. */
    initialSetTempo: Boolean = false,
) {
    val c = LocalArcColors.current
    // Chosen on this sheet only: a card's tempo never replaces Arc's unasked.
    var setTempo by rememberSaveable { mutableStateOf(initialSetTempo) }
    // The sounds: all put on pads, bar the rows unticked (a pad is group * 16 + offset).
    var putOnPads by rememberSaveable { mutableStateOf(true) }
    var unticked by rememberSaveable { mutableStateOf(emptyList<Int>()) }
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
    ui.sounds?.let { sounds ->
        val ticked = if (putOnPads) sounds.changes.filter { padKey(it.pad) !in unticked } else emptyList()
        SoundsBlock(
            sounds, putOnPads, { putOnPads = !putOnPads }, ticked.size,
            isTicked = { putOnPads && padKey(it.pad) !in unticked },
            onTick = { row -> unticked = if (padKey(row.pad) in unticked) unticked - padKey(row.pad) else unticked + padKey(row.pad) },
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
                val pads = if (putOnPads) ui.sounds?.changes.orEmpty().filter { padKey(it.pad) !in unticked }.mapTo(HashSet()) { it.pad } else emptySet()
                onImport(setTempo && tempo != null, pads)
            },
            Modifier.weight(1f),
            style = KeyStyle.Signal,
            enabled = blocked == null,
        )
    }
}

private fun padKey(pad: PhysicalPad) = pad.group * 16 + pad.offset

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
            if (sounds.offline) ClaudeText.SOUNDS_OFFLINE_NOTE else ClaudeText.soundsNote(ticked, sounds.project),
            style = ArcType.small,
            color = c.graphite,
        )
    }
}

/** The PUT ON PADS chip: navy while the ticked sounds go onto the pads, a flat pill while they don't. */
@Composable
private fun PutOnPadsChip(on: Boolean, count: Int, onToggle: () -> Unit) {
    val c = LocalArcColors.current
    Box(
        Modifier
            .heightIn(min = 40.dp)
            .clip(RoundedCornerShape(50))
            .background(if (on) c.navy else c.shell)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Switch, onClick = onToggle)
            .semantics {
                contentDescription = ClaudeText.putOnPadsName(on, count)
                stateDescription = if (on) SettingsText.ON else SettingsText.OFF
            }
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(ClaudeText.PUT_ON_PADS.uppercase(), style = ArcType.capsKeySmall, color = if (on) c.onNavy else c.ink, maxLines = 1)
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
