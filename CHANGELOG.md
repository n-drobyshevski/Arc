# Changelog

All notable changes to arc for Android. Versions follow [Semantic Versioning](https://semver.org/):
a major version breaks `.pak` or library compatibility, a minor version adds features, a patch
version fixes bugs. The version itself is set in `version.properties`.

## [Unreleased]

### Added
- Live: a one-group view, a large grid of one group with A–D keys to switch and Follow to jump to the group just played. The choice is kept in the settings.

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
