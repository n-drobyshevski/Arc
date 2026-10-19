// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/ClaudeDeck.kt (ClaudeDeck, slotHint, Answers, SavedPrompts,
// PromptGlass, Tabs, Sentence, WaitingGlass, LightsRow)
//
// Live tools' Claude page as the device's display (an addition): a prompt
// builder. The glass's tabs pick what to ask (NEW BEAT, IMPROVE, TRACK, PLAY:
// teach me to play the card, LEARN) and it says the prompt as a sentence whose
// orange words are its choices (genre, tempo, kit...): a tap on one turns the
// keys under the glass into its answers ([Answers]). EDIT opens the prompt's
// own text to change by hand, and SAVED keeps prompts to come back to. A
// prompt that goes with a card (an IMPROVE, a TRACK from this beat) shows it
// on the glass: SCENE, the pattern (A · 01) and CHAIN pick it (lit navy; one
// with nothing to share is faded). SOUNDS switches the sound list on (its
// light orange), SHARE sends the prompt and COPY puts it on the clipboard;
// under them the wide PASTE CARD brings Claude's card in (held, it opens a
// .txt or .md card file). While a reply is awaited the glass says so instead.
//
// Web deltas:
// - A chunk of its own (ClaudeSection's lazy deck), with the prompt builder's
//   genres and words: the prompt comes as kept (AppSettings.claudePrompt) and
//   is decoded here, as MainActivity decodes it for ClaudeUi.
// - PLAY's PRACTICE key comes with PRACTICE on Live (not ported yet): PLAY
//   builds and shares the prompt only.
// - The tabs are a tablist: the arrow keys, Home and End move along them.
//   Each takes the width its word needs from an equal share, so the lit
//   ● IMPROVE fits a narrow sheet.
// - The focus follows the keys that go: EDIT's box takes it as it opens, and
//   EDIT gets it back on DONE or REBUILD; DONE under the answers gives it back
//   to the word they changed.
// - PASTE CARD's hold is a second (a pointer, or Enter or Space), and "Open a
//   card file" stays as a link under it, so the file is a tap away too.
// - A saved prompt is deleted by a hold of a second, or the Delete key.
// - The GET THE SKILL link downloads the skill's zip (a link, where Android
//   opens it).
import type { JSX } from 'preact'
import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks'
import {
  ClaudePrompt,
  FEELS,
  GENRE_FAMILIES,
  GenreFamily,
  Genres,
  PLAY_LEVELS,
  PLAY_WAYS,
  PROMPT_GOALS,
  PROMPT_PARTS,
  PROMPT_TASKS,
  PromptSlot,
  PromptTask,
  SavedPrompt,
  SharePick,
} from '../../core/features/claudePrompt'
import { FactoryKit } from '../../core/features/factorySounds'
import { ClaudeText } from '../../core/text/claudeText'
import { CoachText } from '../../core/text/coachText'
import { PromptText } from '../../core/text/promptText'
import { WebText } from '../../core/text/webText'
import type { Weight } from '../../state/beatPlan'
import { NO_LIGHTS } from '../../state/scenePlan'
import { HOLD_MS } from '../components/IconBlock'
import { Key } from '../components/Key'
import { RowCard } from '../components/SettingRow'
import type { ClaudeActions } from './ClaudeSection'
import { DeckKey, DeckStrip, KeyGrid, WordKey, useHold } from './DeckKeys'
import './ClaudeDeck.css'

