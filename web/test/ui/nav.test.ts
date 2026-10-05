import { describe, expect, it } from 'vitest'
import {
  Nav,
  backStack,
  bindViewHooks,
  close,
  dialogLayer,
  hashOf,
  initialStack,
  isLive,
  layerKey,
  onTabs,
  overlayLayer,
  parseHash,
  push,
  rootView,
  screenLayer,
  selectTab,
  sheetLayer,
  stackFromState,
  stateOf,
  tabLayer,
  viewOf,
  type NavEnv,
  type Stack,
} from '../../src/ui/nav'
import type { Tab } from '../../src/state/types'

const keys = (s: Stack | null): string[] | null => (s ? s.map(layerKey) : null)
const BASE = tabLayer('backups')

describe('routes', () => {
  it('parses every route', () => {
    expect(parseHash('#/backups')).toEqual(tabLayer('backups'))
    expect(parseHash('#/live')).toEqual(tabLayer('live'))
    expect(parseHash('#/device/')).toEqual(tabLayer('device'))
    for (const k of ['settings', 'debug', 'search', 'guide'] as const) {
      expect(parseHash(`#/${k}`)).toEqual(screenLayer({ kind: k }))
    }
    expect(parseHash('#/contents/abc%20d')).toEqual(screenLayer({ kind: 'contents', id: 'abc d' }))
    expect(parseHash('#/compare/a/b')).toEqual(screenLayer({ kind: 'compare', a: 'a', b: 'b' }))
  })

  it('rejects unknown and malformed routes', () => {
    for (const h of ['', '#', '#/', '#/nope', '#/contents', '#/compare/a', '#/live/x', '#/settings/x']) {
      expect(parseHash(h)).toBeNull()
    }
  })

  it('round-trips hashes', () => {
    for (const h of ['#/backups', '#/live', '#/device', '#/settings', '#/debug', '#/search', '#/guide', '#/contents/x%2Fy', '#/compare/1/2']) {
      expect(hashOf(initialStack(h))).toBe(h)
    }
  })

  it('overlays keep the hash of the layer below', () => {
    const s: Stack = [BASE, tabLayer('live'), overlayLayer('side')]
    expect(hashOf(s)).toBe('#/live')
    expect(hashOf([BASE, screenLayer({ kind: 'contents', id: 'q' }), sheetLayer('pads:backup:q:1')])).toBe('#/contents/q')
  })

  it('a fresh load puts Backups underneath', () => {
    expect(keys(initialStack('#/live'))).toEqual(['tab:backups', 'tab:live'])
    expect(keys(initialStack('#/settings'))).toEqual(['tab:backups', 'screen:#/settings'])
    expect(keys(initialStack('#/backups'))).toEqual(['tab:backups'])
    expect(keys(initialStack('#/garbage'))).toEqual(['tab:backups'])
  })

  it('history.state round-trips and rejects foreign state', () => {
    const s: Stack = [BASE, tabLayer('device'), sheetLayer('upload'), sheetLayer('trim:0')]
    expect(keys(stackFromState(JSON.parse(JSON.stringify(stateOf(s)))))).toEqual(keys(s))
    expect(stackFromState(null)).toBeNull()
    expect(stackFromState({ arc: 2, stack: [] })).toBeNull()
    expect(stackFromState({ arc: 1, stack: [{ kind: 'tab', tab: 'nope' }] })).toBeNull()
    expect(stackFromState({ arc: 1, stack: [{ kind: 'overlay', overlay: 'sheet', id: 3 }] })).toBeNull()
    // A stack without the base gets one.
    expect(keys(stackFromState({ arc: 1, stack: [{ kind: 'tab', tab: 'live' }] }))).toEqual(['tab:backups', 'tab:live'])
  })
})

