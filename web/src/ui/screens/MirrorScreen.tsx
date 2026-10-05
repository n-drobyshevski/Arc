// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/MirrorScreen.kt
//
// A live mirror of the EP-133 (an addition to the web version): the four
// groups' pads light as the device plays them, with the sample on each once
// it is known, plus play state, tempo and KEYS notes. It only listens.
//
// Pads are drawn as the pocket operator app draws its pad grid: one pale
// plate split by thin lines. A lit pad turns the signal orange, brighter with
// velocity, and fades on release.
//
// Web deltas:
// - The glow is a CSS custom property (--glow, 0..1) on each pad, group
//   caption and group key; the colours are color-mix()es of it in Oklab (as
//   Compose's lerp). Renders set it (at most ~30 a second: the controller
//   publishes a mirror state every 33 ms at most, and only when it changed),
//   and while a released pad is fading a requestAnimationFrame loop updates it
//   in the DOM without rendering (Kotlin's withFrameNanos loop), stopping once
//   the fade is over.
// - The tools side panel is a navigation layer (overlay 'side'), so Back closes
//   it: [toolsOpen] / [onTools] replace Kotlin's rememberSaveable toolsOpen
//   (and initialToolsOpen). The Live tab has no BackHandler of its own; a Back
//   key, when given, is the CloseKey only.
// - The four-or-two groups per row is a container query (BoxWithConstraints).
import { Fragment, type JSX } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { MirrorState, PadLight } from '../../core/features/liveMirror'
import { PadOrder } from '../../core/features/padPush'
import { ROWS, noteName, padKey, physicalPad, type PhysicalPad } from '../../core/features/padNotes'
import { CLOSE as GUIDE_CLOSE } from '../../core/text/guideText'
import { MirrorText } from '../../core/text/mirrorText'
import { emptyMirrorState, type MirrorUi } from '../../state/types'
import { Caption } from '../components/Caption'
import { DisplayPanel } from '../components/DisplayPanel'
import { GridPlate, PlateLine } from '../components/GridPlate'
import { CloseKey } from '../components/GuideKeys'
import { Key } from '../components/Key'
import { handleRovingKey } from '../components/Segmented'
import { SideZone } from '../components/SideZone'
import { SwitchRow } from '../components/SwitchRow'
import { TextToggle } from '../components/TextToggle'
import {
  displayLine,
  fading,
  glow,
  glowCss,
  groupGlow,
  keysLayout,
  showNoPushes,
  transportText,
} from '../live/glow'
import './MirrorScreen.css'

export interface MirrorScreenProps {
  mirror: MirrorUi | null
  nameOf: (pad: PhysicalPad) => string | null
  onPadOrder: (order: PadOrder) => void
  /** Null on the Live tab, which has no close key. */
  onBack?: (() => void) | null
  /** A fixed time for screenshots; normally the frame clock drives the fade. */
  fixedNow?: number | null
  /** One group at a time, large, with A–D keys to switch (like the pocket operator app's grid). */
  oneGroup: boolean
  onOneGroup: (on: boolean) => void
  /** In that view, switch to the group of the pad just played. */
  follow: boolean
  onFollow: (on: boolean) => void
  initialGroup?: number
  /** The tools side panel (a navigation layer). */
  toolsOpen: boolean
  onTools: (open: boolean) => void
}

/** The MIDI event clock the mirror's times are on (MIDIMessageEvent.timeStamp). */
const perfNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Writes every pad's and group's glow at [now] straight into the DOM (the frame loop's step). */
function applyGlow(root: HTMLElement, pads: ReadonlyMap<number, PadLight>, now: number): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-pad]')) {
    const l = pads.get(Number(el.dataset.pad))
    el.style.setProperty('--glow', glowCss(l ? glow(l, now) : 0))
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-group]')) {
    el.style.setProperty('--glow', glowCss(groupGlow(pads, Number(el.dataset.group), now)))
  }
}

