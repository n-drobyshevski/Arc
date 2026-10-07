package dev.arc.ep133.ui.screens

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.text.MirrorText
import dev.arc.ep133.text.Strings
import dev.arc.ep133.ui.components.ArcKey
import dev.arc.ep133.ui.components.KeyStyle
import dev.arc.ep133.ui.components.LocalHwColors
import dev.arc.ep133.ui.components.cap
import dev.arc.ep133.ui.components.capPress
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/** The sheet's keys in the EP-133's keypad order, 7 8 9 over 4 5 6 over 1 2 3. */
private val KeypadRows = listOf(listOf(7, 8, 9), listOf(4, 5, 6), listOf(1, 2, 3))

/**
 * PROJECT held (an addition): projects 1 to 9 as dark keys in the keypad's
 * order, as the EP-133 picks a project with its pads. The project shown is
 * orange; the ones Live can't go to now ([ProjectChoice.enabled], as
 * [projectChoicesOf] says) are greyed out. A pick goes to [onPick] and the
 * sheet closes ([onDone]).
 */
@Composable
fun ColumnScope.ProjectSheetContent(choices: List<ProjectChoice>, onPick: (Int) -> Unit, onDone: () -> Unit) {
    val c = LocalArcColors.current
    val byN = choices.associateBy { it.n }
    Text(MirrorText.PROJECT_TITLE, style = ArcType.heading, color = c.ink)
    Column(
        Modifier.fillMaxWidth().widthIn(max = 420.dp).align(Alignment.CenterHorizontally).padding(bottom = 4.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        for (row in KeypadRows) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                for (n in row) {
                    val choice = byN[n] ?: ProjectChoice(n, enabled = false, shown = false)
                    ProjectPick(choice, Modifier.weight(1f)) {
                        onPick(n)
                        onDone()
                    }
                }
            }
        }
    }
    ArcKey(Strings.DONE, onDone, Modifier.fillMaxWidth(), style = KeyStyle.Quiet)
}

/** One project on the sheet: its number on a dark cap, orange while shown, greyed when it can't be picked. */
@Composable
private fun ProjectPick(choice: ProjectChoice, modifier: Modifier, onPick: () -> Unit) {
    val c = LocalArcColors.current
    val hw = LocalHwColors.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val face = if (choice.shown) c.signal else hw.darkFace
    val edge = if (choice.shown) c.signalEdge else hw.darkEdge
    Box(
        modifier
            .height(64.dp)
            .cap(face, edge, RoundedCornerShape(8.dp), capPress(pressed && choice.enabled), alpha = if (choice.enabled || choice.shown) 1f else 0.45f)
            .selectable(
                selected = choice.shown,
                enabled = choice.enabled,
                role = Role.Button,
                interactionSource = source,
                indication = null,
                onClick = onPick,
            )
            .semantics { contentDescription = MirrorText.projectChoice(choice.n, choice.shown) },
        contentAlignment = Alignment.TopStart,
    ) {
        Text(
            choice.n.toString(),
            style = ArcType.statFree.copy(fontSize = 26.sp, lineHeight = 1.em),
            color = if (choice.shown) c.onSignal else hw.darkInk,
            modifier = Modifier.padding(start = 12.dp, top = 8.dp),
        )
    }
}