/** Live tools' Claude page for [group] (the group shown, as the pattern's key names it). */
export function ClaudeDeck(props: { claude: ClaudeActions; group: number }): JSX.Element {
  const { claude } = props
  const code = claude.prompt
  const prompt = useMemo(() => ClaudePrompt.decode(code), [code])
  const savedCode = claude.saved
  const saved = useMemo(() => SavedPrompt.decodeAll(savedCode), [savedCode])
  const kit = prompt.kit ?? claude.kit
  const g = Math.min(Math.max(props.group, 0), 3)
  const number = claude.numbers[g] ?? 1
  const patternEmpty = !(claude.hasNotes[g] ?? false)
  const sceneEmpty = !claude.hasNotes.some((h) => h)
  const hasChain = claude.chainSteps > 0
  const [picked, setPicked] = useState<SharePick>(SharePick.SCENE)
  // A pick with nothing to share gives way to one that has something (the chain first), else stays.
  const has: Readonly<Record<SharePick, boolean>> = { SCENE: !sceneEmpty, PATTERN: !patternEmpty, CHAIN: hasChain }
  const pick = has[picked] ? picked : ([SharePick.CHAIN, SharePick.SCENE, SharePick.PATTERN].find((p) => has[p]) ?? picked)
  const withCard = ClaudePrompt.withCard(prompt)
  const empty = withCard && !has[pick]

  const [picking, setPicking] = useState<PromptSlot | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  // The word whose answers show: one of this task's, while the sentence is the builder's.
  const slots = ClaudePrompt.slots(prompt)
  const slot = picking !== null && slots.includes(picking) && prompt.text === null && !editing ? picking : null
  const sounds = claude.withSounds && claude.sounds > 0 && prompt.task !== PromptTask.LEARN
  const built = PromptText.prompt({ ...prompt, text: null }, pick, sounds)
  const set = claude.onPrompt

  // Where the focus goes once the keys under the glass have changed (web).
  const focusNext = useRef<(() => HTMLElement | null | undefined) | null>(null)
  const glassRef = useRef<HTMLDivElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const doneRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const find = focusNext.current
    if (find === null) return
    focusNext.current = null
    find()?.focus()
  })
  const pasteHint = useId()

  const openEdit = (): void => {
    setDraft(prompt.text ?? built)
    setEditing(true)
    focusNext.current = () => glassRef.current?.querySelector('textarea')
  }
  const closeEdit = (next: ClaudePrompt): void => {
    set(next)
    setEditing(false)
    focusNext.current = () => editRef.current
  }

  // EDIT while a reply is awaited still opens the prompt's text.
  const glass =
    claude.waiting !== null && !editing ? (
      <WaitingGlass claude={claude} waiting={claude.waiting} />
    ) : (
      <PromptGlass
        claude={claude}
        prompt={prompt}
        kit={kit}
        g={g}
        number={number}
        pick={pick}
        empty={empty}
        slot={slot}
        sounds={sounds}
        editing={editing}
        draft={draft}
        onDraft={setDraft}
        onTask={(t) => {
          set(ClaudePrompt.withTask(prompt, t))
          setPicking(null)
        }}
        onSlot={(s) => setPicking(slot === s ? null : s)}
        onEdit={openEdit}
        glassRef={glassRef}
      />
    )
  const hint = editing
    ? PromptText.HINT_EDITING
    : slot !== null
      ? slotHint(slot, prompt)
      : prompt.text !== null
        ? PromptText.HINT_EDITED
        : withCard
          ? PromptText.HINT_CARD
          : PromptText.HINT

  let under: JSX.Element
  if (editing) {
    under = (
      <DeckStrip
        keys={[
          <DeckKey
            key="rebuild"
            glyph="reset"
            label={PromptText.KEY_REBUILD}
            description={PromptText.REBUILD_NAME}
            onClick={() => closeEdit({ ...prompt, text: null })}
            enabled={prompt.text !== null || draft !== built}
          />,
          <DeckKey
            key="done"
            glyph="done"
            label={PromptText.KEY_DONE}
            description={PromptText.KEY_DONE}
            // Words left as built, or none, are the builder's again.
            onClick={() => {
              const t = draft.trim()
              closeEdit({ ...prompt, text: t !== '' && t !== built.trim() ? t : null })
            }}
            style="signal"
          />,
        ]}
      />
    )
  } else if (slot !== null) {
    under = (
      <Answers
        slot={slot}
        p={prompt}
        kit={kit}
        claude={claude}
        nextRef={nextRef}
        doneRef={doneRef}
        onDone={() => {
          setPicking(null)
          focusNext.current = () => glassRef.current?.querySelector<HTMLElement>(`[data-slot="${slot}"]`)
        }}
        onNext={() => {
          const next = slots[slots.indexOf(slot) + 1] ?? null
          setPicking(next)
          // The next word is the last: NEXT goes, DONE takes the focus.
          if (next !== null && slots.at(-1) === next) focusNext.current = () => doneRef.current
        }}
      />
    )
  } else {
    const soundsOn = claude.withSounds && claude.sounds > 0
    const keys: JSX.Element[] = []
    if (withCard) {
      keys.push(
        <DeckKey
          key="scene"
          glyph="scene"
          label={ClaudeText.KEY_SCENE}
          description={ClaudeText.pickScene(claude.scene, sceneEmpty)}
          onClick={() => setPicked(SharePick.SCENE)}
          style={pick === SharePick.SCENE ? 'navy' : 'normal'}
          enabled={!sceneEmpty}
          selected={pick === SharePick.SCENE}
        />,
        <DeckKey
          key="pattern"
          glyph="pattern"
          label={ClaudeText.place(g, number)}
          description={ClaudeText.pickPattern(g, number, patternEmpty)}
          onClick={() => setPicked(SharePick.PATTERN)}
          style={pick === SharePick.PATTERN ? 'navy' : 'normal'}
          enabled={!patternEmpty}
          selected={pick === SharePick.PATTERN}
        />,
        <DeckKey
          key="chain"
          glyph="chain"
          label={ClaudeText.KEY_CHAIN}
          description={hasChain ? ClaudeText.pickChain(claude.chainScenes) : ClaudeText.NO_CHAIN_TO_SHARE}
          onClick={() => setPicked(SharePick.CHAIN)}
          style={pick === SharePick.CHAIN ? 'navy' : 'normal'}
          enabled={hasChain}
          selected={pick === SharePick.CHAIN}
        />,
      )
    }
    if (prompt.task !== PromptTask.LEARN) {
      keys.push(
        <DeckKey
          key="sounds"
          glyph="dot"
          label={ClaudeText.KEY_SOUNDS}
          description={ClaudeText.withSoundList(claude.sounds)}
          onClick={() => claude.onWithSounds(!claude.withSounds)}
          enabled={claude.sounds > 0}
          glyphColor={soundsOn ? 'var(--signal)' : 'var(--key-edge)'}
          checked={soundsOn}
        />,
      )
    }
    // Words of one's own can be dropped for the builder's again.
    if (prompt.text !== null) {
      keys.push(
        <DeckKey key="rebuild" glyph="reset" label={PromptText.KEY_REBUILD} description={PromptText.REBUILD_NAME} onClick={() => set({ ...prompt, text: null })} />,
      )
    }
    keys.push(
      <DeckKey key="edit" glyph="edit" label={PromptText.KEY_EDIT} description={PromptText.EDIT_NAME} onClick={openEdit} keyRef={editRef} />,
      <DeckKey key="copy" glyph="dup" label={PromptText.KEY_COPY} description={PromptText.COPY_NAME} onClick={() => claude.onCopy(pick, g)} enabled={!empty} />,
      <DeckKey
        key="share"
        glyph="share"
        label={ClaudeText.KEY_SHARE}
        description={
          !withCard
            ? ClaudeText.KEY_SHARE
            : pick === SharePick.SCENE
              ? ClaudeText.shareSceneName(claude.scene, sceneEmpty)
              : pick === SharePick.PATTERN
                ? ClaudeText.sharePatternName(g, number, patternEmpty)
                : ClaudeText.shareChainName(claude.chainSteps)
        }
        onClick={() => claude.onShare(pick, g)}
        enabled={!empty}
      />,
    )
    under = (
      <>
        <DeckStrip keys={keys} />
        {/* What comes back, apart from what goes: Claude's card. Held, it opens a card file (a .txt or .md Claude gave as a file). */}
        <DeckStrip
          keys={[
            <DeckKey
              key="paste"
              glyph="paste"
              label={PromptText.KEY_PASTE_CARD}
              description={PromptText.PASTE_CARD_NAME}
              onClick={claude.onPaste}
              style="signal"
              onHold={claude.onOpenFile}
              describedBy={pasteHint}
            />,
          ]}
        />
        <span id={pasteHint} class="sr-only">
          {WebText.HOLD_PASTE_CARD}
        </span>
        <Key text={ClaudeText.OPEN_CARD_FILE} size="small" block variant="quiet" onClick={claude.onOpenFile} />
        <SavedPrompts saved={saved} prompt={prompt} onLoad={set} onSave={claude.onSavePrompt} onDelete={claude.onDeletePrompt} />
        {/* A link, not LinkRow's button: the zip downloads. */}
        <RowCard>
          <a class="setting-row link-row claude__link" href="/arc-beats-skill.zip" download>
            <span class="setting-row__line">
              <span class="setting-row__text">
                <span class="setting-row__title">{ClaudeText.GET_SKILL}</span>
              </span>
            </span>
          </a>
        </RowCard>
      </>
    )
  }
  return (
    <>
      {glass}
      <p class="t-tiny claude__hint">{hint}</p>
      {under}
    </>
  )
}

