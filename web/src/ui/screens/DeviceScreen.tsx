// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/DeviceScreen.kt
//
// What is on the EP-133 right now (an addition to the web version): sound
// slots and projects, one view at a time. Details are read on tap, since
// reading every slot's metadata up front would take a while; Play reads them
// itself when needed.
//
// Web deltas: the LazyColumn is a plain column (the page scrolls); a sound row
// is a plate row whose main part is a <button aria-expanded> (the Play key
// beside it is its own button, so they are not nested). Plate and SectionTitle
// are Kotlin `internal` helpers shared with the Contents, Compare and Search
// screens, so they are exported here.
//
// Web only, from 1024px wide (the desk, theme/desk.css; useDesk): two columns.
// On the left the caption with its tools, the storage panel, the switch and
// Find; on the right a binder, a paper sheet with a signal bar (the view and
// what it shows: count and size) and a signal spine, holding the range groups
// (two columns from 1280px) or the project tiles (six to a row) and the picked
// project. Binder tabs down the sheet's right edge, one per range shown, jump
// to their group; the one in view is dark. The sheet scrolls by itself, so
// the left column and the tabs stay put. Below 1024px the screen is unchanged.
import { Fragment, type ComponentChildren, type JSX, type TargetedMouseEvent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { findSounds, hundreds, type SlotBlock, type SoundDetails } from '../../core/features/deviceBrowser'
import type { ProjectEntry, SoundEntry } from '../../core/protocol/device'
import { CoachText } from '../../core/text/coachText'
import { FeatureText } from '../../core/text/featureText'
import { Format } from '../../core/text/format'
import { Strings } from '../../core/text/strings'
import type { BrowserUi, UiState } from '../../state/types'
import { Caption } from '../components/Caption'
import { COACH_YELLOW, COACH_YELLOW_INK, useCoachMark } from '../components/Coach'
import { DashedBox } from '../components/DashedBox'
import { DisplayPanel } from '../components/DisplayPanel'
import { Field } from '../components/Field'
import { GridPlate, PlateLine, plateRowClass } from '../components/GridPlate'
import { IconBlock } from '../components/IconBlock'
import { ArcIcon } from '../components/Icons'
import { Key } from '../components/Key'
import { Meter } from '../components/Meter'
import { PlayKey } from '../components/PlayKey'
import { TextToggle } from '../components/TextToggle'
import { useDesk } from '../useDesk'
import './DeviceScreen.css'

export interface DeviceScreenProps {
  state: UiState
  onRefresh: () => void
  onSoundDetails: (slot: number) => void
  onProjectSounds: (project: number) => void
  /** Needs the tap's user activation (the file picker). */
  onAddSamples: () => void
  /** Null on the Device tab, which has no Done key. */
  onBack?: (() => void) | null
  playing: string | null
  onPlay: (slot: number) => void
  onStop: () => void
  /** The project's pads sheet (a navigation layer 'pads:device:<n>'). */
  onPads: (project: number) => void
  /** For screenshots: 0 sounds, 1 projects. */
  initialSection?: number
  initialOpen?: number | null
}

// ---------- pure helpers (tested in test/ui/deviceScreen.test.ts) ----------

/** Kotlin `"%08X".format(crc)` for a Long: eight hex digits at least, two's complement when negative. */
export function crcHex(crc: number): string {
  if (crc >= 0) return Math.trunc(crc).toString(16).toUpperCase().padStart(8, '0')
  return BigInt.asUintN(64, BigInt(Math.trunc(crc))).toString(16).toUpperCase()
}

/** The detail rows of a sound: channels and rate, its settings, then the checksum. */
export function detailRows(d: SoundDetails): [string, string][] {
  const rows: [string, string][] = [[FeatureText.channels(d.channels), FeatureText.sampleRate(d.sampleRate)]]
  for (const [k, v] of Object.entries(d.settings)) rows.push([FeatureText.settingLabel(k), FeatureText.settingValue(v)])
  rows.push(['CRC32', d.crc !== null ? crcHex(d.crc) : FeatureText.NO_CHECKSUM])
  return rows
}

/** Kotlin `chunked(n)`. */
export function chunked<T>(list: readonly T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n))
  return out
}