describe('view (Root flags)', () => {
  it('derives the flags and the render priority', () => {
    const s: Stack = [BASE, screenLayer({ kind: 'search' }), screenLayer({ kind: 'contents', id: 'b1' })]
    const v = viewOf(s)
    expect(v.search).toBe(true)
    expect(v.contentsId).toBe('b1')
    expect(rootView(v, () => true)).toBe('contents')
    // An unknown backup falls through to the next branch, as in Root.
    expect(rootView(v, () => false)).toBe('search')
    expect(onTabs(v)).toBe(false)
  })

  it('debug beats settings beats compare beats contents beats search', () => {
    const all: Stack = [
      BASE,
      screenLayer({ kind: 'search' }),
      screenLayer({ kind: 'contents', id: 'x' }),
      screenLayer({ kind: 'compare', a: 'x', b: 'y' }),
      screenLayer({ kind: 'settings' }),
      screenLayer({ kind: 'debug' }),
    ]
    const has = (): boolean => true
    expect(rootView(viewOf(all), has)).toBe('debug')
    expect(rootView(viewOf(all.slice(0, 5)), has)).toBe('settings')
    expect(rootView(viewOf(all.slice(0, 4)), has)).toBe('compare')
    expect(rootView(viewOf(all.slice(0, 3)), has)).toBe('contents')
    expect(rootView(viewOf(all.slice(0, 2)), has)).toBe('search')
    expect(rootView(viewOf(all.slice(0, 1)), has)).toBe('shell')
  })

  it('live only while the Live tab is in front', () => {
    const live: Stack = [BASE, tabLayer('live')]
    expect(isLive(viewOf(live))).toBe(true)
    expect(isLive(viewOf([...live, overlayLayer('side')]))).toBe(true)
    expect(isLive(viewOf([...live, screenLayer({ kind: 'guide' })]))).toBe(false)
    expect(isLive(viewOf([...live, screenLayer({ kind: 'settings' })]))).toBe(false)
    expect(isLive(viewOf([...live, screenLayer({ kind: 'settings' }), screenLayer({ kind: 'debug' })]))).toBe(false)
    expect(isLive(viewOf([BASE]))).toBe(false)
  })

  it('the guide does not leave the tabs (it slides over the shell)', () => {
    expect(onTabs(viewOf([BASE, screenLayer({ kind: 'guide' })]))).toBe(true)
  })
})

describe('transitions', () => {
  it('selectTab keeps one tab layer over Backups and closes everything else', () => {
    const s: Stack = [BASE, tabLayer('live'), overlayLayer('menu')]
    expect(keys(selectTab(s, 'device'))).toEqual(['tab:backups', 'tab:device'])
    expect(keys(selectTab(s, 'backups'))).toEqual(['tab:backups'])
  })

  it('push ignores a repeat of the top layer', () => {
    const s: Stack = [BASE, overlayLayer('menu')]
    expect(push(s, overlayLayer('menu'))).toBe(s)
  })

  it('close removes only that layer', () => {
    const s: Stack = [BASE, sheetLayer('detail:a'), dialogLayer('delete')]
    expect(keys(close(s, sheetLayer('detail:a')))).toEqual(['tab:backups', 'overlay:dialog:delete'])
    expect(close(s, sheetLayer('detail:zzz'))).toBe(s)
  })

  it('Back closes side panel, then menu, then sheet, then full screen, then tab', () => {
    // An order that the history would get wrong: the sheet was opened after the side panel.
    let s: Stack | null = [BASE, tabLayer('live'), overlayLayer('side'), overlayLayer('menu'), sheetLayer('x')]
    s = backStack(s)
    expect(keys(s)).toEqual(['tab:backups', 'tab:live', 'overlay:menu', 'overlay:sheet:x'])
    s = backStack(s!)
    expect(keys(s)).toEqual(['tab:backups', 'tab:live', 'overlay:sheet:x'])
    s = backStack(s!)
    expect(keys(s)).toEqual(['tab:backups', 'tab:live'])
    // From a non-Backups tab Back goes to Backups.
    s = backStack(s!)
    expect(keys(s)).toEqual(['tab:backups'])
    // From Backups Back leaves the app.
    expect(backStack(s!)).toBeNull()
  })

  it('Back closes a dialog before the sheet under it, and a sheet before its screen', () => {
    expect(keys(backStack([BASE, sheetLayer('detail:a'), dialogLayer('delete')]))).toEqual(['tab:backups', 'overlay:sheet:detail:a'])
    const s: Stack = [BASE, screenLayer({ kind: 'contents', id: 'a' }), sheetLayer('pads:backup:a:1')]
    expect(keys(backStack(s))).toEqual(['tab:backups', 'screen:#/contents/a'])
    expect(keys(backStack([BASE, screenLayer({ kind: 'settings' }), screenLayer({ kind: 'debug' })]))).toEqual([
      'tab:backups',
      'screen:#/settings',
    ])
  })
})

