// The factory kit picked in Arc, for the names of the hundreds of slots in the sound lists and the Device tab
// (Android's LocalFactoryKit). The EP-133's when no provider is there, as in a component's own test.
import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import { FactoryKit } from '../core/features/factorySounds'

export const FactoryKitContext = createContext<() => FactoryKit>(() => FactoryKit.EP133)

/** The kit picked (its pack saved), read when the component renders. */
export function useFactoryKit(): FactoryKit {
  return useContext(FactoryKitContext)()
}
