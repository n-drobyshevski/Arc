// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/LiveClaude.kt (BeatImportSheetContent)
//
// A beat card's sheet: the card's name and what is in it, a read-only grid for
// each section (a row for each pad with notes, cells lit by how hard it is
// hit; the first two bars of a long pattern), where each section goes, the new
// scene a card of several groups adds, its tempo (a chip sets it: off until
// chosen), its swing, and its problems with their lines (COPY PROBLEMS copies
// them for Claude). IMPORT puts it all in as one UNDO step; it is off, and
// says why, when the card can't be read or a group is full.
//
// Web deltas:
// - The grid's cells are spans in a row that scrolls sideways when long,
//   where Kotlin draws them on a Canvas.
// - [pasting]: PASTE BEAT where the page may not read the clipboard shows a
//   box a paste goes into instead (WebText.PASTE_HERE), before any card.
import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import type { CardProblem } from '../../core/features/beatCard'
import { ClaudeText } from '../../core/text/claudeText'
import { MirrorText } from '../../core/text/mirrorText'
import { SettingsText } from '../../core/text/settingsText'
import { Strings } from '../../core/text/strings'
import { WebText } from '../../core/text/webText'
import type { BeatGridUi, BeatImportUi, Weight } from '../../state/beatPlan'
import { GridPlate, PlateLine } from '../components/GridPlate'
import { Key } from '../components/Key'
import { Sheet } from '../components/Sheet'
import './BeatImportSheet.css'

export interface BeatImportSheetProps {
  open: boolean
  /** The card waiting, or null (a paste box only, while [pasting]). */
  ui: BeatImportUi | null
  /** PASTE BEAT is waiting for a paste. */
  pasting: boolean
  onCancel(): void
  onImport(setTempo: boolean): void
  onCopyProblems(problems: readonly CardProblem[]): void
  /** A text pasted into the box. */
  onPaste(text: string): void
}

export function BeatImportSheet(props: BeatImportSheetProps): JSX.Element {
  const { ui } = props
  // Chosen on this sheet only: a card's tempo never replaces Arc's unasked.
  const [setTempo, setSetTempo] = useState(false)
  useEffect(() => {
    if (!props.open) setSetTempo(false)
  }, [props.open])
  return (
    <Sheet open={props.open} onDismiss={props.onCancel} labelledBy="beat-sheet-title" class="beat-sheet">
      {ui === null ? (
        <PasteBox onPaste={props.onPaste} onCancel={props.onCancel} />
      ) : (
        <CardView {...props} ui={ui} setTempo={setTempo} onSetTempo={setSetTempo} />
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

function CardView(props: BeatImportSheetProps & { ui: BeatImportUi; setTempo: boolean; onSetTempo(on: boolean): void }): JSX.Element {
  const { ui, setTempo } = props
  const tempo = ui.tempo
  const goes = ui.grids.filter((g) => g.goesTo !== null)
  const rows: JSX.Element[] = []
  for (const g of goes) rows.push(<ValueRow key={`g${g.group}`} label={ClaudeText.GOES_TO} value={ClaudeText.goesTo(g.group, g.goesTo!)} />)
  if (ui.scene !== null) rows.push(<ValueRow key="scene" label={MirrorText.NEW_SCENE} value={MirrorText.sceneLabel(ui.scene)} />)
  if (tempo !== null) {
    rows.push(
      <ValueRow key="tempo" label={ClaudeText.TEMPO} value={String(tempo)}>
        <TempoChip now={ui.tempoNow} card={tempo} on={setTempo} onToggle={() => props.onSetTempo(!setTempo)} />
      </ValueRow>,
    )
  }
  const problems = ui.read.problems
  return (
    <>
      <div class="beat-sheet__head">
        <h2 id="beat-sheet-title" class="t-heading beat-sheet__title">{ui.title}</h2>
        {ui.summary !== null && <p class="t-small beat-sheet__dim">{ui.summary}</p>}
      </div>
      {ui.grids.map((g) => (
        <BeatGrid key={g.group} g={g} />
      ))}
      {rows.length > 0 && (
        <GridPlate>
          {rows.flatMap((r, i) => (i === 0 ? [r] : [<PlateLine key={`l${i}`} />, r]))}
        </GridPlate>
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
        <Key text={ClaudeText.IMPORT} variant="signal" disabled={ui.blocked !== null} onClick={() => props.onImport(setTempo && tempo !== null)} />
      </div>
    </>
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

/** The tempo chip: "SET · NOW 122". Off it is a flat pill (the tempo stays Arc's), on it is navy; a tap switches it. */
function TempoChip(props: { now: number; card: number; on: boolean; onToggle(): void }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      class={`tempo-chip${props.on ? ' is-on' : ''}`}
      aria-checked={props.on}
      aria-label={ClaudeText.tempoChipName(String(props.card), props.now, props.on)}
      aria-description={props.on ? SettingsText.ON : SettingsText.OFF}
      onClick={props.onToggle}
    >
      {ClaudeText.tempoChip(props.now)}
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
