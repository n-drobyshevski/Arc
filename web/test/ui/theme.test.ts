// Tests for src/ui/theme/theme.ts (applyTheme) and the tokens.css colour parity
// with app/src/main/kotlin/dev/arc/ep133/ui/theme/ArcTheme.kt.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyTheme,
  disposeTheme,
  resolveTheme,
  resolvedTheme,
  THEME_COLOR,
  type ThemeDocument,
  type ThemeElement,
  type ThemeEnv,
  type ThemeMedia,
} from '../../src/ui/theme/theme'

class FakeElement implements ThemeElement {
  readonly attrs = new Map<string, string>()
  constructor(readonly tag: string, attrs: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v)
  }
  setAttribute(name: string, value: string): void { this.attrs.set(name, value) }
  getAttribute(name: string): string | null { return this.attrs.get(name) ?? null }
}

class FakeDocument implements ThemeDocument {
  readonly documentElement = new FakeElement('html')
  readonly metas: FakeElement[] = []
  readonly head = { appendChild: (node: ThemeElement) => { this.metas.push(node as FakeElement) } }
  querySelectorAll(selector: string): ArrayLike<ThemeElement> {
    expect(selector).toBe('meta[name="theme-color"]')
    return this.metas.filter((m) => m.getAttribute('name') === 'theme-color')
  }
  createElement(tag: string): ThemeElement { return new FakeElement(tag) }
}

class FakeMedia implements ThemeMedia {
  readonly listeners = new Set<() => void>()
  constructor(public matches: boolean) {}
  addEventListener(_: 'change', l: () => void): void { this.listeners.add(l) }
  removeEventListener(_: 'change', l: () => void): void { this.listeners.delete(l) }
  flip(matches: boolean): void {
    this.matches = matches
    for (const l of [...this.listeners]) l()
  }
}

function setup(systemDark: boolean, withMetas = true) {
  const doc = new FakeDocument()
  if (withMetas) {
    // As in index.html.
    doc.metas.push(new FakeElement('meta', { name: 'theme-color', content: '#E6E2DB', media: '(prefers-color-scheme: light)' }))
    doc.metas.push(new FakeElement('meta', { name: 'theme-color', content: '#1C1D1E', media: '(prefers-color-scheme: dark)' }))
  }
  const media = new FakeMedia(systemDark)
  const queries: string[] = []
  const env: ThemeEnv = { document: doc, matchMedia: (q) => { queries.push(q); return media } }
  const html = doc.documentElement
  const contents = () => doc.metas.map((m) => m.getAttribute('content'))
  return { doc, media, env, html, contents, queries }
}

afterEach(() => disposeTheme())

