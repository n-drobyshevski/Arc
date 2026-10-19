// Port of core/src/main/kotlin/dev/arc/ep133/formats/Wav.kt (+ reference/src/formats/wav.js)
//
// Minimal WAV read/write for 16-bit PCM, with conversion from other common formats.

import { DATAVIEW_RANGE } from './zip'

/** Decoded audio. [pcm] is always signed 16-bit little-endian, interleaved. */
export interface DecodedWav {
  pcm: Uint8Array
  channels: number
  sampleRate: number
  /** Sound settings found in a non-audio chunk (keys starting "sound." or "envelope."), if any. */
  embedded: Record<string, unknown> | null
}

/**
 * A 16-bit PCM WAV around [pcm]. [channels] and [sampleRate] get the integer
 * conversions DataView applies (ToUint16 / ToUint32).
 */
export function encodeWav(pcm: Uint8Array, channels: number, sampleRate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length)
  const dv = new DataView(out.buffer)
  const ascii = (s: string, at: number): void => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i)
  }
  ascii('RIFF', 0)
  dv.setUint32(4, 36 + pcm.length, true)
  ascii('WAVE', 8)
  ascii('fmt ', 12)
  dv.setUint32(16, 16, true)
  dv.setUint16(20, 1, true)
  dv.setUint16(22, channels, true)
  dv.setUint32(24, sampleRate, true)
  dv.setUint32(28, sampleRate * channels * 2, true)
  dv.setUint16(32, channels * 2, true)
  dv.setUint16(34, 16, true)
  ascii('data', 36)
  dv.setUint32(40, pcm.length, true)
  out.set(pcm, 44)
  return out
}

/**
 * Wav.header: the 44-byte header for [dataBytes] of 16-bit PCM, for audio
 * written as it is recorded (Live's takes). Sizes wrap as in Kotlin's toUint32.
 */
export function wavHeader(dataBytes: number, channels: number, sampleRate: number): Uint8Array {
  const out = encodeWav(new Uint8Array(0), channels, sampleRate)
  const dv = new DataView(out.buffer)
  dv.setUint32(4, (36 + dataBytes) >>> 0, true)
  dv.setUint32(40, dataBytes >>> 0, true)
  return out
}

/** Whether s16le PCM holds no sound at all: every sample is 0, or there are no samples. */
export function isSilent(pcm: Uint8Array): boolean {
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    if (pcm[i] !== 0 || pcm[i + 1] !== 0) return false
  }
  return true
}

// windows-1252 characters for bytes 0x80..0x9F (the five undefined ones map to
// themselves, as in WHATWG); every other byte maps to the same code point.
const CP1252_HIGH =
  '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f' +
  '\u0090‘’“”•–—˜™š›œ\u009džŸ'

/**
 * `new TextDecoder('latin1').decode(bytes)`: per WHATWG that label is
 * windows-1252 (Kotlin's decodeWindows1252). Spelled out because Node's
 * TextDecoder decodes 'latin1' as ISO-8859-1, which differs for 0x80..0x9F.
 */
export function decodeWindows1252(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i]!
    s += v >= 0x80 && v <= 0x9f ? CP1252_HIGH[v - 0x80]! : String.fromCharCode(v)
  }
  return s
}

