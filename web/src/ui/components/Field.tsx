// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Components.kt (ArcField)
//
// A labelled text field (`.field` in styles.css): a caps graphite label, 6px
// above a key-coloured box (radius 10, padding 12/14) with a 1px rule along
// its bottom, a signal caret and a 3px signal ring while focused. Single-line
// fields use fieldInput (17/600), multi-line ones notesInput (15/500).
//
// Like BasicTextField, the field shows [value]: an edit the caller rejects
// (filters out) is undone, and input past [maxLength] is cut off.
import type { CSSProperties, JSX, Ref, TargetedInputEvent, TargetedKeyboardEvent } from 'preact'
import { useId, useLayoutEffect, useRef, useState } from 'preact/hooks'
import './Field.css'

/** onValueChange(it.take(maxLength)) */
export function takeChars(text: string, maxLength: number | undefined): string {
  if (maxLength === undefined || !Number.isFinite(maxLength) || maxLength < 0) return text
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

export interface FieldProps {
  label: string
  value: string
  onValueChange: (value: string) => void
  singleLine?: boolean
  /** Rows shown for a multi-line field (default 1). */
  minLines?: number
  placeholder?: string
  maxLength?: number
  /** KeyboardOptions: the on-screen keyboard (e.g. 'numeric'). */
  inputMode?: 'text' | 'numeric' | 'decimal' | 'search' | 'email' | 'tel' | 'url' | 'none'
  /** ImeAction (default 'done' for single-line fields). */
  enterKeyHint?: 'done' | 'go' | 'next' | 'search' | 'send' | 'enter' | 'previous'
  type?: 'text' | 'search'
  /** The field colour; the pale key colour unless it sits on a pale page. */
  background?: string
  autoComplete?: string
  autoFocus?: boolean
  disabled?: boolean
  /** Enter in a single-line field (ImeAction.Done). */
  onSubmit?: () => void
  class?: string
  id?: string
  ref?: Ref<HTMLInputElement | HTMLTextAreaElement>
}

export function Field(props: FieldProps): JSX.Element {
  const { label, value, onValueChange, singleLine = true, minLines = 1, placeholder = '', maxLength } = props
  const autoId = useId()
  const id = props.id ?? autoId
  const el = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  // Bumped on every edit so the effect below runs even when the caller keeps
  // the old value (rejects the edit) and nothing else re-renders.
  const [, setTick] = useState(0)
  useLayoutEffect(() => {
    const node = el.current
    if (node && node.value !== value) node.value = value
  })
  const onInput = (e: TargetedInputEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    const next = takeChars(e.currentTarget.value, maxLength)
    if (next !== e.currentTarget.value) e.currentTarget.value = next
    onValueChange(next)
    setTick((t) => t + 1)
  }
  const setRef = (node: HTMLInputElement | HTMLTextAreaElement | null): void => {
    el.current = node
    const r = props.ref
    if (typeof r === 'function') r(node)
    else if (r) r.current = node
  }
  const style: CSSProperties | undefined = props.background ? { background: props.background } : undefined
  const common = {
    id,
    ref: setRef,
    value,
    placeholder: placeholder || undefined,
    maxLength: maxLength !== undefined && Number.isFinite(maxLength) ? maxLength : undefined,
    inputMode: props.inputMode,
    autoComplete: props.autoComplete ?? 'off',
    autoFocus: props.autoFocus,
    disabled: props.disabled,
    spellcheck: false,
    style,
    onInput,
  }
  const single = {
    class: 'field__input',
    enterkeyhint: props.enterKeyHint ?? 'done',
    onKeyDown: (e: TargetedKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.isComposing && props.onSubmit) {
        e.preventDefault()
        props.onSubmit()
      }
    },
  } as const
  return (
    <div class={`field${props.class ? ` ${props.class}` : ''}`}>
      <label class="field__label" for={id}>{label}</label>
      {singleLine ? (
        props.type === 'search'
          ? <input {...common} {...single} type="search" />
          : <input {...common} {...single} type="text" />
      ) : (
        <textarea
          {...common}
          class="field__input field__input--multi"
          rows={Math.max(1, minLines)}
          style={{ ...style, '--min-lines': String(Math.max(1, minLines)) }}
          enterkeyhint={props.enterKeyHint}
        />
      )}
    </div>
  )
}
