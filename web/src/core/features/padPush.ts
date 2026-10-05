// Port of core/src/main/kotlin/dev/arc/ep133/features/PadPush.kt
//
// The pad push the live mirror listens for (an addition to the web version).
// None of this is in the official guide; it follows community notes:
//
// - kmorrill/ep-series-sysex (docs/sysex-protocol.md): after a FILE init the
//   device sends FILE events, METADATA_UPDATED = 0x03 among them, and a pad
//   press sends one carrying the "active" pad file id.
// - Zatumanen/Ko-tool (js/ep133/device.js): the unpacked FILE payload of an
//   event is [event code, node be16, JSON text, 0x00].
// - The pad file id is 3200 + (project-1)*1000 + group*100 + pad, group
//   A=0..D=3, pad 1..12 (kmorrill file-protocol.md, ep133-krate captures).
//
// Anything that does not match gives null, so an unexpected frame is ignored.
// The session hands these frames to push listeners whether they arrive
// request-shaped or reply-shaped with an id nobody waits for (Session S1).

import { CMD, type Frame } from '../protocol/frame'
import type { PadFid } from './liveMirror'

export type { PadFid }

export const METADATA_UPDATED = 0x03

export function parse(f: Frame): PadFid | null {
  if (f.command !== CMD.FILE) return null
  const p = f.payload
  if (p.length < 4 || p[0] !== METADATA_UPDATED) return null
  let end = 3
  while (end < p.length && p[end] !== 0) end++
  // TextDecoder drops one leading BOM and replaces invalid bytes, like Kotlin's decodeUtf8.
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(p.subarray(3, end)))
  } catch {
    return null
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null
  const active = (json as Record<string, unknown>)['active']
  if (typeof active !== 'number') return null
  if (active !== Math.floor(active)) return null
  return fid(active)
}

/** A pad file id split into project, group and pad, or null if it is not one. */
export function fid(id: number): PadFid | null {
  const x = id - 3200
  if (x < 0) return null
  const project = Math.trunc(x / 1000) + 1
  const rest = x % 1000
  const group = Math.trunc(rest / 100)
  const pad = rest % 100
  return group >= 0 && group <= 3 && pad >= 1 && pad <= 12 && project >= 1 && project <= 99
    ? { project, group, pad }
    : null
}

/**
 * How pad numbers in the project file (pads/<group>/pNN) relate to the keys.
 * Community sources disagree: kmorrill's midi-reference (calibrated on a
 * device with these pushes) says pNN is the pad file id's last term, counted
 * from the top row (p01 = '7'); ep133-ppak says pNN counts from the bottom
 * row (p01 = '.'), which is the official note order plus one.
 */
export type PadOrder = 'FROM_TOP' | 'FROM_BOTTOM'
export const PadOrder = { FROM_TOP: 'FROM_TOP', FROM_BOTTOM: 'FROM_BOTTOM' } as const
