// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/LiveClaude.kt (BeatImportSheetContent)
//
// A beat card's sheet: the card's name and what is in it, a read-only grid for
// each section (a row for each pad with notes, cells lit by how hard it is
// hit; the first two bars of a long pattern), where each section goes, the new
// scene a card of several groups adds, its tempo (SET sets it: off until
// chosen; the row says "136 → 85" while on, "136 · card 85" while off), its swing, and its problems with their lines (COPY PROBLEMS copies
// them for Claude). When the card has sound or synth lines a SOUNDS block
// follows the rows: a line for each, ticked to be put on its pad (PUT ON PADS
// switches them all); a synth line no slot holds says "Make 808 kick", with a
// play key ([onPlaySynth]), and IMPORT makes it. A card that plays pads with no sound has a SILENT PADS block
// before the sounds (amber): a row for each, with PICK SOUND, which swaps the
// sheet for the pad sheet's sound list (live/SoundPicker: find, hundreds,
// preview). A pick doesn't touch the pad: it adds a ticked row to SOUNDS
// (nothing to something) that IMPORT puts on the pad with the card's own
// sounds, in the same UNDO step; the silent row then says "→ 512 PIANO" with
// a CHANGE key. A card with FX lines has an FX block before the silent pads:
// a row for each kind it sets, the project's struck through and the card's
// after it, with APPLY FX (on to begin with). Its `pad` lines are a PAD
// SHAPING block after the sounds: a row for each pad, each setting old to
// new, ticked; a pad a new sound is going onto starts from the defaults.
// A card of scenes draws each scene's grids under its title, and the plate
// has a row for each scene ("Scene 1 · Drop" over "new S03 · A 04 · B
// (same)") and one for its chain on the new scenes, with SET CHAIN (on to
// begin with; the note under the plate says what it does). With no room for
// the scenes the sheet says so, and shows no chain. A card that adds scenes
// has a Scenes row first, with REPLACE ([replaceScenes], a setting kept for
// the next card): off, "After S05", its scenes follow the project's; on,
// "Replace S01–S05", they take their place from S01, and the scene rows, the
// new scene and the chain say where they go then, with a line under the plate.
// IMPORT puts it all in as one UNDO step; it is off, and says why, when the
// card can't be read or a group is full. [onImport] gets whether the tempo
// is to be set, the pads whose sounds are to be put on, the sounds picked
// for silent pads, whether the FX are applied, the pads to shape and
// whether the card's chain is set.
//
// Web deltas:
// - The grid's cells are spans in a row that scrolls sideways when long,
//   where Kotlin draws them on a Canvas.
// - [pasting]: PASTE BEAT where the page may not read the clipboard shows a
//   box a paste goes into instead (WebText.PASTE_HERE), before any card.
// - A sound row is a checkbox button (Kotlin's toggleable row); the picker's
//   pad is named by its label on a small cap, not the device view's PadCap.
// - Opening the picker focuses its title and leaving it focuses the pad's
//   PICK SOUND / CHANGE key again, as the upload sheet's trim view does.
// - The sheet's switches (SET, PUT ON PADS, APPLY FX, SET CHAIN, REPLACE) are a
//   role="switch" button on theme/cap.css's cap, pressed by :active.
// - A synth row's play key sits beside its checkbox button, not inside it,
//   so its label names the sound ("Play 808 kick").
// - The sounds Arc suggests for silent pads are the picks while nothing is
//   chosen yet ([choices] null), so they follow the card planned again until
//   then; Kotlin keeps the first plan's.
// - A pad shaping row is a checkbox button like a sound row; the FX and pad
//   rows' screen reader names are on the row (Kotlin's merged semantics).
// - The no room line is a warning's amber bar with
//   ink words (as a problem is), where Kotlin writes the words in amber.
import { Fragment, type JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { ReadonlySignal } from '@preact/signals'
import { SoundStatus, type CardProblem, type CardSynth } from '../../core/features/beatCard'
import { SynthVoice } from '../../core/features/synthVoice'
import { SoundSource } from '../../core/features/offlinePads'
import { padKey, type PhysicalPad } from '../../core/features/padNotes'
import { ClaudeText } from '../../core/text/claudeText'
import { plural } from '../../core/text/format'
import { MirrorText } from '../../core/text/mirrorText'
import { SettingsText } from '../../core/text/settingsText'
import { Strings } from '../../core/text/strings'
import { WebText } from '../../core/text/webText'
import type { Change } from '../../core/text/claudeText'
import {
  pickedRow,
  soundsUiOf,
  type BeatFxUi,
  type BeatGridUi,
  type BeatImportUi,
  type PadShapeRowUi,
  type PadShapingUi,
  type SilentRowUi,
  type SilentUi,
  type SoundRowUi,
  type SoundsUi,
  type Weight,
} from '../../state/beatPlan'
import { GridPlate, PlateLine } from '../components/GridPlate'
import { Key } from '../components/Key'
import { PlayKey } from '../components/PlayKey'
import { Sheet } from '../components/Sheet'
import { SoundPicker } from '../live/SoundPicker'
import './BeatImportSheet.css'

export interface BeatImportSheetProps {
  open: boolean
  /** The card waiting, or null (a paste box only, while [pasting]). */
  ui: BeatImportUi | null
  /** PASTE BEAT is waiting for a paste. */
  pasting: boolean
  onCancel(): void
  /**
   * IMPORT: whether the tempo is set, the pads (pad keys) whose sounds go
   * on, the sounds picked for silent pads (pad key to slot), whether the
   * card's FX are applied, the pads (pad keys) whose settings are shaped, and
   * whether the card's chain becomes the project's.
   */
  onImport(setTempo: boolean, soundPads: ReadonlySet<number>, picked: ReadonlyMap<number, number>, applyFx: boolean, shapePads: ReadonlySet<number>, setChain: boolean): void
  onCopyProblems(problems: readonly CardProblem[]): void
  /** A text pasted into the box. */
  onPaste(text: string): void
  /** The preview of the sounds PICK SOUND lists: the key of the one playing, read by each row (controller.playing). */
  playing: ReadonlySignal<string | null>
  onPlay(slot: number, source: SoundSource): void
  onStop(): void
  /** The device is busy with something else: connected, a sound can't be picked. */
  busy: boolean
  /** The Scenes row's REPLACE (a setting, kept for the next card): the card's scenes take the place of the project's. */
  replaceScenes: boolean
  onReplaceScenes(on: boolean): void
  /** The play key on a synth row IMPORT makes: hear the sound first. */
  onPlaySynth(s: CardSynth): void
}

/**
 * What the card's sheet chose so far: the tempo, PUT ON PADS, the unticked
 * rows (pad keys), the picks for silent pads (pad key to slot), the pad whose
 * picker is open, APPLY FX, the unticked pad shaping rows (pad keys) and SET
 * CHAIN.
 */
interface Choices {
  readonly setTempo: boolean
  readonly putOnPads: boolean
  readonly unticked: ReadonlySet<number>
  readonly picked: ReadonlyMap<number, number>
  readonly picking: number | null
  readonly applyFx: boolean
  readonly shapeOff: ReadonlySet<number>
  readonly setChain: boolean
}

// The card's chain: set as the project's unless switched off.
const NO_CHOICES: Choices = { setTempo: false, putOnPads: true, unticked: new Set(), picked: new Map(), picking: null, applyFx: true, shapeOff: new Set(), setChain: true }

// The choices a card starts with: the sounds Arc suggests for its silent pads (BeatCards.suggestSound) picked.
function firstChoices(ui: BeatImportUi | null): Choices {
  const suggested = ui?.silent?.suggested
  return suggested === undefined || suggested.size === 0 ? NO_CHOICES : { ...NO_CHOICES, picked: suggested }
}

export function BeatImportSheet(props: BeatImportSheetProps): JSX.Element {
  const { ui } = props
  // Chosen on this sheet only: a card's tempo never replaces Arc's unasked. The sounds: all put on pads, bar the rows unticked.
  // Null until something is chosen: the card's first choices.
  const [chosen, setChoices] = useState<Choices | null>(null)
  const choices = chosen ?? firstChoices(ui)
  useEffect(() => {
    if (!props.open) setChoices(null)
  }, [props.open])
  const silent = ui?.silent ?? null
  const pickRow = choices.picking === null ? undefined : silent?.rows.find((r) => padKey(r.pad) === choices.picking)
  // The pad's silent row gone (the card planned again): the picker closes, and stays closed if the row comes back.
  useEffect(() => {
    if (choices.picking !== null && pickRow === undefined) setChoices({ ...choices, picking: null })
  }, [choices.picking, pickRow === undefined])
  // The picker replaces the card, so the key that opened it (or the picker itself) is gone: focus
  // moves to the picker's title, and back to the pad's PICK SOUND / CHANGE key, instead of <body>.
  const shownPick = pickRow === undefined ? null : choices.picking
  const lastPick = useRef(shownPick)
  useEffect(() => {
    const prev = lastPick.current
    lastPick.current = shownPick
    if (prev === shownPick) return
    const target = shownPick !== null ? document.getElementById('beat-sheet-title') : prev !== null ? document.getElementById(pickKeyId(prev)) : null
    target?.focus({ preventScroll: shownPick === null })
  }, [shownPick])
  return (
    <Sheet open={props.open} onDismiss={props.onCancel} labelledBy="beat-sheet-title" class="beat-sheet">
      {ui === null ? (
        <PasteBox onPaste={props.onPaste} onCancel={props.onCancel} />
      ) : silent !== null && pickRow !== undefined ? (
        <PickView
          {...props}
          row={pickRow}
          silent={silent}
          onPick={(slot) => {
            const key = padKey(pickRow.pad)
            // A pick is ticked to begin with, even where the pad's earlier pick was unticked.
            const unticked = new Set(choices.unticked)
            unticked.delete(key)
            setChoices({ ...choices, picked: new Map(choices.picked).set(key, slot), unticked, picking: null })
          }}
          onBack={() => setChoices({ ...choices, picking: null })}
        />
      ) : (
        <CardView {...props} ui={ui} choices={choices} onChoices={setChoices} />
      )}
    </Sheet>
  )
}

/** PASTE BEAT's box where the page may not read the clipboard: a paste into it reads the card. */
function PasteBox(props: { onPaste(text: string): void; onCancel(): void }): JSX.Element {
  return (
    <>
      <h2 id="beat-sheet-title" class="t-heading beat-sheet__title">{ClaudeText.PASTE_BEAT}</h2>
      <p class="t-small beat-sheet__dim">{WebText.PASTE_HERE_NOTE}</p>
      <textarea
        class="beat-sheet__paste"
        aria-label={WebText.PASTE_HERE}
        placeholder={WebText.PASTE_HERE}
        rows={4}
        autoFocus
        onPaste={(e) => {
          const text = e.clipboardData?.getData('text/plain') ?? ''
          e.preventDefault()
          props.onPaste(text)
        }}
      />
      <div class="beat-sheet__actions">
        <Key text={Strings.CANCEL} onClick={props.onCancel} block />
      </div>
    </>
  )
}

function CardView(props: BeatImportSheetProps & { ui: BeatImportUi; choices: Choices; onChoices(c: Choices): void }): JSX.Element {
  const { ui, choices } = props
  const { setTempo, putOnPads, unticked, picked, applyFx, shapeOff, setChain } = choices
  const tempo = ui.tempo
  const silent = ui.silent
  // The picks as SOUNDS rows, in pad order: only for pads the card still leaves silent.
  const pickedRows: SoundRowUi[] = []
  if (silent !== null) {
    for (const [key, slot] of [...picked].sort((a, b) => a[0] - b[0])) {
      const row = silent.rows.find((r) => padKey(r.pad) === key)
      if (row !== undefined) pickedRows.push(pickedRow(row.pad, slot, silent.choices?.names.get(slot) ?? null))
    }
  }
  // The card's own sound rows, with the picked ones after them.
  const sounds: SoundsUi | null =
    pickedRows.length === 0 || silent === null ? ui.sounds : soundsUiOf([...(ui.sounds?.rows ?? []), ...pickedRows], ui.sounds?.offline ?? silent.offline, ui.sounds?.project ?? silent.project)
  const isTicked = (row: SoundRowUi): boolean => putOnPads && !unticked.has(padKey(row.pad))
  const ticked = sounds?.changes.filter(isTicked) ?? []
  // Whether a new sound is going onto the pad (its row ticked): its settings start again, which the shaping rows start from.
  const going = new Set(ticked.map((r) => padKey(r.pad)))
  const soundGoing = (pad: PhysicalPad): boolean => going.has(padKey(pad))
  // With REPLACE on, the scenes, the new scene and the chain are the ones that start at S01.
  const { replaceScenes } = props
  const replacing = replaceScenes ? ui.replace : null
  const targets = replacing !== null && replacing.scenes.length > 0 ? replacing.scenes : ui.scenes
  const newScene = replacing !== null ? replacing.scene : ui.scene
  const chain = replacing !== null ? replacing.chain : ui.chain
  const rows: JSX.Element[] = []
  if (ui.replace !== null) {
    const name = ClaudeText.replaceScenesName(replaceScenes, ui.projectScenes)
    rows.push(
      // Where the card's scenes go: after the project's, or in their place (REPLACE).
      <ValueRow key="replace" label={ClaudeText.SCENES} value={replaceScenes ? ClaudeText.scenesReplace(ui.projectScenes) : ClaudeText.scenesAfter(ui.projectScenes)}>
        <SwitchChip text={ClaudeText.REPLACE} description={name} on={replaceScenes} onToggle={() => props.onReplaceScenes(!replaceScenes)} />
      </ValueRow>,
    )
  }
  if (ui.scenes.length === 0) {
    for (const g of ui.grids) {
      if (g.goesTo !== null) rows.push(<ValueRow key={`g${g.group}`} label={ClaudeText.GOES_TO} value={ClaudeText.goesTo(g.group, g.goesTo)} />)
    }
    if (newScene !== null) rows.push(<ValueRow key="scene" label={MirrorText.NEW_SCENE} value={MirrorText.sceneLabel(newScene)} />)
  } else {
    // One row for each scene: "Scene 1 · Drop" and where it goes, "new S03 · A 04 · B (same)".
    for (const sc of targets) {
      if (sc.index === null) continue
      rows.push(
        <StackedRow
          key={`s${sc.number}`}
          label={ClaudeText.cardScene(sc.number, sc.name)}
          value={replacing !== null ? ClaudeText.cardSceneReplaced(sc.index, sc.parts) : ClaudeText.cardSceneTarget(sc.index, sc.parts)}
          description={sc.patterns === null ? null : ClaudeText.cardSceneName(sc.number, sc.name, sc.index, sc.patterns)}
        />,
      )
    }
    if (chain !== null) {
      const name = ClaudeText.setChainName(setChain, chain.steps.length)
      rows.push(
        <StackedRow key="chain" label={MirrorText.CHAIN} value={ClaudeText.chainImport(chain.steps)} description={name}>
          <SwitchChip text={ClaudeText.SET_CHAIN} description={name} on={setChain} onToggle={() => props.onChoices({ ...choices, setChain: !setChain })} />
        </StackedRow>,
      )
    }
  }
  if (tempo !== null) {
    rows.push(
      // On, the row says the change ("136 → 85"); off, the tempo that stays and the card's beside it.
      <ValueRow key="tempo" label={ClaudeText.TEMPO} value={setTempo ? ClaudeText.tempoChange(ui.tempoNow, tempo) : ClaudeText.tempoKept(ui.tempoNow, tempo)}>
        <SwitchChip
          text={ClaudeText.SET_TEMPO}
          description={ClaudeText.tempoChipName(String(tempo), ui.tempoNow, setTempo)}
          on={setTempo}
          onToggle={() => props.onChoices({ ...choices, setTempo: !setTempo })}
        />
      </ValueRow>,
    )
  }
  const problems = ui.read.problems
  const onImport = (): void => {
    const pads = new Set(ticked.map((r) => padKey(r.pad)))
    // The picked sounds that are ticked: they are in [pads] too, being SOUNDS rows.
    const chosen = new Map(pickedRows.filter((r) => pads.has(padKey(r.pad))).map((r) => [padKey(r.pad), r.pick.slot!]))
    const shaped = new Set((ui.shaping?.rows ?? []).filter((r) => r.changes(soundGoing(r.pad)) && !shapeOff.has(padKey(r.pad))).map((r) => padKey(r.pad)))
    props.onImport(setTempo && tempo !== null, pads, chosen, applyFx && ui.fx !== null, shaped, setChain && chain !== null)
  }
  return (
    <>
      <div class="beat-sheet__head">
        <h2 id="beat-sheet-title" class="t-heading beat-sheet__title">{ui.title}</h2>
        {ui.summary !== null && <p class="t-small beat-sheet__dim">{ui.summary}</p>}
      </div>
      {ui.scenes.length === 0
        ? ui.grids.map((g) => <BeatGrid key={g.group} g={g} />)
        : // A card of scenes: the grids of each scene under its title.
          ui.scenes.map((sc) => (
            <Fragment key={sc.number}>
              <h3 class="t-caps beat-sheet__dim beat-scene__title">{ClaudeText.cardScene(sc.number, sc.name)}</h3>
              {sc.grids.length === 0 && <p class="t-small beat-sheet__dim">{ClaudeText.SCENE_SAME}</p>}
              {sc.grids.map((g) => (
                <BeatGrid key={g.group} g={g} />
              ))}
            </Fragment>
          ))}
      {rows.length > 0 && (
        <GridPlate>
          {rows.flatMap((r, i) => (i === 0 ? [r] : [<PlateLine key={`l${i}`} />, r]))}
        </GridPlate>
      )}
      {replacing !== null && <p class="t-small beat-sheet__dim">{ClaudeText.replaceScenesNote(ui.projectScenes)}</p>}
      {chain !== null && setChain && <p class="t-small beat-sheet__dim">{ClaudeText.SET_CHAIN_NOTE}</p>}
      {ui.noRoom && replacing === null && (
        <div class="beat-problem" role="note">
          <span class="beat-problem__bar" aria-hidden="true" />
          <span class="t-small beat-problem__text">{ClaudeText.NO_ROOM_FOR_SCENES}</span>
        </div>
      )}
      {ui.fx !== null && <FxBlock fx={ui.fx} on={applyFx} onToggle={() => props.onChoices({ ...choices, applyFx: !applyFx })} />}
      {silent !== null && (
        <SilentBlock
          silent={silent}
          // A pad's pick counts while its SOUNDS row is ticked (and PUT ON PADS is on): otherwise the pad stays silent.
          soundOf={(pad) => {
            const slot = picked.get(padKey(pad))
            if (slot === undefined || !putOnPads || unticked.has(padKey(pad))) return null
            return ClaudeText.soundName(slot, silent.choices?.names.get(slot) ?? null)
          }}
          onPick={(pad) => props.onChoices({ ...choices, picking: padKey(pad) })}
          // A pick still the one Arc suggested says so.
          suggestedOf={(pad) => {
            const slot = picked.get(padKey(pad))
            return slot !== undefined && silent.suggested.get(padKey(pad)) === slot
          }}
        />
      )}
      {sounds !== null && (
        <SoundsBlock
          sounds={sounds}
          on={putOnPads}
          onToggle={() => props.onChoices({ ...choices, putOnPads: !putOnPads })}
          ticked={ticked.length}
          isTicked={isTicked}
          onPlaySynth={props.onPlaySynth}
          onTick={(row) => {
            const next = new Set(unticked)
            const key = padKey(row.pad)
            if (!next.delete(key)) next.add(key)
            props.onChoices({ ...choices, unticked: next })
          }}
        />
      )}
      {ui.shaping !== null && (
        <PadShapingBlock
          shaping={ui.shaping}
          soundGoing={soundGoing}
          isTicked={(row) => !shapeOff.has(padKey(row.pad))}
          onTick={(row) => {
            const next = new Set(shapeOff)
            const key = padKey(row.pad)
            if (!next.delete(key)) next.add(key)
            props.onChoices({ ...choices, shapeOff: next })
          }}
        />
      )}
      {ui.swing !== null && <p class="t-small beat-sheet__dim">{ClaudeText.swingLine(ui.swing)}</p>}
      {problems.length > 0 && (
        <div class="beat-sheet__problems">
          {problems.map((p, i) => (
            <div key={i} class={`beat-problem${p.error ? ' is-error' : ''}`} role="note" aria-label={ClaudeText.problemName(p)}>
              <span class="beat-problem__bar" aria-hidden="true" />
              <span class="t-small beat-problem__text" aria-hidden="true">
                {ClaudeText.problemLine(p)}
              </span>
            </div>
          ))}
          <Key text={ClaudeText.COPY_PROBLEMS} size="small" block onClick={() => props.onCopyProblems(problems)} />
        </div>
      )}
      <p class="t-small beat-sheet__blocked" aria-live="polite">
        {ui.blocked ?? ''}
      </p>
      <div class="beat-sheet__actions">
        <Key text={Strings.CANCEL} onClick={props.onCancel} />
        <Key text={ClaudeText.IMPORT} variant="signal" disabled={ui.blocked !== null} onClick={onImport} />
      </div>
    </>
  )
}

/**
 * The SILENT PADS block (amber): its header and a row for each pad the card
 * plays that has no sound ([SilentRow]), and under them what a pick does.
 * [soundOf] gives the sound picked for a pad ("512 PIANO") while its SOUNDS
 * row is ticked, else null; [suggestedOf] whether the pad's pick is the one
 * Arc suggested.
 */
function SilentBlock(props: { silent: SilentUi; soundOf(pad: PhysicalPad): string | null; onPick(pad: PhysicalPad): void; suggestedOf(pad: PhysicalPad): boolean }): JSX.Element {
  const { silent } = props
  return (
    <>
      <GridPlate role="group" aria-label={ClaudeText.SILENT_PADS}>
        <div class="beat-block__head">
          <span class="beat-block__bar is-warn" aria-hidden="true" />
          <span class="t-caps beat-sheet__dim">{ClaudeText.SILENT_PADS}</span>
        </div>
        {silent.rows.map((row) => {
          const sound = props.soundOf(row.pad)
          return (
            <div key={padKey(row.pad)}>
              <PlateLine />
              <SilentRow row={row} sound={sound} canPick={silent.choices !== null} suggested={sound !== null && props.suggestedOf(row.pad)} onPick={() => props.onPick(row.pad)} />
            </div>
          )
        })}
      </GridPlate>
      <p class="t-small beat-sheet__dim">{silent.rows.some((r) => props.suggestedOf(r.pad)) ? ClaudeText.SUGGESTED_NOTE : ClaudeText.SILENT_NOTE}</p>
    </>
  )
}

/**
 * One silent pad: an amber bar, "D7 · 12 notes, no sound: they will be
 * silent" and its PICK SOUND key (no key when Arc knows no sounds to pick
 * from). Once a sound is picked ([sound], "512 PIANO") the bar is navy, the
 * row says "→ 512 PIANO" and the key is CHANGE; a pick Arc suggested
 * ([suggested]) is marked SUGGESTED.
 */
function SilentRow(props: { row: SilentRowUi; sound: string | null; canPick: boolean; suggested: boolean; onPick(): void }): JSX.Element {
  const { row, sound } = props
  return (
    <div class="beat-silent">
      <span class={`beat-silent__bar${sound === null ? '' : ' is-picked'}`} aria-hidden="true" />
      <div class="beat-silent__text" role="note" aria-label={sound === null ? ClaudeText.silentRowName(row.pad, row.notes) : ClaudeText.pickedRowName(row.pad, sound, props.suggested)}>
        {sound === null ? (
          <span class="t-small beat-sheet__ink" aria-hidden="true">{ClaudeText.silentRow(row.pad, row.notes)}</span>
        ) : (
          <>
            <span class="beat-silent__line" aria-hidden="true">
              <span class="t-small beat-sheet__dim">{ClaudeText.padLabel(row.pad) + ' \u00B7 ' + plural(row.notes, 'note')}</span>
              {props.suggested && <span class="t-caps beat-silent__suggested">{ClaudeText.SUGGESTED}</span>}
            </span>
            <span class="t-small beat-sheet__strong beat-sheet__clamp" aria-hidden="true">{'\u2192 ' + sound}</span>
          </>
        )}
      </div>
      {props.canPick && (
        <Key
          id={pickKeyId(padKey(row.pad))}
          text={sound === null ? ClaudeText.PICK_SOUND : ClaudeText.CHANGE_PICK}
          size="small"
          aria-label={sound === null ? ClaudeText.pickSoundName(row.pad) : ClaudeText.changePickName(row.pad, sound)}
          onClick={props.onPick}
        />
      )}
    </div>
  )
}

/** Id of a silent pad's PICK SOUND / CHANGE key (focus returns to it from the picker). */
const pickKeyId = (key: number): string => `beat-pick-${key}`

/**
 * PICK SOUND's picker, in place of the sheet: the pad's cap and what it
 * plays in the card, the pad sheet's sound list (SoundPicker: the search, the
 * hundreds, a preview on each sound) and a key back to the card. A tap on a
 * sound picks it ([onPick]; nothing is written yet, see CardView). The list
 * is the one IMPORT picks from: the EP-133's while connected, offline the
 * view's (so no Device / Factory switch, and no upload).
 */
function PickView(props: BeatImportSheetProps & { row: SilentRowUi; silent: SilentUi; onPick(slot: number): void; onBack(): void }): JSX.Element {
  const { row, silent } = props
  const choices = silent.choices
  const fromPack = choices?.source === SoundSource.FACTORY
  const stop = (): void => {
    if (props.playing.peek() !== null) props.onStop()
  }
  return (
    <>
      <div class="beat-pick__head">
        <span class="beat-pick__cap cap-3d" aria-hidden="true">{ClaudeText.padLabel(row.pad)}</span>
        <div class="beat-sheet__head">
          <h2 id="beat-sheet-title" tabIndex={-1} class="t-heading beat-sheet__title">{ClaudeText.pickTitle(row.pad)}</h2>
          <p class="t-small beat-sheet__dim">{ClaudeText.pickLine(row.notes)}</p>
        </div>
      </div>
      {choices !== null && (
        <>
          <SoundPicker
            sounds={fromPack ? [] : choices.entries}
            factory={fromPack ? choices.entries : null}
            unavailable={choices.unavailable}
            offline={silent.offline}
            current={null}
            padSource={choices.source}
            playing={props.playing}
            onPlay={props.onPlay}
            onStop={props.onStop}
            onPick={(snd) => {
              stop()
              props.onPick(snd.slot)
            }}
            disabled={props.busy && !silent.offline}
            findLabel={MirrorText.FIND_FOR_PAD}
          />
          <p class="t-small beat-sheet__dim">{ClaudeText.PICK_NOTE}</p>
        </>
      )}
      <Key
        text={ClaudeText.PICK_BACK}
        variant="quiet"
        block
        onClick={() => {
          stop()
          props.onBack()
        }}
      />
    </>
  )
}

/**
 * The SOUNDS block: its header with the PUT ON PADS chip (shown when some row
 * can be ticked; [on] by default), a row for each sound or synth line
 * ([SoundRow]; a synth row IMPORT makes has a play key, [onPlaySynth]),
 * and under it what writing them does ([ticked] pads): to the EP-133 and its
 * project, or kept in Arc until it connects.
 */
function SoundsBlock(props: {
  sounds: SoundsUi
  on: boolean
  onToggle(): void
  ticked: number
  isTicked(row: SoundRowUi): boolean
  onTick(row: SoundRowUi): void
  onPlaySynth(s: CardSynth): void
}): JSX.Element {
  const { sounds, on, ticked } = props
  const changes = sounds.changes.length
  let note: string | null = null
  if (on && ticked > 0) {
    // A pad with no sound can't be emptied again by UNDO: a ticked pick (or any such row) stays on it.
    const keeps = sounds.rows.some((r) => r.changes && props.isTicked(r) && (r.picked || r.oldName === ClaudeText.NO_SOUND))
    note = sounds.offline ? ClaudeText.SOUNDS_OFFLINE_NOTE : ClaudeText.soundsNote(ticked, sounds.project, keeps)
  }
  return (
    <>
      <GridPlate role="group" aria-label={ClaudeText.SOUNDS}>
        <div class="beat-block__head">
          <span class="t-caps beat-sheet__dim">{ClaudeText.SOUNDS}</span>
          {changes > 0 && <SwitchChip text={ClaudeText.PUT_ON_PADS} description={ClaudeText.putOnPadsName(on, changes)} on={on} onToggle={props.onToggle} />}
        </div>
        {sounds.rows.map((row) => (
          <div key={padKey(row.pad)}>
            <PlateLine />
            <SoundRow row={row} ticked={props.isTicked(row)} chipOn={on} offline={sounds.offline} onPlaySynth={props.onPlaySynth} onTick={() => props.onTick(row)} />
          </div>
        ))}
      </GridPlate>
      {sounds.noneFound && <p class="t-small beat-sheet__dim">{ClaudeText.NONE_ON_DEVICE}</p>}
      {note !== null && <p class="t-small beat-sheet__dim">{note}</p>}
    </>
  )
}

/**
 * A sound line: a tick box (for a row that changes the pad), the pad, and
 * what changes: the old name struck through and the new sound after it, the
 * sound and "Already there" when the pad has it, the saved pack's sound to
 * upload into a free slot (connected; offline it says to connect), or, amber
 * with no box, why it isn't on the user's EP-133. A sound used by its slot says what the card
 * called it, and one picked for a silent pad says so. A synth line IMPORT
 * makes (SoundRowUi.makes) says "Make 808 kick" and where it goes
 * ([offline]: kept in Arc), ticked like a change, with a small play key
 * beside the row ([onPlaySynth]; web delta: outside the row's checkbox, as a
 * button can't hold another, its label naming the sound). [chipOn] is the chip: off, the rows are dimmed
 * and can't be ticked.
 */
function SoundRow(props: { row: SoundRowUi; ticked: boolean; chipOn: boolean; offline: boolean; onPlaySynth(s: CardSynth): void; onTick(): void }): JSX.Element {
  const { row, ticked, chipOn, offline } = props
  const pick = row.pick
  const wanted = pick.wanted
  const missing = pick.status === SoundStatus.MISSING
  // A sound listed unnamed is its file name ("012.pcm") already: the slot isn't said twice.
  const now = missing ? null : pick.unverified && pick.name !== null ? pick.name : ClaudeText.soundName(pick.slot ?? wanted.slot, pick.name)
  const cardSays = row.cardSays
  const pack = row.fromPack
  const synth = row.makes ? row.synth : null
  const description =
    (synth !== null
      ? ClaudeText.soundRowMake(pick.pad, SynthVoice.shownName(synth), offline)
      : missing && pack !== null && row.uploadable
      ? ClaudeText.soundRowUpload(pick.pad, pack.slot, pack.name, pack.kit.model)
      : missing
      ? ClaudeText.soundRowMissing(pick.pad, wanted.slot, wanted.name) + (pack === null ? '' : '. ' + ClaudeText.inPack(pack.kit.model))
      : pick.status === SoundStatus.SAME
        ? ClaudeText.soundRowSame(pick.pad, now ?? '')
        : ClaudeText.soundRowName(pick.pad, row.oldName, now ?? '')) + (cardSays === null ? '' : '. ' + ClaudeText.cardSays(cardSays))
  const dim = row.changes && !chipOn ? ' is-dim' : ''
  const body = (
    <>
      <span class="beat-sound__mark" aria-hidden="true">
        {row.changes ? <span class={`beat-tick${ticked && chipOn ? ' is-on' : ''}`} /> : missing ? <span class="beat-sound__bar" /> : null}
      </span>
      <span class="t-field-label beat-sound__pad" aria-hidden="true">{ClaudeText.padLabel(pick.pad)}</span>
      {synth !== null ? (
        // A synth line no slot holds: made as IMPORT goes, into a free slot or (offline) kept in Arc.
        <span class={`beat-sound__what${dim}`} aria-hidden="true">
          <b class="t-small beat-sheet__strong beat-sheet__clamp">{ClaudeText.make(SynthVoice.shownName(synth))}</b>
          <span class="t-tiny beat-sheet__dim beat-sheet__clamp">{offline ? ClaudeText.MADE_OFFLINE : ClaudeText.MADE_INTO_SLOT}</span>
        </span>
      ) : missing && pack !== null ? (
        // Not on the EP-133, but in a pack Arc has: uploaded into a free slot as IMPORT goes.
        <span class={`beat-sound__what${dim}`} aria-hidden="true">
          {row.uploadable ? (
            <b class="t-small beat-sheet__strong beat-sheet__clamp">{ClaudeText.upload(pack.slot, pack.name)}</b>
          ) : (
            <span class="t-small beat-sheet__ink beat-sheet__clamp">{ClaudeText.soundMissing(wanted.slot, wanted.name)}</span>
          )}
          <span class="t-tiny beat-sheet__dim beat-sheet__clamp">{row.uploadable ? ClaudeText.fromPack(pack.kit.model) : ClaudeText.inPack(pack.kit.model)}</span>
        </span>
      ) : missing ? (
        <span class="t-small beat-sheet__ink beat-sound__what beat-sheet__clamp" aria-hidden="true">{ClaudeText.soundMissing(wanted.slot, wanted.name)}</span>
      ) : pick.status === SoundStatus.SAME ? (
        <span class="beat-sound__what" aria-hidden="true">
          <span class="t-field-label beat-sheet__ink beat-sound__one">{now}</span>
          <span class="t-tiny beat-sheet__dim">{ClaudeText.ALREADY_THERE}</span>
        </span>
      ) : (
        <span class={`beat-sound__what${dim}`} aria-hidden="true">
          <span class="t-small beat-sheet__clamp">
            {row.oldName !== null && (
              <>
                <s class="beat-sheet__dim">{row.oldName}</s>
                {'  \u2192  '}
              </>
            )}
            <b class="beat-sheet__strong">{now}</b>
          </span>
          {/* A factory sound the EP-133 lists without a name: used by its slot, the card's name not checked. */}
          {cardSays !== null && <span class="t-tiny beat-sheet__dim">{ClaudeText.cardSays(cardSays)}</span>}
          {/* A sound the user picked for a silent pad, not the card's. */}
          {row.picked && <span class="t-tiny beat-sheet__dim">{ClaudeText.PICKED_HERE}</span>}
        </span>
      )}
    </>
  )
  if (!row.changes) {
    return (
      <div class="beat-sound" role="note" aria-label={description}>
        {body}
      </div>
    )
  }
  const box = (
    <button type="button" class="beat-sound is-tickable" role="checkbox" aria-checked={ticked && chipOn} aria-label={description} disabled={!chipOn} onClick={props.onTick}>
      {body}
    </button>
  )
  if (synth === null) return box
  return (
    <div class="beat-sound-make">
      {box}
      <PlayKey playing={false} description={`${ClaudeText.PLAY_SYNTH} ${SynthVoice.shownName(synth)}`} onClick={() => props.onPlaySynth(synth)} class="beat-sound-make__play" />
    </div>
  )
}

/**
 * The FX block: its header with the APPLY FX chip (on by default; shown when
 * some row changes the FX), a row for each kind of FX the card has a line for
 * ([FxRow]), and under them what applying does ([on]). With the chip off the
 * rows are dimmed: the project's FX stay as they are.
 */
function FxBlock(props: { fx: BeatFxUi; on: boolean; onToggle(): void }): JSX.Element {
  const { fx, on } = props
  return (
    <>
      <GridPlate role="group" aria-label={ClaudeText.FX}>
        <div class="beat-block__head">
          <span class="t-caps beat-sheet__dim">{ClaudeText.FX}</span>
          {fx.changes && <SwitchChip text={ClaudeText.APPLY_FX} description={ClaudeText.applyFxName(on)} on={on} onToggle={props.onToggle} />}
        </div>
        {fx.rows.map((row) => (
          <div key={row.label}>
            <PlateLine />
            <FxRow row={row} on={on} />
          </div>
        ))}
      </GridPlate>
      {on && fx.changes && <p class="t-small beat-sheet__dim">{ClaudeText.FX_BLOCK_NOTE}</p>}
    </>
  )
}

/**
 * One kind of FX: its label (EFFECT, SENDS, COMP, DUCK), the project's value
 * struck through and the card's after an arrow; "Already set" under the
 * value when the project has it. Dimmed while APPLY FX is off ([on]).
 */
function FxRow(props: { row: Change; on: boolean }): JSX.Element {
  const { row, on } = props
  const same = ClaudeText.isSame(row)
  return (
    <div class={`beat-fx${same || on ? '' : ' is-dim'}`} role="note" aria-label={ClaudeText.changeName(row)}>
      <span class="t-caps beat-sheet__dim beat-fx__label" aria-hidden="true">{row.label}</span>
      {same ? (
        <span class="beat-fx__what" aria-hidden="true">
          <b class="t-small beat-sheet__strong beat-sheet__clamp">{row.new}</b>
          <span class="t-tiny beat-sheet__dim">{ClaudeText.ALREADY_SET}</span>
        </span>
      ) : (
        <span class="beat-fx__what" aria-hidden="true">
          <s class="t-small beat-sheet__dim beat-sheet__clamp">{row.old}</s>
          <b class="t-small beat-sheet__strong beat-fx__new">{'\u2192 ' + row.new}</b>
        </span>
      )}
    </div>
  )
}

/**
 * The PAD SHAPING block: its header and a row for each pad line of the card
 * ([PadShapeRow]), and under them what writing them does when some row is
 * ticked: on the EP-133, or kept in Arc until it connects. [soundGoing]: a
 * new sound is going onto the pad (the rows start from the defaults then).
 */
function PadShapingBlock(props: {
  shaping: PadShapingUi
  soundGoing(pad: PhysicalPad): boolean
  isTicked(row: PadShapeRowUi): boolean
  onTick(row: PadShapeRowUi): void
}): JSX.Element {
  const { shaping } = props
  const ticked = shaping.rows.filter((r) => r.changes(props.soundGoing(r.pad)) && props.isTicked(r)).length
  return (
    <>
      <GridPlate role="group" aria-label={ClaudeText.PAD_SHAPING}>
        <div class="beat-block__head">
          <span class="t-caps beat-sheet__dim">{ClaudeText.PAD_SHAPING}</span>
        </div>
        {shaping.rows.map((row) => (
          <div key={padKey(row.pad)}>
            <PlateLine />
            <PadShapeRow row={row} soundGoing={props.soundGoing(row.pad)} ticked={props.isTicked(row)} onTick={() => props.onTick(row)} />
          </div>
        ))}
      </GridPlate>
      {ticked > 0 && <p class="t-small beat-sheet__dim">{shaping.offline ? ClaudeText.PAD_SHAPING_OFFLINE_NOTE : ClaudeText.PAD_SHAPING_NOTE}</p>}
    </>
  )
}

/**
 * One pad line: a tick box (when there is something to change), the pad, and
 * each setting it changes, the old value struck through and the new one
 * after an arrow ("pitch 0 → +2 · release 255 → 40"). A pad that has them
 * says "Already set", and one with no sound (and none going onto it) is amber
 * with the reason; neither has a box.
 */
function PadShapeRow(props: { row: PadShapeRowUi; soundGoing: boolean; ticked: boolean; onTick(): void }): JSX.Element {
  const { row, soundGoing, ticked } = props
  const parts = row.parts(soundGoing)
  const noSound = !row.hasSound && !soundGoing
  const changes = row.changes(soundGoing)
  const change = parts.length === 0 ? null : ClaudeText.padChange(row.pad, row.base(soundGoing), row.after(soundGoing))
  const description = ClaudeText.padRowName(change, row.pad, noSound)
  const body = (
    <>
      <span class="beat-sound__mark" aria-hidden="true">
        {changes ? <span class={`beat-tick${ticked ? ' is-on' : ''}`} /> : noSound ? <span class="beat-sound__bar" /> : null}
      </span>
      <span class="t-field-label beat-sound__pad" aria-hidden="true">{ClaudeText.padLabel(row.pad)}</span>
      <span class={`beat-sound__what${changes && !ticked ? ' is-dim' : ''}`} aria-hidden="true">
        {noSound ? (
          <span class="t-small beat-sheet__ink beat-sheet__clamp">{ClaudeText.PAD_NO_SOUND}</span>
        ) : parts.length === 0 ? (
          <>
            {row.name !== null && <span class="t-field-label beat-sheet__ink beat-sound__one">{row.name}</span>}
            <span class="t-tiny beat-sheet__dim">{ClaudeText.ALREADY_SET}</span>
          </>
        ) : (
          <>
            <span class="t-small beat-shape__parts">
              {parts.map((p, i) => (
                <span key={p.name}>
                  {i > 0 && '  \u00B7  '}
                  <span class="beat-sheet__dim">{p.name.toLowerCase() + ' '}</span>
                  <s class="beat-sheet__dim">{p.old}</s>
                  {' \u2192 '}
                  <b class="beat-sheet__strong">{p.new}</b>
                </span>
              ))}
            </span>
            {row.name !== null && <span class="t-tiny beat-sheet__dim beat-sound__one">{row.name}</span>}
          </>
        )}
      </span>
    </>
  )
  if (!changes) {
    return (
      <div class="beat-sound" role="note" aria-label={description}>
        {body}
      </div>
    )
  }
  return (
    <button type="button" class="beat-sound is-tickable" role="checkbox" aria-checked={ticked} aria-label={description} onClick={props.onTick}>
      {body}
    </button>
  )
}

/** A row of the sheet: [label] at the start, [value] after it, and a chip at the end. */
function ValueRow(props: { label: string; value: string; children?: JSX.Element }): JSX.Element {
  return (
    <div class="beat-row">
      <span class="t-small beat-sheet__dim">{props.label}</span>
      <span class="t-bold beat-row__value">{props.value}</span>
      {props.children}
    </div>
  )
}

/**
 * A row of the sheet with its [value] under its [label] (a long value wraps,
 * up to three lines), and a chip at the end: a card scene's row ("Scene 1 ·
 * Drop" over "new S03 · A 04 · B (same)") and the chain's. Screen readers
 * hear [description] for it.
 */
function StackedRow(props: { label: string; value: string; description: string | null; children?: JSX.Element }): JSX.Element {
  const said = props.description !== null
  return (
    <div class="beat-row">
      <div class="beat-row__stack" role={said ? 'note' : undefined} aria-label={props.description ?? undefined}>
        <span class="t-small beat-sheet__dim beat-row__label" aria-hidden={said || undefined}>
          {props.label}
        </span>
        <span class="t-bold beat-row__long" aria-hidden={said || undefined}>
          {props.value}
        </span>
      </div>
      {props.children}
    </div>
  )
}

/**
 * A block's switch as a device key: a light, [text], and ON or OFF on the key
 * itself (the light orange and ON in signal while [on], the light dark and OFF
 * in graphite while not); a tap switches it, and screen readers hear
 * [description] and its state.
 */
function SwitchChip(props: { text: string; description: string; on: boolean; onToggle(): void }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      class={`beat-switch cap-3d${props.on ? ' is-on' : ''}`}
      aria-checked={props.on}
      aria-label={props.description}
      aria-description={props.on ? SettingsText.ON : SettingsText.OFF}
      onClick={props.onToggle}
    >
      <span class="beat-switch__light" aria-hidden="true" />
      <span class="beat-switch__text" aria-hidden="true">{props.text}</span>
      <span class="beat-switch__state" aria-hidden="true">{props.on ? SettingsText.ON : SettingsText.OFF}</span>
    </button>
  )
}

