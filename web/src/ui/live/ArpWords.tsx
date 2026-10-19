// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/LiveArp.kt
//
// The arp and note repeat on Live (an addition: the device's TIMING + pads):
// ARP (RPT in PADS) and LATCH, and the notes held for it, outlined on the
// keys and numbered in the order pressed, or ringed on the pads.
//
// Web deltas:
// - One form of the switches: ARP and LATCH as words after the mode word, each
//   after its LED (Kotlin's ArpRowWords, over the piano), in the row under
//   the grid and over the piano alike. Android's upright switches on the
//   pads' plate (ArpStripSwitches) have no plate here to sit on.
// - The state is read from a context ([ArpContext]) by the parts that show it,
//   so a note held re-renders only the words, keys and pads it marks.
import { createContext, type JSX } from 'preact'
import { useContext, useRef } from 'preact/hooks'
import { useComputed } from '@preact/signals'
import { Keys } from '../../core/features/keys'
import type { PhysicalPad } from '../../core/features/padNotes'
import { CoachText } from '../../core/text/coachText'
import { MirrorText } from '../../core/text/mirrorText'
import type { ArpUi } from '../../state/arpPlan'
import { useFingerTick } from '../useHaptic'
import './ArpWords.css'

/** The arp on Live (Kotlin LiveArp): its state, read as it renders, and ARP / LATCH switched. */
export interface ArpActions {
  readonly ui: ArpUi
  onOn(on: boolean): void
  onLatch(on: boolean): void
}

export const ArpContext = createContext<ArpActions | null>(null)

export function useArp(): ArpActions | null {
  return useContext(ArpContext)
}

/** The display line while the arp plays ("ARP · 1/16 · DO FA LA"), else null (read by the line itself). */
export function useArpLine(): string | null {
  const a = useArp()
  return useComputed(() => a?.ui.line ?? null).value
}

/** The KEYS notes held for the arp (MIDI), in the order pressed: outlined on the keys, numbered. */
export function arpHeldNotes(ui: ArpUi): number[] {
  if (!ui.on || !ui.keys) return []
  const out: number[] = []
  for (const n of ui.held) {
    if (n.semitones === null) continue
    const m = Keys.ROOT_NOTE + n.semitones
    if (!out.includes(m)) out.push(m)
  }
  return out
}

/** Whether [pad] is held for note repeat: ringed. */
export function arpHeldPad(ui: ArpUi, pad: PhysicalPad): boolean {
  return ui.on && !ui.keys && ui.held.some((n) => n.semitones === null && n.pad.group === pad.group && n.pad.offset === pad.offset)
}

/** [pad] held for note repeat (read by the pad itself). */
export function useArpPad(pad: PhysicalPad): boolean {
  const a = useArp()
  const at = useRef(pad)
  at.current = pad
  return useComputed(() => a !== null && arpHeldPad(a.ui, at.current)).value
}

/** Where MIDI [note] is in the arp's notes held (1, 2, …), 0 when it isn't held (read by the key itself). */
export function useArpNote(note: number): number {
  const a = useArp()
  const at = useRef(note)
  at.current = note
  return useComputed(() => (a === null ? 0 : arpHeldNotes(a.ui).indexOf(at.current) + 1)).value
}

/**
 * ARP (RPT in PADS: [repeat]) and LATCH, each word after its LED, lit
 * while on, as the view words are; LATCH greyed out while ARP is off.
 * [top]: the words at the top of their touch area, as the mode word in a
 * row hugging the grid above.
 */
export function ArpWords(props: { repeat: boolean; top?: boolean; strip?: boolean }): JSX.Element | null {
  const a = useArp()
  // ARP and LATCH tick under a finger (Kotlin ArpSwitch's KeyboardTap).
  const feel = useFingerTick()
  if (a === null) return null
  const ui = a.ui
  const { repeat } = props
  return (
    <span
      class={`arp-words${props.top ? ' arp-words--top' : ''}${props.strip ? ' arp-words--strip' : ''}`}
      onPointerDownCapture={feel}
      data-coach="live.arp"
      data-coach-label={CoachText.ARP}
      data-coach-face="var(--navy)"
      data-coach-ink="var(--on-navy)"
    >
      <ArpWord
        word={repeat ? MirrorText.RPT : MirrorText.ARP}
        name={repeat ? MirrorText.RPT_NAME : MirrorText.ARP_NAME}
        on={ui.on}
        enabled
        onToggle={a.onOn}
      />
      <ArpWord
        word={MirrorText.LATCH}
        name={MirrorText.LATCH}
        on={ui.on && ui.latch}
        enabled={ui.on}
        note={ui.on ? undefined : MirrorText.arpFirst(repeat)}
        onToggle={a.onLatch}
      />
    </span>
  )
}

/** One of [ArpWords]: its LED, lit while [on], and the word, 44 high to touch. */
function ArpWord(props: { word: string; name: string; on: boolean; enabled: boolean; note?: string; onToggle: (on: boolean) => void }): JSX.Element {
  const { word, name, on, enabled } = props
  return (
    <button
      type="button"
      role="switch"
      class={`arp-word${on ? ' is-on' : ''}`}
      aria-checked={on}
      aria-label={name}
      aria-description={props.note}
      aria-disabled={!enabled}
      onClick={() => {
        if (enabled) props.onToggle(!on)
      }}
    >
      <span class="arp-word__led" aria-hidden="true" />
      <span class="arp-word__text">{word}</span>
    </button>
  )
}
