// Port of ClaudeDeck.kt (ClaudeDeck, ClaudeGlass, LightsRow), LiveClaude.kt's
// ClaudeUi and LiveTools.kt's ClaudePage (app/src/main/kotlin/dev/arc/ep133/ui/screens/)
//
// Live tools' Claude page as the device's display (an addition): the glass
// shows what SHARE sends (the scene's four groups as step lights, the shown
// group's pattern as one row, or the chain's scenes and steps), or, while a
// reply is awaited, what went and to paste the reply. Under it the strip
// (DeckKeys.tsx): SCENE, the pattern (A · 01) and CHAIN pick what goes (lit
// navy; one with nothing to share is faded, CHAIN only with a chain), SOUNDS
// switches the sound list on (its light orange), SHARE sends the pick and
// PASTE brings a card in (held, it opens a .txt or .md card file). The two
// links follow, and what a beat card is folded at the foot.
//
// This is the glass as it was before the prompt builder (ClaudeDeck.kt at
// dc0e48e); NEW / IMPROVE / TRACK / PLAY / LEARN, EDIT, COPY and the saved
// prompts come with the builder's port.
//
// Web deltas:
// - The state is read from [ClaudeContext] by the section itself.
// - Live tools are one page here, not pages: the section keeps its CLAUDE
//   caption over the glass.
// - SHARE uses the browser's share sheet, or copies the card where there is
//   none; "Learn with Claude" opens claude.ai with the prompt (a link, where
//   Android sends it to the Claude app).
// - PASTE where the page may not read the clipboard opens a box a paste goes
//   into (the beat sheet's); a paste anywhere on Live works too.
// - The glass waits only for a share that went: a share sheet called off
//   doesn't (Android can't tell, once its chooser opened); a card copied
//   where there is no share sheet does.
// - PASTE's hold is a second (a pointer, or Enter or Space), and "Open a card
//   file" stays as a link under the strip, so the file is a tap away too.
import { createContext, type JSX } from 'preact'
import { useContext, useId, useState } from 'preact/hooks'
import type { Weight } from '../../state/beatPlan'
import { NO_LIGHTS } from '../../state/scenePlan'
import { ClaudeText } from '../../core/text/claudeText'
import { CoachText } from '../../core/text/coachText'
import { WebText } from '../../core/text/webText'
import { Caption } from '../components/Caption'
import { Key } from '../components/Key'
import { Disclosure, RowCard } from '../components/SettingRow'
import { DeckKey, DeckStrip } from './DeckKeys'
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
  /** What was shared to Claude and not yet answered ("Scene S02", "A · 01", "Chain"); null when no reply is awaited. */
  readonly waiting: string | null
  onWithSounds(on: boolean): void
  onShareScene(): void
  onShareChain(): void
  onSharePattern(group: number): void
  onPaste(): void
  /** PASTE held, or the link under the strip: a .txt or .md file with Claude's card in it. */
  onOpenFile(): void
  /** The glass's STOP: stop waiting. */
  onDismissWaiting(): void
  /** Learn with Claude's link: claude.ai with the starter prompt. */
  readonly learnUrl: string
}

export const ClaudeContext = createContext<ClaudeActions | null>(null)

export function useClaude(): ClaudeActions | null {
  return useContext(ClaudeContext)
}

/** What SHARE sends: the scene playing, the shown group's pattern, or the chain. */
type Pick = 'SCENE' | 'PATTERN' | 'CHAIN'

