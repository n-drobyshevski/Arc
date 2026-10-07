// Port of core/src/main/kotlin/dev/arc/ep133/features/ProjectStep.kt
//
// Live's PROJECT key (an addition): each tap steps to the next project,
// 1 → … → 9 → 1, as the key on the device does with a number.
//
// Connected, the device switches and Live follows it ([next]). Offline, the
// projects arc has pads for are stepped through instead ([offlineViews]):
// the last read's project and the factory pack's, one view per number.
//
// Web deltas: the Kotlin enum `ProjectSource` is a const object plus a
// string-union type of the same name; Collection<Int> is an Iterable.

import { PROJECT_COUNT } from '../protocol/device'

/** Where the project Live shows comes from: the device, arc's last read of it, or the factory pack. */
export const ProjectSource = { DEVICE: 'DEVICE', LAST_READ: 'LAST_READ', FACTORY: 'FACTORY' } as const
export type ProjectSource = (typeof ProjectSource)[keyof typeof ProjectSource]

const inRange = (n: number): boolean => n >= 1 && n <= PROJECT_COUNT

/** The project after [current] (1 when there is none, or it is out of range), wrapping 9 → 1. */
export function next(current: number | null): number {
  return current === null || !(current >= 1 && current < PROJECT_COUNT) ? 1 : current + 1
}

/**
 * The projects Live can show offline, in order: [lastRead] (the last read's
 * project) and the factory pack's [factory] projects with pads, each number
 * once. A number in both is the last read: it is what the device had there.
 */
export function offlineViews(lastRead: number | null, factory: Iterable<number>): number[] {
  const all = [...factory, ...(lastRead === null ? [] : [lastRead])].filter(inRange)
  return [...new Set(all)].sort((a, b) => a - b)
}

/**
 * The view after [current] in [views], wrapping; the first when [current]
 * isn't one (a last read with no project). Null when there is nothing to
 * step to: fewer than two views (no factory pack, even with a last read), so
 * the key is greyed out.
 */
export function nextOffline(current: number | null, views: readonly number[]): number | null {
  if (views.length < 2) return null
  if (current === null) return views[0]!
  return views.find((v) => v > current) ?? views[0]!
}

/** Where offline view [n] comes from, or null when it isn't one. */
export function sourceOf(n: number, lastRead: number | null, factory: Iterable<number>): ProjectSource | null {
  if (!inRange(n)) return null
  if (n === lastRead) return ProjectSource.LAST_READ
  for (const f of factory) if (f === n) return ProjectSource.FACTORY
  return null
}

/** The Kotlin `object ProjectStep`. */
export const ProjectStep = { next, offlineViews, nextOffline, sourceOf } as const
