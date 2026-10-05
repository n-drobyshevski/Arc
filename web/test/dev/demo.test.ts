// Demo mode: installDemo on a stand-in window gives a working fake EP-133.

import { afterEach, describe, expect, it } from 'vitest'
import { installDemo, type ArcDemo, type DemoWindow } from '../../src/dev/demo'
import { listProjects, listSounds } from '../../src/core/protocol/device'
import type { MidiEvent } from '../../src/core/protocol/midiInput'
import { Session } from '../../src/core/protocol/session'
import {
  openMidi,
  probePermission,
  requestMidiAccess,
  watchMidi,
  webMidiSupported,
  type MidiDeviceEvent,
  type NavigatorLike,
} from '../../src/platform/midi/webmidi'
import { NAMES } from '../helpers/demoData'

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

let installed: ArcDemo | null = null
afterEach(() => {
  installed?.uninstall()
  installed = null
})

function setup(): { win: DemoWindow & { navigator: NavigatorLike }; demo: ArcDemo } {
  const win: DemoWindow & { navigator: NavigatorLike } = { navigator: {} }
  const demo = installDemo(win)
  installed = demo
  return { win, demo }
}

describe('installDemo', () => {
  it('makes Web MIDI available with the permission already granted', async () => {
    const { win, demo } = setup()
    expect(win.__arcDemo).toBe(demo)
    expect(webMidiSupported(win.navigator)).toBe(true)
    expect(await probePermission(win.navigator)).toBe('granted')
    expect(await requestMidiAccess(win.navigator)).toBe(demo.access)
    expect(demo.plugged).toBe(true)
  })

  it('is installed once', () => {
    const { win, demo } = setup()
    expect(installDemo(win)).toBe(demo)
  })

  it('passes other permission queries to the real permissions', async () => {
    const win: DemoWindow & { navigator: NavigatorLike } = {
      navigator: { permissions: { query: (d) => Promise.resolve({ state: `real:${d.name}` }) } },
    }
    installed = installDemo(win)
    expect(await win.navigator.permissions?.query({ name: 'camera' })).toEqual({ state: 'real:camera' })
    expect(await win.navigator.permissions?.query({ name: 'midi', sysex: true })).toEqual({ state: 'granted' })
    installed.uninstall()
    installed = null
    expect(await win.navigator.permissions?.query({ name: 'midi' })).toEqual({ state: 'real:midi' })
    expect(win.__arcDemo).toBeUndefined()
  })

  it('handshakes through Session + openMidi and lists the demo sounds and projects', async () => {
    const { win } = setup()
    const access = await requestMidiAccess(win.navigator)
    const open = await openMidi(access)
    expect(open.portName).toBe('EP-133')
    const s = new Session(open.transport)
    const info = await s.handshake()
    expect(info.product).toBe('EP-133')
    const sounds = await listSounds(s)
    expect(sounds.map((x) => x.name)).toEqual([...NAMES])
    expect(sounds.map((x) => x.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 108, 109, 110, 111])
    expect((await listProjects(s)).map((p) => p.project)).toEqual([1, 2, 5])
    s.close()
    open.close()
  })

  it('drives the live mirror: notes, clock and pad pushes', async () => {
    const { win, demo } = setup()
    const open = await openMidi(await requestMidiAccess(win.navigator))
    const s = new Session(open.transport)
    await s.handshake()
    const events: MidiEvent['type'][] = []
    open.events((e) => events.push(e.type))
    const pushes: number[] = []
    s.onPush((f) => pushes.push(f.command))

    demo.noteOn(36, 90)
    demo.noteOff(36)
    demo.clock('tick')
    demo.pushPadActive(1, 0, 3)
    await wait(5)
    expect(events).toEqual(['NoteOn', 'NoteOff', 'Clock'])
    expect(pushes).toEqual([5])

    demo.clock(600) // 24 ticks a beat: one tick about every 4 ms
    expect(demo.bpm).toBe(600)
    events.length = 0
    demo.clock('start')
    await wait(40)
    demo.clock('stop')
    await wait(5)
    expect(events[0]).toBe('Start')
    expect(events.at(-1)).toBe('Stop')
    expect(events.filter((e) => e === 'Clock').length).toBeGreaterThan(2)
    const after = events.length
    await wait(20)
    expect(events.length).toBe(after)
    s.close()
    open.close()
  })

  it('unplug and plug fire removal and attach events, and the device answers again', async () => {
    const { win, demo } = setup()
    const access = await requestMidiAccess(win.navigator)
    const added: MidiDeviceEvent[] = []
    const removed: MidiDeviceEvent[] = []
    const stop = watchMidi(access, (e) => added.push(e), (e) => removed.push(e), { debounceMs: 1 })
    const first = await openMidi(access)
    const s1 = new Session(first.transport)
    await s1.handshake()

    demo.unplug()
    expect(demo.plugged).toBe(false)
    expect(removed.length).toBeGreaterThan(0)
    expect(removed.every((e) => first.owns(e))).toBe(true)
    s1.close()
    first.close()

    demo.plug()
    await wait(10)
    expect(demo.plugged).toBe(true)
    expect(added).toHaveLength(1)
    expect(added[0]?.looksLikeEp).toBe(true)
    const again = await openMidi(access)
    const s2 = new Session(again.transport)
    await s2.handshake()
    expect((await listSounds(s2)).length).toBe(NAMES.length)
    s2.close()
    again.close()
    stop()
  })
})
