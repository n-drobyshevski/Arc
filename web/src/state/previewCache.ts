// Port of app/src/main/kotlin/dev/arc/ep133/audio/PcmSound.kt (SoundMemory, as ArcController's previews use it)
//
// The previews' decoded sounds: a small least-recently-played cache, so
// playing the same backup sound or pad copy again neither reads nor decodes
// its WAV again. The same PCM array comes back each time, so the player can
// keep its AudioBuffer for it too (player.ts).
//
// Web deltas:
// - Capped at PREVIEW_CACHE_COUNT sounds and PREVIEW_CACHE_BYTES of PCM, where
//   Kotlin caps bytes only (16 MB); a single sound over the byte cap is not
//   kept, where Kotlin keeps the one just put in.
// - Keys are strings, and [clear] takes a key prefix (a backup deleted, the
//   copies cleared). The web has no takes, so no take is ever kept here.

/** A decoded sound, ready for SoundPlayer.play: s16le, [channels] interleaved. */
export interface DecodedSound {
  readonly pcm: Uint8Array
  readonly channels: number
  readonly sampleRate: number
}

/** How many sounds the cache keeps at most. */
export const PREVIEW_CACHE_COUNT = 8
/** How many bytes of PCM it keeps at most (a single larger sound is not kept). */
export const PREVIEW_CACHE_BYTES = 32 * 1024 * 1024

export class PreviewCache {
  // Least recently played first (a Map keeps insertion order).
  private readonly sounds = new Map<string, DecodedSound>()
  private bytes = 0

  constructor(
    private readonly maxCount: number = PREVIEW_CACHE_COUNT,
    private readonly maxBytes: number = PREVIEW_CACHE_BYTES,
  ) {}

  /** The sound under [key], now the most recently played; null when not kept. */
  get(key: string): DecodedSound | null {
    const d = this.sounds.get(key)
    if (d === undefined) return null
    this.sounds.delete(key)
    this.sounds.set(key, d)
    return d
  }

  /** Keeps [d] under [key], dropping the least recently played past either limit. */
  put(key: string, d: DecodedSound): void {
    this.remove(key)
    if (d.pcm.length > this.maxBytes) return
    this.sounds.set(key, d)
    this.bytes += d.pcm.length
    for (const k of this.sounds.keys()) {
      if (this.sounds.size <= this.maxCount && this.bytes <= this.maxBytes) break
      this.remove(k)
    }
  }

  /** Drops every sound whose key starts with [prefix] (a backup deleted, the copies cleared), or all. */
  clear(prefix = ''): void {
    for (const k of [...this.sounds.keys()]) if (k.startsWith(prefix)) this.remove(k)
  }

  get size(): number {
    return this.sounds.size
  }

  private remove(key: string): void {
    const d = this.sounds.get(key)
    if (d === undefined) return
    this.sounds.delete(key)
    this.bytes -= d.pcm.length
  }
}
