import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import preact from '@preact/preset-vite'

// version.properties at the repo root is the one place arc's version is set,
// shared with the Android build. Same rule: MAJOR.MINOR.PATCH, minor and patch below 100.
function readVersion(): string {
  const file = fileURLToPath(new URL('../version.properties', import.meta.url))
  const match = /^version=(.*)$/m.exec(readFileSync(file, 'utf8'))
  const v = match?.[1]?.trim() ?? ''
  if (!/^\d+\.\d{1,2}\.\d{1,2}$/.test(v)) throw new Error(`version.properties: "${v}" is not MAJOR.MINOR.PATCH`)
  return v
}

// Release builds (Vercel production, or ARC_RELEASE=true) show exactly X.Y.Z, like
// Android release builds. Others are X.Y.Z-dev, plus the CI run and commit when known.
function buildName(v: string): string {
  const env = process.env
  if (env.ARC_RELEASE === 'true' || env.VERCEL_ENV === 'production') return v
  let name = `${v}-dev`
  if (env.GITHUB_RUN_NUMBER) name += `.${env.GITHUB_RUN_NUMBER}`
  const sha = env.GITHUB_SHA || env.VERCEL_GIT_COMMIT_SHA
  if (sha) name += `+${sha.slice(0, 7)}`
  return name
}

const version = readVersion()

export default defineConfig({
  plugins: [preact()],
  base: './',
  define: {
    __ARC_VERSION__: JSON.stringify(version),
    __ARC_BUILD__: JSON.stringify(buildName(version)),
  },
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 20000,
    env: { TZ: 'UTC' },
  },
})
