package dev.arc.ep133.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.arc.ep133.controller.NO_LIGHTS
import dev.arc.ep133.controller.Weight
import dev.arc.ep133.features.ClaudePrompt
import dev.arc.ep133.features.FactoryKit
import dev.arc.ep133.features.Feel
import dev.arc.ep133.features.GenreFamily
import dev.arc.ep133.features.Genres
import dev.arc.ep133.features.PlayLevel
import dev.arc.ep133.features.PlayWay
import dev.arc.ep133.features.PromptGoal
import dev.arc.ep133.features.PromptPart
import dev.arc.ep133.features.PromptSlot
import dev.arc.ep133.features.PromptTask
import dev.arc.ep133.features.SavedPrompt
import dev.arc.ep133.features.SharePick
import dev.arc.ep133.text.ClaudeText
import dev.arc.ep133.text.PromptText
import dev.arc.ep133.ui.components.GridPlate
import dev.arc.ep133.ui.components.LinkRow
import dev.arc.ep133.ui.theme.ArcType
import dev.arc.ep133.ui.theme.LocalArcColors

/**
 * Live tools' Claude page as the device's display (an addition): a prompt builder. The glass's tabs pick what to ask
 * (NEW BEAT, IMPROVE, TRACK, PLAY: teach me to play the card, LEARN) and it says the prompt as a sentence whose orange words are its choices (genre,
 * tempo, kit...): a tap on one turns the keys under the glass into its answers ([Answers]). EDIT opens the prompt's
 * own text to change by hand, and SAVED keeps prompts to come back to. A prompt that goes with a card (an IMPROVE, a
 * TRACK from this beat) shows it on the glass as before: SCENE, the pattern (A · 01) and CHAIN pick it (lit navy; one
 * with nothing to share is faded). SOUNDS switches the sound list on (its light orange), SHARE sends the prompt and
 * COPY puts it on the clipboard; under them the wide PASTE CARD brings Claude's card in (held, it opens a .txt or .md
 * card file). While a reply is awaited the glass says so instead.
 */