export function MirrorScreen(props: MirrorScreenProps): JSX.Element {
  const { mirror, nameOf, onPadOrder, onBack = null, fixedNow = null, oneGroup, follow } = props
  const st = mirror?.state ?? emptyMirrorState()
  const root = useRef<HTMLDivElement | null>(null)
  const now = fixedNow ?? perfNow()

  // The fade runs on the frame clock while a released pad is fading, and stops after.
  // Each render writes the glow too, so the DOM never keeps a value from a stopped loop.
  const pads = st.pads
  useLayoutEffect(() => {
    if (fixedNow === null && root.current) applyGlow(root.current, pads, perfNow())
  })
  useEffect(() => {
    if (fixedNow !== null || typeof requestAnimationFrame === 'undefined') return
    let raf = 0
    const frame = (): void => {
      const t = perfNow()
      if (root.current) applyGlow(root.current, pads, t)
      raf = fading(pads, t) ? requestAnimationFrame(frame) : 0
    }
    if (fading(pads, perfNow())) raf = requestAnimationFrame(frame)
    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [pads, fixedNow])

  // The group shown in the one-group view; Follow switches it to the group just played.
  const [group, setGroup] = useState(props.initialGroup ?? 0)
  const hitGroup = st.lastHit?.pad?.group ?? null
  useEffect(() => {
    if (oneGroup && follow && hitGroup !== null) setGroup(hitGroup)
  }, [hitGroup, st.lastHit, follow, oneGroup])

  const panel = (
    <>
      <Caption text={MirrorText.VIEW} align="start" />
      <TextToggle
        class="live-tools__view"
        options={[MirrorText.ALL_GROUPS, MirrorText.ONE_GROUP]}
        selected={oneGroup ? 1 : 0}
        onSelect={(i) => props.onOneGroup(i === 1)}
        label={MirrorText.VIEW}
      />
      {oneGroup && (
        <GridPlate>
          <SwitchRow title={MirrorText.FOLLOW} note={MirrorText.FOLLOW_NOTE} on={follow} onChange={props.onFollow} />
        </GridPlate>
      )}
      {st.lastKeysNote !== null && <KeysStrip st={st} last={st.lastKeysNote} />}
      <Notes st={st} mirror={mirror} onPadOrder={onPadOrder} />
    </>
  )

  return (
    <div ref={root} class="live" data-screen="live">
      <SideZone
        open={props.toolsOpen}
        onOpen={() => props.onTools(true)}
        onClose={() => props.onTools(false)}
        title={MirrorText.TOOLS}
        panel={panel}
      >
        {oneGroup ? (
          // One group fills the screen without scrolling: the display line, the grid
          // (its rows share whatever height is left) and the group keys.
          <div class="live__one">
            {onBack && (
              <div class="live__head">
                <Caption text={MirrorText.TITLE} />
                <CloseKey class="live__close" onClick={onBack} description={GUIDE_CLOSE} />
              </div>
            )}
            <DisplayStrip st={st} mirror={mirror} />
            <Group group={group} st={st} nameOf={nameOf} now={now} big coach />
            <GroupKeys group={group} st={st} now={now} onSelect={setGroup} />
          </div>
        ) : (
          <div class="live__all">
            <div class="live__head">
              <Caption text={MirrorText.TITLE} as="h1" />
              {onBack && <CloseKey class="live__close" onClick={onBack} description={GUIDE_CLOSE} />}
            </div>
            <Display st={st} mirror={mirror} />
            {/* Four groups in a row when there is room, two by two on a phone. */}
            <div class="live__groups">
              <div class="live__grid">
                {[0, 1, 2, 3].map((g) => (
                  <Group key={g} group={g} st={st} nameOf={nameOf} now={now} />
                ))}
              </div>
            </div>
          </div>
        )}
      </SideZone>
    </div>
  )
}

/**
 * The one-group view's display as a single dark line: play state, tempo and
 * project on the left, the pad just played on the right.
 */
function DisplayStrip(props: { st: MirrorState; mirror: MirrorUi | null }): JSX.Element {
  const { st } = props
  return (
    <div class="live-strip" aria-live="polite">
      {st.playing === true && <span class="live-strip__sub live-strip__ink" role="img" aria-label={MirrorText.PLAYING}>{'▶'}</span>}
      {st.playing === false && <span class="live-strip__sub live-strip__dim" role="img" aria-label={MirrorText.STOPPED}>{'■'}</span>}
      {st.bpm !== null && <span class="live-strip__sub live-strip__ink">{MirrorText.bpm(st.bpm)}</span>}
      {st.activeProject !== null && (
        <span class="live-strip__sub live-strip__dim">{MirrorText.projectShort(st.activeProject)}</span>
      )}
      <span class="live-strip__line">{displayLine(st, props.mirror)}</span>
    </div>
  )
}

function Display(props: { st: MirrorState; mirror: MirrorUi | null }): JSX.Element {
  const { st } = props
  return (
    <DisplayPanel class="live-display">
      <div class="live-display__row">
        <span class="live-display__transport t-display-head">{transportText(st.playing)}</span>
        {st.bpm !== null && <span class="t-display-sub live-display__ink">{MirrorText.bpm(st.bpm)}</span>}
        {st.activeProject !== null && (
          <span class="t-display-sub live-display__dim">{MirrorText.project(st.activeProject)}</span>
        )}
      </div>
      <p class="live-display__line t-stat-free">{displayLine(st, props.mirror)}</p>
      {/* The all-groups view explains clock out. */}
      {st.playing === null && st.bpm === null && (
        <p class="live-display__hint t-display-hint">{MirrorText.NO_TRANSPORT}</p>
      )}
    </DisplayPanel>
  )
}

interface GroupProps {
  group: number
  st: MirrorState
  nameOf: (pad: PhysicalPad) => string | null
  now: number
  big?: boolean
  /** The guide overlay's "pads light as you play" tag (the big grid only). */
  coach?: boolean
}

function Group(props: GroupProps): JSX.Element {
  const { group, st, nameOf, now, big = false } = props
  const letter = MirrorText.groupKey(group)
  return (
    <div class={`live-group${big ? ' live-group--big' : ''}`} data-coach={props.coach ? 'live.pads' : undefined}>
      {/* The caption turns orange while one of the group's pads sounds (the big grid's
          group shows on its key below instead). */}
      {!big && (
        <div class="live-group__caption" data-group={group} style={{ '--glow': glowCss(groupGlow(st.pads, group, now)) }}>
          <Caption text={`${MirrorText.GROUP} ${letter}`} as="h2" color="var(--live-caption)" />
        </div>
      )}
      <GridPlate class="live-group__plate" role="group" aria-label={`${MirrorText.GROUP} ${letter}`}>
        {ROWS.map((offsets, r) => (
          <Fragment key={r}>
            {r > 0 && <PlateLine />}
            <div class="live-group__row">
              {offsets.map((o, i) => {
                const pad = physicalPad(group, o)
                return (
                  <Fragment key={o}>
                    {i > 0 && <div class="live-group__divider" aria-hidden="true" />}
                    <Pad pad={pad} light={st.pads.get(padKey(pad))} name={nameOf(pad)} now={now} big={big} />
                  </Fragment>
                )
              })}
            </div>
          </Fragment>
        ))}
      </GridPlate>
    </div>
  )
}

/**
 * The group keys under the single grid: navy for the group shown, lit orange
 * while one of a group's pads sounds.
 */
function GroupKeys(props: { group: number; st: MirrorState; now: number; onSelect: (g: number) => void }): JSX.Element {
  const { group, st, now, onSelect } = props
  const row = useRef<HTMLDivElement | null>(null)
  return (
    <div
      ref={row}
      class="live-keys"
      role="tablist"
      aria-label={MirrorText.GROUP}
      onKeyDown={(e) => handleRovingKey(e, group, 4, row.current, onSelect)}
    >
      {[0, 1, 2, 3].map((g) => {
        const on = g === group
        return (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={`${MirrorText.GROUP} ${MirrorText.groupKey(g)}`}
            tabIndex={on ? 0 : -1}
            data-roving=""
            data-group={g}
            data-coach={g === 0 ? 'live.groups' : undefined}
            class={`live-keys__key${on ? ' is-on' : ''}`}
            style={{ '--glow': glowCss(groupGlow(st.pads, g, now)) }}
            onClick={() => onSelect(g)}
          >
            {MirrorText.groupKey(g)}
          </button>
        )
      })}
    </div>
  )
}

function Pad(props: { pad: PhysicalPad; light: PadLight | undefined; name: string | null; now: number; big: boolean }): JSX.Element {
  const { pad, light, name, big } = props
  const g = light ? glow(light, props.now) : 0
  const wide = pad.label.length > 1
  return (
    <div
      class={`live-pad${big ? ' live-pad--big' : ''}`}
      role="img"
      aria-label={`${pad.groupLetter} ${pad.label}` + (name !== null ? `, ${name}` : '')}
      data-pad={padKey(pad)}
      style={{ '--glow': glowCss(g) }}
    >
      {name !== null && <span class="live-pad__name">{name}</span>}
      {/* The key's own label in the corner, like the pocket operator app's pad numbers. */}
      <span class={`live-pad__label${wide ? ' live-pad__label--wide' : ''}`}>{pad.label}</span>
    </div>
  )
}

/** Two octaves around the last note outside the pads, with held notes lit. */
function KeysStrip(props: { st: MirrorState; last: number }): JSX.Element {
  const { st, last } = props
  const ch = st.keysHeld.get(last)
  return (
    <div class="live-tools__keys">
      <p class="t-small live-tools__note">
        {MirrorText.KEYS + ' · ' + noteName(last) + (ch !== undefined ? ' · ' + MirrorText.channel(ch) : '')}
      </p>
      <div class="keys-strip" role="img" aria-label={MirrorText.KEYS + ' ' + noteName(last)}>
        {keysLayout(last).map((k) => (
          <span
            key={k.note}
            class={`keys-strip__key${k.black ? ' keys-strip__key--black' : ''}${st.keysHeld.has(k.note) ? ' is-on' : ''}`}
            style={{ left: `${k.x * 100}%`, width: `${k.w * 100}%` }}
          />
        ))}
      </div>
    </div>
  )
}

function Notes(props: { st: MirrorState; mirror: MirrorUi | null; onPadOrder: (order: PadOrder) => void }): JSX.Element {
  const { st, mirror, onPadOrder } = props
  const orders: readonly [PadOrder, string][] = [
    [PadOrder.FROM_TOP, MirrorText.FROM_TOP],
    [PadOrder.FROM_BOTTOM, MirrorText.FROM_BOTTOM],
  ]
  return (
    <div class="live-tools__notes">
      {st.padOrder === PadOrder.FROM_TOP && (
        <>
          <p class="t-small live-tools__note">{MirrorText.LEARN_NOTE}</p>
          {showNoPushes(st, mirror) && <p class="t-small live-tools__note">{MirrorText.NO_PUSHES}</p>}
        </>
      )}
      <Caption text={MirrorText.PAD_ORDER} align="start" as="h3" class="live-tools__order-caption" />
      <div class="live-tools__orders" role="group" aria-label={MirrorText.PAD_ORDER}>
        {orders.map(([order, label]) => (
          <Key
            key={order}
            text={label}
            size="small"
            variant={st.padOrder === order ? 'navy' : 'normal'}
            aria-pressed={st.padOrder === order}
            onClick={() => onPadOrder(order)}
          />
        ))}
      </div>
      <p class="t-small live-tools__note">{MirrorText.ORDER_NOTE}</p>
      <p class="t-small live-tools__note">{MirrorText.COMMUNITY_NOTE}</p>
      <p class="t-small live-tools__note">{MirrorText.LISTEN_ONLY}</p>
    </div>
  )
}
