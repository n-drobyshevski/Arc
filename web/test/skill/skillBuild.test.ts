// Not in the Kotlin tests: web-only check that the Claude skill's generated files are current.
// skill/arc-beats/references/ep133-guide.md comes from core's GuideText.kt and
// public/arc-beats-skill.zip from the whole skill folder (scripts/gen-skill-guide.mjs, npm run gen:skill).

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('../../scripts/gen-skill-guide.mjs', import.meta.url))
const zipPath = fileURLToPath(new URL('../../public/arc-beats-skill.zip', import.meta.url))

/** The entry names of a zip, from its central directory. */
function names(zip: Buffer): string[] {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = zip.readUInt16LE(end + 10)
  let at = zip.readUInt32LE(end + 16)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const nameLen = zip.readUInt16LE(at + 28)
    const extraLen = zip.readUInt16LE(at + 30)
    const commentLen = zip.readUInt16LE(at + 32)
    out.push(zip.toString('utf8', at + 46, at + 46 + nameLen))
    at += 46 + nameLen + extraLen + commentLen
  }
  return out
}

describe('arc-beats skill', () => {
  it('the committed guide and zip are what the generator makes', () => {
    // Exits 1 and names the stale file when not.
    execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8', stdio: 'pipe' })
  })

  it('the guide has all 100 combinations, each with its source', () => {
    const guide = execFileSync(process.execPath, [script, '--stdout'], { encoding: 'utf8' })
    expect(guide.match(/^### [A-Z]+-\d+ /gm)).toHaveLength(100)
    expect(guide.match(/^- \*\*Source:\*\* https:\/\/teenage\.engineering\//gm)).toHaveLength(100)
  })

  it('the zip has arc-beats/ at its root with SKILL.md inside', () => {
    const list = names(readFileSync(zipPath))
    expect(list[0]).toBe('arc-beats/')
    expect(list).toContain('arc-beats/SKILL.md')
    expect(list).toContain('arc-beats/references/ep133-guide.md')
    expect(list).toContain('arc-beats/scripts/beatcard.py')
    expect(list.every((n) => n.startsWith('arc-beats/'))).toBe(true)
    expect(list.some((n) => n.endsWith('README.md') && !n.startsWith('arc-beats/references/'))).toBe(false)
    expect(list.some((n) => n.includes('__pycache__'))).toBe(false)
    // The tests read the repo and README.md, which the zip lacks, and they carry a guard list of words users have no use for.
    expect(list.some((n) => /(^|\/)test_/.test(n))).toBe(false)
  })
})
