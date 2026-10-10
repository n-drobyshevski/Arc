// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/DeviceScreen.kt
//
// What is on the EP-133 right now (an addition to the web version): the
// storage, sound slots and projects. Sounds are listed as the Sample Tool's
// library, a block per hundred of slots under an orange bar with its kind of
// sound in the factory layout; projects are the K.O. II's pads 7 8 9 / 4 5 6 /
// 1 2 3. Details are read on tap, since reading every slot's metadata up front
// would take a while; Play reads them itself when needed.
//
// Web deltas: the LazyColumn is a plain column (the page scrolls) and its
// stickyHeader of range keys is position: sticky; a sound row's main part is
// a <button aria-expanded> (the Play key beside it is its own button, so they
// are not nested). Plate and SectionTitle are Kotlin `internal` helpers shared
// with the Contents, Compare and Search screens, so they are exported here;
// RangeKey (Kotlin's, in PadSheet.kt) comes from live/SoundPicker.
//
// Both at once: Android shows the projects and the sounds side by side from
// 840dp wide (WideDevice); the web does it on the desk only (from 1024px,
// theme/desk.css; useDesk), so tablets keep the switch as phones do. On the
// left the head, the storage, the projects as pads and the picked project's
// card; on the right the sounds binder, a paper sheet under an orange bar
// ("Sounds · 12 · 2.1 MB") with find and All / In P3, the blocks in as many
// columns as fit (CSS columns for the staggered grid), and binder tabs down
// its right edge, one per block, that jump to it (the one in view is dark).
// The sheet scrolls by itself, so the left column and the tabs stay put.
import type { ComponentChildren, JSX, TargetedMouseEvent } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { findSounds, hundreds, type DeviceContents, type SlotBlock, type SoundDetails } from '../../core/features/deviceBrowser'
import type { ProjectEntry, SoundEntry } from '../../core/protocol/device'
import { CoachText } from '../../core/text/coachText'
import { FeatureText } from '../../core/text/featureText'
import { Format } from '../../core/text/format'
import { Strings } from '../../core/text/strings'
import type { BrowserUi, UiState } from '../../state/types'
import { Caption } from '../components/Caption'
import { DashedBox } from '../components/DashedBox'
import { DisplayPanel } from '../components/DisplayPanel'
import { Field } from '../components/Field'
import { IconBlock } from '../components/IconBlock'
import { ArcIcon } from '../components/Icons'
import { Key } from '../components/Key'
import { PlayKey } from '../components/PlayKey'
import { Segmented } from '../components/Segmented'
import { RangeKey } from '../live/SoundPicker'
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

/**
 * An open sound's details as chips (Kotlin DetailChips): channels and rate
 * alone, then each setting and the checksum as a label and its value.
 */
