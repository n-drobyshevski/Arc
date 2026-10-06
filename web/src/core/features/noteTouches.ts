// Port of core/src/main/kotlin/dev/arc/ep133/features/NoteTouches.kt
//
// The fingers on Live's KEYS (an addition), on the piano and on the grid:
// the note under each pointer (on the grid, each key is a pointer of its
// own), and how many fingers are on each note. A finger sliding across the
// keys lets go of one note and plays the next (a glissando); a second finger
// on a held note strikes it again; a note is let go of only when its last
// finger lifts or leaves. Pure bookkeeping: the screen feeds it pointer
// changes and plays the events that come back.
//
// Web delta: the sealed NoteEvent is a tagged union ({type: 'Press' |
// 'Release', note}) with Press / Release constructors; pointer ids are
// PointerEvent.pointerId numbers where Android has Long.

/** A note to play or let go of, from [NoteTouches]. */
export type NoteEvent =
  /** Play [note]; again, cutting the old voice short, if another finger already holds it. */
  | { readonly type: 'Press'; readonly note: number }
  /** Let go of [note]: the last finger on it lifted or slid away. */
  | { readonly type: 'Release'; readonly note: number }

export const Press = (note: number): NoteEvent => ({ type: 'Press', note })
export const Release = (note: number): NoteEvent => ({ type: 'Release', note })

export class NoteTouches {
  private readonly fingers = new Map<number, number>()
  // Insertion order is first pressed first (a LinkedHashMap).
  private readonly counts = new Map<number, number>()

  /** The notes some finger is on, first pressed first. */
  get held(): Set<number> {
    return new Set(this.counts.keys())
  }

  /** Pointer [id] lands on [note]. */
  down(id: number, note: number): NoteEvent[] {
    // An id still on a note (its lift was lost) lets go of that one first.
    return present([this.lift(id), this.press(id, note)])
  }

  /** Pointer [id] is over [note] now, or off the plate (null). Coming back onto the plate plays again. */
  move(id: number, note: number | null): NoteEvent[] {
    if ((this.fingers.get(id) ?? null) === note) return []
    return present([this.lift(id), note === null ? null : this.press(id, note)])
  }

  /** Pointer [id] lifts (or is cancelled). */
  up(id: number): NoteEvent[] {
    return present([this.lift(id)])
  }

  /** Every finger gone at once (the gesture ended or the keys went away): each held note let go of once. */
  releaseAll(): NoteEvent[] {
    const out = [...this.counts.keys()].map(Release)
    this.fingers.clear()
    this.counts.clear()
    return out
  }

  private press(id: number, note: number): NoteEvent {
    this.fingers.set(id, note)
    this.counts.set(note, (this.counts.get(note) ?? 0) + 1)
    return Press(note)
  }

  private lift(id: number): NoteEvent | null {
    const note = this.fingers.get(id)
    if (note === undefined) return null
    this.fingers.delete(id)
    const left = (this.counts.get(note) ?? 1) - 1
    if (left > 0) {
      this.counts.set(note, left)
      return null
    }
    this.counts.delete(note)
    return Release(note)
  }
}

const present = (events: (NoteEvent | null)[]): NoteEvent[] => events.filter((e): e is NoteEvent => e !== null)