function slotHint(slot: PromptSlot, p: ClaudePrompt): string {
  switch (slot) {
    case PromptSlot.GENRE:
      return PromptText.hintGenre(Genres.of(p.genre))
    case PromptSlot.FEEL: {
      const last = p.feels.at(-1)
      return last !== undefined ? PromptText.feelHint(last) : PromptText.HINT_FEEL
    }
    case PromptSlot.TEMPO:
      return PromptText.hintTempo(Genres.of(p.genre))
    case PromptSlot.PARTS:
      return PromptText.HINT_PARTS
    case PromptSlot.KIT:
      return PromptText.HINT_KIT
    case PromptSlot.START:
      return PromptText.HINT_START
    default:
      return PromptText.HINT_PICK
  }
}

const clampTempo = (n: number): number => Math.min(Math.max(n, ClaudePrompt.TEMPOS.first), ClaudePrompt.TEMPOS.last)

/**
 * The answers to the word being changed, under the glass: genres by family
 * with their tempos, the tempo a step at a time (LIVE takes Live's, ANY
 * leaves it to Claude), the parts to switch in or out, the kits, lengths,
 * asks and lessons. NEXT goes on to the sentence's next word and DONE back to
 * its keys.
 */
function Answers(props: {
  slot: PromptSlot
  p: ClaudePrompt
  kit: FactoryKit
  claude: ClaudeActions
  nextRef: { current: HTMLButtonElement | null }
  doneRef: { current: HTMLButtonElement | null }
  onDone: () => void
  onNext: () => void
}): JSX.Element {
  const { slot, p, kit, claude } = props
  const set = claude.onPrompt
  const genre = Genres.of(p.genre)
  const [family, setFamily] = useState<GenreFamily>(genre?.family ?? (kit === FactoryKit.EP40 ? GenreFamily.RIDDIM : GenreFamily.TECHNO))
  const label = PromptText.slot(slot)
  const extras: JSX.Element[] = []
  let grids: JSX.Element | null = null
  switch (slot) {
    case PromptSlot.GENRE:
      grids = (
        <>
          <KeyGrid
            keys={GENRE_FAMILIES.map((f) => (
              <WordKey key={f} label={PromptText.family(f)} description={PromptText.family(f)} onClick={() => setFamily(f)} selected={f === family} />
            ))}
          />
          <KeyGrid
            label={label}
            keys={Genres.inFamily(family).map((x) => (
              <WordKey
                key={x.id}
                label={x.short}
                description={x.name}
                onClick={() => set(ClaudePrompt.withGenre(p, x))}
                sub={`${x.tempo.first}-${x.tempo.last}`}
                selected={x.id === p.genre}
              />
            ))}
          />
        </>
      )
      extras.push(
        <WordKey key="any" label={PromptText.KEY_ANY} description={PromptText.ANY_GENRE_NAME} onClick={() => set(ClaudePrompt.withGenre(p, null))} selected={p.genre === null} />,
      )
      break
    case PromptSlot.TEMPO: {
      const from = p.tempo ?? genre?.bpm ?? claude.liveTempo
      grids = (
        <KeyGrid
          label={label}
          keys={[-5, -1, 1, 5].map((by) => (
            <WordKey key={by} label={PromptText.stepTempo(by)} description={PromptText.stepTempoName(by)} onClick={() => set({ ...p, tempo: clampTempo(from + by) })} />
          ))}
        />
      )
      extras.push(
        <WordKey
          key="live"
          label={PromptText.KEY_LIVE}
          description={PromptText.liveTempoName(claude.liveTempo)}
          onClick={() => set({ ...p, tempo: claude.liveTempo })}
          sub={`${claude.liveTempo}`}
          selected={p.tempo === claude.liveTempo}
        />,
        <WordKey key="any" label={PromptText.KEY_ANY} description={PromptText.ANY_TEMPO_NAME} onClick={() => set({ ...p, tempo: null })} selected={p.tempo === null} />,
      )
      break
    }
    // Up to two feel words, in the order tapped; ANY takes them all off.
    case PromptSlot.FEEL:
      grids = (
        <KeyGrid
          label={label}
          keys={FEELS.map((f) => (
            <WordKey key={f} label={PromptText.feel(f)} description={PromptText.feel(f)} onClick={() => set(ClaudePrompt.withFeel(p, f))} checked={p.feels.includes(f)} />
          ))}
        />
      )
      extras.push(<WordKey key="any" label={PromptText.KEY_ANY} description={PromptText.PLAIN} onClick={() => set({ ...p, feels: [] })} selected={p.feels.length === 0} />)
      break
    case PromptSlot.BARS:
      grids = (
        <KeyGrid
          label={label}
          keys={ClaudePrompt.BARS.map((n) => (
            <WordKey key={n} label={PromptText.barsKey(n)} description={PromptText.barsKey(n)} onClick={() => set({ ...p, bars: n })} selected={p.bars === n} />
          ))}
        />
      )
      break
    case PromptSlot.LENGTH:
      grids = (
        <KeyGrid
          label={label}
          columns={3}
          keys={ClaudePrompt.LENGTHS.map((n) => (
            <WordKey key={n} label={PromptText.barsKey(n)} description={PromptText.barsKey(n)} onClick={() => set({ ...p, length: n })} selected={p.length === n} />
          ))}
        />
      )
      break
    // The kit Live plays is the prompt's own until another is picked.
    case PromptSlot.KIT:
      grids = (
        <KeyGrid
          label={label}
          columns={FactoryKit.SHOWN.length}
          keys={FactoryKit.SHOWN.map((k) => (
            <WordKey key={k.id} label={k.model} description={k.model} onClick={() => set({ ...p, kit: k !== claude.kit ? k : null })} selected={k === kit} />
          ))}
        />
      )
      break
    case PromptSlot.PARTS:
      grids = (
        <KeyGrid
          label={label}
          columns={PROMPT_PARTS.length}
          keys={PROMPT_PARTS.map((part) => {
            const on = p.parts.has(part)
            const next = new Set(p.parts)
            if (on) next.delete(part)
            else next.add(part)
            return <WordKey key={part} label={PromptText.part(part)} description={PromptText.part(part)} onClick={() => set({ ...p, parts: next })} checked={on} />
          })}
        />
      )
      break
    case PromptSlot.GOAL:
      grids = (
        <KeyGrid
          label={label}
          columns={3}
          keys={PROMPT_GOALS.map((x) => (
            <WordKey key={x} label={PromptText.goalKey(x)} description={PromptText.goal(x)} onClick={() => set({ ...p, goal: x })} selected={p.goal === x} />
          ))}
        />
      )
      break
    case PromptSlot.EDITS:
      grids = (
        <KeyGrid
          label={label}
          columns={3}
          keys={ClaudePrompt.EDITS.map((n) => (
            <WordKey key={n} label={PromptText.edits(n)} description={PromptText.edits(n)} onClick={() => set({ ...p, edits: n })} selected={p.edits === n} />
          ))}
        />
      )
      break
    case PromptSlot.START:
      grids = (
        <KeyGrid
          label={label}
          columns={2}
          keys={([[false, PromptText.FROM_SCRATCH_KEY], [true, PromptText.FROM_PICK_KEY]] as const).map(([from, word]) => (
            <WordKey
              key={word}
              label={word}
              description={from ? PromptText.FROM_PICK : PromptText.FROM_SCRATCH}
              onClick={() => set({ ...p, fromPick: from })}
              selected={p.fromPick === from}
            />
          ))}
        />
      )
      break
    case PromptSlot.WAY:
      grids = (
        <KeyGrid
          label={label}
          columns={2}
          keys={PLAY_WAYS.map((w) => (
            <WordKey key={w} label={PromptText.wayKey(w)} description={PromptText.way(w)} onClick={() => set({ ...p, way: w })} sub={PromptText.waySub(w)} selected={p.way === w} />
          ))}
        />
      )
      break
    case PromptSlot.LEVEL:
      grids = (
        <KeyGrid
          label={label}
          columns={3}
          keys={PLAY_LEVELS.map((l) => (
            <WordKey key={l} label={PromptText.levelKey(l)} description={PromptText.level(l)} onClick={() => set({ ...p, level: l })} selected={p.level === l} />
          ))}
        />
      )
      break
    case PromptSlot.SPEED:
      grids = (
        <KeyGrid
          label={label}
          columns={3}
          keys={ClaudePrompt.SPEEDS.map((n) => (
            <WordKey key={n} label={PromptText.speedKey(n)} description={PromptText.speed(n)} onClick={() => set({ ...p, speed: n })} sub={PromptText.speed(n)} selected={p.speed === n} />
          ))}
        />
      )
      break
    case PromptSlot.LESSON:
      grids = (
        <KeyGrid
          label={label}
          keys={ClaudePrompt.LESSONS.map((_, i) => (
            <WordKey
              key={i}
              label={PromptText.lessonKey(i + 1)}
              description={PromptText.lesson(i + 1)}
              onClick={() => set({ ...p, lesson: i + 1 })}
              sub={PromptText.lessonSub(i + 1)}
              selected={p.lesson === i + 1}
            />
          ))}
        />
      )
      break
  }
  const last = ClaudePrompt.slots(p).at(-1) === slot
  const keys = [...extras]
  if (!last) keys.push(<DeckKey key="next" glyph="next" label={PromptText.KEY_NEXT} description={PromptText.NEXT_NAME} onClick={props.onNext} keyRef={props.nextRef} />)
  keys.push(<DeckKey key="done" glyph="done" label={PromptText.KEY_DONE} description={PromptText.KEY_DONE} onClick={props.onDone} style="signal" keyRef={props.doneRef} />)
  return (
    <>
      {grids}
      <DeckStrip keys={keys} />
    </>
  )
}

