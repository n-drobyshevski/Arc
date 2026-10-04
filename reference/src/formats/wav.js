// Minimal WAV read/write for 16-bit PCM, with conversion from other common formats.

export function encodeWav(pcm, { channels, sampleRate }) {
  const out = new Uint8Array(44 + pcm.length)
  const dv = new DataView(out.buffer)
  const ascii = (s, at) => {
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

function findJsonSettings(bytes) {
  const text = new TextDecoder('latin1').decode(bytes)
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(text.slice(start, end + 1))
    return obj && typeof obj === 'object' ? obj : null
  } catch {
    return null
  }
}

/**
 * @returns {{ pcm: Uint8Array, channels: number, sampleRate: number, embedded: object|null }}
 * pcm is always signed 16-bit little-endian, interleaved.
 */
export function decodeWav(wav) {
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const tag = (at) => String.fromCharCode(wav[at], wav[at + 1], wav[at + 2], wav[at + 3])
  if (wav.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file')
  let fmt = null
  let data = null
  let embedded = null
  let i = 12
  while (i + 8 <= wav.length) {
    const id = tag(i)
    const size = Math.min(dv.getUint32(i + 4, true), wav.length - i - 8)
    const body = wav.subarray(i + 8, i + 8 + size)
    if (id === 'fmt ') {
      fmt = {
        format: dv.getUint16(i + 8, true),
        channels: dv.getUint16(i + 10, true),
        sampleRate: dv.getUint32(i + 12, true),
        bits: dv.getUint16(i + 22, true),
      }
      if (fmt.format === 0xfffe && size >= 26) fmt.format = dv.getUint16(i + 32, true)
    } else if (id === 'data') {
      data = body
    } else if (!embedded && size < 64 * 1024) {
      const obj = findJsonSettings(body)
      if (obj && Object.keys(obj).some((k) => k.startsWith('sound.') || k.startsWith('envelope.'))) embedded = obj
    }
    i += 8 + size + (size & 1)
  }
  if (!fmt || !data) throw new Error('WAV file is missing audio data')
  return { pcm: toS16(data, fmt), channels: fmt.channels, sampleRate: fmt.sampleRate, embedded }
}

function toS16(data, { format, bits }) {
  if (format === 1 && bits === 16) return data.slice(0, data.length - (data.length % 2))
  const bytesPer = bits / 8
  const n = Math.floor(data.length / bytesPer)
  const out = new Int16Array(n)
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  for (let s = 0; s < n; s++) {
    const at = s * bytesPer
    let v
    if (format === 3 && bits === 32) v = dv.getFloat32(at, true)
    else if (format === 3 && bits === 64) v = dv.getFloat64(at, true)
    else if (bits === 8) v = (data[at] - 128) / 128
    else if (bits === 24) v = ((data[at] | (data[at + 1] << 8) | (data[at + 2] << 16)) << 8 >> 8) / 8388608
    else if (bits === 32) v = dv.getInt32(at, true) / 2147483648
    else throw new Error(`Unsupported WAV format (${bits}-bit, type ${format})`)
    out[s] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)))
  }
  return new Uint8Array(out.buffer)
}

/** Linear resample of interleaved s16le. */
export function resampleS16(pcm, channels, from, to) {
  if (from === to) return pcm
  const src = new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength))
  const srcFrames = Math.floor(src.length / channels)
  const dstFrames = Math.max(1, Math.round((srcFrames * to) / from))
  const dst = new Int16Array(dstFrames * channels)
  const ratio = (srcFrames - 1) / Math.max(1, dstFrames - 1)
  for (let i = 0; i < dstFrames; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(srcFrames - 1, i0 + 1)
    const t = pos - i0
    for (let c = 0; c < channels; c++) {
      const a = src[i0 * channels + c]
      const b = src[i1 * channels + c]
      dst[i * channels + c] = Math.round(a + (b - a) * t)
    }
  }
  return new Uint8Array(dst.buffer)
}
