// Port of core/src/main/kotlin/dev/arc/ep133/formats/OggOpus.kt
//
// Ogg Opus files (RFC 7845) around an encoder's raw Opus packets (an
// addition), for a take shared as a voice message: Telegram sends an .ogg it
// can open as Opus as a voice message. A voice message is mono at 48 kHz
// (voicePcm); the browser's encoder makes the packets, this wraps them.

import { resampleS16 } from './wav'

/** Opus always runs at 48 kHz: granule positions count its samples. */
export const OPUS_RATE = 48_000

/** The mime type a voice message is shared as. The Web Share API takes no codecs parameter; the .ogg name tells. */
export const OGG_MIME = 'audio/ogg'

/** The encoder's lookahead at 48 kHz when it doesn't say (libopus's, as opusenc writes it). */
export const DEFAULT_PRE_SKIP = 312

/** The packets a page holds at most (one second of 20 ms frames). */
const PAGE_PACKETS = 50

const FLAG_BOS = 0x02
const FLAG_EOS = 0x04

const ascii = (s: string): Uint8Array => Uint8Array.from(s, (ch) => ch.charCodeAt(0))

/** [pcm] (interleaved s16le, [channels] at [rate]) as a voice message's: mono at OPUS_RATE. */
export function voicePcm(pcm: Uint8Array, channels: number, rate: number): Uint8Array {
  const src = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  const frames = channels > 0 ? Math.trunc(pcm.length / (2 * channels)) : 0
  const mono = new Uint8Array(frames * 2)
  const out = new DataView(mono.buffer)
  for (let f = 0; f < frames; f++) {
    let sum = 0
    for (let c = 0; c < channels; c++) sum += src.getInt16((f * channels + c) * 2, true)
    out.setInt16(f * 2, Math.floor(sum / channels), true)
  }
  return frames === 0 ? mono : resampleS16(mono, 1, rate, OPUS_RATE)
}

/** The samples (at 48 kHz) one Opus packet holds, from its TOC byte (RFC 6716, 3.1); 0 for an empty one. */
export function packetSamples(packet: Uint8Array): number {
  if (packet.length === 0) return 0
  const toc = packet[0]!
  const config = toc >> 3
  // In units of 2.5 ms (120 samples).
  const unit = config < 12 ? [4, 8, 16, 24][config % 4]! : config < 16 ? [4, 8][config % 2]! : [1, 2, 4, 8][config % 4]!
  const code = toc & 3
  const frames = code === 0 ? 1 : code < 3 ? 2 : packet.length > 1 ? packet[1]! & 0x3f : 0
  return frames * unit * 120
}

/** The pre-skip an encoder's codec config gives (an OpusHead in it), else DEFAULT_PRE_SKIP. */
export function preSkipOf(config: Uint8Array | null | undefined): number {
  if (!config) return DEFAULT_PRE_SKIP
  const at = indexOf(config, ascii('OpusHead'))
  if (at < 0 || at + 12 > config.length) return DEFAULT_PRE_SKIP
  return config[at + 10]! | (config[at + 11]! << 8)
}

/** The identification header: [channels] (mapping family 0), [preSkip], and the [inputRate] the audio had. */
export function opusHead(channels: number, preSkip: number, inputRate: number): Uint8Array {
  const b = new Uint8Array(19)
  const v = new DataView(b.buffer)
  b.set(ascii('OpusHead'))
  b[8] = 1
  b[9] = channels
  v.setUint16(10, preSkip, true)
  v.setUint32(12, inputRate, true)
  return b
}

/** The comment header: [vendor] and no comments. */
export function opusTags(vendor: string): Uint8Array {
  const name = new TextEncoder().encode(vendor)
  const b = new Uint8Array(8 + 4 + name.length + 4)
  const v = new DataView(b.buffer)
  b.set(ascii('OpusTags'))
  v.setUint32(8, name.length, true)
  b.set(name, 12)
  return b
}

/**
 * The file: the two headers, then [packets] about a second to a page.
 * [samples] is the audio's length at 48 kHz, so the last page cuts the
 * encoder's padding off (a page never claims more than its packets hold);
 * [serial] names the stream.
 */
export function oggOpusFile(
  packets: readonly Uint8Array[],
  channels: number,
  preSkip: number,
  inputRate: number,
  samples: number,
  serial = 0x41524331,
  vendor = 'arc',
): Uint8Array {
  const pages: Uint8Array[] = []
  let seq = 0
  pages.push(oggPage([opusHead(channels, preSkip, inputRate)], 0, serial, seq++, FLAG_BOS))
  pages.push(oggPage([opusTags(vendor)], 0, serial, seq++, 0))
  const end = preSkip + samples
  let granule = 0
  if (packets.length === 0) pages.push(oggPage([], end, serial, seq, FLAG_EOS))
  for (let i = 0; i < packets.length; i += PAGE_PACKETS) {
    const chunk = packets.slice(i, i + PAGE_PACKETS)
    for (const p of chunk) granule += packetSamples(p)
    const last = i + PAGE_PACKETS >= packets.length
    pages.push(oggPage(chunk, Math.min(granule, end), serial, seq++, last ? FLAG_EOS : 0))
  }
  const out = new Uint8Array(pages.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of pages) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** One page of whole [packets] (255 lacing values at most, which a second of voice never nears). */
export function oggPage(packets: readonly Uint8Array[], granule: number, serial: number, seq: number, flags: number): Uint8Array {
  const segments: number[] = []
  for (const p of packets) {
    for (let k = 0; k < Math.trunc(p.length / 255); k++) segments.push(255)
    segments.push(p.length % 255)
  }
  if (segments.length > 255) throw new Error('too many packets for one page')
  const body = packets.reduce((n, p) => n + p.length, 0)
  const b = new Uint8Array(27 + segments.length + body)
  const v = new DataView(b.buffer)
  b.set(ascii('OggS'))
  b[5] = flags
  v.setBigInt64(6, BigInt(granule), true)
  v.setUint32(14, serial >>> 0, true)
  v.setUint32(18, seq, true)
  b[26] = segments.length
  b.set(segments, 27)
  let at = 27 + segments.length
  for (const p of packets) {
    b.set(p, at)
    at += p.length
  }
  v.setUint32(22, oggCrc(b), true)
  return b
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
    t[i] = r >>> 0
  }
  return t
})()

/** Ogg's CRC-32: polynomial 0x04C11DB7, not reflected, starting at 0 (unsigned). */
export function oggCrc(data: Uint8Array): number {
  let c = 0
  for (let i = 0; i < data.length; i++) c = ((c << 8) ^ CRC_TABLE[((c >>> 24) ^ data[i]!) & 0xff]!) >>> 0
  return c
}

function indexOf(hay: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}
