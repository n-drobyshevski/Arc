import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// reference/ is the spec and is read in place, never copied (like the Kotlin tests).
export const referenceDir = fileURLToPath(new URL('../../../reference/', import.meta.url))
export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

export function samplePak(): Uint8Array {
  return new Uint8Array(readFileSync(referenceDir + 'test/fixtures/sample.pak'))
}

export function referenceSource(path: string): string {
  return readFileSync(referenceDir + path, 'utf8')
}

/** The version string the reference web app writes into .pak files (parity tests use it). */
export function referenceAppVersion(): string {
  const m = /APP_VERSION = '([^']+)'/.exec(referenceSource('src/backup.js'))
  if (!m?.[1]) throw new Error('APP_VERSION not found in reference/src/backup.js')
  return m[1]
}
