// Port of app/src/main/kotlin/dev/arc/ep133/ui/components/Tour.kt (TourCard, tourMode)
//
// "Try arc"'s step cards, drawn by the guide overlay in tour mode (Coach.tsx)
// over the real Live screen. Which step shows and when it counts as done is
// core/features/tour.ts; this is only what each card says and which keys it
// has. Every card has × (Not now). The Pad and Hear cards are compact (a
// heading row with their keys and one short line) so the pads stay in view.
//
// Without the EP-133 (Welcome's second key, or Needs MIDI's Next) the cards
// are More tools, EP-133 shortcuts and Backups, "Step n of 3", each with
// Open it and Skip; the overlay steps aside while what they point at is open
// (app.tsx). While the EP-133 is connected they offer Try the pads, and the
// offline Done offers Connect and try the pads where there is MIDI.
//
// Web deltas:
// - The Welcome and Needs MIDI cards add "Try the demo" (WebText.TOUR_TRY_DEMO,
//   a new tab with ?demo), except in the demo itself.
// - Restore uses WebText.RESTORE_HINT / RESTORE_FOLDER (no Documents/arc).
// - Connect adds what the browser says about MIDI: WebText.TOUR_MIDI_ASK
//   before it has asked, MIDI_DENIED once refused, OTHER_TAB when another tab
//   holds the EP-133; the "plugged in" row hides until MIDI access is given.
// - Backup says "in this browser" (WebText.TOUR_BACKUP_HINT) and KEEP_TAB_OPEN.
// - Pad in ?demo says WebText.TOUR_DEMO_PAD (the demo presses a pad itself).
import type { JSX } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { Tour, TourStep, type TourProgress, type TourSession } from '../../core/features/tour'
import { MirrorText } from '../../core/text/mirrorText'
import { Strings } from '../../core/text/strings'
import { TourText } from '../../core/text/tourText'
import { WebText } from '../../core/text/webText'
import type { UiState } from '../../state/types'
import type { CoachMode, TourCardSlot } from './Coach'
import { DisplayPanel } from './DisplayPanel'
import { Key } from './Key'
import './Tour.css'

/** The overlay's mode for a step (Kotlin tourMode). */
export function tourMode(step: TourStep): CoachMode {
  if (step === TourStep.DONE) return { only: Tour.DONE_TAGS }
  const spotlight = Tour.target(step) ?? undefined
  return { spotlight, passThrough: Tour.passThrough(step) }
}

/** The cards that sit compact over the A-D keys (the pads stay in view). */
export function isCompact(step: TourStep): boolean {
  return step === TourStep.PAD || step === TourStep.HEAR
}

/** What the cards read of the app's state. */
export type TourCardState = Pick<UiState, 'midiSupported' | 'midiPermission' | 'plugged' | 'connected' | 'device' | 'busy' | 'connectNote'>

export interface TourActions {
  /** Start or Continue. */
  start(): void
  /** ×, Not now, and Done: finishTour. */
  finish(): void
  /** Skip, Later, First time here, the Needs MIDI card's Next. */
  skip(): void
  /** Next on the ticked Connect card. */
  next(): void
  connect(): void
  restore(): void
  tryDemo(): void
  playIt(): void
  backup(): void
  /** "Without the EP-133" on the welcome card (Tour.goOffline). */
  offline(): void
  /** Open it on an offline card: Live tools, the guide, Backups. */
  open(): void
  /** "Try the pads": on to the device's steps (Tour.goDevice). */
  tryPads(): void
  /** "Connect and try the pads" on the offline Done: goDevice, then connect. */
  connectNow(): void
}

export interface TourCardProps extends TourCardSlot {
  step: TourStep
  session: TourSession
  progress: TourProgress
  state: TourCardState
  /** ?demo (no Try the demo; the Pad card says the demo presses a pad). */
  demo: boolean
  /** The id the dialog's aria-describedby names (the step's heading). */
  headingId: string
  actions: TourActions
}

/** Connected, and the device has been read (TourSnapshot.connected). */
const ready = (s: TourCardState): boolean => s.connected && s.device !== null

