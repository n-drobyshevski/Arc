package dev.arc.ep133.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.DragInteraction
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.layout.onPlaced
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.arc.ep133.controller.UiState
import dev.arc.ep133.data.AppSettings
import dev.arc.ep133.features.NoteNames
import dev.arc.ep133.features.PadOrder
import dev.arc.ep133.features.Piano
import dev.arc.ep133.text.FeatureText
import dev.arc.ep133.text.Format
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.text.SettingsText
import dev.arc.ep133.text.Strings
import dev.arc.ep133.text.ThemeChoice
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.Caption
import dev.arc.ep133.ui.components.CloseKey
import dev.arc.ep133.ui.components.GridPlate
import dev.arc.ep133.ui.components.KeySize
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.LinkRow
import dev.arc.ep133.ui.components.LocalArcWindow
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.PlateLine
import dev.arc.ep133.ui.components.Segmented
import dev.arc.ep133.ui.components.SettingRow
import dev.arc.ep133.ui.components.SwitchRow
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors
import kotlinx.coroutines.launch

/**
 * The settings (an addition to the web version): theme, connecting, the
 * screen in Live, how many backups to keep, Live's pad numbering, note names,
 * piano size and haptic feedback, what arc keeps on the phone, and about arc. Each setting is
 * one row (name, short note, control; an info key for the long note), rows
 * grouped in plates. On a phone the plates are one scroll; on a wide window a
 * list of the sections sits on the left, its LED on the section in view.
 */
