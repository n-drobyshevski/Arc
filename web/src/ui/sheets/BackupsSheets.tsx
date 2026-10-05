// Port of the Backups tab's sheets in app/src/main/kotlin/dev/arc/ep133/MainActivity.kt
// (Root(): `if (tab == Tab.BACKUPS) { ... }` — detail, compare picker, restore, delete dialog).
//
// app.tsx mounts this while the shell is in front on the Backups tab. Which
// sheet is open comes from the navigation stack (sheet ids 'detail:<id>',
// 'comparePick:<id>', 'restore:<id>', dialog 'delete'), so Back, Escape and the
// scrim all close through it.
//
// Web deltas:
// - Root's titleField / notesField live here, per opened backup. They are
//   saved whenever the detail sheet goes away (its layer leaves the stack,
//   or this unmounts because a full screen opened over it), except after a
//   delete; Android does closeDetail(save = true) at each of those call sites.
// - closeRestore's clearDiff runs whenever the restore sheet goes away.
// - A layer for a backup that no longer exists (deleted elsewhere, or a
//   reload) is dropped once the library has loaded, so Back never closes an
//   invisible sheet.
import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { BackupRecord } from '../../core/text/libraryRules'
import { useController, useNav } from '../AppContext'
import { dialogLayer, screenLayer, sheetLayer, type NavView } from '../nav'
import { Sheet } from '../components/Sheet'
import { COMPARE_PICK_TITLE_ID, ComparePicker } from './ComparePicker'
import { DeleteDialog } from './DeleteDialog'
import { DetailSheet } from './DetailSheet'
import { RESTORE_TITLE_ID, RestoreSheet } from './RestoreSheet'

/** The id after [prefix] of the topmost open sheet with it, or null. */
export function sheetArg(sheets: readonly string[], prefix: string): string | null {
  for (let i = sheets.length - 1; i >= 0; i--) {
    const s = sheets[i] as string
    if (s.startsWith(prefix)) return s.slice(prefix.length)
  }
  return null
}

interface Fields {
  readonly id: string
  /** The opening these edits belong to: each opening starts from the record (Root's onOpen). */
  readonly opening: number
  readonly title: string
  readonly notes: string
}