@Composable
internal fun ClaudeDeck(claude: ClaudeUi, group: Int) {
    val c = LocalArcColors.current
    val prompt = claude.prompt
    val kit = prompt.kit ?: claude.kit
    val g = group.coerceIn(0, 3)
    val number = claude.numbers.getOrElse(g) { 1 }
    val patternEmpty = !claude.hasNotes.getOrElse(g) { false }
    val sceneEmpty = !claude.sceneHasNotes
    var picked by rememberSaveable { mutableStateOf(SharePick.SCENE) }
    // A pick with nothing to share gives way to one that has something (the chain first), else stays.
    val has = mapOf(SharePick.SCENE to !sceneEmpty, SharePick.PATTERN to !patternEmpty, SharePick.CHAIN to claude.hasChain)
    val pick = if (has.getValue(picked)) picked else listOf(SharePick.CHAIN, SharePick.SCENE, SharePick.PATTERN).firstOrNull { has.getValue(it) } ?: picked
    val empty = prompt.withCard && !has.getValue(pick)

    var picking by rememberSaveable { mutableStateOf(claude.picking) }
    var editing by rememberSaveable { mutableStateOf(false) }
    var draft by rememberSaveable { mutableStateOf("") }
    // The word whose answers show: one of this task's, while the sentence is the builder's.
    val slot = picking?.takeIf { it in prompt.slots && prompt.text == null && !editing }
    val sounds = claude.withSounds && claude.sounds > 0 && prompt.task != PromptTask.LEARN
    val built = PromptText.prompt(prompt.copy(text = null), pick, sounds)
    val set = claude.onPrompt

    // EDIT while a reply is awaited still opens the prompt's text.
    if (claude.waiting != null && !editing) {
        WaitingGlass(claude, claude.waiting)
    } else {
        PromptGlass(
            claude, prompt, kit, g, number, pick, empty, slot, sounds,
            editing = editing,
            draft = draft,
            onDraft = { draft = it },
            onTask = { t ->
                set(prompt.withTask(t))
                picking = null
            },
            onSlot = { s -> picking = if (slot == s) null else s },
            onEdit = {
                draft = prompt.text ?: built
                editing = true
            },
        )
    }
    val hint = when {
        editing -> PromptText.HINT_EDITING
        slot != null -> slotHint(slot, prompt)
        prompt.text != null -> PromptText.HINT_EDITED
        prompt.withCard -> PromptText.HINT_CARD
        else -> PromptText.HINT
    }
    Text(hint, style = ArcType.tiny, color = c.graphite, modifier = Modifier.padding(horizontal = 4.dp))

    when {
        editing -> DeckStrip(
            listOf(
                {
                    DeckKey(
                        DeckGlyph.RESET, PromptText.KEY_REBUILD, PromptText.REBUILD_NAME,
                        {
                            set(prompt.copy(text = null))
                            editing = false
                        },
                        enabled = prompt.text != null || draft != built,
                    )
                },
                {
                    DeckKey(
                        DeckGlyph.DONE, PromptText.KEY_DONE, PromptText.KEY_DONE,
                        {
                            // Words left as built, or none, are the builder's again.
                            set(prompt.copy(text = draft.trim().takeIf { it.isNotEmpty() && it != built.trim() }))
                            editing = false
                        },
                        style = DeckStyle.SIGNAL,
                    )
                },
            ),
        )
        slot != null -> Answers(slot, prompt, kit, claude, onDone = { picking = null }, onNext = {
            picking = prompt.slots.getOrNull(prompt.slots.indexOf(slot) + 1)
        })
        else -> {
            val keys = buildList<@Composable RowScope.() -> Unit> {
                if (prompt.withCard) {
                    add {
                        DeckKey(
                            DeckGlyph.SCENE, ClaudeText.KEY_SCENE, ClaudeText.pickScene(claude.scene, sceneEmpty), { picked = SharePick.SCENE },
                            style = if (pick == SharePick.SCENE) DeckStyle.NAVY else DeckStyle.NORMAL, enabled = !sceneEmpty, selected = pick == SharePick.SCENE,
                        )
                    }
                    add {
                        DeckKey(
                            DeckGlyph.PATTERN, ClaudeText.place(g, number), ClaudeText.pickPattern(g, number, patternEmpty), { picked = SharePick.PATTERN },
                            style = if (pick == SharePick.PATTERN) DeckStyle.NAVY else DeckStyle.NORMAL, enabled = !patternEmpty, selected = pick == SharePick.PATTERN,
                        )
                    }
                    add {
                        DeckKey(
                            DeckGlyph.CHAIN, ClaudeText.KEY_CHAIN,
                            if (claude.hasChain) ClaudeText.pickChain(claude.chainScenes) else ClaudeText.NO_CHAIN_TO_SHARE,
                            { picked = SharePick.CHAIN },
                            style = if (pick == SharePick.CHAIN) DeckStyle.NAVY else DeckStyle.NORMAL, enabled = claude.hasChain, selected = pick == SharePick.CHAIN,
                        )
                    }
                }
                if (prompt.task != PromptTask.LEARN) {
                    add {
                        val on = claude.withSounds && claude.sounds > 0
                        DeckKey(
                            DeckGlyph.DOT, ClaudeText.KEY_SOUNDS, ClaudeText.withSoundList(claude.sounds), { claude.onWithSounds(!claude.withSounds) },
                            enabled = claude.sounds > 0, glyphColor = if (on) c.signal else c.keyEdge, checked = on,
                        )
                    }
                }
                // PLAY: practise it here too, on Live's pads, the rest of the beat underneath.
                if (prompt.task == PromptTask.PLAY) {
                    add {
                        DeckKey(DeckGlyph.PLAY, dev.arc.ep133.text.PracticeText.PRACTICE, dev.arc.ep133.text.PracticeText.PRACTICE_NAME, { claude.onPractice(pick, g) }, style = DeckStyle.NAVY, enabled = !empty)
                    }
                }
                // Words of one's own can be dropped for the builder's again.
                if (prompt.text != null) {
                    add { DeckKey(DeckGlyph.RESET, PromptText.KEY_REBUILD, PromptText.REBUILD_NAME, { set(prompt.copy(text = null)) }) }
                }
                add {
                    DeckKey(
                        DeckGlyph.EDIT, PromptText.KEY_EDIT, PromptText.EDIT_NAME,
                        {
                            draft = prompt.text ?: built
                            editing = true
                        },
                    )
                }
                add { DeckKey(DeckGlyph.DUP, PromptText.KEY_COPY, PromptText.COPY_NAME, { claude.onCopy(pick, g) }, enabled = !empty) }
                add {
                    DeckKey(
                        DeckGlyph.SHARE,
                        ClaudeText.KEY_SHARE,
                        if (!prompt.withCard) {
                            ClaudeText.KEY_SHARE
                        } else {
                            when (pick) {
                                SharePick.SCENE -> ClaudeText.shareSceneName(claude.scene, sceneEmpty)
                                SharePick.PATTERN -> ClaudeText.sharePatternName(g, number, patternEmpty)
                                SharePick.CHAIN -> ClaudeText.shareChainName(claude.chainSteps)
                            }
                        },
                        { claude.onShare(pick, g) },
                        enabled = !empty,
                    )
                }
            }
            DeckStrip(keys)
            // What comes back, apart from what goes: Claude's card. Held, it opens a card file (a .txt or .md Claude gave as a file).
            DeckStrip(
                listOf {
                    DeckKey(
                        DeckGlyph.PASTE, PromptText.KEY_PASTE_CARD, PromptText.PASTE_CARD_NAME, claude.onPaste, style = DeckStyle.SIGNAL,
                        onLongClick = claude.onOpenFile, longClickLabel = ClaudeText.OPEN_CARD_FILE,
                    )
                },
            )
            SavedPrompts(claude.saved, prompt, set, claude.onSavePrompt, claude.onDeletePrompt)
            GridPlate { LinkRow(ClaudeText.GET_SKILL, claude.onGetSkill) }
        }
    }
}