export function detailChips(d: SoundDetails): [string | null, string][] {
  const [first, ...rest] = detailRows(d)
  return [[null, first![0]], [null, first![1]], ...rest]
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

/** The project slots in the order of the K.O. II's pads (Kotlin PadOrder). */
export const PROJECT_ORDER: readonly number[] = [7, 8, 9, 4, 5, 6, 1, 2, 3]

/**
 * The storage meter's split (Kotlin StorageMeter): of [segments], how many are
 * lit for the [used] share of the space, and how many of those, the last ones,
 * are orange for the [projects] share. A share above nothing lights one at least.
 */
export function storageSegments(used: number, projects: number, segments = 24): { lit: number; orange: number } {
  const lit = (f: number): number => (f > 0 ? Math.max(1, Math.round(Math.min(Math.max(f, 0), 1) * segments)) : 0)
  const all = lit(used)
  return { lit: all, orange: Math.min(lit(projects), all) }
}

/** The sounds to list: those [query] finds, only the ones in [used] when given, a block per hundred. */
export function soundBlocks(sounds: readonly SoundEntry[], query: string, used: ReadonlySet<number> | null = null): SlotBlock[] {
  const found = findSounds([...sounds], query)
  return hundreds(used !== null ? found.filter((s) => used.has(s.slot)) : found)
}

// ---------- the screen ----------

/** The element that scrolls [el] (the shell's page on the phone), or the document's. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY
    if (y === 'auto' || y === 'scroll') return p
  }
  return (document.scrollingElement as HTMLElement | null) ?? null
}

function smoothScroll(): boolean {
  return typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
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
  // The desk's All / In P3.
  const [onlyUsed, setOnlyUsed] = useState(false)

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

  const desk = useDesk()
  const names = useMemo(() => soundNames(contents?.sounds), [contents])
  // The desk's binder: the sounds the picked project uses, once its download is in.
  const project = openProject !== null && contents?.projects.some((p) => p.project === openProject) ? openProject : null
  const usedSlots = project !== null ? b.projectSounds.get(project) : undefined
  const used = useMemo(() => (usedSlots !== undefined ? new Set(usedSlots) : null), [usedSlots])
  const filter = desk && onlyUsed && used !== null
  const groups = useMemo(
    () => (contents ? soundBlocks(contents.sounds, query, filter ? used : null) : []),
    [contents, query, filter, used],
  )

  // The block in view: its range key (phone) or binder tab (desk) is down; null: the first one.
  // While a jump's smooth scroll runs, the scroll does not pick another.
  const [tabbed, setTabbed] = useState<number | null>(null)
  const jumping = useRef<number | undefined>(undefined)
  const picked = useRef<number | null>(null)
  const leaves = useRef<HTMLDivElement | null>(null)
  const jumps = useRef<HTMLDivElement | null>(null)
  const root = useRef<HTMLDivElement | null>(null)
  useEffect(() => () => window.clearTimeout(jumping.current), [])
  const current = groups.some((g) => g.from === tabbed) ? tabbed : (groups[0]?.from ?? null)
  const groupAt = (from: number): HTMLElement | null => root.current?.querySelector<HTMLElement>(`#device-g${from}`) ?? null

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

  // Jump to a block: the desk scrolls its sheet, the phone the page, out from under the
  // pinned range keys. Focus moves to the block.
  const jumpTo = (from: number): void => {
    setTabbed(from)
    picked.current = from
    const el = groupAt(from)
    const box = desk ? leaves.current : scrollParent(root.current)
    if (!box || !el) return
    const smooth = smoothScroll()
    window.clearTimeout(jumping.current)
    jumping.current = window.setTimeout(() => { jumping.current = undefined }, smooth ? 800 : 100)
    const pinned = desk ? 0 : (jumps.current?.offsetHeight ?? 0)
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - pinned
    box.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
    el.focus({ preventScroll: true })
  }

  // Desk: a picked tab stays while its group shows (in two columns it may never reach the
  // top); otherwise the first group showing gets the tab, or the last one at the end.
  const followSheet = (): void => {
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

  // Phone: the block under the pinned range keys (Kotlin rangeInView), as the page scrolls.
  const keysShown = !desk && section === 0 && groups.length > 1
  const followPage = useRef<() => void>(() => {})
  followPage.current = (): void => {
    const keys = jumps.current
    if (!keys || jumping.current !== undefined) return
    const line = keys.getBoundingClientRect().bottom + 1
    const under = groups.find((g) => (groupAt(g.from)?.getBoundingClientRect().bottom ?? 0) > line)
    if (under) setTabbed(under.from)
  }
  useLayoutEffect(() => {
    if (!keysShown) return
    const box = scrollParent(root.current)
    const target: HTMLElement | Window | null = box === document.scrollingElement ? window : box
    if (!target) return
    const on = (): void => followPage.current()
    target.addEventListener('scroll', on, { passive: true })
    return () => target.removeEventListener('scroll', on)
  }, [keysShown])

  const head = (
    // The caption with its tools as icons: read again, and add samples (orange, the main action).
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

  const missing = (
    <div key="none" class="device__gap-12">
      <DashedBox>
        <p class="t-bold device__ink">{FeatureText.NO_DEVICE_TITLE}</p>
        <p class="t-body15 device__dim">{FeatureText.NOT_CONNECTED}</p>
      </DashedBox>
    </div>
  )
  const panel = <StoragePanel key="panel" contents={contents} reading={b.reading !== null} />
  const find = (
    <Field
      key="find"
      class="device__find"
      label={FeatureText.FIND_SOUND}
      hideLabel
      icon={ArcIcon.SEARCH}
      value={query}
      onValueChange={setQuery}
      placeholder={FeatureText.FIND_HINT}
      maxLength={40}
      type="search"
      enterKeyHint="search"
      // On the desk's pale sheet, a field the page's colour (Kotlin background = c.shell).
      background={desk ? 'var(--shell)' : undefined}
    />
  )
  const blocks = groups.map((g, gi) => (
    <LibraryBlock key={`h${g.from}`} group={g}>
      {g.sounds.map((e, i) => (
        <SoundRow
          key={`s${e.slot}`}
          e={e}
          b={b}
          // The guide overlay points at the first row's play key.
          mark={gi === 0 && i === 0}
          badge={desk && used?.has(e.slot) ? project : null}
          open={openSlot === e.slot}
          enabled={!state.busy}
          playing={playing === `device:${e.slot}`}
          onPlay={() => onPlay(e.slot)}
          onStop={onStop}
          onClick={() => toggleSlot(e.slot)}
        />
      ))}
    </LibraryBlock>
  ))
  const chosen = contents?.projects.find((x) => x.project === openProject) ?? null
  const pickNote = <p key="pick" class="t-small device__dim">{FeatureText.PICK_PROJECT}</p>

  if (!desk) {
    const body: ComponentChildren[] = []
    if (!state.connected) {
      body.push(missing)
    } else {
      body.push(<div key="panel" class="device__gap-12">{panel}</div>)
      if (contents) {
        body.push(
          <div key="switch" class="device__gap-14" data-coach="device.switch">
            <Segmented
              options={[
                FeatureText.sectionLabel(FeatureText.SOUNDS, contents.sounds.length),
                FeatureText.sectionLabel(FeatureText.PROJECTS, contents.projects.length),
              ]}
              selected={section}
              onSelect={setSection}
              label={CoachText.SOUNDS_PROJECTS}
            />
          </div>,
        )
        const list: ComponentChildren[] = []
        if (section === 0) {
          if (contents.sounds.length === 0) {
            list.push(
              <div key="no-sounds" class="device__gap-14">
                <DashedBox><p class="t-body15 device__dim">{FeatureText.NO_SOUNDS}</p></DashedBox>
              </div>,
            )
          } else {
            list.push(<div key="find" class="device__gap-14">{find}</div>)
            if (groups.length === 0) {
              list.push(<p key="no-match" class="t-body15 device__dim device__gap-14" role="status">{FeatureText.NO_FIND_MATCHES}</p>)
            }
            if (keysShown) {
              list.push(
                <div key="ranges" ref={jumps} class="device__jumps" role="group" aria-label={FeatureText.SOUNDS}>
                  {groups.map((g) => (
                    <RangeKey key={g.from} range={g} on={g.from === current} controls={`device-g${g.from}`} onClick={() => jumpTo(g.from)} />
                  ))}
                </div>,
              )
            }
            list.push(<div key="blocks" class={`device__blocks${keysShown ? '' : ' device__gap-14'}`}>{blocks}</div>)
          }
        } else if (contents.projects.length === 0) {
          list.push(
            <div key="no-projects" class="device__gap-14">
              <DashedBox><p class="t-body15 device__dim">{FeatureText.NO_PROJECTS}</p></DashedBox>
            </div>,
          )
        } else {
          list.push(
            <ProjectPads
              key="projects"
              class="device__gap-14"
              projects={contents.projects}
              selected={openProject}
              enabled={!state.busy}
              onSelect={toggleProject}
            />,
            <div key="project" class="device__gap-12">
              {chosen === null
                ? pickNote
                : <ProjectPanel p={chosen} b={b} names={names} chips onPads={() => onPads(chosen.project)} />}
            </div>,
          )
        }
        body.push(<div key="section" id="device-section" class="device__section">{list}</div>)
      }
    }
    return (
      <div ref={root} class="device" data-screen="device">
        {head}
        {body}
      </div>
    )
  }

  // The desk's left column: the head, the storage, the projects as pads and the picked one's card.
  const side: ComponentChildren[] = [head]
  if (!state.connected) {
    side.push(missing)
  } else {
    side.push(panel)
    if (contents) {
      side.push(<Caption key="caption" as="h3" text={FeatureText.PROJECTS} align="start" class="device__caption" />)
      if (contents.projects.length === 0) {
        side.push(<DashedBox key="no-projects"><p class="t-body15 device__dim">{FeatureText.NO_PROJECTS}</p></DashedBox>)
      } else {
        side.push(
          <ProjectPads
            key="projects"
            projects={contents.projects}
            selected={openProject}
            enabled={!state.busy}
            onSelect={toggleProject}
            small
          />,
          chosen === null
            ? pickNote
            : <ProjectPanel key="project" p={chosen} b={b} names={names} chips={false} onPads={() => onPads(chosen.project)} />,
        )
      }
    }
  }

  let sheet: ComponentChildren = null
  if (state.connected && contents) {
    const total = contents.sounds.reduce((n, s) => n + s.size, 0)
    let inner: ComponentChildren
    if (contents.sounds.length === 0) {
      inner = <div class="device__leaves"><DashedBox><p class="t-body15 device__dim">{FeatureText.NO_SOUNDS}</p></DashedBox></div>
    } else {
      inner = (
        <>
          <div class="device__filter">
            {find}
            {project !== null && used !== null && (
              <Segmented
                compact
                options={[
                  FeatureText.sectionLabel(FeatureText.ALL, contents.sounds.length),
                  FeatureText.inProject(project, contents.sounds.filter((s) => used.has(s.slot)).length),
                ]}
                selected={filter ? 1 : 0}
                onSelect={(i) => setOnlyUsed(i === 1)}
                label={FeatureText.SOUNDS}
                class="device__only"
              />
            )}
          </div>
          <div ref={leaves} class="device__leaves" onScroll={followSheet}>
            {groups.length === 0
              ? <p class="t-body15 device__dim" role="status">{FeatureText.NO_FIND_MATCHES}</p>
              : <div class="device__blocks">{blocks}</div>}
          </div>
        </>
      )
    }
    sheet = (
      <div class="device__binder">
        <div id="device-section" class="device__sheet desk-paper">
          <div class="device__bar">
            <span class="t-caps">{FeatureText.SOUNDS}</span>
            <span class="t-caps">{FeatureText.soundsTotal(contents.sounds.length, total)}</span>
          </div>
          {inner}
        </div>
        {/* Always there, so the sheet keeps its width when the tabs come and go. */}
        <div class="device__tabs" role="group" aria-label={FeatureText.SOUNDS}>
          {groups.map((g) => (
            <BinderTab key={g.from} range={g} on={g.from === current} onClick={() => jumpTo(g.from)} />
          ))}
        </div>
      </div>
    )
  }
  return (
    <div ref={root} class="device device--desk" data-screen="device">
      <div class="device__side">{side}</div>
      {sheet}
    </div>
  )
}

