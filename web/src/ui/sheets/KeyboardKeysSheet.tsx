// Web only (no Android counterpart): the Keyboard keys sheet, opened with ?
// or from Settings → Computer keyboard. It lists only the keys that work
// where it was opened (appKeys keyHelp), from the same table the keys run on.
// "Keys", never "shortcuts": those are the EP-133's own, in the Guide.
import type { JSX } from 'preact'
import { Strings } from '../../core/text/strings'
import { WebText } from '../../core/text/webText'
import { keyHelp, keyScope } from '../appKeys'
import { Caption } from '../components/Caption'
import { Key } from '../components/Key'
import { Sheet } from '../components/Sheet'
import './KeyboardKeysSheet.css'

export interface KeyboardKeysSheetProps {
  open: boolean
  onDismiss: () => void
}

export function KeyboardKeysSheet(props: KeyboardKeysSheetProps): JSX.Element {
  // What Live shows when it is the screen whose keys are plugged in; else only Everywhere.
  const groups = keyHelp(props.open ? (keyScope()?.context() ?? null) : null)
  return (
    <Sheet open={props.open} onDismiss={props.onDismiss} labelledBy="keys-sheet-title">
      <h2 id="keys-sheet-title" class="t-heading keys-sheet__title">
        {WebText.KEYS_TITLE}
      </h2>
      <p class="t-small keys-sheet__note">{WebText.KEYS_NOW}</p>
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
