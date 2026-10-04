# arc for EP-133 K.O. II (Android)

A free, open-source backup librarian for the teenage engineering EP-133 K.O. II, as a native Android app. It talks to the device over USB-C with Android's MIDI API (`android.media.midi`). No account, no server, nothing leaves your phone unless you share it.

This is a port of the web version in [`reference/`](reference/), which is kept read only as the spec. The two behave the same and their `.pak` files are interchangeable.

## What it does

- Back up every sound and project on the device to a `.pak` file stored on your phone
- Restore a whole backup, or only some projects plus the sounds they use (optionally also the sounds no project uses)
- Keep a library of backups with names and notes
- Share a backup through the Android share sheet, or save the `.pak` file anywhere with the system file picker
- Import `.pak` backups made by the official Sample Tool, by the web version or by a friend, and open them by tapping a `.pak` in the Files app
- Keep running when the phone is locked: transfers run in a foreground service with a progress notification and a Cancel action

Backups use the same layout as the official Sample Tool's `.pak`: a zip with `/meta.json`, `/sounds/NNN name.wav` and `/projects/PNN.tar`. On top of that, an `arc.json` file keeps per-sound settings like play mode, pitch and envelope.

A hidden debug screen (long-press the **arc** wordmark) shows every SysEx message sent and received, and can share, save or copy the log as a text file.

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
```

Install the debug APK with `adb install app/build/outputs/apk/debug/app-debug.apk`, or open the project in Android Studio.

The tests read `reference/test/fixtures/sample.pak` in place, so keep `reference/` next to the modules.

### Versions

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

Apart from AndroidX, Kotlin and kotlinx libraries, the only third-party code is the bundled Manrope font (SIL OFL, `app/src/main/assets/OFL-Manrope.txt`).

## Layout

```
core/   pure Kotlin/JVM, no Android imports, runs in plain JUnit
  protocol/  packed7, frame, session, fs, device (the SysEx protocol), SysEx reassembly, port matching, traffic log
  formats/   zip, wav, tar, crc32, and JsJson (JSON.parse / JSON.stringify with JavaScript's exact output)
  backup/    backup, restore and the .pak layout
  text/      every interface string and the small library/restore rules from app.js
app/    Android: MIDI transport, foreground service, Room library, files and sharing, Compose UI
reference/   the web version (read only)
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
- **Other units:** interface text and restore-selection rules, SysEx reassembly (a reply split at every byte offset), port-name matching, the log export, and the Room converters.

## Status: what is verified and what still needs a real device

Verified here, on the JVM:
- The protocol, file formats, backup and restore logic, against the simulator and against frames captured from real hardware by others.
- `.pak` compatibility with the web version, in both directions.
- The app compiles for SDK 37, passes Android lint (including the core module against API 29), and builds a debug APK.

Not verified yet. Nobody has run this on a phone or an EP-133:
- **USB MIDI on a real phone.** Discovery and the port names Android reports for the EP-133. Whether 16 back-to-back 510-byte upload frames survive the USB link. How Android splits incoming SysEx. Detach during a transfer.
- **The real device's answers** to everything the simulator only imitates, for example whether it acks upload chunks, metadata paging, crc reporting and the active-project switch.
- **The app UI on screen.** It was built and linted, but never launched: this environment has no emulator (no KVM).
- **Platform behaviour:**
  - the foreground service and notification on Android 14–16
  - the `.pak` intent filter with various file managers
  - SAF save and import with different providers
  - sharing to other apps

### First run checklist

Back up the EP-133 with the official Sample Tool first. Then, with the debug screen at hand (long-press **arc**):

1. Plug in the EP-133 and turn it on. arc should connect by itself, or tap **Connect**. The panel shows the product, OS version, sound and project counts, free space and the meter.
2. Tap **Back up device**. Lock the phone halfway through: the notification should keep updating and the backup should finish.
3. Open the backup and check the counts against the device. Share it, and save it with **Save .pak file**.
4. Restore a single project with its sounds, then the whole backup. Try **Cancel** during a restore.
5. Unplug the cable during a transfer. You should see an error, and the app should recover after you plug it back in.
6. Open a `.pak` from the Files app, and import one made by the official Sample Tool.

If anything fails, export the SysEx log from the debug screen (**Share log** or **Save log**) and attach it to an issue together with the error text.

## Protocol credits

The EP-133 file protocol is undocumented. The web version this app is ported from was written from the reverse-engineering notes and open tools of:

- [wmealing/KO2-SYSEX](https://github.com/wmealing/KO2-SYSEX), Sample Tool traffic captures
- [phones24/ep133-export-to-daw](https://github.com/phones24/ep133-export-to-daw), file list, read and metadata commands
- [seajaysec/ep-unity](https://github.com/seajaysec/ep-unity), upload, project restore and re-initialisation details

Not affiliated with or endorsed by teenage engineering. EP-133 and K.O. II are their trademarks.

## License

MIT (see `LICENSE`). Manrope is licensed under the SIL Open Font License 1.1.
