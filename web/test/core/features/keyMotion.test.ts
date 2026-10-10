// Port of core/src/test/kotlin/dev/arc/ep133/features/KeyMotionTest.kt (the release
// curve; the per-frame steps are Kotlin's only), and the web's own: tokens.css
// runs these numbers.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DAMPING, PRESS_MS, RELEASE_MS, STIFFNESS, release, springCss } from '../../../src/core/features/keyMotion'

const kotlin = readFileSync(new URL('../../../../core/src/main/kotlin/dev/arc/ep133/features/KeyMotion.kt', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../../src/ui/theme/tokens.css', import.meta.url), 'utf8')
const token = (name: string): string | undefined => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim()

describe('KeyMotionTest', () => {
  it('the release curve', () => {
    expect(release(0)).toBeCloseTo(0, 9)
    expect(release(1)).toBeCloseTo(1, 2)
    // It passes rest by 16% of the travel once.
    let peak = 0
    for (let i = 0; i <= 1000; i++) peak = Math.max(peak, release(i / 1000))
    expect(peak).toBeCloseTo(1.163, 2)
  })
})

describe('keyMotion (web)', () => {
  it('has Kotlin’s numbers', () => {
    const num = (name: string): number => Number(kotlin.match(new RegExp(`const val ${name} = ([\\d.]+)`))?.[1])
    expect(num('PRESS_MS')).toBe(PRESS_MS)
    expect(num('DAMPING')).toBe(DAMPING)
    expect(num('STIFFNESS')).toBe(STIFFNESS)
    expect(num('RELEASE_MS')).toBe(RELEASE_MS)
  })

  it('tokens.css runs them', () => {
    expect(token('--key-down-ms')).toBe(`${PRESS_MS}ms`)
    expect(token('--key-up-ms')).toBe(`${RELEASE_MS}ms`)
    expect(token('--key-spring')).toBe(springCss())
  })
})
