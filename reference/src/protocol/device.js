// EP-133 K.O. II filesystem layout and high-level operations.
//
//   /sounds    node 1000, children are sample slots 1..999 (raw s16le PCM + JSON metadata)
//   /projects  node 2000, project N lives at 3000 + (N-1)*1000 and reads/writes as a TAR

import { crc32 } from '../formats/crc32.js'
import { DeviceError } from './session.js'
import {
  PUT_FLAGS_DIR,
  PUT_FLAGS_SOUND,
  download,
  getMetadata,
  listNode,
  listPage,
  setMetadata,
  upload,
} from './fs.js'

export const SOUNDS_NODE = 1000
export const PROJECTS_NODE = 2000
export const MAX_SAMPLE_RATE = 46875
export const MAX_SOUND_NAME = 20

export const projectNode = (n) => 3000 + (n - 1) * 1000
export function projectFromNode(node) {
  if (node < 3000 || (node - 3000) % 1000) return null
  const n = (node - 3000) / 1000 + 1
  return n >= 1 && n <= 99 ? n : null
}

/** Per-sound settings worth carrying through a backup. */
export const SOUND_KEYS = [
  'sound.playmode',
  'sound.rootnote',
  'sound.pitch',
  'sound.pan',
  'sound.amplitude',
  'sound.loopstart',
  'sound.loopend',
  'sound.bpm',
  'time.mode',
  'envelope.attack',
  'envelope.release',
]

const DEFAULT_SOUND = {
  'sound.playmode': 'oneshot',
  'sound.rootnote': 60,
  'sound.pitch': 0,
  'sound.pan': 0,
  'sound.amplitude': 100,
  'envelope.attack': 0,
  'envelope.release': 255,
  'time.mode': 'off',
}

export function pickSoundSettings(meta = {}) {
  const out = {}
  for (const k of SOUND_KEYS) if (meta[k] !== undefined && meta[k] !== null) out[k] = meta[k]
  return out
}

export async function getStorage(session) {
  const m = (await getMetadata(session, SOUNDS_NODE)) ?? {}
  const total = Number(m.max_capacity) || 0
  const free = Number(m.free_space_in_bytes) || 0
  return { total, free, used: Math.max(0, total - free) }
}

export async function listSounds(session) {
  const entries = await listNode(session, SOUNDS_NODE)
  return entries
    .filter((e) => !e.isDir && e.node >= 1 && e.node <= 999)
    .map((e) => ({ slot: e.node, name: e.name, size: e.size }))
    .sort((a, b) => a.slot - b.slot)
}

export async function listProjects(session) {
  const entries = await listNode(session, PROJECTS_NODE)
  const out = []
  for (const e of entries) {
    const n = projectFromNode(e.node)
    if (n != null) out.push({ project: n, node: e.node, name: e.name, size: e.size })
  }
  return out.sort((a, b) => a.project - b.project)
}

export async function readSound(session, slot, opts) {
  const meta = (await getMetadata(session, slot)) ?? {}
  const pcm = await download(session, slot, opts)
  return {
    slot,
    name: meta.name || `sound ${slot}`,
    channels: Number(meta.channels) || 1,
    sampleRate: Number(meta.samplerate) || MAX_SAMPLE_RATE,
    settings: pickSoundSettings(meta),
    pcm,
  }
}

export async function readProject(session, n, opts) {
  return download(session, projectNode(n), opts)
}

function soundMeta({ channels, sampleRate, settings, frames }) {
  const meta = { ...DEFAULT_SOUND, ...pickSoundSettings(settings), channels, samplerate: sampleRate }
  // Loop points beyond the end of the sample confuse the device.
  if (meta['sound.loopend'] != null && meta['sound.loopend'] > frames - 1) meta['sound.loopend'] = frames - 1
  if (meta['sound.loopstart'] != null && meta['sound.loopstart'] > frames - 1) meta['sound.loopstart'] = 0
  // Stay under the 320 byte metadata page by dropping optional keys.
  const optional = ['sound.bpm', 'sound.loopstart', 'sound.loopend', 'time.mode', 'sound.pan']
  while (new TextEncoder().encode(JSON.stringify(meta)).length > 320 && optional.length) {
    delete meta[optional.shift()]
  }
  return meta
}

export function cleanSoundName(name) {
  return (
    String(name || 'sound')
      .replace(/\.wav$/i, '')
      .replace(/[^\x20-\x7e]/g, '')
      .trim()
      .slice(0, MAX_SOUND_NAME) || 'sound'
  )
}

/** Upload PCM (s16le interleaved) into a sample slot and verify it landed intact. */
export async function writeSound(session, { slot, name, pcm, channels, sampleRate, settings }, { onProgress } = {}) {
  if (!pcm.length) throw new DeviceError(`Sound ${slot} is empty`)
  const frames = Math.floor(pcm.length / (2 * channels))
  const meta = soundMeta({ channels, sampleRate, settings, frames })
  await upload(session, {
    node: slot,
    parent: SOUNDS_NODE,
    flags: PUT_FLAGS_SOUND,
    name: cleanSoundName(name),
    meta,
    data: pcm,
    onProgress,
    barrier: () => setMetadata(session, slot, meta, { timeout: 180000, progress: true }),
  })
  const after = (await getMetadata(session, slot)) ?? {}
  if (after.crc != null && after.crc !== crc32(pcm)) {
    throw new DeviceError(`Sound ${slot} did not verify after upload (checksum mismatch)`)
  }
}

/** Upload a project TAR and make the device reload it. */
export async function writeProject(session, n, tar, { onProgress } = {}) {
  const node = projectNode(n)
  await upload(session, {
    node,
    parent: PROJECTS_NODE,
    flags: PUT_FLAGS_DIR,
    name: String(n).padStart(2, '0'),
    data: tar,
    onProgress,
    barrier: () => listPage(session, PROJECTS_NODE, 0, { timeout: 180000, progress: true }),
  })
  // The device keeps the old project in memory if it is the active one.
  // Switch away and back so the new data is actually loaded.
  try {
    const projects = await listProjects(session)
    const other = projects.find((p) => p.project !== n)
    if (other) {
      await setMetadata(session, PROJECTS_NODE, { active: other.node })
      await new Promise((r) => setTimeout(r, 200))
    }
    await setMetadata(session, PROJECTS_NODE, { active: node })
  } catch {
    // Non-fatal: the project is written, it loads next time it is selected.
  }
}
