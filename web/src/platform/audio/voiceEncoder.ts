// Port of app/src/main/kotlin/dev/arc/ep133/audio/VoiceNote.kt's encoding (MediaCodec there):
// the browser's Opus encoder (WebCodecs AudioEncoder) makes a voice message's raw packets
// from mono s16 at 48 kHz; core/formats/oggOpus wraps them. Chrome, Edge and Firefox have it.

import { OPUS_RATE } from '../../core/formats/oggOpus'
import type { VoiceDeps } from '../../state/deps'

/** Voice messages' bitrate: plenty for mono music at 48 kHz. */
const BITRATE = 64_000
/** Frames handed to the encoder at a time (a second). */
const CHUNK = OPUS_RATE

const CONFIG = { codec: 'opus', sampleRate: OPUS_RATE, numberOfChannels: 1, bitrate: BITRATE } as const

/** The browser's [VoiceDeps], or undefined where there is no AudioEncoder. */
export function browserVoiceEncoder(): VoiceDeps | undefined {
  if (typeof AudioEncoder !== 'function' || typeof AudioData !== 'function') return undefined
  return {
    async encodeOpus(pcm: Int16Array) {
      const support = await AudioEncoder.isConfigSupported(CONFIG).catch(() => null)
      if (support?.supported !== true) throw new Error('no Opus encoder')
      const packets: Uint8Array[] = []
      let config: Uint8Array | null = null
      let failed: unknown = null
      const encoder = new AudioEncoder({
        output: (chunk, meta) => {
          const b = new Uint8Array(chunk.byteLength)
          chunk.copyTo(b)
          packets.push(b)
          const d = meta?.decoderConfig?.description
          if (d && !config) config = ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength).slice() : new Uint8Array(d).slice()
        },
        error: (e) => {
          failed = e
        },
      })
      try {
        encoder.configure(CONFIG)
        for (let at = 0; at < pcm.length; at += CHUNK) {
          const part = pcm.subarray(at, Math.min(pcm.length, at + CHUNK))
          const data = new AudioData({
            format: 's16',
            sampleRate: OPUS_RATE,
            numberOfChannels: 1,
            numberOfFrames: part.length,
            timestamp: Math.round((at * 1_000_000) / OPUS_RATE),
            data: part.slice(),
          })
          encoder.encode(data)
          data.close()
        }
        await encoder.flush()
      } finally {
        if (encoder.state !== 'closed') encoder.close()
      }
      if (failed) throw failed instanceof Error ? failed : new Error(String(failed))
      return { packets, config }
    },
  }
}