/**
 * SAVED: the prompts kept, as chips (the one in use lit navy; a tap brings one
 * back, a hold deletes it), and SAVE, which keeps this one (off when it is kept
 * already, or SavedPrompt.MAX are).
 */
function SavedPrompts(props: {
  saved: readonly SavedPrompt[]
  prompt: ClaudePrompt
  onLoad: (p: ClaudePrompt) => void
  onSave: (p: ClaudePrompt) => void
  onDelete: (index: number) => void
}): JSX.Element {
  const { saved, prompt } = props
  const full = saved.length >= SavedPrompt.MAX
  const kept = saved.some((s) => ClaudePrompt.equals(s.prompt, prompt))
  const titleId = useId()
  const holdId = useId()
  return (
    <div class="claude-saved" role="group" aria-labelledby={titleId}>
      <p id={titleId} class="claude-saved__title">
        {PromptText.SAVED}
      </p>
      <span id={holdId} class="sr-only">
        {WebText.HOLD_SAVED_PROMPT}
      </span>
      <div class="claude-saved__chips">
        {saved.map((s, i) => (
          <SavedChip
            key={`${i}:${s.name}`}
            name={s.name}
            on={ClaudePrompt.equals(s.prompt, prompt)}
            describedBy={holdId}
            onLoad={() => props.onLoad(s.prompt)}
            onDelete={() => props.onDelete(i)}
          />
        ))}
        <button
          type="button"
          class="claude-saved__chip claude-saved__save"
          aria-label={PromptText.SAVE_NAME}
          disabled={full || kept}
          onClick={() => props.onSave(prompt)}
        >
          {`+ ${PromptText.SAVE}`}
        </button>
      </div>
      {full && !kept && <p class="t-tiny claude__hint">{PromptText.SAVED_FULL}</p>}
    </div>
  )
}

