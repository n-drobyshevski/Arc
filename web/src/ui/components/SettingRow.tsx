// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Rows.kt (SettingRow, InfoButton, TipBox, LinkRow, Disclosure) and Components.kt (GridPlate, the row card)
//
// The one row pattern of Settings and the Live tools (the Step 1c redesign):
// the name and a one-line note on the left, the control on the right. Where
// there is more to say, an ⓘ key after the name unfolds the long note under
// the row in a tinted tip box. Rows sit in a RowCard (a plate split by thin
// lines); a danger card has a red outline and red text actions (RowAction).
//
// Web: the control gets the ids of the name and the note (labelledBy /
// describedBy), so a switch or a radio group is read with them; the ⓘ key is
// a button with aria-expanded over the tip. A link row (LinkRow) is one
// button, its chevron drawn, not written.
import type { ComponentChildren, JSX } from 'preact'
import { useId, useState } from 'preact/hooks'
import { SettingsText } from '../../core/text/settingsText'
import './SettingRow.css'

/** The ids a row's control is named and described by. */
export interface RowIds {
  /** The name's id (aria-labelledby). */
  titleId: string
  /** The note's id (aria-describedby), undefined without a note. */
  noteId: string | undefined
}

export interface SettingRowProps {
  title: string
  /** The one-line note under the name. */
  note?: string
  /** The long note behind the ⓘ key (none: no key). */
  info?: string
  /** For screenshots: start with the long note open. */
  initialInfoOpen?: boolean
  /** The control under the text, full width (a choice too wide to sit beside it). */
  stack?: boolean
  /** The control on the right, given the ids that name it. */
  control?: (ids: RowIds) => ComponentChildren
  class?: string
  id?: string
}

export function SettingRow(props: SettingRowProps): JSX.Element {
  const { title, note, info, stack = false } = props
  const base = useId()
  const titleId = `${base}-t`
  const noteId = note ? `${base}-n` : undefined
  const tipId = `${base}-i`
  const [open, setOpen] = useState(props.initialInfoOpen ?? false)
  return (
    <div id={props.id} class={`setting-row${stack ? ' setting-row--stack' : ''}${props.class ? ` ${props.class}` : ''}`}>
      <div class="setting-row__line">
        <div class="setting-row__text">
          <span class="setting-row__title">
            <span id={titleId}>{title}</span>
            {info && (
              <InfoKey open={open} onToggle={() => setOpen(!open)} controls={tipId} describedBy={titleId} />
            )}
          </span>
          {note && <span class="setting-row__note" id={noteId}>{note}</span>}
        </div>
        {props.control && <div class="setting-row__control">{props.control({ titleId, noteId })}</div>}
      </div>
      {info && open && (
        <p class="setting-row__tip" id={tipId}>
          {info}
        </p>
      )}
    </div>
  )
}

/** The ⓘ key: a round "i", filled navy while its note is open; described by its row's name. */
export function InfoKey(props: { open: boolean; onToggle: () => void; controls: string; describedBy?: string }): JSX.Element {
  return (
    <button
      type="button"
      class={`info-key${props.open ? ' is-open' : ''}`}
      aria-label={SettingsText.MORE_INFO}
      aria-expanded={props.open}
      aria-controls={props.open ? props.controls : undefined}
      aria-describedby={props.describedBy}
      onClick={props.onToggle}
    >
      <span aria-hidden="true">i</span>
    </button>
  )
}

/** A plate of rows split by thin lines; [danger]: outlined red (what can't be undone). */
export function RowCard(props: {
  children: ComponentChildren
  danger?: boolean
  class?: string
  id?: string
  'aria-labelledby'?: string
}): JSX.Element {
  return (
    <div
      id={props.id}
      class={`row-card${props.danger ? ' row-card--danger' : ''}${props.class ? ` ${props.class}` : ''}`}
      role={props['aria-labelledby'] ? 'group' : undefined}
      aria-labelledby={props['aria-labelledby']}
    >
      {props.children}
    </div>
  )
}

/** A text action on the right of a row (Forget, Clear): no cap, caps text; [danger] in red. */
export function RowAction(props: {
  text: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  describedBy?: string | undefined
}): JSX.Element {
  return (
    <button
      type="button"
      class={`row-action${props.danger ? ' row-action--danger' : ''}`}
      disabled={props.disabled}
      aria-describedby={props.describedBy}
      onClick={props.onClick}
    >
      {props.text}
    </button>
  )
}

/** A row that opens something (Source code, Font licence, Debug log): the whole row is the button. */
export function LinkRow(props: { title: string; onClick: () => void; note?: string }): JSX.Element {
  return (
    <button type="button" class="setting-row link-row" onClick={props.onClick}>
      <span class="setting-row__line">
        <span class="setting-row__text">
          <span class="setting-row__title">{props.title}</span>
          {props.note && <span class="setting-row__note">{props.note}</span>}
        </span>
        <svg class="link-row__chevron" width="8" height="12" viewBox="0 0 8 12" aria-hidden="true" focusable="false">
          <path d="M1.5 1.5L6 6l-4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    </button>
  )
}

/** A disclosure card (How Live reads the EP-133): ⓘ, the title and a chevron; open, the notes under it. */
export function Disclosure(props: {
  title: string
  children: ComponentChildren
  initialOpen?: boolean
  /** Told each time it opens or closes (to open it the same way next time). */
  onToggle?: (open: boolean) => void
  class?: string
}): JSX.Element {
  const id = useId()
  const [open, setOpen] = useState(props.initialOpen ?? false)
  return (
    <div class={`row-card disclosure${open ? ' is-open' : ''}${props.class ? ` ${props.class}` : ''}`}>
      <button
        type="button"
        class="disclosure__head"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setOpen(!open)
          props.onToggle?.(!open)
        }}
      >
        <span class="info-key info-key--static" aria-hidden="true">i</span>
        <span class="disclosure__title">{props.title}</span>
        <svg class="disclosure__chevron" width="8" height="12" viewBox="0 0 8 12" aria-hidden="true" focusable="false">
          <path d="M1.5 1.5L6 6l-4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      {open && (
        <div class="disclosure__body" id={id}>
          {props.children}
        </div>
      )}
    </div>
  )
}