// ---------- Nav against a fake history ----------

interface Entry {
  state: unknown
  url: string
}

class FakeWindow implements NavEnv {
  entries: Entry[]
  index = 0
  private listeners = new Set<(e: { state: unknown }) => void>()
  readonly history: NavEnv['history']
  readonly location: { hash: string }

  constructor(hash = '', state: unknown = null) {
    this.entries = [{ state, url: hash }]
    const self = this
    this.location = {
      get hash() {
        return self.entries[self.index]!.url
      },
    }
    this.history = {
      get state() {
        return self.entries[self.index]!.state
      },
      pushState(data, _u, url) {
        self.entries = self.entries.slice(0, self.index + 1)
        self.entries.push({ state: structuredClone(data), url: url ?? self.location.hash })
        self.index++
      },
      replaceState(data, _u, url) {
        self.entries[self.index] = { state: structuredClone(data), url: url ?? self.location.hash }
      },
      go(delta) {
        const to = Math.max(0, Math.min(self.entries.length - 1, self.index + delta))
        setTimeout(() => {
          if (to === self.index) return
          self.index = to
          self.fire()
        }, 0)
      },
    }
  }

  /** The user's Back button. */
  async back(): Promise<void> {
    if (this.index === 0) return
    this.index--
    this.fire()
    await Promise.resolve()
  }

  fire(): void {
    const state = this.entries[this.index]!.state
    for (const fn of [...this.listeners]) fn({ state })
  }

  addEventListener(_t: 'popstate', fn: (e: { state: unknown }) => void): void {
    this.listeners.add(fn)
  }
  removeEventListener(_t: 'popstate', fn: (e: { state: unknown }) => void): void {
    this.listeners.delete(fn)
  }
  setTimeout(fn: () => void, ms: number): unknown {
    return setTimeout(fn, ms)
  }
  clearTimeout(h: unknown): void {
    clearTimeout(h as ReturnType<typeof setTimeout>)
  }

  urls(): string[] {
    return this.entries.slice(0, this.index + 1).map((e) => e.url)
  }
}

const stackKeys = (nav: Nav): string[] => nav.stack.value.map(layerKey)

