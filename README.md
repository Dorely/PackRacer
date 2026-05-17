# PackRacer

PackRacer is a local-first race event management app for volunteer-run competitions. The goal is to replace spreadsheet-driven race days with a dependable desktop workflow that can run from one laptop with no internet connection.

The current repo contains the first development scaffold: an npm workspace with a working Electron, React, TypeScript, and Vite desktop shell.

## Current Status

- Desktop app shell: present in `apps/desktop`.
- Race-day MVP workflow: implemented for local event creation, multi-race setup, racer registration, heat generation, result entry, standings, finals advancement, and racer scratching.
- Race engine: present in `packages/race-engine` as pure TypeScript domain logic.
- Persistence: one local SQLite app database is owned by the Electron main process, with autosaved event state and an audit log.
- Local API and websocket services: planned, not implemented yet.

## Prerequisites

- Node.js 20 or newer.
- npm 10 or newer.

## Quick Start

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
npm run preview    # Preview the built Electron app
```

## MVP Race-Day Workflow

The current app can run a first-pass race day from one laptop:

1. Create an event in the local app database from Event Setup.
2. Configure the event name, date, track, lane count, and one or more races within the event.
3. Register racers manually with number, name, division, and optional vehicle name.
4. Add race stages and generate heats for timed heats, points heats, round robin, or single elimination stages.
5. Use Race Control to enter both time and finish order, mark DNS/DNF/DQ, and advance to the next heat within the selected race.
6. View live standings for the selected race and create a finals stage from top-ranked racers.
7. Scratch a racer from Registration and choose whether to keep empty lanes, regenerate pending heats, or leave affected heats flagged across races.

Every mutation is written immediately to the local SQLite database under Electron's user data folder.

## VS Code Debugging

Press F5 and choose `PackRacer: Debug Desktop` if VS Code asks for a configuration. The launch profile runs `npm run debug`, starts Electron through `electron-vite`, enables main-process inspection on port 5858, and enables renderer remote debugging on port 9222.

Stop the debug session from VS Code when finished so the Electron app and dev server are terminated together.

## Architecture

PackRacer follows the architecture direction in `VISION.md`:

- Electron desktop shell for local-first race-day operation.
- React and TypeScript renderer for the operator UI.
- Electron preload bridge for safe renderer access to desktop capabilities.
- Future isolated packages for race engine, scheduling, scoring, standings, shared types, and exports.
- Future local Node services for API, websocket updates, discovery, import/export, and hardware integration.
- Local SQLite app database for events, races, rosters, schedules, results, and audit history.
- Current storage uses serialized event state plus an audit log; future schema work can normalize this into Drizzle-managed relational tables.

## Development Notes

- Keep race-domain logic out of renderer components.
- Keep Electron main, preload, and renderer code separated.
- Update `FILEMAP.md` whenever source files are added, removed, renamed, or significantly repurposed.
- Read `VISION.md` and `FILEMAP.md` before making substantive changes.
