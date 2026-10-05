package dev.arc.ep133.ui.components

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.min
import dev.arc.ep133.text.CoachText
import dev.arc.ep133.ui.theme.LocalArcColors

/** How much of the screen's right edge the strip takes (its touch area). */
val SideStripWidth = 24.dp

/**
 * A side zone after the pocket operator app's "more tools": a thin hatched
 * strip along the right edge that opens a panel of secondary controls, so the
 * page itself needs no buttons for them. It opens on a tap (an edge swipe
 * would be Android's back gesture). The panel closes on Back, on a tap
 * outside it, or with its close key. Strip and panel keep clear of a
 * navigation bar or cutout on that side.
 */
@Composable
fun SideZone(
    open: Boolean,
    onOpen: () -> Unit,
    onClose: () -> Unit,
    title: String,
    panel: @Composable ColumnScope.() -> Unit,
    /** Where the strip sits on the edge (CenterEnd or TopEnd), and how much of the height it takes. */
    stripAlignment: Alignment = Alignment.CenterEnd,
    stripHeight: Float = 0.5f,
    content: @Composable () -> Unit,
) {
    val c = LocalArcColors.current
    BackHandler(enabled = open, onBack = onClose)
    BoxWithConstraints(Modifier.fillMaxSize()) {
        content()
        // The strip: hatched like the PO's side panels, with a small arrow pointing in.
        Box(
            Modifier
                .align(stripAlignment)
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.End))
                .width(SideStripWidth)
                .fillMaxHeight(stripHeight)
                .coachMark("side.more", CoachText.MORE_TOOLS, c.ink, c.shell)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onOpen)
                .semantics {
                    role = Role.Button
                    contentDescription = title
                },
            contentAlignment = Alignment.CenterEnd,
        ) {
            Box(
                Modifier
                    .width(10.dp)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(topStart = 6.dp, bottomStart = 6.dp))
                    .hatch(c.keyEdge, spacing = 7.dp),
            )
            Canvas(Modifier.align(Alignment.CenterStart).size(8.dp, 12.dp)) {
                drawPath(
                    Path().apply {
                        moveTo(size.width, 0f)
                        lineTo(0f, size.height / 2)
                        lineTo(size.width, size.height)
                        close()
                    },
                    c.graphite,
                )
            }
        }
        AnimatedVisibility(open, enter = fadeIn(), exit = fadeOut()) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(c.scrim)
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClose),
            )
        }
        AnimatedVisibility(
            open,
            modifier = Modifier.align(Alignment.CenterEnd),
            enter = slideInHorizontally { it },
            exit = slideOutHorizontally { it },
        ) {
            Column(
                Modifier
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(topStart = PlateRadius, bottomStart = PlateRadius))
                    .background(c.shell)
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
                    // Its face reaches under a side navigation bar; the close key and controls stay clear of it.
                    .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.End))
                    .width(min(320.dp, maxWidth * 0.85f))
                    .verticalScroll(rememberScrollState())
                    .padding(start = 18.dp, end = 16.dp, top = 12.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Caption(title, Modifier.weight(1f), align = TextAlign.Start)
                    CloseKey(onClose, dev.arc.ep133.text.GuideText.CLOSE)
                }
                panel()
            }
        }
    }
}
