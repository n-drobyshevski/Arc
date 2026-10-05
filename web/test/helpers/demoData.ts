// Port of core/src/test/kotlin/dev/arc/ep133/testing/DemoData.kt (+ reference/test/demo-data.js)
//
// Small, deterministic device contents for the simulator. reference/test/fixtures/sample.pak
// is a backup of exactly this device.

import { pad, tarFile } from './bytes'
import { MockEP133, type MockOptions, type MockProject, type MockSound } from './mockDevice'

export { tarFile }

/** `padRecord(slot)` from demo-data.js: a 26-byte pad record with the slot little-endian in bytes 1..2. */
export const padRecord = pad

/** A decaying sine, as little-endian s16 (channels interleaved, all equal). */
export function tone(frames: number, freq: number, channels = 1): Uint8Array {
  const a = new Int16Array(frames * channels)
  for (let i = 0; i < frames; i++) {
    const v = Math.round(Math.sin((i * freq * 2 * Math.PI) / 46875) * 12000 * Math.exp(-i / (frames / 3)))
    for (let c = 0; c < channels; c++) a[i * channels + c] = v
  }
  return new Uint8Array(a.buffer)
}

export const NAMES: readonly string[] = [
  'kick',
  'snare',
  'hat closed',
  'hat open',
  'clap',
  'rim',
  'tom low',
  'perc',
  'bass c1',
  'vox chop',
  'stab',
  'riser',
]

/** Slots 1..8 and 108..111; "vox chop" (index 9) is stereo. */
export function demoSounds(): MockSound[] {
  return NAMES.map((name, i) => ({
    slot: i < 8 ? i + 1 : 100 + i,
    name,
    pcm: tone(4000 + i * 1500, 60 + i * 40, i === 9 ? 2 : 1),
    meta: i === 9 ? { channels: 2 } : {},
  }))
}

/** Projects 1, 2 and 5; project k uses sounds k*3 .. k*3+4 on pads a/p01, b/p02, ... plus 222 zero settings bytes. */
export function demoProjects(sounds: MockSound[] = demoSounds()): MockProject[] {
  return [1, 2, 5].map((n, k) => ({
    n,
    tar: tarFile([
      ...sounds
        .slice(k * 3, k * 3 + 5)
        .map((s, j): [string, Uint8Array] => [`pads/${'abcd'[j % 4]}/p${String(j + 1).padStart(2, '0')}`, pad(s.slot)]),
      ['settings', new Uint8Array(222)],
    ]),
  }))
}

/** demo-data.js `demoDevice()`: the MockEP133 options. */
export function demoDevice(): Required<Pick<MockOptions, 'sounds' | 'projects' | 'capacity'>> {
  const sounds = demoSounds()
  return { sounds, projects: demoProjects(sounds), capacity: 64 * 1024 * 1024 }
}

/** DemoData.kt `device()`: a MockEP133 holding the demo contents. */
export function device(): MockEP133 {
  return new MockEP133(demoDevice())
}

/** Kotlin-shaped access: `DemoData.sounds()`, `DemoData.device()`, ... */
export const DemoData = {
  NAMES,
  tone,
  sounds: demoSounds,
  projects: demoProjects,
  device,
} as const
