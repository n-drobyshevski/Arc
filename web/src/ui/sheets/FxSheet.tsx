// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/FxSheet.kt
//
// FX tapped (an addition): the master effect and what goes to it, after the
// EP-133's FX page. EFFECT: the six effects (the one on tapped again turns it
// off), an XY pad for its two knobs, and each group's send to it. OUTPUT: the
// compressor after everything, and the sidechain (a pad's hits duck the
// groups picked). Over both pages, the pad played last as a cap: held, it
// plays as a pad does, so the effect is heard while it is set.
//
// Web deltas: the knobs (DRIVE, SPEED, LENGTH, SHAPE) are sliders, as the
// tempo sheet's SWING is, back to their default on a double click; the XY
// pad and the send faders take the arrow keys (Kotlin: a screen reader's
// custom actions and setProgress); there is no haptic tick on a knob's step.
import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { FxSettings, FxType, type FxType as FxTypeT } from '../../core/features/fxSettings'
import type { PhysicalPad } from '../../core/features/padNotes'
import { physicalPad } from '../../core/features/padNotes'
import { MirrorText } from '../../core/text/mirrorText'
import { Strings } from '../../core/text/strings'
import { GridPlate, PlateLine } from '../components/GridPlate'
import { Key } from '../components/Key'
import { Segmented } from '../components/Segmented'
import { Sheet } from '../components/Sheet'
import { SwitchRow } from '../components/SwitchRow'
import './FxSheet.css'

/**
 * The FX sheet's state and what its controls do: the project's [settings],
 * the tempo Live plays at ([bpm], which the delay's readout follows), and the
 * pad played last ([selected], with its sound from [nameOf]): its group's
 * send is the one in signal orange, and the sidechain's SOURCE takes it.
 */
export interface FxSheetProps {
  open: boolean
  settings: FxSettings
  bpm: number
  selected: PhysicalPad | null
  nameOf: (pad: PhysicalPad) => string | null
  /** An effect's key: that effect, or none when it is on already (the controller decides). */
  onType(t: FxTypeT): void
  onXY(x: number, y: number): void
  onSend(group: number, v: number): void
  onComp(on: boolean, x: number, y: number): void
  onSidechainOn(on: boolean): void
  onSidechainSource(group: number, pad: number): void
  onSidechainDest(group: number): void
  onSidechainXY(x: number, y: number): void
  /** The cap holds [selected] down: it plays as Live plays it, through the effects (null: no cap to play). */
  onPadDown: ((pad: PhysicalPad, at: number) => void) | null
  onPadUp(pad: PhysicalPad): void
  onDismiss(): void
}

/** The effects in the sheet's row: every one but none (the one on, tapped again). */
const EFFECTS = (Object.values(FxType) as FxTypeT[]).filter((t) => t !== FxType.NONE)

/** How far a step (an arrow key) moves X, Y or a send. */
const XY_STEP = 0.05

const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1)

export function FxSheet(props: FxSheetProps): JSX.Element {
  const [page, setPage] = useState(0)
  useEffect(() => {
    if (props.open) setPage(0)
  }, [props.open])
  return (
    <Sheet open={props.open} onDismiss={props.onDismiss} labelledBy="fx-sheet-title" class="fx-sheet">
      <div class="fx-sheet__head">
        <h2 id="fx-sheet-title" class="t-heading fx-sheet__title">
          {MirrorText.FX_TITLE}
        </h2>
        <Segmented
          options={[MirrorText.FX_EFFECT, MirrorText.FX_OUTPUT]}
          selected={page}
          onSelect={setPage}
          compact
          label={MirrorText.FX_TITLE}
          class="fx-sheet__tabs"
        />
      </div>
      <HearRow {...props} />
      {page === 0 ? <EffectPage {...props} /> : <OutputPage {...props} />}
      <p class="t-small fx-sheet__note">{MirrorText.FX_NOTE}</p>
      <Key text={Strings.DONE} variant="quiet" block onClick={props.onDismiss} />
    </Sheet>
  )
}