/** The first {...} found in a chunk, if it parses as a JSON object. */
function findJsonSettings(bytes: Uint8Array): Record<string, unknown> | null {
  const text = decodeWindows1252(bytes)
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj: unknown = JSON.parse(text.slice(start, end + 1))
    // Arrays pass `typeof === 'object'` in the reference but can never pass the
    // "sound." / "envelope." key test, so only objects matter.
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Parses a WAV file and converts its audio to s16le. */
export function decodeWav(wav: Uint8Array): DecodedWav {
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const tag = (at: number): string =>
    at + 4 <= wav.length ? String.fromCharCode(wav[at]!, wav[at + 1]!, wav[at + 2]!, wav[at + 3]!) : ''
  const need = (at: number, n: number): void => {
    if (at < 0 || at + n > wav.length) throw new RangeError(DATAVIEW_RANGE)
  }
  const u16 = (at: number): number => {
    need(at, 2)
    return dv.getUint16(at, true)
  }
  const u32 = (at: number): number => {
    need(at, 4)
    return dv.getUint32(at, true)
  }

  if (wav.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file')
  let format = -1
  let channels = 0
  let sampleRate = 0
  let bits = 0
  let haveFmt = false
  let data: Uint8Array | null = null
  let embedded: Record<string, unknown> | null = null
  let i = 12
  while (i + 8 <= wav.length) {
    const id = tag(i)
    const size = Math.min(u32(i + 4), wav.length - i - 8)
    const body = wav.subarray(i + 8, i + 8 + size)
    if (id === 'fmt ') {
      format = u16(i + 8)
      channels = u16(i + 10)
      sampleRate = u32(i + 12)
      bits = u16(i + 22)
      haveFmt = true
      // WAVE_FORMAT_EXTENSIBLE: the real format is the first field of the sub-format GUID.
      if (format === 0xfffe && size >= 26) format = u16(i + 32)
    } else if (id === 'data') {
      data = body
    } else if (embedded === null && size < 64 * 1024) {
      const obj = findJsonSettings(body)
      if (obj && Object.keys(obj).some((k) => k.startsWith('sound.') || k.startsWith('envelope.'))) embedded = obj
    }
    i += 8 + size + (size & 1)
  }
  if (!haveFmt || data === null) throw new Error('WAV file is missing audio data')
  // Deviation (agreed, Wav.kt): a 0-channel header would make resampling loop
  // forever in the reference; reject it up front.
  if (channels === 0) throw new Error('WAV file has no audio channels')
  return { pcm: toS16(data, format, bits), channels, sampleRate, embedded }
}

function toS16(data: Uint8Array, format: number, bits: number): Uint8Array {
  if (format === 1 && bits === 16) return data.slice(0, data.length - (data.length % 2))
  // Deviation (Wav.kt): 0 bits would divide by zero; report it as unsupported.
  if (bits === 0) throw new Error(`Unsupported WAV format (${bits}-bit, type ${format})`)
  const bytesPer = bits / 8
  const n = Math.floor(data.length / bytesPer)
  const out = new Int16Array(n)
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  for (let s = 0; s < n; s++) {
    const at = Math.floor(s * bytesPer)
    let v: number
    if (format === 3 && bits === 32) v = dv.getFloat32(at, true)
    else if (format === 3 && bits === 64) v = dv.getFloat64(at, true)
    // 8-bit is converted whatever the format tag says (bits are checked before format).
    else if (bits === 8) v = (data[at]! - 128) / 128
    else if (bits === 24) v = (((data[at]! | (data[at + 1]! << 8) | (data[at + 2]! << 16)) << 8) >> 8) / 8388608
    else if (bits === 32) v = dv.getInt32(at, true) / 2147483648
    else throw new Error(`Unsupported WAV format (${bits}-bit, type ${format})`)
    // NaN stores as 0 in an Int16Array.
    out[s] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)))
  }
  return new Uint8Array(out.buffer)
}

/**
 * Linear resample of interleaved s16le from [from] Hz to [to] Hz. Returns
 * [pcm] itself when the rates are equal. A trailing odd byte is ignored.
 */
export function resampleS16(pcm: Uint8Array, channels: number, from: number, to: number): Uint8Array {
  if (from === to) return pcm
  // Kotlin's integer division by zero throws; never loop on 0 channels.
  if (channels === 0) throw new RangeError('/ by zero')
  const srcLen = pcm.length >> 1
  const src = new Int16Array(srcLen)
  const pv = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  for (let k = 0; k < srcLen; k++) src[k] = pv.getInt16(2 * k, true)
  const srcFrames = Math.trunc(srcLen / channels)
  const dstFrames = Math.max(1, Math.round((srcFrames * to) / from))
  const dst = new Int16Array(dstFrames * channels)
  const ratio = (srcFrames - 1) / Math.max(1, dstFrames - 1)
  for (let i = 0; i < dstFrames; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(srcFrames - 1, i0 + 1)
    const t = pos - i0
    for (let c = 0; c < channels; c++) {
      const ai = i0 * channels + c
      const bi = i1 * channels + c
      // An out-of-range read is undefined in JS and stores as 0.
      if (ai < 0 || ai >= srcLen || bi < 0 || bi >= srcLen) {
        dst[i * channels + c] = 0
        continue
      }
      const a = src[ai]!
      const b = src[bi]!
      dst[i * channels + c] = Math.round(a + (b - a) * t)
    }
  }
  return new Uint8Array(dst.buffer)
}