@Composable
fun SettingsScreen(
    settings: AppSettings,
    state: UiState,
    padOrder: PadOrder,
    version: String,
    onTheme: (ThemeChoice) -> Unit,
    onAutoConnect: (Boolean) -> Unit,
    onKeepScreenOn: (Boolean) -> Unit,
    /** How many backups a new Keep value would delete now. */
    pruneCount: (Int?) -> Int,
    onKeepLast: (Int?) -> Unit,
    onPadOrder: (PadOrder) -> Unit,
    onForgetNames: () -> Unit,
    onRestoreFolder: () -> Unit,
    /** Space taken by Live's copies of the pad sounds. */
    padSoundsSize: suspend () -> Long = { 0L },
    onClearPadSounds: () -> Unit = {},
    onNoteNames: (NoteNames) -> Unit = {},
    onShowNames: (Boolean) -> Unit = {},
    onPianoWhites: (Int?) -> Unit = {},
    onHaptics: (Boolean) -> Unit = {},
    onSource: () -> Unit,
    onFontLicence: () -> Unit,
    onDebug: () -> Unit,
    onBack: () -> Unit,
) {
    val c = LocalArcColors.current
    val window = LocalArcWindow.current
    BackHandler(onBack = onBack)
    // The pad order is shown from here on (Live keeps its own copy).
    var order by remember(padOrder) { mutableStateOf(padOrder) }
    // A Keep value that would delete backups, waiting for the confirmation.
    var confirmKeep by rememberSaveable { mutableStateOf<Int?>(null) }
    var confirmForget by rememberSaveable { mutableStateOf(false) }
    // Read when the page opens; Clear sets it to nothing.
    var soundsSize by remember { mutableStateOf<Long?>(null) }
    LaunchedEffect(Unit) { soundsSize = padSoundsSize() }
    // The piano sizes Live's room on its side has space for (the widest the piano gets).
    val pianoRoom = sidewaysRoom(window).value

    val sections = listOf(
        Section(SettingsText.APPEARANCE) {
            GridPlate {
                SettingRow(SettingsText.THEME) {
                    Segmented(
                        ThemeChoice.entries.map(SettingsText::theme),
                        selected = settings.theme.ordinal,
                        onSelect = { onTheme(ThemeChoice.entries[it]) },
                        compact = true,
                    )
                }
            }
        },
        Section(SettingsText.DEVICE) {
            GridPlate {
                SwitchRow(SettingsText.AUTO_CONNECT, SettingsText.AUTO_CONNECT_NOTE, settings.autoConnect, onAutoConnect)
                PlateLine()
                SwitchRow(SettingsText.KEEP_SCREEN_ON, SettingsText.KEEP_SCREEN_ON_NOTE, settings.keepScreenOn, onKeepScreenOn)
            }
        },
        Section(SettingsText.LIBRARY) {
            GridPlate {
                LinkRow(FeatureText.RESTORE_FOLDER, onRestoreFolder, note = FeatureText.FOLDER_NOTE)
                PlateLine()
                SettingRow(SettingsText.KEEP, note = SettingsText.KEEP_SHORT, info = SettingsText.KEEP_NOTE) {
                    Segmented(
                        SettingsText.KEEP_CHOICES.map(SettingsText::keepLabel),
                        selected = SettingsText.KEEP_CHOICES.indexOf(settings.keepLast).coerceAtLeast(0),
                        onSelect = { i ->
                            val keep = SettingsText.KEEP_CHOICES[i]
                            // Fewer than are saved now deletes the oldest: ask first.
                            if (keep != null && pruneCount(keep) > 0) confirmKeep = keep else onKeepLast(keep)
                        },
                        compact = true,
                    )
                }
            }
            val note = Strings.storageNote(state.backups.size, state.backups.sumOf { it.size }, state.spaceLeft)
            if (note.isNotEmpty()) Text(note, style = ArcType.small, color = c.graphite, modifier = Modifier.padding(horizontal = 4.dp))
        },
        Section(SettingsText.LIVE) {
            GridPlate {
                SettingRow(MirrorText.PAD_ORDER, info = MirrorText.ORDER_NOTE) {
                    Segmented(
                        listOf(MirrorText.FROM_TOP_SHORT, MirrorText.FROM_BOTTOM_SHORT),
                        selected = order.ordinal,
                        onSelect = { i ->
                            order = PadOrder.entries[i]
                            onPadOrder(order)
                        },
                        compact = true,
                        descriptions = listOf(MirrorText.FROM_TOP, MirrorText.FROM_BOTTOM),
                    )
                }
                PlateLine()
                SettingRow(MirrorText.NOTE_NAMES, note = SettingsText.NOTE_NAMES_SHORT, info = MirrorText.NOTE_NAMES_NOTE) {
                    Segmented(
                        NoteNames.entries.map(MirrorText::noteNames),
                        selected = settings.keysNames.ordinal,
                        onSelect = { onNoteNames(NoteNames.entries[it]) },
                        compact = true,
                    )
                }
                PlateLine()
                SwitchRow(MirrorText.SHOW_NAMES, SettingsText.SHOW_NAMES_SHORT, settings.keysShowNames, onShowNames, info = MirrorText.SHOW_NAMES_NOTE)
                PlateLine()
                val choices = SettingsText.PIANO_CHOICES
                SettingRow(SettingsText.PIANO_KEYS, note = SettingsText.PIANO_KEYS_SHORT, info = SettingsText.PIANO_KEYS_NOTE) {
                    Segmented(
                        choices.map(SettingsText::pianoKeys),
                        selected = choices.indexOf(settings.pianoWhites).coerceAtLeast(0),
                        onSelect = { onPianoWhites(choices[it]) },
                        compact = true,
                        // A size Live's room can't hold is greyed out (Auto always fits).
                        enabled = choices.map { it == null || Piano.fits(pianoRoom, it) },
                        descriptions = choices.map { w ->
                            SettingsText.pianoKeysDescription(w) + if (w != null && !Piano.fits(pianoRoom, w)) ". " + SettingsText.DOESNT_FIT else ""
                        },
                    )
                }
                PlateLine()
                SwitchRow(SettingsText.HAPTICS, SettingsText.HAPTICS_NOTE, settings.haptics, onHaptics)
            }
        },
        Section(SettingsText.SAVED_HERE) {
            // Forgetting and clearing can't be undone: a group of its own, outlined, its actions red.
            GridPlate(outline = c.danger.copy(alpha = 0.45f)) {
                SettingRow(SettingsText.LEARNED_NAMES, note = SettingsText.LEARNED_NAMES_SHORT) {
                    ArcKey(SettingsText.FORGET, { confirmForget = true }, size = KeySize.Small, style = KeyStyle.Quiet, textColor = c.danger)
                }
                PlateLine()
                SettingRow(SettingsText.padSoundsShort(Format.bytes(soundsSize ?: 0L)), note = SettingsText.PAD_SOUNDS_SHORT_NOTE) {
                    ArcKey(
                        SettingsText.CLEAR,
                        {
                            onClearPadSounds()
                            soundsSize = 0L
                        },
                        size = KeySize.Small,
                        style = KeyStyle.Quiet,
                        textColor = c.danger,
                        enabled = (soundsSize ?: 0L) > 0L,
                    )
                }
            }
        },
        Section(SettingsText.ABOUT) {
            GridPlate {
                SettingRow(SettingsText.version(version), note = SettingsText.LICENCE_NOTE)
                PlateLine()
                LinkRow(SettingsText.SOURCE, onSource)
                PlateLine()
                LinkRow(SettingsText.FONT_LICENCE, onFontLicence)
                PlateLine()
                LinkRow(SettingsText.DEBUG_LOG, onDebug)
            }
        },
    )

    Box(Modifier.fillMaxSize().background(c.shell), contentAlignment = Alignment.TopCenter) {
        if (window.width >= WideSettings) {
            WideSettings(sections, onBack)
        } else {
            Column(
                Modifier
                    // The sides first, so the column centres between them; the top and bottom inside the
                    // scroll, so the page still scrolls on under the bars.
                    .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal))
                    .widthIn(max = 560.dp)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Caption(SettingsText.TITLE)
                    CloseKey(onBack, SettingsText.CLOSE, Modifier.align(Alignment.CenterEnd))
                }
                for (s in sections) {
                    SectionTitle(s.title)
                    s.content(this)
                }
            }
        }
    }

    confirmKeep?.let { keep ->
        Confirm(
            text = SettingsText.pruneConfirm(pruneCount(keep)),
            action = SettingsText.PRUNE,
            onConfirm = {
                confirmKeep = null
                onKeepLast(keep)
            },
            onDismiss = { confirmKeep = null },
        )
    }
    if (confirmForget) {
        Confirm(
            text = SettingsText.FORGET_CONFIRM,
            action = SettingsText.FORGET,
            onConfirm = {
                confirmForget = false
                onForgetNames()
            },
            onDismiss = { confirmForget = false },
        )
    }
}

