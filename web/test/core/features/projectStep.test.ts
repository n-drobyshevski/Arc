// Port of core/src/test/kotlin/dev/arc/ep133/features/ProjectStepTest.kt
import { describe, expect, it } from 'vitest'
import { ProjectSource, ProjectStep } from '../../../src/core/features/projectStep'

describe('ProjectStepTest', () => {
  it('connected, PROJECT steps 1 to 9 and wraps', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(ProjectStep.next)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 1])
    // Nothing read yet, or a number the key doesn't have: start at 1.
    expect(ProjectStep.next(null)).toBe(1)
    expect(ProjectStep.next(0)).toBe(1)
    expect(ProjectStep.next(10)).toBe(1)
  })

  it("offline, the views are the last read's project and the factory pack's", () => {
    const pack = [1, 2, 5]
    expect(ProjectStep.offlineViews(null, pack)).toEqual([1, 2, 5])
    // The last read in the middle, and one the pack has too: each number once.
    expect(ProjectStep.offlineViews(3, pack)).toEqual([1, 2, 3, 5])
    expect(ProjectStep.offlineViews(2, pack)).toEqual([1, 2, 5])
    // Out of range on either side is dropped.
    expect(ProjectStep.offlineViews(12, [9, 0, 1, 10])).toEqual([1, 9])
    // No pack: the last read alone.
    expect(ProjectStep.offlineViews(4, [])).toEqual([4])
    expect(ProjectStep.offlineViews(null, [])).toEqual([])
  })

  it('offline stepping wraps, and needs two views', () => {
    const views = [1, 3, 5]
    expect(ProjectStep.nextOffline(1, views)).toBe(3)
    expect(ProjectStep.nextOffline(3, views)).toBe(5)
    expect(ProjectStep.nextOffline(5, views)).toBe(1)
    // A last read with no project is shown first but isn't in the cycle.
    expect(ProjectStep.nextOffline(null, views)).toBe(1)
    expect(ProjectStep.nextOffline(4, views)).toBe(5)
    // No pack (even with a last read): nothing to step to, the key greys out.
    expect(ProjectStep.nextOffline(4, [4])).toBeNull()
    expect(ProjectStep.nextOffline(null, [])).toBeNull()
  })

  it("a view's source", () => {
    const pack = [1, 2, 5]
    expect(ProjectStep.sourceOf(2, 2, pack)).toBe(ProjectSource.LAST_READ)
    expect(ProjectStep.sourceOf(1, 2, pack)).toBe(ProjectSource.FACTORY)
    expect(ProjectStep.sourceOf(3, 3, pack)).toBe(ProjectSource.LAST_READ)
    expect(ProjectStep.sourceOf(4, 3, pack)).toBeNull()
    expect(ProjectStep.sourceOf(12, 12, pack)).toBeNull()
  })
})