/** Live tools' CLAUDE for [group] (the group shown, as the pattern's key names it). */
export function ClaudeSection(props: { group: number }): JSX.Element | null {
  const claude = useClaude()
  const [picked, setPicked] = useState<Pick>('SCENE')
  const titleId = useId()
  const hintId = useId()
  if (claude === null) return null
  const g = Math.min(Math.max(props.group, 0), 3)
  const number = claude.numbers[g] ?? 1
  const patternEmpty = !(claude.hasNotes[g] ?? false)
  const sceneEmpty = !claude.hasNotes.some((h) => h)
  const hasChain = claude.chainSteps > 0
  // A pick with nothing to share gives way to one that has something (the chain first), else stays.
  const has: Record<Pick, boolean> = { SCENE: !sceneEmpty, PATTERN: !patternEmpty, CHAIN: hasChain }
  const pick = has[picked] ? picked : ((['CHAIN', 'SCENE', 'PATTERN'] as const).find((p) => has[p]) ?? picked)
  const empty = !has[pick]
  const soundsOn = claude.withSounds && claude.sounds > 0
  const keys = [
    <DeckKey
      key="scene"
      glyph="scene"
      label={ClaudeText.KEY_SCENE}
      description={ClaudeText.pickScene(claude.scene, sceneEmpty)}
      onClick={() => setPicked('SCENE')}
      style={pick === 'SCENE' ? 'navy' : 'normal'}
      enabled={!sceneEmpty}
      selected={pick === 'SCENE'}
    />,
    <DeckKey
      key="pattern"
      glyph="pattern"
      label={ClaudeText.place(g, number)}
      description={ClaudeText.pickPattern(g, number, patternEmpty)}
      onClick={() => setPicked('PATTERN')}
      style={pick === 'PATTERN' ? 'navy' : 'normal'}
      enabled={!patternEmpty}
      selected={pick === 'PATTERN'}
    />,
    <DeckKey
      key="chain"
      glyph="chain"
      label={ClaudeText.KEY_CHAIN}
      description={hasChain ? ClaudeText.pickChain(claude.chainScenes) : ClaudeText.NO_CHAIN_TO_SHARE}
      onClick={() => setPicked('CHAIN')}
      style={pick === 'CHAIN' ? 'navy' : 'normal'}
      enabled={hasChain}
      selected={pick === 'CHAIN'}
    />,
    <DeckKey
      key="sounds"
      glyph="dot"
      label={ClaudeText.KEY_SOUNDS}
      description={ClaudeText.withSoundList(claude.sounds)}
      onClick={() => claude.onWithSounds(!claude.withSounds)}
      enabled={claude.sounds > 0}
      glyphColor={soundsOn ? 'var(--signal)' : 'var(--key-edge)'}
      checked={soundsOn}
    />,
    <DeckKey
      key="share"
      glyph="share"
      label={ClaudeText.KEY_SHARE}
      description={
        pick === 'SCENE'
          ? ClaudeText.shareSceneName(claude.scene, sceneEmpty)
          : pick === 'PATTERN'
            ? ClaudeText.sharePatternName(g, number, patternEmpty)
            : ClaudeText.shareChainName(claude.chainSteps)
      }
      onClick={() => {
        if (pick === 'SCENE') claude.onShareScene()
        else if (pick === 'PATTERN') claude.onSharePattern(g)
        else claude.onShareChain()
      }}
      enabled={!empty}
    />,
    // Held, PASTE opens a card file instead (a .txt or .md Claude gave as a file).
    <DeckKey
      key="paste"
      glyph="paste"
      label={ClaudeText.KEY_PASTE}
      description={ClaudeText.PASTE_BEAT_NAME}
      onClick={claude.onPaste}
      style="signal"
      onHold={claude.onOpenFile}
      describedBy={hintId}
    />,
  ]
  return (
    <section class="claude" aria-labelledby={titleId}>
      <Caption text={ClaudeText.CLAUDE} align="start" as="h3" id={titleId} />
      <ClaudeGlass claude={claude} g={g} number={number} pick={pick} empty={empty} />
      <p id={hintId} class="t-tiny claude__hint">
        {ClaudeText.PICK_HINT}
      </p>
      <DeckStrip keys={keys} />
      <Key text={ClaudeText.OPEN_CARD_FILE} size="small" block variant="quiet" onClick={claude.onOpenFile} />
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
      <Disclosure title={ClaudeText.ABOUT_CARDS}>
        <p>{ClaudeText.INFO_CARDS}</p>
        <p>{ClaudeText.INFO_SKILL}</p>
      </Disclosure>
    </section>
  )
}

