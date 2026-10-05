// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/SettingsScreen.kt
// (the font licence sheet MainActivity's Root shows over it: ArcSheet with the
// OFL-Manrope.txt asset in ArcType.tiny, graphite, then a quiet Done key).
//
// Web delta: the asset is public/licenses/OFL-Manrope.txt, fetched the first
// time the sheet opens (Kotlin reads it with getOrDefault(""): a failed read
// shows an empty sheet with Done).
import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { SettingsText } from '../../core/text/settingsText'
import { Strings } from '../../core/text/strings'
import { Key } from '../components/Key'
import { Sheet } from '../components/Sheet'
import './FontLicenceSheet.css'

export interface FontLicenceSheetProps {
  open: boolean
  onDismiss: () => void
}

/** Where the licence is served (Vite's base, then public/). */
export function licenceUrl(base: string): string {
  return `${base.endsWith('/') ? base : `${base}/`}licenses/OFL-Manrope.txt`
}

let cached: Promise<string> | null = null

/** The licence text, read once ("" when it can't be read). */
function loadLicence(): Promise<string> {
  if (cached) return cached
  const base = typeof import.meta.env?.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/'
  cached = fetch(licenceUrl(base))
    .then((r) => (r.ok ? r.text() : ''))
    .catch(() => '')
    .then((t) => {
      // A failed read may work next time (offline before the cache filled).
      if (t.length === 0) cached = null
      return t
    })
  return cached
}

export function FontLicenceSheet(props: FontLicenceSheetProps): JSX.Element {
  const [text, setText] = useState('')
  // Reading it (a failed read leaves an empty, settled sheet, not a busy one).
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!props.open || text.length !== 0) return
    let live = true
    setLoading(true)
    void loadLicence().then((t) => {
      if (!live) return
      setText(t)
      setLoading(false)
    })
    return () => {
      live = false
      setLoading(false)
    }
  }, [props.open])

  return (
    <Sheet open={props.open} onDismiss={props.onDismiss} label={SettingsText.FONT_LICENCE}>
      <pre class="licence-sheet__text t-tiny" aria-busy={loading ? 'true' : undefined}>{text}</pre>
      <Key text={Strings.DONE} variant="quiet" block onClick={props.onDismiss} />
    </Sheet>
  )
}
