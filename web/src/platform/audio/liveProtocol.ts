// Web addition: the part of Live's mixer messages (liveMixer.ts) the main
// thread needs while the worklet runs the mixer, apart from the mixer itself,
// so the app's bundle leaves it out (the ScriptProcessor fallback imports
// liveMixer when it is needed).

import type { ToMixer } from './liveMixer'

/** The AudioWorkletProcessor's registered name. */
export const LIVE_PROCESSOR = 'arc-live-mixer'

/**
 * [m] as it is posted to the worklet, and what moves with it: a 'load' takes
 * a copy of just its samples (a view's whole buffer would be cloned
 * otherwise) whose buffer is transferred, so the main thread's own array is
 * never detached and no second clone waits in the port. Every other command
 * is posted as it is.
 */
export function transferable(m: ToMixer): [ToMixer, Transferable[]] {
  if (m.t !== 'load') return [m, []]
  const pcm = m.pcm.slice()
  return [{ t: 'load', id: m.id, pcm }, [pcm.buffer]]
}