private fun slotHint(slot: PromptSlot, p: ClaudePrompt): String = when (slot) {
    PromptSlot.GENRE -> PromptText.hintGenre(Genres.of(p.genre))
    PromptSlot.FEEL -> p.feels.lastOrNull()?.let(PromptText::feelHint) ?: PromptText.HINT_FEEL
    PromptSlot.TEMPO -> PromptText.hintTempo(Genres.of(p.genre))
    PromptSlot.PARTS -> PromptText.HINT_PARTS
    PromptSlot.KIT -> PromptText.HINT_KIT
    PromptSlot.START -> PromptText.HINT_START
    else -> PromptText.HINT_PICK
}

/**
 * The answers to the word being changed, under the glass: genres by family with their tempos, the tempo a step at a
 * time (LIVE takes Live's, ANY leaves it to Claude), the parts to switch in or out, the kits, lengths, asks and lessons.
 * NEXT goes on to the sentence's next word and DONE back to its keys.
 */
@Composable
private fun Answers(slot: PromptSlot, p: ClaudePrompt, kit: FactoryKit, claude: ClaudeUi, onDone: () -> Unit, onNext: () -> Unit) {
    val set = claude.onPrompt
    val genre = Genres.of(p.genre)
    var family by rememberSaveable { mutableStateOf(genre?.family ?: if (kit == FactoryKit.EP40) GenreFamily.RIDDIM else GenreFamily.TECHNO) }
    val extras = ArrayList<@Composable RowScope.() -> Unit>()
    when (slot) {
        PromptSlot.GENRE -> {
            KeyGrid(
                GenreFamily.entries.map { f -> { WordKey(PromptText.family(f), PromptText.family(f), { family = f }, selected = f == family) } },
            )
            KeyGrid(
                Genres.inFamily(family).map { x ->
                    { WordKey(x.short, x.name, { set(p.withGenre(x)) }, sub = "${x.tempo.first}-${x.tempo.last}", selected = x.id == p.genre) }
                },
            )
            extras += { WordKey(PromptText.KEY_ANY, PromptText.ANY_GENRE_NAME, { set(p.withGenre(null)) }, selected = p.genre == null) }
        }
        PromptSlot.TEMPO -> {
            val from = p.tempo ?: genre?.bpm ?: claude.liveTempo
            KeyGrid(
                listOf(-5, -1, 1, 5).map { by ->
                    { WordKey(PromptText.stepTempo(by), PromptText.stepTempoName(by), { set(p.copy(tempo = (from + by).coerceIn(ClaudePrompt.TEMPOS))) }) }
                },
            )
            extras += { WordKey(PromptText.KEY_LIVE, PromptText.liveTempoName(claude.liveTempo), { set(p.copy(tempo = claude.liveTempo)) }, sub = "${claude.liveTempo}", selected = p.tempo == claude.liveTempo) }
            extras += { WordKey(PromptText.KEY_ANY, PromptText.ANY_TEMPO_NAME, { set(p.copy(tempo = null)) }, selected = p.tempo == null) }
        }
        // Up to two feel words, in the order tapped; ANY takes them all off.
        PromptSlot.FEEL -> {
            KeyGrid(Feel.entries.map { f -> { WordKey(PromptText.feel(f), PromptText.feel(f), { set(p.withFeel(f)) }, checked = f in p.feels) } })
            extras += { WordKey(PromptText.KEY_ANY, PromptText.PLAIN, { set(p.copy(feels = emptyList())) }, selected = p.feels.isEmpty()) }
        }
        PromptSlot.BARS -> KeyGrid(ClaudePrompt.BARS.map { n -> { WordKey(PromptText.barsKey(n), PromptText.barsKey(n), { set(p.copy(bars = n)) }, selected = p.bars == n) } })
        PromptSlot.LENGTH -> KeyGrid(ClaudePrompt.LENGTHS.map { n -> { WordKey(PromptText.barsKey(n), PromptText.barsKey(n), { set(p.copy(length = n)) }, selected = p.length == n) } }, columns = 3)
        // The kit Live plays is the prompt's own until another is picked.
        PromptSlot.KIT -> KeyGrid(
            FactoryKit.SHOWN.map { k -> { WordKey(k.model, k.model, { set(p.copy(kit = k.takeIf { it != claude.kit })) }, selected = k == kit) } },
            columns = FactoryKit.SHOWN.size,
        )
        PromptSlot.PARTS -> KeyGrid(
            PromptPart.entries.map { part ->
                {
                    val on = part in p.parts
                    WordKey(PromptText.part(part), PromptText.part(part), { set(p.copy(parts = if (on) p.parts - part else p.parts + part)) }, checked = on)
                }
            },
            columns = PromptPart.entries.size,
        )
        PromptSlot.GOAL -> KeyGrid(PromptGoal.entries.map { x -> { WordKey(PromptText.goalKey(x), PromptText.goal(x), { set(p.copy(goal = x)) }, selected = p.goal == x) } }, columns = 3)
        PromptSlot.EDITS -> KeyGrid(ClaudePrompt.EDITS.map { n -> { WordKey(PromptText.edits(n), PromptText.edits(n), { set(p.copy(edits = n)) }, selected = p.edits == n) } }, columns = 3)
        PromptSlot.START -> KeyGrid(
            listOf(false to PromptText.FROM_SCRATCH_KEY, true to PromptText.FROM_PICK_KEY).map { (from, word) ->
                { WordKey(word, if (from) PromptText.FROM_PICK else PromptText.FROM_SCRATCH, { set(p.copy(fromPick = from)) }, selected = p.fromPick == from) }
            },
            columns = 2,
        )
        PromptSlot.WAY -> KeyGrid(
            PlayWay.entries.map { w -> { WordKey(PromptText.wayKey(w), PromptText.way(w), { set(p.copy(way = w)) }, sub = PromptText.waySub(w), selected = p.way == w) } },
            columns = 2,
        )
        PromptSlot.LEVEL -> KeyGrid(
            PlayLevel.entries.map { l -> { WordKey(PromptText.levelKey(l), PromptText.level(l), { set(p.copy(level = l)) }, selected = p.level == l) } },
            columns = 3,
        )
        PromptSlot.SPEED -> KeyGrid(
            ClaudePrompt.SPEEDS.map { n -> { WordKey(PromptText.speedKey(n), PromptText.speed(n), { set(p.copy(speed = n)) }, sub = PromptText.speed(n), selected = p.speed == n) } },
            columns = 3,
        )
        PromptSlot.LESSON -> KeyGrid(
            (1..ClaudePrompt.LESSONS.size).map { n ->
                { WordKey(PromptText.lessonKey(n), PromptText.lesson(n), { set(p.copy(lesson = n)) }, sub = PromptText.lessonSub(n), selected = p.lesson == n) }
            },
        )
    }
    val last = p.slots.lastOrNull() == slot
    DeckStrip(
        extras + listOfNotNull<@Composable RowScope.() -> Unit>(
            if (last) null else { { DeckKey(DeckGlyph.NEXT, PromptText.KEY_NEXT, PromptText.NEXT_NAME, onNext) } },
            { DeckKey(DeckGlyph.DONE, PromptText.KEY_DONE, PromptText.KEY_DONE, onDone, style = DeckStyle.SIGNAL) },
        ),
    )
}