describe('applyTheme', () => {
  it('LIGHT sets data-theme=light and the light page colour in every theme-color tag', () => {
    const t = setup(true)
    expect(applyTheme('LIGHT', t.env)).toBe('light')
    expect(t.html.getAttribute('data-theme')).toBe('light')
    expect(t.html.getAttribute('data-theme-setting')).toBe('LIGHT')
    expect(t.contents()).toEqual(['#E6E2DB', '#E6E2DB'])
    expect(resolvedTheme.value).toBe('light')
  })

  it('DARK sets data-theme=dark and the dark page colour', () => {
    const t = setup(false)
    expect(applyTheme('DARK', t.env)).toBe('dark')
    expect(t.html.getAttribute('data-theme')).toBe('dark')
    expect(t.html.getAttribute('data-theme-setting')).toBe('DARK')
    expect(t.contents()).toEqual(['#1C1D1E', '#1C1D1E'])
    expect(resolvedTheme.value).toBe('dark')
  })

  it('SYSTEM resolves from prefers-color-scheme and restores the per-media colours', () => {
    const t = setup(true)
    applyTheme('LIGHT', t.env)
    expect(applyTheme('SYSTEM', t.env)).toBe('dark')
    expect(t.queries).toContain('(prefers-color-scheme: dark)')
    expect(t.html.getAttribute('data-theme')).toBe('dark')
    expect(t.html.getAttribute('data-theme-setting')).toBe('SYSTEM')
    expect(t.contents()).toEqual(['#E6E2DB', '#1C1D1E'])
  })

  it('SYSTEM follows system changes until another setting is applied', () => {
    const t = setup(false)
    applyTheme('SYSTEM', t.env)
    expect(t.html.getAttribute('data-theme')).toBe('light')
    t.media.flip(true)
    expect(t.html.getAttribute('data-theme')).toBe('dark')
    expect(resolvedTheme.value).toBe('dark')
    t.media.flip(false)
    expect(t.html.getAttribute('data-theme')).toBe('light')

    applyTheme('DARK', t.env)
    expect(t.media.listeners.size).toBe(0)
    t.media.flip(false)
    expect(t.html.getAttribute('data-theme')).toBe('dark')
  })

  it('re-applying SYSTEM keeps a single listener; disposeTheme removes it', () => {
    const t = setup(false)
    applyTheme('SYSTEM', t.env)
    applyTheme('SYSTEM', t.env)
    expect(t.media.listeners.size).toBe(1)
    disposeTheme()
    expect(t.media.listeners.size).toBe(0)
  })

  it('creates a theme-color tag when the page has none', () => {
    const t = setup(false, false)
    applyTheme('DARK', t.env)
    expect(t.doc.metas).toHaveLength(1)
    expect(t.doc.metas[0]!.getAttribute('name')).toBe('theme-color')
    expect(t.contents()).toEqual(['#1C1D1E'])
  })

  it('SYSTEM without matchMedia means light', () => {
    const doc = new FakeDocument()
    expect(applyTheme('SYSTEM', { document: doc })).toBe('light')
    expect(doc.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('without a document only resolves', () => {
    expect(applyTheme('DARK', null)).toBe('dark')
    expect(resolveTheme('SYSTEM', true)).toBe('dark')
    expect(resolveTheme('SYSTEM', false)).toBe('light')
    expect(resolveTheme('LIGHT', true)).toBe('light')
  })
})

// ---- tokens.css against ArcTheme.kt ----

const kotlin = readFileSync(new URL('../../../app/src/main/kotlin/dev/arc/ep133/ui/theme/ArcTheme.kt', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../src/ui/theme/tokens.css', import.meta.url), 'utf8')

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)

function kotlinColors(block: string): Map<string, string> {
  const start = kotlin.indexOf(block)
  expect(start).toBeGreaterThanOrEqual(0)
  const body = kotlin.slice(start, kotlin.indexOf('\n)', start))
  const out = new Map<string, string>()
  for (const m of body.matchAll(/(\w+) = Color\(0xFF([0-9A-Fa-f]{6})\)/g)) out.set(kebab(m[1]!), `#${m[2]!.toUpperCase()}`)
  return out
}

function cssBlock(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  expect(start, selector).toBeGreaterThanOrEqual(0)
  const body = css.slice(start, css.indexOf('}', start))
  const out = new Map<string, string>()
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6});/g)) out.set(m[1]!, m[2]!.toUpperCase())
  return out
}

function cssHatch(selector: string): string[] {
  const start = css.indexOf(`${selector} {`)
  const body = css.slice(start, css.indexOf('}', start))
  return [...body.matchAll(/--hatch(?:-7)?: url\("[^"]*stroke='%23([0-9A-F]{6})'/g)].map((m) => `#${m[1]!}`)
}

describe('tokens.css', () => {
  const light = kotlinColors('val LightArcColors = ArcColors(')
  const darkDelta = kotlinColors('val DarkArcColors = LightArcColors.copy(')

  it('has every light colour of ArcTheme.kt with the exact value', () => {
    expect(light.size).toBe(29)
    const root = cssBlock(':root')
    for (const [name, hex] of light) expect(root.get(name), name).toBe(hex)
  })

  it('has every dark override in both dark blocks, identical, and nothing else', () => {
    const explicit = cssBlock(':root[data-theme=dark]')
    const system = cssBlock(':root:not([data-theme=light])')
    expect(explicit).toEqual(system)
    expect(new Map([...explicit].filter(([k]) => !k.startsWith('hatch')))).toEqual(darkDelta)
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme=light\]\) \{/)
  })

  it('bakes keyEdge into the hatch tiles per theme', () => {
    expect(cssHatch(':root')).toEqual([light.get('key-edge'), light.get('key-edge')])
    expect(cssHatch(':root[data-theme=dark]')).toEqual([darkDelta.get('key-edge'), darkDelta.get('key-edge')])
    expect(cssHatch(':root:not([data-theme=light])')).toEqual([darkDelta.get('key-edge'), darkDelta.get('key-edge')])
  })

  it('theme-color values are the shell colours', () => {
    expect(THEME_COLOR.light).toBe(light.get('shell'))
    expect(THEME_COLOR.dark).toBe(darkDelta.get('shell'))
  })
})