describe('Nav', () => {
  it('a fresh load of a deep route seeds Backups underneath', () => {
    const w = new FakeWindow('#/live')
    const nav = new Nav(w)
    nav.start()
    expect(w.urls()).toEqual(['#/backups', '#/live'])
    expect(nav.current.tab).toBe('live')
  })

  it('a reload restores the whole stack from history.state', () => {
    const s: Stack = [BASE, tabLayer('device'), sheetLayer('upload')]
    const w = new FakeWindow('#/device', stateOf(s))
    const nav = new Nav(w)
    nav.start()
    expect(stackKeys(nav)).toEqual(keys(s))
    expect(w.entries.length).toBe(1)
  })

  it('one history entry per layer; the app Back pops it', async () => {
    const w = new FakeWindow('#/backups')
    const nav = new Nav(w)
    nav.start()
    nav.open(overlayLayer('menu'))
    await nav.settled()
    expect(w.urls()).toEqual(['#/backups', '#/backups'])
    nav.selectTab('live')
    await nav.settled()
    expect(w.urls()).toEqual(['#/backups', '#/live'])
    expect(stackKeys(nav)).toEqual(['tab:backups', 'tab:live'])
    nav.open(overlayLayer('menu'))
    await nav.settled()
    nav.selectTab('device')
    expect(nav.current.tab).toBe('device') // at once
    await nav.settled()
    expect(w.urls()).toEqual(['#/backups', '#/device'])
    nav.selectTab('backups')
    await nav.settled()
    expect(w.urls()).toEqual(['#/backups'])
  })

  it('replace swaps a sheet for a screen without leaving the sheet in history', async () => {
    const w = new FakeWindow('')
    const nav = new Nav(w)
    nav.start()
    nav.open(sheetLayer('detail:b1'))
    await nav.settled()
    nav.replace(sheetLayer('detail:b1'), screenLayer({ kind: 'contents', id: 'b1' }))
    await nav.settled()
    expect(w.urls()).toEqual(['#/backups', '#/contents/b1'])
    await w.back()
    expect(stackKeys(nav)).toEqual(['tab:backups'])
  })

  it('the browser Back closes layers in Android order', async () => {
    const w = new FakeWindow('#/live')
    const nav = new Nav(w)
    nav.start()
    nav.open(overlayLayer('side'))
    nav.open(sheetLayer('x'))
    await nav.settled()
    await w.back()
    // The side panel went first, although the sheet is on top of the history.
    expect(stackKeys(nav)).toEqual(['tab:backups', 'tab:live', 'overlay:sheet:x'])
    expect(stackFromState(w.history.state)!.map(layerKey)).toEqual(stackKeys(nav))
    await w.back()
    expect(stackKeys(nav)).toEqual(['tab:backups', 'tab:live'])
    await w.back()
    expect(stackKeys(nav)).toEqual(['tab:backups'])
    expect(w.location.hash).toBe('#/backups')
  })

  it('the back guard keeps a modal in place', async () => {
    const w = new FakeWindow('#/settings')
    const nav = new Nav(w)
    nav.start()
    let modal = true
    nav.setBackGuard(() => modal)
    await w.back()
    expect(stackKeys(nav)).toEqual(['tab:backups', 'screen:#/settings'])
    expect(w.location.hash).toBe('#/settings')
    modal = false
    await w.back()
    expect(stackKeys(nav)).toEqual(['tab:backups'])
  })

  it('a typed-in hash starts a stack for it', () => {
    const w = new FakeWindow('#/backups')
    const nav = new Nav(w)
    nav.start()
    w.entries.push({ state: null, url: '#/search' })
    w.index++
    w.fire()
    expect(stackKeys(nav)).toEqual(['tab:backups', 'screen:#/search'])
  })

  it('calls tabChanged and setLive as the stack moves', async () => {
    const w = new FakeWindow('')
    const nav = new Nav(w)
    nav.start()
    const calls: string[] = []
    bindViewHooks(nav, {
      tabChanged: (a: Tab, b: Tab) => calls.push(`tab ${a}>${b}`),
      setLive: (l) => calls.push(`live ${l}`),
    })
    nav.selectTab('live')
    nav.openScreen({ kind: 'guide' })
    nav.back()
    nav.openScreen({ kind: 'settings' })
    nav.back()
    nav.selectTab('device')
    await nav.settled()
    await w.back()
    expect(calls).toEqual([
      'live false',
      'tab backups>live',
      'live true',
      'live false',
      'live true',
      'live false',
      'live true',
      'tab live>device',
      'live false',
      'tab device>backups',
    ])
  })

  it('a page loaded on another tab counts as a switch from Backups', () => {
    const w = new FakeWindow('#/device')
    const nav = new Nav(w)
    nav.start()
    const calls: string[] = []
    bindViewHooks(nav, {
      tabChanged: (a: Tab, b: Tab) => calls.push(`tab ${a}>${b}`),
      setLive: (l) => calls.push(`live ${l}`),
    })
    expect(calls).toEqual(['tab backups>device', 'live false'])
  })

  it('closing the contents or compare screen, by Done or Back, runs its onBack', async () => {
    const w = new FakeWindow('')
    const nav = new Nav(w)
    nav.start()
    const calls: string[] = []
    bindViewHooks(nav, {
      tabChanged: () => undefined,
      setLive: () => undefined,
      closeContents: () => calls.push('closeContents'),
      closeCompare: () => calls.push('closeCompare'),
    })
    nav.openScreen({ kind: 'search' })
    nav.openScreen({ kind: 'contents', id: 'a' })
    nav.open(sheetLayer('pads:backup:a:1'))
    await nav.settled()
    await w.back() // the pads sheet
    expect(calls).toEqual([])
    await w.back() // the contents screen
    expect(calls).toEqual(['closeContents'])
    expect(nav.current.search).toBe(true)
    nav.back()
    nav.openScreen({ kind: 'compare', a: 'a', b: 'b' })
    nav.close(screenLayer({ kind: 'compare', a: 'a', b: 'b' }))
    expect(calls).toEqual(['closeContents', 'closeCompare'])
  })
})
