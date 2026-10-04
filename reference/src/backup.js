// Device ⇄ .pak backup and restore.
//
// A backup is a ZIP laid out like the official Sample Tool's .pak:
//   /meta.json
//   /sounds/NNN name.wav
//   /projects/PNN.tar
// plus /arc.json with per-sound settings and library info, which the
// official tool ignores.

import { CancelledError, getMetadata, setMetadata } from './protocol/fs.js'
import {
  MAX_SAMPLE_RATE,
  PROJECTS_NODE,
  getStorage,
  listProjects,
  listSounds,
  readProject,
  readSound,
  writeProject,
  writeSound,
} from './protocol/device.js'
import { decodeWav, encodeWav, resampleS16 } from './formats/wav.js'
import { readZip, writeZip } from './formats/zip.js'
import { slotsUsedByProject } from './formats/tar.js'

export const APP_NAME = 'arc'
export const APP_VERSION = '0.1.0'

const pad3 = (n) => String(n).padStart(3, '0')
const pad2 = (n) => String(n).padStart(2, '0')
const safeName = (s) => String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 40)

function checkAbort(signal) {
  if (signal?.aborted) throw new CancelledError()
}

/**
 * Pull every sound and project off the device.
 * onProgress({ fraction, label })
 */
export async function backupDevice(session, { onProgress = () => {}, signal } = {}) {
  const info = session.info ?? {}
  onProgress({ fraction: 0, label: 'Reading device contents' })
  const sounds = await listSounds(session)
  let projects = await listProjects(session)
  const probing = projects.length === 0
  if (probing) projects = Array.from({ length: 9 }, (_, i) => ({ project: i + 1, size: 0 }))

  const PROJECT_WEIGHT = 64 * 1024
  const totalWeight =
    sounds.reduce((n, s) => n + Math.max(s.size, 1024), 0) + projects.length * PROJECT_WEIGHT || 1
  let doneWeight = 0
  const report = (label, partial = 0) =>
    onProgress({ fraction: Math.min(1, (doneWeight + partial) / totalWeight), label })

  const entries = []
  const soundInfo = {}
  for (const s of sounds) {
    checkAbort(signal)
    const weight = Math.max(s.size, 1024)
    const label = `Sound ${pad3(s.slot)}, ${s.name}`
    report(label)
    const snd = await readSound(session, s.slot, {
      signal,
      onProgress: (got, total) => report(label, total ? (got / total) * weight : 0),
    })
    entries.push({
      path: `/sounds/${pad3(s.slot)} ${safeName(snd.name)}.wav`,
      data: encodeWav(snd.pcm, { channels: snd.channels, sampleRate: snd.sampleRate }),
    })
    soundInfo[s.slot] = { name: snd.name, settings: snd.settings }
    doneWeight += weight
  }

  const projectNums = []
  for (const p of projects) {
    checkAbort(signal)
    const label = `Project ${pad2(p.project)}`
    report(label)
    try {
      const tar = await readProject(session, p.project, { signal })
      if (tar.length) {
        entries.push({ path: `/projects/P${pad2(p.project)}.tar`, data: tar })
        projectNums.push(p.project)
      }
    } catch (err) {
      if (!probing) throw err
    }
    doneWeight += PROJECT_WEIGHT
  }

  const createdAt = new Date()
  const meta = {
    info: 'teenage engineering - pak file',
    pak_version: 1,
    pak_type: 'user',
    pak_release: '1.2.0',
    device_name: info.product || 'EP-133',
    device_sku: info.sku || '',
    device_version: info.osVersion || '',
    generated_at: createdAt.toISOString(),
    author: `${APP_NAME} ${APP_VERSION}`,
  }
  const sidecar = { app: APP_NAME, version: 1, sounds: soundInfo }
  entries.unshift(
    { path: '/meta.json', data: new TextEncoder().encode(JSON.stringify(meta, null, 2)) },
    { path: '/arc.json', data: new TextEncoder().encode(JSON.stringify(sidecar)) },
  )
  onProgress({ fraction: 1, label: 'Packing backup' })
  const blob = await writeZip(entries, { date: createdAt })
  return {
    blob,
    summary: {
      createdAt: createdAt.getTime(),
      device: { product: info.product || 'EP-133', sku: info.sku || '', serial: info.serial || '', osVersion: info.osVersion || '' },
      soundCount: sounds.length,
      projectCount: projectNums.length,
      projects: projectNums,
    },
  }
}

