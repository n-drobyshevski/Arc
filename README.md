# arc for EP-133 K.O. II (Android and web)

A free, open-source backup librarian for the teenage engineering EP-133 K.O. II, as a native Android app. It talks to the device over USB-C with Android's MIDI API (`android.media.midi`). No account, no server, nothing leaves your phone unless you share it. The same app also runs in the browser: see [Web app](#web-app).

This is a port of the web version in [`reference/`](reference/), which is kept read only as the spec. The two behave the same and their `.pak` files are interchangeable. [`web/`](web/) is a port of this Android app back to the browser, with every feature below; it also reads and writes the same `.pak` files.

The look keeps the web version's device panel, keys and orange signal, and borrows its layout from teenage engineering's pocket operator app. There is no bar along the bottom. The top left holds a tag naming the section, like the PO app's EDIT tag; tap it for **Backups**, **Live** or **Device** (long-press opens the debug screen). The EP-133 shortcut guide is a **GUIDE** tab on the left edge, like the PO's TUTORIAL tab, that slides the guide in over the page. The controls are icons, as on the PO's top row. The top bar holds the section tag, then an orange **●** (back up), the connection key (green with a dot while connected, where a tap disconnects; navy with a ring when not), **?** and the settings gear. Long-press any icon for its name; screen readers read it too. **?** opens a guide overlay, shown once by itself on the first start: the page fades and every control on screen gets a coloured tag with an arrow, like the PO app's tutorial. View switches are quiet words with an underline. Every key is drawn as the official Sample Tool draws the K.O. II: a flat face over a flat edge offset down and to the right, and pressed, the face travels onto its edge; a choice that is on stays down. Live's pads are dark keys sitting in the device's grey body, labelled top left as on the device, over pale A–D keys with an LED above each (the group shown stays down with its LED lit). The landscape piano's keys are the same: white and black keys standing in the grey body, down while they sound on the phone. The page is cream with navy ink, labels are uppercase, and lists sit on pale plates split by thin lines. arc opens on **Live**, and Back on any other section returns to it.

The whole app turns with the phone, following Android's auto-rotate (with auto-rotate off, tap the rotate button Android shows). Turning doesn't restart anything: Live keeps its read of the device, its lights and the notes you hold fade out. On its side the top bar slims down and takes Live's display line and the messages in its middle, so they never cover the keys (in a window too narrow for that, such as a split screen, they stay on the page and at the bottom); Backups shows the device as one line above the list, and the trim view lays its keys beside the waveform.

## What it does

- Back up every sound and project on the device to a `.pak` file stored on your phone
- Restore a whole backup, or only some projects plus the sounds they use (optionally also the sounds no project uses)
- Keep a library of backups with names and notes
- Share a backup through the Android share sheet, or save the `.pak` file anywhere with the system file picker
- Import `.pak` backups made by the official Sample Tool, by the web version or by a friend, and open them by tapping a `.pak` in the Files app
- **Survive reinstalling arc:** every backup is also written to **Documents/arc**, with a `library.json` that keeps titles, notes, dates and arc's config: the settings you chose, Live's learned pad names and pad order, and whether the guide overlay was shown. Live's last read of the device goes there too, as `live.json`. Edits update the copy, and deleting a backup in arc deletes its file there too.
  - After a reinstall, tap **Restore from Documents/arc**: on the empty library, or under the list until the folder has been picked. Android makes you pick the folder once; the picker opens there. Only settings you changed are written, so using a fresh install before restoring never resets the old ones, and pads learned in the meantime are kept alongside the restored ones.
    - Only Documents/arc, or a folder that already holds arc backups, is taken as the library. Any other folder is refused.
    - Backups already in arc are skipped.
  - On every start, anything missing from the folder is copied there: a library from before this version, or a copy that failed earlier. A failed copy is reported with the result of the save or delete.
  - Google's automatic app backup is not used, because it is capped well below the size of one backup.
- Keep running when the phone is locked: transfers run in a foreground service with a progress notification and a Cancel action

These go beyond the web version:
- **Browse the device:** the **Device** tab shows the storage meter and switches between **Sounds** and **Projects**. Sounds are grouped by hundreds of slots (001–099, 100–199, …), can be found by name or slot number, and each row has a round **Play** key that downloads the sound and plays it on the phone in one tap. Tap a row for its channels, sample rate, settings and checksum. Projects are tiles: tap one to see the sounds it uses, by name, and its **Pads**.
- **Add samples:** pick WAV files on the phone and load them into sample slots. Each file gets the next free slot, which you can change; an occupied slot is replaced. Uploads take exactly the restore path, so they get the same free-space check, resampling above 46875 Hz, checksum verification and Cancel.
- **Compare with device:** in the restore sheet, see what a restore would change before running it: which sounds differ, are missing or have other settings, which projects differ, and what on the device the restore leaves alone. Nothing is written.
- **Backup contents:** tap **Contents** in a backup's sheet to list its sounds and projects. No device is needed.
  - Sounds play on the phone, and share or save as WAV files exactly as stored in the backup.
  - Each project shares or saves as its own `.pak` with only the sounds it uses, in the same layout, so it restores like any other backup.