/** A saved prompt's chip: a tap brings it back, a hold (or Delete) deletes it. */
function SavedChip(props: { name: string; on: boolean; describedBy: string; onLoad: () => void; onDelete: () => void }): JSX.Element {
  const hold = useHold(props.onDelete, props.onLoad, true)
  return (
    <button
      type="button"
      class={`claude-saved__chip${props.on ? ' is-on' : ''}`}
      aria-label={PromptText.savedName(props.name, props.on)}
      aria-describedby={props.describedBy}
      {...hold.handlers}
      onKeyDown={(e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          props.onDelete()
          return
        }
        hold.handlers.onKeyDown?.(e)
      }}
      onClick={() => {
        if (hold.swallow()) return
        props.onLoad()
      }}
    >
      <span class="claude-saved__name">{props.name}</span>
      {hold.holding && <span class="deck-key__hold" style={{ animationDuration: `${HOLD_MS}ms` }} aria-hidden="true" />}
    </button>
  )
}

/**
 * The glass while the prompt is built: the tabs, the card a prompt goes with
 * (its name and step lights), then the sentence with its orange words ([slot]
 * lit while its answers show), the prompt's own words once edited, or the
 * text box while EDIT is open. Its foot says when the sound list follows.
 */
function PromptGlass(props: {
  claude: ClaudeActions
  prompt: ClaudePrompt
  kit: FactoryKit
  g: number
  number: number
  pick: SharePick
  empty: boolean
  slot: PromptSlot | null
  sounds: boolean
  editing: boolean
  draft: string
  onDraft: (s: string) => void
  onTask: (t: PromptTask) => void
  onSlot: (s: PromptSlot) => void
  onEdit: () => void
  glassRef: { current: HTMLDivElement | null }
}): JSX.Element {
  const { claude, prompt, g, pick, empty, editing } = props
  const title = pick === SharePick.SCENE ? ClaudeText.sceneTitle(claude.scene) : pick === SharePick.PATTERN ? ClaudeText.place(g, props.number) : ClaudeText.CHAIN
  const foot = [
    props.sounds ? `${ClaudeText.KEY_SOUNDS} · ${claude.sounds}` : null,
    prompt.text !== null || editing ? `${PromptText.PROMPT} · ${PromptText.EDITED}` : null,
  ].filter((x) => x !== null)
  return (
    <div
      ref={props.glassRef}
      class="claude-glass claude-glass--prompt"
      data-coach="live.claude"
      data-coach-label={CoachText.CLAUDE}
      data-coach-face="var(--navy)"
      data-coach-ink="var(--on-navy)"
    >
      <Tabs task={prompt.task} onTask={props.onTask} />
      {ClaudePrompt.withCard(prompt) && !editing && (
        <div class="claude-glass__card">
          <p class={`claude-glass__sub${empty ? '' : ' is-ink'}`}>{title}</p>
          {empty ? (
            <p class="claude-glass__sub">{pick === SharePick.SCENE ? ClaudeText.SCENE_EMPTY : ClaudeText.PATTERN_EMPTY}</p>
          ) : pick === SharePick.CHAIN ? (
            <p class="claude-glass__sub">{ClaudeText.chainLine(claude.chainScenes, claude.chainSteps)}</p>
          ) : pick === SharePick.PATTERN ? (
            <LightsRow group={g} lights={claude.lights[g] ?? NO_LIGHTS} />
          ) : (
            [0, 1, 2, 3].map((row) => <LightsRow key={row} group={row} lights={claude.lights[row] ?? NO_LIGHTS} />)
          )}
        </div>
      )}
      {editing ? (
        <textarea
          class="claude-glass__box"
          aria-label={WebText.PROMPT_BOX}
          value={props.draft}
          onInput={(e) => props.onDraft(e.currentTarget.value)}
        />
      ) : prompt.text !== null ? (
        <button type="button" class="claude-glass__own" title={PromptText.EDIT_NAME} onClick={props.onEdit}>
          {prompt.text}
        </button>
      ) : (
        <Sentence prompt={prompt} kit={props.kit} lit={props.slot} onSlot={props.onSlot} />
      )}
      {foot.length > 0 && (
        <div class="claude-glass__foot" aria-hidden="true">
          <span class="claude-glass__sub claude-glass__grow">{foot[0]}</span>
          {foot[1] !== undefined && <span class="claude-glass__sub is-signal">{foot[1]}</span>}
        </div>
      )}
    </div>
  )
}

