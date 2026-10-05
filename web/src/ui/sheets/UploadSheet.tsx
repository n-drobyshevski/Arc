// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/DeviceScreen.kt (UploadSheetContent)
//
// The upload sheet: one row per picked file, with its target slot. Also Root's
// mount of it (MainActivity.kt, Tab.DEVICE): the sheet shows while there is a
// draft, and its content is swapped for the trim view of one row.
//
// Web deltas: the sheet and the trim view are navigation layers ('upload',
// 'trim:<i>'), so the browser Back closes the trim view first, then drops the
// draft; a reload (which loses the draft) closes both.
import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { FIRST_SLOT, LAST_SLOT } from '../../core/features/sampleUpload'
import { seconds } from '../../core/features/sampleTrim'
import { FeatureText } from '../../core/text/featureText'
import { Strings } from '../../core/text/strings'
import type { UploadDraftItem } from '../../state/types'
import { useController, useNav } from '../AppContext'
import { Field } from '../components/Field'
import { Key } from '../components/Key'
import { Sheet } from '../components/Sheet'
import { sheetLayer, type NavView } from '../nav'
import { soundNames } from '../screens/DeviceScreen'
import { TRIM_PLAY_KEY, TrimSheetContent } from './TrimSheet'
import './UploadSheet.css'

export interface UploadSheetContentProps {
  draft: readonly UploadDraftItem[]
  /** Slot to the name of the sound on it now. */
  occupied: ReadonlyMap<number, string>
  busy: boolean
  onSlot: (index: number, slot: number | null) => void
  onUpload: () => void
  onCancel: () => void
  onTrim: (index: number) => void
  /** Id of the title, for the sheet's aria-labelledby. */
  titleId?: string
}

// ---------- pure helpers (tested in test/ui/deviceScreen.test.ts) ----------

// Char.isDigit on the JVM is Unicode Nd, per UTF-16 unit.
const ND = /^\p{Nd}$/u
const isDigitUnit = (u: number): boolean => ND.test(String.fromCharCode(u))

/** Character.digit(c, 10) for an Nd unit: BMP Nd digits come in runs of ten, 0 first. */
function digitValue(u: number): number {
  let d = 0
  while (d < 9 && isDigitUnit(u - d - 1)) d++
  return d
}

/** What the slot field keeps of a typed value: its digits, at most three (`filter { isDigit() }.take(3)`). */
export function slotDigits(v: string): string {
  let out = ''
  for (let i = 0; i < v.length && out.length < 3; i++) if (isDigitUnit(v.charCodeAt(i))) out += v[i]
  return out
}

/** The slot those digits name, or null when empty or outside FIRST_SLOT..LAST_SLOT. */
export function slotOf(digits: string): number | null {
  if (digits.length === 0) return null
  let n = 0
  for (let i = 0; i < digits.length; i++) n = n * 10 + digitValue(digits.charCodeAt(i))
  return n >= FIRST_SLOT && n <= LAST_SLOT ? n : null
}

/** The note under a row's slot field ("" for none). */
export function slotNote(slot: number | null, occupied: ReadonlyMap<number, string>): string {
  if (slot === null) return FeatureText.NO_FREE_SLOT
  const name = occupied.get(slot)
  return name !== undefined ? FeatureText.replaces(name) : ''
}

export interface UploadCheck {
  /** The first slot two usable rows share, or null. */
  dup: number | null
  /** Usable rows that have a slot. */
  ready: number
  /** Whether Upload can be pressed. */
  ok: boolean
}

/** Kotlin's dup / ready / ok of UploadSheetContent. */
export function uploadCheck(draft: readonly UploadDraftItem[], busy: boolean): UploadCheck {
  const usable = draft.filter((it) => it.wav !== null)
  const seen = new Map<number, number>()
  for (const it of usable) if (it.slot !== null) seen.set(it.slot, (seen.get(it.slot) ?? 0) + 1)
  let dup: number | null = null
  for (const [slot, count] of seen) {
    if (count > 1) {
      dup = slot
      break
    }
  }
  const ready = usable.filter((it) => it.slot !== null).length
  return { dup, ready, ok: ready > 0 && ready === usable.length && dup === null && !busy }
}

