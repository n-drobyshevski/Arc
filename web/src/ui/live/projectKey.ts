// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/ProjectKey.kt
//
// What Live's PROJECT key shows, and the project sheet's keys.

import { PROJECT_COUNT } from '../../core/protocol/device'
import { ProjectSource, ProjectStep } from '../../core/features/projectStep'
import { MirrorText } from '../../core/text/mirrorText'
import type { MirrorUi } from '../../state/types'

/**
 * What Live's PROJECT key shows: the project ([shown], null before one is
 * read), where it comes from ([source]), whether a tap does anything, and
 * whether the device is switching (its light is on meanwhile).
 */
export interface ProjectKeyUi {
  readonly shown: number | null
  readonly source: ProjectSource
  readonly enabled: boolean
  readonly switching: boolean
}

const NONE: ProjectKeyUi = { shown: null, source: ProjectSource.DEVICE, enabled: false, switching: false }

/**
 * The PROJECT key for [mirror], with the device [busy] (UiState.busy).
 *
 * - Connected: the project switched to while it switches, else the one
 *   read; a tap works once Live has read the device and while nothing else
 *   holds it, or while PROJECT's own switch does (taps then move it on).
 * - Offline: the view shown, from the last read or the factory pack; a tap
 *   works with two views or more, so not without the pack.
 * - Nothing to show: greyed out.
 */
export function projectKeyOf(mirror: MirrorUi | null, busy: boolean): ProjectKeyUi {
  if (mirror === null) return NONE
  if (mirror.offline != null) {
    return {
      shown: mirror.state.activeProject,
      source: mirror.offline === MirrorText.FACTORY ? ProjectSource.FACTORY : ProjectSource.LAST_READ,
      enabled: ProjectStep.nextOffline(mirror.state.activeProject, mirror.offlineProjects ?? []) !== null,
      switching: false,
    }
  }
  if (mirror.error !== null) return NONE
  const target = mirror.projectTarget ?? null
  return {
    shown: target ?? mirror.state.activeProject,
    source: ProjectSource.DEVICE,
    enabled: !mirror.loading && (!busy || target !== null),
    switching: target !== null,
  }
}

/** The key's screen reader state: the project and where it comes from, with why it is greyed out. */
export function projectKeyState(k: ProjectKeyUi): string {
  const state = MirrorText.projectKeyState(k.shown, k.source)
  return !k.enabled && (k.source !== ProjectSource.DEVICE || k.shown === null) ? `${state}. ${MirrorText.PROJECT_UNAVAILABLE}` : state
}

/** A key of the project sheet: project [n], whether a pick goes there, and whether it is [shown] now. */
export interface ProjectChoice {
  readonly n: number
  readonly enabled: boolean
  readonly shown: boolean
}

/**
 * The project sheet's keys, 1 to 9: any project while a tap on PROJECT
 * works when connected, only the views arc has offline; the one shown is
 * marked, and picking it does nothing.
 */
export function projectChoicesOf(mirror: MirrorUi | null, busy: boolean): ProjectChoice[] {
  const key = projectKeyOf(mirror, busy)
  const views = mirror?.offline != null ? (mirror.offlineProjects ?? []) : null
  const out: ProjectChoice[] = []
  for (let n = 1; n <= PROJECT_COUNT; n++) {
    out.push({ n, enabled: key.enabled && n !== key.shown && (views === null || views.includes(n)), shown: n === key.shown })
  }
  return out
}