/** From this window width the sections are listed on the left of the page. */
private val WideSettings = 720.dp

private class Section(val title: String, val content: @Composable ColumnScope.() -> Unit)

/**
 * The wide layout: the section list on the left (a tap scrolls to its
 * section; the LED follows the one in view), the plates on the right.
 */
@Composable
private fun WideSettings(sections: List<Section>, onBack: () -> Unit) {
    val c = LocalArcColors.current
    val scroll = rememberScrollState()
    val scope = rememberCoroutineScope()
    // Where each section starts in the scrolled column (the first at the top until they are placed).
    val tops = remember { mutableStateListOf<Int>().apply { repeat(sections.size) { add(if (it == 0) 0 else Int.MAX_VALUE) } } }
    // A section picked from the list stays marked until the page is dragged (the last ones
    // may not scroll up to the top).
    var picked by remember { mutableStateOf<Int?>(null) }
    LaunchedEffect(scroll) {
        scroll.interactionSource.interactions.collect { if (it is DragInteraction.Start) picked = null }
    }
    val spy by remember { derivedStateOf { inView(scroll, tops) } }
    val current = picked ?: spy
    Row(
        Modifier
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal + WindowInsetsSides.Top))
            .widthIn(max = 1040.dp)
            .fillMaxSize()
            .padding(start = 16.dp, end = 16.dp, top = 12.dp),
    ) {
        Column(
            Modifier
                .width(220.dp)
                .fillMaxHeight()
                .verticalScroll(rememberScrollState())
                .padding(end = 14.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(Modifier.fillMaxWidth().padding(start = 12.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Caption(SettingsText.TITLE, Modifier.weight(1f), align = TextAlign.Start)
                CloseKey(onBack, SettingsText.CLOSE)
            }
            sections.forEachIndexed { i, s ->
                NavItem(s.title, on = i == current) {
                    picked = i
                    scope.launch { scroll.animateScrollTo(tops[i]) }
                }
            }
        }
        // The line between the list and the page.
        Spacer(Modifier.fillMaxHeight().width(1.dp).background(c.line.copy(alpha = 0.12f)))
        Column(
            Modifier
                .weight(1f)
                .fillMaxHeight()
                .verticalScroll(scroll)
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom))
                .padding(start = 24.dp, end = 8.dp, top = 6.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            sections.forEachIndexed { i, s ->
                SectionTitle(s.title, Modifier.onPlaced { tops[i] = it.positionInParent().y.toInt() }, first = i == 0)
                s.content(this)
            }
        }
    }
}

/** The section in view: the last one whose title has scrolled up to the top (the last one at the end). */
private fun inView(scroll: ScrollState, tops: List<Int>): Int {
    if (scroll.maxValue > 0 && scroll.value >= scroll.maxValue) return tops.lastIndex
    return tops.indexOfLast { it <= scroll.value + 24 }.coerceAtLeast(0)
}

/** One section in the wide layout's list: an LED (lit for the section in view) and its name. */
@Composable
private fun NavItem(text: String, on: Boolean, onClick: () -> Unit) {
    val c = LocalArcColors.current
    val hw = LocalHwColors.current
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(if (on) c.plate else androidx.compose.ui.graphics.Color.Transparent)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Tab, onClick = onClick)
            .semantics { selected = on }
            .heightIn(min = 44.dp)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            Modifier
                .size(7.dp)
                .drawBehind {
                    if (on) drawCircle(c.signal.copy(alpha = 0.35f), radius = size.minDimension)
                    drawCircle(if (on) c.signal else hw.ledOff)
                },
        )
        Text(text, style = ArcType.semi, color = c.ink)
    }
}

@Composable
private fun SectionTitle(text: String, modifier: Modifier = Modifier, first: Boolean = false) {
    Caption(text, modifier.padding(top = if (first) 0.dp else 18.dp, start = 4.dp), align = TextAlign.Start)
}

@Composable
private fun Confirm(text: String, action: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    val c = LocalArcColors.current
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = c.shell,
        text = { Text(text, style = ArcType.body15, color = c.ink) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(action, style = ArcType.bold, color = c.danger) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(Strings.CANCEL, style = ArcType.bold, color = c.graphite) } },
    )
}
