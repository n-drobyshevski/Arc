// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/CompareScreen.kt (CompareScreen)
//
// What changed between two saved backups, older to newer: sounds and
// projects added, removed and changed, and the pads a changed project moved.
//
// ComparePickerContent (the same Kotlin file) is the compare picker sheet's
// body; it lives in ui/sheets/ComparePicker.tsx.
//
// Web deltas: the LazyColumn is a plain column (the page scrolls); each
// section is a <section> named by its title. The rows are built by the pure
// compareSections() (tested).
import type { JSX } from 'preact'
import { useId, useLayoutEffect, useRef } from 'preact/hooks'
import { ChangeKind, type PakCompareResult } from '../../core/features/pakCompare'
import { FeatureText } from '../../core/text/featureText'
import type { BackupRecord } from '../../core/text/libraryRules'
import { Strings } from '../../core/text/strings'
import type { PakCompareUi } from '../../state/types'
import { Key } from '../components/Key'
import { Plate, SectionTitle } from './DeviceScreen'
import './CompareScreen.css'

export interface CompareScreenProps {
  /** The older of the pair (by createdAt). */
  old: BackupRecord
  new: BackupRecord
  /** state.pakCompare when it is for this pair, else null (still comparing). */
  compare: PakCompareUi | null
  fmtDay: (ms: number) => string
  onBack: () => void
}

/** One row (Kotlin Line(slot, name, details)). */
export interface CompareLine {
  readonly key: string
  /** The slot as "001", or null for a project. */
  readonly slot: string | null
  readonly name: string
  readonly details: readonly string[] | null
}

/** A titled group of rows; empty groups are left out (Kotlin section()). */
export interface CompareSection {
  readonly title: string
  readonly rows: readonly CompareLine[]
}

/** The sections of a finished comparison, in the Kotlin order, without the empty ones. */
export function compareSections(
  r: PakCompareResult,
  oldNames: ReadonlyMap<number, string>,
  newNames: ReadonlyMap<number, string>,
): CompareSection[] {
  const sounds = (kind: ChangeKind) => r.sounds.filter((s) => s.kind === kind)
  const projects = (kind: ChangeKind) => r.projects.filter((p) => p.kind === kind)
  const name = (m: ReadonlyMap<number, string>, slot: number | null): string | null =>
    slot === null ? null : m.get(slot) ?? null
  const all: CompareSection[] = [
    {
      title: FeatureText.SOUNDS_ADDED,
      rows: sounds(ChangeKind.ADDED).map((s) => ({ key: `sa${s.slot}`, slot: FeatureText.slot(s.slot), name: s.newName ?? '', details: null })),
    },
    {
      title: FeatureText.SOUNDS_REMOVED,
      rows: sounds(ChangeKind.REMOVED).map((s) => ({ key: `sr${s.slot}`, slot: FeatureText.slot(s.slot), name: s.oldName ?? '', details: null })),
    },
    {
      title: FeatureText.SOUNDS_CHANGED,
      rows: sounds(ChangeKind.CHANGED).map((s) => ({
        key: `sc${s.slot}`, slot: FeatureText.slot(s.slot), name: s.newName ?? '', details: [FeatureText.soundChange(s)],
      })),
    },
    {
      title: FeatureText.PROJECTS_ADDED,
      rows: projects(ChangeKind.ADDED).map((p) => ({ key: `pa${p.project}`, slot: null, name: Strings.projectLine(p.project), details: null })),
    },
    {
      title: FeatureText.PROJECTS_REMOVED,
      rows: projects(ChangeKind.REMOVED).map((p) => ({ key: `pr${p.project}`, slot: null, name: Strings.projectLine(p.project), details: null })),
    },
    {
      title: FeatureText.PROJECTS_CHANGED,
      rows: projects(ChangeKind.CHANGED).map((p) => ({
        key: `pc${p.project}`,
        slot: null,
        name: Strings.projectLine(p.project),
        details: p.padChanges.length === 0
          // Only claim the pads kept their sounds when both layouts could be read.
          ? [p.padsRead ? FeatureText.PATTERNS_CHANGED : FeatureText.PROJECT_CHANGED]
          : p.padChanges.map((pc) => FeatureText.padChange(pc, name(oldNames, pc.oldSlot), name(newNames, pc.newSlot))),
      })),
    },
  ]
  return all.filter((s) => s.rows.length > 0)
}

export function CompareScreen(props: CompareScreenProps): JSX.Element {
  const { old, compare } = props
  const root = useRef<HTMLDivElement | null>(null)
  const titleId = useId()

  // Focus moves onto the screen when it opens; the list starts at the top.
  useLayoutEffect(() => {
    root.current?.focus({ preventScroll: true })
    if (typeof window !== 'undefined') window.scrollTo(0, 0)
  }, [])

  const r = compare?.result ?? null
  let body: JSX.Element
  if (compare?.error != null) {
    body = <p class="t-body15 compare__error" role="alert">{compare.error}</p>
  } else if (r === null || compare === null) {
    body = <p class="t-body15 compare__dim" role="status">{FeatureText.COMPARING_BACKUPS}</p>
  } else {
    const unchanged = FeatureText.unchanged(r.sameSounds, r.sameProjects)
    body = (
      <>
        {r.nothingChanged && <p class="t-body15 compare__ink" role="status">{FeatureText.NOTHING_CHANGED}</p>}
        {compareSections(r, compare.oldNames, compare.newNames).map((s, i) => (
          <section key={`t:${s.title}`} class="compare__section" aria-labelledby={`${titleId}-${i}`}>
            <SectionTitle id={`${titleId}-${i}`} text={s.title} count={s.rows.length} />
            {s.rows.map((row) => <Line key={row.key} line={row} />)}
          </section>
        ))}
        {unchanged !== '' && !r.nothingChanged && <p class="t-small compare__dim">{unchanged}</p>}
      </>
    )
  }

  return (
    <div ref={root} class="compare" data-screen="compare" tabIndex={-1} aria-labelledby={titleId}>
      <div class="compare__column">
        <header class="compare__head">
          <h1 id={titleId} class="t-heading compare__title">{FeatureText.COMPARE_BACKUPS}</h1>
          <Key text={Strings.DONE} variant="quiet" size="small" onClick={props.onBack} />
        </header>
        <p class="t-body15 compare__dim">
          {FeatureText.compareHeader(old.title, props.fmtDay(old.createdAt), props.new.title, props.fmtDay(props.new.createdAt))}
        </p>
        {body}
      </div>
    </div>
  )
}

function Line(props: { line: CompareLine }): JSX.Element {
  const { slot, name, details } = props.line
  return (
    <Plate onClick={null} enabled={false}>
      <div class="compare__line">
        {slot !== null && <span class="t-bold compare__slot">{slot}</span>}
        <span class="t-bold compare__name">{name}</span>
      </div>
      {details?.map((d, i) => <p key={i} class="t-small compare__dim">{d}</p>)}
    </Plate>
  )
}
