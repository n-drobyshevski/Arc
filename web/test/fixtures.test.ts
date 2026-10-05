import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { samplePak } from './helpers/fixtures'

// Port of core/src/test/kotlin/dev/arc/ep133/FixturesTest.kt
describe('fixtures', () => {
  it('reference sample pak is present and unchanged', () => {
    const bytes = samplePak()
    expect(bytes.length).toBe(290148)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      'f69ba21fed89d495be92f52ff60cec0ba62d1a34be93323167b26183767f7e37',
    )
  })
})
