# The EP-40 Riddim kit on an EP-133

The EP-40 Riddim is teenage engineering's reggae and dub sibling of the EP-133. Arc can play its factory sounds as a kit (Settings → Live → **EP-40 Riddim** → **Get**, then the kit switch), and a user can put them on their EP-133's pads. This page is for that case: the user's EP-133, or Arc's Live, plays the EP-40's sounds. It is not about writing for an EP-40 device itself.

## When it applies
- The share says so: Arc adds the sentence *My EP-133 plays the EP-40 Riddim factory kit.* after its request, before the card, whenever the EP-40 kit is the one the user picked in Arc.
- Or the sound list is the pack's: names like `55 ep 40 kick`, `742 syren`, `619 pianchrd cmaj` and loops that end in a tempo, `824 jammy drms a 85`. `scripts/beatcard.py` notices this too (or take `--kit ep40`).
- When neither is there, the EP-133's own layout ([genres.md](genres.md), "The assumed kit") is the assumption, as before. Don't guess the EP-40 kit from a genre request alone; ask, or say which kit you assumed.

## The pack's slots
471 sounds, grouped by slot. They are names the list gives, so the usual rule holds: copy slot and name from the user's list, never from this page, because the user may have moved them.

| Slots | What | Examples |
|---|---|---|
| 1-55 | kicks | `48 jammy kick`, `25 sub kik`, `55 ep 40 kick` |
| 100-164 | snares, rims, claps | `147 jammy rim a`, `121 fish rim`, `159 clap`, `163 ep 40 snare a` |
| 200-244 | hats and crashes | `229 jammy hh`, `230 jammy oh`, `241 root crash`, `243 ep 40 hh` |
| 300-375 | toms and percussion | `304 mud tom b`, `316 bongo a`, `349 tamb a`, `375 ep 40 clave` |
| 400-417 | bass one-shots | `411 mudbass`, `406 elec bass a`, `417 synbaz` |
| 500-528 | keys, horns, plucks | `500 clavinet`, `501 hammond`, `502 melodica`, `509 horns`, `520 trombone` |
| 600-628 | chord stabs, the chord in the name | `615 horn skank amin`, `619 pianchrd cmaj`, `626 tekdub amin7`, `607 guit amin` |
| 700-754 | vocal shouts and dub FX | `700 rewind`, `707 champion`, `732 babylon`, `742 syren`, `735 foghorn`, `747 xplosion` |
| 800-898 | loops from eight producers, each named with its tempo | `824 jammy drms a 85`, `830 jammy bass a 85`, `833 jammy mel a 85`, `827 jammy fill a 85` |

- A chord stab plays its chord at `note C4`. To move it, play it in KEYS (`note`), but keep the bass and the other stabs in the same key: an `amin` stab under a `gmaj` one is a choice, not an accident.
- The shouts and FX are one-shots for the ends of phrases and the drop: a `syren` or `rewind` on the last beat of 8 or 16 bars, `xplosion` into a drop, `foghorn` and shouts sparingly.

## Loops
Each producer has drums a-c, fills a-c, bass a-c and mel a-c (some a-d), all at one tempo. In bars at that tempo:

| Producer | Tempo | Drums a b c | Fills a b c | Bass a b c | Mel a b c (d) |
|---|---|---|---|---|---|
| baby g (800-811) | 71 | 1 1 1 | ½ ½ ½ | 1 1 1 | ½ ½ ½ |
| drskl (812-823) | 81 | 2 1 2 | 1, short hits | 1 1 1 | 1 1 2 |
| mpc (874-885) | 82 | 2 2 2 | 1 1 ½ | 2 2 1 | 1 2 2 (`melo`) |
| jammy (824-835) | 85 | 4 2 1 | ½ 1 1 | 2 2 1 | 2 4 2 |
| mprof (849-861) | 86 | 1 1 1 | ½ ½ ½ | 2 2 2 | 1 2 2 (2) |
| crown (836-848) | 88 | 2 2 2 | 1 ½ ½ | 2 1 1 | 2 2 4 (2) |
| rigo (886-898) | 94 | 2 2 2 | 1 1 ½ | 2 2 2 | 2 2 2 (2) |
| mflux (862-873) | 134 | 4 2 2 | 1 1 1 | 4 4 4 | 4 4 8 |

Rules for a card that plays loops:
- **The card's `tempo` is the loop's tempo.** At any other tempo the loop drifts against everything else; `beatcard.py check --sounds` warns about it. Loops of different producers only go together when their tempos match (none do, except by stretching, which the EP-133 doesn't do).
- **Strike a loop once at the start of each pass**: on step 1 of every bar for a 1-bar loop, of bars 1, 3, … for a 2-bar loop, of bars 1 and 5 for a 4-bar loop. The pad's `oneshot` mode (the default) plays the whole sample; striking it again restarts it.
- **The section's `bars` is a multiple of the longest loop**, so the pattern loops where the loops do (4 bars for jammy's drums a).
- **A fill goes on the last half bar** before a change, on its own pad, while the drum loop rests or plays through.
- Layer one-shots over a loop for your own accents (an extra rim, an open hat), and keep them sparse; the loop already swings.

## Factory projects (the pads as Arc's Live lays them out)
The pack has nine projects. Arc's offline Live plays **P01**, so with no sound list this is the layout to assume, and say so:

| Pad | Sound | Pad | Sound | Pad | Sound |
|---|---|---|---|---|---|
| A7 | drum loop a | A8 | drum loop b | A9 | drum loop c |
| A4 | closed hat | A5 | open hat | A6 | tom |
| A1 | kick | A2 | rimshot | A3 | rim |
| A. | fill a | A0 | fill b | AENTER | fill c |

- **B7, B8, B9** are bass loops a-c, **C7, C8, C9** melody loops a-c, all jammy at 85.
- **D** has the FX: D1 siren, D2 wire, D3 shout ("one"), D4 and D6 dub FX, D5 whap, D. rewind (backspin), D0 explosion, DENTER foghorn.
- The other pads of B, C and D (and D7-D9) are the EP-40's own synth voices. An EP-133 has no such sounds, so **those pads are silent**: a bass line or chords you write there need a `sound` line from the user's list (`400-417` bass, `600-628` stabs), or the user picks a sound on Arc's import sheet (**SILENT PADS**). Say so when you write for them.
- P02-P08 have the same shape with another producer: P02 mprof 86, P03 drskl 81, P04 mflux 134, P05 mpc 82, P06 rigo 94, P07 crown 88, P08 baby g 71. P09 is one-shots only (the `ep 40` drums, single basses on B7-B9, chords and keys on C).

## A loop riddim on P01

```
ARC BEAT 1
name Jammy riddim
tempo 85
swing 50

[A] bars 4 step 1/16
A7 drum loop a | X... .... .... .... | .... .... .... .... | .... .... .... .... | .... .... .... .... |
A5 open hat    | .... .... .... .... | .... .... .... .... | .... .... .... .... | .... .... .... ..x. |

[B] bars 4 step 1/16
B7 bass loop a | X... .... .... .... | .... .... .... .... | X... .... .... .... | .... .... .... .... |

[C] bars 4 step 1/16
C7 mel loop a  | X... .... .... .... | .... .... .... .... | X... .... .... .... | .... .... .... .... |

[D] bars 4 step 1/16
D1 siren       | .... .... .... .... | .... .... .... .... | .... .... .... .... | .... .... X... .... |
```

Drums a is 4 bars, so it is struck once; the bass and melody loops are 2 bars, so twice. The siren lands on beat 3 of bar 4, into the turn. For more, see the riddim, dub and dancehall recipes in [genres.md](genres.md).