/**
 * SAVED: the prompts kept, as chips (the one in use lit navy; a tap brings one back, a hold deletes it), and SAVE,
 * which keeps this one (off when it is kept already, or [SavedPrompt.MAX] are).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SavedPrompts(saved: List<SavedPrompt>, prompt: ClaudePrompt, onLoad: (ClaudePrompt) -> Unit, onSave: (ClaudePrompt) -> Unit, onDelete: (Int) -> Unit) {
    val c = LocalArcColors.current
    val full = saved.size >= SavedPrompt.MAX
    val kept = saved.any { it.prompt == prompt }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(PromptText.SAVED.uppercase(), style = ArcType.capsKeySmall.copy(fontSize = 11.sp), color = c.graphite, modifier = Modifier.padding(horizontal = 4.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            saved.forEachIndexed { i, s ->
                val on = s.prompt == prompt
                Text(
                    s.name,
                    style = ArcType.small.copy(fontWeight = FontWeight.Bold, fontSize = 13.sp),
                    color = if (on) c.onNavy else c.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(if (on) c.navy else c.key)
                        .combinedClickable(
                            role = Role.Button,
                            onLongClickLabel = PromptText.DELETE,
                            onLongClick = { onDelete(i) },
                            onClick = { onLoad(s.prompt) },
                        )
                        .semantics { contentDescription = PromptText.savedName(s.name, on) }
                        .heightIn(min = 36.dp)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }
            Text(
                "+ " + PromptText.SAVE,
                style = ArcType.small.copy(fontWeight = FontWeight.Bold, fontSize = 13.sp),
                color = c.ink.copy(alpha = if (full || kept) 0.4f else 1f),
                modifier = Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .border(1.5.dp, c.keyEdge, RoundedCornerShape(16.dp))
                    .clickable(enabled = !full && !kept, role = Role.Button) { onSave(prompt) }
                    .semantics { contentDescription = PromptText.SAVE_NAME }
                    .heightIn(min = 36.dp)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
        if (full && !kept) Text(PromptText.SAVED_FULL, style = ArcType.tiny, color = c.graphite, modifier = Modifier.padding(horizontal = 4.dp))
    }
}

/**
 * The glass while the prompt is built: the tabs, the card a prompt goes with (its name and step lights), then the
 * sentence with its orange words ([slot] lit while its answers show), the prompt's own words once edited, or the text
 * field while EDIT is open. Its foot says when the sound list follows.
 */
