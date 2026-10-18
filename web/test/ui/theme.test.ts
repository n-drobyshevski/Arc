// Tests for src/ui/theme/theme.ts (applyTheme) and the tokens.css colour parity
// with app/src/main/kotlin/dev/arc/ep133/ui/theme/ArcTheme.kt.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyTheme,
  disposeTheme,
  resolveTheme,
  resolvedSkin,
  resolvedTheme,
  SKIN_THEME_COLOR,
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

  it('sets data-skin (the EP-133 by default) and the skin\'s page colour', () => {
    const t = setup(true)
    applyTheme('LIGHT', t.env)
    expect(t.html.getAttribute('data-skin')).toBe('EP133')
    applyTheme('DARK', t.env, 'EP40')
    expect(t.html.getAttribute('data-skin')).toBe('EP40')
    expect(t.contents()).toEqual(['#0E1813', '#0E1813'])
    expect(resolvedSkin.value).toBe('EP40')
    // SYSTEM: each tag its own scheme's colour, in the skin.
    applyTheme('SYSTEM', t.env, 'EP1320')
    expect(t.contents()).toEqual(['#D0B97E', '#121714'])
    t.media.flip(false)
    expect(t.html.getAttribute('data-theme')).toBe('light')
    expect(t.html.getAttribute('data-skin')).toBe('EP1320')
    applyTheme('LIGHT', t.env)
    expect(resolvedSkin.value).toBe('EP133')
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
    expect(light.size).toBe(34)
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

// ---- the skins: tokens.css and cap.css against ArcTheme.kt and Cap.kt ----

const capKt = readFileSync(new URL('../../../app/src/main/kotlin/dev/arc/ep133/ui/components/Cap.kt', import.meta.url), 'utf8')
const capCss = readFileSync(new URL('../../src/ui/theme/cap.css', import.meta.url), 'utf8')

function ktBlock(src: string, head: string): string {
  const start = src.indexOf(head)
  expect(start, head).toBeGreaterThanOrEqual(0)
  return src.slice(start + head.length, src.indexOf('\n)', start))
}

function ktColors(body: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of body.matchAll(/(\w+) = Color\(0xFF([0-9A-Fa-f]{6})\)/g)) out.set(kebab(m[1]!), `#${m[2]!.toUpperCase()}`)
  return out
}

function cssVars(src: string, selector: string): Map<string, string> {
  const start = src.indexOf(`${selector} {`)
  expect(start, selector).toBeGreaterThanOrEqual(0)
  const body = src.slice(start, src.indexOf('}', start))
  const out = new Map<string, string>()
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6});/g)) out.set(m[1]!, m[2]!.toUpperCase())
  return out
}

/** An ArcColors palette made as a copy of another, every colour resolved. */
function palette(name: string, base: string, of: Map<string, string>): Map<string, string> {
  return new Map([...of, ...ktColors(ktBlock(kotlin, `val ${name}ArcColors = ${base}ArcColors.copy(`))])
}

/** KoColors' defaults, then [name]'s, with its knobs as four colours each (skirt, edge, cap, cap edge). */
function koColors(name: string): Map<string, string> {
  const knobs = (body: string): Map<string, string> => {
    const out = new Map<string, string>()
    for (const m of body.matchAll(/(knob\w+)(?::\s*List<Color>)? = listOf\(((?:Color\(0xFF[0-9A-Fa-f]{6}\),?\s*){4})\)/g)) {
      const hex = [...m[2]!.matchAll(/0xFF([0-9A-Fa-f]{6})/g)].map((h) => `#${h[1]!.toUpperCase()}`)
      ;['', '-edge', '-cap', '-cap-edge'].forEach((suf, i) => out.set(`${kebab(m[1]!)}${suf}`, hex[i]!))
    }
    return out
  }
  const cls = ktBlock(capKt, 'data class KoColors(')
  const defaults = new Map<string, string>()
  for (const m of cls.matchAll(/val (\w+): Color = Color\(0xFF([0-9A-Fa-f]{6})\)/g)) defaults.set(kebab(m[1]!), `#${m[2]!.toUpperCase()}`)
  const body = ktBlock(capKt, `val ${name}KoColors = KoColors(`)
  return new Map([...defaults, ...knobs(cls), ...ktColors(body), ...knobs(body)])
}

/** A skin's HwColors, made as a copy of another: its own colours and those it takes from its KoColors. */
function hwColors(name: string, base: string, of: Map<string, string>, ko: Map<string, string>): Map<string, string> {
  const body = ktBlock(capKt, `val ${name}HwColors = ${base}HwColors.copy(`)
  const out = new Map([...of, ...ktColors(body)])
  for (const m of body.matchAll(/(\w+) = \w+KoColors\.(\w+),/g)) out.set(kebab(m[1]!), ko.get(kebab(m[2]!))!)
  return out
}

const HW = ['dark-face', 'dark-edge', 'dark-ink', 'dark-dim', 'light-face', 'light-edge', 'light-ink', 'body', 'led-off']

describe('the skins', () => {
  const lightKt = kotlinColors('val LightArcColors = ArcColors(')
  const lightHw = ktColors(ktBlock(capKt, 'val LightHwColors = HwColors('))

  for (const [skin, kt] of [['EP40', 'Ep40'], ['EP1320', 'Ep1320']] as const) {
    const light = palette(`${kt}Light`, 'Light', lightKt)
    const dark = palette(`${kt}Dark`, `${kt}Light`, light)
    const ko = koColors(kt)
    const hwLight = hwColors(`${kt}Light`, 'Light', lightHw, ko)
    const hwDark = hwColors(`${kt}Dark`, `${kt}Light`, hwLight, ko)

    it(`${skin}: tokens.css has every colour of its ArcColors, light and dark, and its hatching`, () => {
      expect(light.size).toBe(34)
      for (const [sel, pal] of [[`:root[data-skin=${skin}]`, light], [`:root[data-skin=${skin}][data-theme=dark]`, dark]] as const) {
        const block = cssBlock(sel)
        expect(new Map([...block].filter(([k]) => !k.startsWith('hatch'))), sel).toEqual(pal)
        expect(cssHatch(sel), sel).toEqual([pal.get('key-edge'), pal.get('key-edge')])
      }
    })

    it(`${skin}: cap.css has its keys and drawn device, and the dark body, LED and edge`, () => {
      const light = cssVars(capCss, `:root[data-skin=${skin}]`)
      for (const k of HW) expect(light.get(`hw-${k}`), k).toBe(hwLight.get(k))
      for (const [k, v] of ko) expect(light.get(`ko-${k}`), k).toBe(v)
      const dark = cssVars(capCss, `:root[data-skin=${skin}][data-theme=dark]`)
      for (const k of HW) expect(dark.get(`hw-${k}`), k).toBe(hwDark.get(k))
      const edge = /ko = \w+KoColors\.copy\(edge = Color\(0xFF([0-9A-Fa-f]{6})\)\)/.exec(ktBlock(capKt, `val ${kt}DarkHwColors = `))
      expect(dark.get('ko-edge')).toBe(`#${edge![1]!.toUpperCase()}`)
    })

    it(`${skin}: the browser bar takes its shell`, () => {
      expect(SKIN_THEME_COLOR[skin]).toEqual({ light: light.get('shell'), dark: dark.get('shell') })
    })
  }
})
