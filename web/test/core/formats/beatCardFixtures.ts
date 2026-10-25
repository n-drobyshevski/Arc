// ARC BEAT cards for test/core/formats/beatCard.test.ts (web only, no Kotlin twin).
//
// CARDS: every card in the arc-beats skill's references/genres.md, ep40-kit.md
// and beat-card.md, copied word for word. ERROR_CARDS: small broken cards.
// `valid`, `errors` and `warnings` are what the skill's scripts/beatcard.py says
// (`beatcard.py check --json`, run when these were copied; vitest never runs
// Python). Warnings leave out beatCard.ts's own "not previewed yet" ones.

export interface CardFixture {
  readonly source: string
  readonly heading: string
  readonly card: string
  readonly valid: boolean
}

export interface ErrorFixture {
  readonly title: string
  readonly card: string
  readonly errors: readonly { readonly line: number; readonly code: string }[]
  readonly warnings: readonly { readonly line: number; readonly code: string }[]
}

export const CARDS: readonly CardFixture[] = [
  {
    source: 'genres.md',
    heading: 'House',
    valid: true,
    card: `ARC BEAT 1
name House groove
tempo 124
swing 52
sidechain A7 B 30 55

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A6 clap        | .... X... .... X... |
A5 open hat    | ..x. ..x. ..x. ..x. |
A4 closed hat  | .o.o .o.o .o.o .o.o |

[B] bars 1
notes
B7 at 1.1.3 note E2 gate 1/8
B7 at 1.2.3 note E2 gate 1/8
B7 at 1.3.3 note G2 gate 1/8
B7 at 1.4.3 note E2 gate 1/8`,
  },
  {
    source: 'genres.md',
    heading: 'Techno',
    valid: true,
    card: `ARC BEAT 1
name Driving techno
tempo 132
swing 50

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A5 open hat    | ..x. ..x. ..x. ..x. |
A4 closed hat  | x..o x..o x..o x..o |
A1 rim         | ..o. ...o ..o. .o.. |`,
  },
  {
    source: 'genres.md',
    heading: 'Detroit techno',
    valid: true,
    card: `ARC BEAT 1
name Detroit soul
tempo 128
swing 54

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A6 clap        | .... X... .... X... |
A4 closed hat  | x.xo x.xo x.xo x.xo |
A0 perc        | .... ..o. .... .o.. |

[C] bars 2
notes
C7 at 1.1.1 note F3 gate 1/4 vel 100
C7 at 1.1.1 note G#3 gate 1/4 vel 100
C7 at 1.1.1 note C4 gate 1/4 vel 100
C7 at 1.2.4+2 note F3 gate 1/8 vel 85
C7 at 1.2.4+2 note G#3 gate 1/8 vel 85
C7 at 1.2.4+2 note C4 gate 1/8 vel 85
C7 at 2.1.1 note G#3 gate 1/4 vel 100
C7 at 2.1.1 note C4 gate 1/4 vel 100
C7 at 2.1.1 note D#4 gate 1/4 vel 100
C7 at 2.2.4+2 note G#3 gate 1/8 vel 85
C7 at 2.2.4+2 note C4 gate 1/8 vel 85
C7 at 2.2.4+2 note D#4 gate 1/8 vel 85`,
  },
  {
    source: 'genres.md',
    heading: 'Minimal techno',
    valid: true,
    card: `ARC BEAT 1
name Minimal clicks
tempo 127
swing 54

[A] bars 2 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X... |
A4 closed hat  | ..o. ..x. ..o. ..x. | ..o. ..x. ..o. ..o. |
A1 rim         | ...x ..o. .... .x.. | .x.. .... ...x ..o. |
A0 perc        | .... .o.. .... .... | .... .... ..x. .... |

[B] bars 2
notes
B7 at 1.2.3 note E1 gate 1/8 vel 100
B7 at 1.4.4+2 note E1 gate 1/16 vel 70
B7 at 2.3.3 note E1 gate 1/8 vel 100
B7 at 2.4.2+2 note G1 gate 1/16 vel 70`,
  },
  {
    source: 'genres.md',
    heading: 'Dub techno',
    valid: true,
    card: `ARC BEAT 1
name Dub chord echo
tempo 122
swing 52
fx delay 62 60
send C 30

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A4 closed hat  | .... ..o. .... ..o. |

[C] bars 2
notes
C7 at 1.1.3 note F3 gate 1/4 vel 100
C7 at 1.1.3 note A3 gate 1/4 vel 100
C7 at 1.1.3 note C4 gate 1/4 vel 100
C7 at 1.2.2+1 note F3 gate 1/4 vel 60
C7 at 1.2.2+1 note A3 gate 1/4 vel 60
C7 at 1.2.2+1 note C4 gate 1/4 vel 60
C7 at 1.3.1 note F3 gate 1/4 vel 30
C7 at 1.3.1 note A3 gate 1/4 vel 30
C7 at 1.3.1 note C4 gate 1/4 vel 30
C7 at 2.3.3 note F3 gate 1/4 vel 100
C7 at 2.3.3 note A3 gate 1/4 vel 100
C7 at 2.3.3 note C4 gate 1/4 vel 100
C7 at 2.4.2+1 note F3 gate 1/4 vel 60
C7 at 2.4.2+1 note A3 gate 1/4 vel 60
C7 at 2.4.2+1 note C4 gate 1/4 vel 60`,
  },
  {
    source: 'genres.md',
    heading: 'Acid techno',
    valid: true,
    card: `ARC BEAT 1
name Acid squelch
tempo 142
swing 50

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A4 closed hat  | xoxo xoxo xoxo xoxo |
A5 open hat    | ..x. ..x. ..x. ..x. |

[B] bars 1
notes
B7 at 1.1.1 note A1 gate 1/16 vel 120
B7 at 1.1.2 note A1 gate 1/16 vel 70
B7 at 1.1.3 note A2 gate 1/16 vel 110
B7 at 1.1.4 note A1 gate 1/8 vel 70
B7 at 1.2.2 note C2 gate 1/16 vel 90
B7 at 1.2.3 note A1 gate 1/16 vel 120
B7 at 1.2.4 note A2 gate 1/16 vel 100
B7 at 1.3.1 note A1 gate 1/16 vel 70
B7 at 1.3.2 note A1 gate 1/16 vel 70
B7 at 1.3.3 note D#2 gate 1/8 vel 120
B7 at 1.3.4 note A1 gate 1/16 vel 70
B7 at 1.4.1 note A2 gate 1/16 vel 110
B7 at 1.4.2 note C2 gate 1/16 vel 90
B7 at 1.4.3 note A1 gate 1/16 vel 120
B7 at 1.4.4 note G2 gate 1/16 vel 100`,
  },
  {
    source: 'genres.md',
    heading: 'Hypnotic techno',
    valid: true,
    card: `ARC BEAT 1
name Hypnotic loop
tempo 132
swing 50

[A] bars 2 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X... |
A4 closed hat  | ..xo ..xo ..xo ..xo | ..xo ..xo ..xo ..xo |
A2 tom         | ..x. ...x .x.. ..x. | x... ..x. ...x .x.. |
A0 perc        | .... .o.. ..o. .o.. | ..o. .... .o.. ..o. |
A1 rim         | .... .... ...o .... | .... ..o. .... .... |

[B] bars 1
notes
B7 at 1.1.2 note D1 gate 1/16 vel 100
B7 at 1.1.3 note D1 gate 1/16 vel 80
B7 at 1.1.4 note D1 gate 1/16 vel 60
B7 at 1.2.2 note D1 gate 1/16 vel 100
B7 at 1.2.3 note D1 gate 1/16 vel 80
B7 at 1.2.4 note D1 gate 1/16 vel 60
B7 at 1.3.2 note D1 gate 1/16 vel 100
B7 at 1.3.3 note D1 gate 1/16 vel 80
B7 at 1.3.4 note D1 gate 1/16 vel 60
B7 at 1.4.2 note D1 gate 1/16 vel 100
B7 at 1.4.3 note D1 gate 1/16 vel 80
B7 at 1.4.4 note D1 gate 1/16 vel 60`,
  },
  {
    source: 'genres.md',
    heading: 'Peak-time techno',
    valid: true,
    card: `ARC BEAT 1
name Peak-time build
tempo 134
swing 50

[A] bars 4 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X... | X... X... X... X... | X... X... X... X... |
AENTER crash   | X... .... .... .... | .... .... .... .... | .... .... .... .... | .... .... .... .... |
A6 clap        | .... .... .... .... | .... X... .... X... | .... X... .... X... | .... X... .... xxxx |
A5 open hat    | ..o. ..o. ..o. ..o. | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. |
A3 shaker      | .... .... .... .... | .o.o .o.o .o.o .o.o | xoxo xoxo xoxo xoxo | xoxo xoxo xoxo xoxo |

[B] bars 1
notes
B7 at 1.1.3 note E1 gate 1/8
B7 at 1.2.3 note E1 gate 1/8
B7 at 1.3.3 note E1 gate 1/8
B7 at 1.4.3 note G1 gate 1/8`,
  },
  {
    source: 'genres.md',
    heading: 'Melodic techno',
    valid: true,
    card: `ARC BEAT 1
name Melodic arpeggio
tempo 122
swing 50

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A6 clap        | .... x... .... x... |
A4 closed hat  | x.x. x.x. x.x. x.x. |
A3 shaker      | .o.o .o.o .o.o .o.o |

[B] bars 1
notes
B7 at 1.1.2 note A1 gate 1/16 vel 95
B7 at 1.1.3 note A1 gate 1/16 vel 75
B7 at 1.1.4 note A1 gate 1/16 vel 85
B7 at 1.2.2 note A1 gate 1/16 vel 95
B7 at 1.2.3 note A1 gate 1/16 vel 75
B7 at 1.2.4 note A1 gate 1/16 vel 85
B7 at 1.3.2 note A1 gate 1/16 vel 95
B7 at 1.3.3 note A1 gate 1/16 vel 75
B7 at 1.3.4 note A1 gate 1/16 vel 85
B7 at 1.4.2 note A1 gate 1/16 vel 95
B7 at 1.4.3 note A1 gate 1/16 vel 75
B7 at 1.4.4 note G1 gate 1/16 vel 85

[D] bars 2
notes
D7 at 1.1.1 note A3 gate 1/8 vel 105
D7 at 1.1.3 note C4 gate 1/8 vel 85
D7 at 1.2.1 note E4 gate 1/8 vel 85
D7 at 1.2.3 note A4 gate 1/8 vel 85
D7 at 1.3.1 note E4 gate 1/8 vel 105
D7 at 1.3.3 note C4 gate 1/8 vel 85
D7 at 1.4.1 note E4 gate 1/8 vel 85
D7 at 1.4.3 note C4 gate 1/8 vel 85
D7 at 2.1.1 note F3 gate 1/8 vel 105
D7 at 2.1.3 note A3 gate 1/8 vel 85
D7 at 2.2.1 note C4 gate 1/8 vel 85
D7 at 2.2.3 note F4 gate 1/8 vel 85
D7 at 2.3.1 note C4 gate 1/8 vel 105
D7 at 2.3.3 note A3 gate 1/8 vel 85
D7 at 2.4.1 note C4 gate 1/8 vel 85
D7 at 2.4.3 note A3 gate 1/8 vel 85`,
  },
  {
    source: 'genres.md',
    heading: 'Industrial techno',
    valid: true,
    card: `ARC BEAT 1
name Industrial pressure
tempo 136
swing 50
fx distortion 65 35
send A 50 B 60
comp 55 30

[A] bars 2 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X... |
A8 kick 2      | x... x... ..x. ...x | x... x... x... x.x. |
A5 open hat    | ..x. .... ..x. .... | ..x. .... ..x. ..x. |
A. cowbell     | .... o... .... ...o | .... .... o... ..o. |
A1 rim         | x..x ..x. .x.. x... | ..x. x..x .x.. ..x. |
notes
A. at 1.2.3+10 vel 110
A1 at 1.4.2+14 vel 90
A. at 2.3.4+7 vel 120
A1 at 2.4.3+16 vel 80

[B] bars 2
notes
B7 at 1.1.2 note C1 gate 1/4 vel 110
B7 at 1.3.2 note C1 gate 1/4 vel 100
B7 at 2.1.2 note C1 gate 1/4 vel 110
B7 at 2.3.2 note C#1 gate 1/4 vel 100`,
  },
  {
    source: 'genres.md',
    heading: 'Hard techno',
    valid: true,
    card: `ARC BEAT 1
name Hard techno pound
tempo 152
swing 50
fx distortion 45 55
send A 25 B 35
comp 50 25

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A6 clap        | .... x... .... x... |
A4 closed hat  | xxXx xxXx xxXx xxXx |

[B] bars 1
notes
B7 at 1.1.2 note F1 gate 1/16 vel 110
B7 at 1.1.3 note F1 gate 1/16 vel 90
B7 at 1.1.4 note F1 gate 1/16 vel 100
B7 at 1.2.2 note F1 gate 1/16 vel 110
B7 at 1.2.3 note F1 gate 1/16 vel 90
B7 at 1.2.4 note F1 gate 1/16 vel 100
B7 at 1.3.2 note F1 gate 1/16 vel 110
B7 at 1.3.3 note F1 gate 1/16 vel 90
B7 at 1.3.4 note F1 gate 1/16 vel 100
B7 at 1.4.2 note F1 gate 1/16 vel 110
B7 at 1.4.3 note F1 gate 1/16 vel 90
B7 at 1.4.4 note F1 gate 1/16 vel 100`,
  },
  {
    source: 'genres.md',
    heading: 'Schranz',
    valid: true,
    card: `ARC BEAT 1
name Schranz pressure
tempo 152
swing 50
fx distortion 60 40
send A 35 B 45
comp 65 20

[A] bars 2 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X.X. |
A6 clap        | .... x... .... x... | .... x... .... xxxX |
A4 closed hat  | xoxo Xoxo Xoxo Xoxo | xoxo Xoxo Xoxo .... |
A5 open hat    | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. .... |
A1 rim         | x..x ..x. .x.. x..x | ..x. .x.. x..x ..x. |
A3 shaker      | .xx. .xx. .xx. .xx. | .xx. .xx. .xx. .xx. |

[B] bars 2
notes
B7 at 1.1.2 note F1 gate 1/16 vel 110
B7 at 1.1.3 note F1 gate 1/16 vel 90
B7 at 1.1.4 note F1 gate 1/16 vel 100
B7 at 1.2.2 note F1 gate 1/16 vel 110
B7 at 1.2.3 note F1 gate 1/16 vel 90
B7 at 1.2.4 note F1 gate 1/16 vel 100
B7 at 1.3.2 note F1 gate 1/16 vel 110
B7 at 1.3.3 note F1 gate 1/16 vel 90
B7 at 1.3.4 note F1 gate 1/16 vel 100
B7 at 1.4.2 note F1 gate 1/16 vel 110
B7 at 1.4.3 note F1 gate 1/16 vel 90
B7 at 1.4.4 note F#1 gate 1/16 vel 100
B7 at 2.1.2 note F1 gate 1/16 vel 110
B7 at 2.1.3 note F1 gate 1/16 vel 90
B7 at 2.1.4 note F1 gate 1/16 vel 100
B7 at 2.2.2 note F1 gate 1/16 vel 110
B7 at 2.2.3 note F1 gate 1/16 vel 90
B7 at 2.2.4 note F1 gate 1/16 vel 100
B7 at 2.3.2 note G#1 gate 1/16 vel 110
B7 at 2.3.3 note G#1 gate 1/16 vel 90
B7 at 2.3.4 note G#1 gate 1/16 vel 100
B7 at 2.4.2 note G#1 gate 1/16 vel 110
B7 at 2.4.3 note G#1 gate 1/16 vel 90
B7 at 2.4.4 note G#1 gate 1/16 vel 100`,
  },
  {
    source: 'genres.md',
    heading: 'Hard groove',
    valid: true,
    card: `ARC BEAT 1
name Hard groove workout
tempo 140
swing 56
fx distortion 35 45
send B 40
comp 45 60
sidechain A7 B 25 60

[A] bars 2 step 1/16
A7 kick        | X... X... X... X... | X... X... X... X... |
A6 clap        | .... x... .... x..o | .... x... .... x... |
A5 open hat    | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. ..x. |
A4 closed hat  | xoxx xoxx xoxx xoxx | xoxx xoxx xoxx xoxx |
A0 conga       | ..x. .o.x ..x. o..x | ..x. .o.x ..x. o.x. |
A2 tom         | .... ...x .... .x.. | .... ...x .... .x.. |
A. cowbell     | .... .... ..o. .... | .... .... ..o. ...o |
A3 shaker      | oxox oxox oxox oxox | oxox oxox oxox oxox |

[B] bars 2
notes
B7 at 1.1.3 note G1 gate 1/16 vel 110
B7 at 1.1.4+3 note G1 gate 1/16 vel 80
B7 at 1.2.3 note G1 gate 1/16 vel 110
B7 at 1.3.2+3 note A#1 gate 1/16 vel 90
B7 at 1.3.3 note G1 gate 1/16 vel 110
B7 at 1.4.3 note G2 gate 1/16 vel 100
B7 at 1.4.4+3 note F1 gate 1/16 vel 80
B7 at 2.1.3 note G1 gate 1/16 vel 110
B7 at 2.1.4+3 note G1 gate 1/16 vel 80
B7 at 2.2.3 note G1 gate 1/16 vel 110
B7 at 2.3.2+3 note A#1 gate 1/16 vel 90
B7 at 2.3.3 note C2 gate 1/16 vel 110
B7 at 2.4.3 note A#1 gate 1/16 vel 100`,
  },
  {
    source: 'genres.md',
    heading: 'Boom bap',
    valid: true,
    card: `ARC BEAT 1
name Lazy boom bap
tempo 90
swing 58

[A] bars 2 step 1/16
A7 kick        | X... ..x. ..x. .... | X... .... x.x. .... |
A9 snare       | .... X... .... X... | .... X... .o.. X..o |
A4 closed hat  | x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x.xo |`,
  },
  {
    source: 'genres.md',
    heading: 'Lo-fi',
    valid: true,
    card: `ARC BEAT 1
name Dusty lo-fi
tempo 76
swing 62
fx filter 27 20
send A 100 C 100

[A] bars 1 step 1/16
A7 kick        | 8... ..6. .... .5.. |
A9 snare       | .... 7... .... 7... |
A4 closed hat  | 5.3. 5.3. 5.3. 5.4. |
A1 rim         | .... .... ..3. .... |

[C] bars 1
notes
C7 at 1.1.1 note C4 gate 1/4
C7 at 1.1.1 note E4 gate 1/4
C7 at 1.1.1 note G4 gate 1/4
C7 at 1.1.1 note B4 gate 1/4`,
  },
  {
    source: 'genres.md',
    heading: 'Trap',
    valid: true,
    card: `ARC BEAT 1
name Trap half-time
tempo 140
swing 50

[A] bars 2 step 1/16
A7 kick        | X... ..x. .... .... | X... .... ..x. ...x |
A6 clap        | .... .... X... .... | .... .... X... .... |
A4 closed hat  | x.x. x.xx x.x. x.xx | x.x. x.xx x.x. .... |
A5 open hat    | .... .... .... ..x. | .... .... .... .... |
notes
A4 at 2.4.1 vel 50
A4 at 2.4.1+12 vel 60
A4 at 2.4.2 vel 72
A4 at 2.4.2+12 vel 84
A4 at 2.4.3 vel 96
A4 at 2.4.3+12 vel 108
A4 at 2.4.4 vel 118
A4 at 2.4.4+12 vel 127

[B] bars 2
notes
B7 at 1.1.1 note C2 gate 1/4
B7 at 1.3.1 note C2 gate 1/4
B7 at 2.1.1 note G1 gate 1/4
B7 at 2.3.3 note A#1 gate 1/4`,
  },
  {
    source: 'genres.md',
    heading: 'Drill',
    valid: true,
    card: `ARC BEAT 1
name Cold drill
tempo 142
swing 50

[A] bars 2 step 1/16
A7 kick        | X... ...x ..x. .... | X... ..x. .... ..x. |
A9 snare       | .... .... X... .... | .... .... X... ...o |
A4 closed hat  | x.xx x.x. xx.x x.x. | x.xx x.x. xx.x xxxx |

[B] bars 2
notes
B7 at 1.1.1 note C2 gate 1/4
B7 at 1.2.4 note D#2 gate 1/8
B7 at 1.3.3 note F2 gate 1/4
B7 at 2.1.1 note C2 gate 1/4
B7 at 2.3.3 note G#1 gate 1/4`,
  },
  {
    source: 'genres.md',
    heading: 'Drum and bass',
    valid: true,
    card: `ARC BEAT 1
name Two-step roller
tempo 174
swing 50

[A] bars 2 step 1/16
A7 kick        | X... .... ..X. .... | X... ..x. ..X. .... |
A9 snare       | .... X... .... X... | .... X..o .o.. X... |
A4 closed hat  | x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x... |
A5 open hat    | .... .... .... .... | .... .... .... ..x. |

[B] bars 2
notes
B7 at 1.1.1 note F1 gate 1/4
B7 at 1.2.4 note F1 gate 1/8
B7 at 1.3.3 note G#1 gate 1/4
B7 at 2.1.1 note F1 gate 1/4
B7 at 2.3.3 note C2 gate 192`,
  },
  {
    source: 'genres.md',
    heading: 'Jungle',
    valid: true,
    card: `ARC BEAT 1
name Chopped break
tempo 166
swing 54

[A] bars 2 step 1/16
A7 kick        | X.x. .... ..xx .... | X.x. .... ..x. x... |
A9 snare       | .... X..o .o.X ...o | .... X..o .... X..o |
A4 closed hat  | x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x.x. |
A5 open hat    | .... .... .... .... | .... .... .... ..x. |`,
  },
  {
    source: 'genres.md',
    heading: 'Breakcore',
    valid: true,
    card: `ARC BEAT 1
name Amen shred
tempo 180
swing 50
fx distortion 55 50
send A 45 B 30
comp 60 15

[A] bars 2 step 1/16
A7 kick        | X.x. ..x. .xx. .... | X..x ..x. xx.x ..x. |
A8 kick 2      | x... .... .x.. .... | x..x .... x... .... |
A9 snare       | .... X..o .o.. ..X. | .... X.oX .oX. .... |
A5 open hat    | x.x. x.x. x.x. x.x. | x... x... x... .... |
A4 closed hat  | .... .... .... .... | .... .... .... xxxx |
AENTER crash   | X... .... .... .... | .... .... .... .... |
notes
A9 at 1.3.4 vel 70
A9 at 1.3.4+12 vel 100
A7 at 2.2.3+12 vel 90
A9 at 2.4.1 vel 50
A9 at 2.4.1+12 vel 60
A9 at 2.4.2 vel 72
A9 at 2.4.2+12 vel 84
A9 at 2.4.3 vel 96
A9 at 2.4.3+12 vel 108
A9 at 2.4.4 vel 118
A9 at 2.4.4+12 vel 127

[B] bars 2
notes
B7 at 1.1.1 note E1 gate 1/4 vel 120
B7 at 1.3.3 note E1 gate 1/8 vel 90
B7 at 2.1.1 note E1 gate 1/4 vel 120
B7 at 2.4.1 note G1 gate 1/8 vel 110`,
  },
  {
    source: 'genres.md',
    heading: 'Breakcore arrangement',
    valid: true,
    card: `ARC BEAT 1
name Breakcore track
tempo 180
swing 50
fx distortion 55 50
send A 45 B 30
comp 60 15
chain 1x2 2x2 3 4 5x2

scene Intro
[A] bars 2 step 1/16
A7 kick        | X... .... .... .... | X... .... .... .... |
A4 closed hat  | x.x. x.x. x.x. x.x. | x.x. x.x. x.x. x.x. |
AENTER crash   | X... .... .... .... | .... .... .... .... |

[B] bars 2
notes
B7 at 1.1.1 note E1 gate 384 vel 100
B7 at 2.1.1 note E1 gate 384 vel 100

scene Drop
[A] bars 2 step 1/16
A7 kick        | X.x. ..x. .xx. .... | X..x ..x. xx.x ..x. |
A8 kick 2      | x... .... .x.. .... | x..x .... x... .... |
A9 snare       | .... X..o .o.. ..X. | .... X.oX .oX. .... |
A5 open hat    | x.x. x.x. x.x. x.x. | x... x... x... .... |
A4 closed hat  | .... .... .... .... | .... .... .... xxxx |
AENTER crash   | X... .... .... .... | .... .... .... .... |

[B] bars 2
notes
B7 at 1.1.1 note E1 gate 1/4 vel 120
B7 at 1.3.3 note E1 gate 1/8 vel 90
B7 at 2.1.1 note E1 gate 1/4 vel 120
B7 at 2.4.1 note G1 gate 1/8 vel 110

scene Breakdown
[A] bars 2 step 1/16
A4 closed hat  | x... x... x... x... | x... x... x... x... |

[B] bars 2
notes
B7 at 1.1.1 note E1 gate 384 vel 110
B7 at 2.1.1 note G1 gate 384 vel 110

scene Build
[A] bars 2 step 1/16
A7 kick        | X... .... X... .... | X... X... X... X... |
A9 snare       | .... .... .... .... | 3.5. 6.7. 8.9. XXXX |
A4 closed hat  | x.x. x.x. x.x. x.x. | xxxx xxxx xxxx xxxx |

scene Drop 2
[A] bars 2 step 1/16
A7 kick        | X.x. ..x. .xx. ..x. | X..x ..x. xx.x ..xx |
A8 kick 2      | x... .x.. .x.. .... | x..x .... x.x. x... |
A9 snare       | .... X..o .oX. ..X. | .... X.oX .oX. X.XX |
A4 closed hat  | xxxx xxxx xxxx xxxx | xxxx xxxx xxxx xxxx |
A5 open hat    | ..x. ..x. ..x. ..x. | ..x. ..x. ..x. .... |
AENTER crash   | X... .... .... .... | X... .... .... .... |

[B] bars 2
notes
B7 at 1.1.1 note E1 gate 1/4 vel 127
B7 at 1.3.3 note E1 gate 1/8 vel 100
B7 at 2.1.1 note E1 gate 1/4 vel 127
B7 at 2.4.1 note G1 gate 1/8 vel 115`,
  },
  {
    source: 'genres.md',
    heading: 'UK garage',
    valid: true,
    card: `ARC BEAT 1
name Two-step garage
tempo 132
swing 58

[A] bars 1 step 1/16
A7 kick        | X... .... ..x. .... |
A9 snare       | .... X... .... X... |
A4 closed hat  | xoxo xoxo xoxo xoxo |
A1 rim         | ..o. .... ...o .... |

[B] bars 1
notes
B7 at 1.1.1 note G1 gate 1/8
B7 at 1.1.4+4 note G2 vel 90
B7 at 1.2.3 note G1 vel 100
B7 at 1.3.3 note A#1 gate 1/8
B7 at 1.4.2+4 note G1 vel 90
B7 at 1.4.4+4 note D2 vel 100`,
  },
  {
    source: 'genres.md',
    heading: 'Breakbeat',
    valid: true,
    card: `ARC BEAT 1
name Big beat break
tempo 126
swing 52

[A] bars 1 step 1/16
A7 kick        | X... ..x. x... ..x. |
A9 snare       | .... X... .... X..o |
A4 closed hat  | x.x. x.x. x.x. x... |
A5 open hat    | .... .... .... ..x. |`,
  },
  {
    source: 'genres.md',
    heading: 'Reggaeton and dembow',
    valid: true,
    card: `ARC BEAT 1
name Dembow
tempo 94
swing 50

[A] bars 1 step 1/16
A7 kick        | X... X... X... X... |
A9 snare       | ...x ..x. ...x ..x. |
A4 closed hat  | x.x. x.x. x.x. x.x. |
A3 shaker      | .o.o .o.o .o.o .o.o |`,
  },
  {
    source: 'genres.md',
    heading: 'Afrobeats',
    valid: true,
    card: `ARC BEAT 1
name Afrobeats bounce
tempo 104
swing 54

[A] bars 1 step 1/16
A7 kick        | X... ..x. ..x. .... |
A6 clap        | .... X... .... X... |
A1 rim         | x..x ..x. x..x ..x. |
A3 shaker      | xoxo xoxo xoxo xoxo |`,
  },
  {
    source: 'genres.md',
    heading: 'Jersey club',
    valid: true,
    card: `ARC BEAT 1
name Jersey bounce
tempo 135
swing 50

[A] bars 1 step 1/16
A7 kick        | X..x ..x. X..x ..x. |
A6 clap        | .... X... .... X.xx |
A4 closed hat  | x.x. x.x. x.x. x.x. |
A5 open hat    | ..x. ..x. ..x. ..x. |`,
  },
  {
    source: 'genres.md',
    heading: 'Footwork',
    valid: true,
    card: `ARC BEAT 1
name Footwork stumble
tempo 160
swing 50

[A] bars 1 step 1/16
A7 kick        | X..x ..x. ..x. .x.. |
A6 clap        | .... X... .... X..x |
A4 closed hat  | x.xx x.xx x.xx x.xx |
A1 rim         | .... ..o. .... ..o. |`,
  },
  {
    source: 'genres.md',
    heading: 'Hip-house',
    valid: true,
    card: `ARC BEAT 1
name Hip-house
tempo 118
swing 54

[A] bars 1 step 1/16
A7 kick        | X... X... X... X..x |
A9 snare       | .... X... .... X... |
A4 closed hat  | x.x. x.x. x.x. x.x. |
A5 open hat    | ..x. ..x. ..x. ..x. |`,
  },
  {
    source: 'genres.md',
    heading: 'Pop and rock backbeat',
    valid: true,
    card: `ARC BEAT 1
name Basic backbeat
tempo 100
swing 50

[A] bars 1 step 1/16
A7 kick        | X... .... X... .... |
A9 snare       | .... X... .... X... |
A4 closed hat  | x.x. x.x. x.x. x.x. |`,
  },
  {
    source: 'genres.md',
    heading: 'One drop (EP-40)',
    valid: true,
    card: `ARC BEAT 1
name One drop
tempo 76
swing 56

[A] bars 1 step 1/16
A1 kick        | .... .... X... .... |
A2 rimshot     | .... .... X... .... |
A4 closed hat  | x.o. x.o. x.o. x.o. |
A5 open hat    | .... .... .... ..o. |`,
  },
  {
    source: 'genres.md',
    heading: 'Rockers (EP-40)',
    valid: true,
    card: `ARC BEAT 1
name Rockers
tempo 80
swing 54

[A] bars 1 step 1/16
A1 kick        | X... .... X... .... |
A2 rimshot     | .... .... X... .... |
A3 rim         | ..o. .... ..o. ...o |
A4 closed hat  | ..x. ..x. ..x. ..x. |`,
  },
  {
    source: 'genres.md',
    heading: 'Steppers (EP-40)',
    valid: true,
    card: `ARC BEAT 1
name Steppers
tempo 78
swing 50

[A] bars 1 step 1/16
A1 kick        | X... X... X... X... |
A2 rimshot     | .... .... X... .... |
A4 closed hat  | ..x. ..x. ..x. .... |
A5 open hat    | .... .... .... ..x. |`,
  },
  {
    source: 'genres.md',
    heading: 'Dub (EP-40)',
    valid: true,
    card: `ARC BEAT 1
name Dub plate
tempo 72
swing 52
fx delay 70 65
send A 30 D 70

[A] bars 2 step 1/16
A1 kick        | X... .... .... ..o. | X... .... .... .... |
A2 rimshot     | .... .... X... .... | .... .... X... .... |
A4 closed hat  | .... x... .... x... | .... x... .... x.o. |

[D] bars 2 step 1/16
D1 siren       | .... .... .... .... | .... .... .... X... |`,
  },
  {
    source: 'genres.md',
    heading: 'Digital riddim (EP-40)',
    valid: true,
    card: `ARC BEAT 1
name Digital riddim
tempo 96
swing 50

[A] bars 1 step 1/16
A1 kick        | X..X ..X. X..X ..X. |
A2 rimshot     | .... X... .... X... |
A4 closed hat  | x.x. x.x. x.x. x.x. |`,
  },
  {
    source: 'genres.md',
    heading: 'Dancehall (EP-40)',
    valid: true,
    card: `ARC BEAT 1
name Dancehall
tempo 104
swing 50

[A] bars 1 step 1/16
A1 kick        | X... ..X. X... ..X. |
A2 rimshot     | .... X... .... X... |
A4 closed hat  | ..x. ..x. ..x. ..xx |`,
  },
  {
    source: 'genres.md',
    heading: 'UK dub (EP-40)',
    valid: true,
    card: `ARC BEAT 1
name UK dub
tempo 140
swing 50
fx delay 60 55
send D 60

[A] bars 1 step 1/16
A1 kick        | X... X... X... X... |
A2 rimshot     | .... .... X... .... |
A4 closed hat  | xoxo xoxo xoxo xoxo |
A5 open hat    | ..x. ..x. ..x. ..x. |

[D] bars 1 step 1/16
D1 siren       | .... .... .... ..X. |`,
  },
  {
    source: 'ep40-kit.md',
    heading: 'A loop riddim on P01',
    valid: true,
    card: `ARC BEAT 1
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
D1 siren       | .... .... .... .... | .... .... .... .... | .... .... .... .... | .... .... X... .... |`,
  },
  {
    source: 'beat-card.md',
    heading: 'ARC BEAT card, version 1',
    valid: true,
    card: `ARC BEAT 1
name Lazy boom bap
tempo 92
swing 58

[A] bars 1 step 1/16
A7 kick      | X... ..x. X... .... |
A9 snare     | .... X... .... X..o |
A4 hat       | x.x. x.x. x.x. x.xo |
notes
A9 at 1.4.4+6 vel 50
A1 at 1.1.1 note C4 gate 1/8`,
  },
]

