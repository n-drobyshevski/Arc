# arc for EP-133 K.O. II

A free, open-source backup librarian for the teenage engineering EP-133 K.O. II. It runs in Chrome on Android (or desktop) and talks to the device over USB-C with WebMIDI. No account, no server, nothing leaves your phone unless you share it.

## What it does

- Back up every sound and project on the device to a `.pak` file stored on your phone
- Restore a whole backup, or only some projects plus the sounds they use
- Keep a library of backups with names and notes
- Share a backup with a friend through the Android share sheet, or save the `.pak` file
- Import `.pak` backups made by the official Sample Tool (and open them from the Files app once installed)
- Works offline once installed to the home screen

Backups use the same layout as the official Sample Tool's `.pak` (a zip with `/meta.json`, `/sounds/NNN name.wav`, `/projects/PNN.tar`), plus a `arc.json` file that keeps per-sound settings like play mode, pitch and envelope.

## Run it

It is a static site with no build step. WebMIDI needs HTTPS (or `localhost`).

```sh
npx serve .            # or any static server
# open http://localhost:3000 in Chrome
```

To use it on your phone, host the folder on any HTTPS static host (GitHub Pages, Vercel, Netlify, Cloudflare Pages), open it in Chrome on Android, plug in the EP-133 with a USB-C cable, tap Connect and allow MIDI. Use "Add to Home screen" to install it.

Firefox and Safari (including every iOS browser) do not support WebMIDI with SysEx, so they can manage saved backups but cannot connect to the device.

## Tests

```sh
npm test
```

The tests check the SysEx encoder and parsers against frames captured from the official Sample Tool, and run full backup and restore cycles against a simulated EP-133 (`test/mock-device.js`), with and without per-chunk acknowledgements.

## Status

This has been built and tested against captured traffic and a simulator, not yet against a physical unit. Try it on a device whose contents you have also backed up with the official Sample Tool, and open an issue with the error text if anything fails.

Not supported yet: deleting sounds on the device, EP-40 and EP-1320 specifics, editing samples.

## Protocol credits

The EP-133 file protocol is undocumented. This implementation is original code, written from the reverse-engineering notes and open tools of:

- [wmealing/KO2-SYSEX](https://github.com/wmealing/KO2-SYSEX), Sample Tool traffic captures
- [phones24/ep133-export-to-daw](https://github.com/phones24/ep133-export-to-daw), file list, read and metadata commands
- [seajaysec/ep-unity](https://github.com/seajaysec/ep-unity), upload, project restore and re-initialisation details

Not affiliated with or endorsed by teenage engineering. EP-133 and K.O. II are their trademarks.

## License

MIT
