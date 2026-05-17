# PackRacer

PackRacer is a local-first race event management app for volunteer-run competitions. The goal is to replace spreadsheet-driven race days with a dependable desktop workflow that can run from one laptop with no internet connection.

The current repo contains the first development scaffold: an npm workspace with a working Electron, React, TypeScript, and Vite desktop shell.

## Current Status

- Desktop app shell: present in `apps/desktop`.
- Race-day MVP workflow: implemented for local project creation, racer registration, stage setup, heat generation, result entry, standings, finals advancement, and racer scratching.
- Race engine: present in `packages/race-engine` as pure TypeScript domain logic.
- Persistence: SQLite `.packrace` files are created and opened by the Electron main process, with autosaved project state and an audit log.
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

1. Create or open a `.packrace` project from Event Setup.
2. Configure the event name, date, track, lane count, tournament type, and stages.
3. Register racers manually with number, name, division, and optional vehicle name.
4. Generate heats for timed heats, points heats, round robin, or single elimination stages.
5. Use Race Control to enter both time and finish order, mark DNS/DNF/DQ, and advance to the next heat.
6. View live standings and create a finals stage from top-ranked racers.
7. Scratch a racer from Registration and choose whether to keep empty lanes, regenerate pending heats, or leave affected heats flagged.

Every mutation is written immediately to the active `.packrace` SQLite file by the main process.

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
- Future SQLite `.packrace` event files using Drizzle ORM unless implementation constraints suggest otherwise.
- Current `.packrace` files use SQLite with a serialized project-state table and audit log; future schema work can normalize this into Drizzle-managed relational tables.

## Development Notes

- Keep race-domain logic out of renderer components.
- Keep Electron main, preload, and renderer code separated.
- Update `FILEMAP.md` whenever source files are added, removed, renamed, or significantly repurposed.
- Read `VISION.md` and `FILEMAP.md` before making substantive changes.
