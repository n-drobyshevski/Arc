package dev.arc.ep133.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.controller.NO_LIGHTS
import dev.arc.ep133.controller.Weight
import dev.arc.ep133.text.ClaudeText
import dev.arc.ep133.ui.components.GridPlate
import dev.arc.ep133.ui.components.LinkRow
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/** What SHARE sends: the scene playing, the shown group's pattern, or the chain. */
private enum class Pick { SCENE, PATTERN, CHAIN }

/**
 * Live tools' Claude page as the device's display (an addition): the glass
 * shows what SHARE sends (the scene's four groups as step lights, the shown
 * [group]'s pattern as one row, or the chain's scenes and steps), or, while a
 * reply is awaited, what went and to paste the reply. Under it the strip:
 * SCENE, the pattern (A · 01) and CHAIN pick what goes (lit navy; one with
 * nothing to share is faded, CHAIN only with a chain), SOUNDS switches the
 * sound list on (its light orange), SHARE sends the pick and PASTE brings a
 * card in. The two links follow.
 */
@Composable
internal fun ClaudeDeck(claude: ClaudeUi, group: Int) {
    val c = LocalArcColors.current
    val g = group.coerceIn(0, 3)
    val number = claude.numbers.getOrElse(g) { 1 }
    val patternEmpty = !claude.hasNotes.getOrElse(g) { false }
    val sceneEmpty = !claude.sceneHasNotes
    var picked by rememberSaveable { mutableStateOf(Pick.SCENE) }
    // A pick with nothing to share gives way to one that has something (the chain first), else stays.
    val has = mapOf(Pick.SCENE to !sceneEmpty, Pick.PATTERN to !patternEmpty, Pick.CHAIN to claude.hasChain)
    val pick = if (has.getValue(picked)) picked else listOf(Pick.CHAIN, Pick.SCENE, Pick.PATTERN).firstOrNull { has.getValue(it) } ?: picked
    val empty = !has.getValue(pick)

    ClaudeGlass(claude, g, number, pick, empty)
    Text(ClaudeText.PICK_HINT, style = ArcType.tiny, color = c.graphite, modifier = Modifier.padding(horizontal = 4.dp))
    val keys = buildList<@Composable RowScope.() -> Unit> {
        add {
            DeckKey(
                DeckGlyph.SCENE, ClaudeText.KEY_SCENE, ClaudeText.pickScene(claude.scene, sceneEmpty), { picked = Pick.SCENE },
                style = if (pick == Pick.SCENE) DeckStyle.NAVY else DeckStyle.NORMAL, enabled = !sceneEmpty, selected = pick == Pick.SCENE,
            )
        }
        add {
            DeckKey(
                DeckGlyph.PATTERN, ClaudeText.place(g, number), ClaudeText.pickPattern(g, number, patternEmpty), { picked = Pick.PATTERN },
                style = if (pick == Pick.PATTERN) DeckStyle.NAVY else DeckStyle.NORMAL, enabled = !patternEmpty, selected = pick == Pick.PATTERN,
            )
        }
        add {
            DeckKey(
                DeckGlyph.CHAIN, ClaudeText.KEY_CHAIN,
                if (claude.hasChain) ClaudeText.pickChain(claude.chainScenes) else ClaudeText.NO_CHAIN_TO_SHARE,
                { picked = Pick.CHAIN },
                style = if (pick == Pick.CHAIN) DeckStyle.NAVY else DeckStyle.NORMAL, enabled = claude.hasChain, selected = pick == Pick.CHAIN,
            )
        }
        add {
            val on = claude.withSounds && claude.sounds > 0
            DeckKey(
                DeckGlyph.DOT, ClaudeText.KEY_SOUNDS, ClaudeText.withSoundList(claude.sounds), { claude.onWithSounds(!claude.withSounds) },
                enabled = claude.sounds > 0, glyphColor = if (on) c.signal else c.keyEdge, checked = on,
            )
        }
        add {
            DeckKey(
                DeckGlyph.SHARE,
                ClaudeText.KEY_SHARE,
                when (pick) {
                    Pick.SCENE -> ClaudeText.shareSceneName(claude.scene, sceneEmpty)
                    Pick.PATTERN -> ClaudeText.sharePatternName(g, number, patternEmpty)
                    Pick.CHAIN -> ClaudeText.shareChainName(claude.chainSteps)
                },
                {
                    when (pick) {
                        Pick.SCENE -> claude.onShareScene()
                        Pick.PATTERN -> claude.onSharePattern(g)
                        Pick.CHAIN -> claude.onShareChain()
                    }
                },
                enabled = !empty,
            )
        }
        add { DeckKey(DeckGlyph.PASTE, ClaudeText.KEY_PASTE, ClaudeText.PASTE_BEAT_NAME, claude.onPaste, style = DeckStyle.SIGNAL) }
    }
    DeckStrip(keys)
    GridPlate { LinkRow(ClaudeText.GET_SKILL, claude.onGetSkill) }
    GridPlate { LinkRow(ClaudeText.LEARN, claude.onLearn) }
}

