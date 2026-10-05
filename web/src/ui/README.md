# ui/ — components, navigation and theme for screen workers

The Compose UI (`app/src/main/kotlin/dev/arc/ep133/ui/`) ported to Preact +
plain CSS. Screens read the controller (`state/README.md`) and the navigation
stack through context, and build themselves from the components below.
Every user-visible string comes from `core/text/*`; never retype one.

```
ui/
  AppContext.tsx    useController(), useNav()
  nav.ts            the navigation stack (one history entry per layer)
  coachPlace.ts     pure coach-tag placement (tested)
  theme/            tokens.css, cap.css, base.css, theme.ts (applyTheme), fonts.ts
  components/       primitives + the shell (one .tsx + .css each)
  screens/          one file per Kotlin screen (+ its .css)
  sheets/           the sheets/dialogs mounted by app.tsx (Backups, Device, progress, licence)
  live/             Live-tab helpers: glow.ts (pad fade maths), press.ts (hold-to-play
                    per pointer), keys.ts (KEYS grid, picker layers), Words.tsx (the
                    PADS/KEYS word, SwapMark, PickWord lists); the .ts ones are tested
```

File header: `// Port of app/src/main/kotlin/dev/arc/ep133/ui/<path>.kt`.
CSS lives next to the component and is imported from it.

## Screens: how they are wired

`app.tsx` is Kotlin's `Root()`. It owns the if-chain
(debug → settings → compare → contents → search → shell + tab screen), passes
each screen plain props (state slices + callbacks, the Kotlin signatures), and
mounts the sheets. Screens stay props-driven, so they render in tests without
a controller. A screen may call `useController()` / `useNav()` itself only for
something the props don't cover.

All screens are ported (no stubs left). Tab sheets mount in `App` under
`tabs`: `BackupsSheets` (detail, compare picker, restore, delete) and
`DevicePadsSheet` / `DeviceUploadSheet` (pads, upload, trim); `FontLicenceSheet`
mounts over Settings and `ProgressSheet` (modal) over any tab. Pure logic the
screens factored out is tested under `test/ui/`.

## Navigation (`nav.ts`)

The app is a stack of layers; Back (browser or Android-style) pops one in
Android's order: dialog, side panel, menu, coach, sheet, full screen, tab.
Every open thing is a layer, so Back closes it and a reload restores it.

```ts
const nav = useNav()
const v = nav.view.value                       // NavView, a signal: re-renders on change
nav.selectTab('live')                          // section switch; closes everything above the shell
nav.openScreen({ kind: 'contents', id })       // full screens: settings | debug | search | guide | contents | compare
nav.open(sheetLayer(`detail:${b.id}`))         // sheets
nav.open(dialogLayer('delete'))                // confirm dialogs
nav.open(overlayLayer('side'))                 // 'menu' | 'side' | 'coach'
nav.close(sheetLayer(`detail:${b.id}`))        // remove that layer (only it) from the stack
nav.replace(sheetLayer(`detail:${id}`), screenLayer({ kind: 'contents', id }))  // Detail → Contents in one move
nav.back()                                     // a Done/close key: same as system Back
```

