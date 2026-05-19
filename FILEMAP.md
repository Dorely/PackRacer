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

## Desktop Preload

| File | Description |
|------|-------------|
| `apps/desktop/src/preload/index.ts` | Safe context bridge API exposed from Electron to the renderer. |

## Desktop Renderer

| File | Description |
|------|-------------|
| `apps/desktop/src/renderer/index.html` | Renderer HTML entry point. |
| `apps/desktop/src/renderer/src/App.tsx` | PackRacer operator shell, navigation, event/race session state, and race-day action wiring. |
| `apps/desktop/src/renderer/src/env.d.ts` | Renderer global and Vite type declarations. |
| `apps/desktop/src/renderer/src/formatters.ts` | Renderer formatting helpers for race statuses, times, racers, and heats. |
| `apps/desktop/src/renderer/src/main.tsx` | React renderer bootstrap. |
| `apps/desktop/src/renderer/src/styles.css` | Desktop app shell styling. |

## Desktop Renderer Sections

| File | Description |
|------|-------------|
| `apps/desktop/src/renderer/src/sections/DisplayMode.tsx` | In-app display board with race-specific layouts for heat, round-robin, and elimination formats. |
| `apps/desktop/src/renderer/src/sections/Events.tsx` | Event create, select, edit, and delete screen shown at app startup. |
| `apps/desktop/src/renderer/src/sections/EventSetup.tsx` | Race creation, format-specific setup, source-race configuration, and scheduling options. |
| `apps/desktop/src/renderer/src/sections/RaceControl.tsx` | Race-scoped heat selection, lane availability controls, result entry, rerun control, status marking, and heat cycling workflow. |
| `apps/desktop/src/renderer/src/sections/Registration.tsx` | Manual and bulk race registration with roster edits, check-in/inspection toggles, and removal controls. |
| `apps/desktop/src/renderer/src/sections/Standings.tsx` | Race-scoped live standings table and compact source/dependent advancement summaries. |
| `apps/desktop/src/renderer/src/sections/types.ts` | Shared renderer section prop and action types. |

## Race Engine Package

| File | Description |
|------|-------------|
| `packages/race-engine/package.json` | Workspace package metadata for the pure race-domain engine. |
| `packages/race-engine/src/event.ts` | Event, race, racer, race-entry, and heat-impact mutation functions. |
| `packages/race-engine/src/helpers.ts` | Shared ID, time, sorting, lane-count, race selection, and eligibility helpers. |
| `packages/race-engine/src/index.ts` | Public exports for the race engine package. |
| `packages/race-engine/src/scheduling.ts` | Race-scoped heat generation, lane availability rescheduling, result recording, heat advancement, and racer-removal reconciliation. |
| `packages/race-engine/src/scoring.ts` | Race-scoped standings calculations for timed, points, round-robin, and elimination formats. |
| `packages/race-engine/src/types.ts` | Shared event, race, heat, result, standing, and IPC payload types. |