/**
 * The glass: its head (ready and the sounds the share lists, or a reply
 * awaited with STOP, which stops waiting), what goes large ("Scene S02",
 * "A · 01", "Chain"; "Sent scene S02" while waiting), its preview and, while
 * waiting, to copy Claude's reply and press PASTE.
 */
@Composable
private fun ClaudeGlass(claude: ClaudeUi, g: Int, number: Int, pick: Pick, empty: Boolean) {
    val c = LocalArcColors.current
    val waiting = claude.waiting
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(c.display)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(Modifier.fillMaxWidth().heightIn(min = 28.dp), verticalAlignment = Alignment.CenterVertically) {
            if (waiting == null) {
                Text(ClaudeText.READY.uppercase(), style = GlassHead, color = c.displayDim, modifier = Modifier.weight(1f))
                if (claude.withSounds && claude.sounds > 0) {
                    Text(ClaudeText.KEY_SOUNDS.uppercase() + " · ${claude.sounds}", style = GlassHead, color = c.displayDim)
                }
            } else {
                Text("● " + ClaudeText.WAITING.uppercase(), style = GlassHead, color = c.signal, modifier = Modifier.weight(1f))
                Text(
                    ClaudeText.STOP.uppercase() + "  ×",
                    style = GlassHead,
                    color = c.displayInk,
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .clickable(role = Role.Button, onClick = claude.onDismissWaiting)
                        .semantics { contentDescription = ClaudeText.STOP_WAITING }
                        .heightIn(min = 40.dp)
                        .padding(horizontal = 8.dp, vertical = 10.dp),
                )
            }
        }
        val title = when (pick) {
            Pick.SCENE -> ClaudeText.sceneTitle(claude.scene)
            Pick.PATTERN -> ClaudeText.place(g, number)
            Pick.CHAIN -> ClaudeText.CHAIN
        }
        Text(
            (if (waiting != null) ClaudeText.sent(waiting) else title).uppercase(),
            style = GlassTitle,
            color = if (empty && waiting == null) c.displayDim else c.displayInk,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        when {
            empty -> Text(
                (if (pick == Pick.SCENE) ClaudeText.SCENE_EMPTY else ClaudeText.PATTERN_EMPTY).uppercase(),
                style = GlassHead,
                color = c.displayDim,
            )
            pick == Pick.CHAIN -> Text(ClaudeText.chainLine(claude.chainScenes, claude.chainSteps).uppercase(), style = GlassHead, color = c.displayDim)
            pick == Pick.PATTERN -> LightsRow(g, claude.lights.getOrElse(g) { NO_LIGHTS })
            else -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (row in 0 until 4) LightsRow(row, claude.lights.getOrElse(row) { NO_LIGHTS })
            }
        }
        if (waiting != null) {
            Text(
                ClaudeText.COPY_THEN_PASTE.uppercase(),
                style = GlassHead,
                color = c.signal,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .padding(top = 4.dp)
                    .fillMaxWidth()
                    .border(1.dp, c.signal, RoundedCornerShape(8.dp))
                    .padding(horizontal = 12.dp, vertical = 12.dp),
            )
        }
    }
}

/** A group's first bar as 16 lights after its letter: ghost notes dim, normal ones lit, accents orange. */
@Composable
private fun LightsRow(group: Int, lights: List<Weight?>) {
    val c = LocalArcColors.current
    Row(Modifier.fillMaxWidth().clearAndSetSemantics {}, verticalAlignment = Alignment.CenterVertically) {
        Text(('A' + group).toString(), style = GlassHead.copy(fontSize = 11.sp), color = c.displayDim, modifier = Modifier.width(18.dp))
        lights.forEachIndexed { i, w ->
            // A wider gap between beats, as the device's lights are grouped.
            if (i > 0) Box(Modifier.width(if (i % 4 == 0) 6.dp else 3.dp))
            val color: Color = when (w) {
                null -> c.segmentOff
                Weight.GHOST -> c.displayDim
                Weight.NORMAL -> c.displayInk
                Weight.ACCENT -> c.signal
            }
            Box(Modifier.weight(1f).height(7.dp).clip(RoundedCornerShape(2.dp)).background(color))
        }
    }
}

private val GlassHead = ArcType.displaySub.copy(fontSize = 13.sp, letterSpacing = 0.08.em)
private val GlassTitle = ArcType.displayHead.copy(fontSize = 26.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.06.em, lineHeight = 1.2.em)
