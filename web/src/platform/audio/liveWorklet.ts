// The AudioWorklet module of Live's sound output: a MixerHost (liveMixer.ts)
// rendering on the audio thread. liveAudio.ts loads it with
// `import url from './liveWorklet?worker&url'`, so Vite bundles it (with the
// core mixer) into one self-contained script.

import { LIVE_PROCESSOR, MixerHost, type ToMixer } from './liveMixer'

// AudioWorkletGlobalScope, which the DOM lib leaves out.
declare const sampleRate: number
declare const currentTime: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void

class LiveProcessor extends AudioWorkletProcessor {
  private readonly host = new MixerHost(sampleRate, (m) => this.port.postMessage(m))
  private spare = new Float32Array(0)

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<ToMixer>) => this.host.handle(e.data)
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0]
    const left = out?.[0]
    if (!left) return true
    let right = out[1]
    if (!right) {
      // A mono output (it is asked for stereo): the right channel goes nowhere.
      if (this.spare.length < left.length) this.spare = new Float32Array(left.length)
      right = this.spare
    }
    this.host.render(left, right, left.length, currentTime)
    // Kept alive while connected: Live's output stays open while Live is on screen.
    return true
  }
}

registerProcessor(LIVE_PROCESSOR, LiveProcessor)