/** The offline path's cards, with their heading and hint. */
const OFFLINE_CARDS: Partial<Record<TourStep, { head: string; hint: string }>> = {
  [TourStep.TOOLS]: { head: TourText.TOOLS_HEAD, hint: TourText.TOOLS_HINT },
  [TourStep.GUIDE]: { head: TourText.GUIDE_HEAD, hint: TourText.GUIDE_HINT },
  [TourStep.SECTIONS]: { head: TourText.SECTIONS_HEAD, hint: TourText.SECTIONS_HINT },
}

export function TourCard(props: TourCardProps): JSX.Element {
  const { step, state, actions, measuring } = props
  const root = useRef<HTMLDivElement | null>(null)
  const needsDevice = Tour.needsDevice(step) && !ready(state)
  const offlineCard = OFFLINE_CARDS[step]
  /** The run without the EP-133, with it connected after all: its cards offer Try the pads. */
  const deviceHere = props.session.offline && ready(state)
  const variant = `${step}${needsDevice ? ':device' : ''}${step === TourStep.CONNECT && ready(state) ? ':ticked' : ''}${deviceHere ? ':here' : ''}`

  // Focus on the step's first key each time a new card shows (and once it is placed).
  useEffect(() => {
    if (measuring || !props.ready) return
    const primary = root.current?.querySelector<HTMLElement>('[data-tour-primary]:not(:disabled)') ?? root.current?.querySelector<HTMLElement>('button')
    primary?.focus({ preventScroll: true })
  }, [variant, props.ready, measuring])

  const id = measuring ? undefined : props.headingId
  const close = (
    <button type="button" class="tour-card__close" aria-label={TourText.NOT_NOW} title={TourText.NOT_NOW} onClick={actions.finish}>
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M5 5L15 15M15 5L5 15" />
      </svg>
    </button>
  )

  if (isCompact(step) && !needsDevice) {
    const hear = step === TourStep.HEAR
    const body = hear ? TourText.HEAR_HINT : props.demo ? WebText.TOUR_DEMO_PAD : `${MirrorText.WAITING} ${TourText.PAD_NOTE}`
    return (
      <div ref={root} class="tour-card tour-card--compact" data-tour-step={step}>
        <div class="tour-card__row" data-tour-head>
          <h2 id={id} class="tour-card__title t-caps-key">{hear ? TourText.HEAR_HEAD : TourText.PAD_HEAD}</h2>
          {hear && <Key text={TourText.PLAY_IT} size="small" variant="signal" data-tour-primary onClick={actions.playIt} />}
          <Key text={TourText.SKIP} size="small" variant="quiet" data-tour-primary={hear ? undefined : true} onClick={actions.skip} />
          {close}
        </div>
        {!props.headingOnly && <p class="tour-card__body t-small">{body}</p>}
      </div>
    )
  }

  const n = Tour.number(step)
  const of = Tour.stepsFor(props.session, state.midiSupported)
  const head = (title: string): JSX.Element => (
    <div class="tour-card__head" data-tour-head>
      <div class="tour-card__heading">
        {n !== null && <StepOf n={n} of={of} />}
        <h2 id={id} class="tour-card__title t-caps-key">{title}</h2>
      </div>
      {close}
    </div>
  )
  const card = (title: string, body: JSX.Element): JSX.Element => (
    <div ref={root} class="tour-card" data-tour-step={step}>
      {head(title)}
      {!props.headingOnly && body}
    </div>
  )

  if (needsDevice) {
    const later = step === TourStep.BACKUP ? TourText.LATER : TourText.SKIP
    return card(
      step === TourStep.BACKUP ? TourText.BACKUP_HEAD : TourText.PAD_HEAD,
      <>
        <p class="tour-card__body t-body15">{TourText.NEEDS_DEVICE}</p>
        <Checks rows={[{ label: TourText.ROW_CONNECTED, done: false }]} />
        <Keys>
          <Key text={Strings.CONNECT} variant="signal" data-tour-primary disabled={state.busy} onClick={actions.connect} />
          <Key text={later} variant="quiet" onClick={actions.skip} />
        </Keys>
      </>,
    )
  }

  if (offlineCard !== undefined) {
    return card(
      offlineCard.head,
      <>
        <p class="tour-card__body t-body15">{offlineCard.hint}</p>
        <Keys>
          <Key text={TourText.OPEN_IT} variant="signal" data-tour-primary onClick={actions.open} />
          <Key text={TourText.SKIP} variant="quiet" onClick={actions.skip} />
        </Keys>
        {deviceHere && <DeviceHere onClick={actions.tryPads} />}
      </>,
    )
  }

  switch (step) {
    case TourStep.WELCOME: {
      if (props.session.resumed) {
        return card(
          TourText.RESUME_HEAD,
          <>
            <p class="tour-card__body t-body15">{TourText.resumeHint(Tour.resumeAt(props.progress), Tour.stepsFor(props.session, state.midiSupported))}</p>
            <Keys>
              <Key text={TourText.CONTINUE} variant="signal" data-tour-primary onClick={actions.start} />
              <Key text={TourText.NOT_NOW} variant="quiet" onClick={actions.finish} />
            </Keys>
            <Offline onClick={actions.offline} />
          </>,
        )
      }
      return (
        <div ref={root} class="tour-card" data-tour-step={step}>
          <div class="tour-card__head" data-tour-head>
            <DisplayPanel class="tour-card__display" live={false}>
              <h2 id={id} class="t-wordmark tour-card__wordmark">{Strings.WORDMARK}</h2>
              <p class="t-display-sub tour-card__sub">{TourText.WELCOME_SUB}</p>
            </DisplayPanel>
            {close}
          </div>
          {!props.headingOnly && (
            <>
              <p class="tour-card__body t-body15">{TourText.WELCOME_HINT}</p>
              <p class="tour-card__body t-body15">{TourText.WELCOME_STEPS}</p>
              <Keys>
                <Key text={TourText.START} variant="signal" data-tour-primary onClick={actions.start} />
                <Key text={TourText.NOT_NOW} variant="quiet" onClick={actions.finish} />
              </Keys>
              <Offline onClick={actions.offline} />
              {!props.demo && <TryDemo onClick={actions.tryDemo} />}
            </>
          )}
        </div>
      )
    }
    case TourStep.RESTORE:
      return card(
        TourText.RESTORE_HEAD,
        <>
          <p class="tour-card__body t-body15">{WebText.RESTORE_HINT}</p>
          <Keys>
            <Key text={WebText.RESTORE_FOLDER} variant="signal" data-tour-primary disabled={state.busy} onClick={actions.restore} />
            <Key text={TourText.FIRST_TIME} variant="quiet" onClick={actions.skip} />
          </Keys>
        </>,
      )
    case TourStep.CONNECT: {
      const ticked = ready(state)
      const rows: CheckRow[] = [{ label: TourText.ROW_MIDI, done: state.midiPermission === 'granted' }]
      if (state.plugged !== null) rows.push({ label: TourText.ROW_PLUGGED, done: state.plugged || ticked })
      rows.push({ label: TourText.ROW_CONNECTED, done: ticked })
      const note =
        state.connectNote ??
        (ticked ? null : state.midiPermission === 'prompt' ? WebText.TOUR_MIDI_ASK : state.midiPermission === 'denied' ? WebText.MIDI_DENIED : null)
      return card(
        TourText.CONNECT_HEAD,
        <>
          <p class="tour-card__body t-body15">{TourText.CONNECT_HINT}</p>
          <Checks rows={rows} />
          {note !== null && !ticked && <p class="tour-card__note t-small">{note}</p>}
          <Keys>
            {ticked ? (
              <Key text={TourText.NEXT} variant="signal" data-tour-primary onClick={actions.next} />
            ) : (
              <>
                <Key text={Strings.CONNECT} variant="signal" data-tour-primary disabled={state.busy} onClick={actions.connect} />
                <Key text={TourText.SKIP} variant="quiet" onClick={actions.skip} />
              </>
            )}
          </Keys>
        </>,
      )
    }
    case TourStep.MIDI:
      return card(
        TourText.NEEDS_MIDI,
        <>
          <p class="tour-card__body t-body15">{WebText.NO_MIDI_HINT}</p>
          <Keys>
            <Key text={TourText.NEXT} variant="signal" data-tour-primary onClick={actions.skip} />
          </Keys>
          {!props.demo && <TryDemo onClick={actions.tryDemo} />}
        </>,
      )
    case TourStep.BACKUP:
      return card(
        TourText.BACKUP_HEAD,
        <>
          <p class="tour-card__body t-body15">{WebText.TOUR_BACKUP_HINT}</p>
          <p class="tour-card__note t-small">{WebText.KEEP_TAB_OPEN}</p>
          <Keys>
            <Key
              text={Strings.BACK_UP}
              variant="signal"
              data-tour-primary
              disabled={state.device === null || state.busy}
              onClick={actions.backup}
            />
            <Key text={TourText.LATER} variant="quiet" onClick={actions.skip} />
          </Keys>
        </>,
      )
    default: {
      // DONE (PAD and HEAR are the compact cards above). Without the EP-133 it offers the
      // device's steps: Try the pads once it is connected, else its own line and, where
      // there is MIDI, Connect and try the pads.
      const done = <Key text={Strings.DONE} variant="signal" data-tour-primary onClick={actions.finish} />
      let rest: JSX.Element
      if (!props.session.offline) {
        rest = (
          <>
            {Tour.laterNote(props.progress, state.midiSupported) && <p class="tour-card__note t-small">{TourText.LATER_NOTE}</p>}
            <Keys>{done}</Keys>
          </>
        )
      } else if (deviceHere) {
        rest = <DeviceHere onClick={actions.tryPads} main done={actions.finish} />
      } else {
        rest = (
          <>
            <p class="tour-card__note t-small">{TourText.OFFLINE_NOTE}</p>
            {state.midiSupported ? (
              <div class="tour-card__stack">
                <Key text={TourText.CONNECT_NOW} variant="signal" block data-tour-primary disabled={state.busy} onClick={actions.connectNow} />
                <Key text={Strings.DONE} block onClick={actions.finish} />
              </div>
            ) : (
              <Keys>{done}</Keys>
            )}
          </>
        )
      }
      return card(
        TourText.DONE_HEAD,
        <>
          <p class="tour-card__body t-body15">{TourText.DONE_HINT}</p>
          {rest}
        </>,
      )
    }
  }
}

