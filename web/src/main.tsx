// Port of the start-up parts of app/src/main/kotlin/dev/arc/ep133/MainActivity.kt (onCreate:
// the theme, the controller, setContent { Root() }) and ArcApp.kt.
//
// Order: the theme first (settings are read synchronously, so the first paint
// already has the right colours), then the demo device when the URL asks for it
// (?demo, before any MIDI code runs), then the browser deps (the library
// database opens here), the controller, and the app.
import { effect } from '@preact/signals'
import { render } from 'preact'
import './ui/theme/fonts'
import './ui/theme/tokens.css'
import './ui/theme/base.css'
import { App, CrashMessage } from './app'
import { createBrowserDeps } from './boot/browserDeps'
import { browserStorage, SettingsStore } from './platform/storage/settings'
import { createController, type ArcController } from './state/controller'
import { applyTheme } from './ui/theme/theme'

/** While the library waits for another tab (no text module has these sentences yet). */
const LIBRARY_BLOCKED = 'Close other arc tabs to open the library.'

const root = document.getElementById('app')!

function showMessage(text: string): void {
  root.textContent = ''
  const p = document.createElement('p')
  p.className = 'boot-message t-body15'
  p.setAttribute('role', 'status')
  p.textContent = text
  root.appendChild(p)
}

let controller: ArcController | null = null

/** Another tab opened a newer database: reload, but not in the middle of a transfer. */
function reloadWhenIdle(): void {
  const c = controller
  if (!c || c.state.peek().task === null) {
    location.reload()
    return
  }
  const off = c.store.subscribe(() => {
    if (c.state.peek().task !== null) return
    off()
    location.reload()
  })
}

async function boot(): Promise<void> {
  applyTheme(new SettingsStore(browserStorage()).settings.theme)
  if (new URLSearchParams(location.search).has('demo')) {
    const { installDemo } = await import('./dev/demo')
    installDemo(window)
  }
  const deps = await createBrowserDeps({
    onLibraryBlocked: () => showMessage(LIBRARY_BLOCKED),
    onLibraryVersionChange: reloadWhenIdle,
  })
  const c = createController(deps)
  controller = c
  // Settings → Theme, and another tab's change.
  effect(() => {
    applyTheme(c.settings.value.theme)
  })
  root.textContent = ''
  render(<App controller={c} />, root)
  await c.start()
}

boot().catch((e: unknown) => {
  console.error(e)
  render(<CrashMessage error={e} />, root)
})
