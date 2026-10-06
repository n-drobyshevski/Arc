// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/PadSheet.kt (PadSheetContent: EDIT's pad sheet)
//
// Live's EDIT: the sheet a pad opens (a tap with EDIT on, or a right-click on
// the desk). The pad's cap with its title and the sound on it now, then the
// device's sounds (live/SoundPicker: find, range keys, rows with a preview,
// the current one marked ON PAD); a tap on a row puts that sound on the pad
// at once (the toast offers UNDO), and "Upload a new sample…" goes through
// the upload sheet, then onto the pad.
//
// Also Root's mount (MainActivity.kt, Tab.LIVE): the sheet 'edit:<group>:<offset>'.
// Web: the request is a history layer; once Live can't change the pad (not
// connected after a reload, say) the layer is dropped, so Back has nothing
// hidden to close.
import type { JSX } from 'preact'
import { useEffect } from 'preact/hooks'
import { physicalPad, type PhysicalPad } from '../../core/features/padNotes'
import { MirrorText } from '../../core/text/mirrorText'
import { useController, useNav } from '../AppContext'
import { Key } from '../components/Key'
import { Sheet } from '../components/Sheet'
import { SoundPicker } from '../live/SoundPicker'
import { sheetLayer, type NavView } from '../nav'
import './PadEditSheet.css'

/** The pad sheet's layer id prefix: 'edit:<group>:<offset>'. */
export const EDIT_PREFIX = 'edit:'

/** The pad a sheet layer id names, or null. */
export function editPadOf(sheets: readonly string[]): PhysicalPad | null {
  for (const id of sheets) {
    const m = /^edit:([0-3]):(\d{1,2})$/.exec(id)
    if (m && Number(m[2]) <= 11) return physicalPad(Number(m[1]), Number(m[2]))
  }
  return null
}

export function PadEditSheet(props: { view: NavView }): JSX.Element {
  const c = useController()
  const nav = useNav()
  const state = c.state.value
  const playing = c.playing.value
  const pad = editPadOf(props.view.sheets)
  const id = pad !== null ? `${EDIT_PREFIX}${pad.group}:${pad.offset}` : null
  const target = pad !== null ? c.editTarget(pad, true) : null
  const close = (): void => {
    if (id !== null) nav.close(sheetLayer(id))
  }
  // Nothing to change any more (offline, or the project moved on): drop the layer.
  const gone = id !== null && target === null && state.mirror?.loading !== true
  useEffect(() => {
    if (gone) close()
  }, [gone])
  const name = pad !== null ? c.mirrorName(pad) : null
  const sounds = c.liveSounds()
  // The sound on the pad now, by its slot (the mirror may not know which pad is which yet).
  const now = target?.slot != null ? (sounds.find((snd) => snd.slot === target.slot)?.name ?? name) : null
  return (
    <Sheet open={pad !== null && target !== null} onDismiss={close} labelledBy="arc-pad-edit-title">
      {pad !== null && target !== null && (
        <>
          <div class="pad-edit__head">
            <span class="pad-edit__cap cap-3d" aria-hidden="true">
              <span class="pad-edit__label">{pad.label}</span>
              {(name ?? now) !== null && <span class="pad-edit__name">{name ?? now}</span>}
            </span>
            <div class="pad-edit__words">
              <h2 id="arc-pad-edit-title" tabIndex={-1} class="t-heading pad-edit__title">{MirrorText.padTitle(pad)}</h2>
              <p class="t-small pad-edit__line">{MirrorText.padSheetLine(target.project, target.slot, now)}</p>
            </div>
          </div>
          <SoundPicker
            sounds={sounds}
            current={target.slot}
            playing={playing}
            onPlay={(slot) => void c.playDeviceSound(slot)}
            onStop={() => c.stopPlayback()}
            onPick={(snd) => {
              close()
              void c.assignPad(pad, snd.slot)
            }}
            findLabel={MirrorText.FIND_FOR_PAD}
            disabled={state.busy}
          />
          <Key
            text={MirrorText.UPLOAD_NEW}
            block
            disabled={state.busy}
            onClick={() => {
              close()
              void c.pickForPad(pad)
            }}
          />
          <p class="t-small pad-edit__note">{MirrorText.ASSIGN_NOTE}</p>
        </>
      )}
    </Sheet>
  )
}
