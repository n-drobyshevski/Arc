// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/PadsSheet.kt
//
// Which sound sits on each pad of a project (an addition to the web version).
// Pads are laid out by their number in the project file, three to a row; how
// those numbers map to the pads on the device is not known, and the note says so.
//
// Also the two mounts of Root (MainActivity.kt): the Device tab's read-only
// sheet ('pads:device:<n>', from the browser's projectPads) and the opened
// backup's playable sheet ('pads:backup:<id>:<n>', from the backup's pak).
import { Fragment, type JSX } from 'preact'
import { useEffect, useMemo } from 'preact/hooks'
import { read as readPads, type PadGroup } from '../../core/features/projectPads'
import { FeatureText } from '../../core/text/featureText'
import { Strings } from '../../core/text/strings'
import { useController, useNav } from '../AppContext'
import { Caption } from '../components/Caption'
import { GridPlate, PlateLine } from '../components/GridPlate'
import { Key } from '../components/Key'
import { Sheet } from '../components/Sheet'
import { sheetLayer, type NavView } from '../nav'
import { chunked } from '../screens/DeviceScreen'
import './PadsSheet.css'

export interface PadsSheetContentProps {
  title: string
  groups: readonly PadGroup[]
  nameOf: (slot: number) => string | null | undefined
  /** The slot playing now, lit in signal. */
  playingSlot: number | null
  /** Null: read-only (the Device tab). */
  onPad: ((slot: number) => void) | null
  onDone: () => void
  /** Id of the title, for the sheet's aria-labelledby. */
  titleId?: string
}

/** One pad cell: what it shows (pure; tested). */
export interface PadCellView {
  pad: number
  slot: number | null
  /** The bold line: the sound's name, or its slot when the sound is missing; null for an empty pad. */
  main: string | null
  /** The small line under it (the slot, "Sound not found" or "Empty"). */
  sub: string
  empty: boolean
  /** A pad pointing at a slot with no sound has nothing to play. */
  playable: boolean
}

export function padCell(pad: number, slot: number | null, name: string | null | undefined): PadCellView {
  if (slot === null) return { pad, slot, main: null, sub: FeatureText.EMPTY_PAD, empty: true, playable: false }
  if (name === null || name === undefined) {
    return { pad, slot, main: FeatureText.slot(slot), sub: FeatureText.MISSING_PAD, empty: false, playable: false }
  }
  return { pad, slot, main: name, sub: FeatureText.slot(slot), empty: false, playable: true }
}

export function PadsSheetContent(props: PadsSheetContentProps): JSX.Element {
  const { groups, nameOf, playingSlot, onPad } = props
  return (
    <>
      <h2 id={props.titleId} class="t-heading pads-sheet__title">{props.title}</h2>
      <p class="t-small pads-sheet__note">{FeatureText.PADS_NOTE}</p>
      {groups.length === 0 && <p class="t-body15 pads-sheet__note">{FeatureText.NO_PADS}</p>}
      {groups.map((g) => {
        const capId = `pads-group-${g.name}`
        return (
          <Fragment key={g.name}>
            <Caption id={capId} as="h3" text={FeatureText.group(g.name)} class="pads-sheet__group" />
            {/* One plate split by thin lines, like the pocket operator app's pad grid. */}
            <GridPlate role="group" aria-label={FeatureText.group(g.name)}>
              {chunked([...g.pads.entries()], 3).map((row, r) => (
                <Fragment key={r}>
                  {r > 0 && <PlateLine />}
                  <div class="pad-grid__row">
                    {row.map(([pad, slot], i) => {
                      const cell = padCell(pad, slot, slot !== null ? nameOf(slot) : null)
                      return (
                        <Fragment key={pad}>
                          {i > 0 && <span class="pad-grid__rule" aria-hidden="true" />}
                          <PadCell
                            cell={cell}
                            playing={slot !== null && slot === playingSlot}
                            onClick={cell.playable && onPad !== null && slot !== null ? () => onPad(slot) : null}
                          />
                        </Fragment>
                      )
                    })}
                    {/* Keep cells the same width on a short last row. */}
                    {Array.from({ length: 3 - row.length }, (_, k) => (
                      <Fragment key={`f${k}`}>
                        <span class="pad-grid__rule" aria-hidden="true" />
                        <span class="pad-grid__fill hatch" aria-hidden="true" />
                      </Fragment>
                    ))}
                  </div>
                </Fragment>
              ))}
            </GridPlate>
          </Fragment>
        )
      })}
      <Key text={Strings.DONE} onClick={props.onDone} variant="quiet" block class="pads-sheet__done" />
    </>
  )
}