/** The glass's tabs: the task, the picked one lit with an orange dot. */
function Tabs(props: { task: PromptTask; onTask: (t: PromptTask) => void }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  // The arrow keys, Home and End pick along the tabs, the focus with them (web).
  const onKeyDown = (e: KeyboardEvent): void => {
    const i = PROMPT_TASKS.indexOf(props.task)
    const n = PROMPT_TASKS.length
    const to = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null
    if (to === null) return
    e.preventDefault()
    props.onTask(PROMPT_TASKS[to]!)
    ref.current?.querySelectorAll<HTMLElement>('[role="tab"]')[to]?.focus()
  }
  return (
    <div ref={ref} class="claude-tabs" role="tablist" onKeyDown={onKeyDown}>
      {PROMPT_TASKS.map((t) => {
        const on = t === props.task
        return (
          <button
            key={t}
            type="button"
            role="tab"
            class={`claude-tabs__tab${on ? ' is-on' : ''}`}
            aria-selected={on}
            aria-label={PromptText.taskName(t)}
            tabIndex={on ? 0 : -1}
            onClick={() => props.onTask(t)}
          >
            {(on ? '● ' : '') + PromptText.tab(t)}
          </button>
        )
      })}
    </div>
  )
}

/** The prompt as a sentence: dim words, and orange-underlined ones a tap changes (the [lit] one filled orange). */
function Sentence(props: { prompt: ClaudePrompt; kit: FactoryKit; lit: PromptSlot | null; onSlot: (s: PromptSlot) => void }): JSX.Element {
  return (
    <p class="claude-sentence">
      {PromptText.sentence(props.prompt, props.kit).map((piece, i) => {
        const s = piece.slot
        if (s === null) {
          return piece.text.split(' ').map((word, j) => (
            <span key={`${i}.${j}`} class="claude-sentence__word">
              {word}
            </span>
          ))
        }
        const on = s === props.lit
        return (
          <button
            key={`${i}:${s}`}
            type="button"
            class={`claude-sentence__slot${on ? ' is-lit' : ''}`}
            data-slot={s}
            aria-label={PromptText.slotName(s, piece.text)}
            aria-expanded={on}
            title={PromptText.CHANGE}
            onClick={() => props.onSlot(s)}
          >
            {piece.text}
          </button>
        )
      })}
    </p>
  )
}

