// Port of app/src/main/kotlin/dev/arc/ep133/controller/BeatPlan.kt (promptShare)
//
// The Claude page's prompt builder as the controller works it (an addition):
// what SHARE sends for a prompt that goes without a card.
//
// Web delta: kept apart from beatPlan.ts, with the prompt builder's core
// (claudePrompt.ts, promptText.ts) re-exported, so the genres and the words
// stay out of the first load: the controller and the Claude page's deck fetch
// this as a chunk of its own (ArcController.prompts, ClaudeSection's lazy deck).

import { BeatCards } from '../core/features/beatCard'
import type { FactoryKit } from '../core/features/factorySounds'
import { ClaudeText } from '../core/text/claudeText'
import { PromptText } from '../core/text/promptText'
import type { BeatShare, SoundSet } from './beatPlan'

export { ClaudePrompt, PromptTask, SavedPrompt, SharePick } from '../core/features/claudePrompt'
export { PromptText } from '../core/text/promptText'

/**
 * A prompt that goes without a card (a new beat, a track from scratch, a lesson), named [what] in the subject: the
 * [prompt], the [kit] when it isn't the EP-133's (ClaudeText.kitLine) and, with a [list], the sounds Arc knows after a
 * blank line.
 */
export function promptShare(what: string, prompt: string, kit: FactoryKit | null, list: SoundSet | null = null): BeatShare {
  const line = kit !== null ? ClaudeText.kitLine(kit) : null
  const text = prompt + (line !== null ? `\n\n${line}` : '') + '\n'
  return { subject: PromptText.subject(what), text: list === null ? text : text + '\n' + BeatCards.soundList(list.source, list.names) }
}