@Composable
private fun PromptGlass(
    claude: ClaudeUi,
    prompt: ClaudePrompt,
    kit: FactoryKit,
    g: Int,
    number: Int,
    pick: SharePick,
    empty: Boolean,
    slot: PromptSlot?,
    sounds: Boolean,
    editing: Boolean,
    draft: String,
    onDraft: (String) -> Unit,
    onTask: (PromptTask) -> Unit,
    onSlot: (PromptSlot) -> Unit,
    onEdit: () -> Unit,
) {
    val c = LocalArcColors.current
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(c.display)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Tabs(prompt.task, onTask)
        if (prompt.withCard && !editing) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                val title = when (pick) {
                    SharePick.SCENE -> ClaudeText.sceneTitle(claude.scene)
                    SharePick.PATTERN -> ClaudeText.place(g, number)
                    SharePick.CHAIN -> ClaudeText.CHAIN
                }
                Text(title.uppercase(), style = GlassHead, color = if (empty) c.displayDim else c.displayInk)
                when {
                    empty -> Text((if (pick == SharePick.SCENE) ClaudeText.SCENE_EMPTY else ClaudeText.PATTERN_EMPTY).uppercase(), style = GlassHead, color = c.displayDim)
                    pick == SharePick.CHAIN -> Text(ClaudeText.chainLine(claude.chainScenes, claude.chainSteps).uppercase(), style = GlassHead, color = c.displayDim)
                    pick == SharePick.PATTERN -> LightsRow(g, claude.lights.getOrElse(g) { NO_LIGHTS })
                    else -> for (row in 0 until 4) LightsRow(row, claude.lights.getOrElse(row) { NO_LIGHTS })
                }
            }
        }
        when {
            editing -> BasicTextField(
                draft,
                onDraft,
                textStyle = Own.copy(color = c.displayInk),
                cursorBrush = SolidColor(c.signal),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 120.dp)
                    .border(1.dp, c.displayDim, RoundedCornerShape(8.dp))
                    .padding(10.dp),
            )
            prompt.text != null -> Text(
                prompt.text.orEmpty(),
                style = Own,
                color = c.displayInk,
                maxLines = 8,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth().clickable(role = Role.Button, onClickLabel = PromptText.EDIT_NAME, onClick = onEdit),
            )
            else -> Sentence(prompt, kit, slot, onSlot)
        }
        val foot = listOfNotNull(
            if (sounds) ClaudeText.KEY_SOUNDS.uppercase() + " · ${claude.sounds}" else null,
            if (prompt.text != null || editing) (PromptText.PROMPT + " · " + PromptText.EDITED).uppercase() else null,
        )
        if (foot.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().clearAndSetSemantics {}) {
                Text(foot.first(), style = GlassHead.copy(fontSize = 11.sp), color = c.displayDim, modifier = Modifier.weight(1f))
                foot.getOrNull(1)?.let { Text(it, style = GlassHead.copy(fontSize = 11.sp), color = c.signal) }
            }
        }
    }
}