- **Trim before upload:** each file picked under **Add samples** has a **Trim** key. It opens a waveform where you set the start and end, hear the selection, and reset. The cut happens at upload time, at the file's own sample rate, and loop points embedded in the WAV move with the new start.
- **Play from the device:** in the device browser, a sound's details have a **Play** key that downloads the sound and plays it on the phone.
- **Pad layout:** a **Pads** key on a project, in a backup's contents or on the device, shows each group's pads with the sound on each. In a backup, tapping a pad plays its sound. Pads are listed by their number in the project file; how those numbers map to the physical pads isn't known, so the grid doesn't claim to match the device's layout.
- **Search sounds:** a **Search** key next to **Import** finds sounds by name in every saved backup. Tapping a result opens that backup's contents.
- **Compare two backups:** **Compare with another backup** in a backup's sheet shows what changed from the older one to the newer one: sounds added, removed or changed (audio, name or settings) and projects added, removed or changed, with the pads that moved. Audio counts as the same when the samples are the same, even in a differently written WAV file.
- **Live mirror:** the **Live** tab shows the EP-133 as you play it, either all four groups or **one group** at a time as a large grid with A–D keys under it (lit while that group sounds). The hatched strip on the right edge (the PO app's "more tools") opens **Live tools**: the view switch, **Follow** (switches to the group of the pad just played), the KEYS strip, pad numbering and the notes on what is official. The page reads the sound names and the active project's pads once (as the device browser does), then only listens; nothing on the device is changed. arc keeps that read, so without the device (unplugged, or not yet connected) Live still shows the pads with their sample names as last seen, marked **Offline** with the time of the read (tap **Offline** for a note on why). Tap a pad, connected or not, to hear its sample on the phone. arc plays it from its own copy of the device's sounds: while Live is open with the device connected, it copies the samples on the active project's pads one at a time in the background, and any action you start waits at most for the sound being copied. Without a copy it plays from the newest backup holding that sound, or downloads it from the device when connected. Several pads or keys play at once (up to 8 sounds), so held fingers make a chord. A pad or key sounds only while it is held, as in the EP-133's gate mode: it starts when touched, each finger on its own, and fades out quickly when the finger lifts (the quickest tap still sounds briefly). On the scrolling all-groups page a press waits a moment first, so a scroll plays nothing. A screen reader's Play plays the whole sample. To keep the delay from press to sound short, Live keeps one low-latency sound output open while it is on screen (at the phone's own sample rate, on Android's fast mixer path where the phone offers it) and mixes the pads and keys into it itself, converting the EP-133's 46875 Hz and the KEYS pitch as it goes; the samples on the active project's pads are loaded into memory when Live opens, so a press doesn't read or decode anything. The debug log notes how the output was set up and, for each press, how long after it the sound left the phone. Bluetooth adds its own delay (often 0.2 s or more), which arc points out once. Each pad playing gets an orange ring. The word right under the grid (**PADS** with the PO app's two-squares mark, like its DRUMS / KEYPAD) switches to KEYS on a tap, and back, after the EP-133's KEYS mode and the PO app's melodic grid: the 12 pads become notes of one sound (the pad last tapped, or last played on the device), named in fixed-do solfège (DO DI RE … TI) or, by a Settings choice, letters (C C# D … B), ringed orange on the scale's root and navy on its other notes (the number in its corner is the octave; a small legend in Live tools explains the colours). Tap a key to hear that sample repitched on the phone (like a sampler: higher is shorter), offline too; in KEYS the row under the keys also holds the scale and the octave as words in the same style (tap either for its list: chromatic, major, minor, the modes, pentatonics, blues; octaves 0 to 8), and Live tools picks the key. Notes the EP-133 sends in its own KEYS mode light their key, by name when its octave differs. Settings shows the space the copies take and clears them.
  - **Piano:** turn the phone on its side and KEYS becomes a piano with every semitone. It starts on the C an octave under OCT's C and shows as many keys as fit with each white key at least 44 dp wide: one octave on the narrowest phones, 1½ (DO3 to SO4 at OCT 4) or 2 on phones, 3 on a tablet. On the two-octave plate (a Pixel 7) it runs from DO3 to DO5 (C3–C5) at OCT 4, so the sample's own pitch is in the middle. As on the grid, the scale's notes are ringed navy and the key's root orange (with a bar at its foot); the other keys fade and lose their names but still play. Slide a finger across the keys to run through the notes, and hold several for a chord. The row above the keys holds the mode, the scale, a **KEY** word that picks the root, and the octave between **−** and **+**, which shift it an octave as the EP-133's own − and + do. Notes from the EP-133 light their exact key; one past either end puts an orange mark at that end, and the display line names it when nothing is playing on the phone. Screen readers read each key's note and whether it is the root, in the scale or outside it, with Play to hear it. In PADS, one group fills the height with A–D beside it, and all four groups sit in one row (a narrow window keeps the scrolling page, so the pads stay at least 40 dp).
  - Pads light up in the keypad layout as notes arrive, brighter with velocity, and fade on release. This follows the official MIDI note map: notes 36–83, one octave per group.
  - Play/stop and tempo come from MIDI clock, which the device sends only with clock out switched on (SHIFT + ERASE, then 102 and ENTER).
  - Notes outside the pads, from KEYS mode, show on a keyboard strip with their channel.
  - **Sample names on the pads** rely on community notes, not the official guide:
    - A physical pad press also makes the device send its pad file id over SysEx.
    - arc pairs that with the note to learn which pad is which, then names the sample from the project's pads. One press of a key, in any group, names that key in every group, and arc remembers it; nothing is guessed, and two pads of one group hit together don't count.
    - Community notes disagree on how project files number the pads, so the page has a switch to count them from the top or from the bottom.
- **Record what you play (REC):** the **REC** key on Live's display (in the top bar, with the display line, on a phone on its side) records the pads and keys played on the phone into a take, with or without the EP-133. Tap it to arm (the dot blinks): recording starts with the first sound, so a take has no silence in front, and the display counts the time. Tap again to stop; silence after the last sound is left out, and if nothing was played nothing is saved. Leaving Live stops and saves a take too, and one stops by itself at 10 minutes. A take is a stereo 16-bit WAV at the phone's output rate (usually 48 kHz), copied from Live's own mix as it is played, so it sounds exactly as you heard it (gates, chords and KEYS pitch included) but holds nothing the EP-133 itself plays. **Live tools → Takes** lists them, newest first: play one, or tap it to share or save the WAV, delete it, or, while the EP-133 is connected, send it **To EP-133**, which opens the Device tab's upload sheet with the take (pick the slot, trim it, upload; above 46875 Hz it is resampled as any upload is). Takes stay in arc's own storage until deleted.
- **Settings:** the gear at the top right. Theme (system, light or dark); whether arc connects by itself when an EP-133 is plugged in; whether the screen stays on in Live; how many backups to keep (all, 5, 10 or 20: after each backup or import the oldest beyond that are deleted, here and in Documents/arc, and lowering it asks first); Live's pad numbering and forgetting learned sample names; the version, source, font licence and the debug log. The settings are saved in Documents/arc with the library, so they come back after a reinstall.
- **Shortcut guide:** 100 EP-133 key combinations in tabs by section, with search, laid out like a printed guide: each combination drawn as the device's keys (pale keys, dark keys, pads, knobs and the fader), with HOLD, DIAL, TURN and MOVE badges, and what it does below. A test checks that every key drawn is named in that entry's text from the official guide. Every entry is paraphrased from teenage engineering's official user guide for OS 2.5, and links to the section it comes from. Combos the guide doesn't document are left out.

Backups use the same layout as the official Sample Tool's `.pak`: a zip with `/meta.json`, `/sounds/NNN name.wav` and `/projects/PNN.tar`. On top of that, an `arc.json` file keeps per-sound settings like play mode, pitch and envelope.

A debug screen (Settings → **Debug log**, or long-press the section tag) shows every SysEx message sent and received, and can share, save or copy the log as a text file.

## Web app

The same app runs in Chrome or Edge, on a computer or an Android phone, at **https://arc-pi-mauve.vercel.app**. It talks to the EP-133 over USB-C with WebMIDI. Everything above is there: backup, restore, the library, contents, compare, search, the device browser, sample upload with trim, pads, the live mirror (opening on Live, shown as one group with A–D by default where Android starts on all four groups, pads that sound while held, chords of up to 8 sounds, KEYS with solfège or letter note names, and Offline from the last read), settings, the shortcut guide and the debug log. It looks and reads like the Android app, and its `.pak` files and `library.json` are the same files the Android app writes, so a library moves between the two.

The browser asks once for MIDI access when you connect. It can be installed from the install icon in the address bar or the browser's menu (**Add to Home screen** on Android), and then opens in its own window like an app. After the first visit it works offline. A new version is downloaded in the background and shows **Reload**; arc never reloads in the middle of a transfer.

| Browser | EP-133 over USB |
|---|---|
| Chrome, Edge, Opera, Brave on Windows, macOS, Linux and ChromeOS | Yes |
| Chrome on Android | Yes |
| Firefox on a computer | Only after you accept Firefox's prompt to install its site permission add-on for MIDI |
| Safari, and every browser on iPhone and iPad | No. The library still works: import, contents, playback, export, compare, search and the guide |

Where WebMIDI is missing, arc says so on the panel and the controls that need the device are disabled; the rest works as usual. The page needs HTTPS (or `localhost` during development) for MIDI.

How it differs from the Android app:
- **No background transfers.** A browser has no foreground service. Keep the tab in front and the cable plugged in until a backup or restore is done: in a background tab timers slow down and the transfer can stall. While a task runs the screen is kept on, the tab title shows the progress, leaving the page asks first, and hiding the tab shows a reminder. Cancel is on the progress sheet.
- **The library lives in the browser** (IndexedDB), so clearing the site's data deletes it. arc asks the browser to keep it.
  - On Chrome, Edge and other Chromium browsers on a computer, **Pick a library folder** keeps a copy of every backup outside the browser, the same `.pak` files and `library.json` as Documents/arc on Android. Pick a folder named `arc`, or one that already holds arc backups. After a browser restart, one tap on **Reconnect library folder** gives arc access again.
  - Elsewhere, including Chrome on Android, **Export library** saves every backup and `library.json` as one zip (`arc-library.zip`); export now and then to keep a copy.
  - **Restore from a folder** also works without a library folder: pick an arc folder (one written by this app, Documents/arc copied from a phone, or an unzipped export) and its backups, titles, notes and settings come in. Backups already in the library are skipped.
- **Opening a `.pak`:** double-clicking a `.pak` opens it in arc only with the installed app on a computer with a Chromium browser. Everywhere else, use **Import** or drag the file onto the page.
- **Sharing** uses the browser's share sheet where it can take files; otherwise the file is saved instead, and arc says so.
- **Live's sound** comes from Web Audio: one low-latency output (an AudioWorklet that mixes the pads and keys, at the output's own rate) while Live is on screen. How quickly a press is heard depends on the browser and the system's audio stack, not on arc; the debug log shows each press's delay. A browser only starts sound after a tap, so on a phone the very first touch on a fresh page may sound only briefly; the next ones play normally.
  - Browsers don't say where the sound goes, so arc can't see Bluetooth: when the output's own delay is long (120 ms or more), it points the delay out once, as Android does for Bluetooth.
  - Arc's copies of the pad sounds are kept in the browser (IndexedDB), next to the library; Settings shows their size and clears them. Live's last read (`live.json`) goes to the library folder or the export zip, like Documents/arc.