/** The pad played last as a cap, held to hear it through the effects; before any, a line saying so. */
function HearRow(props: FxSheetProps): JSX.Element {
  const pad = props.selected
  // The pad the press began on is the one let go, whatever is selected meanwhile.
  const held = useRef<PhysicalPad | null>(null)
  const up = (): void => {
    const h = held.current
    held.current = null
    if (h !== null) props.onPadUp(h)
  }
  useEffect(() => up, [])
  if (pad === null) return <p class="t-small fx-sheet__note">{MirrorText.FX_HEAR_NONE}</p>
  const name = props.nameOf(pad)
  const s = props.settings
  // Said when the pad would play dry: no effect on, or its group sending nothing to it.
  const dry = s.type === FxType.NONE ? MirrorText.FX_HEAR_OFF : (s.sends[pad.group] ?? 0) === 0 ? MirrorText.fxHearNoSend(pad.groupLetter) : null
  const down = props.onPadDown
  const press = (at: number): void => {
    if (down === null || held.current !== null) return
    held.current = pad
    down(pad, at)
  }
  return (
    <div class="fx-hear">
      <button
        type="button"
        class="fx-hear__cap cap-3d"
        aria-label={MirrorText.padTitle(pad) + (name !== null ? `, ${name}` : '')}
        aria-description={dry ?? MirrorText.FX_HEAR}
        disabled={down === null}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
          press(e.timeStamp)
        }}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
            e.preventDefault()
            press(e.timeStamp)
          }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') up()
        }}
        onBlur={up}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span class="fx-hear__label" aria-hidden="true">
          {pad.label === '.' ? <span class="fx-hear__dot" /> : pad.label}
        </span>
      </button>
      <div class="fx-hear__text">
        <p class="t-bold fx-hear__title">{MirrorText.padTitle(pad) + (name !== null ? ` · ${name}` : '')}</p>
        <p class={`t-small fx-sheet__note${dry !== null ? ' is-signal' : ''}`}>{dry ?? MirrorText.FX_HEAR}</p>
      </div>
    </div>
  )
}

function EffectPage(props: FxSheetProps): JSX.Element {
  const s = props.settings
  return (
    <>
      <Segmented
        options={EFFECTS.map((t) => MirrorText.fxCode(t))}
        selected={(EFFECTS as readonly FxTypeT[]).indexOf(s.type)}
        onSelect={(i) => props.onType(EFFECTS[i]!)}
        label={MirrorText.FX_EFFECT}
        descriptions={EFFECTS.map((t) => MirrorText.fxChoice(t, t === s.type))}
        class="fx-sheet__types"
      />
      <div class="fx-sheet__mix">
        <XyPad type={s.type} x={s.x} y={s.y} bpm={props.bpm} onXY={props.onXY} />
        <div class="fx-sends" role="group" aria-label={MirrorText.SENDS}>
          {Array.from({ length: FxSettings.GROUPS }, (_, g) => (
            <SendFader key={g} group={g} value={s.sends[g] ?? 0} selected={g === props.selected?.group} onChange={(v) => props.onSend(g, v)} />
          ))}
        </div>
      </div>
    </>
  )
}

