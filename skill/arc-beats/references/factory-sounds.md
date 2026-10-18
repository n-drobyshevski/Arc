# Factory sounds

The slots and names of the two factory packs Arc knows, as teenage engineering ships them. Use them when Arc plays a factory kit and the user hasn't shared a sound list: a `sound` line copied from here (`sound A3 340 shaker`) puts that factory sound on the pad at import. The **EP-133** list is the default; use the **EP-40 Riddim** list when the share says *My EP-133 plays the EP-40 Riddim factory kit.*, or when the user asks for the EP-40's sounds (see [ep40-kit.md](ep40-kit.md)). When they ask for it but the share doesn't say so, add one line: *these are the EP-40 Riddim's factory slots, so they play only where those sounds are: Arc's Live with the EP-40 kit, or an EP-133 you have loaded them onto; elsewhere Arc's import sheet shows the slots holding other sounds.*

These are the sounds **as shipped**. A user can change what sits in a slot, so say so when you use them: *these are the factory sounds; if you changed the sounds in those slots, Arc shows what is on them and you can untick the change.* Arc matches each sound line by slot and name, so a slot that now holds something else shows up on the import sheet instead of going on silently. A shared sound list always wins over this page.

`python3 scripts/beatcard.py check CARD --sounds factory` (or `--sounds factory-ep40`) checks a card's sound lines against these lists.

## The EP-133 factory project P01