// ---------- the sheet's content ----------

export function UploadSheetContent(props: UploadSheetContentProps): JSX.Element {
  const { draft, occupied, busy } = props
  const check = uploadCheck(draft, busy)
  return (
    <>
      <h2 id={props.titleId} tabIndex={-1} class="t-heading upload-sheet__title">{FeatureText.UPLOAD_TITLE}</h2>
      <p class="t-small upload-sheet__dim">{FeatureText.UPLOAD_HINT}</p>
      {draft.map((item, i) => (
        <DraftRow
          // The field keeps what is typed, per row and file (rememberSaveable(i, item.fileName)).
          key={`${i}:${item.fileName}`}
          item={item}
          occupied={occupied}
          busy={busy}
          trimId={trimKeyId(i)}
          onSlot={(slot) => props.onSlot(i, slot)}
          onTrim={() => props.onTrim(i)}
        />
      ))}
      {check.dup !== null && <p class="t-small upload-sheet__danger" role="alert">{FeatureText.duplicateSlot(check.dup)}</p>}
      <Key
        text={FeatureText.uploadButton(check.dup === null ? check.ready : 0)}
        onClick={props.onUpload}
        variant="signal"
        block
        disabled={!check.ok}
      />
      <Key text={Strings.CANCEL} onClick={props.onCancel} variant="quiet" block />
    </>
  )
}

function DraftRow(props: {
  item: UploadDraftItem
  occupied: ReadonlyMap<number, string>
  busy: boolean
  /** Id of the row's Trim key (focus returns to it from the trim view). */
  trimId: string
  onSlot: (slot: number | null) => void
  onTrim: () => void
}): JSX.Element {
  const { item } = props
  const [text, setText] = useState(item.slot?.toString() ?? '')
  const note = slotNote(item.slot, props.occupied)
  const t = item.trim
  return (
    <div class="upload-row" role="group" aria-label={item.name}>
      <p class="t-bold upload-row__name">{item.name}</p>
      {item.name !== item.fileName && <p class="t-small upload-row__file">{item.fileName}</p>}
      {item.error !== null ? (
        <p class="t-small upload-sheet__danger">{FeatureText.unusable(item.error)}</p>
      ) : (
        <>
          {/* The field keeps what is typed; the slot is only set when it is a valid number. */}
          <Field
            label={FeatureText.SLOT}
            value={text}
            inputMode="numeric"
            onValueChange={(v) => {
              const digits = slotDigits(v)
              setText(digits)
              props.onSlot(slotOf(digits))
            }}
          />
          {note !== '' && <p class="t-small upload-sheet__dim" aria-live="polite">{note}</p>}
          <div class="upload-row__trim">
            <p class="t-small upload-sheet__dim upload-row__trimmed">
              {t !== null ? FeatureText.trimmed(seconds(t.end - t.start, item.sampleRate)) : ''}
            </p>
            <Key id={props.trimId} text={FeatureText.TRIM} onClick={props.onTrim} size="small" disabled={props.busy} />
          </div>
        </>
      )}
    </div>
  )
}

// ---------- Root's mount (Tab.DEVICE) ----------

/** Id of draft row [i]'s Trim key. */
export const trimKeyId = (i: number): string => `arc-upload-trim-${i}`

/** The trim layer's row index, if one is open. */
export function trimIndexOf(sheets: readonly string[]): number | null {
  const id = sheets.find((s) => s.startsWith('trim:'))
  if (id === undefined) return null
  const rest = id.slice(5)
  return /^\d+$/.test(rest) ? Number(rest) : null
}

