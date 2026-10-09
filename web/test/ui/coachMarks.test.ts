// Tests for the guide overlay's tags that moved with the slimmer top bar
// (src/ui/components/Coach.tsx): Back up into the Backups caption row, Settings
// into Live's tools.
import { describe, expect, it } from 'vitest'
import { CoachText } from '../../src/core/text/coachText'
import { COACH_IDS, COACH_MARKS } from '../../src/ui/components/Coach'

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

  it('every id has a tag', () => {
    for (const id of COACH_IDS) expect(COACH_MARKS[id].label.length, id).toBeGreaterThan(0)
  })
})
