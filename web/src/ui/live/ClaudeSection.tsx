// Port of LiveClaude.kt's ClaudeUi and LiveTools.kt's ClaudePage (app/src/main/kotlin/dev/arc/ep133/ui/screens/)
//
// Live tools' Claude page: the deck (ClaudeDeck.tsx: the prompt builder on
// the glass, the keys under it, the saved prompts and the skill's link), and
// what a beat card is folded at the foot.
//
// Web deltas:
// - The state is read from [ClaudeContext] by the section itself.
// - Live tools are one page here, not pages: the section keeps its CLAUDE
//   caption over the glass.
// - The deck is a chunk of its own with the prompt builder's genres and words
//   (lazy.ts, fetched once the app is idle: [preloadClaudeDeck]); the section
//   shows its caption and the fold until it is in.
// - SHARE uses the browser's share sheet, or copies the prompt where there is
//   none; COPY copies it.
// - PASTE CARD where the page may not read the clipboard opens a box a paste
//   goes into (the beat sheet's); a paste anywhere on Live works too.
// - The glass waits only for a share that went: a share sheet called off
//   doesn't (Android can't tell, once its chooser opened); a prompt copied
//   where there is no share sheet does.
// - Memoized on [group]: Live's tools render again on each of the mirror's
//   publishes, and the deck reads what it shows from signals (the getters).
import { createContext, type JSX } from 'preact'
import { useContext, useId } from 'preact/hooks'
import type { ClaudePrompt, SharePick } from '../../core/features/claudePrompt'
import type { FactoryKit } from '../../core/features/factorySounds'
import type { Weight } from '../../state/beatPlan'
import { ClaudeText } from '../../core/text/claudeText'
import { Caption } from '../components/Caption'
import { Disclosure } from '../components/SettingRow'
import { lazy } from '../lazy'
import { memo, sameProps } from './memo'
import './ClaudeSection.css'

/** The CLAUDE section's state and what its keys do (Kotlin ClaudeUi), read as it renders. */
export interface ClaudeActions {
  /** The scene playing ("S02"). */
  readonly scene: string
  /** Each group's playing pattern number, A to D. */
  readonly numbers: readonly number[]
  /** Whether each group's playing pattern has notes. */
  readonly hasNotes: readonly boolean[]
  /** How many sounds Arc knows (0 leaves SOUNDS off), and whether the sound list follows a share. */
  readonly sounds: number
  readonly withSounds: boolean
  /** The project's chain: its steps, over its scenes (no steps leaves CHAIN off). */
  readonly chainSteps: number
  readonly chainScenes: number
  /** Each group's pattern, its first bar as step lights (stepLights), for the glass. */
  readonly lights: readonly (readonly (Weight | null)[])[]
  /**
   * The prompt on the glass as kept (AppSettings.claudePrompt: ClaudePrompt.encode) and the saved
   * prompts (claudePrompts: SavedPrompt.encodeAll), which the deck decodes (web: Kotlin's ClaudeUi
   * has them decoded).
   */
  readonly prompt: string
  readonly saved: string
  /** The kit the EP-133's sounds are (the prompt's own when it names none). */
  readonly kit: FactoryKit
  /** The tempo Live plays at: the tempo's LIVE answer. */
  readonly liveTempo: number
  /** What was shared to Claude and not yet answered ("Scene S02", "A · 01", "Chain"); null when no reply is awaited. */
  readonly waiting: string | null
  onWithSounds(on: boolean): void
  onPrompt(p: ClaudePrompt): void
  /** SHARE: the prompt, with the card [pick] names ([group]'s pattern for PATTERN) when it goes with one. */
  onShare(pick: SharePick, group: number): void
  /** COPY: as SHARE, onto the clipboard. */
  onCopy(pick: SharePick, group: number): void
  /** PRACTICE (the PLAY tab): play along with [pick] on Live's pads ([group]'s pattern for PATTERN). */
  onPractice(pick: SharePick, group: number): void
  onSavePrompt(p: ClaudePrompt): void
  onDeletePrompt(index: number): void
  onPaste(): void
  /** PASTE CARD held, or the link under it: a .txt or .md file with Claude's card in it. */
  onOpenFile(): void
  /** The glass's STOP: stop waiting. */
  onDismissWaiting(): void
}

export const ClaudeContext = createContext<ClaudeActions | null>(null)

export function useClaude(): ClaudeActions | null {
  return useContext(ClaudeContext)
}

const ClaudeDeck = lazy('ClaudeDeck', () => import('./ClaudeDeck').then((m) => m.ClaudeDeck))

/** Fetches the deck's chunk (the app does once it is idle). */
export const preloadClaudeDeck = ClaudeDeck.preload

/** Live tools' CLAUDE for [group] (the group shown, as the pattern's key names it). */
export const ClaudeSection = memo(function ClaudeSection(props: { group: number }): JSX.Element | null {
  const claude = useClaude()
  const titleId = useId()
  if (claude === null) return null
  return (
    <section class="claude" aria-labelledby={titleId}>
      <Caption text={ClaudeText.CLAUDE} align="start" as="h3" id={titleId} />
      <ClaudeDeck claude={claude} group={props.group} />
      <Disclosure title={ClaudeText.ABOUT_CARDS}>
        <p>{ClaudeText.INFO_CARDS}</p>
        <p>{ClaudeText.INFO_SKILL}</p>
      </Disclosure>
    </section>
  )
}, sameProps)
