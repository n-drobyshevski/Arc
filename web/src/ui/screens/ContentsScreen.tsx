// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/ContentsScreen.kt
//
// What is inside a saved backup (an addition to the web version): its sounds,
// which play on the phone and export as WAV files, and its projects, which
// export as their own .pak with the sounds they use. No device needed.
//
// Web deltas: the LazyColumn is a plain column (the page scrolls). A row is a
// plate whose main part is a <button aria-expanded> (the keys beside and under
// it are their own buttons, so none are nested); a tap anywhere else on the
// plate opens it too, as in Compose. Plate and SectionTitle come from
// DeviceScreen (Kotlin `internal` helpers shared by these screens).
import type { JSX, TargetedMouseEvent } from 'preact'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Pak, PakSound } from '../../core/backup/pak'
import { projectSlots } from '../../core/backup/pakExport'
import { FeatureText } from '../../core/text/featureText'
import { Format } from '../../core/text/format'
import type { BackupRecord } from '../../core/text/libraryRules'
import { Strings } from '../../core/text/strings'
import type { ContentsUi } from '../../state/types'
import { Key } from '../components/Key'
import { SectionTitle } from './DeviceScreen'
import './ContentsScreen.css'

export interface ContentsScreenProps {
  b: BackupRecord
  /** The opened backup (state.contents for b), null while it is read. */
  contents: ContentsUi | null
  playing: string | null
  onPlay: (slot: number) => void
  onStop: () => void
  onShareWav: (snd: PakSound) => void
  onSaveWav: (snd: PakSound) => void
  onShareProject: (n: number) => void
  onSaveProject: (n: number) => void
  onBack: () => void
  /** The project's pads sheet (a navigation layer 'pads:backup:<id>:<n>'). */
  onPads: (n: number) => void
}

/** A project of the backup and the backup's sounds its pads use. */
export interface ContentsProject {
  readonly n: number
  readonly slots: readonly number[]
}

/**
 * `pak.sounds.values.sortedBy { it.slot }` and `pak.projects.keys.sorted()`,
 * each project with `runCatching { PakExport.projectSlots(pak, n) }.getOrDefault(emptyList())`.
 */
export function contentsLists(pak: Pak): { sounds: PakSound[]; projects: ContentsProject[] } {
  const sounds = [...pak.sounds.values()].sort((a, b) => a.slot - b.slot)
  const projects = [...pak.projects.keys()].sort((a, b) => a - b).map((n) => {
    let slots: number[]
    try {
      slots = projectSlots(pak, n)
    } catch {
      slots = []
    }
    return { n, slots }
  })
  return { sounds, projects }
}

/** The row's length, or the WAV's size when it can't be read (then it can't play either). */
export function soundMeta(seconds: number | undefined, snd: PakSound): string {
  return seconds !== undefined ? FeatureText.duration(seconds) : Format.bytes(snd.wav.length)
}

/** The playing key of a backup's sound (controller.playBackupSound). */
export function backupSoundKey(backupId: string, slot: number): string {
  return `backup:${backupId}:${slot}`
}