/** "STEP 2 OF 4" and a dot per step (four, or three offline), the steps up to n filled. */
function StepOf(props: { n: number; of: number }): JSX.Element {
  return (
    <p class="tour-card__step t-caps">
      <span>{TourText.stepOf(props.n, props.of)}</span>
      <span class="tour-card__dots" aria-hidden="true">
        {Array.from({ length: props.of }, (_, i) => (
          <span key={i} class={`tour-card__dot${i < props.n ? ' is-on' : ''}`} />
        ))}
      </span>
    </p>
  )
}

interface CheckRow {
  readonly label: string
  readonly done: boolean
}

/** The Connect card's rows: ✓ done, ● the one to do now, ○ after it. */
function Checks(props: { rows: readonly CheckRow[] }): JSX.Element {
  const next = props.rows.findIndex((r) => !r.done)
  return (
    <ul class="tour-card__checks" role="list">
      {props.rows.map((r, i) => (
        <li
          key={r.label}
          class={`tour-card__check t-semi${r.done ? ' is-done' : i === next ? ' is-next' : ''}`}
          aria-label={TourText.row(r.label, r.done)}
          data-done={r.done ? 'true' : 'false'}
        >
          <span class="tour-card__mark" aria-hidden="true">{r.done ? '✓' : i === next ? '●' : '○'}</span>
          <span aria-hidden="true">{r.label}</span>
        </li>
      ))}
    </ul>
  )
}