/** The glass's tabs: the task, picked one lit with an orange dot. */
@Composable
private fun Tabs(task: PromptTask, onTask: (PromptTask) -> Unit) {
    val c = LocalArcColors.current
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, c.segmentOff, RoundedCornerShape(8.dp)),
    ) {
        for (t in PromptTask.entries) {
            val on = t == task
            Box(
                Modifier
                    .weight(1f)
                    .heightIn(min = 36.dp)
                    .background(if (on) c.segmentOff else Color.Transparent)
                    .clickable(role = Role.Tab) { onTask(t) }
                    .semantics {
                        contentDescription = PromptText.taskName(t)
                        selected = on
                        role = Role.Tab
                    },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    (if (on) "● " else "") + PromptText.tab(t).uppercase(),
                    style = GlassHead.copy(fontSize = 10.5.sp, letterSpacing = 0.04.em),
                    color = if (on) c.displayInk else c.displayDim,
                    maxLines = 1,
                )
            }
        }
    }
}

/** The prompt as a sentence: dim words, and orange-underlined ones a tap changes (the [lit] one filled orange). */
@Composable
private fun Sentence(prompt: ClaudePrompt, kit: FactoryKit, lit: PromptSlot?, onSlot: (PromptSlot) -> Unit) {
    val c = LocalArcColors.current
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        for (piece in PromptText.sentence(prompt, kit)) {
            val s = piece.slot
            if (s == null) {
                for (word in piece.text.split(' ')) {
                    Text(word.uppercase(), style = Words, color = c.displayDim, modifier = Modifier.padding(vertical = 4.dp))
                }
            } else {
                val on = s == lit
                Text(
                    piece.text.uppercase(),
                    style = Words,
                    color = if (on) c.onSignal else c.displayInk,
                    maxLines = 1,
                    softWrap = false,
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(if (on) c.signal else Color.Transparent)
                        .clickable(role = Role.Button, onClickLabel = PromptText.CHANGE) { onSlot(s) }
                        .semantics { contentDescription = PromptText.slotName(s, piece.text) }
                        .drawBehind {
                            if (!on) drawLine(c.signal, Offset(0f, size.height - 2.dp.toPx()), Offset(size.width, size.height - 2.dp.toPx()), 2.dp.toPx())
                        }
                        .padding(horizontal = if (on) 4.dp else 0.dp, vertical = 4.dp),
                )
            }
        }
    }
}

/**
 * The glass while Claude's reply is awaited: its head with STOP (stop waiting), what went ("Sent scene S02") and to
 * copy the reply and press PASTE.
 */
@Composable
private fun WaitingGlass(claude: ClaudeUi, waiting: String) {
    val c = LocalArcColors.current
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(c.display)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(Modifier.fillMaxWidth().heightIn(min = 28.dp), verticalAlignment = Alignment.CenterVertically) {
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
        Text(ClaudeText.sent(waiting).uppercase(), style = GlassTitle, color = c.displayInk, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
            Box(Modifier.weight(1f).height(6.dp).clip(RoundedCornerShape(2.dp)).background(color))
        }
    }
}

private val GlassHead = ArcType.displaySub.copy(fontSize = 13.sp, letterSpacing = 0.08.em)
private val GlassTitle = ArcType.displayHead.copy(fontSize = 26.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.06.em, lineHeight = 1.2.em)
private val Words = ArcType.displaySub.copy(fontSize = 17.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.05.em, lineHeight = 22.sp)
private val Own = ArcType.displaySub.copy(fontSize = 14.sp, fontWeight = FontWeight.Normal, lineHeight = 20.sp)
