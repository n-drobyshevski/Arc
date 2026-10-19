// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/PadSheet.kt (PadSheetContent: EDIT's pad sheet)
//
// Live's EDIT: the sheet a pad opens (a tap with EDIT on, or a right-click on
// the desk). The pad's cap (held, it plays the pad) with its title and the
// sound on it now; the pad's sound settings (PadEditPages: PITCH, LEVEL and
// SOUND, TRIM, ENV, MIDI, MUTE), read from the device as the sheet opens and
// written as they are turned (offline: kept in arc), over the sounds folded
// behind CHANGE SOUND; then the
// device's sounds (live/SoundPicker: find, range keys, rows with a preview,
// the current one marked ON PAD); a tap on a row puts that sound on the pad
// at once (the toast offers UNDO), and "Upload a new sample…" goes through
// the upload sheet, then onto the pad. Offline (an addition) the last read's
// sounds and the factory pack's, picked for the pad in arc only (no upload).
//
// Also Root's mount (MainActivity.kt, Tab.LIVE): the sheet 'edit:<group>:<offset>'.
// Web: the request is a history layer; once Live can't change the pad (not
// connected after a reload, say) the layer is dropped, so Back has nothing
// hidden to close. Root drops it too when the EP-133 comes or goes, as
// MainActivity closes the sheet on a change of ready.
import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { physicalPad, type PhysicalPad } from '../../core/features/padNotes'
import { FeatureText } from '../../core/text/featureText'
import { MirrorText } from '../../core/text/mirrorText'
import { useController, useNav } from '../AppContext'
import { Key } from '../components/Key'
import { Sheet } from '../components/Sheet'
import { useDeviceKeys } from '../live/DeviceKeys'
import { SoundPicker } from '../live/SoundPicker'
import { sheetLayer, type NavView } from '../nav'
import { PadEditPages } from './PadEditPages'
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
  const pad = editPadOf(props.view.sheets)
  // The mirror only while a pad is open: closed, a publish or a pad played doesn't re-render it (the list's rows follow a preview).
  const state = pad !== null ? c.state.value : c.stateShell.value
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
  // EDIT's pages: the pad's sound settings, read as the sheet opens (MainActivity's LaunchedEffect(padSheet)).
  const slot = target?.slot ?? null
  const connected = state.device !== null
  useEffect(() => {
    if (pad === null || slot === null) return
    c.openPadEdit(pad)
    return () => c.closePadEdit()
  }, [id, slot, connected])
  const edit = c.padEdit.edit.value
  // The drawn device's EDIT page shares its page with the sheet (PadEditPages' padPage).
  const fromDeviceEdit = useDeviceKeys()?.layer.state.peek().page === 'EDIT'
  const editing = edit !== null && pad !== null && edit.pad.group === pad.group && edit.pad.offset === pad.offset && slot !== null
  // With the settings shown, the sounds fold away until asked for; only a choice made is kept.
  const [listChoice, setListChoice] = useState<boolean | null>(null)
  useEffect(() => setListChoice(null), [id])
  const listOpen = listChoice ?? !editing
  // The cap plays the pad while held, as Live does (a try: never a pattern's note).
  const held = useRef<PhysicalPad | null>(null)
  const lift = (): void => {
    const h = held.current
    held.current = null
    if (h !== null) c.releaseTry(h)
  }
  useEffect(() => lift, [id])
  const name = pad !== null ? c.mirrorName(pad) : null
  // Offline: the last read's sounds and the factory pack's, the pad's own list first.
  const offline = state.device === null ? (state.mirror?.offlineSounds ?? null) : null
  const sounds = offline !== null ? (offline.device ?? []) : c.liveSounds()
  const padSource = pad !== null ? c.padSource(pad) : null
  // The sound on the pad now, by its slot (the mirror may not know which pad is which yet).
  const now =
    target?.slot == null || pad === null
      ? null
      : offline !== null
        ? (c.padSoundName(pad) ?? name)
        : (sounds.find((snd) => snd.slot === target.slot)?.name ?? name)
  return (
    <Sheet open={pad !== null && target !== null} onDismiss={close} labelledBy="arc-pad-edit-title">
      {pad !== null && target !== null && (
        <>
          <div class="pad-edit__head">
            <button
              type="button"
              class="pad-edit__cap cap-3d"
              aria-label={FeatureText.play(name ?? now ?? pad.label)}
              disabled={slot === null}
              onPointerDown={(e) => {
                if (e.button !== 0 || held.current !== null) return
                e.preventDefault()
                ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
                held.current = pad
                void c.tryPad(pad, e.timeStamp)
              }}
              onPointerUp={lift}
              onPointerCancel={lift}
              onKeyDown={(e) => {
                if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && held.current === null) {
                  e.preventDefault()
                  held.current = pad
                  void c.tryPad(pad)
                }
              }}
              onKeyUp={(e) => {
                if (e.key === ' ' || e.key === 'Enter') lift()
              }}
              onBlur={lift}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span class="pad-edit__label">{pad.label}</span>
              {(name ?? now) !== null && <span class="pad-edit__name">{name ?? now}</span>}
            </button>
            <div class="pad-edit__words">
              <h2 id="arc-pad-edit-title" tabIndex={-1} class="t-heading pad-edit__title">{MirrorText.padTitle(pad)}</h2>
              <p class="t-small pad-edit__line">{MirrorText.padSheetLine(target.project, target.slot, now)}</p>
            </div>
          </div>
          {editing && edit !== null && (
            <>
              <PadEditPages
                key={id}
                // A pad's sheet opens on SOUND, as on Android; opened from the drawn device's EDIT page, on its page.
                initialPage={fromDeviceEdit ? undefined : 'SOUND'}
                settings={edit.settings}
                onChange={(v) => c.adjustPad(v)}
                frames={edit.frames}
                sampleRate={edit.sampleRate}
                peaks={edit.peaks}
                enabled={!edit.reading && !edit.failed}
              />
              <p class="t-small pad-edit__note">
                {edit.reading
                  ? MirrorText.PAD_READING
                  : edit.failed
                    ? MirrorText.PAD_READ_FAILED
                    : edit.offline
                      ? MirrorText.PAD_SETTINGS_OFFLINE
                      : MirrorText.PAD_SETTINGS_NOTE}
              </p>
              <Key text={listOpen ? MirrorText.HIDE_SOUNDS : MirrorText.CHANGE_SOUND} variant="quiet" block onClick={() => setListChoice(!listOpen)} />
            </>
          )}
          {listOpen && (
          <>
          <SoundPicker
            sounds={sounds}
            factory={offline?.factory ?? null}
            unavailable={offline?.unavailable}
            readSlot={offline !== null && pad !== null ? c.padReadSlot(pad) : null}
            offline={offline !== null}
            current={target.slot}
            padSource={padSource}
            playing={c.playing}
            onPlay={(slot, source) => void c.playLiveSound(slot, source)}
            onStop={() => c.stopPlayback()}
            onPick={(snd, source) => {
              close()
              void c.assignPad(pad, snd.slot, source)
            }}
            findLabel={MirrorText.FIND_FOR_PAD}
            // Offline a pick stays in arc: it doesn't wait for the device.
            disabled={state.busy && offline === null}
          />
          {offline === null && (
            <Key
              text={MirrorText.UPLOAD_NEW}
              block
              disabled={state.busy}
              onClick={() => {
                close()
                void c.pickForPad(pad)
              }}
            />
          )}
          <p class="t-small pad-edit__note">{offline !== null ? MirrorText.ASSIGN_NOTE_OFFLINE : MirrorText.ASSIGN_NOTE}</p>
          </>
          )}
        </>
      )}
    </Sheet>
  )
}