/**
 * The glass: its head (ready and the sounds the share lists, or a reply
 * awaited with STOP, which stops waiting), what goes large ("Scene S02",
 * "A · 01", "Chain"; "Sent Scene S02" while waiting), its preview and, while
 * waiting, to copy Claude's reply and press PASTE.
 */
function ClaudeGlass(props: { claude: ClaudeActions; g: number; number: number; pick: Pick; empty: boolean }): JSX.Element {
  const { claude, g, pick, empty } = props
  const waiting = claude.waiting
  const title = pick === 'SCENE' ? ClaudeText.sceneTitle(claude.scene) : pick === 'PATTERN' ? ClaudeText.place(g, props.number) : ClaudeText.CHAIN
  return (
    <div
      class="claude-glass"
      data-coach="live.claude"
      data-coach-label={CoachText.CLAUDE}
      data-coach-face="var(--navy)"
      data-coach-ink="var(--on-navy)"
    >
      <div class="claude-glass__head">
        {waiting === null ? (
          <>
            <span class="claude-glass__sub claude-glass__grow">{ClaudeText.READY}</span>
            {claude.withSounds && claude.sounds > 0 && <span class="claude-glass__sub">{`${ClaudeText.KEY_SOUNDS} \u00B7 ${claude.sounds}`}</span>}
          </>
        ) : (
          <>
            <span class="claude-glass__sub claude-glass__grow is-signal">{`\u25CF ${ClaudeText.WAITING}`}</span>
            <button type="button" class="claude-glass__sub claude-glass__stop" aria-label={ClaudeText.STOP_WAITING} onClick={claude.onDismissWaiting}>
              {`${ClaudeText.STOP}  \u00D7`}
            </button>
          </>
        )}
      </div>
      <p class={`claude-glass__title${empty && waiting === null ? ' is-dim' : ''}`}>{waiting !== null ? ClaudeText.sent(waiting) : title}</p>
      {empty ? (
        <p class="claude-glass__sub">{pick === 'SCENE' ? ClaudeText.SCENE_EMPTY : ClaudeText.PATTERN_EMPTY}</p>
      ) : pick === 'CHAIN' ? (
        <p class="claude-glass__sub">{ClaudeText.chainLine(claude.chainScenes, claude.chainSteps)}</p>
      ) : pick === 'PATTERN' ? (
        <LightsRow group={g} lights={claude.lights[g] ?? NO_LIGHTS} />
      ) : (
        <div class="claude-glass__rows">
          {[0, 1, 2, 3].map((row) => (
            <LightsRow key={row} group={row} lights={claude.lights[row] ?? NO_LIGHTS} />
          ))}
        </div>
      )}
      {waiting !== null && <p class="claude-glass__sub claude-glass__paste">{ClaudeText.COPY_THEN_PASTE}</p>}
    </div>
  )
}

/** A group's first bar as 16 lights after its letter: ghost notes dim, normal ones lit, accents orange. */
function LightsRow(props: { group: number; lights: readonly (Weight | null)[] }): JSX.Element {
  return (
    <div class="claude-lights" aria-hidden="true">
      <span class="claude-lights__letter">{String.fromCharCode(65 + props.group)}</span>
      {props.lights.map((w, i) => (
        // A wider gap between beats, as the device's lights are grouped.
        <span key={i} class={`claude-lights__step${i > 0 && i % 4 === 0 ? ' is-beat' : ''}${w === null ? '' : ` is-${w.toLowerCase()}`}`} />
      ))}
    </div>
  )
}

/** Learn with Claude's link: claude.ai's new chat with the starter prompt. */
export function learnUrl(): string {
  return `https://claude.ai/new?q=${encodeURIComponent(WebText.LEARN_PROMPT)}`
}