/**
 * The glass while Claude's reply is awaited: its head with STOP (stop
 * waiting), what went ("Sent scene S02") and to copy the reply and press PASTE.
 */
function WaitingGlass(props: { claude: ClaudeActions; waiting: string }): JSX.Element {
  return (
    <div
      class="claude-glass"
      data-coach="live.claude"
      data-coach-label={CoachText.CLAUDE}
      data-coach-face="var(--navy)"
      data-coach-ink="var(--on-navy)"
    >
      <div class="claude-glass__head">
        <span class="claude-glass__sub claude-glass__grow is-signal">{`● ${ClaudeText.WAITING}`}</span>
        <button type="button" class="claude-glass__sub claude-glass__stop" aria-label={ClaudeText.STOP_WAITING} onClick={props.claude.onDismissWaiting}>
          {`${ClaudeText.STOP}  ×`}
        </button>
      </div>
      <p class="claude-glass__title">{ClaudeText.sent(props.waiting)}</p>
      <p class="claude-glass__sub claude-glass__paste">{ClaudeText.COPY_THEN_PASTE}</p>
    </div>
  )
}

/** A group's first bar as 16 lights after its letter: ghost notes dim, normal ones lit, accents orange. */
function LightsRow(props: { group: number; lights: readonly (Weight | null)[] }): JSX.Element {
  return (
    <div class="claude-lights" aria-hidden="true">
      <span class="claude-lights__letter">{String.fromCharCode(65 + props.group)}</span>
      {props.lights.map((w, i) => (
        // A wider gap between beats, as the device's lights are grouped.
        <span key={i} class={`claude-lights__step${i > 0 && i % 4 === 0 ? ' is-beat' : ''}${w === null ? '' : ` is-${w.toLowerCase()}`}`} />
      ))}
    </div>
  )
}
