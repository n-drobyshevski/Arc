import test from 'node:test'
import assert from 'node:assert/strict'
import { pack7, unpack7 } from '../src/protocol/packed7.js'
import { decodeFrame, encodeRequest, parseGreet, parseIdentity } from '../src/protocol/frame.js'
import { parseListPage } from '../src/protocol/fs.js'
import { crc32 } from '../src/formats/crc32.js'
import { decodeWav, encodeWav, resampleS16 } from '../src/formats/wav.js'
import { readZip, writeZip } from '../src/formats/zip.js'

const hex = (s) => Uint8Array.from(s.trim().split(/\s+/).map((h) => parseInt(h, 16)))

test('pack7 round-trips arbitrary bytes', () => {
  for (const len of [0, 1, 6, 7, 8, 13, 14, 15, 433, 1000]) {
    const data = Uint8Array.from({ length: len }, () => Math.floor(Math.random() * 256))
    const packed = pack7(data)
    assert.ok(packed.every((b) => b < 0x80), 'packed bytes are 7-bit')
    assert.deepEqual(unpack7(packed), data)
  }
})

test('encodes the same frames the official Sample Tool sends', () => {
  // Captured by wmealing/KO2-SYSEX: GREET with request id 0x0B94 and FILE INIT with 0x0B95.
  assert.deepEqual(encodeRequest(0x33, (0x17 << 7) | 0x14, 1), hex('F0 00 20 76 33 40 77 14 01 F7'))
  assert.deepEqual(
    encodeRequest(0x33, (0x17 << 7) | 0x15, 5, [1, 1, 0x00, 0x40, 0x00, 0x00]),
    hex('F0 00 20 76 33 40 77 15 05 00 01 01 00 40 00 00 F7'),
  )
  assert.deepEqual(
    encodeRequest(0x33, (0x17 << 7) | 0x18, 5, [4, 0, 1, 0, 0]),
    hex('F0 00 20 76 33 40 77 18 05 00 04 00 01 00 00 F7'),
  )
})

test('decodes a real GREET reply', () => {
  const raw = hex(`F0 00 20 76 33 40 37 14 01 00 00 70 72 6F 64 75 63 74 00 3A 45 50 2D 31 33 33 00 3B 6D 6F 64 65 3A 6E 00 6F 72 6D 61 6C 3B 73 00 6B 75 3A 54 45 30 33 00 32 41 53 30 30 31 3B 00 6F 73 5F 76 65 72 73 00 69 6F 6E 3A 31 2E 31 00 2E 32 3B 73 77 5F 76 00 65 72 73 69 6F 6E 3A 00 31 2E 31 2E 32 3B 62 00 6C 5F 76 65 72 73 69 00 6F 6E 3A 31 30 30 30 00 2E 30 2E 31 30 3B 73 00 65 72 69 61 6C 3A 45 00 33 50 54 56 32 4A 54 F7`)
  const f = decodeFrame(raw)
  assert.equal(f.isRequest, false)
  assert.equal(f.requestId, (0x17 << 7) | 0x14)
  assert.equal(f.status, 0)
  const g = parseGreet(new TextDecoder().decode(f.payload))
  assert.equal(g.product, 'EP-133')
  assert.equal(g.sku, 'TE032AS001')
  assert.equal(g.os_version, '1.1.2')
  assert.equal(g.serial, 'E3PTV2JT')
})

test('decodes a real identity reply', () => {
  const id = parseIdentity(hex('F0 7E 33 06 02 00 20 76 20 00 01 00 00 00 00 00 F7'))
  assert.deepEqual(id, { deviceId: 0x33, sku: 'TE032AS001' })
})

test('decodes a real root LIST reply into sounds and projects', () => {
  const raw = hex(`F0 00 20 76 33 40 37 16 05 00 08 00 00 03 68 0E 00 00 00 00 00 73 6F 75 6E 64 08 73 00 07 50 0E 00 00 00 00 00 70 72 6F 6A 65 00 63 74 73 00 F7`)
  const f = decodeFrame(raw)
  const entries = parseListPage(f.payload)
  assert.deepEqual(
    entries.map((e) => [e.node, e.name, e.isDir]),
    [
      [1000, 'sounds', true],
      [2000, 'projects', true],
    ],
  )
})

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
})

test('wav encode/decode and resample', () => {
  const pcm = new Uint8Array(new Int16Array([0, 1000, -1000, 32767, -32768, 5]).buffer)
  const wav = encodeWav(pcm, { channels: 2, sampleRate: 46875 })
  const back = decodeWav(wav)
  assert.equal(back.channels, 2)
  assert.equal(back.sampleRate, 46875)
  assert.deepEqual(back.pcm, pcm)
  const up = resampleS16(new Uint8Array(new Int16Array(4800).buffer), 1, 48000, 46875)
  assert.equal(up.length / 2, 4688)
})

test('zip round-trip with stored and deflated entries', async () => {
  const big = new Uint8Array(5000).fill(7)
  const rand = Uint8Array.from({ length: 3000 }, () => Math.floor(Math.random() * 256))
  const blob = await writeZip([
    { path: '/meta.json', data: new TextEncoder().encode('{"a":1}') },
    { path: '/sounds/001 kick.wav', data: rand },
    { path: '/projects/P01.tar', data: big },
  ])
  const files = await readZip(new Uint8Array(await blob.arrayBuffer()))
  assert.deepEqual([...files.keys()], ['meta.json', 'sounds/001 kick.wav', 'projects/P01.tar'])
  assert.deepEqual(files.get('sounds/001 kick.wav'), rand)
  assert.deepEqual(files.get('projects/P01.tar'), big)
})
