// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Rows.kt (SettingRow, InfoButton, TipBox, LinkRow, Disclosure) and Components.kt (GridPlate, the row card)
//
// The one row pattern of Settings and the Live tools (the Step 1c redesign):
// the name on the left, the control on the right. The row's one-line note
// (and the long note, where there is more to say) waits behind an ⓘ key after
// the name, which unfolds them under the row in a tinted tip box, the note
// first. Rows sit in a RowCard (a plate split by thin lines); a danger card
// has a red outline and red text actions (RowAction).
//
// Web: the control gets the ids of the name and the note (labelledBy /
// describedBy), so a switch or a radio group is read with them; the note
// stays in the page while the tip is folded (hidden), so it still describes
// the control. The ⓘ key is a button with aria-expanded over the tip. A link
// row (LinkRow) is one button, its chevron drawn, not written.
import type { ComponentChildren, JSX } from 'preact'
import { useId, useState } from 'preact/hooks'
import { SettingsText } from '../../core/text/settingsText'
import type { CoachId } from './Coach'
import { Icon, type ArcIcon } from './Icons'
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
  /** The one-line note, first behind the ⓘ key. */
  note?: string
  /** The long note behind the ⓘ key, after the note (neither: no key). */
  info?: string
  /** For screenshots: start with the notes open. */
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
  const tip = Boolean(note) || Boolean(info)
  return (
    <div id={props.id} class={`setting-row${stack ? ' setting-row--stack' : ''}${props.class ? ` ${props.class}` : ''}`}>
      <div class="setting-row__line">
        <div class="setting-row__text">
          <span class="setting-row__title">
            <span id={titleId}>{title}</span>
            {tip && (
              <InfoKey open={open} onToggle={() => setOpen(!open)} controls={tipId} describedBy={titleId} />
            )}
          </span>
        </div>
        {props.control && <div class="setting-row__control">{props.control({ titleId, noteId })}</div>}
      </div>
      {tip && (
        <div class="setting-row__tip" id={tipId} hidden={!open}>
          {note && <p id={noteId}>{note}</p>}
          {info && <p>{info}</p>}
        </div>
      )}
    </div>
  )
}

/** The ⓘ key: a round "i", filled navy while its notes are open; described by its row's name. */
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

/**
 * A row that opens something (Source code, Font licence, Debug log): the whole
 * row is the button, so it has no ⓘ key (Kotlin's note behind one: none here
 * has a note). [icon]: drawn before the name (Live tools' Settings row).
 * [coach]: the guide overlay's id for it (data-coach).
 */
export function LinkRow(props: { title: string; onClick: () => void; icon?: ArcIcon; coach?: CoachId }): JSX.Element {
  return (
    <button type="button" class={`setting-row link-row${props.icon ? ' link-row--icon' : ''}`} data-coach={props.coach} onClick={props.onClick}>
      <span class="setting-row__line">
        {props.icon && <Icon icon={props.icon} size={22} />}
        <span class="setting-row__text">
          <span class="setting-row__title">{props.title}</span>
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
