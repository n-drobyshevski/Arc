import test from 'node:test'
import assert from 'node:assert/strict'
import { MockEP133 } from './mock-device.js'
import { Session } from '../src/protocol/session.js'
import { backupDevice, describePak, openPak, restorePak } from '../src/backup.js'
import { crc32 } from '../src/formats/crc32.js'

function tarFile(entries) {
  const blocks = []
  for (const [name, data] of entries) {
    const h = new Uint8Array(512)
    h.set(new TextEncoder().encode(name), 0)
    h.set(new TextEncoder().encode(data.length.toString(8).padStart(11, '0')), 124)
    h[156] = 48
    blocks.push(h, data, new Uint8Array((512 - (data.length % 512)) % 512))
  }
  blocks.push(new Uint8Array(1024))
  const total = blocks.reduce((n, b) => n + b.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const b of blocks) {
    out.set(b, o)
    o += b.length
  }
  return out
}

function pad(slot) {
  const r = new Uint8Array(26)
  r[1] = slot & 0xff
  r[2] = slot >> 8
  return r
}

function noise(n) {
  return Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 0xff)
}

function sourceDevice(opts = {}) {
  return new MockEP133({
    sounds: [
      { slot: 1, name: 'kick', pcm: noise(20000), meta: { 'sound.playmode': 'key', 'sound.pitch': -3 } },
      { slot: 2, name: 'snare', pcm: noise(1000) },
      { slot: 150, name: 'vox chop long name x', pcm: noise(90001 - 1), meta: { channels: 2, 'sound.loopend': 10 } },
    ],
    projects: [
      { n: 1, tar: tarFile([['pads/a/p01', pad(1)], ['pads/a/p02', pad(2)], ['settings', noise(222)]]) },
      { n: 4, tar: tarFile([['pads/b/p05', pad(150)]]) },
    ],
    ...opts,
  })
}

async function connect(device) {
  const s = new Session(device.transport())
  await s.handshake()
  return s
}

for (const ackChunks of [true, false]) {
  test(`backup then restore into an empty device (chunk acks: ${ackChunks})`, { timeout: 60000 }, async () => {
    const src = sourceDevice()
    const s1 = await connect(src)
    assert.equal(s1.info.product, 'EP-133')
    const progress = []
    const { blob, summary } = await backupDevice(s1, { onProgress: (p) => progress.push(p.fraction) })
    assert.equal(summary.soundCount, 3)
    assert.deepEqual(summary.projects, [1, 4])
    assert.ok(progress.at(-1) === 1 && progress.every((v, i) => i === 0 || v >= progress[i - 1]))
    assert.equal(src.dropped, 0, 'no command was sent while the device wanted a re-init')

    const pak = await openPak(new Uint8Array(await blob.arrayBuffer()))
    const d = describePak(pak)
    assert.deepEqual(d.slots, [1, 2, 150])
    assert.deepEqual(d.projectSlots, { 1: [1, 2], 4: [150] })

    const dst = new MockEP133({ ackChunks, projects: [{ n: 4, tar: noise(10) }] })
    const s2 = await connect(dst)
    await restorePak(s2, pak)
    assert.equal(dst.dropped, 0)
    for (const [slot, snd] of src.sounds) {
      const got = dst.sounds.get(slot)
      assert.ok(got, `slot ${slot} restored`)
      assert.equal(got.meta.crc, crc32(snd.pcm))
      assert.equal(got.meta.channels, snd.meta.channels)
    }
    assert.equal(dst.sounds.get(1).meta['sound.playmode'], 'key')
    assert.equal(dst.sounds.get(1).meta['sound.pitch'], -3)
    assert.equal(dst.sounds.get(150).name, 'vox chop long name x')
    assert.deepEqual(dst.projects.get(1), src.projects.get(1))
    assert.deepEqual(dst.projects.get(4), src.projects.get(4))
    assert.equal(dst.projectsMeta.active, 3000, 'active project restored afterwards')
  })
}

test('restore a single project with only the sounds it uses', { timeout: 30000 }, async () => {
  const src = sourceDevice()
  const { blob } = await backupDevice(await connect(src))
  const pak = await openPak(new Uint8Array(await blob.arrayBuffer()))
  const dst = new MockEP133()
  const s = await connect(dst)
  const d = describePak(pak)
  await restorePak(s, pak, { projects: [4], slots: d.projectSlots[4] })
  assert.deepEqual([...dst.sounds.keys()], [150])
  assert.deepEqual([...dst.projects.keys()], [4])
})

test('refuses to restore when the device is too full', { timeout: 30000 }, async () => {
  const src = sourceDevice()
  const { blob } = await backupDevice(await connect(src))
  const pak = await openPak(new Uint8Array(await blob.arrayBuffer()))
  const dst = new MockEP133({ capacity: 50000, sounds: [{ slot: 9, name: 'big', pcm: noise(45000) }] })
  const s = await connect(dst)
  await assert.rejects(restorePak(s, pak), /Not enough room/)
  assert.equal(dst.sounds.size, 1, 'nothing was written')
})

test('cancelling stops between items', { timeout: 30000 }, async () => {
  const src = sourceDevice()
  const s = await connect(src)
  const ac = new AbortController()
  const p = backupDevice(s, {
    signal: ac.signal,
    onProgress: (x) => {
      if (x.label.includes('snare')) ac.abort()
    },
  })
  await assert.rejects(p, { name: 'CancelledError' })
})