`NavView`: `tab`, `debug`, `settings`, `search`, `guide`, `contentsId`,
`compare`, `menu`, `side`, `coach`, `sheets: string[]`, `dialogs: string[]`.
Sheet/dialog ids in use: `detail:<id>`, `restore:<id>`, `comparePick:<id>`,
`pads:backup:<id>:<n>`, `pads:device:<n>`, `upload`, `trim:<i>`, `licence`,
`progress` (owned by app.tsx), dialogs `delete`, `prune:<keep>`, `forget`,
`pick:scale` / `pick:octave` (Live's KEYS lists, owned by app.tsx).

Mounting a sheet (in `app.tsx`, under `tabs` = `onTabs(v)` for tab sheets):

```tsx
const id = v.sheets.find((s) => s.startsWith('detail:'))?.slice(7) ?? null
<Sheet open={id !== null} onDismiss={() => nav.close(sheetLayer(`detail:${id}`))} label={...}>
  {/* content; it stays mounted with its last data during the exit transition */}
</Sheet>
```

Always dismiss through `nav.close` (never local state), so Back, Escape and
the scrim agree. `onDismiss={null}` makes a sheet modal (no Escape/scrim/Back).
`Sheet` and `Dialog` return focus to the opener themselves. On open, `Sheet`
focuses its panel (no outline), not the first field, so phones don't pop the
keyboard; give a field `autoFocus` to override. A sheet that swaps its own
content (upload ↔ trim) moves focus itself (see `UploadSheet`).

## Coach marks (the "?" overlay)

`CoachHost` (mounted by app.tsx around the shell) finds marked controls when
the overlay opens. Mark a control either way:

```tsx
<span data-coach="backups.search"><IconBlock .../></span>        // tag from COACH_MARKS
<button ref={useCoachMark('side.more', CoachText.MORE_TOOLS, 'var(--ink)', 'var(--shell)')}>
```

Known ids (`COACH_IDS`, labels/colours from the Kotlin call sites):
`top.*`, `edge.guide`, `backups.search|import|open`, `live.pads|groups`,
`live.keys|mode|scale|octave`, `side.more`, `device.refresh|add|switch|play`.
A narrow control flush with the screen's left or right edge (the GUIDE tab,
the more-tools strip) gets a side tag: a vertical tab on that edge with a
hooked arrow (`coachPlace.ts` `edgeOf` / `sideHook`, Coach.kt's side tags). Yellow tip tags use
`COACH_YELLOW` / `COACH_YELLOW_INK`. A custom tag: `data-coach-label`,
`data-coach-face`, `data-coach-ink`. Mark only what is on screen.

## Component catalogue (`components/`)

Common optional props on most: `class`, `id`, `ref`. Colours are CSS values
(`'var(--signal)'`).

| Component | Kotlin | Props |
|---|---|---|
| `Key` | ArcKey | `text`, `onClick?`, `variant?: 'normal'\|'signal'\|'quiet'\|'navy'`, `size?: 'normal'\|'small'\|'wide'`, `disabled?`, `textColor?`, `block?`, `children?` (+ button attrs) |
| `IconBlock` | Icons.kt IconBlock | `icon: ArcIcon`, `label` (aria-label + long-press tooltip), `face`, `ink`, `onClick`, `disabled?`, `size?`=44, `iconSize?`, `round?` |
| `Icon` / `Dot` `Ring` `Gear` `Help` `Refresh` `Plus` `Search` `Import` `Follow` | Icons.kt | `icon` (Icon only), `size?`=22, `color?`, `label?` (else aria-hidden) |
| `PlayKey` | PlayKey | `playing`, `description`, `onClick`, `disabled?` |
| `Field` | ArcField | `label`, `value`, `onValueChange`, `singleLine?`, `minLines?`, `placeholder?`, `maxLength?`, `inputMode?`, `enterKeyHint?`, `type?`, `background?`, `autoFocus?`, `disabled?`, `onSubmit?` |
| `Segmented` | Segmented | `options`, `selected`, `onSelect(i)`, `label?` / `labelledBy?` (radiogroup, arrow keys) |
| `TextToggle` | TextToggle | `options`, `selected`, `onSelect(i)`, `label?`, `controls?` |
| `SwitchRow` | SwitchRow | `title`, `note`, `on`, `onChange(on)`, `disabled?` |
| `ChoiceRow` | ChoiceRow | `text`, `selected`, `onClick`, `radio`, `disabled?`, `trailing?`, `name?` |
| `Caption` | Caption | `text`, `color?`, `align?: 'center'\|'start'\|'end'`, `as?` |
| `GridPlate`, `PlateLine`, `plateRowClass(first,last)` | GridPlate | `children`, `role?`, `aria-label?`, `style?` |
| `DisplayPanel` | DisplayPanel | `children`, `live?`, `style?` |
| `DashedBox` | DashedBox | `children` |
| `Meter` / `ProgressMeter` | Meter / ProgressMeter | `fraction`, `segments?`=24, `hotAbove?`, `tipHot?`, `height?` / `fraction`, `label?` |
| `RangeSlider` | RangeSlider (trim) | `start`, `end`, `min?`, `max`, `step?`, `onChange(s,e)`, `startLabel?`, `endLabel?`, `valueText?`, `disabled?` |
| `Waveform` | TrimSheet waveform | `pcm`, `channels`, `start`, `end`, `label`, `height?`, `columns?` |
| `Sheet` | ArcSheet | `open`, `onDismiss: (() => void) \| null`, `grip?`, `label?` / `labelledBy?`, `children` |
| `Dialog` | AlertDialog (Delete/Confirm) | `open`, `text`, `confirm`, `cancel?`, `confirmColor?`, `onConfirm`, `onDismiss` |
| `Toast` / `ControllerToast` | ArcToast | `toast`, `onTimeout(id)`, `bottomInset?` / `controller` (app.tsx mounts it). Swipe sideways or down to dismiss (`swipeOutcome`); a Dismiss key outside the live region is shown on focus for screen readers |
| `SideZone` | SideZone (Live tools) | `open`, `onOpen`, `onClose`, `title`, `panel`, `children` |
| `ComboView`, `Cap`, `CloseKey` | GuideKeys | `combo`, `spoken` / `cap`, `badgeSpace` / `onClick`, `description` |
| `Shell`, `TopBar`, `SectionTag`, `SectionMenu`, `GuideEdgeTab` | Chrome.kt | mounted by app.tsx; screens don't use them |
| `CoachHost`, `CoachOverlay`, `useCoachMark` | Coach.kt | see above |

The top bar's 8dp spacing is drawn by shrinkable gap spans (not `gap`), so
it matches Android at 360px and gives way only when the tag is long.

## CSS conventions

- **Tokens** (`theme/tokens.css`): colours named after Kotlin `ArcColors` in
  kebab-case (`--shell`, `--key`, `--key-edge`, `--ink`, `--graphite`,
  `--signal`, `--navy`, `--on-navy`, `--plate`, `--line`, `--ok`, `--danger`,
  `--display*`, `--tab-off`); derived ones (`--scrim`, `--row-pressed`,
  `--field-rule`, ...); fixed (`--tag-face`, `--coach-yellow`, `--guide-*`).
  Sizes `--size-*` (ArcType), tracking `--track-*`, weights `--weight-*`,
  radii `--radius-*`, spacing `--space-N` (N = dp), layout (`--column-max`
  560, `--wide-max` 720, `--gutter-start`, `--gutter-end`, `--tap-min`),
  motion (`--key-*`, `--sheet-*`), `--focus-ring` / `--focus-offset`.
- **Caps** (`theme/cap.css`, from `Cap.kt`): `.cap-3d` draws a key as the K.O. II's
  hardware cap, a face over an edge offset 2px right and 3px down (as the
  Sample Tool draws it), pressed on `:active`, `[data-down]`, `.is-down` and
  `[aria-pressed=true]`. Each element sets `--cap-face` (and `--cap-ink`,
  `--cap-edge`, `--cap-glow`); `--hw-*` are the hardware colours. Key,
  IconBlock, Segmented, SectionMenu, PlayKey and the Live pads, keys and
  group keys use it.
  Never hard-code a theme colour: both themes switch by redefining tokens.
- **Type**: `.t-<arctype>` utilities (`t-heading`, `t-small`, `t-tiny`,
  `t-body15`, `t-bold`, `t-caps`, `t-caps-key`, `t-tab`, `t-stat-num`, ...).
  Caps classes uppercase via CSS: pass strings as written. Styles with a line
  height under 1.366em carry `padding-block: var(--trim-*)` to match Compose's
  untrimmed first/last line; do the same if you re-declare one in a component.
  Tabular numbers are on globally.
- **Hatching**: `.hatch` (9px) / `.hatch-7` (side strip).
- **Naming**: BEM-ish, `.block`, `.block__part`, `.block--variant`; state as
  `.is-on` / `.is-shown` or ARIA attributes (`[aria-pressed=true]`).
- **Accessibility**: real `<button>`s; `aria-label` = the Android
  contentDescription / long-press name; `:focus-visible { outline: var(--focus-ring) }`;
  wrap transitions in `@media (prefers-reduced-motion: reduce)`.
- **Layout**: phone first (393dp reference). Columns cap at `--column-max`
  and centre; no horizontal page scroll at 320px.

## Checking your screen

```
npm run check                                   # tsc + vitest + vite build
node scripts/shot.mjs <out.png> '/backups' --query=demo [--dark] [--size=412x843]
```

`?demo` fills the controller with the fixture device and backups
(`src/dev/demo.ts`). Compare with the Android PNG of the same screen in
`app/src/screenshotTestDebug/reference/dev/arc/ep133/screens/` (Android px ÷
2.625 = dp; web shot px ÷ 2 = CSS px). `shot.mjs` prints page errors.
The demo starts with an empty library and plays short (85–400 ms) samples, so
a Playwright check for a Play→Stop key must poll, not sleep. Headless Chromium
leaves `requestMIDIAccess()` pending (the permission prompt is never answered)
without `?demo`; the library (import a .pak, contents, search) works there.
