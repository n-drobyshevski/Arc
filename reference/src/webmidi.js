// WebMIDI transport for the EP-133 (Chrome on Android or desktop).

const EP_PORT = /EP[- ]?(133|1320|40)|K\.?O\.?\s?II/i

export const webMidiSupported = () => typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator

export class MidiError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MidiError'
  }
}

function pickPort(map) {
  const ports = [...map.values()].filter((p) => p.state !== 'disconnected')
  const named = ports.filter((p) => EP_PORT.test(p.name ?? ''))
  if (named.length) return named[0]
  return ports.length === 1 ? ports[0] : null
}

/**
 * @returns {Promise<{ transport, access, portName: string }>}
 */
export async function openMidi({ onDisconnect } = {}) {
  if (!webMidiSupported()) throw new MidiError("This browser can't talk to MIDI devices. Use Chrome on Android or desktop.")
  let access
  try {
    access = await navigator.requestMIDIAccess({ sysex: true })
  } catch (err) {
    throw new MidiError('MIDI access was blocked. Allow MIDI for this site in Chrome settings, then connect again.')
  }
  const input = pickPort(access.inputs)
  const output = pickPort(access.outputs)
  if (!input || !output) {
    throw new MidiError('No EP-133 found. Plug it in with a USB-C cable, turn it on, then connect again.')
  }
  await Promise.allSettled([input.open?.(), output.open?.()])

  const listeners = new Set()
  const onMessage = (e) => {
    for (const cb of listeners) cb(e.data)
  }
  input.addEventListener('midimessage', onMessage)

  const onState = (e) => {
    if ((e.port === input || e.port === output) && e.port.state === 'disconnected') onDisconnect?.()
  }
  access.addEventListener('statechange', onState)

  const transport = {
    send: (bytes) => output.send(bytes),
    onMessage: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    close: () => {
      input.removeEventListener('midimessage', onMessage)
      access.removeEventListener('statechange', onState)
      listeners.clear()
    },
  }
  return { transport, access, portName: output.name ?? 'EP-133' }
}