function PadCell(props: { cell: PadCellView; playing: boolean; onClick: (() => void) | null }): JSX.Element {
  const { cell, playing, onClick } = props
  // An empty pad is hatched, as the pocket operator app marks unused space.
  const cls = `pad-cell${playing ? ' is-playing' : ''}${cell.empty && !playing ? ' hatch' : ''}${onClick ? ' pad-cell--button' : ''}`
  const inner = (
    <>
      <span class="t-small pad-cell__dim">{cell.pad}</span>
      {cell.main !== null && <span class="t-bold pad-cell__main">{cell.main}</span>}
      <span class={`t-small pad-cell__dim${cell.empty ? ' pad-cell__one' : ''}`}>{cell.sub}</span>
    </>
  )
  if (onClick) {
    return (
      <button type="button" class={cls} aria-pressed={playing} onClick={onClick}>
        {inner}
      </button>
    )
  }
  return <div class={cls}>{inner}</div>
}

/** The pads sheet id's project, for a prefix such as 'pads:device:'. */
export function padsProject(sheets: readonly string[], prefix: string): number | null {
  const id = sheets.find((s) => s.startsWith(prefix))
  if (id === undefined) return null
  const rest = id.slice(prefix.length)
  return /^\d+$/.test(rest) ? Number(rest) : null
}

/** The Device tab's pads sheet: read-only, from the browser's projectPads (Root, Tab.DEVICE). */
export function DevicePadsSheet(props: { view: NavView }): JSX.Element {
  const c = useController()
  const nav = useNav()
  const state = c.state.value
  const id = props.view.sheets.find((s) => s.startsWith('pads:device:')) ?? null
  const project = padsProject(props.view.sheets, 'pads:device:')
  const groups = project !== null ? state.browser.projectPads.get(project) ?? null : null
  // A disconnect, refresh or reload drops the pads; forget the request then, or
  // the sheet would pop up by itself when the project is read again. (The Pads
  // key only shows once the pads are there, so a fresh tap never lands here.)
  const gone = id !== null && groups === null
  useEffect(() => {
    if (gone && id !== null) nav.close(sheetLayer(id))
  }, [gone])
  const names = useMemo(() => new Map((state.browser.contents?.sounds ?? []).map((s) => [s.slot, s.name])), [state.browser.contents])
  const close = (): void => { if (id !== null) nav.close(sheetLayer(id)) }
  return (
    <Sheet open={groups !== null} onDismiss={close} labelledBy="arc-device-pads-title">
      {groups !== null && project !== null && (
        <PadsSheetContent
          titleId="arc-device-pads-title"
          title={FeatureText.padsTitle(project)}
          groups={groups}
          nameOf={(slot) => names.get(slot)}
          playingSlot={null}
          onPad={null}
          onDone={close}
        />
      )}
    </Sheet>
  )
}

/** The opened backup's pads sheet: playable, from the backup's pak (Root, contentsBackup branch). */
export function BackupPadsSheet(props: { view: NavView; backupId: string }): JSX.Element {
  const c = useController()
  const nav = useNav()
  const state = c.state.value
  const playing = c.playing.value
  const { backupId } = props
  const prefix = `pads:backup:${backupId}:`
  const id = props.view.sheets.find((s) => s.startsWith(prefix)) ?? null
  const project = padsProject(props.view.sheets, prefix)
  const pak = state.contents?.backupId === backupId ? state.contents.pak : null
  const tar = project !== null ? pak?.projects.get(project) ?? null : null
  const groups = useMemo(() => (tar ? readPads(tar) : null), [tar])
  const playingPrefix = `backup:${backupId}:`
  const rest = playing?.startsWith(playingPrefix) ? playing.slice(playingPrefix.length) : null
  const playingSlot = rest !== null && /^\d+$/.test(rest) ? Number(rest) : null
  const close = (): void => { if (id !== null) nav.close(sheetLayer(id)) }
  // Web: the request is a history layer. Once the pak is read and has no such
  // project, drop it, or the next Back would close an invisible sheet.
  const gone = id !== null && pak !== null && pak !== undefined && groups === null
  useEffect(() => {
    if (gone && id !== null) nav.close(sheetLayer(id))
  }, [gone])
  return (
    <Sheet open={groups !== null} onDismiss={close} labelledBy="arc-backup-pads-title">
      {groups !== null && project !== null && (
        <PadsSheetContent
          titleId="arc-backup-pads-title"
          title={FeatureText.padsTitle(project)}
          groups={groups}
          nameOf={(slot) => pak?.sounds.get(slot)?.name}
          playingSlot={playingSlot}
          onPad={(slot) => {
            if (playing === playingPrefix + slot) c.stopPlayback()
            else void c.playBackupSound(slot)
          }}
          onDone={close}
        />
      )}
    </Sheet>
  )
}