/** Follows one pointer from its press on [el]: [at] with where it is, 0..1 across and up. */
function drag(e: PointerEvent, at: (x: number, y: number) => void): void {
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture?.(e.pointerId)
  const r = el.getBoundingClientRect()
  const to = (ev: PointerEvent): void => {
    at(r.width > 0 ? clamp01((ev.clientX - r.left) / r.width) : 0, r.height > 0 ? clamp01(1 - (ev.clientY - r.top) / r.height) : 0)
  }
  to(e)
  const move = (ev: PointerEvent): void => {
    if (ev.pointerId === e.pointerId) to(ev)
  }
  const end = (ev: PointerEvent): void => {
    if (ev.pointerId !== e.pointerId) return
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', end)
    el.removeEventListener('pointercancel', end)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', end)
  el.addEventListener('pointercancel', end)
}

/**
 * The effect's X and Y as one pad on the display: the dot is where they are,
 * X across and Y up; a finger puts it where it touches and drags it. The
 * effect's name and what the knobs do now read top left, what each axis is
 * along its edge. With no effect on it rests, dimmed. The arrow keys step
 * either way by XY_STEP.
 */
function XyPad(props: { type: FxTypeT; x: number; y: number; bpm: number; onXY(x: number, y: number): void }): JSX.Element {
  const { type, x, y, bpm } = props
  const on = type !== FxType.NONE
  const onXY = useRef(props.onXY)
  onXY.current = props.onXY
  const xLabel = FxSettings.xLabel(type)
  const yLabel = FxSettings.yLabel(type)
  return (
    <div
      class={`fx-xy${on ? '' : ' is-off'}`}
      role="group"
      tabIndex={on ? 0 : -1}
      aria-label={MirrorText.XY_PAD}
      aria-description={on ? `${MirrorText.fxName(type)}, ${MirrorText.xyState(type, x, y, bpm)}` : MirrorText.XY_OFF}
      aria-disabled={!on || undefined}
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
      onPointerDown={(e) => {
        if (!on || e.button !== 0) return
        e.preventDefault()
        drag(e, (px, py) => onXY.current(px, py))
      }}
      onKeyDown={(e) => {
        if (!on) return
        const d = { ArrowRight: [XY_STEP, 0], ArrowLeft: [-XY_STEP, 0], ArrowUp: [0, XY_STEP], ArrowDown: [0, -XY_STEP] }[e.key]
        if (d === undefined) return
        e.preventDefault()
        onXY.current(clamp01(x + d[0]!), clamp01(y + d[1]!))
      }}
    >
      {on && (
        <>
          <span class="fx-xy__line fx-xy__line--v" aria-hidden="true" />
          <span class="fx-xy__line fx-xy__line--h" aria-hidden="true" />
          <span class="fx-xy__dot" aria-hidden="true" style={{ '--x': x, '--y': y }} />
        </>
      )}
      <span class="fx-xy__word fx-xy__name" aria-hidden="true">
        <span>{MirrorText.fxName(type).toUpperCase()}</span>
        {on && <span class="fx-xy__readout">{MirrorText.xyReadout(type, x, y, bpm)}</span>}
      </span>
      {on ? (
        <>
          <span class="fx-xy__word fx-xy__y" aria-hidden="true">{`↑ ${yLabel}`}</span>
          <span class="fx-xy__word fx-xy__x" aria-hidden="true">{`${xLabel} →`}</span>
        </>
      ) : (
        <span class="fx-xy__word fx-xy__off" aria-hidden="true">{MirrorText.XY_OFF}</span>
      )}
    </div>
  )
}

/**
 * A group's send to the effect: a fader filled from the bottom (in signal
 * orange for the pad played last's group, navy for the others), its letter
 * and its value (0 to 100) under it. A finger sets it where it touches and
 * drags it; it is a slider for screen readers and the keyboard.
 */
function SendFader(props: { group: number; value: number; selected: boolean; onChange(v: number): void }): JSX.Element {
  const { group, value, selected } = props
  const change = useRef(props.onChange)
  change.current = props.onChange
  const v = clamp01(value)
  return (
    <div class={`fx-send${selected ? ' is-selected' : ''}`}>
      <div
        class="fx-send__track"
        role="slider"
        tabIndex={0}
        aria-label={MirrorText.sendName(group)}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Number(MirrorText.sendValue(v))}
        aria-valuetext={MirrorText.sendValue(v)}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          drag(e, (_, py) => change.current(py))
        }}
        onKeyDown={(e) => {
          const next =
            e.key === 'ArrowUp' || e.key === 'ArrowRight' ? v + XY_STEP
            : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? v - XY_STEP
            : e.key === 'Home' ? 0
            : e.key === 'End' ? 1
            : null
          if (next === null) return
          e.preventDefault()
          change.current(clamp01(Math.round(next * 100) / 100))
        }}
      >
        <span class="fx-send__fill" style={{ height: `${v * 100}%` }} />
      </div>
      <span class="fx-send__letter" aria-hidden="true">{MirrorText.groupKey(group)}</span>
      <span class="fx-send__value" aria-hidden="true">{MirrorText.sendValue(v)}</span>
    </div>
  )
}