export const ERROR_CARDS: readonly ErrorFixture[] = [
  {
    title: 'wrong step count',
    card: 'ARC BEAT 1\n[A]\nA7 kick | X... .... X... ... |',
    errors: [{ line: 3, code: 'step-count' }],
    warnings: [],
  },
  {
    title: 'too many steps over two bars',
    card: 'ARC BEAT 1\n[A] bars 2\nA7 kick | X... .... X... .... | X... .... X... .... .... |',
    errors: [{ line: 3, code: 'step-count' }],
    warnings: [],
  },
  {
    title: 'bad tempo',
    card: 'ARC BEAT 1\ntempo 300\n[A]\nA7 | X... .... X... .... |',
    errors: [{ line: 2, code: 'bad-tempo' }],
    warnings: [],
  },
  {
    title: 'tempo with two decimals',
    card: 'ARC BEAT 1\ntempo 92.55\n[A]\nA7 | X... .... X... .... |',
    errors: [{ line: 2, code: 'bad-tempo' }],
    warnings: [],
  },
  {
    title: 'bad swing',
    card: 'ARC BEAT 1\nswing 80\n[A]\nA7 | X... .... X... .... |',
    errors: [{ line: 2, code: 'bad-swing' }],
    warnings: [],
  },
  {
    title: 'unknown pad',
    card: 'ARC BEAT 1\n[A]\nA7 kick | X... .... X... .... |\nA10 perc | X... .... X... .... |',
    errors: [{ line: 4, code: 'bad-pad' }],
    warnings: [],
  },
  {
    title: 'lower-case pad',
    card: 'ARC BEAT 1\n[A]\na7 kick | X... .... X... .... |',
    errors: [{ line: 3, code: 'bad-pad' }],
    warnings: [],
  },
  {
    title: 'row pad from another group',
    card: 'ARC BEAT 1\n[A]\nB7 bass | X... .... X... .... |',
    errors: [{ line: 3, code: 'wrong-group' }],
    warnings: [],
  },
  {
    title: 'sound pad outside group',
    card: 'ARC BEAT 1\n[A]\nsound B7 12 Kick\nA7 kick | X... .... X... .... |',
    errors: [{ line: 3, code: 'wrong-group' }],
    warnings: [],
  },
  {
    title: 'sound slot out of range',
    card: 'ARC BEAT 1\n[A]\nsound A7 1000 Kick\nA7 kick | X... .... X... .... |',
    errors: [{ line: 3, code: 'bad-slot' }],
    warnings: [],
  },
  {
    title: 'missing header',
    card: 'name Nothing\n[A]\nA7 kick | X... .... X... .... |',
    errors: [{ line: 1, code: 'no-card' }],
    warnings: [],
  },
  {
    title: 'newer version',
    card: 'ARC BEAT 2\n[A]\nA7 kick | X... .... X... .... |',
    errors: [{ line: 1, code: 'newer-version' }],
    warnings: [],
  },
  {
    title: 'no sections',
    card: 'ARC BEAT 1\nname Empty\ntempo 120',
    errors: [{ line: 1, code: 'no-sections' }],
    warnings: [],
  },
  {
    title: 'hold with no hit',
    card: 'ARC BEAT 1\n[A]\nA7 kick | -... .... X... .... |',
    errors: [{ line: 3, code: 'orphan-hold' }],
    warnings: [],
  },
  {
    title: 'bad step character',
    card: 'ARC BEAT 1\n[A]\nA7 kick | X... .O.. X... .... |',
    errors: [{ line: 3, code: 'bad-step-char' }],
    warnings: [],
  },
  {
    title: 'bad step option',
    card: 'ARC BEAT 1\n[A] step 1/12\nA7 kick | X... .... X... .... |',
    errors: [{ line: 2, code: 'bad-step' }],
    warnings: [],
  },
  {
    title: 'bad bars',
    card: 'ARC BEAT 1\n[A] bars 100\nA7 kick | X... .... X... .... |',
    errors: [{ line: 2, code: 'bad-bars' }],
    warnings: [],
  },
  {
    title: 'duplicate group',
    card: 'ARC BEAT 1\n[A]\nA7 kick | X... .... X... .... |\n[A]\nA9 snare | X... .... X... .... |',
    errors: [{ line: 4, code: 'duplicate-group' }],
    warnings: [],
  },
  {
    title: 'note outside the pattern',
    card: 'ARC BEAT 1\n[B]\nnotes\nB7 at 2.1.1 note C2',
    errors: [{ line: 4, code: 'note-out-of-pattern' }],
    warnings: [],
  },
  {
    title: 'note with a bad name',
    card: 'ARC BEAT 1\n[B]\nnotes\nB7 at 1.1.1 note c2',
    errors: [{ line: 4, code: 'bad-note-name' }],
    warnings: [],
  },
  {
    title: 'note with no time',
    card: 'ARC BEAT 1\n[B]\nnotes\nB7 note C2 vel 90',
    errors: [{ line: 4, code: 'note-no-time' }],
    warnings: [],
  },
  {
    title: 'row outside a section',
    card: 'ARC BEAT 1\nA7 kick | X... .... X... .... |\n[A]\nA7 kick | X... .... X... .... |',
    errors: [{ line: 2, code: 'row-outside-section' }],
    warnings: [],
  },
  {
    title: 'effect line inside a section',
    card: 'ARC BEAT 1\n[A]\nfx reverb 40 50\nA7 kick | X... .... X... .... |',
    errors: [{ line: 3, code: 'late-fx' }],
    warnings: [],
  },
  {
    title: 'bad effect value',
    card: 'ARC BEAT 1\nfx reverb 140\n[A]\nA7 kick | X... .... X... .... |',
    errors: [{ line: 2, code: 'bad-fx-value' }],
    warnings: [],
  },
  {
    title: 'bad pad line',
    card: 'ARC BEAT 1\n[A]\npad A7 pitch 13\nA7 kick | X... .... X... .... |',
    errors: [{ line: 3, code: 'bad-pad-line' }],
    warnings: [],
  },
  {
    title: 'section before the first scene',
    card: 'ARC BEAT 1\n[A]\nA7 kick | X... .... X... .... |\nscene Drop\n[A]\nA9 snare | X... .... X... .... |',
    errors: [{ line: 2, code: 'section-before-scene' }],
    warnings: [],
  },
  {
    title: 'chain names a missing scene',
    card: 'ARC BEAT 1\nchain 1 3\nscene One\n[A]\nA7 kick | X... .... X... .... |\nscene Two\n[A]\nA9 snare | X... .... X... .... |',
    errors: [{ line: 2, code: 'chain-unknown-scene' }],
    warnings: [],
  },
  {
    title: 'chain without scenes',
    card: 'ARC BEAT 1\nchain 1\n[A]\nA7 kick | X... .... X... .... |',
    errors: [{ line: 2, code: 'chain-without-scenes' }],
    warnings: [],
  },
]
