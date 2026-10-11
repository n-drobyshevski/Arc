// PROJECT in the controller (ArcController.kt stepProject, selectProject, switchProjects; ProjectKey.kt):
// connected, the EP-133 switches to the next project and Live follows it; a tap while it switches moves the
// target on; offline, Live steps through the views arc has; what the key and the sheet offer.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectSource } from '../../src/core/features/projectStep'
import { MirrorText } from '../../src/core/text/mirrorText'
import { emptyMirrorState, type MirrorUi } from '../../src/state/types'
import { projectChoicesOf, projectKeyOf, projectKeyState } from '../../src/ui/live/projectKey'
import { disposeAll, liveHarness, until, type LiveHarness } from './liveHarness'

afterEach(() => disposeAll())

async function liveOn(): Promise<LiveHarness> {
  const h = await liveHarness()
  await h.c.connect()
  h.c.setLive(true)
  await until(h, (s) => s.mirror !== null && !s.mirror.loading && !s.busy && s.mirror.offline == null)
  return h
}

const mirror = (patch: Partial<MirrorUi>, project: number | null = 1): MirrorUi => ({
  state: { ...emptyMirrorState(), activeProject: project },
  loading: false,
  error: null,
  ...patch,
})

describe('projectKeyOf', () => {
  it('connected: the project read, or the one switched to', () => {
    expect(projectKeyOf(mirror({}), false)).toEqual({ shown: 1, source: ProjectSource.DEVICE, enabled: true, switching: false })
    expect(projectKeyOf(mirror({}), true).enabled).toBe(false)
    expect(projectKeyOf(mirror({ projectTarget: 4 }), true)).toEqual({ shown: 4, source: ProjectSource.DEVICE, enabled: true, switching: true })
    expect(projectKeyOf(mirror({ loading: true }), false).enabled).toBe(false)
    expect(projectKeyOf(null, false).enabled).toBe(false)
  })

  it('offline: the view shown, a tap only with two views or more', () => {
    const one = projectKeyOf(mirror({ offline: 'Last seen 5 Oct', offlineProjects: [1] }), false)
    expect(one).toMatchObject({ shown: 1, source: ProjectSource.LAST_READ, enabled: false })
    expect(projectKeyState(one)).toBe(`${MirrorText.projectKeyState(1, ProjectSource.LAST_READ)}. ${MirrorText.PROJECT_UNAVAILABLE}`)
    expect(projectKeyOf(mirror({ offline: MirrorText.FACTORY, offlineProjects: [1, 2, 5] }), false)).toMatchObject({ source: ProjectSource.FACTORY, enabled: true })
  })

  it("the sheet: any project connected, the views offline, the one shown marked but not picked", () => {
    const on = projectChoicesOf(mirror({}, 3), false)
    expect(on.filter((c) => c.enabled).map((c) => c.n)).toEqual([1, 2, 4, 5, 6, 7, 8, 9])
    expect(on.find((c) => c.n === 3)).toEqual({ n: 3, enabled: false, shown: true })
    const off = projectChoicesOf(mirror({ offline: MirrorText.FACTORY, offlineProjects: [1, 2, 5] }, 1), false)
    expect(off.filter((c) => c.enabled).map((c) => c.n)).toEqual([2, 5])
  })
})

describe('PROJECT', () => {
  it('connected: a tap switches the EP-133 to the next project, and Live reads it', async () => {
    const h = await liveOn()
    expect(h.c.state.value.mirror?.state.activeProject).toBe(1)
    h.c.stepProject()
    expect(h.c.state.value.mirror?.projectTarget).toBe(2)
    await until(h, (s) => s.mirror?.state.activeProject === 2 && s.mirror.projectTarget == null)
    expect(h.mock.projectsMeta.active).toBe(4000)
  })

  it('a pick while it switches moves the target on, and only the newest is read', async () => {
    const h = await liveOn()
    h.c.selectProject(5)
    h.c.selectProject(7)
    expect(h.c.state.value.mirror?.projectTarget).toBe(7)
    await until(h, (s) => s.mirror?.state.activeProject === 7 && s.mirror.projectTarget == null)
    expect(h.mock.projectsMeta.active).toBe(9000)
    // The project shown again: nothing.
    h.c.selectProject(7)
    expect(h.c.state.value.mirror?.projectTarget ?? null).toBeNull()
  })

  it('offline without the factory pack: only the last read, so a tap does nothing', async () => {
    const h = await liveOn()
    h.ep.access.unplug(h.ep.input, h.ep.output)
    await until(h, (s) => s.mirror?.offline != null)
    expect(h.c.state.value.mirror?.offlineProjects).toEqual([1])
    h.c.stepProject()
    expect(h.c.state.value.mirror?.state.activeProject).toBe(1)
  })
})
