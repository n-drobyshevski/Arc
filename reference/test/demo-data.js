// Small, deterministic device contents for the simulator.
export function tarFile(entries) {
  const blocks = []
  for (const [name, data] of entries) {
    const h = new Uint8Array(512)
    h.set(new TextEncoder().encode(name), 0)
    h.set(new TextEncoder().encode(data.length.toString(8).padStart(11, '0')), 124)
    h[156] = 48
    blocks.push(h, data, new Uint8Array((512 - (data.length % 512)) % 512))
  }
  blocks.push(new Uint8Array(1024))
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0))
  let o = 0
  for (const b of blocks) {
    out.set(b, o)
    o += b.length
  }
  return out
}

export function padRecord(slot) {
  const r = new Uint8Array(26)
  r[1] = slot & 0xff
  r[2] = slot >> 8
  return r
}

export function tone(frames, freq, channels = 1) {
  const a = new Int16Array(frames * channels)
  for (let i = 0; i < frames; i++) {
    const v = Math.round(Math.sin((i * freq * 2 * Math.PI) / 46875) * 12000 * Math.exp(-i / (frames / 3)))
    for (let c = 0; c < channels; c++) a[i * channels + c] = v
  }
  return new Uint8Array(a.buffer)
}

export function demoDevice() {
  const names = ['kick', 'snare', 'hat closed', 'hat open', 'clap', 'rim', 'tom low', 'perc', 'bass c1', 'vox chop', 'stab', 'riser']
  const sounds = names.map((name, i) => ({
    slot: i < 8 ? i + 1 : 100 + i,
    name,
    pcm: tone(4000 + i * 1500, 60 + i * 40, i === 9 ? 2 : 1),
    meta: i === 9 ? { channels: 2 } : {},
  }))
  const projects = [1, 2, 5].map((n, k) => ({
    n,
    tar: tarFile([
      ...sounds.slice(k * 3, k * 3 + 5).map((s, j) => [`pads/${'abcd'[j % 4]}/p${String(j + 1).padStart(2, '0')}`, padRecord(s.slot)]),
      ['settings', new Uint8Array(222)],
    ]),
  }))
  return { sounds, projects, capacity: 64 * 1024 * 1024 }
}
