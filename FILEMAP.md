# PackRacer - File Map

> **Auto-maintained reference.** Agents and contributors should update this file whenever files are added, removed, or significantly refactored.
> Read this file at the start of every session to understand the codebase layout.

---

## Root

| File | Description |
|------|-------------|
| `.editorconfig` | Shared whitespace and line-ending defaults. |
| `.gitignore` | Ignore rules for Node, Electron build output, local event data, and editor files. |
| `AGENTS.md` | Root agent guidance for working in the PackRacer repo. |
| `FILEMAP.md` | This file: concise map of every source and configuration file. |
| `package-lock.json` | Locked npm dependency graph for the workspace. |
| `package.json` | Root npm workspace definition and top-level scripts. |
| `README.md` | Developer onboarding, scripts, and architecture summary. |
| `tsconfig.json` | Root TypeScript project references for editor and build graph alignment. |
| `VISION.md` | High-level product vision, target architecture, and success criteria. |

## Documentation

| File | Description |
|------|-------------|
| `docs/hardware-timers.md` | Timer operator workflow, virtual-port simulator, protocol index, gate safety, and validation status. |
| `docs/hardware-timers/micro-wizard-fasttrack.md` | Micro Wizard K/Q serial settings, command table, result framing, simulator behavior, sources, and validation gaps. |
| `docs/hardware-timers/besttrack-champ.md` | Legacy SmartLine and current SRM Champ connection assumptions, commands, result formats, sources, and validation gaps. |
| `docs/hardware-timers/newbold.md` | NewBold serial settings, reset behavior, ordered result format, detection limits, sources, and validation gaps. |
| `docs/hardware-timers/the-judge.md` | The Judge serial settings, status/result framing, command assumptions, sources, and validation gaps. |

## GitHub Configuration

| File | Description |
|------|-------------|
| `.github/copilot-instructions.md` | Copilot-specific project instructions kept aligned with `AGENTS.md`. |

## VS Code Configuration

| File | Description |
|------|-------------|
| `.vscode/launch.json` | F5 debug configuration for launching the desktop app through `npm run debug`. |

## Desktop App

| File | Description |
|------|-------------|
| `apps/desktop/package.json` | Desktop workspace package metadata, dependencies, and scripts. |
| `apps/desktop/electron.vite.config.ts` | Electron Vite build configuration for main, preload, and renderer bundles. |
| `apps/desktop/tsconfig.json` | TypeScript project references for desktop node and web configs. |
| `apps/desktop/tsconfig.node.json` | TypeScript settings for Electron main, preload, and build config code. |
| `apps/desktop/tsconfig.web.json` | TypeScript settings for the React renderer. |

## Desktop Main Process

| File | Description |
|------|-------------|
| `apps/desktop/src/main/index.ts` | Electron app lifecycle, main window creation, and main-process IPC handlers. |
| `apps/desktop/src/main/event-store.ts` | App-owned SQLite database for local events, event selection, autosaved state, and audit log storage. |
| `apps/desktop/src/main/timer-service.ts` | Main-process physical and virtual serial transport, verified connections, arm snapshots, capture normalization, diagnostics, safety, and preferences. |

## Desktop Preload

| File | Description |
|------|-------------|
| `apps/desktop/src/preload/index.ts` | Safe context bridge API exposed from Electron to the renderer. |

## Desktop Renderer

| File | Description |
|------|-------------|
| `apps/desktop/src/renderer/index.html` | Renderer HTML entry point. |
| `apps/desktop/src/renderer/timer-simulator.html` | Separate virtual timer-device window HTML entry point. |
| `apps/desktop/src/renderer/src/App.tsx` | PackRacer operator shell, navigation, event/race session state, and race-day action wiring. |
| `apps/desktop/src/renderer/src/env.d.ts` | Renderer global and Vite type declarations. |
| `apps/desktop/src/renderer/src/formatters.ts` | Renderer formatting helpers for race statuses, times, racers, and heats. |
| `apps/desktop/src/renderer/src/main.tsx` | React renderer bootstrap. |
| `apps/desktop/src/renderer/src/timer-simulator-main.tsx` | Virtual serial timer window, emulated hardware/scenario controls, raw-byte sender, and transport transcript. |
| `apps/desktop/src/renderer/src/styles.css` | Desktop app shell styling. |

## Desktop Renderer Sections

| File | Description |
|------|-------------|
| `apps/desktop/src/renderer/src/sections/DisplayMode.tsx` | In-app display board with selectable race-specific heat, standings, schedule, record, and bracket layouts. |
| `apps/desktop/src/renderer/src/sections/Events.tsx` | Event create, select, edit, and delete screen shown at app startup. |
| `apps/desktop/src/renderer/src/sections/EventSetup.tsx` | Event division management, race creation, format-specific setup, source-race configuration, and scheduling options. |
| `apps/desktop/src/renderer/src/sections/RaceControl.tsx` | Race-scoped heat selection, lane availability controls, result entry, rerun control, status marking, and heat cycling workflow. |
| `apps/desktop/src/renderer/src/sections/Registration.tsx` | Division-aware racer creation, explicit race assignment, race readiness controls, and searchable event-wide identity/division/deletion management. |
| `apps/desktop/src/renderer/src/sections/Standings.tsx` | Race-scoped live standings table and compact source/dependent advancement summaries. |
| `apps/desktop/src/renderer/src/sections/TimerPanel.tsx` | Race Control hardware setup, simulator scenarios, lane mapping, gate controls, diagnostics, and protocol replay UI. |
| `apps/desktop/src/renderer/src/sections/types.ts` | Shared renderer section prop and action types. |

## Timer Adapter Package

| File | Description |
|------|-------------|
| `packages/timer-adapters/package.json` | Workspace metadata for pure hardware timer protocol adapters and simulator generation. |
| `packages/timer-adapters/src/index.ts` | Public exports for timer types, profiles, parsers, replay fixtures, and simulator. |
| `packages/timer-adapters/src/profiles.ts` | Declarative physical/advanced timer definitions, fragmented text framing, protocol parsers, commands, and replay fixtures. |
| `packages/timer-adapters/src/simulator.ts` | Deterministic scenario generation plus hardware-specific probe responses and fragmented raw serial encoding for the virtual port. |
| `packages/timer-adapters/src/types.ts` | Timer profiles, capabilities, arm snapshots, captures, diagnostics, preferences, simulator, replay, and adapter contracts. |

## Race Engine Package

| File | Description |
|------|-------------|
| `packages/race-engine/package.json` | Workspace package metadata for the pure race-domain engine. |
| `packages/race-engine/src/event.ts` | Event, division, race, racer, race-entry, schema migration, safe racer-deletion checks, and heat-impact mutation functions. |
| `packages/race-engine/src/helpers.ts` | Shared ID, time, sorting, lane-count, race selection, division inheritance, and eligibility helpers. |
| `packages/race-engine/src/index.ts` | Public exports for the race engine package. |
| `packages/race-engine/src/scheduling.ts` | Race-scoped heat generation, lane availability rescheduling, result recording, heat advancement, and racer-removal reconciliation. |
| `packages/race-engine/src/scoring.ts` | Race-scoped standings calculations for timed, points, round-robin, and elimination formats. |
| `packages/race-engine/src/types.ts` | Shared event, race, heat, result, standing, and IPC payload types. |
