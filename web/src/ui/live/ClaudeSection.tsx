// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/LiveClaude.kt (ClaudeUi, ClaudeSection)
//
// Live tools' CLAUDE (an addition): the header with its info key (what a beat
// card is, and how to give Claude the arc-beats skill), a card with SHARE
// SCENE, SHARE for the group shown (the shares dimmed, and still announced,
// when there is nothing to share), SHARE CHAIN · N SCENES when the project's
// chain has steps, the tick box "With my sound list" under them (when Arc
// knows sounds) and PASTE BEAT, and two links under it: the skill's zip, and a
// starter prompt to learn the EP-133 with Claude.
//
// Web deltas:
// - The state is read from [ClaudeContext] by the section itself.
// - SHARE uses the browser's share sheet, or copies the card where there is
//   none; "Learn with Claude" opens claude.ai with the prompt (a link, where
//   Android sends it to the Claude app).
// - PASTE BEAT where the page may not read the clipboard opens a box a paste
//   goes into ([ClaudeActions.pasting]); a paste anywhere on Live works too.
// - The tick box is a native checkbox (ChoiceRow), the row its label.
import { createContext, type JSX } from 'preact'
import { useContext, useId, useState } from 'preact/hooks'
import { ClaudeText } from '../../core/text/claudeText'
import { CoachText } from '../../core/text/coachText'
import { WebText } from '../../core/text/webText'
import { Caption } from '../components/Caption'
import { ChoiceRow } from '../components/ChoiceRow'
import { Key } from '../components/Key'
import { InfoKey, RowCard } from '../components/SettingRow'
import './ClaudeSection.css'

/** The CLAUDE section's state and what its keys do (Kotlin ClaudeUi), read as it renders. */
export interface ClaudeActions {
  /** The scene playing ("S02"). */
  readonly scene: string
  /** Each group's playing pattern number, A to D. */
  readonly numbers: readonly number[]
  /** Whether each group's playing pattern has notes. */
  readonly hasNotes: readonly boolean[]
  /** How many sounds Arc knows (0 hides "With my sound list"), and whether that tick box is on. */
  readonly sounds: number
  readonly withSounds: boolean
  /** The project's chain: its steps, over its scenes (no steps hides SHARE CHAIN). */
  readonly chainSteps: number
  readonly chainScenes: number
  onWithSounds(on: boolean): void
  onShareScene(): void
  onShareChain(): void
  onSharePattern(group: number): void
  onPaste(): void
  /** The link under PASTE BEAT: a .txt or .md file with Claude's card in it. */
  onOpenFile(): void
  /** Learn with Claude's link: claude.ai with the starter prompt. */
  readonly learnUrl: string
}

export const ClaudeContext = createContext<ClaudeActions | null>(null)

export function useClaude(): ClaudeActions | null {
  return useContext(ClaudeContext)
}

/** Live tools' CLAUDE for [group] (the group shown, as SHARE A · 01 names it). */
export function ClaudeSection(props: { group: number }): JSX.Element | null {
  const claude = useClaude()
  const [info, setInfo] = useState(false)
  const notesId = useId()
  const titleId = useId()
  if (claude === null) return null
  const g = Math.min(Math.max(props.group, 0), 3)
  const number = claude.numbers[g] ?? 1
  const patternEmpty = !(claude.hasNotes[g] ?? false)
  const sceneEmpty = !claude.hasNotes.some((h) => h)
  return (
    <section class="claude" aria-labelledby={titleId}>
      <div class="claude__head">
        <Caption text={ClaudeText.CLAUDE} align="start" as="h3" id={titleId} />
        <InfoKey open={info} onToggle={() => setInfo(!info)} controls={notesId} describedBy={titleId} />
      </div>
      {info && (
        <div id={notesId} class="claude__notes t-small">
          <p>{ClaudeText.INFO_CARDS}</p>
          <p>{ClaudeText.INFO_SKILL}</p>
        </div>
      )}
      <div
        class="grid-plate claude__card"
        data-coach="live.claude"
        data-coach-label={CoachText.CLAUDE}
        data-coach-face="var(--navy)"
        data-coach-ink="var(--on-navy)"
      >
        <p class="t-semi claude__title">{ClaudeText.BEAT_CARDS}</p>
        <p class="t-small claude__hint">{ClaudeText.BEAT_HINT}</p>
        <Key
          text={ClaudeText.shareScene(claude.scene)}
          size="small"
          block
          disabled={sceneEmpty}
          aria-label={ClaudeText.shareSceneName(claude.scene, sceneEmpty)}
          onClick={claude.onShareScene}
        />
        <Key
          text={ClaudeText.sharePattern(g, number)}
          size="small"
          block
          disabled={patternEmpty}
          aria-label={ClaudeText.sharePatternName(g, number, patternEmpty)}
          onClick={() => claude.onSharePattern(g)}
        />
        {claude.chainSteps > 0 && (
          <Key
            text={ClaudeText.shareChainKey(claude.chainScenes)}
            size="small"
            block
            aria-label={ClaudeText.shareChainName(claude.chainSteps)}
            onClick={claude.onShareChain}
          />
        )}
        {claude.sounds > 0 && (
          <ChoiceRow
            class="claude__tick"
            text={ClaudeText.withSoundList(claude.sounds)}
            selected={claude.withSounds}
            radio={false}
            onClick={() => claude.onWithSounds(!claude.withSounds)}
          />
        )}
        <Key text={ClaudeText.PASTE_BEAT} size="small" block variant="signal" aria-label={ClaudeText.PASTE_BEAT_NAME} onClick={claude.onPaste} />
        <Key text={ClaudeText.OPEN_CARD_FILE} size="small" block variant="quiet" onClick={claude.onOpenFile} />
      </div>
      {/* Links, not LinkRow's buttons: the zip downloads and claude.ai opens in a tab. */}
      <RowCard>
        <a class="setting-row link-row claude__link" href="/arc-beats-skill.zip" download>
          <span class="setting-row__line">
            <span class="setting-row__text">
              <span class="setting-row__title">{ClaudeText.GET_SKILL}</span>
            </span>
          </span>
        </a>
      </RowCard>
      <RowCard>
        <a class="setting-row link-row claude__link" href={claude.learnUrl} target="_blank" rel="noopener">
          <span class="setting-row__line">
            <span class="setting-row__text">
              <span class="setting-row__title">{ClaudeText.LEARN}</span>
            </span>
          </span>
        </a>
      </RowCard>
    </section>
  )
}

/** Learn with Claude's link: claude.ai's new chat with the starter prompt. */
export function learnUrl(): string {
  return `https://claude.ai/new?q=${encodeURIComponent(WebText.LEARN_PROMPT)}`
}
