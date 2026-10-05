import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { repoRoot } from './helpers/fixtures'
import { APP_NAME, APP_VERSION, PAK_AUTHOR } from '../src/version'

// Port of core/src/test/kotlin/dev/arc/ep133/VersionTest.kt
describe('version', () => {
  it('the pak author version is the one in version.properties', () => {
    const v = /^version=(.*)$/m.exec(readFileSync(repoRoot + 'version.properties', 'utf8'))![1]!.trim()
    expect(APP_VERSION).toBe(v)
    expect(`${APP_NAME} ${APP_VERSION}`).toBe(`arc ${v}`)
    expect(PAK_AUTHOR).toBe(`arc ${v}`)
  })
})
