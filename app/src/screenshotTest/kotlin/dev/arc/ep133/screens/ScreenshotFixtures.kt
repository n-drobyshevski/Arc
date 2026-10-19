package dev.arc.ep133.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.DpRect
import dev.arc.ep133.controller.DeviceSummary
import dev.arc.ep133.controller.UiState
import dev.arc.ep133.features.Hit
import dev.arc.ep133.features.MirrorState
import dev.arc.ep133.features.PadLight
import dev.arc.ep133.features.PadOrder
import dev.arc.ep133.features.PhysicalPad
import dev.arc.ep133.protocol.DeviceInfo
import dev.arc.ep133.protocol.Storage
import dev.arc.ep133.text.BackupDevice
import dev.arc.ep133.text.BackupRecord
import dev.arc.ep133.text.SkinChoice
import dev.arc.ep133.ui.components.ArcShell
import dev.arc.ep133.ui.components.ArcToast
import dev.arc.ep133.ui.components.BarSlot
import dev.arc.ep133.ui.components.CoachHost
import dev.arc.ep133.ui.components.LateKey
import dev.arc.ep133.ui.components.LocalArcWindow
import dev.arc.ep133.ui.components.LocalBarSlot
import dev.arc.ep133.ui.components.SampleKey
import dev.arc.ep133.ui.components.Tab
import dev.arc.ep133.ui.screens.GuideScreen
import dev.arc.ep133.ui.screens.liveInBar
import dev.arc.ep133.ui.theme.ArcTheme

/*
 * Sample states shared by the screenshot files (no device). The sound names
 * are made up for the picture.
 */

internal val names = mapOf(
    PhysicalPad(0, 9) to "kick", PhysicalPad(0, 10) to "kick 2", PhysicalPad(0, 11) to "snare",
    PhysicalPad(0, 6) to "hat closed", PhysicalPad(0, 7) to "hat open", PhysicalPad(0, 8) to "clap",
    PhysicalPad(0, 3) to "rim", PhysicalPad(0, 4) to "tom low", PhysicalPad(0, 0) to "perc",
    PhysicalPad(1, 9) to "bass c1", PhysicalPad(1, 10) to "bass d1", PhysicalPad(2, 4) to "vox chop",
    PhysicalPad(3, 9) to "stab", PhysicalPad(3, 3) to "riser",
)

internal const val NOW = 10_000_000_000L

internal val playing = MirrorState(
    pads = mapOf(
        PhysicalPad(0, 9) to PadLight(124, 1, NOW - 20_000_000),
        PhysicalPad(0, 6) to PadLight(70, 1, NOW - 90_000_000, offAt = NOW - 120_000_000),
        PhysicalPad(1, 9) to PadLight(100, 1, NOW - 10_000_000),
        PhysicalPad(2, 4) to PadLight(90, 1, NOW - 200_000_000, offAt = NOW - 60_000_000),
    ),
    keysHeld = mapOf(74 to 1, 77 to 1),
    lastKeysNote = 77,
    lastHit = Hit(PhysicalPad(0, 9), 45, 1, 124, 1, "kick"),
    playing = true,
    bpm = 122.0,
    activeProject = 3,
    learned = (0..11).associateWith { it + 1 },
    pushesSeen = true,
    padOrder = PadOrder.FROM_TOP,
)

/**
 * A section as the app shows it: the top bar with its section tag, and the guide tab on the left edge.
 * On a phone on its side Live's display line ([pill]) rides in the top bar, as MainActivity puts it.
 */
@Composable
internal fun Framed(
    tab: Tab,
    connected: Boolean = true,
    dark: Boolean = false,
    skin: SkinChoice = SkinChoice.EP133,
    guide: Boolean = false,
    menu: Boolean = false,
    guideOpen: Boolean = false,
    pill: (@Composable BoxScope.() -> Unit)? = null,
    /** A toast showing, and (in a short window) where the bar's middle is: the bar reports it a frame late. */
    toast: String? = null,
    barMiddle: DpRect? = null,
    /** The toast's action key ("UNDO"). */
    toastAction: String? = null,
    /** Live's mic key in the top bar, as MainActivity has it on Live (here unlit unless given). */
    sample: SampleKey? = if (tab == Tab.LIVE) SampleKey(false) {} else null,
    /** Live's Bluetooth key in the top bar, while the sound goes to Bluetooth. */
    late: LateKey? = null,
    /** The connection key's ring part-way, as while it is held. */
    holdProgress: Float = 0f,
    content: @Composable () -> Unit,
) {
    ArcTheme(dark = dark, skin = skin) {
        val density = LocalDensity.current
        val slot = LocalBarSlot.current
        val placed = remember(barMiddle) {
            barMiddle?.let { m -> BarSlot().apply { bounds = with(density) { Rect(m.left.toPx(), m.top.toPx(), m.right.toPx(), m.bottom.toPx()) } } }
        }
        CompositionLocalProvider(LocalBarSlot provides (placed ?: slot)) {
            Box(Modifier.fillMaxSize()) {
                CoachHost(visible = guide, onDismiss = {}) {
                    ArcShell(
                        tab = tab, onTab = {},
                        connected = connected, canConnect = true,
                        onConnect = {}, onDisconnect = {}, onHint = {}, haptics = false, onDebug = {}, onSettings = {}, onHelp = {},
                        guideOpen = guideOpen, onGuide = {},
                        guide = { GuideScreen(onBack = {}) },
                        middle = pill.takeIf { tab == Tab.LIVE && liveInBar(LocalArcWindow.current) },
                        initialMenuOpen = menu,
                        sample = sample,
                        late = late,
                        holdProgress = holdProgress,
                        content = content,
                    )
                }
                ArcToast(
                    id = toast?.let { 1L }, text = toast.orEmpty(), error = false, onTimeout = {}, modifier = Modifier.align(Alignment.BottomCenter),
                    action = toastAction, onAction = toastAction?.let { { } },
                )
            }
        }
    }
}

// Not connected: the pads and names as arc last read them, nothing lit.
internal val lastRead = MirrorState(activeProject = 3, learned = (0..11).associateWith { it + 1 })

internal val device = BackupDevice("EP-133", "TE032AS001", "", "2.5.1")

internal fun backup(id: String, title: String, at: Long, sounds: Int, projects: Int) = BackupRecord(
    id, title, "", at, "device", null, device, sounds, projects, (1..projects).toList(), (1..sounds).toList(), emptyMap(), 48_000_000L,
)

internal val connectedState = UiState(
    connected = true,
    device = DeviceSummary(DeviceInfo("EP-133", "TE032AS001", "2.5.1", "", ""), Storage(64e6, 21e6, 43e6), 212, 6),
    backups = listOf(
        backup("1", "Before the gig", 1_791_000_000_000L, 212, 6),
        backup("2", "Backup Oct 2", 1_790_700_000_000L, 198, 5),
        backup("3", "Jam with Ana", 1_790_100_000_000L, 187, 4),
    ),
    freshId = "1",
    libraryLoaded = true,
)