/**
 * The dark panel: the free space in large type ("20 MB free of 61 MB"), the
 * meter split into sounds, projects and free, and its legend with the counts.
 */
function StoragePanel(props: { contents: DeviceContents | null; reading: boolean }): JSX.Element {
  const { contents, reading } = props
  const s = contents?.storage ?? null
  if (contents === null || s === null || s.total === 0) {
    return (
      <DisplayPanel live class="storage">
        <StorageMeter used={0} projects={0} />
        <p class="t-display-hint device__display-dim">{FeatureText.READING}</p>
      </DisplayPanel>
    )
  }
  const projects = contents.projects.reduce((n, p) => n + p.size, 0)
  return (
    <DisplayPanel live class="storage">
      <p class="storage__top">
        <span class="storage__free">{Format.bytes(s.free)}</span>
        <span class="t-display-sub device__display-dim storage__of">{FeatureText.freeOf(s.total)}</span>
        {reading && <span class="t-display-sub device__display-dim">{FeatureText.READING}</span>}
      </p>
      <StorageMeter used={s.used / s.total} projects={projects / s.total} />
      <div class="storage__legend">
        <LegendItem color="var(--display-ink)" text={FeatureText.sectionLabel(FeatureText.SOUNDS, contents.sounds.length)} />
        <LegendItem color="var(--signal)" text={FeatureText.sectionLabel(FeatureText.PROJECTS, contents.projects.length)} />
        <LegendItem color="var(--segment-off)" text={FeatureText.FREE} />
      </div>
    </DisplayPanel>
  )
}