export function ContentsScreen(props: ContentsScreenProps): JSX.Element {
  const { b, contents } = props
  const root = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  const [openSlot, setOpenSlot] = useState<number | null>(null)
  const [openProject, setOpenProject] = useState<number | null>(null)
  const pak = contents?.pak ?? null

  // Focus moves onto the screen when it opens; the list starts at the top.
  useLayoutEffect(() => {
    root.current?.focus({ preventScroll: true })
    if (typeof window !== 'undefined') window.scrollTo(0, 0)
  }, [])
  // rememberSaveable belongs to this backup: another one opens closed.
  useEffect(() => {
    setOpenSlot(null)
    setOpenProject(null)
  }, [b.id])

  // Reading the projects' pads parses each tar once per opened backup.
  const lists = useMemo(() => (pak !== null ? contentsLists(pak) : null), [pak])

  let body: JSX.Element
  if (contents?.error != null) {
    body = <p class="t-body15 contents__error" role="alert">{contents.error}</p>
  } else if (pak === null || lists === null || contents === null) {
    body = <p class="t-body15 contents__dim" role="status">{FeatureText.OPENING}</p>
  } else {
    const { sounds, projects } = lists
    body = (
      <>
        <section class="contents__section" aria-labelledby={`${titleId}-s`}>
          <SectionTitle id={`${titleId}-s`} text={FeatureText.SOUNDS} count={sounds.length} />
          {sounds.length === 0 && <p class="t-body15 contents__dim">{FeatureText.NO_SOUNDS_IN_BACKUP}</p>}
          {sounds.map((snd) => {
            const key = backupSoundKey(b.id, snd.slot)
            const open = openSlot === snd.slot
            return (
              <SoundPlate
                key={`s${snd.slot}`}
                snd={snd}
                idBase={`${titleId}-s${snd.slot}`}
                seconds={contents.durations.get(snd.slot)}
                playing={props.playing === key}
                open={open}
                onToggle={() => setOpenSlot(open ? null : snd.slot)}
                onPlay={() => props.onPlay(snd.slot)}
                onStop={props.onStop}
                onShare={() => props.onShareWav(snd)}
                onSave={() => props.onSaveWav(snd)}
              />
            )
          })}
        </section>
        {/* Box(height 6) between the two sections. */}
        <section class="contents__section contents__section--projects" aria-labelledby={`${titleId}-p`}>
          <SectionTitle id={`${titleId}-p`} text={FeatureText.PROJECTS} count={projects.length} />
          {projects.length === 0
            ? <p class="t-body15 contents__dim">{FeatureText.NO_PROJECTS_IN_BACKUP}</p>
            : <p class="t-small contents__dim">{FeatureText.EXPORT_HINT}</p>}
          {projects.map((p) => {
            const open = openProject === p.n
            return (
              <ProjectPlate
                key={`p${p.n}`}
                p={p}
                idBase={`${titleId}-p${p.n}`}
                open={open}
                onToggle={() => setOpenProject(open ? null : p.n)}
                onPads={() => props.onPads(p.n)}
                onShare={() => props.onShareProject(p.n)}
                onSave={() => props.onSaveProject(p.n)}
              />
            )
          })}
        </section>
      </>
    )
  }

  return (
    <div ref={root} class="contents" data-screen="contents" tabIndex={-1} aria-labelledby={titleId}>
      <div class="contents__column">
        <header class="contents__head">
          <h1 id={titleId} class="t-heading contents__title">{b.title}</h1>
          <Key text={Strings.DONE} variant="quiet" size="small" onClick={props.onBack} />
        </header>
        {body}
      </div>
    </div>
  )
}

/** The plate's own tap (Plate(onClick)): anywhere but its buttons, which handle themselves. */
function plateTap(onToggle: () => void) {
  return (ev: TargetedMouseEvent<HTMLDivElement>): void => {
    const t = ev.target as Element | null
    if (t?.closest('button')) return
    onToggle()
  }
}

function SoundPlate(props: {
  snd: PakSound
  idBase: string
  seconds: number | undefined
  playing: boolean
  open: boolean
  onToggle: () => void
  onPlay: () => void
  onStop: () => void
  onShare: () => void
  onSave: () => void
}): JSX.Element {
  const { snd, open, playing } = props
  const keysId = `${props.idBase}-k`
  return (
    <div class="plate contents__plate" onClick={plateTap(props.onToggle)}>
      <div class="contents__line">
        <button
          type="button"
          class="contents__main"
          aria-expanded={open}
          aria-controls={open ? keysId : undefined}
          onClick={props.onToggle}
        >
          <span class="t-bold contents__slot">{FeatureText.slot(snd.slot)}</span>
          <span class="t-bold contents__name">{snd.name}</span>
          <span class="t-small contents__meta">{soundMeta(props.seconds, snd)}</span>
        </button>
        <Key
          text={playing ? FeatureText.STOP : FeatureText.PLAY}
          aria-label={playing ? FeatureText.stop(snd.name) : FeatureText.play(snd.name)}
          size="small"
          disabled={props.seconds === undefined}
          onClick={() => (playing ? props.onStop() : props.onPlay())}
        />
      </div>
      {open && (
        <div id={keysId} class="contents__keys contents__keys--first">
          <Key text={FeatureText.SHARE_WAV} size="small" onClick={props.onShare} />
          <Key text={FeatureText.SAVE_WAV} size="small" onClick={props.onSave} />
        </div>
      )}
    </div>
  )
}

function ProjectPlate(props: {
  p: ContentsProject
  idBase: string
  open: boolean
  onToggle: () => void
  onPads: () => void
  onShare: () => void
  onSave: () => void
}): JSX.Element {
  const { p, open } = props
  const keysId = `${props.idBase}-k`
  return (
    <div class="plate contents__plate" onClick={plateTap(props.onToggle)}>
      <button
        type="button"
        class="contents__main contents__main--project"
        aria-expanded={open}
        aria-controls={open ? keysId : undefined}
        onClick={props.onToggle}
      >
        <span class="t-bold contents__ink">{Strings.projectLine(p.n)}</span>
        <span class="t-small contents__dim">{FeatureText.projectUses(p.slots)}</span>
      </button>
      {open && (
        <div id={keysId} class="contents__open">
          <Key text={FeatureText.PADS} size="small" block class="contents__pads" onClick={props.onPads} />
          <div class="contents__keys">
            <Key text={FeatureText.SHARE_PROJECT} size="small" onClick={props.onShare} />
            <Key text={FeatureText.SAVE_PROJECT} size="small" onClick={props.onSave} />
          </div>
        </div>
      )}
    </div>
  )
}
