// Port of core/src/main/kotlin/dev/arc/ep133/protocol/Frame.kt (+ reference/src/protocol/frame.js)
//
// TE SysEx framing.
//
//   F0 00 20 76 <device> 40 <b6> <b7> <command> [status] <packed payload> F7
//
// b6 = 0x40 (is request) | 0x20 (request id present) | request id bits 7..11
// b7 = request id bits 0..6
// Responses clear 0x40 and carry a status byte before the payload.
// Frames with b6 === 0x40 (request flag, no id) are unsolicited device pushes.

import { u8 } from '../util/bytes'
import { pack7, unpack7 } from './packed7'

/** Bytes as callers build them: a Uint8Array or a plain array of 0..255 values. */
export type ByteInput = Uint8Array | ArrayLike<number>

export const TE_MFG: readonly number[] = [0x00, 0x20, 0x76]
export const MIDI_SYSEX_TE = 0x40
export const BIT_IS_REQUEST = 0x40
export const BIT_REQUEST_ID = 0x20

export const CMD = { GREET: 1, FILE: 5 } as const

export const STATUS = {
  OK: 0,
  ERROR: 1,
  NOT_FOUND: 2,
  BAD_REQUEST: 3,
  SPECIFIC_ERROR_START: 16,
  SPECIFIC_SUCCESS_START: 64,
} as const

/** MIDI universal identity request. Treat as read-only. */
export const IDENTITY_REQUEST: Uint8Array = Uint8Array.of(0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7)

export const DEFAULT_DEVICE_ID = 0x33 // EP-133

/** A decoded TE frame. All numbers are unsigned. `status` is -1 for requests, `requestId` -1 without an id. */
export interface Frame {
  deviceId: number
  isRequest: boolean
  hasId: boolean
  requestId: number
  command: number
  status: number
  payload: Uint8Array
}

export interface Identity {
  deviceId: number
  sku: string
}

function toBytes(b: ByteInput): Uint8Array {
  return b instanceof Uint8Array ? b : Uint8Array.from(b)
}

/**
 * Every request carries a 12 bit request id split over bytes 6 and 7;
 * replies are matched back to their request by that id.
 */
export function encodeRequest(
  deviceId: number,
  requestId: number,
  command: number,
  payload: ByteInput = new Uint8Array(0),
): Uint8Array {
  const packed = pack7(toBytes(payload))
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

export function isTeFrame(d: Uint8Array): boolean {
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
export function decodeFrame(d: Uint8Array): Frame | null {
  if (!isTeFrame(d)) return null
  const b6 = u8(d, 6)
  const isRequest = (b6 & BIT_IS_REQUEST) !== 0
  const hasId = (b6 & BIT_REQUEST_ID) !== 0
  const requestId = hasId ? ((b6 & 0x1f) << 7) | (u8(d, 7) & 0x7f) : -1
  const command = u8(d, 8)
  let i = 9
  let status = -1
  if (!isRequest) {
    if (d.length < 11) return null
    status = u8(d, i++)
  }
  const payload = unpack7(d.subarray(i, d.length - 1))
  return { deviceId: u8(d, 4), isRequest, hasId, requestId, command, status, payload }
}

/** Universal identity reply: F0 7E <dev> 06 02 00 20 76 <family×2> <model×2> <ver×4> F7 */
export function parseIdentity(d: Uint8Array): Identity | null {
  if (d.length < 13 || d[0] !== 0xf0 || d[1] !== 0x7e || d[3] !== 0x06 || d[4] !== 0x02) return null
  if (d[5] !== TE_MFG[0] || d[6] !== TE_MFG[1] || d[7] !== TE_MFG[2]) return null
  const product = u8(d, 8) | (u8(d, 9) << 7)
  const assembly = u8(d, 10) | (u8(d, 11) << 7)
  return {
    deviceId: u8(d, 2),
    sku: `TE${String(product).padStart(3, '0')}AS${String(assembly).padStart(3, '0')}`,
  }
}

/**
 * GREET reply text: "product:EP-133;mode:normal;sku:TE032AS001;os_version:2.0.5;..."
 * The result has no prototype, so any key the device sends (even "__proto__") is kept,
 * like the Kotlin map.
 */
export function parseGreet(text: string): Record<string, string> {
  const out: Record<string, string> = Object.create(null) as Record<string, string>
  for (const part of text.replace(/\0/g, '').split(';')) {
    const i = part.indexOf(':')
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

export function statusText(status: number): string {
  if (status === STATUS.OK) return 'ok'
  if (status === STATUS.ERROR) return 'error'
  if (status === STATUS.NOT_FOUND) return 'command not found'
  if (status === STATUS.BAD_REQUEST) return 'bad request'
  if (status >= STATUS.SPECIFIC_SUCCESS_START) return 'in progress'
  if (status >= STATUS.SPECIFIC_ERROR_START) return `device error ${status}`
  return `status ${status}`
}

// Big-endian helpers. Payloads inside FILE commands are big-endian.
export function be16(v: number): Uint8Array {
  return Uint8Array.of((v >> 8) & 0xff, v & 0xff)
}

export function be32(v: number): Uint8Array {
  return Uint8Array.of((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff)
}

export function readBe16(d: ArrayLike<number>, at: number): number {
  return (u8(d, at) << 8) | u8(d, at + 1)
}

/** Unsigned 32-bit, so sizes of 2 GiB and up stay positive. */
export function readBe32(d: ArrayLike<number>, at: number): number {
  return ((u8(d, at) << 24) >>> 0) + (u8(d, at + 1) << 16) + (u8(d, at + 2) << 8) + u8(d, at + 3)
}

// Download page numbers are 14-bit little-endian (two 7-bit bytes).
export function u14le(v: number): Uint8Array {
  return Uint8Array.of(v & 0x7f, (v >> 7) & 0x7f)
}

export function readU14le(d: ArrayLike<number>, at: number): number {
  return (u8(d, at) & 0x7f) | ((u8(d, at + 1) & 0x7f) << 7)
}

/** NUL-terminated UTF-8 string. `next` is end + 1 even without a terminator (then length + 1). */
export function readCString(d: Uint8Array, at: number): { text: string; next: number } {
  let end = at
  while (end < d.length && d[end] !== 0) end++
  return { text: new TextDecoder().decode(d.subarray(at, end)), next: end + 1 }
}