/** Slot number to sound name (Kotlin `sounds.associate { it.slot to it.name }`). */
export function soundNames(sounds: readonly SoundEntry[] | undefined): Map<number, string> {
  return new Map((sounds ?? []).map((s) => [s.slot, s.name]))
}

// ---------- the screen ----------

/** Where the desk's binder takes two columns of groups and six project tiles (DeviceScreen.css). */
const WIDE_QUERY = '(min-width: 1280px)'

/** Whether [query] matches now, following its changes; false without matchMedia. */
function useMatch(query: string): boolean {
  const media = (): MediaQueryList | null =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null
  const [on, setOn] = useState(() => media()?.matches ?? false)
  useEffect(() => {
    const m = media()
    if (!m) return
    const sync = (): void => setOn(m.matches)
    sync()
    m.addEventListener('change', sync)
    return () => m.removeEventListener('change', sync)
  }, [query])
  return on
}

export function DeviceScreen(props: DeviceScreenProps): JSX.Element {
  const { state, onRefresh, onSoundDetails, onProjectSounds, onAddSamples, onBack = null, playing, onPlay, onStop, onPads } = props
  const initialSection = props.initialSection ?? 0
  const initialOpen = props.initialOpen ?? null
  const b = state.browser
  const contents = b.contents
  const [openSlot, setOpenSlot] = useState<number | null>(initialSection === 0 ? initialOpen : null)
  const [openProject, setOpenProject] = useState<number | null>(initialSection === 1 ? initialOpen : null)
  // 0: sounds, 1: projects.
  const [section, setSection] = useState(initialSection)
  const [query, setQuery] = useState('')

  // Read the contents when the screen opens, and again once a reconnected device is ready
  // (or once a transfer that kept the device busy has finished).
  // Once per connection, so a read that fails is not retried in a loop (Refresh retries).
  const ready = state.device !== null
  const asked = useRef<{ ready: boolean; asked: boolean }>({ ready, asked: false })
  if (asked.current.ready !== ready) asked.current = { ready, asked: false }
  const latest = useRef({ contents, onRefresh })
  latest.current = { contents, onRefresh }
  useEffect(() => {
    if (ready && !state.busy && latest.current.contents === null && !asked.current.asked) {
      asked.current.asked = true
      latest.current.onRefresh()
    }
  }, [ready, state.busy])

  const groups = useMemo(() => (contents ? hundreds(findSounds(contents.sounds, query)) : []), [contents, query])
  const names = useMemo(() => soundNames(contents?.sounds), [contents])

  const switchMark = useCoachMark('device.switch', CoachText.SOUNDS_PROJECTS, COACH_YELLOW, COACH_YELLOW_INK)

  const desk = useDesk()
  // Six project tiles to a row once the binder is wide enough (the desk from 1280px).
  const wide = useMatch(WIDE_QUERY) && desk
  const leaves = useRef<HTMLDivElement | null>(null)
  const [tabbed, setTabbed] = useState<number | null>(null)
  const jumping = useRef<number | undefined>(undefined)
  const picked = useRef<number | null>(null)
  useEffect(() => () => window.clearTimeout(jumping.current), [])

  const toggleSlot = (slot: number): void => {
    const next = openSlot === slot ? null : slot
    setOpenSlot(next)
    if (next === slot && !b.details.has(slot)) onSoundDetails(slot)
  }
  const toggleProject = (p: number): void => {
    const next = openProject === p ? null : p
    setOpenProject(next)
    if (next === p && !b.projectSounds.has(p)) onProjectSounds(p)
  }

  // The caption with its tools as icons: read again, and add samples (orange, the main action).
  const head = (
    <div key="head" class="device__head">
      <Caption as="h2" text={FeatureText.DEVICE_TITLE} align="start" class="device__title" />
      <span class="device__mark" data-coach="device.refresh">
        <IconBlock
          icon={ArcIcon.REFRESH}
          label={CoachText.REFRESH}
          face="var(--tab-off)"
          ink="var(--navy)"
          onClick={onRefresh}
          disabled={!state.connected || state.busy}
        />
      </span>
      {contents !== null && (
        <span class="device__mark" data-coach="device.add">
          <IconBlock
            icon={ArcIcon.PLUS}
            label={CoachText.ADD_SAMPLES}
            face="var(--signal)"
            ink="var(--on-signal)"
            onClick={onAddSamples}
            disabled={state.busy}
          />
        </span>
      )}
      {onBack !== null && <Key text={Strings.DONE} onClick={onBack} size="small" variant="quiet" />}
    </div>
  )

  // Desk only: the binder tab of the group in view (null: the first one). While a
  // tab's smooth scroll runs, the scroll does not pick another.
  const current = groups.some((g) => g.from === tabbed) ? tabbed : (groups[0]?.from ?? null)
  const groupAt = (from: number): HTMLElement | null =>
    leaves.current?.querySelector<HTMLElement>(`#device-g${from}`) ?? null
  const jumpTo = (from: number): void => {
    setTabbed(from)
    picked.current = from
    const box = leaves.current
    const el = groupAt(from)
    if (!box || !el) return
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.clearTimeout(jumping.current)
    jumping.current = window.setTimeout(() => { jumping.current = undefined }, smooth ? 800 : 100)
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    box.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
    el.focus({ preventScroll: true })
  }
  // A picked tab stays while its group shows (in two columns it may never reach the
  // top); otherwise the first group showing gets the tab, or the last one at the end.
  const followScroll = (): void => {
    const box = leaves.current
    if (!box || jumping.current !== undefined) return
    const view = box.getBoundingClientRect()
    const inView = (from: number): boolean => {
      const r = groupAt(from)?.getBoundingClientRect()
      return r !== undefined && r.bottom > view.top + 24 && r.top < view.bottom - 24
    }
    if (picked.current !== null && inView(picked.current)) return
    picked.current = null
    const showing = groups.filter((g) => inView(g.from))
    const atEnd = box.scrollTop > 0 && box.scrollTop + box.clientHeight >= box.scrollHeight - 2
    const next = atEnd ? showing[showing.length - 1] : showing[0]
    if (next) setTabbed(next.from)
  }

  const groupBlocks = groups.map((g, gi) => {
    const headId = `device-h${g.from}`
    return (
      <section
        key={`h${g.from}`}
        // The binder tabs jump here (and move focus to the group).
        id={desk ? `device-g${g.from}` : undefined}
        tabIndex={desk ? -1 : undefined}
        class="device__block"
        aria-labelledby={headId}
      >
        <div class="device__range">
          <Caption as="h3" id={headId} text={FeatureText.range(g)} align="start" class="device__range-name" />
          <span class="t-caps device__dim">{g.sounds.length}</span>
        </div>
        <ul class="device__rows">
          {g.sounds.map((e, i) => (
            <SoundRow
              key={`s${e.slot}`}
              e={e}
              b={b}
              first={i === 0}
              last={i === g.sounds.length - 1}
              // The guide overlay points at the first row's play key.
              mark={gi === 0 && i === 0}
              open={openSlot === e.slot}
              enabled={!state.busy}
              playing={playing === `device:${e.slot}`}
              onPlay={() => onPlay(e.slot)}
              onStop={onStop}
              onClick={() => toggleSlot(e.slot)}
            />
          ))}
        </ul>
      </section>
    )
  })

  // The switch, Find, and the section's own items (the phone puts Find first in them).
  let switchKey: JSX.Element | null = null
  let find: JSX.Element | null = null
  const list: ComponentChildren[] = []
  if (state.connected && contents) {
    switchKey = (
      <TextToggle
        key="switch"
        ref={switchMark}
        class="device__switch device__gap-12"
        options={[
          FeatureText.sectionLabel(FeatureText.SOUNDS, contents.sounds.length),
          FeatureText.sectionLabel(FeatureText.PROJECTS, contents.projects.length),
        ]}
        selected={section}
        onSelect={setSection}
        label={CoachText.SOUNDS_PROJECTS}
        controls="device-section"
      />
    )
    if (section === 0) {
      if (contents.sounds.length === 0) {
        list.push(
          <div key="no-sounds" class="device__gap-14">
            <DashedBox><p class="t-body15 device__dim">{FeatureText.NO_SOUNDS}</p></DashedBox>
          </div>,
        )
      } else {
        find = (
          <Field
            key="find"
            class="device__gap-14"
            label={FeatureText.FIND_SOUND}
            value={query}
            onValueChange={setQuery}
            placeholder={FeatureText.FIND_HINT}
            maxLength={40}
            type="search"
            enterKeyHint="search"
          />
        )
        if (groups.length === 0) {
          list.push(<p key="no-match" class="t-body15 device__dim device__gap-14" role="status">{FeatureText.NO_FIND_MATCHES}</p>)
        }
        // On the desk the groups flow in the binder's columns.
        if (desk) list.push(<div key="groups" class="device__groups">{groupBlocks}</div>)
        else list.push(...groupBlocks)
      }
    } else if (contents.projects.length === 0) {
      list.push(
        <div key="no-projects" class="device__gap-14">
          <DashedBox><p class="t-body15 device__dim">{FeatureText.NO_PROJECTS}</p></DashedBox>
        </div>,
      )
    } else {
      const p = contents.projects.find((x) => x.project === openProject) ?? null
      list.push(
        <ProjectGrid
          key="projects"
          projects={contents.projects}
          perRow={wide ? 6 : 3}
          selected={openProject}
          enabled={!state.busy}
          onSelect={toggleProject}
        />,
        <div key="project" class="device__gap-12">
          {p === null
            ? <p class="t-small device__dim">{FeatureText.PICK_PROJECT}</p>
            : <ProjectPanel p={p} b={b} names={names} onPads={() => onPads(p.project)} />}
        </div>,
      )
    }
  }

  const missing = (
    <div key="none" class="device__gap-12">
      <DashedBox>
        <p class="t-bold device__ink">{FeatureText.NO_DEVICE_TITLE}</p>
        <p class="t-body15 device__dim">{FeatureText.NOT_CONNECTED}</p>
      </DashedBox>
    </div>
  )
  const panel = <StoragePanel key="panel" contents={contents} reading={b.reading !== null} />

  if (!desk) {
    const body: ComponentChildren[] = []
    if (!state.connected) {
      body.push(missing)
    } else {
      body.push(panel)
      if (contents) {
        body.push(switchKey, <div key="section" id="device-section" role="tabpanel" class="device__section">{find}{list}</div>)
      }
    }
    return (
      <div class="device" data-screen="device">
        {head}
        {body}
      </div>
    )
  }

  // The binder's bar: the view on the left, what it shows on the right (count and size).
  let barName = ''
  let barCount = ''
  if (contents) {
    const shown: readonly { size: number }[] = section === 0 ? groups.flatMap((g) => g.sounds) : contents.projects
    barName = section === 0 ? FeatureText.SOUNDS : FeatureText.PROJECTS
    barCount = `${shown.length} · ${Format.bytes(shown.reduce((n, x) => n + x.size, 0))}`
  }
  const tabs: readonly SlotBlock[] = section === 0 ? groups : []
  return (
    <div class="device device--desk" data-screen="device">
      <div class="device__side">
        {head}
        {state.connected ? [panel, switchKey, find] : missing}
      </div>
      {state.connected && contents && (
        <div class="device__binder">
          <div id="device-section" role="tabpanel" class="device__sheet desk-paper">
            <div class="device__bar">
              <span class="t-caps">{barName}</span>
              <span class="t-caps">{barCount}</span>
            </div>
            <div ref={leaves} class="device__leaves" onScroll={followScroll}>
              <div class={`device__section${section === 1 ? ' device__section--projects' : ''}`}>{list}</div>
            </div>
          </div>
          {/* Always there, so the sheet keeps its width when the view switches. */}
          <div class="device__tabs">
            {tabs.map((g) => {
              const on = g.from === current
              return (
                <button
                  key={g.from}
                  type="button"
                  class={`t-caps-key-small device__tab${on ? ' is-on' : ''}`}
                  aria-controls={`device-g${g.from}`}
                  aria-current={on || undefined}
                  onClick={() => jumpTo(g.from)}
                >
                  {FeatureText.range(g)}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** The dark panel: the storage meter, free space and what is on the device. */
function StoragePanel(props: { contents: BrowserUi['contents']; reading: boolean }): JSX.Element {
  const { contents, reading } = props
  const s = contents?.storage ?? null
  return (
    <div class="device__gap-12">
      <DisplayPanel live>
        <Meter fraction={s !== null && s.total !== 0 ? s.used / s.total : 0} height={18} />
        {contents === null || s === null ? (
          <p class="t-display-hint device__display-dim">{FeatureText.READING}</p>
        ) : (
          <div class="device__stats">
            <p class="t-display-sub device__display-ink">{FeatureText.storage(s.free, s.total)}</p>
            <p class="t-display-sub device__display-dim">
              {reading ? FeatureText.READING : FeatureText.counts(contents.sounds.length, contents.projects.length)}
            </p>
          </div>
        )}
      </DisplayPanel>
    </div>
  )
}

/** A section's caption with its count on the right (Kotlin SectionTitle). */
export function SectionTitle(props: { text: string; count: number; id?: string }): JSX.Element {
  return (
    <div class="section-title">
      <Caption as="h3" id={props.id} text={props.text} align="start" class="section-title__text" />
      <span class="t-caps section-title__count">{props.count}</span>
    </div>
  )
}

/** A flat pale plate with a pressed tint, like the backup rows; plain content when [onClick] is null (Kotlin Plate). */
export function Plate(props: {
  onClick: (() => void) | null
  enabled: boolean
  children?: ComponentChildren
  /** Spoken name of the clickable plate. */
  label?: string
  expanded?: boolean
  class?: string
}): JSX.Element {
  const cls = `plate${props.class ? ` ${props.class}` : ''}`
  if (props.onClick === null) return <div class={cls}>{props.children}</div>
  const onClick = props.onClick
  return (
    <div
      class={`${cls} plate--button`}
      role="button"
      tabIndex={props.enabled ? 0 : -1}
      aria-disabled={!props.enabled || undefined}
      aria-label={props.label}
      aria-expanded={props.expanded}
      // Not while the device is busy: the read it starts would be skipped.
      onClick={() => { if (props.enabled) onClick() }}
      onKeyDown={(e) => {
        if (!props.enabled || e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      {props.children}
    </div>
  )
}

function SoundRow(props: {
  e: SoundEntry
  b: BrowserUi
  first: boolean
  last: boolean
  mark: boolean
  open: boolean
  enabled: boolean
  playing: boolean
  onPlay: () => void
  onStop: () => void
  onClick: () => void
}): JSX.Element {
  const { e, b, open, enabled, playing } = props
  const detailsId = `device-d${e.slot}`
  const d = b.details.get(e.slot)
  const play = (
    <PlayKey
      playing={playing}
      disabled={!enabled}
      // Downloads the sound (and its details if needed), then plays it on the phone.
      description={playing ? FeatureText.stop(e.name) : FeatureText.play(e.name)}
      onClick={() => (playing ? props.onStop() : props.onPlay())}
    />
  )
  // The whole row opens the details, as in Compose; the play key keeps its own taps.
  const onRow = (ev: TargetedMouseEvent<HTMLLIElement>): void => {
    if (!enabled) return
    const t = ev.target as Element | null
    if (t?.closest('.play-key, .sound-row__main, .sound-row__details')) return
    props.onClick()
  }
  return (
    <li class={`sound-row ${plateRowClass(props.first, props.last)}${enabled ? '' : ' is-disabled'}`} onClick={onRow}>
      <div class="sound-row__line">
        <button
          type="button"
          class="sound-row__main"
          disabled={!enabled}
          aria-expanded={open}
          aria-controls={open ? detailsId : undefined}
          onClick={props.onClick}
        >
          <span class="t-bold sound-row__slot">{FeatureText.slot(e.slot)}</span>
          <span class="t-bold sound-row__name">{e.name}</span>
          <span class="t-small sound-row__size">{Format.bytes(e.size)}</span>
        </button>
        {props.mark ? <span class="device__mark" data-coach="device.play">{play}</span> : play}
      </div>
      {b.reading === `play:${e.slot}` && <p class="t-small device__dim" role="status">{FeatureText.READING}</p>}
      {open && (
        <div id={detailsId} class="sound-row__details" onClick={props.onClick}>
          {d !== undefined
            ? <Details d={d} />
            : <p class="t-small device__dim" role="status">{b.reading === `slot:${e.slot}` ? FeatureText.READING : FeatureText.TAP_FOR_DETAILS}</p>}
        </div>
      )}
    </li>
  )
}

function Details(props: { d: SoundDetails }): JSX.Element {
  return (
    <dl class="sound-details">
      {detailRows(props.d).map(([k, v], i) => (
        <div key={i} class="sound-details__row">
          <dt class="t-small sound-details__key">{k}</dt>
          <dd class="t-small sound-details__value">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The projects as tiles on one plate split by thin lines, three to a row (six on the desk); the picked one is navy. */
function ProjectGrid(props: {
  projects: readonly ProjectEntry[]
  perRow: number
  selected: number | null
  enabled: boolean
  onSelect: (p: number) => void
}): JSX.Element {
  const rows = chunked(props.projects, props.perRow)
  return (
    <GridPlate class="device__gap-14 project-grid">
      {rows.map((row, r) => (
        <Fragment key={r}>
          {r > 0 && <PlateLine />}
          <div class="project-grid__row">
            {row.map((p, i) => {
              const on = p.project === props.selected
              return (
                <Fragment key={p.project}>
                  {i > 0 && <span class="project-grid__rule" aria-hidden="true" />}
                  <button
                    type="button"
                    class={`project-tile${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    aria-label={`${Strings.projectLine(p.project)}, ${Format.bytes(p.size)}`}
                    disabled={!props.enabled}
                    onClick={() => props.onSelect(p.project)}
                  >
                    <span class="t-caps project-tile__label" aria-hidden="true">{FeatureText.PROJECT}</span>
                    <span class="t-stat-free project-tile__num" aria-hidden="true">{p.project}</span>
                    <span class="t-small project-tile__size" aria-hidden="true">{Format.bytes(p.size)}</span>
                  </button>
                </Fragment>
              )
            })}
            {/* Keep tiles the same width on a short last row. */}
            {Array.from({ length: props.perRow - row.length }, (_, k) => (
              <Fragment key={`f${k}`}>
                <span class="project-grid__rule" aria-hidden="true" />
                <span class="project-grid__fill hatch" aria-hidden="true" />
              </Fragment>
            ))}
          </div>
        </Fragment>
      ))}
    </GridPlate>
  )
}

/** The picked project: the sounds it uses, by name, and its pads. */
function ProjectPanel(props: { p: ProjectEntry; b: BrowserUi; names: ReadonlyMap<number, string>; onPads: () => void }): JSX.Element {
  const { p, b } = props
  const slots = b.projectSounds.get(p.project)
  const text = slots !== undefined
    ? FeatureText.projectSoundNames(slots, props.names)
    : b.reading === `project:${p.project}` ? FeatureText.READING : FeatureText.TAP_FOR_SOUNDS
  return (
    <Plate onClick={null} enabled>
      <h3 class="t-bold device__ink">{Strings.projectLine(p.project)}</h3>
      <p class="t-small device__dim" aria-live="polite">{text}</p>
      {/* The pads come from the same download as the sounds. */}
      {b.projectPads.has(p.project) && (
        <Key text={FeatureText.PADS} onClick={props.onPads} size="small" block class="project-panel__pads" />
      )}
    </Plate>
  )
}
