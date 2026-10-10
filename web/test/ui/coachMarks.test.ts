// Tests for the guide overlay's tags that moved with the slimmer top bar
// (src/ui/components/Coach.tsx): Back up into the Backups caption row, Settings
// into Live's tools, and the top bar's Bluetooth key and hold-to-disconnect key.
import { describe, expect, it } from 'vitest'
import { CoachText } from '../../src/core/text/coachText'
import { NavText } from '../../src/core/text/navText'
import { COACH_IDS, COACH_MARKS, coachSpecFor } from '../../src/ui/components/Coach'

describe('the moved keys\' tags', () => {
  it('Back up is backups.backup, orange, and the top bar has no such tag', () => {
    expect(COACH_IDS).toContain('backups.backup')
    expect(COACH_IDS).not.toContain('top.backup')
    expect(COACH_MARKS['backups.backup']).toEqual({ label: CoachText.BACK_UP, face: 'var(--signal)', ink: 'var(--on-signal)' })
  })

  it('Settings is tools.settings, graphite, and the top bar has no such tag', () => {
    expect(COACH_IDS).toContain('tools.settings')
    expect(COACH_IDS).not.toContain('top.settings')
    expect(COACH_MARKS['tools.settings']).toEqual({ label: CoachText.SETTINGS, face: 'var(--graphite)', ink: 'var(--shell)' })
  })

  it('the Bluetooth key is top.bluetooth: amber with the tag ink, named Bluetooth delay', () => {
    expect(COACH_IDS).toContain('top.bluetooth')
    expect(CoachText.BLUETOOTH).toBe('Bluetooth delay')
    expect(COACH_MARKS['top.bluetooth']).toEqual({ label: 'Bluetooth delay', face: 'var(--warn)', ink: 'var(--tag-ink)' })
  })

  it('the connection key says hold: its name, the hint and the screen readers\' button', () => {
    expect(CoachText.CONNECTED).toBe('EP-133 connected: hold to disconnect')
    expect(CoachText.CONNECTED_NAME).toBe('EP-133 connected')
    expect(NavText.HOLD_TO_DISCONNECT).toBe('Hold to disconnect')
    expect(CoachText.DISCONNECT).toBe('Disconnect')
    // The overlay still tells the connected key from the other by its name.
    const el = { getAttribute: (n: string) => (n === 'aria-label' ? CoachText.CONNECTED_NAME : null), querySelector: () => null } as unknown as Element
    expect(coachSpecFor('top.connection', el)).toEqual({ label: CoachText.CONNECTION, face: 'var(--ok)', ink: 'var(--on-ok)' })
  })

  it('every id has a tag', () => {
    for (const id of COACH_IDS) expect(COACH_MARKS[id].label.length, id).toBeGreaterThan(0)
  })
})
