# Changelog

All notable changes to arc for Android. Versions follow [Semantic Versioning](https://semver.org/):
a major version breaks `.pak` or library compatibility, a minor version adds features, a patch
version fixes bugs. The version itself is set in `version.properties`.

## [Unreleased]

### Added
- Live: chords. Pads and keys play alongside each other (up to 8 sounds at once) instead of cutting each other off, and in the one-group and KEYS grids they play on touch-down, a finger per pad. Every pad or key sounding is ringed. Play in the lists still plays one sound at a time.
- Live: KEYS, like the EP-133's KEYS mode. one word right under the grid, as the PO app's DRUMS / KEYPAD (small, navy, with its two-squares mark), switches **Pads** ⇄ **Keys** on a tap and turns the 12 pads into notes of one sound (the pad last tapped, or last played on the device): tap a key to hear that sample repitched on the phone, offline too. Keys are named in fixed-do solfège (DO RE MI…), navy for the first octave and orange for the next; beside it the scale and the octave are words too (a tap lists the ten scales, or octaves 0 to 8), and the Live tools panel picks the key. Notes the EP-133 sends in its own KEYS mode light their key. The choices are kept with the settings.
- Live: tap a pad to hear its sample on the phone, connected or offline. arc copies the samples on the active project's pads from the device in the background (any action waits at most for the sound being copied), and otherwise plays them from the newest backup holding them or from the device. The playing pad is ringed; Settings shows and clears the space the copies take.
- Live works without the EP-133: it keeps the device's last read (the active project, its pads and the sound names) and shows them, marked offline with when they were read, until the device is connected again.
- Live: a one-group view, a large grid of one group with A–D keys to switch and Follow to jump to the group just played. It fits one screen without scrolling (checked at Pixel 7 and 360 dp sizes). The choice is kept in the settings.

### Changed
- Live: pads and keys sound only while held, as in the EP-133's gate mode, and fade out quickly when the finger lifts, instead of playing the whole sample on a tap. On the scrolling all-groups page a press waits a moment so a scroll plays nothing. A screen reader's Play still plays the whole sample.
- The guide overlay tags the edge controls (the GUIDE tab, the more-tools strip) as the PO app's tutorial does: a vertical tab on that edge with its word turned and a hooked arrow above.
- arc opens on **Live**, and Back from Backups or Device returns to it (it was Backups).
- The GUIDE tab on the left edge is quiet grey, like an unselected key, instead of solid navy.
- No bar along the bottom: the top left shows the section as a tag (like the PO app's EDIT tag) that lists Backups, Live and Device on a tap, and the EP-133 shortcut guide is a GUIDE tab on the left edge that slides it in. Long-press the tag for the debug screen.
- Quieter controls after the pocket operator app: icon keys in the top bar (back up, connection, guide, settings) and in the Backups and Device headers (search, import, refresh, add samples), named on long-press and to screen readers; only the selected tab is a block; view switches are underlined words; play keys are outlines until they play; Follow is a target icon.
- A guide overlay (**?**, and once on the first start) tags every control on screen with its name, like the PO app's tutorial.
- Live's secondary controls (view switch, Follow, KEYS strip, pad numbering and notes) moved into a side panel, opened from a hatched strip on the right edge like the PO app's "more tools", so the page is just the display, the pads and A–D.
- Live's one-group view shows the display as one line (play state, tempo, project and the pad just played), so the pads get the room.

### Fixed
- All of arc's config now survives uninstalling: Live's last read (`live.json`) and the guide overlay's "already shown" flag join the settings and Live's pad names in Documents/arc.
- Restoring from Documents/arc no longer writes the defaults back over the restored settings, and a fresh install no longer overrides the old settings before restoring: only settings you changed are written. Live's pad names learned before and after a reinstall are combined instead of replaced.

## [0.2.0] - 2026-10-05

### Added
- Device browser: every sound slot and project on the EP-133, with free space.
- Sample upload from WAV files, with a trim view before upload.
- Compare a backup with the device before restoring.
- Backup contents: play sounds and export WAV files or single projects without the device.
- Pad layouts of a project, from a backup or the device.
- Search sound names across all saved backups, and compare two backups.
- Shortcut guide: 100 EP-133 key combinations from the official guide, drawn as key caps in tabs.
- Live mirror: the EP-133's pads light up as they are played, with learned sample names, play/stop, tempo and KEYS notes.
- The library is also kept in Documents/arc, so backups survive uninstalling arc; restore from that folder after a reinstall.
- Device tab: switch between sounds and projects, find a sound by name or slot, sounds grouped by slot hundreds, one-tap Play, projects as tiles.
- Settings: theme, connect when plugged in, keep the screen on in Live, how many backups to keep, Live pad numbering and forgetting learned names, version and licences.
- Version numbering from `version.properties`, this changelog, and tagged releases.

### Changed
- New look after teenage engineering's pocket operator app: cream page and navy ink, uppercase labels, line-split plates, and Backups / Live / Device / Guide tabs along the bottom with a top bar for Back up, the connection and settings.
- Every debug build is signed with one committed debug key, so test builds install over each other (uninstall a build from before this once).
- `.pak` files name the version that wrote them (`arc 0.2.0`).

### Fixed
- Sounds that played without being heard (for example over Bluetooth): playback is now streamed, holds audio focus, and says why when nothing can be heard.
- The guide's generic pad and the fader showed no name.

## [0.1.0] - 2026-10-04

### Added
- Native Android port of the web version: connect to the EP-133 over USB MIDI, back up every sound and project to a `.pak`, restore all or part of a backup, and keep a library with titles and notes.
- Share or save `.pak` files, import them from other apps, and a SysEx debug log.
- `.pak` files interchangeable with the web version.

[Unreleased]: https://github.com/n-drobyshevski/arc/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/n-drobyshevski/arc/releases/tag/v0.2.0
[0.1.0]: https://github.com/n-drobyshevski/arc/commits/main