A fresh EP-133 (and Arc's Live with the EP-133 kit and no read) has these sounds on the pads of P01, as Arc's Live lays the pads out by default. Projects P02 to P05 are the same kind of kit; P06 to P09 are empty.

| Group | 7 8 9 | 4 5 6 | 1 2 3 | . 0 ENTER |
|---|---|---|---|---|
| A | 343 nt perc · 235 nt ride · 247 nt ride c | 317 nt tambo · 200 nt hh closed · 218 nt hh open | 100 nt snare · 114 nt snare alt · 130 nt rimshot | 1 micro kick · 21 nt alt kick · 300 nt clap |
| B | 445 two six 00 smoot · 450 de-ex solid · 455 prodigy square | 430 p.six simple · 435 cs5 square · 440 revy | 415 prodigy sub · 420 ob sub · 425 synth 4th hit | 400 nt bass · 405 mp3k sub · 410 cat envelope |
| C | 545 pling chord · 550 look organ · 555 nt chordy | 530 cello 360 · 535 horn 360 english · 540 sky lead | 515 epiano 360 · 520 epiano 360 bass · 525 synth micro funk | 500 blue · 505 ultra · 510 skyline string |
| D | empty | empty | empty | empty |

- **Group D is empty**: a lead, an effect or a second keys part on D needs a `sound` line (or the user picks one on Arc's import sheet, SILENT PADS).
- The pad numbering of a project's file isn't certain (community notes differ), so treat this table as a guide to which **kinds** of sound a group holds: drums on A, bass on B, keys on C. When the card's row and the pad's factory sound are different kinds (the assumed kit's A3 shaker, A7 kick), a sound line makes them match.

The EP-40 Riddim's projects are in [ep40-kit.md](ep40-kit.md).

## EP-133 factory sounds

The pack has 309 sounds.

### Kicks (1-99)

```
1 micro kick
2 nt kick
3 nt kick b
4 nt kick c
5 nt kick d
6 lock kik
7 kick grit
8 kick verb
9 kick mid
10 kick bump
11 kick 9x9 dirt
12 kick 9x9 dirt b
13 kick 9x9 dirt c
14 kick 9x9 dirt d
15 kick 9x9 dirt e
16 kick hard
17 kick air
18 kick thud
19 cardio kick 1
20 afterparty kick
21 nt alt kick
22 nt alt kick b
23 nt alt kick c
24 kick dirt
25 kick sub
26 kick sp
27 kick flux
28 kick flux b
29 kick sub b
30 kick open
31 boomer kick
```

### Snares (100-199)

```
100 nt snare
101 nt snare b
102 nt snare c
103 snare lo
104 snare mid
105 snare hi
106 snare 6x6 1
107 snare 6x6 2
108 snare 6x6 3
109 snare classic
110 snare fat
111 snare smack
112 snare burst
113 brushy snare 1
114 nt snare alt
115 nt snare alt b
116 nt snare alt c
117 snare rim
118 snare punch
119 snare pop
120 snare snap
121 snare vinyl
122 snare mp3k
123 snare mini bm
124 snare vinyl b
125 snare res
126 snare open
127 snare wood
128 quik roll 3
129 london snare 2
130 nt rimshot
131 nt rimshot b
132 nt rimshot c
133 rim lo
134 rim mid
135 rim hi
136 rimshot ddd1
137 rimshot vinyl
138 rimshot 7x7 sp
139 rimshot dmx
140 rim dark
141 rim smack
142 rim snap
143 know rimshot 1
144 sidequest snare
145 akkountant rim 2
```

### Hats and cymbals (200-299)

```
200 nt hh closed
201 nt hh closed b
202 nt hh closed c
203 closed hat lo
204 closed hat mid
205 closed hat hi
206 closed hat pedal
207 closed hat foot
208 hat closed 9x9
209 hat closed 5x5
210 hat closed 6x6
211 hat closed 8x8
212 closed hat lo b
213 closed hat hi b
214 closed hat air
215 golden hat 1
216 crunch hat 2
217 shine hat 4
218 nt hh open
219 nt hh open b
220 nt hh open c
221 open hat real
222 open hat drive
223 open hat metal
224 hat open 9x9
225 hat open 5x5
226 hat open 6x6
227 hat open 8x8
228 open hat lo
229 open hat hi
230 open hat air
231 girth open hat 3
232 golden hat 1 b
233 lucky dbl hat 2
234 brush hat 4
235 nt ride
236 nt ride b
237 ride dark
238 ride brite
239 ride sakata
240 cymbal mp1
241 ride 7x7
242 ride dark b
243 ride lite
244 ride bell
245 ride hi
246 toaster bell
247 nt ride c
248 crash
249 crash 9x9
250 china 626
251 splash
252 crash cym
253 80 great crash
```

### Claps and percussion (300-399)

```
300 nt clap
301 nt clap b
302 nt clap c
303 clap real
304 clap hard
305 clap snap
306 clap vinyl
307 clap trumulator
308 clap sp disco
309 clap sp disco b
310 clap dark
311 clap lite
312 clap air
313 clap noise
314 gospel clap 3
315 homecoming clap
316 detroit clap 2
317 nt tambo
318 nt tambo b
319 nt tambo c
320 hand drum hi
321 tamb
322 hand drum lo
323 bongo mid 4
324 conga mid 11
325 agogo
326 bongo hi
327 maraca
328 bongo lo
329 guiro
330 clave
331 conga lo
332 conga hi
333 cabase lm1
334 cabasa mp3k
335 cabasa lnndrum
336 shaker dmx
337 tamb b
338 clave b
339 cowbell
340 shaker
341 hermes hihat 2
342 loww clave 1
343 nt perc
344 nt perc b
345 nt perc c
346 tom fat
347 tom skin
348 tom round lo
349 tom round hi
350 tom sp
351 tom lnndrum
352 tom lo flam
353 tom mid
354 tom hi
355 sweet shake 1
356 function tom 3
357 hundobell perc 2
```

### Bass (400-499)

```
400 nt bass
401 s95x round
402 tubro bass
403 e bass round
404 basic
405 mp3k sub
406 syn a re
407 upright sub
408 e bass pick
409 thmp
410 cat envelope
411 tb3x3 punch
412 uggbass
413 e bass pick b
414 perfect bass
415 prodigy sub
416 s95x sub
417 bass thub
418 rockelbass mid
419 e bass dist
420 ob sub
421 cx tone
422 buzz bass
423 rockelbass short
424 mno evo filter
425 synth 4th hit
426 thirty seven sub
427 orga
428 mud
429 reese
430 p.six simple
431 s6i2 electric
432 akubass midlong
433 mud b
434 wet bass
435 cs5 square
436 s6i2 warm
437 elec bass
438 boing
439 organ dx house
440 revy
441 sdsv tom
442 dr smpl warm
443 growly
444 organish
445 two six 00 smoot
446 prodigy punch
447 flate
448 kaa wa bell air
449 so round
450 de-ex solid
451 chicago
452 subd
453 phonec grr
454 overdrive
455 prodigy square
456 tock
457 wlobb wobb
458 puff
459 rude twang
```

### Melodic: keys, chords, strings, leads, vox (500-599)

```
500 blue
501 piano s95x
502 wurli clean
503 mute strato
504 cute emu flute
505 ultra
506 squick
507 clav 360 phaser
508 baby chord
509 bg vocal
510 skyline string
511 octave stab
512 trumpet breezy
513 scary vibes
514 sly synth chord
515 epiano 360
516 organ dx verb
517 pluck hi bass
518 pluck hybrid
519 prophet piano
520 epiano 360 bass
521 houseorgan de-ex
522 soothe string
523 cello pluckz
524 high pan
525 synth micro funk
526 dr organ chord
527 leadaft
528 soothe strong
529 simple trombone
530 cello 360
531 flute 360 filter
532 organ dx200 stab
533 waterchord am7
534 sad guitar
535 horn 360 english
536 strings 360
537 house chord em7
538 upright chord
539 exotic pluck
540 sky lead
541 strings dr
542 liquid chord em7
543 chordy f9sus4
544 broken bell perc
545 pling chord
546 s6i2 verb hit
547 dr
548 vox s6i2 dark
549 sitar one shot
550 look organ
551 thirty 7 stab
552 buzz delay
553 vox s6i2 eh
554 guzheng
555 nt chordy
556 fx birds tape
557 vox s6i2 gated
558 03d
559 search chord
```

## EP-40 Riddim factory sounds

The pack has 471 sounds.

### Kicks (1-99)

```
1 ark kick
2 bam kick
3 close kick
4 collie kick a
5 cymb kick
6 digi kick
7 drop kick
8 dum kick
9 eras kick
10 flap kick
11 floor kick
12 flop kick
13 horse kick
14 lee kik a
15 long kick a
16 machine kick a
17 machine kick b
18 pcm kick
19 root kick a
20 root kick b
21 ruff kick
22 sds kick a
23 sds kick b
24 smugl kick b
25 sub kik
26 tek kick
27 tekki kick
28 tenement kick
29 thik kick
30 thumpi kick
31 timid kick
32 smugl kick a
33 baows kick
34 boot kick
35 des kick
36 dong kick
37 general kick
38 groot kick
39 gut kick
40 junior kick
41 lump kick
42 senior kick
43 spleen kick
44 tappy kick
45 woofy kick
46 baby g kick
47 drskl kick
48 jammy kick
49 m crown kick a
50 m crown kick b
51 mad prof kick
52 maflux kick
53 mpc kick
54 rigo kick
55 ep 40 kick
```

### Snares, rims and claps (100-199)

```
100 shanty sn
101 shawty sn
102 smugl sn
103 spring sn
104 clangy sn
105 clongy sn
106 clunky sn
107 dbx sn
108 digi sn
109 disty sn
110 gundam sn
111 hi sn
112 machine sn
113 rank sn
114 rimmy sn
115 root sn
116 snap sn
117 tenor sn
118 thik sn
119 trigga sn
120 unit sn
121 fish rim
122 lee rim
123 rank rim
124 root rim
125 tenement rim
126 tik rim
127 brap sn
128 cuppy sn
129 darb sn
130 dh 9x9 sn a
131 dh 9x9 sn b
132 edji sn
133 eity sn
134 fork sn
135 klappy sn
136 mikro sn
137 naff sn
138 ratty sn
139 rimmi sn
140 smoer sn
141 thap sn
142 waga sn
143 wajd sn
144 baby g sn
145 drskl rim
146 drskl sn
147 jammy rim a
148 jammy rim b
149 m crown sn a
150 m crown sn b
151 mad prof rim
152 mad prof sn
153 maflux sn
154 mpc sn
155 rigo sn a
156 rigo sn b
157 box clap
158 bumbaclap
159 clap
160 drskl clap
161 flat clap
162 mpc clap
163 ep 40 snare a
164 ep 40 snare b
```

### Hats and crashes (200-299)

```
200 root hh a
201 root hh b
202 root oh
203 smugl hh a
204 smugl hh b
205 smugl oh
206 roff hh a
207 roff hh b
208 burst hh
209 digi hh
210 ehx hh a
211 ehx hh b
212 kik oh
213 krunch hh a
214 krunch hh b
215 krunch hh c
216 krunch hh d
217 shine hh
218 thik hh a
219 thik hh b
220 thik hh c
221 ticki hh
222 tini hh a
223 tini hh b
224 tini hh c
225 tok hh
226 baby g hh a
227 baby g hh b
228 drskl hh a
229 jammy hh
230 jammy oh
231 mad prof oh
232 maflux hh
233 maflux oh
234 mpc hh
235 rigo hh
236 m crown hh a
237 m crown hh b
238 cr crash
239 dungeon crash
240 roast crash
241 root crash
242 rigo crash
243 ep 40 hh
244 ep 40 oh
```

### Toms and percussion (300-399)

```
300 thik tom a
301 thik tom b
302 thik tom c
303 mud tom a
304 mud tom b
305 mud tom c
306 flapjack tom a
307 flapjack tom b
308 dbx tom a
309 dbx tom b
310 dbx tom c
311 digitom a
312 digitom b
313 digitom c
314 sds tom
315 drskl tom
316 bongo a
317 bongo b
318 bow drum
319 hand perc a
320 hand perc b
321 micro bongo
322 mini bongo
323 slap perc
324 timba a
325 timba b
326 stick
327 springer
328 blok a
329 blok b
330 blok c
331 era rim a
332 era rim b
333 miniblok
334 big cow
335 cowbell
336 smugl cow
337 mikro tri
338 triangul
339 triangular a
340 triangular b
341 egg
342 ghurkin
343 microshake
344 shake a
345 shake b
346 shake c
347 finga tamb
348 flexatone
349 tamb a
350 tamb b
351 digiblok
352 digichik
353 ehx dubperc
354 ehx paow a
355 ehx paow b
356 ehx trigga
357 lazer
358 noizer
359 sds perc a
360 sds perc b
361 sds perc c
362 tchik
363 tchok
364 tchong
365 baby g perc
366 baby g tamb
367 drskl tamb
368 mad prof perc
369 mad prof tamb
370 maflux perc
371 maflux shak
372 mpc perc
373 mpc tamb
374 rigo timb
375 ep 40 clave
```

### Bass (400-499)

```
400 alban bass
401 bell bass
402 cs bass a
403 cs bass b
404 drskl bass
405 ehx bass
406 elec bass a
407 elec bass b
408 eras bass
409 fall bass
410 growlbass
411 mudbass
412 owlbass
413 risbas a
414 risbas b
415 rigo bass
416 sds bass
417 synbaz
```

### Keys, horns and plucks (500-599)

```
500 clavinet
501 hammond
502 melodica
503 muted guitar
504 opti organ
505 clav wah
506 clav
507 digipluk
508 horn lead
509 horns
510 leroy
511 nosepluk
512 piano far
513 plucky
514 pluk
515 sharpie
516 shartie
517 shawty
518 sun strings
519 tek syn
520 trombone
521 mek pluck
522 bambu pluck
523 carillon pluck
524 pianolarium
525 rokkwild
526 string science
527 tranq pad
528 voxpluk
```

### Chord stabs (the chord in the name) (600-699)

```
600 beethree amin a
601 beethree amin b
602 beethree emin a
603 beethree emin b
604 beethree gmaj a
605 beethree gmaj b
606 guit amaj
607 guit amin
608 guit dmaj
609 guit dsharp min
610 guit emaj
611 guit emin
612 guit gmaj
613 guit mute a
614 guit mute b
615 horn skank amin
616 horn skank d maj
617 horn skank e min
618 horn skank gmaj
619 pianchrd cmaj
620 pianchrd cmin
621 pianchrd dmin
622 pianchrd fmaj
623 pianchrd gmin
624 piano stab fmaj
625 piano stab gmin
626 tekdub amin7
627 tekdub bbmaj
628 tekdub cmin
```

### Vocal shouts and dub FX (700-799)

```
700 rewind
701 on and on
702 million boom
703 hyper champion
704 call it
705 jooh
706 etana one two
707 champion
708 hyper one
709 million brrr
710 etana roots
711 global
712 iiyehh
713 million shout
714 bough
715 dnb
716 trigga
717 etana skankin
718 foundation
719 hyper sticky
720 one
721 mash
722 maximize
723 rigo vox a
724 rigo vox b
725 rigo vox c
726 m crown vox a
727 m crown vox b
728 m crown vox c
729 m crown vox d
730 m crown vox e
731 alert
732 babylon
733 backspin m
734 big boing
735 foghorn
736 hiss
737 honk
738 hookah
739 rick o che
740 ricochet
741 stupet
742 syren
743 tape
744 tarvezan
745 whap
746 wire
747 xplosion
748 drskl fx a
749 drskl fx c
750 mpc fx a
751 rigo fx a
752 rigo fx b
753 rigo fx c
754 linton
```

### Loops (named with their tempo; see ep40-kit.md) (800-899)

```
800 baby g drms a 71
801 baby g drms b 71
802 baby g drms c 71
803 baby g fill a 71
804 baby g fill b 71
805 baby g fill c 71
806 baby g bass a 71
807 baby g bass b 71
808 baby g bass c 71
809 baby g mel a 71
810 baby g mel b 71
811 baby g mel c 71
812 drskl drms a 81
813 drskl drms b 81
814 drskl drms c 81
815 drskl fill a 81
816 drskl fill b 81
817 drskl fill c 81
818 drskl bass a 81
819 drskl bass b 81
820 drskl bass c 81
821 drskl mel a 81
822 drskl mel b 81
823 drskl mel c 81
824 jammy drms a 85
825 jammy drms b 85
826 jammy drms c 85
827 jammy fill a 85
828 jammy fill b 85
829 jammy fill c 85
830 jammy bass a 85
831 jammy bass b 85
832 jammy bass c 85
833 jammy mel a 85
834 jammy mel b 85
835 jammy mel c 85
836 crown drms a 88
837 crown drms b 88
838 crown drms c 88
839 crown fill a 88
840 crown fill b 88
841 crown fill c 88
842 crown bass a 88
843 crown bass b 88
844 crown bass c 88
845 crown mel a 88
846 crown mel b 88
847 crown mel c 88
848 crown mel d 88
849 mprof drms a 86
850 mprof drms b 86
851 mprof drms c 86
852 mprof fill a 86
853 mprof fill b 86
854 mprof fill c 86
855 mprof bass a 86
856 mprof bass b 86
857 mprof bass c 86
858 mprof mel a 86
859 mprof mel b 86
860 mprof mel c 86
861 mprof mel d 86
862 mflux drms a 134
863 mflux drms b 134
864 mflux drms c 134
865 mflux fill a 134
866 mflux fill b 134
867 mflux fill c 134
868 mflux bass a 134
869 mflux bass b 134
870 mflux bass c 134
871 mflux mel a 134
872 mflux mel b 134
873 mflux mel c 134
874 mpc drms a 82
875 mpc drms b 82
876 mpc drms c 82
877 mpc fill a 82
878 mpc fill b 82
879 mpc fill c 82
880 mpc bass a 82
881 mpc bass b 82
882 mpc bass c 82
883 mpc melo a 82
884 mpc melo b 82
885 mpc melo c 82
886 rigo drms a 94
887 rigo drms b 94
888 rigo drms c 94
889 rigo fill a 94
890 rigo fill b 94
891 rigo fill c 94
892 rigo bass a 94
893 rigo bass b 94
894 rigo bass c 94
895 rigo mel a 94
896 rigo mel b 94
897 rigo mel c 94
898 rigo mel d 94
```