/** Parse a .pak (ours or the official Sample Tool's). */
export async function openPak(bytes) {
  const files = await readZip(bytes)
  const json = (k) => {
    const b = files.get(k)
    if (!b) return null
    try {
      return JSON.parse(new TextDecoder().decode(b))
    } catch {
      return null
    }
  }
  const meta = json('meta.json') ?? {}
  const sidecar = json('arc.json') ?? {}
  const sounds = new Map()
  const projects = new Map()
  for (const [path, data] of files) {
    let m = /^sounds\/(\d{1,3})(?:\s+(.*))?\.wav$/i.exec(path)
    if (m) {
      const slot = Number(m[1])
      if (slot < 1 || slot > 999) continue
      const side = sidecar.sounds?.[slot] ?? {}
      sounds.set(slot, { slot, name: side.name || m[2] || `sound ${slot}`, wav: data, settings: side.settings ?? null })
      continue
    }
    m = /^projects\/P(\d{1,2})\.tar$/i.exec(path)
    if (m) {
      const n = Number(m[1])
      if (n >= 1 && n <= 99) projects.set(n, data)
    }
  }
  if (!sounds.size && !projects.size) throw new Error('This file has no sounds or projects in it')
  return { meta, sidecar, sounds, projects }
}

export function describePak(pak) {
  const projectSlots = {}
  for (const [n, tar] of pak.projects) projectSlots[n] = slotsUsedByProject(tar)
  return {
    soundCount: pak.sounds.size,
    projectCount: pak.projects.size,
    projects: [...pak.projects.keys()].sort((a, b) => a - b),
    slots: [...pak.sounds.keys()].sort((a, b) => a - b),
    soundNames: Object.fromEntries([...pak.sounds].map(([k, v]) => [k, v.name])),
    projectSlots,
    device: {
      product: pak.meta.device_name || '',
      sku: pak.meta.device_sku || '',
      osVersion: pak.meta.device_version || '',
    },
    generatedAt: pak.meta.generated_at ? Date.parse(pak.meta.generated_at) || null : null,
  }
}

function prepareSound(snd) {
  const wav = decodeWav(snd.wav)
  const rate = Math.min(wav.sampleRate, MAX_SAMPLE_RATE)
  const pcm = resampleS16(wav.pcm, wav.channels, wav.sampleRate, rate)
  const settings = { ...(wav.embedded ?? {}), ...(snd.settings ?? {}) }
  if (rate !== wav.sampleRate) {
    const k = rate / wav.sampleRate
    for (const key of ['sound.loopstart', 'sound.loopend']) {
      if (typeof settings[key] === 'number') settings[key] = Math.round(settings[key] * k)
    }
  }
  return { slot: snd.slot, name: snd.name, pcm, channels: wav.channels, sampleRate: rate, settings }
}

/**
 * Write a .pak (or a subset of it) back to the device.
 * @param {{ slots?: number[], projects?: number[] }} selection defaults to everything
 */
export async function restorePak(session, pak, { slots, projects, onProgress = () => {}, signal } = {}) {
  const slotList = (slots ?? [...pak.sounds.keys()]).filter((s) => pak.sounds.has(s)).sort((a, b) => a - b)
  const projList = (projects ?? [...pak.projects.keys()]).filter((p) => pak.projects.has(p)).sort((a, b) => a - b)

  onProgress({ fraction: 0, label: 'Checking space on device' })
  const prepared = slotList.map((s) => prepareSound(pak.sounds.get(s)))
  const needed = prepared.reduce((n, p) => n + p.pcm.length, 0)
  const storage = await getStorage(session)
  if (storage.total) {
    const onDevice = await listSounds(session)
    const reclaim = onDevice.filter((s) => slotList.includes(s.slot)).reduce((n, s) => n + s.size, 0)
    if (needed > storage.free + reclaim) {
      const mb = (b) => (b / 1048576).toFixed(1)
      throw new Error(
        `Not enough room on the device: this restore needs ${mb(needed)} MB, ` +
          `${mb(storage.free + reclaim)} MB is available. Delete some samples on the device or restore fewer sounds.`,
      )
    }
  }

  const active = (await getMetadata(session, PROJECTS_NODE).catch(() => null))?.active ?? null

  const PROJECT_WEIGHT = 64 * 1024
  const totalWeight = needed + projList.length * PROJECT_WEIGHT || 1
  let doneWeight = 0
  const report = (label, partial = 0) =>
    onProgress({ fraction: Math.min(1, (doneWeight + partial) / totalWeight), label })

  for (const snd of prepared) {
    checkAbort(signal)
    const label = `Sound ${pad3(snd.slot)}, ${snd.name}`
    report(label)
    let lastErr
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await writeSound(session, snd, { onProgress: (got) => report(label, got) })
        lastErr = null
        break
      } catch (err) {
        lastErr = err
        if (!/did not verify/.test(err.message)) break
        report(`${label}, retrying`)
      }
    }
    if (lastErr) throw lastErr
    doneWeight += snd.pcm.length
  }

  for (const n of projList) {
    checkAbort(signal)
    report(`Project ${pad2(n)}`)
    await writeProject(session, n, pak.projects.get(n))
    doneWeight += PROJECT_WEIGHT
  }

  if (projList.length && typeof active === 'number') {
    await setMetadata(session, PROJECTS_NODE, { active }).catch(() => {})
  }
  onProgress({ fraction: 1, label: 'Done' })
  return { sounds: slotList.length, projects: projList.length }
}