function OutputPage(props: FxSheetProps): JSX.Element {
  const s = props.settings
  const comp = s.comp
  const sc = s.sidechain
  const source = physicalPad(sc.group, sc.pad)
  const name = props.nameOf(source)
  const picked = props.selected
  const pickedIsSource = picked !== null && picked.group === source.group && picked.offset === source.offset
  return (
    <>
      <GridPlate>
        <SwitchRow title={MirrorText.OUTPUT_COMP} note={MirrorText.OUTPUT_COMP_NOTE} on={comp.on} onChange={(on) => props.onComp(on, comp.x, comp.y)} />
        <PlateLine />
        <div class="fx-knobs">
          <FxKnob label={MirrorText.DRIVE} value={comp.x} readout={FxSettings.xReadout(FxType.COMPRESSOR, comp.x)} def={FxSettings.DEFAULT.comp.x} onChange={(v) => props.onComp(comp.on, v, comp.y)} />
          <FxKnob label={MirrorText.SPEED} value={comp.y} readout={FxSettings.yReadout(FxType.COMPRESSOR, comp.y)} def={FxSettings.DEFAULT.comp.y} onChange={(v) => props.onComp(comp.on, comp.x, v)} />
        </div>
      </GridPlate>
      <GridPlate>
        <SwitchRow title={MirrorText.SIDECHAIN} note={MirrorText.SIDECHAIN_NOTE} on={sc.on} onChange={props.onSidechainOn} />
        <PlateLine />
        {/* SOURCE: the pad whose hits duck, and a key that makes it the pad played last. */}
        <div class="fx-row">
          <div class="fx-row__text" role="group" aria-label={MirrorText.sidechainSourceDescription(source, name)}>
            <p class="t-semi fx-row__title">{MirrorText.SC_SOURCE}</p>
            <p class="t-small fx-sheet__note fx-row__one">{MirrorText.sidechainSource(source, name)}</p>
          </div>
          <Key
            text={picked !== null ? MirrorText.setSource(picked) : MirrorText.PLAY_FOR_SOURCE}
            size="small"
            disabled={picked === null || pickedIsSource}
            onClick={() => {
              if (picked !== null) props.onSidechainSource(picked.group, picked.offset)
            }}
          />
        </div>
        <PlateLine />
        {/* DUCKS: the groups each hit ducks. */}
        <div class="fx-row fx-ducks">
          <p class="t-semi fx-row__title" id="fx-ducks">{MirrorText.DUCKS}</p>
          <div class="fx-ducks__keys" role="group" aria-labelledby="fx-ducks">
            {Array.from({ length: FxSettings.GROUPS }, (_, g) => {
              const on = (sc.dests & (1 << g)) !== 0
              return (
                <button
                  key={g}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={MirrorText.duckChoice(g)}
                  class={`fx-duck cap-3d${on ? ' is-on is-down' : ''}`}
                  onClick={() => props.onSidechainDest(g)}
                >
                  {MirrorText.groupKey(g)}
                </button>
              )
            })}
          </div>
        </div>
        <PlateLine />
        <div class="fx-knobs">
          <FxKnob label={MirrorText.LENGTH} value={sc.x} readout={MirrorText.sidechainLength(sc.x)} def={FxSettings.DEFAULT.sidechain.x} onChange={(v) => props.onSidechainXY(v, sc.y)} />
          <FxKnob label={MirrorText.SHAPE} value={sc.y} readout={MirrorText.sidechainShape(sc.y)} def={FxSettings.DEFAULT.sidechain.y} onChange={(v) => props.onSidechainXY(sc.x, v)} />
        </div>
      </GridPlate>
    </>
  )
}

/** One of the sheet's knobs, 0..1 in hundredths, back to [def] on a double click. */
function FxKnob(props: { label: string; value: number; readout: string; def: number; onChange(v: number): void }): JSX.Element {
  return (
    <label class="fx-knob" onDblClick={() => props.onChange(props.def)}>
      <span class="t-bold fx-knob__label">{props.label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={props.value}
        aria-valuetext={props.readout}
        aria-description={MirrorText.knobDescription(props.label, props.readout)}
        onInput={(e) => props.onChange(Number((e.currentTarget as HTMLInputElement).value))}
      />
      <span class="fx-knob__value">{props.readout}</span>
    </label>
  )
}