function Keys(props: { children: JSX.Element | JSX.Element[] | (JSX.Element | false)[] }): JSX.Element {
  return <div class="tour-card__keys">{props.children}</div>
}

/** "Without the EP-133": the welcome's second key, the card's width. */
function Offline(props: { onClick: () => void }): JSX.Element {
  return <Key text={TourText.OFFLINE} variant="normal" block onClick={props.onClick} />
}

/**
 * Offline, with the EP-133 connected after all: say so, and Try the pads (the
 * main key on Done, above its Done key).
 */
function DeviceHere(props: { onClick: () => void; main?: boolean; done?: () => void }): JSX.Element {
  return (
    <div class="tour-card__stack">
      <p class="tour-card__body t-body15">{TourText.DEVICE_HERE}</p>
      <Key
        text={TourText.TRY_PADS}
        variant={props.main ? 'signal' : 'normal'}
        block
        data-tour-primary={props.main || undefined}
        onClick={props.onClick}
      />
      {props.done && <Key text={Strings.DONE} block onClick={props.done} />}
    </div>
  )
}

function TryDemo(props: { onClick: () => void }): JSX.Element {
  return <Key text={WebText.TOUR_TRY_DEMO} size="small" variant="quiet" class="tour-card__demo" onClick={props.onClick} />
}
