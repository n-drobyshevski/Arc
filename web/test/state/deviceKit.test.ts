// Port of app/src/test/kotlin/dev/arc/ep133/controller/DeviceKitTest.kt: the kit a share names and a card's sounds are
// read by: the device's own, told by its slots, never the one Live plays offline. An EP-133 with its own sounds and only
// the EP-40's pack saved (Live on that kit) is the EP-133's kit, its unnamed sounds left unnamed, and a card's EP-40
// sounds are uploaded from the pack, not put on by their slots.
// Web delta: deviceKitOf takes the connected list as its own argument (Kotlin's MirrorUi.sounds).
import { describe, expect, it } from 'vitest'
import { BeatCards, SoundStatus, cardSound } from '../../src/core/features/beatCard'
import { FactoryKit, FactorySounds } from '../../src/core/features/factorySounds'
import { SoundSource } from '../../src/core/features/offlinePads'
import type { SoundEntry } from '../../src/core/protocol/device'
import { BackupDevice, type BackupRecord } from '../../src/core/text/libraryRules'
import { deviceKitOf, foreignTo, packSoundOf, soundSet, soundsUi } from '../../src/state/beatPlan'
import { emptyMirrorState, type MirrorUi } from '../../src/state/types'

const pack = (kit: FactoryKit, slots: readonly number[]): BackupRecord => ({
  id: kit.id,
  title: kit.id,
  notes: '',
  createdAt: 1,
  source: kit.source,
  fileName: null,
  device: BackupDevice(),
  soundCount: slots.length,
  projectCount: 0,
  projects: [],
  slots,
  projectSlots: {},
  size: 0,
})

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i)

// The EP-133's sounds: slots 1..60 and 100..160, unnamed as the device lists them; the EP-40's pack has 1..55, 100..164, 200..244, 600..628.
const ep133Slots = [...range(1, 60), ...range(100, 160)]
const ep40Slots = [...range(1, 55), ...range(100, 164), ...range(200, 244), ...range(600, 628)]
const device: SoundEntry[] = ep133Slots.map((s) => ({ slot: s, name: String(s).padStart(3, '0') + '.pcm', size: 1 }))
const ep40Names = new Map(ep40Slots.map((s): [number, string] => [s, s === 53 ? 'mpc kick' : s === 234 ? 'mpc hh' : `ep40 ${s}`]))

const mirror = (o: Partial<MirrorUi> = {}): MirrorUi => ({ state: emptyMirrorState(), loading: false, error: null, ...o })

describe('DeviceKitTest', () => {
  it('an EP-133 with its own sounds is not the EP-40 kit Live plays', () => {
    const backups = [pack(FactoryKit.EP40, ep40Slots)]
    const connected = mirror()
    const k = deviceKitOf(connected, device, backups, new Map([[FactoryKit.EP40, ep40Names]]), null, FactoryKit.EP40)
    expect(k.kit).toBe(FactoryKit.EP133)
    expect(k.names).toBeNull()
    // Its own pack saved too: named by it.
    const ep133Names = new Map(ep133Slots.map((s): [number, string] => [s, `kick ${s}`]))
    const both = deviceKitOf(connected, device, [...backups, pack(FactoryKit.EP133, ep133Slots)], new Map([[FactoryKit.EP40, ep40Names], [FactoryKit.EP133, ep133Names]]), null, FactoryKit.EP40)
    expect(both.kit).toBe(FactoryKit.EP133)
    expect(both.names?.get(53)).toBe('kick 53')
    // An EP-133 the EP-40's pack was put on: that kit.
    const riddim = ep40Slots.map((s): SoundEntry => ({ slot: s, name: 'x', size: 1 }))
    expect(deviceKitOf(connected, riddim, backups, new Map([[FactoryKit.EP40, ep40Names]]), null, FactoryKit.EP133).kit).toBe(FactoryKit.EP40)
    // Live playing the pack offline (nothing read): the pack's kit and names.
    const offline = mirror({ offline: 'Factory', offlineSounds: { base: SoundSource.FACTORY, device: null, factory: [], unavailable: new Set() } })
    expect(deviceKitOf(offline, [], backups, new Map([[FactoryKit.EP40, ep40Names]]), null, FactoryKit.EP40).kit).toBe(FactoryKit.EP40)
    expect(deviceKitOf(offline, [], backups, new Map([[FactoryKit.EP40, ep40Names]]), null, FactoryKit.EP40).names?.get(53)).toBe('mpc kick')
  })

  it("another kit's sound is not put on by its slot, and a pack that has it can upload it", () => {
    const packs = new Map([[FactoryKit.EP40, ep40Names]])
    const card = BeatCards.read(
      'ARC BEAT 1\n[A] bars 1\nsound A7 53 mpc kick\nsound A4 234 mpc hh\nsound A9 154 my snare\nA7 kick | X... .... .... .... |\nA4 hat | x.x. x.x. x.x. x.x. |\nA9 sn | .... X... .... X... |\n',
    ).card!
    const available = new Map(device.map((e): [number, string] => [e.slot, e.name]))
    const picks = new Map(BeatCards.resolveSounds(card, available, () => null, foreignTo(packs, FactoryKit.EP133)).map((p) => [p.pad.offset, p]))
    // 53 holds the EP-133's own (unnamed) kick: not the card's mpc kick.
    expect(picks.get(9)!.status).toBe(SoundStatus.MISSING)
    expect(picks.get(6)!.status).toBe(SoundStatus.MISSING)
    // A name no pack has, on an unnamed slot, is still used by its slot.
    expect(picks.get(11)!.status).toBe(SoundStatus.CHANGE)
    expect(picks.get(11)!.unverified).toBe(true)
    const ui = soundsUi(card, soundSet('the EP-133', available), () => null, () => null, false, 1, packs, FactoryKit.EP133)!
    const kick = ui.rows.find((r) => r.pad.offset === 9)!
    expect(kick.fromPack?.slot).toBe(53)
    expect(kick.fromPack?.kit).toBe(FactoryKit.EP40)
    expect(kick.changes).toBe(true)
    // Offline it can't be uploaded: no tick, the row says to connect.
    const off = soundsUi(card, soundSet('the last read', available), () => null, () => null, true, 1, packs, FactoryKit.EP133)!
    expect(off.rows.find((r) => r.pad.offset === 9)!.changes).toBe(false)
    expect(packSoundOf(cardSound(9, 'MPC HH'), packs)?.slot).toBe(234)
    expect(packSoundOf(cardSound(9, '009.pcm'), packs)).toBeNull()
    expect(foreignTo(packs, FactoryKit.EP40)(cardSound(53, 'mpc kick'))).toBe(false)
    expect(FactorySounds.unnamed(53, available.get(53)!)).toBe(true)
  })
})
