// TE SysEx framing.
//
//   F0 00 20 76 <device> 40 <b6> <b7> <command> [status] <packed payload> F7
//
// b6 = 0x40 (is request) | 0x20 (request id present) | request id bits 7..11
// b7 = request id bits 0..6
// Responses clear 0x40 and carry a status byte before the payload.
// Frames with b6 === 0x40 (request flag, no id) are unsolicited device pushes.

import { pack7, unpack7 } from './packed7.js'

export const TE_MFG = [0x00, 0x20, 0x76]
export const MIDI_SYSEX_TE = 0x40
export const BIT_IS_REQUEST = 0x40
export const BIT_REQUEST_ID = 0x20

export const CMD = { GREET: 1, FILE: 5 }

export const STATUS = {
  OK: 0,
  ERROR: 1,
  NOT_FOUND: 2,
  BAD_REQUEST: 3,
  SPECIFIC_ERROR_START: 16,
  SPECIFIC_SUCCESS_START: 64,
}

export const IDENTITY_REQUEST = Uint8Array.of(0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7)

export const DEFAULT_DEVICE_ID = 0x33 // EP-133

export function encodeRequest(deviceId, requestId, command, payload = new Uint8Array()) {
  const packed = pack7(payload instanceof Uint8Array ? payload : Uint8Array.from(payload))
  const out = new Uint8Array(10 + packed.length)
  out[0] = 0xf0
  out.set(TE_MFG, 1)
  out[4] = deviceId & 0x7f
  out[5] = MIDI_SYSEX_TE
  out[6] = BIT_IS_REQUEST | BIT_REQUEST_ID | ((requestId >> 7) & 0x1f)
  out[7] = requestId & 0x7f
  out[8] = command & 0x7f
  out.set(packed, 9)
  out[out.length - 1] = 0xf7
  return out
}

export function isTeFrame(d) {
  return (
    d.length >= 9 &&
    d[0] === 0xf0 &&
    d[1] === TE_MFG[0] &&
    d[2] === TE_MFG[1] &&
    d[3] === TE_MFG[2] &&
    d[5] === MIDI_SYSEX_TE &&
    d[d.length - 1] === 0xf7
  )
}

/** Decode any TE frame (request, response or push). Returns null for anything else. */
export function decodeFrame(d) {
  if (!isTeFrame(d)) return null
  const isRequest = !!(d[6] & BIT_IS_REQUEST)
  const hasId = !!(d[6] & BIT_REQUEST_ID)
  const requestId = hasId ? ((d[6] & 0x1f) << 7) | (d[7] & 0x7f) : -1
  const command = d[8]
  let i = 9
  let status = -1
  if (!isRequest) {
    if (d.length < 11) return null
    status = d[i++]
  }
  const payload = unpack7(d.subarray(i, d.length - 1))
  return { deviceId: d[4], isRequest, hasId, requestId, command, status, payload }
}

/** Universal identity reply: F0 7E <dev> 06 02 00 20 76 <family×2> <model×2> <ver×4> F7 */
export function parseIdentity(d) {
  if (d.length < 13 || d[0] !== 0xf0 || d[1] !== 0x7e || d[3] !== 0x06 || d[4] !== 0x02) return null
  if (d[5] !== TE_MFG[0] || d[6] !== TE_MFG[1] || d[7] !== TE_MFG[2]) return null
  const product = d[8] | (d[9] << 7)
  const assembly = d[10] | (d[11] << 7)
  return {
    deviceId: d[2],
    sku: `TE${String(product).padStart(3, '0')}AS${String(assembly).padStart(3, '0')}`,
  }
}

/** GREET reply text: "product:EP-133;mode:normal;sku:TE032AS001;os_version:2.0.5;..." */
export function parseGreet(text) {
  const out = {}
  for (const part of text.replace(/\0/g, '').split(';')) {
    const i = part.indexOf(':')
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

export function statusText(status) {
  if (status === STATUS.OK) return 'ok'
  if (status === STATUS.ERROR) return 'error'
  if (status === STATUS.NOT_FOUND) return 'command not found'
  if (status === STATUS.BAD_REQUEST) return 'bad request'
  if (status >= STATUS.SPECIFIC_SUCCESS_START) return 'in progress'
  if (status >= STATUS.SPECIFIC_ERROR_START) return `device error ${status}`
  return `status ${status}`
}

// Big-endian helpers. Payloads inside FILE commands are big-endian.
export const be16 = (v) => [(v >> 8) & 0xff, v & 0xff]
export const be32 = (v) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]
export const readBe16 = (d, at) => (d[at] << 8) | d[at + 1]
export const readBe32 = (d, at) => ((d[at] << 24) >>> 0) + (d[at + 1] << 16) + (d[at + 2] << 8) + d[at + 3]
// Download page numbers are 14-bit little-endian (two 7-bit bytes).
export const u14le = (v) => [v & 0x7f, (v >> 7) & 0x7f]
export const readU14le = (d, at) => (d[at] & 0x7f) | ((d[at + 1] & 0x7f) << 7)

export function readCString(d, at) {
  let end = at
  while (end < d.length && d[end] !== 0) end++
  return { text: new TextDecoder().decode(d.subarray(at, end)), next: end + 1 }
}
