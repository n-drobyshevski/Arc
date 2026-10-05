// The controller and the navigation stack for components (Compose passes the
// controller down from MainActivity; here a context does it).
import { createContext, type ComponentChildren, type JSX } from 'preact'
import { useContext } from 'preact/hooks'
import type { ArcController } from '../state/controller'
import type { Nav } from './nav'

interface AppContextValue {
  readonly controller: ArcController
  readonly nav: Nav
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider(props: { controller: ArcController; nav: Nav; children: ComponentChildren }): JSX.Element {
  return <AppContext.Provider value={{ controller: props.controller, nav: props.nav }}>{props.children}</AppContext.Provider>
}

function useApp(): AppContextValue {
  const v = useContext(AppContext)
  if (!v) throw new Error('useController() outside <AppProvider>')
  return v
}

/** The app's controller (state signals and actions, see state/README.md). */
export function useController(): ArcController {
  return useApp().controller
}

/** The navigation stack (open screens, sheets, overlays; see ui/nav.ts). */
export function useNav(): Nav {
  return useApp().nav
}
