// Port of core/src/test/kotlin/dev/arc/ep133/protocol/ProjectSwitchTest.kt
//
// Live's PROJECT key: the active project read from, and written to,
// /projects' metadata. Kotlin's IllegalArgumentException is a RangeError.
import { describe, expect, it } from 'vitest'
import {
  activeProject,
  PROJECT_COUNT,
  PROJECTS_NODE,
  projectOfActive,
  setActiveProject,
} from '../../../src/core/protocol/device'
import { Session } from '../../../src/core/protocol/session'
import { DemoData } from '../../helpers/demoData'
import { MockEP133 } from '../../helpers/mockDevice'

async function connect(dev: MockEP133): Promise<Session> {
  const s = new Session(dev.transport())
  await s.handshake()
  return s
}

describe('ProjectSwitchTest', () => {
  it('the active value names a project node', () => {
    expect(projectOfActive(3000)).toBe(1)
    expect(projectOfActive('6000')).toBe(4)
    expect(projectOfActive(11000.0)).toBe(9)
    expect(projectOfActive(3500)).toBeNull()
    expect(projectOfActive(2000)).toBeNull()
    expect(projectOfActive('p3')).toBeNull()
    expect(projectOfActive(null)).toBeNull()
    expect(projectOfActive({})).toBeNull()
    expect(projectOfActive(undefined)).toBeNull()
  })

  it("switching writes the project's node as active, and it reads back", async () => {
    const dev = DemoData.device()
    const s = await connect(dev)
    expect(await activeProject(s)).toBe(1)
    await setActiveProject(s, 3)
    expect(dev.metaWrites[dev.metaWrites.length - 1]).toEqual([PROJECTS_NODE, '{"active":5000}'])
    expect(await activeProject(s)).toBe(3)
    await setActiveProject(s, PROJECT_COUNT)
    expect(dev.metaWrites[dev.metaWrites.length - 1]).toEqual([PROJECTS_NODE, '{"active":11000}'])
    expect(await activeProject(s)).toBe(9)
    // Only 1..9: nothing is sent for another number.
    const writes = dev.metaWrites.length
    await expect(setActiveProject(s, 0)).rejects.toThrow(RangeError)
    await expect(setActiveProject(s, 10)).rejects.toThrow(RangeError)
    expect(dev.metaWrites.length).toBe(writes)
    s.close()
  })

  it('an active value that names no project reads as none', async () => {
    const dev = new MockEP133({ active: 2000 })
    const s = await connect(dev)
    expect(await activeProject(s)).toBeNull()
    s.close()
  })
})