const WEIGHT_CLASS: Readonly<Record<Weight, string>> = { ACCENT: 'is-accent', NORMAL: 'is-normal', GHOST: 'is-ghost' }

/**
 * A section's step grid, read-only: its heading (group, length, step), "+N
 * bars" for what isn't drawn, and a row for each pad with notes: its label and
 * sound name, then its cells, lit by weight, a little apart each beat and bar.
 */
function BeatGrid(props: { g: BeatGridUi }): JSX.Element {
  const { g } = props
  const perBeat = Math.max(1, g.perBar / 4)
  return (
    <div class="beat-grid" role="group" aria-label={ClaudeText.gridName(g.group, g.bars, g.step, g.rows.length)}>
      <div class="beat-grid__head">
        <span class="t-semi">{ClaudeText.sectionTitle(g.group, g.bars, g.step)}</span>
        {g.moreBars > 0 && <span class="t-small beat-sheet__dim">{ClaudeText.moreBars(g.moreBars)}</span>}
      </div>
      <GridPlate class="beat-grid__plate">
        {g.rows.map((row) => (
          <div key={row.pad.offset} class="beat-grid__row" role="img" aria-label={ClaudeText.rowName(row.pad, row.name, row.hits)}>
            <span class="t-tiny beat-grid__label" aria-hidden="true">
              <b>{ClaudeText.padLabel(row.pad)}</b>
              {row.name !== null && <span class="beat-sheet__dim"> {row.name}</span>}
            </span>
            <span class="beat-grid__cells" aria-hidden="true">
              {row.cells.map((w, i) => {
                const next = i + 1
                const gap = next === row.cells.length ? '' : next % g.perBar === 0 ? ' is-bar-end' : next % perBeat === 0 ? ' is-beat-end' : ''
                return <span key={i} class={`beat-cell${w === null ? '' : ` ${WEIGHT_CLASS[w]}`}${gap}`} />
              })}
            </span>
          </div>
        ))}
      </GridPlate>
    </div>
  )
}