/** The 24-segment meter: the sounds pale, then the projects orange, the rest off (storageSegments). */
function StorageMeter(props: { used: number; projects: number }): JSX.Element {
  const segments = 24
  const { lit, orange } = storageSegments(props.used, props.projects, segments)
  return (
    <div class="storage__meter" aria-hidden="true">
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} class={i >= lit ? '' : i >= lit - orange ? 'is-projects' : 'is-sounds'} />
      ))}
    </div>
  )
}

function LegendItem(props: { color: string; text: string }): JSX.Element {
  return (
    <span class="t-small storage__item">
      <span class="storage__swatch" style={{ background: props.color }} aria-hidden="true" />
      {props.text}
    </span>
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

/**
 * A library block, as the Sample Tool's: an orange bar with the range, its
 * kind of sound in the factory layout (small) and the count, over its rows.
 * The range keys and binder tabs jump here (and move focus to it).
 */
function LibraryBlock(props: { group: SlotBlock; children: ComponentChildren }): JSX.Element {
  const g = props.group
  const headId = `device-h${g.from}`
  const kind = FeatureText.factoryCategory(g.from)
  return (
    <section id={`device-g${g.from}`} tabIndex={-1} class="device__block" aria-labelledby={headId}>
      <div class="device__bar-row">
        <h3 id={headId} class="device__range">
          <span>{FeatureText.range(g)}</span>
          {kind !== null && <>{' '}<span class="device__kind">{kind}</span></>}
        </h3>
        <span class="device__count">{g.sounds.length}</span>
      </div>
      <ul class="device__rows">{props.children}</ul>
    </section>
  )
}

/**
 * One sound in a library block, dense: an LED (lit while it plays), the slot,
 * the name in capitals, [badge]'s project ("P3") when it uses the sound, the
 * size and a round play key. The open one is tinted with an orange rule on
 * its left and unfolds its details as chips.
 */
function SoundRow(props: {
  e: SoundEntry
  b: BrowserUi
  mark: boolean
  badge: number | null
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
      // Downloads the sound (and its details if needed), then plays it in the browser.
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
  const note = b.reading === `play:${e.slot}`
    ? FeatureText.READING
    : !open || d !== undefined
      ? null
      : b.reading === `slot:${e.slot}` ? FeatureText.READING : FeatureText.TAP_FOR_DETAILS
  const cls = `sound-row${open ? ' is-open' : ''}${playing ? ' is-playing' : ''}${enabled ? '' : ' is-disabled'}`
  return (
    <li class={cls} onClick={onRow}>
      <div class="sound-row__line">
        <button
          type="button"
          class="sound-row__main"
          disabled={!enabled}
          aria-expanded={open}
          aria-controls={open ? detailsId : undefined}
          onClick={props.onClick}
        >
          <span class="sound-row__led" aria-hidden="true" />
          <span class="sound-row__slot">{FeatureText.slot(e.slot)}</span>
          <span class="sound-row__name">{e.name}</span>
          {props.badge !== null && <span class="sound-row__badge">{FeatureText.projectBadge(props.badge)}</span>}
          <span class="sound-row__size">{Format.bytes(e.size)}</span>
        </button>
        {props.mark ? <span class="device__mark" data-coach="device.play">{play}</span> : play}
      </div>
      {note !== null && <p class="t-small device__dim sound-row__note" role="status">{note}</p>}
      {open && d !== undefined && (
        <div id={detailsId} class="sound-row__details" onClick={props.onClick}>
          <DetailChips d={d} />
        </div>
      )}
    </li>
  )
}

/** An open sound's details as pills: a grey label (if any) and its value in bold, or a value alone in grey. */
function DetailChips(props: { d: SoundDetails }): JSX.Element {
  return (
    <dl class="sound-chips">
      {detailChips(props.d).map(([k, v], i) => (
        <div key={i} class="t-small sound-chips__chip">
          {k === null
            ? <dd class="sound-chips__alone">{v}</dd>
            : <><dt class="sound-chips__key">{k}</dt><dd class="sound-chips__value">{v}</dd></>}
        </div>
      ))}
    </dl>
  )
}

/** A desk binder tab: a range ("100–199" over "SNARES") on a cap rounded on its outer side; the one in view is dark and down. */
function BinderTab(props: { range: SlotBlock; on: boolean; onClick: () => void }): JSX.Element {
  const kind = FeatureText.factoryCategory(props.range.from)
  return (
    <button
      type="button"
      class={`device__tab cap-3d${props.on ? ' is-on is-down' : ''}`}
      aria-controls={`device-g${props.range.from}`}
      aria-current={props.on || undefined}
      onClick={props.onClick}
    >
      <span class="device__tab-range">{FeatureText.range(props.range)}</span>
      {kind !== null && <span class="device__tab-kind">{kind}</span>}
    </button>
  )
}

/**
 * The nine project slots as the K.O. II's pads, 7 8 9 / 4 5 6 / 1 2 3, in the
 * grey body: dark keys with their size for the projects there, outlined
 * "empty" slots for the rest (nothing to open), and the picked one orange and
 * held down. [small]: the desk's narrower column.
 */
function ProjectPads(props: {
  projects: readonly ProjectEntry[]
  selected: number | null
  enabled: boolean
  onSelect: (p: number) => void
  small?: boolean
  class?: string
}): JSX.Element {
  const byNumber = new Map(props.projects.map((p) => [p.project, p]))
  const cls = `project-pads${props.small ? ' project-pads--small' : ''}${props.class ? ` ${props.class}` : ''}`
  return (
    <div class={cls} role="group" aria-label={FeatureText.PROJECTS}>
      {PROJECT_ORDER.map((n) => {
        const p = byNumber.get(n)
        if (p === undefined) {
          return (
            <div key={n} class="project-key is-empty">
              <span class="sr-only">{`${Strings.projectLine(n)}, ${FeatureText.EMPTY_PROJECT}`}</span>
              <span class="project-key__num" aria-hidden="true">{n}</span>
              <span class="project-key__size" aria-hidden="true">{FeatureText.EMPTY_PROJECT}</span>
            </div>
          )
        }
        const on = n === props.selected
        return (
          <button
            key={n}
            type="button"
            class={`project-key cap-3d${on ? ' is-on' : ''}`}
            aria-pressed={on}
            aria-label={`${Strings.projectLine(n)}, ${Format.bytes(p.size)}`}
            // Not while the device is busy: the read it starts would be skipped.
            disabled={!props.enabled}
            onClick={() => props.onSelect(n)}
          >
            <span class="project-key__num" aria-hidden="true">{n}</span>
            <span class="project-key__size" aria-hidden="true">{Format.bytes(p.size)}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * The picked project: "Project 3" and its size and sound count, the sounds it
 * uses as chips (slot and name; [chips], on the phone, where no list beside it
 * shows them), and its pads.
 */
function ProjectPanel(props: { p: ProjectEntry; b: BrowserUi; names: ReadonlyMap<number, string>; chips: boolean; onPads: () => void }): JSX.Element {
  const { p, b, names } = props
  const slots = b.projectSounds.get(p.project)
  let body: ComponentChildren = null
  if (slots !== undefined && props.chips) {
    body = slots.length === 0
      ? <p class="t-small device__dim">{FeatureText.projectSoundNames(slots, names)}</p>
      : (
        <ul class="project-panel__chips">
          {slots.map((s) => (
            <li key={s} class="t-small project-panel__chip">
              <span class="project-panel__slot">{FeatureText.slot(s)}</span>
              {names.has(s) && <span class="device__dim">{names.get(s)}</span>}
            </li>
          ))}
        </ul>
      )
  } else if (slots === undefined) {
    body = <p class="t-small device__dim">{b.reading === `project:${p.project}` ? FeatureText.READING : FeatureText.TAP_FOR_SOUNDS}</p>
  }
  return (
    <div class="project-panel" aria-live="polite">
      <div class="project-panel__head">
        <h3 class="t-heading device__ink">{Strings.projectLine(p.project)}</h3>
        <span class="t-small device__dim">
          {slots !== undefined ? FeatureText.projectSummary(p.size, slots.length) : Format.bytes(p.size)}
        </span>
      </div>
      {body}
      {/* The pads come from the same download as the sounds. */}
      {b.projectPads.has(p.project) && (
        <Key text={FeatureText.PADS} onClick={props.onPads} size="small" block class="project-panel__pads" />
      )}
    </div>
  )
}
