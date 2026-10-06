// Tests for platform/files/{pick,save,launchQueue}.ts, platform/share/share.ts,
// platform/wakelock/wakeLock.ts and core/text/webText.ts.

import { describe, expect, it, vi } from 'vitest'
import {
  MAX_IMPORT,
  TOO_LARGE,
  attachDrop,
  describeFile,
  dragMayHaveAudio,
  isAudioFile,
  isPakName,
  pickFiles,
  readFile,
  type DragEventLike,
  type PickDocument,
} from '../../src/platform/files/pick'
import {
  REVOKE_AFTER_MS,
  download,
  fileNameFor,
  logFileName,
  mimeFor,
  pickerType,
  saveBytes,
  type SaveEnv,
  type SavePickerOptions,
  type WritableLike,
} from '../../src/platform/files/save'
import { shareFile, type ShareDataLike, type ShareEnv } from '../../src/platform/share/share'
import { onLaunchFiles, type LaunchParamsLike } from '../../src/platform/files/launchQueue'
import { createWakeLock, keepScreenOn, type WakeLockSentinelLike } from '../../src/platform/wakelock/wakeLock'
import { WebText } from '../../src/core/text/webText'
import { Strings } from '../../src/core/text/strings'
import { MIDI_TEXT } from '../../src/platform/midi/webmidi'
import { OWNER_TEXT } from '../../src/platform/midi/owner'

const bytes = (...b: number[]): Uint8Array<ArrayBuffer> => Uint8Array.from(b)

function domError(name: string, msg = name): Error {
  const e = new Error(msg)
  e.name = name
  return e
}

// ---------------------------------------------------------------------------
// File names