- **One tab at a time** talks to the EP-133. Another tab or window says so when you connect; the library stays in step across tabs.
- **Try it without an EP-133:** add `?demo` to the address (https://arc-pi-mauve.vercel.app/?demo). A simulated EP-133 with 12 sounds and 3 projects is plugged in, so you can back up, restore, compare, browse the device and upload samples. It is the simulator the tests use, not a real device, and nothing leaves the page. The demo keeps its own library and settings, so it never touches your real ones.

### Develop

Node 22 or newer.

```sh
cd web
npm ci
npm run dev        # http://localhost:5173, add ?demo for the simulated device
npm run check      # typecheck, unit tests (Vitest), production build
npm run e2e        # Playwright smoke test of the built app in Chromium (once: npx playwright install chromium)
npm run gen:guide  # regenerate src/core/text/guideData.ts from core's GuideText.kt
```

[`web/README.md`](web/README.md) has the layout of the code and how it maps to the Kotlin. [`.github/workflows/web.yml`](.github/workflows/web.yml) runs the typecheck, tests, build and smoke test on every pull request and push to `main` that touches `web/`.

### Deploy

The Vercel project `arc` builds from `vercel.json` at the repository root: it installs and builds `web/` and serves `web/dist`. The same file sets the cache headers for `sw.js`, the manifest and `assets/`, allows MIDI for the site, and sets a strict Content-Security-Policy that also keeps arc out of other sites' frames. A push to `main` deploys to production at https://arc-pi-mauve.vercel.app; a push to any other branch gets its own preview deployment. Production builds show the version exactly (`0.2.0`), previews and local builds add `-dev`. The version comes from `version.properties`, as for Android, and `.pak` files name it the same way (`arc 0.2.0`).

**Status:** the web app has been tested against the simulator (unit tests and the Playwright smoke test with `?demo`), not yet with a physical EP-133. The open questions under [Status](#status-what-is-verified-and-what-still-needs-a-real-device) apply to it too, plus WebMIDI's own: how Chrome splits incoming SysEx, and whether the upload window survives Chrome's MIDI send buffer.

## Build

Requirements:
- JDK 17 or newer (built with JDK 21).
- The Android SDK with platform 37 and build-tools 37.0.0.
- Gradle needs nothing installed beyond the included wrapper (Gradle 9.8).

```sh
# once: tell Gradle where the SDK is
echo "sdk.dir=$ANDROID_HOME" > local.properties

./gradlew test                  # all unit tests (core + app)
./gradlew :app:assembleDebug    # app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:lintDebug        # Android lint, including the core module against minSdk 29
./gradlew :app:updateDebugScreenshotTest  # renders the screens in app/src/screenshotTest to PNGs
```

Install the debug APK with `adb install app/build/outputs/apk/debug/app-debug.apk`, or open the project in Android Studio.

### Get a test build

Every pull request and every push to `main` runs [`.github/workflows/android.yml`](.github/workflows/android.yml). It runs the tests, then lint, then builds the debug APK.

To install that build:
1. Open the latest run under the repository's **Actions** tab.
2. Download the `arc-debug-apk` artifact and unzip it.
3. Install `app-debug.apk`, either with `adb install -r app-debug.apk` or by opening the file on the phone and allowing installs from that source.

Every debug build, from CI or a local machine, is signed with the same debug key: `app/debug.keystore`, committed on purpose. CI fails if an APK is ever signed with anything else. So a newer test build installs over an older one and keeps the backups stored in the app.

The key is public, so it is only for test builds and never signs a release. Anyone with the repository could sign an APK that installs over a debug build of arc, so install test builds only from this repository's Actions runs.

**One last uninstall:** builds made before the shared key was added were each signed with their own key. To move from one of those to a newer build, uninstall arc once more. That deletes the backups stored in the app, so share or save the ones you want to keep beforehand. After that, new builds install over old ones.

The tests read `reference/test/fixtures/sample.pak` in place, so keep `reference/` next to the modules.

### Versions and releases

arc follows [Semantic Versioning](https://semver.org/). A major version breaks `.pak` or library compatibility, a minor version adds features, a patch version fixes bugs. Changes are listed in [`CHANGELOG.md`](CHANGELOG.md).

- **One place:** `version.properties` (`version=0.2.0`) sets the version. The build fails if it isn't `MAJOR.MINOR.PATCH` with minor and patch below 100.
- **versionCode** is computed from it: `major*10000 + minor*100 + patch` (0.2.0 is 200), so every new version installs over the previous one.
- **versionName:** local builds are `0.2.0-dev`; CI builds add the run number and commit, `0.2.0-dev.57+abc1234`; release builds are exactly `0.2.0`. It shows in **Settings** and at the top of the debug log.
- **.pak files** name the version that wrote them in `meta.json` (`"author": "arc 0.2.0"`, without the `-dev` part). The compatibility test builds its backup with the web version's own version string so it can still compare byte for byte.
- **To release:**
  1. Bump `version.properties` and move the `Unreleased` notes in `CHANGELOG.md` under `## [X.Y.Z] - date`. Commit and merge.
  2. `git tag vX.Y.Z && git push origin vX.Y.Z`.
  3. The **Release** workflow checks that the tag matches `version.properties` and that the changelog has that section. It then runs the tests, lint and build, and publishes `arc-X.Y.Z.apk` as a GitHub Release with those notes.

  The release APK is signed with the same shared debug key as every CI build, so it installs over test builds. There is no separate release key yet.

### Toolchain

| | |
|---|---|
| Package | `dev.arc.ep133` |
| minSdk / targetSdk / compileSdk | 29 / 37 / 37 |
| Gradle | 9.8 |
| AGP | 9.4.1 (built-in Kotlin) |
| Kotlin | 2.3.21 |
| Compose BOM | 2026.09.00 (Material 3 1.4) |
| Room | 2.8.5 (KSP) |
| kotlinx.coroutines / kotlinx.serialization | 1.11.0 |
| Tests | JUnit 5, kotlinx-coroutines-test |

Apart from AndroidX, Kotlin and kotlinx libraries, the only third-party code is the bundled Manrope font. For tests only, Google's Compose Preview Screenshot Testing plugin renders screens to PNG (`app/src/screenshotTestDebug/reference/`); nothing from it ships in the app (SIL OFL, `app/src/main/assets/OFL-Manrope.txt`).

## Layout

```
core/   pure Kotlin/JVM, no Android imports, runs in plain JUnit
  protocol/  packed7, frame, session, fs, device (the SysEx protocol), SysEx reassembly, port matching, traffic log
  formats/   zip, wav, tar, crc32, and JsJson (JSON.parse / JSON.stringify with JavaScript's exact output)
  backup/    backup, restore, the .pak layout, and exporting a sound or a project
  features/  device browser, sample upload, trim, pad layouts, sound search, and comparing a backup with the device or another backup (additions to the web version)
  text/      every interface string, the small library/restore rules from app.js, and the shortcut guide
app/    Android: MIDI transport, foreground service, Room library (with a sound-name index for search), files and sharing, Compose UI
reference/   the web version (read only, the spec)
web/    the browser app: a TypeScript port of core/ and app/ (Vite, Preact), see web/README.md
vercel.json  Vercel build and headers for web/
```

Each core file is a port of the matching JS file and says so at the top. The UI follows `reference/styles.css`: a grey shell, pale keys whose bottom edge presses down, one orange key (#FF4C00) and a dark display panel. Light and dark themes come from the same tokens.

## Faithful to the web version

The EP-133 file protocol is undocumented and was reverse engineered, so the JS is ported line by line. These behaviours are kept on purpose:

- Every request carries a 12-bit request id in bytes 6 and 7, and replies are matched by that id.
- After every completed file download or upload, the app redoes the handshake (identity, greet, file init). Otherwise the device drops the next command.
- Download page numbers are 14-bit little-endian, and the echo check accepts either byte order. One empty data page is tolerated; two in a row are an error.
- Uploads:
  - Data goes out in 433-byte chunks with a window of 16 unacknowledged frames.
  - If no ack ever arrives, the app stops windowing after one 600 ms stall and streams the rest.
  - A barrier request after the last chunk confirms the device has processed everything.
- Metadata writes are capped at 320 bytes. Optional sound keys are dropped in the web version's order to fit.
- Sound uploads are verified by comparing the device's crc with a CRC32 of the PCM, with one retry.
- After a project upload, the app switches the active project away and back. The originally active project is restored at the end.
- Restore checks free space before writing anything.
- Sample rates above 46875 Hz are resampled down, and loop points are scaled to match.
- If the device lists no projects, the backup probes projects 1 to 9.

The behaviours above are commented where they happen in the code. The same goes for odd details of the JS that were kept, such as how "Also restore sounds no picked project uses" really means sounds that no project in the backup uses.

## Deliberate differences

- **Three web-only sentences are reworded for a phone:**
  - "No MIDI on this phone"
  - "This phone can't connect to your EP-133. Your saved backups still work here."
  - "MIDI access was blocked. Unplug the EP-133, plug it back in, then connect again."

  The "this browser can't share files" fallback is gone, because Android always has a share sheet.
- **Auto-connect:** arc connects by itself when an EP-133 is plugged in while the app is open and idle.
- **Hangs become errors:** two inputs that make the JS hang now fail with an error instead. These are a crafted `.pak` whose tar has a negative size, and a WAV with 0 channels.
- **No stale ack handlers:** when an upload fails, its pending ack handlers are dropped, so they can never catch a later reply after the request id wraps.
- **Different error wording for damaged zip data:** the browser's own wording can't be reproduced.
- **New features:** the device browser, sample upload, compare, contents, trim, pads, search and guide screens have no web equivalent, so their wording is new. They use only commands the web version already uses (LIST, metadata get, file download, and the restore path for uploads). Playback, trimming and export happen on the phone.

## Tests

`./gradlew test` runs the following:

- **Ports of the JS tests** (`protocol.test.js`, `e2e.test.js`):
  - frames compared with ones captured from the official Sample Tool
  - real GREET, identity and LIST replies
  - pack7, CRC32, WAV and zip round trips
  - backup then restore against a simulated EP-133, with and without chunk acks
  - restoring one project with only its sounds
  - refusing when the device is too full
  - cancelling between items
- **The simulator:** `MockEP133`, a port of `test/mock-device.js`, including its strictness. It drops commands until the next file init after a transfer, and requires pages in order.
- **Compatibility:**
  - Opens `reference/test/fixtures/sample.pak` (written by the JS) and checks its contents.
  - Backs up the same simulated device in Kotlin and checks that every entry name, the zip header fields, `meta.json`, `arc.json` and all audio match the JS file byte for byte. Compressed bytes may differ.
  - Restores the JS fixture into the simulator.
- **Quirks:** each protocol behaviour listed above, the id wrap, the 16-frame window limit, probing, and timing on virtual time.
- **JavaScript semantics:** `JSON.stringify` output, number formatting, `toFixed`, `Number()` and the WAV, tar and resample arithmetic. The expected values were produced by running the reference under Node.
- **Added features:**
  - the device listing and project-sound lookup
  - uploads into free and occupied slots, including resampling, embedded settings, refusal when full and cancel
  - trimming: cuts, loop points moved and clamped, waveform peaks, a trimmed upload with loops, and a trimmed 48 kHz file that is then resampled
  - export: a sound's WAV, and a project `.pak` whose layout and contents are checked and which restores into the simulator
  - every comparison outcome, including a device that reports no checksum
  - the shortcut guide data: every entry links to the official guide, reads as plain text, and no combination is listed twice
  - pad layouts: they agree with the slots each fixture project uses, and follow the same matching rules for odd entries
  - comparing two backups: added, removed, renamed, audio and settings changes (including settings embedded in the WAV, as the Sample Tool writes them), the same audio in another WAV header, settings missing on one side, and project pad changes in group order
  - sound search: every word must match, case is ignored, results follow the library order
  - live mirror:
    - MIDI parsing: running status, real-time bytes inside messages, velocity 0, SysEx skipped, split packets
    - the official note map and keypad layout
    - pad push parsing, end to end through the session in both possible header forms
    - learning pads from a note and a push in either order, sequenced notes named after learning, both pad orders, project changes, tempo from clock, transport, and the fade
- **The database upgrade:** the version 2 schema Room exports must equal version 1 plus exactly the two search tables, created with Room's own SQL. Room's own migration test needs a device, so this checks the exported schemas instead.
- **Other units:** interface text and restore-selection rules, SysEx reassembly (a reply split at every byte offset), port-name matching, the log export, and the Room converters.

## Status: what is verified and what still needs a real device

Verified here, on the JVM:
- The protocol, file formats, backup and restore logic, against the simulator and against frames captured from real hardware by others.
- `.pak` compatibility with the web version, in both directions.
- The app compiles for SDK 37, passes Android lint (including the core module against API 29), and builds a debug APK.

Not verified yet. Nobody has run this on a phone or an EP-133:
- **USB MIDI on a real phone.** Discovery and the port names Android reports for the EP-133. Whether 16 back-to-back 510-byte upload frames survive the USB link. How Android splits incoming SysEx. Detach during a transfer.
- **The real device's answers** to everything the simulator only imitates, for example whether it acks upload chunks, metadata paging, crc reporting and the active-project switch. Compare depends on the device reporting a checksum; without one it can only compare sizes, and says so.
- **The app UI on screen.** It was built and linted, but never launched: this environment has no emulator (no KVM).
- **Audio playback** with `AudioTrack` on a real phone, including long stereo sounds.
- **OS 2.x firmware.** The protocol port follows the web version, which was written from captures of earlier firmware. Another EP-133 tool (cornerman) lists "updated transfer for firmware 2.0" in its changelog, so OS 2.0 or later may behave differently. Watch the debug log closely on a device running OS 2.x.
- **Upgrading an installed build.** This version adds a table to the app's database. The migration was checked against Room's exported schemas, but it hasn't run on a phone that has backups. To check it, install a build from before the search feature signed with the shared key (`app/debug.keystore`), make some backups, then install a current build over it. Every CI build since the shared key was added includes the new table, so a CI artifact can't be the older build in that test.
- **Pad numbers on the device.** The pad grid lists pads by their number in the project file. Which physical pad each number is hasn't been checked.
- **Documents/arc on real phones:**
  - Writing there goes through MediaStore with no permission. That is expected to work from Android 10 on, but it has only been built, not run.
  - Restoring after a real uninstall and reinstall, through the folder picker, is also untested.
  - Folder pickers differ between phone makers.
- **The live mirror on a real unit:**
  - **The pad push:** its header and payload follow community notes (Ko-tool's parser), and no capture of it exists.
  - **Pad order:** whether project files count pads from the top or the bottom (community sources disagree).
  - **Sequenced pads:** whether pads played by the sequencer light up. The guide doesn't say whether every pad sends notes by default.
  - **Transfers:** whether a pad pressed during a transfer disturbs it.
- **The shortcut guide on a real unit.** It follows the official guide for OS 2.5. Combos can differ on other OS versions.
- **Platform behaviour:**
  - the foreground service and notification on Android 14–16
  - the `.pak` intent filter with various file managers
  - SAF save and import with different providers
  - sharing to other apps

### First run checklist

Back up the EP-133 with the official Sample Tool first. Then, with the debug screen at hand (long-press the section tag):

1. Plug in the EP-133 and turn it on. arc should connect by itself, or tap **Connect**. The panel shows the product, OS version, sound and project counts, free space and the meter.
2. Tap the orange **●** in the top bar (or **Back up device** under the panel, before the first backup). Lock the phone halfway through: the notification should keep updating and the backup should finish.
3. Open the backup and check the counts against the device. Share it, and save it with **Save .pak file**.
4. Restore a single project with its sounds, then the whole backup. Try **Cancel** during a restore.
5. Unplug the cable during a transfer. You should see an error, and the app should recover after you plug it back in.
6. Open a `.pak` from the Files app, and import one made by the official Sample Tool.
7. Open the **Device** tab: check the slots, a sound's details and a project's sounds against the device. Find a sound by name and by slot number. Add a WAV into a free slot and play it on the device.
8. In the restore sheet, tap **Compare with device** right after a backup: it should report no changes. Change a sound on the device and compare again.
9. Open a backup's **Contents**. Play a few sounds, save one as WAV and open it in another app. Save a project, import that `.pak`, and restore it.
10. Under **Add samples**, trim a file to a short part, upload it, and play it on the device. Check the start and the length. If the file has loop points, check them too.
11. On the **Device** tab, tap a sound's round **Play** key without opening the row first, and compare it with the pad on the device.
12. Try a few entries of the **Guide** tab on the device, and note the OS version shown on the panel.
13. **Search** for a sound you know is in one of your backups. When you install a newer build over this one, check that every backup is still listed.
14. Open **Pads** on a project in the device browser and compare it with the pads on the device. Note which number is which pad.
15. Back up, change a pad's sound on the device, back up again, and **Compare with another backup**: it should show that pad change.
16. Check that Documents/arc (in the Files app) holds your backups and a `library.json`. Uninstall arc, reinstall it, tap **Restore from Documents/arc**, pick the folder, and check that titles and notes come back, along with the settings, Live's sample names and pad order, Live's offline view, and no guide overlay on the next start. Do it once more after changing a setting and pressing a pad in Live before restoring: the old settings and names should still come back.
17. Open the **Live** tab and press pads in each group: the lit pad should be the one you pressed. After one press, its sample name should appear. Check the names against the device and, if they look wrong, tap the strip on the right edge and try **From the bottom**. Tap pads while connected and hear them; hold a long sample and let go: it should stop at once; open the debug log and check the "heard … ms after the press" lines (on the phone speaker or wired headphones they should be well under 50 ms on a recent phone); hold three pads, then three keys, at once: all should sound together, each ringed; tap a pad, switch to **Keys** and play: the pitch should rise across the keys, the octave word should move them an octave, and a scale should change the names. Put the EP-133 in KEYS and play: the matching keys should light; start a backup while Live is still copying sounds and check it starts within a moment. Unplug the device with Live open: the display should say **Offline** with the time, and the pads should keep their names and still play when tapped; open Live with no device after restarting arc and the same should show. Clear the pad sounds in Settings: pads should still play when a backup has their sound, and say so when none has.
17a. With the EP-133 unplugged, open Live, tap **REC** (the dot should blink), wait a moment, then play a few pads and a KEYS chord and tap REC again: a toast should say the take was saved, and **Live tools → Takes** should list it with its length. Play it: it should start straight on the first sound and match what you played. Share it to another app and save it to Files; delete one. Connect the device, tap a take, then **To EP-133**: the Device tab's upload sheet should open with the take in a free slot; upload it and play it on the device.
18. Play a pattern: check whether sequenced pads light up. Switch on clock out (SHIFT + ERASE, 102, ENTER) and check play/stop and the tempo. Try KEYS mode.
19. Switch sections from the tag with a backup running and with Live open: the progress sheet should stay up, Live should stop listening when you leave it, arc should open on Live, and Back on any other section should return to Live. Open the guide from its tab on the left edge and close it with Back. Open **?** on each tab: every tag should point at its control without covering another tag (on a phone on its side, nor another control or another tag's arrow). Long-press each icon for its name, and check them with TalkBack.
20. Play a sound from a backup's **Contents** through the phone speaker, wired headphones and Bluetooth. If one stays silent, export the debug log: it has a "play … -> output" line naming where Android sent the sound.
21. In **Settings**: switch the theme; turn **Connect when plugged in** off and plug the EP-133 in (it should stay disconnected until you tap Connect); with 6 backups, set **Keep** to 5 and confirm (the oldest goes from the list and from Documents/arc); make a backup and check the oldest is removed again.
22. Turn the phone in Live's KEYS while holding a chord: the notes should fade out without a click, and the debug log should show no new read of the device. On its side, slide across the piano while holding a chord with the other hand (the chord should keep sounding), and try **−** and **+**. With the three-button bar on either side, and with gesture navigation, check that the strip on the right edge, its panel's ✕ and the GUIDE tab can be tapped, and that holding the keys at the edges doesn't go Back. Turn auto-rotate off: the rotate button Android shows should turn arc. On its side, type in the Device tab's find field, in **Search** and in a backup's sheet. Check the piano's keys with TalkBack. With Live open and a chord held, switch Android's dark mode (quick settings), the system language or the font size, which do recreate arc: the debug log should show no new read of the device and the notes should fade out, not cut off (arc's own Theme setting doesn't recreate it, so it doesn't test this).

If anything fails, export the SysEx log from the debug screen (**Share log** or **Save log**) and attach it to an issue together with the error text.

## Protocol credits

The EP-133 file protocol is undocumented. The web version this app is ported from was written from the reverse-engineering notes and open tools of:

- [wmealing/KO2-SYSEX](https://github.com/wmealing/KO2-SYSEX), Sample Tool traffic captures
- [phones24/ep133-export-to-daw](https://github.com/phones24/ep133-export-to-daw), file list, read and metadata commands
- [seajaysec/ep-unity](https://github.com/seajaysec/ep-unity), upload, project restore and re-initialisation details

Not affiliated with or endorsed by teenage engineering. EP-133 and K.O. II are their trademarks.

## License

MIT (see `LICENSE`). Manrope is licensed under the SIL Open Font License 1.1.