export function BackupsSheets(props: { view: NavView }): JSX.Element {
  const c = useController()
  const nav = useNav()
  const v = props.view
  const state = c.state.value
  const find = (id: string | null): BackupRecord | null => (id === null ? null : state.backups.find((b) => b.id === id) ?? null)

  const detailId = sheetArg(v.sheets, 'detail:')
  const pickId = sheetArg(v.sheets, 'comparePick:')
  const restoreId = sheetArg(v.sheets, 'restore:')
  const detail = find(detailId)
  const pickFor = find(pickId)
  const restore = find(restoreId)
  const deleteOpen = v.dialogs.includes('delete')

  // Stale layers: their backup is gone (or never came back after a reload).
  useEffect(() => {
    if (!state.libraryLoaded) return
    if (detailId !== null && detail === null) nav.close(sheetLayer(`detail:${detailId}`))
    if (pickId !== null && pickFor === null) nav.close(sheetLayer(`comparePick:${pickId}`))
    if (restoreId !== null && restore === null) nav.close(sheetLayer(`restore:${restoreId}`))
    if (deleteOpen && detail === null) nav.close(dialogLayer('delete'))
  }, [state.libraryLoaded, detailId, detail === null, pickId, pickFor === null, restoreId, restore === null, deleteOpen])

  // ---- detail: the fields, saved when the sheet goes away ----
  // Each opening counts once, so edits from an earlier opening (which saveEdits
  // may have trimmed or refused, e.g. a blank title) never come back.
  const detailOpenings = useRef({ id: null as string | null, n: 0 })
  if (detailId !== null && detailOpenings.current.id !== detailId) detailOpenings.current = { id: detailId, n: detailOpenings.current.n + 1 }
  if (detailId === null && detailOpenings.current.id !== null) detailOpenings.current = { ...detailOpenings.current, id: null }
  const opening = detailOpenings.current.n
  const [fields, setFields] = useState<Fields | null>(null)
  const cur: Fields | null = detail !== null
    ? fields !== null && fields.id === detail.id && fields.opening === opening
      ? fields
      : { id: detail.id, opening, title: detail.title, notes: detail.notes }
    : fields
  const curRef = useRef(cur)
  curRef.current = cur
  const skipSave = useRef(false)
  useEffect(() => {
    if (detailId === null) return
    skipSave.current = false
    return () => {
      const f = curRef.current
      if (skipSave.current || f === null || f.id !== detailId) return
      // Not after a delete (or when the backup went away some other way).
      const b = c.state.peek().backups.find((x) => x.id === detailId)
      if (b) void c.saveEdits(b, f.title, f.notes)
    }
  }, [detailId])

  const closeDetail = (): void => {
    if (detailId !== null) nav.close(sheetLayer(`detail:${detailId}`))
  }
  const fromDetail = (to: Parameters<typeof nav.replace>[1]): void => {
    if (detailId !== null) nav.replace(sheetLayer(`detail:${detailId}`), to)
  }

  // ---- restore: clearDiff when it goes away ----
  useEffect(() => {
    if (restoreId === null) return
    return () => c.clearDiff()
  }, [restoreId])
  const closeRestore = (): void => {
    if (restoreId !== null) nav.close(sheetLayer(`restore:${restoreId}`))
  }

  // The last record of each sheet, shown while it animates out (Root's shownDetail / shownRestore / lastPickFor).
  const lastDetail = useRef<BackupRecord | null>(null)
  if (detail) lastDetail.current = detail
  const lastPick = useRef<BackupRecord | null>(null)
  if (pickFor) lastPick.current = pickFor
  // Each opening starts the restore choices afresh (a new key, a new RestoreSheet).
  const restoreOpenings = useRef({ id: null as string | null, n: 0 })
  if (restore && restoreOpenings.current.id !== restore.id) restoreOpenings.current = { id: restore.id, n: restoreOpenings.current.n + 1 }
  if (!restore) restoreOpenings.current = { ...restoreOpenings.current, id: null }
  const lastRestore = useRef<BackupRecord | null>(null)
  if (restore) lastRestore.current = restore

  const shownDetail = lastDetail.current
  const shownRestore = lastRestore.current
  const shownPick = lastPick.current

  return (
    <>
      <Sheet open={detail !== null} onDismiss={closeDetail} label={shownDetail?.title}>
        {shownDetail && cur && (
          <DetailSheet
            b={shownDetail}
            title={cur.id === shownDetail.id ? cur.title : shownDetail.title}
            onTitle={(t) => cur && setFields({ ...cur, title: t })}
            notes={cur.id === shownDetail.id ? cur.notes : shownDetail.notes}
            onNotes={(n) => cur && setFields({ ...cur, notes: n })}
            madeText={c.fmtDateTime(shownDetail.createdAt)}
            canRestore={state.device !== null && !state.busy}
            connected={state.device !== null}
            onRestore={() => fromDetail(sheetLayer(`restore:${shownDetail.id}`))}
            onShare={() => void c.sharePak(shownDetail)}
            onSave={() => void c.savePak(shownDetail)}
            onContents={() => fromDetail(screenLayer({ kind: 'contents', id: shownDetail.id }))}
            onCompareBackups={state.backups.length >= 2 ? () => fromDetail(sheetLayer(`comparePick:${shownDetail.id}`)) : null}
            onDelete={() => nav.open(dialogLayer('delete'))}
            onDone={closeDetail}
          />
        )}
      </Sheet>

      <Sheet open={pickFor !== null} onDismiss={() => pickId !== null && nav.close(sheetLayer(`comparePick:${pickId}`))} labelledBy={COMPARE_PICK_TITLE_ID}>
        {shownPick && (
          <ComparePicker
            others={state.backups.filter((b) => b.id !== shownPick.id)}
            fmtDay={(ms) => c.fmtDay(ms)}
            onPick={(other) => nav.replace(sheetLayer(`comparePick:${shownPick.id}`), screenLayer({ kind: 'compare', a: shownPick.id, b: other.id }))}
            onCancel={() => nav.close(sheetLayer(`comparePick:${shownPick.id}`))}
          />
        )}
      </Sheet>

      <Sheet open={restore !== null} onDismiss={closeRestore} labelledBy={RESTORE_TITLE_ID}>
        {shownRestore && (
          <RestoreSheet
            key={`${shownRestore.id}:${restoreOpenings.current.n}`}
            b={shownRestore}
            onRestore={(sel) => {
              closeRestore()
              c.clearDiff()
              void c.restore(shownRestore, sel)
            }}
            onCancel={closeRestore}
            diff={state.diff}
            canCompare={state.device !== null && !state.busy}
            onCompare={(sel) => void c.compare(shownRestore, sel)}
          />
        )}
      </Sheet>

      <DeleteDialog
        open={deleteOpen && detail !== null}
        title={detail?.title ?? ''}
        onDismiss={() => nav.close(dialogLayer('delete'))}
        onConfirm={() => {
          const b = detail
          nav.close(dialogLayer('delete'))
          if (!b) return
          // Close (without saving edits) only once the delete worked.
          skipSave.current = true
          void c.delete(b).then((ok) => {
            if (ok) nav.close(sheetLayer(`detail:${b.id}`))
            else skipSave.current = false
          })
        }}
      />
    </>
  )
}