describe('file names', () => {
  it('fileNameFor follows LibraryRules / app.js', () => {
    expect(fileNameFor('My Backup')).toBe('my-backup.pak')
    expect(fileNameFor('  Beats: vol. 2!  ')).toBe('beats-vol-2.pak')
    expect(fileNameFor('a   b')).toBe('a-b.pak')
    expect(fileNameFor('Ünïcode only äöü')).toBe('ncode-only.pak')
    expect(fileNameFor('äöü')).toBe('ep133-backup.pak')
    expect(fileNameFor('')).toBe('ep133-backup.pak')
    expect(fileNameFor('under_score-dash')).toBe('under_score-dash.pak')
  })

  it('mimeFor ports PakFileProvider.getType', () => {
    expect(mimeFor('x.pak')).toBe('application/zip')
    expect(mimeFor('X.PAK')).toBe('application/zip')
    expect(mimeFor('001 kick.wav')).toBe('audio/wav')
    expect(mimeFor('arc-sysex-1.txt')).toBe('text/plain')
    expect(mimeFor('thing.bin')).toBe('application/octet-stream')
  })

  it('logFileName is arc-sysex-yyyyMMdd-HHmmss.txt in local time', () => {
    const d = new Date(2026, 0, 2, 3, 4, 5)
    expect(logFileName(d.getTime())).toBe('arc-sysex-20260102-030405.txt')
  })

  it('pickerType offers a .pak as octet-stream, like CreateDocument', () => {
    expect(pickerType('b.pak', 'application/zip')).toEqual({
      description: 'EP-133 backup',
      accept: { 'application/octet-stream': ['.pak'] },
    })
    expect(pickerType('k.wav', 'audio/wav').accept).toEqual({ 'audio/wav': ['.wav'] })
    expect(pickerType('noext', 'text/plain').accept).toEqual({ 'text/plain': [] })
  })

  it('isPakName', () => {
    expect(isPakName('a.pak')).toBe(true)
    expect(isPakName('a.ZIP')).toBe(true)
    expect(isPakName('a.wav')).toBe(false)
  })

  it('a sample drop takes audio, never a backup', () => {
    expect(isAudioFile({ name: 'kick.wav', type: '' })).toBe(true)
    expect(isAudioFile({ name: 'kick', type: 'audio/x-wav' })).toBe(true)
    expect(isAudioFile({ name: 'backup.pak', type: '' })).toBe(false)
    expect(isAudioFile({ name: 'backup.zip', type: 'application/zip' })).toBe(false)
    expect(isAudioFile({ name: 'notes.txt', type: 'text/plain' })).toBe(false)
    const file = (type: string) => ({ kind: 'file', type })
    expect(dragMayHaveAudio({ types: ['Files'], items: [file('audio/wav')] })).toBe(true)
    // No type while dragging (a .pak): the drop decides by name.
    expect(dragMayHaveAudio({ types: ['Files'], items: [file('')] })).toBe(true)
    expect(dragMayHaveAudio({ types: ['Files'], items: [file('application/zip')] })).toBe(false)
    expect(dragMayHaveAudio({ types: ['text/plain'], items: [] })).toBe(false)
    expect(dragMayHaveAudio(null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Reading

describe('readFile', () => {
  it('reads a small file', async () => {
    const got = await readFile(new Blob([bytes(1, 2, 3)]))
    expect(Array.from(got)).toEqual([1, 2, 3])
  })

  it('refuses a file over 128 MiB before reading it', async () => {
    const read = vi.fn(async () => new ArrayBuffer(0))
    const huge = { size: MAX_IMPORT + 1, arrayBuffer: read } as unknown as Blob
    await expect(readFile(huge)).rejects.toThrow(TOO_LARGE)
    expect(read).not.toHaveBeenCalled()
    expect(TOO_LARGE).toBe('This file is too large to be a backup')
    expect(MAX_IMPORT).toBe(134217728)
  })

  it('accepts exactly the cap and checks the bytes read as well', async () => {
    await expect(readFile(new Blob([new Uint8Array(4)]), 4)).resolves.toHaveLength(4)
    const liar = { size: 1, arrayBuffer: async () => new ArrayBuffer(5) } as unknown as Blob
    await expect(readFile(liar, 4)).rejects.toThrow(TOO_LARGE)
  })

  it('a failed read says the file could not be opened', async () => {
    const broken = { size: 1, arrayBuffer: async () => Promise.reject(new Error('NotReadableError')) } as unknown as Blob
    await expect(readFile(broken)).rejects.toThrow('Could not open the file')
  })

  it('describeFile falls back like Files.describe', () => {
    expect(describeFile(new File([bytes(1)], 'x.pak', { lastModified: 1234 }))).toEqual({ name: 'x.pak', lastModified: 1234 })
    expect(describeFile(new Blob([bytes(1)]))).toEqual({ name: 'backup.pak', lastModified: null })
    expect(describeFile(new File([bytes(1)], '', { lastModified: 0 }))).toEqual({ name: 'backup.pak', lastModified: null })
  })
})

// ---------------------------------------------------------------------------
// Picking

class FakeInput extends EventTarget {
  type = ''
  accept = ''
  multiple = false
  webkitdirectory = false
  hidden = false
  style = { display: '' }
  files: File[] | null = null
  value = 'C:\\fakepath\\x.pak'
  removed = false
  clicked = 0
  click(): void {
    this.clicked++
  }
  remove(): void {
    this.removed = true
  }
}

function fakeDoc(): { doc: PickDocument; inputs: FakeInput[]; appended: unknown[] } {
  const inputs: FakeInput[] = []
  const appended: unknown[] = []
  const doc = {
    createElement: () => {
      const i = new FakeInput()
      inputs.push(i)
      return i as unknown as HTMLInputElement
    },
    body: { append: (n: unknown) => appended.push(n) },
  } as unknown as PickDocument
  return { doc, inputs, appended }
}

describe('pickFiles', () => {
  it('configures a hidden input, resolves the chosen files and resets the value', async () => {
    const { doc, inputs, appended } = fakeDoc()
    const p = pickFiles({ accept: '.pak', multiple: true }, doc)
    const input = inputs[0] as FakeInput
    expect(input.type).toBe('file')
    expect(input.accept).toBe('.pak')
    expect(input.multiple).toBe(true)
    expect(input.webkitdirectory).toBe(false)
    expect(input.hidden).toBe(true)
    expect(appended).toEqual([input])
    expect(input.clicked).toBe(1)
    const f = new File([bytes(1)], 'a.pak')
    input.files = [f]
    input.dispatchEvent(new Event('change'))
    await expect(p).resolves.toEqual([f])
    expect(input.value).toBe('')
    expect(input.removed).toBe(true)
  })

  it('resolves [] when the picker is cancelled', async () => {
    const { doc, inputs } = fakeDoc()
    const p = pickFiles({ directory: true }, doc)
    const input = inputs[0] as FakeInput
    expect(input.webkitdirectory).toBe(true)
    input.dispatchEvent(new Event('cancel'))
    await expect(p).resolves.toEqual([])
    expect(input.removed).toBe(true)
  })

  it('without a cancel event, the next pick settles the earlier one with [] and removes its input', async () => {
    const { doc, inputs } = fakeDoc()
    const first = pickFiles({}, doc)
    const second = pickFiles({}, doc)
    await expect(first).resolves.toEqual([])
    expect((inputs[0] as FakeInput).removed).toBe(true)
    expect((inputs[1] as FakeInput).removed).toBe(false)
    const f = new File([bytes(1)], 'b.pak')
    const input = inputs[1] as FakeInput
    input.files = [f]
    input.dispatchEvent(new Event('change'))
    await expect(second).resolves.toEqual([f])
    // A late event on the first input changes nothing.
    ;(inputs[0] as FakeInput).dispatchEvent(new Event('change'))
  })
})

// ---------------------------------------------------------------------------
// Drag and drop

function dragEvent(type: string, files: File[] | null, types: string[] = files ? ['Files'] : ['text/plain']): DragEventLike {
  const e = new Event(type, { cancelable: true }) as unknown as { dataTransfer: unknown }
  e.dataTransfer = { types, files, dropEffect: 'none' }
  return e as unknown as DragEventLike
}

describe('attachDrop', () => {
  it('reports dropped files, tracks the highlight and ignores non-file drags', () => {
    const target = new EventTarget()
    const got: File[][] = []
    const active: boolean[] = []
    const detach = attachDrop(target, {
      onFiles: (f) => got.push(f),
      onActive: (a) => active.push(a),
      filter: (f) => isPakName(f.name),
    })
    const a = new File([bytes(1)], 'a.pak')
    const b = new File([bytes(2)], 'b.txt')

    const enter = dragEvent('dragenter', [])
    target.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(true)
    target.dispatchEvent(dragEvent('dragenter', [])) // a child
    target.dispatchEvent(dragEvent('dragleave', [])) // left the child
    expect(active).toEqual([true])
    const over = dragEvent('dragover', [])
    target.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    expect(over.dataTransfer?.dropEffect).toBe('copy')

    const drop = dragEvent('drop', [a, b])
    target.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(got).toEqual([[a]])
    expect(active).toEqual([true, false])

    const text = dragEvent('dragover', null)
    target.dispatchEvent(text)
    expect(text.defaultPrevented).toBe(false)

    // Only filtered-out files: nothing reported.
    target.dispatchEvent(dragEvent('drop', [b]))
    expect(got).toHaveLength(1)

    detach()
    target.dispatchEvent(dragEvent('drop', [a]))
    expect(got).toHaveLength(1)
  })

  it('a dragleave without types (Safari) still turns the highlight off; stray leaves are ignored', () => {
    const target = new EventTarget()
    const active: boolean[] = []
    attachDrop(target, { onFiles: () => undefined, onActive: (a) => active.push(a) })
    target.dispatchEvent(dragEvent('dragleave', null, [])) // nothing entered yet
    expect(active).toEqual([])
    target.dispatchEvent(dragEvent('dragenter', []))
    target.dispatchEvent(dragEvent('dragleave', null, []))
    expect(active).toEqual([true, false])
    // A text drag entering and leaving is never counted.
    target.dispatchEvent(dragEvent('dragenter', null))
    target.dispatchEvent(dragEvent('dragleave', null))
    expect(active).toEqual([true, false])
  })
})

// ---------------------------------------------------------------------------
// Saving

interface FakeSave {
  env: SaveEnv
  downloads: { url: string; name: string }[]
  blobs: Blob[]
  revoked: string[]
  timers: { fn: () => void; ms: number }[]
}

function fakeSaveEnv(picker?: SaveEnv['showSaveFilePicker']): FakeSave {
  const f: FakeSave = {
    downloads: [],
    blobs: [],
    revoked: [],
    timers: [],
    env: undefined as unknown as SaveEnv,
  }
  f.env = {
    showSaveFilePicker: picker,
    createObjectURL: (b) => {
      f.blobs.push(b)
      return `blob:${f.blobs.length}`
    },
    revokeObjectURL: (u) => f.revoked.push(u),
    clickDownload: (url, name) => f.downloads.push({ url, name }),
    setTimeout: (fn, ms) => f.timers.push({ fn, ms }),
  }
  return f
}

function fakeWritable(fail = false): WritableLike & { written: Blob[]; closed: boolean; aborted: boolean } {
  const w = {
    written: [] as Blob[],
    closed: false,
    aborted: false,
    write: async (b: Blob) => {
      if (fail) throw domError('QuotaExceededError')
      w.written.push(b)
    },
    close: async () => {
      w.closed = true
    },
    abort: async () => {
      w.aborted = true
    },
  }
  return w
}

describe('saveBytes', () => {
  it('downloads through <a download> and revokes the URL after 60 s without a picker', async () => {
    const f = fakeSaveEnv()
    await expect(saveBytes('b.pak', bytes(1, 2), 'application/zip', f.env)).resolves.toBe('saved')
    expect(f.downloads).toEqual([{ url: 'blob:1', name: 'b.pak' }])
    expect(f.blobs[0]?.type).toBe('application/zip')
    expect(new Uint8Array(await (f.blobs[0] as Blob).arrayBuffer())).toEqual(bytes(1, 2))
    expect(f.revoked).toEqual([])
    expect(f.timers.map((t) => t.ms)).toEqual([REVOKE_AFTER_MS])
    expect(REVOKE_AFTER_MS).toBe(60000)
    f.timers[0]?.fn()
    expect(f.revoked).toEqual(['blob:1'])
  })

  it('opens the picker first, then reads the bytes and writes them', async () => {
    const order: string[] = []
    const w = fakeWritable()
    const seen: SavePickerOptions[] = []
    const f = fakeSaveEnv(async (o) => {
      order.push('picker')
      seen.push(o)
      return { createWritable: async () => w }
    })
    const read = async (): Promise<Uint8Array> => {
      order.push('read')
      return bytes(9)
    }
    await expect(saveBytes('x.pak', read, undefined, f.env)).resolves.toBe('saved')
    expect(order).toEqual(['picker', 'read'])
    expect(seen[0]).toEqual({ suggestedName: 'x.pak', types: [{ description: 'EP-133 backup', accept: { 'application/octet-stream': ['.pak'] } }] })
    expect(w.closed).toBe(true)
    expect(new Uint8Array(await (w.written[0] as Blob).arrayBuffer())).toEqual(bytes(9))
    expect(f.downloads).toEqual([])
  })

  it('a closed picker is a cancel, not an error', async () => {
    const read = vi.fn(async () => bytes(1))
    const f = fakeSaveEnv(async () => Promise.reject(domError('AbortError')))
    await expect(saveBytes('x.pak', read, undefined, f.env)).resolves.toBe('cancelled')
    expect(read).not.toHaveBeenCalled()
    expect(f.downloads).toEqual([])
  })

  it('falls back to a download when the picker refuses (no user activation)', async () => {
    const f = fakeSaveEnv(async () => Promise.reject(domError('SecurityError')))
    await expect(saveBytes('k.wav', bytes(1), 'audio/wav', f.env)).resolves.toBe('saved')
    expect(f.downloads).toEqual([{ url: 'blob:1', name: 'k.wav' }])
  })

  it('a failed write aborts the file and says it could not be saved', async () => {
    const w = fakeWritable(true)
    const f = fakeSaveEnv(async () => ({ createWritable: async () => w }))
    await expect(saveBytes('x.pak', bytes(1), undefined, f.env)).rejects.toThrow(Strings.SAVE_FAILED)
    expect(w.aborted).toBe(true)
  })

  it('a failed read rejects with its own error', async () => {
    const f = fakeSaveEnv()
    await expect(saveBytes('x.pak', async () => Promise.reject(new Error(Strings.FILE_MISSING)), undefined, f.env)).rejects.toThrow(
      Strings.FILE_MISSING,
    )
    expect(f.downloads).toEqual([])
  })

  it('download revokes even when the click throws', () => {
    const f = fakeSaveEnv()
    f.env.clickDownload = () => {
      throw new Error('boom')
    }
    expect(() => download('a.pak', new Blob([]), f.env)).toThrow('boom')
    expect(f.timers).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Sharing

function fakeShareEnv(opts: { canShare?: boolean; share?: (d: ShareDataLike) => Promise<void> } = {}): {
  env: ShareEnv
  shared: ShareDataLike[]
  save: FakeSave
} {
  const shared: ShareDataLike[] = []
  const save = fakeSaveEnv()
  const env: ShareEnv = {
    canShare: opts.canShare === undefined ? undefined : () => opts.canShare === true,
    share:
      opts.canShare === undefined
        ? undefined
        : async (d) => {
            shared.push(d)
            if (opts.share) await opts.share(d)
          },
    save: save.env,
  }
  return { env, shared, save }
}

describe('shareFile', () => {
  it('shares one file with the backup subject and text', async () => {
    const s = fakeShareEnv({ canShare: true })
    await expect(shareFile('my.pak', bytes(1, 2), 'application/zip', 'My', { env: s.env })).resolves.toBe('shared')
    const d = s.shared[0] as ShareDataLike
    expect(d.title).toBe('My')
    expect(d.text).toBe('EP-133 backup: My')
    expect(d.files).toHaveLength(1)
    expect(d.files[0]?.name).toBe('my.pak')
    expect(d.files[0]?.type).toBe('application/zip')
    expect(new Uint8Array(await (d.files[0] as File).arrayBuffer())).toEqual(bytes(1, 2))
    expect(s.save.downloads).toEqual([])
  })

  it('takes custom text (the log shares DEBUG_TITLE as both)', async () => {
    const s = fakeShareEnv({ canShare: true })
    await shareFile('log.txt', bytes(65), 'text/plain', Strings.DEBUG_TITLE, { env: s.env, text: Strings.DEBUG_TITLE })
    expect(s.shared[0]?.text).toBe(Strings.DEBUG_TITLE)
  })

  it('ignores a closed share sheet', async () => {
    const s = fakeShareEnv({ canShare: true, share: async () => Promise.reject(domError('AbortError')) })
    await expect(shareFile('my.pak', bytes(1), 'application/zip', 'My', { env: s.env })).resolves.toBe('cancelled')
    expect(s.save.downloads).toEqual([])
  })

  it('a failed share says so', async () => {
    const s = fakeShareEnv({ canShare: true, share: async () => Promise.reject(domError('NotAllowedError')) })
    await expect(shareFile('my.pak', bytes(1), 'application/zip', 'My', { env: s.env })).rejects.toThrow(Strings.SHARE_FAILED)
  })

  it('saves instead when files cannot be shared', async () => {
    const s = fakeShareEnv({ canShare: false })
    await expect(shareFile('my.pak', bytes(1), 'application/zip', 'My', { env: s.env })).resolves.toBe('saved')
    expect(s.shared).toEqual([])
    expect(s.save.downloads).toEqual([{ url: 'blob:1', name: 'my.pak' }])
    expect(WebText.savedInstead('my.pak')).toBe("This browser can't share files directly, so the .pak was saved instead.")
    expect(WebText.savedInstead('k.wav')).toBe("This browser can't share files directly, so the file was saved instead.")
  })

  it('saves instead when there is no Web Share at all, or canShare throws', async () => {
    const none = fakeShareEnv()
    await expect(shareFile('k.wav', bytes(1), 'audio/wav', 'k.wav', { env: none.env })).resolves.toBe('saved')
    expect(none.save.downloads).toHaveLength(1)

    const throwing = fakeShareEnv({ canShare: true })
    throwing.env.canShare = () => {
      throw new TypeError('bad')
    }
    await expect(shareFile('k.wav', bytes(1), 'audio/wav', 'k.wav', { env: throwing.env })).resolves.toBe('saved')
  })
})

// ---------------------------------------------------------------------------
// Launch queue

describe('onLaunchFiles', () => {
  it('returns false without a launch queue', () => {
    expect(onLaunchFiles(() => undefined, undefined)).toBe(false)
  })

  it('hands over the readable files of each launch', async () => {
    let consumer: ((p: LaunchParamsLike) => void | Promise<void>) | null = null
    const got: File[][] = []
    expect(onLaunchFiles((f) => got.push(f), { setConsumer: (c) => (consumer = c) })).toBe(true)
    const a = new File([bytes(1)], 'a.pak')
    await consumer!({ files: [{ getFile: async () => a }, { getFile: async () => Promise.reject(new Error('gone')) }] })
    await consumer!({ files: [] })
    await consumer!({})
    expect(got).toEqual([[a]])
  })
})

// ---------------------------------------------------------------------------
// Wake lock

class FakeSentinel extends EventTarget implements WakeLockSentinelLike {
  released = false
  async release(): Promise<void> {
    if (this.released) return
    this.released = true
    this.dispatchEvent(new Event('release'))
  }
  override addEventListener(type: 'release', listener: () => void): void {
    super.addEventListener(type, listener)
  }
}

class FakeDoc extends EventTarget {
  visibilityState = 'visible'
  override addEventListener(type: 'visibilitychange', listener: () => void): void {
    super.addEventListener(type, listener)
  }
  override removeEventListener(type: 'visibilitychange', listener: () => void): void {
    super.removeEventListener(type, listener)
  }
  setVisible(v: boolean): void {
    this.visibilityState = v ? 'visible' : 'hidden'
    this.dispatchEvent(new Event('visibilitychange'))
  }
}

describe('wakeLock', () => {
  it('keepScreenOn follows MainActivity', () => {
    expect(keepScreenOn(true, false, false)).toBe(true)
    expect(keepScreenOn(false, true, true)).toBe(true)
    expect(keepScreenOn(false, true, false)).toBe(false)
    expect(keepScreenOn(false, false, true)).toBe(false)
  })

  it('does nothing where unsupported', async () => {
    const wl = createWakeLock({})
    expect(wl.supported).toBe(false)
    await wl.acquire()
    expect(wl.held).toBe(false)
    expect(wl.wanted).toBe(true)
    await wl.release()
    wl.dispose()
  })

  it('acquires once, re-acquires when the tab is shown again, and releases', async () => {
    const sentinels: FakeSentinel[] = []
    const doc = new FakeDoc()
    const wl = createWakeLock({
      wakeLock: {
        request: async () => {
          const s = new FakeSentinel()
          sentinels.push(s)
          return s
        },
      },
      document: doc,
    })
    await wl.acquire()
    await wl.acquire()
    expect(sentinels).toHaveLength(1)
    expect(wl.held).toBe(true)

    // Hiding the tab drops the lock; showing it asks again.
    doc.visibilityState = 'hidden'
    await sentinels[0]?.release()
    expect(wl.held).toBe(false)
    doc.setVisible(true)
    await vi.waitFor(() => expect(wl.held).toBe(true))
    expect(sentinels).toHaveLength(2)

    await wl.release()
    expect(sentinels[1]?.released).toBe(true)
    doc.setVisible(false)
    doc.setVisible(true)
    await Promise.resolve()
    expect(sentinels).toHaveLength(2)
    wl.dispose()
  })

  it('a refused request is swallowed, and a release during the request lets go of it', async () => {
    let resolve: ((s: FakeSentinel) => void) | null = null
    let refuse = true
    const late = new FakeSentinel()
    const wl = createWakeLock({
      wakeLock: {
        request: () => {
          if (refuse) return Promise.reject(domError('NotAllowedError'))
          return new Promise<FakeSentinel>((r) => (resolve = r))
        },
      },
    })
    await expect(wl.acquire()).resolves.toBeUndefined()
    expect(wl.held).toBe(false)
    refuse = false
    const p = wl.acquire()
    await wl.release()
    resolve!(late)
    await p
    expect(late.released).toBe(true)
    expect(wl.held).toBe(false)
  })

  it('on, off, on while the request is on its way keeps the lock; dispose lets go and stops listening', async () => {
    let resolve: ((s: FakeSentinel) => void) | null = null
    let requests = 0
    const doc = new FakeDoc()
    const wl = createWakeLock({
      wakeLock: {
        request: () => {
          requests++
          return new Promise<FakeSentinel>((r) => (resolve = r))
        },
      },
      document: doc,
    })
    const first = wl.set(true)
    void wl.set(false)
    const again = wl.set(true)
    const s = new FakeSentinel()
    resolve!(s)
    await Promise.all([first, again])
    expect(requests).toBe(1)
    expect(wl.held).toBe(true)
    expect(s.released).toBe(false)
    wl.dispose()
    await Promise.resolve()
    expect(s.released).toBe(true)
    doc.setVisible(false)
    doc.setVisible(true)
    await wl.acquire()
    expect(requests).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Web text

describe('webText', () => {
  it('keeps the MIDI and other-tab sentences identical to the platform modules', () => {
    expect(WebText.MIDI_UNSUPPORTED).toBe(MIDI_TEXT.unsupported)
    expect(WebText.MIDI_DENIED).toBe(MIDI_TEXT.denied)
    expect(WebText.MIDI_NOT_FOUND).toBe(MIDI_TEXT.notFound)
    expect(WebText.MIDI_BLOCKED).toBe(MIDI_TEXT.blocked)
    expect(WebText.OTHER_TAB).toBe(OWNER_TEXT.OTHER_TAB)
  })

  it('says nothing about phones, Android folders or share sheets', () => {
    const all: string[] = []
    for (const v of Object.values(WebText)) {
      if (typeof v === 'string') all.push(v)
    }
    all.push(
      WebText.storageNote(3, 1000, 5000),
      WebText.deleteConfirm('x'),
      WebText.keepNote(true),
      WebText.keepNote(false),
      WebText.pruneConfirm(2, true),
      WebText.folderNote('arc'),
      WebText.copyFailed('m'),
    )
    for (const s of all) {
      expect(s).not.toMatch(/phone|share sheet/i)
      if (s !== WebText.FOLDER_NOTE_OFF) expect(s).not.toMatch(/Documents/)
    }
  })

  it('rewords the Android sentences', () => {
    expect(WebText.NO_MIDI_TITLE).toBe('No MIDI in this browser')
    expect(WebText.storageNote(0, 0, null)).toBe('')
    expect(WebText.storageNote(2, 2048, null)).toBe(Strings.storageNote(2, 2048, null).replace('on this phone', 'in this browser'))
    expect(WebText.deleteConfirm('A')).toBe('Delete "A" from this browser? This can\'t be undone.')
    expect(WebText.pruneConfirm(1, false)).toBe('This deletes the oldest backup.')
    expect(WebText.pruneConfirm(3, true)).toBe('This deletes the 3 oldest backups, also from the library folder.')
    expect(WebText.logHeader('1.2.3', 'UA', '', Date.UTC(2026, 9, 5, 12, 0, 0))).toEqual([
      'arc 1.2.3 on UA',
      'MIDI: not connected',
      'Exported 2026-10-05T12:00:00Z',
    ])
  })
})
