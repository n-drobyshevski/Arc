// Web only (no Android counterpart): the Keyboard keys sheet, opened with ?
// or from Settings → Computer keyboard. It lists only the keys that work
// where it was opened (appKeys keyHelp), from the same table the keys run on.
// "Keys", never "shortcuts": those are the EP-133's own, in the Guide.
import type { JSX } from 'preact'
import { Strings } from '../../core/text/strings'
import { WebText } from '../../core/text/webText'
import { keyHelp, keyScope } from '../appKeys'
import { computerKeys } from '../keyPrefs'
import { Caption } from '../components/Caption'
import { Key } from '../components/Key'
import { Sheet } from '../components/Sheet'
import './KeyboardKeysSheet.css'

export interface KeyboardKeysSheetProps {
  open: boolean
  onDismiss: () => void
}

export function KeyboardKeysSheet(props: KeyboardKeysSheetProps): JSX.Element {
  // What Live shows when its keys are plugged in; away from Live, all of its keys; off, only Esc and Ctrl/Cmd+Z.
  const live = props.open ? (keyScope()?.context() ?? null) : null
  const enabled = computerKeys.value
  const groups = keyHelp({ live, enabled })
  return (
    <Sheet open={props.open} onDismiss={props.onDismiss} labelledBy="keys-sheet-title">
      <h2 id="keys-sheet-title" class="t-heading keys-sheet__title">
        {WebText.KEYS_TITLE}
      </h2>
      <p class="t-small keys-sheet__note">{!enabled ? WebText.KEYS_OFF : live !== null ? WebText.KEYS_NOW : WebText.KEYS_ALL}</p>
      {groups.map((g) => (
        <section key={g.title} class="keys-sheet__group">
          <Caption text={g.title} as="h3" align="start" />
          <dl class="keys-sheet__rows">
            {g.rows.map((r) => (
              <div key={`${g.title}:${r.label}`} class="keys-sheet__row">
                <dt class="keys-sheet__keys">
                  {r.keys.map((k) => (
                    <kbd key={k} class="keys-sheet__key">
                      {k}
                    </kbd>
                  ))}
                </dt>
                <dd class="keys-sheet__label t-body">{r.label}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <Key text={Strings.DONE} variant="quiet" block onClick={props.onDismiss} />
    </Sheet>
  )
}
