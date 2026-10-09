// Web only (Kotlin measures the words with a text measurer before it lays them out)
//
// A display line that has to make room: how many of its [max] steps of giving
// way it takes so that its main text ([line], which ends in an ellipsis when
// it is cut) shows whole. Each step is tried in turn, in layout before the
// first paint, until the text fits or none is left; a new text ([key], which
// names everything that shares the line's room, not only the text) or a new
// width for the line's box starts again from none, and so does [on] turning
// true again. [on] false: no step.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { RefObject } from 'preact'

export function useCut(line: RefObject<HTMLElement | null>, key: string, max: number, on: boolean): number {
  const [cut, setCut] = useState(0)
  // Bumped to measure again when [cut] doesn't change (it was already 0).
  const [pass, setPass] = useState(0)
  const seen = useRef(key)
  useLayoutEffect(() => {
    if (!on) {
      // What was measured is stale by the time it is on again.
      if (cut !== 0) setCut(0)
      return
    }
    if (seen.current !== key) {
      seen.current = key
      setCut(0)
      setPass((p) => p + 1)
      return
    }
    const el = line.current
    if (el && cut < max && el.scrollWidth > el.clientWidth + 1) setCut(cut + 1)
  }, [on, key, cut, pass, max])
  useEffect(() => {
    const box = line.current?.parentElement
    if (!on || !box || typeof ResizeObserver === 'undefined') return
    let width = box.clientWidth
    const watch = new ResizeObserver(() => {
      if (box.clientWidth === width) return
      width = box.clientWidth
      setCut(0)
      setPass((p) => p + 1)
    })
    watch.observe(box)
    return () => watch.disconnect()
  }, [on])
  return on ? Math.min(cut, max) : 0
}
