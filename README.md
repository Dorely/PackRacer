# PackRacer

PackRacer is a free, local-first race event manager for volunteer-run competitions such as Pinewood Derby and Raingutter Regatta. It replaces spreadsheet-driven race days with a dependable desktop workflow that runs from one laptop without accounts, cloud services, or an internet connection.

## Download

Windows x64 is the supported MVP platform. Installers are published on the [GitHub Releases page](https://github.com/Dorely/PackRacer/releases). Each installer is accompanied by a SHA-256 checksum.

PackRacer is not yet code-signed, so Windows may show a SmartScreen warning for early test releases. Code signing is tracked as release follow-up work.

| Platform | Status |
| --- | --- |
| Windows x64 | Supported MVP build |
| Windows ARM | Planned and unvalidated |
| macOS | Planned and unvalidated |
| Linux | Planned and unvalidated |

## Current Status

- Desktop app shell: present in `apps/desktop`.
- Race-day MVP workflow: implemented for local event creation, multi-race setup, racer registration, heat generation, result entry, standings, finals advancement, and racer scratching.
- Race engine: present in `packages/race-engine` as pure TypeScript domain logic.
- Persistence: one local SQLite app database is owned by the Electron main process, with serialized atomic autosaves, a last-known-good recovery copy, and an audit log.
- Hardware timers: optional Windows-first serial input, review-before-save captures, a production-accessible simulator, and raw protocol replay are implemented. Physical protocols await validation with real units.
- Local API and websocket services: planned, not implemented yet.

## Development prerequisites

- Node.js 20 or newer.
- npm 10 or newer.

## Development quick start

```sh
npm install
npm run dev
```

The development command starts the Electron desktop app. Stop it from the terminal when finished so no app process is left running.

## Scripts

```sh
npm run dev        # Start the Electron app in development mode
npm run debug      # Start the Electron app with VS Code-friendly debug ports
npm run typecheck  # Run TypeScript checks
npm run build      # Build the desktop app
npm run pack:win   # Build an unpacked Windows x64 app for local smoke testing
npm run dist:win   # Build a Windows x64 NSIS installer
npm run release:win # Validate, test, package, and checksum a clean Windows release
npm run preview    # Preview the built Electron app
npm test           # Run race-engine regression tests
```

`npm run release:win` intentionally refuses to run from a dirty working tree or when the root and desktop package versions do not match. See [Releasing PackRacer](docs/releasing.md) for the local and GitHub Actions release process.

## MVP Race-Day Workflow

The current app can run a first-pass race day from one laptop:

1. Create an event in the local app database from Event Setup.
2. Configure the event name, date, track, lane count, and one or more races within the event.
3. Configure event divisions, assign one or more division memberships to each racer, and manually add eligible racers to each division's race.
4. Configure each directly registered race for one division—or populate a later race from another race's results—then generate timed heats, points heats, round robin, single elimination, double elimination, or triple elimination schedules.
5. Use Race Control to enter both time and finish order, mark DNS/DNF/DQ, and advance to the next heat within the selected race.
   Optionally connect a serial timer or the built-in simulator; captured values are staged in the same editable result form and never save automatically.
   If racers are temporarily unavailable, defer selected timed/points assignments into compatible future heats or postpone the whole current heat.
6. View live standings for the selected race and populate later races from top-ranked racers.
7. Scratch a racer from Registration and choose whether to keep empty lanes, regenerate pending heats, or leave affected heats flagged across races.

Registration remains operator-controlled: division membership makes a racer eligible for a race but does not add them automatically. Use **Add Selected** for individual control or **Add All Eligible** to assign every unadded racer from the race's division at once. The Registration roster panel has two views: **Race Roster** handles check-in, inspection, and removal from the selected race, while **Full Roster** searches and filters every event racer and manages racer identity, division memberships, and pre-race permanent deletion. Once a racer is involved in generated heats, remove or scratch them through the race roster instead of deleting them.

Every mutation is written immediately to the local SQLite database under Electron's user data folder.
Average-time races may optionally discard each racer’s single slowest successful run once at least two successful times exist. Single elimination uses a standard automatically sized seeded bracket with every bye in the opening round.

## VS Code Debugging

Press F5 and choose `PackRacer: Debug Desktop` if VS Code asks for a configuration. The launch profile runs `npm run debug`, starts Electron through `electron-vite`, enables main-process inspection on port 5858, and enables renderer remote debugging on port 9222.

Stop the debug session from VS Code when finished so the Electron app and dev server are terminated together.

## Architecture

PackRacer follows the architecture direction in `VISION.md`:

- Electron desktop shell for local-first race-day operation.
- React and TypeScript renderer for the operator UI.
- Electron preload bridge for safe renderer access to desktop capabilities.
- Future isolated packages for race engine, scheduling, scoring, standings, shared types, and exports.
- Future local Node services for API, websocket updates, discovery, and import/export.
- Pure timer adapters in `packages/timer-adapters`, with serial handles and connection state isolated in the Electron main process.
- Local SQLite app database for events, races, rosters, schedules, results, and audit history.
- Current storage uses serialized event state plus an audit log; future schema work can normalize this into Drizzle-managed relational tables.

## Development Notes

- Keep race-domain logic out of renderer components.
- Keep automated tests scoped to `packages/race-engine` until the repository policy is deliberately expanded.
- Keep Electron main, preload, and renderer code separated.
- Update `FILEMAP.md` whenever source files are added, removed, renamed, or significantly repurposed.
- Read `VISION.md` and `FILEMAP.md` before making substantive changes.
- Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a public contribution.

## Hardware Timers

Hardware timers are currently supported on Windows x64. macOS, Linux, and Windows ARM are planned but unvalidated. See [Hardware Timers](docs/hardware-timers.md) for supported profiles, simulator scenarios, gate safety, diagnostics, and hardware validation steps.

### Using the Simulator

The simulator is a separate virtual serial-device window. It emulates a selected hardware model, exposes `PACKRACER-SIM` as a scanned port, answers that model's connection probe, and sends raw protocol bytes through the same adapter used for physical hardware:

1. Create or select an event, register racers, and generate heats for a race.
2. Open **Race Control** and expand **Hardware Timer**.
3. In the side navigation, select **Enable Dev Mode** beneath the local database version card. Then select **Open Timer Simulator** in the Hardware Timer panel. In the new window, choose the physical timer model to emulate.
4. Back in Race Control, select **Scan**, choose the same physical timer profile, choose **PACKRACER-SIM — PackRacer Timer Simulator**, and select **Connect**.
5. Select **Arm Current Heat** in Race Control.
6. In the simulator window, choose a scenario such as **Normal finish**, **Exact tie**, or **Explicit DNF**. For profiles without gate release, select **Send Simulated Heat** and use **New variation** for a different deterministic result. For a gate-capable profile, enable software gate control and select **Release Gate** in Race Control; the emulated timer automatically chooses a fresh randomized variation and sends the selected scenario after a short race delay.
7. Review or edit the populated result fields. Select **Discard Capture** to abandon them, or **Accept Capture And Advance** to save them.
8. Accept or discard the capture exactly as you would with a physical timer. Simulator captures follow the same operator workflow and remain identified as simulated only in the audit history.

The simulator transcript shows commands received from Race Control and raw bytes sent back. Its manual-data control also accepts ASCII with `\\r` and `\\n` escapes. Closing the simulator window removes the virtual port and drops an active virtual connection. Explicit DNF is available only while emulating NewBold or The Judge; other profiles use **Incomplete Result** followed by **Force Results**. The incomplete, duplicate-transmission, and disconnect scenarios are useful for practicing recovery without affecting manual result entry.

## Support the project

PackRacer will remain free to use. If it saves your group time and you would like to support continued development, you can [buy Dorely a coffee](https://buymeacoffee.com/dorely) or use the repository's GitHub **Sponsor** button. Donations never unlock features or change the project's license.

Funding policy and repository configuration are documented in [Funding PackRacer](docs/funding.md). No payout or identity information belongs in this repository.

## License

PackRacer is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE). You may use, study, modify, and redistribute it for permitted noncommercial purposes. Commercial use requires separate permission from the licensor.

Because the license restricts commercial use, it is not an OSI-approved open source license. This repository uses “free and source-available” rather than “open source” when that distinction matters.