/** The upload sheet over the Device tab, with the trim view swapped in. */
export function DeviceUploadSheet(props: { view: NavView }): JSX.Element {
  const c = useController()
  const nav = useNav()
  const state = c.state.value
  const playing = c.playing.value
  const draft = state.browser.draft
  const sheets = props.view.sheets
  const hasUpload = sheets.includes('upload')
  const trimId = sheets.find((s) => s.startsWith('trim:')) ?? null
  const trimIndex = trimIndexOf(sheets)

  // Keep the 'upload' layer in step with the draft: open it with a new draft,
  // drop the draft when Back took the layer away, close it once the draft is gone.
  const opened = useRef(false)
  useEffect(() => {
    if (draft !== null) {
      if (hasUpload) opened.current = true
      else if (opened.current) {
        opened.current = false
        c.dropDraft()
      } else {
        opened.current = true
        nav.open(sheetLayer('upload'))
      }
    } else {
      opened.current = false
      if (trimId !== null) nav.close(sheetLayer(trimId))
      if (nav.current.sheets.includes('upload')) nav.close(sheetLayer('upload'))
    }
  }, [draft !== null, hasUpload, trimId])

  // Leaving the trim view (or losing the draft) stops its preview (closeTrim).
  const wasTrimming = useRef(trimId !== null)
  useEffect(() => {
    if (wasTrimming.current && trimId === null && c.playing.peek() === TRIM_PLAY_KEY) c.stopPlayback()
    wasTrimming.current = trimId !== null
  }, [trimId])

  // The trim view replaces the sheet's content, so the key that opened it (or the
  // view itself) is gone: move focus into the new content instead of losing it to <body>.
  const lastTrimIndex = useRef<number | null>(trimIndex)
  useEffect(() => {
    const prev = lastTrimIndex.current
    lastTrimIndex.current = trimIndex
    if (draft === null || prev === trimIndex) return
    const target = trimIndex !== null
      ? document.getElementById('arc-trim-title')
      : (prev !== null ? document.getElementById(trimKeyId(prev)) : null) ?? document.getElementById('arc-upload-title')
    target?.focus({ preventScroll: trimIndex === null })
  }, [trimIndex])

  const closeTrim = (): void => {
    if (trimId !== null) nav.close(sheetLayer(trimId))
    if (c.playing.peek() === TRIM_PLAY_KEY) c.stopPlayback()
  }
  const drop = (): void => {
    opened.current = false
    c.dropDraft()
  }
  const trimming = trimIndex !== null && draft !== null ? draft[trimIndex] ?? null : null
  return (
    <Sheet
      open={draft !== null}
      onDismiss={() => (trimId !== null ? closeTrim() : drop())}
      labelledBy={trimming ? 'arc-trim-title' : 'arc-upload-title'}
    >
      {draft !== null && (trimming !== null && trimIndex !== null ? (
        <TrimSheetContent
          // A new file starts from its own trim (rememberSaveable(item.fileName)).
          key={`${trimIndex}:${trimming.fileName}`}
          titleId="arc-trim-title"
          item={trimming}
          playing={playing}
          onPlay={(pcm, ch, rate) => void c.playNow(TRIM_PLAY_KEY, pcm, ch, rate)}
          onStop={() => c.stopPlayback()}
          onDone={(range) => {
            c.setDraftTrim(trimIndex, range)
            closeTrim()
          }}
          onCancel={closeTrim}
        />
      ) : (
        <UploadSheetContent
          titleId="arc-upload-title"
          draft={draft}
          occupied={soundNames(state.browser.contents?.sounds)}
          busy={state.busy}
          onSlot={(i, slot) => c.setDraftSlot(i, slot)}
          onUpload={() => void c.uploadDraft()}
          onCancel={drop}
          onTrim={(i) => nav.open(sheetLayer(`trim:${i}`))}
        />
      ))}
    </Sheet>
  )
}
