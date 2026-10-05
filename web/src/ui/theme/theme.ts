// Port of app/src/main/kotlin/dev/arc/ep133/ui/theme/ArcTheme.kt (ArcTheme(dark = isSystemInDarkTheme()))
// and the theme handling in MainActivity.kt (Settings: System / Light / Dark).
//
// applyTheme() sets html[data-theme] to the resolved 'light' or 'dark' (tokens.css
// switches on it), html[data-theme-setting] to the setting, and the
// <meta name=theme-color> tags to the page (shell) colour. With SYSTEM it keeps
// following prefers-color-scheme until another setting is applied. Call it
// before the first render with the stored setting (settings reads are
// synchronous), and again whenever c.settings.theme changes.
import { signal } from '@preact/signals'
import type { ThemeChoice } from '../../core/text/settingsText'

export type ThemeSetting = ThemeChoice
export type ResolvedTheme = 'light' | 'dark'

/** ArcColors.shell, light and dark: the browser chrome matches the page. */
export const THEME_COLOR: Readonly<Record<ResolvedTheme, string>> = Object.freeze({
  light: '#E6E2DB',
  dark: '#1C1D1E',
})

export const DARK_QUERY = '(prefers-color-scheme: dark)'

/** The theme in effect, for code that draws with colours (canvas) and must redraw. */
export const resolvedTheme = signal<ResolvedTheme>('light')

/** The few DOM parts applyTheme touches; tests pass a fake. */
export interface ThemeElement {
  setAttribute(name: string, value: string): void
  getAttribute(name: string): string | null
}
export interface ThemeDocument {
  readonly documentElement: ThemeElement
  readonly head: { appendChild(node: ThemeElement): unknown } | null
  querySelectorAll(selector: string): ArrayLike<ThemeElement>
  createElement(tag: string): ThemeElement
}
export interface ThemeMedia {
  readonly matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}
export interface ThemeEnv {
  readonly document: ThemeDocument
  /** Absent where matchMedia is missing: SYSTEM then means light. */
  readonly matchMedia?: ((query: string) => ThemeMedia) | undefined
}

export function resolveTheme(setting: ThemeSetting, systemDark: boolean): ResolvedTheme {
  if (setting === 'DARK') return 'dark'
  if (setting === 'LIGHT') return 'light'
  return systemDark ? 'dark' : 'light'
}

function browserEnv(): ThemeEnv | null {
  if (typeof document === 'undefined') return null
  const mm = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? (q: string) => window.matchMedia(q)
    : undefined
  // Document satisfies ThemeDocument structurally except for appendChild's Node bound.
  return { document: document as unknown as ThemeDocument, matchMedia: mm }
}

// The live SYSTEM listener, so a later applyTheme replaces it.
let following: { media: ThemeMedia; listener: () => void } | null = null

function stopFollowing(): void {
  if (!following) return
  following.media.removeEventListener('change', following.listener)
  following = null
}

function setMetaThemeColor(doc: ThemeDocument, setting: ThemeSetting, theme: ResolvedTheme): void {
  const metas = Array.from(doc.querySelectorAll('meta[name="theme-color"]'))
  if (metas.length === 0) {
    const meta = doc.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    doc.head?.appendChild(meta)
    metas.push(meta)
  }
  for (const meta of metas) {
    // With SYSTEM each media-specific tag gets its own scheme's colour; a chosen
    // theme puts the same colour in every tag, whichever one the browser applies.
    const media = meta.getAttribute('media') ?? ''
    const own: ResolvedTheme | null = /dark/.test(media) ? 'dark' : /light/.test(media) ? 'light' : null
    const color = setting === 'SYSTEM' && own ? THEME_COLOR[own] : THEME_COLOR[theme]
    meta.setAttribute('content', color)
  }
}

function paint(env: ThemeEnv, setting: ThemeSetting, systemDark: boolean): ResolvedTheme {
  const theme = resolveTheme(setting, systemDark)
  const root = env.document.documentElement
  root.setAttribute('data-theme', theme)
  root.setAttribute('data-theme-setting', setting)
  setMetaThemeColor(env.document, setting, theme)
  resolvedTheme.value = theme
  return theme
}

/**
 * Applies [setting] to the page and returns the theme now in effect. Safe to call
 * repeatedly; outside a browser (no document, no env) it only resolves.
 */
export function applyTheme(setting: ThemeSetting, env: ThemeEnv | null = browserEnv()): ResolvedTheme {
  stopFollowing()
  if (!env) return resolveTheme(setting, false)
  const media = env.matchMedia?.(DARK_QUERY)
  if (setting === 'SYSTEM' && media) {
    const listener = (): void => { paint(env, 'SYSTEM', media.matches) }
    media.addEventListener('change', listener)
    following = { media, listener }
  }
  return paint(env, setting, media?.matches ?? false)
}

/** Stops following the system theme (teardown, tests). */
export function disposeTheme(): void {
  stopFollowing()
}
