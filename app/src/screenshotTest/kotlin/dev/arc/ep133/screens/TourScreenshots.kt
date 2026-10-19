package dev.arc.ep133.screens

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.android.tools.screenshot.PreviewTest
import dev.arc.ep133.controller.MirrorUi
import dev.arc.ep133.features.MirrorState
import dev.arc.ep133.features.TourStep
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.ui.components.ArcShell
import dev.arc.ep133.ui.components.Tab
import dev.arc.ep133.ui.components.TourActions
import dev.arc.ep133.ui.components.TourHost
import dev.arc.ep133.ui.components.TourUi
import dev.arc.ep133.ui.screens.GuideScreen
import dev.arc.ep133.ui.screens.MirrorScreen
import dev.arc.ep133.ui.theme.ArcTheme

/*
 * "Try arc" on Live, a card per step, as a new install sees it: one group,
 * the veil cut away around what the step is about.
 *
 * These render one frame. The spotlit control reports where it is only after
 * that frame's layout, so a card next to a control (CONNECT, PAD, HEAR, BACKUP)
 * shows where a card without one goes; on a phone it moves into place on the
 * next frame, under the overlay's fade. Where it lands is TourPlaceTest's.
 */

/** Live under the tour; [connected] false shows it as before the EP-133 is connected. */
@Composable
private fun TourOnLive(ui: TourUi, connected: Boolean = true, state: MirrorState = lastRead, dark: Boolean = false) {
    ArcTheme(dark = dark) {
        TourHost(tour = ui, actions = TourActions(), onBack = {}, coach = false, onCoachDismiss = {}) {
            ArcShell(
                tab = Tab.LIVE, onTab = {},
                connected = connected, canConnect = true, canBackup = connected,
                onBackup = {}, onConnect = {}, onDebug = {}, onSettings = {}, onHelp = {},
                guideOpen = false, onGuide = {},
                guide = { GuideScreen(onBack = {}) },
            ) {
                MirrorScreen(
                    mirror = if (connected) MirrorUi(state) else MirrorUi(loading = false, error = MirrorText.NOT_CONNECTED),
                    nameOf = { names[it] },
                    onPadOrder = {},
                    fixedNow = NOW,
                    oneGroup = true,
                    onPad = { _, _ -> },
                )
            }
        }
    }
}

@PreviewTest
@Preview(name = "Tour welcome", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun TourWelcomePreview() = TourOnLive(TourUi(TourStep.WELCOME), connected = false)

@PreviewTest
@Preview(name = "Tour welcome back", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun TourResumePreview() = TourOnLive(TourUi(TourStep.WELCOME, resumed = true, resumeAt = 3), connected = false)

@PreviewTest
@Preview(name = "Tour restore", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun TourRestorePreview() = TourOnLive(TourUi(TourStep.RESTORE), connected = false)

@PreviewTest
@Preview(name = "Tour connect", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun TourConnectPreview() = TourOnLive(TourUi(TourStep.CONNECT, plugged = true), connected = false)

@PreviewTest
@Preview(name = "Tour connect ticked", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun TourConnectTickedPreview() = TourOnLive(TourUi(TourStep.CONNECT, plugged = true, connected = true))

// The EP-133 went away during a step that needs it: the card asks to connect again.
@PreviewTest
@Preview(name = "Tour needs device", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun TourNeedsDevicePreview() = TourOnLive(TourUi(TourStep.BACKUP, needsConnect = true), connected = false)

@PreviewTest
@Preview(name = "Tour pad", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun TourPadPreview() = TourOnLive(TourUi(TourStep.PAD, connected = true, canBackup = true))

@PreviewTest
@Preview(name = "Tour pad dark", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun TourPadDarkPreview() = TourOnLive(TourUi(TourStep.PAD, connected = true, canBackup = true), dark = true)

// The kick lit on the device; holding it through the cut-out plays it here.
@PreviewTest
@Preview(name = "Tour hear", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun TourHearPreview() = TourOnLive(TourUi(TourStep.HEAR, connected = true, canPlay = true), state = playing)

@PreviewTest
@Preview(name = "Tour backup", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun TourBackupPreview() = TourOnLive(TourUi(TourStep.BACKUP, connected = true, canBackup = true))

@PreviewTest
@Preview(name = "Tour done", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun TourDonePreview() = TourOnLive(TourUi(TourStep.DONE, laterNote = true))

@PreviewTest
@Preview(name = "Tour needs MIDI", widthDp = 393, heightDp = 852, showBackground = true)
@Composable
fun TourNeedsMidiPreview() = TourOnLive(TourUi(TourStep.MIDI, midi = false), connected = false)

// A small phone, landscape, and large text: the card moves, shortens or scrolls.

@PreviewTest
@Preview(name = "Tour hear small", widthDp = 360, heightDp = 668, showBackground = true)
@Composable
fun TourHearSmallPreview() = TourOnLive(TourUi(TourStep.HEAR, connected = true, canPlay = true), state = playing)

@PreviewTest
@Preview(name = "Tour pad landscape", widthDp = 640, heightDp = 360, showBackground = true)
@Composable
fun TourPadLandscapePreview() = TourOnLive(TourUi(TourStep.PAD, connected = true, canBackup = true))

@PreviewTest
@Preview(name = "Tour connect large text", widthDp = 393, heightDp = 852, fontScale = 1.5f, showBackground = true)
@Composable
fun TourConnectLargeTextPreview() = TourOnLive(TourUi(TourStep.CONNECT, plugged = true), connected = false)
