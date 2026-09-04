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
| `apps/desktop/src/main/event-store.ts` | App-owned SQLite database with serialized atomic saves, recovery-copy restoration, event selection, and audit storage. |
| `apps/desktop/src/main/timer-service.ts` | Main-process physical and virtual serial transport, connection verification, arm snapshots, diagnostics, safety, and preferences. |
| `apps/desktop/src/main/timer-capture.ts` | Pure timer-capture completion, tie handling, missing-lane warnings, and derived-place normalization. |

## Desktop Preload

| File | Description |
|------|-------------|
| `apps/desktop/src/preload/index.ts` | Safe context bridge API exposed from Electron to the renderer. |

## Desktop Renderer

| File | Description |
|------|-------------|
| `apps/desktop/src/renderer/index.html` | Renderer HTML entry point. |
| `apps/desktop/src/renderer/timer-simulator.html` | Separate virtual timer-device window HTML entry point. |
| `apps/desktop/src/renderer/src/App.tsx` | PackRacer operator shell, navigation, app-level Dev Mode gating, event/race session state, and race-day action wiring. |
| `apps/desktop/src/renderer/src/env.d.ts` | Renderer global and Vite type declarations. |
| `apps/desktop/src/renderer/src/formatters.ts` | Renderer formatting helpers for race statuses, times, racers, heats, and collision-free suggested names. |
| `apps/desktop/src/renderer/src/main.tsx` | React renderer bootstrap. |
| `apps/desktop/src/renderer/src/timer-simulator-main.tsx` | Virtual serial timer window, emulated hardware/scenario controls, raw-byte sender, and transport transcript. |
| `apps/desktop/src/renderer/src/styles.css` | Ordered entry point for renderer style modules. |
| `apps/desktop/src/renderer/src/styles/base.css` | Shared foundations, shell, forms, panels, tables, and race-control primitives. |
| `apps/desktop/src/renderer/src/styles/display.css` | Public display board, standings, schedule, and elimination-bracket styling. |
| `apps/desktop/src/renderer/src/styles/registration.css` | Registration workflow, roster table, filters, and roster-management styling. |
| `apps/desktop/src/renderer/src/styles/responsive.css` | Laptop and monitor breakpoint overrides shared across operator views. |
| `apps/desktop/src/renderer/src/styles/timer.css` | Hardware Timer panel and separate simulator-window styling. |

## Desktop Renderer Sections

| File | Description |
|------|-------------|
| `apps/desktop/src/renderer/src/sections/DisplayMode.tsx` | In-app display board with selectable race-specific heat, standings, schedule, record, and bracket layouts. |
| `apps/desktop/src/renderer/src/sections/Events.tsx` | Event create, select, edit, and delete screen shown at app startup. |
| `apps/desktop/src/renderer/src/sections/EventSetup.tsx` | Event division management, race creation, format-specific setup, source-race configuration, and scheduling options. |
| `apps/desktop/src/renderer/src/sections/RaceControl.tsx` | Race-scoped heat selection, lane availability controls, result entry, rerun control, status marking, and heat cycling workflow. |
| `apps/desktop/src/renderer/src/sections/race-control-results.ts` | Race Control result-draft initialization, status handling, and placement normalization utilities. |
| `apps/desktop/src/renderer/src/sections/Registration.tsx` | Division-aware racer creation, explicit race assignment, race readiness controls, and searchable event-wide identity/division/deletion management. |
| `apps/desktop/src/renderer/src/sections/Standings.tsx` | Race-scoped live standings table and compact source/dependent advancement summaries. |
| `apps/desktop/src/renderer/src/sections/TimerPanel.tsx` | Race Control hardware setup, simulator scenarios, lane mapping, gate controls, diagnostics, and protocol replay UI. |
| `apps/desktop/src/renderer/src/sections/types.ts` | Shared renderer section prop and action types. |

## Timer Adapter Package

| File | Description |
|------|-------------|
| `packages/timer-adapters/package.json` | Workspace metadata for pure hardware timer protocol adapters and simulator generation. |
| `packages/timer-adapters/src/index.ts` | Public exports for timer types, profiles, parsers, replay fixtures, and simulator. |
| `packages/timer-adapters/src/advanced-profile.ts` | Declarative Advanced profile construction, command configuration, and unit-aware record parsing. |
| `packages/timer-adapters/src/profiles.ts` | Built-in hardware profile definitions, commands, detection patterns, and adapter construction. |
| `packages/timer-adapters/src/protocol-parsers.ts` | Shared equals-record, ordered NewBold, and time parsing helpers. |
| `packages/timer-adapters/src/replay-fixtures.ts` | Fragmented/noisy bundled protocol transcripts and physical-adapter replay runner. |
| `packages/timer-adapters/src/simulator.ts` | Deterministic scenario generation plus hardware-specific probe responses and fragmented raw serial encoding for the virtual port. |
| `packages/timer-adapters/src/text-timer-adapter.ts` | Fragmented line framing and command access for declarative serial profile definitions. |
| `packages/timer-adapters/src/types.ts` | Timer profiles, capabilities, arm snapshots, captures, diagnostics, preferences, simulator, replay, and adapter contracts. |

## Race Engine Package

| File | Description |
|------|-------------|
| `packages/race-engine/package.json` | Workspace package metadata for the pure race-domain engine. |
| `packages/race-engine/src/event.ts` | Event, division, race, racer, race-entry, schema migration, safe racer-deletion checks, and heat-impact mutation functions. |
| `packages/race-engine/src/helpers.ts` | Shared ID, time, sorting, lane-count, race selection, division inheritance, and eligibility helpers. |
| `packages/race-engine/src/index.ts` | Public exports for the race engine package. |
| `packages/race-engine/src/elimination.ts` | Standard bracket seed order, heat-winner rules, and canonical single-elimination display projection. |
| `packages/race-engine/src/race-engine.test.ts` | Vitest regression coverage for scoring, results, schedules, brackets, lifecycle, and migrations. |
| `packages/race-engine/src/scoring-and-scheduling.test.ts` | Regression coverage for every scoring mode, source seeding, format scheduling, and multi-loss elimination characterization. |
| `packages/race-engine/src/result-validation.ts` | Strict assignment-matched result completeness, time, status, and placement validation. |
| `packages/race-engine/src/round-robin.ts` | Circle-method round-robin heat generation. |
| `packages/race-engine/src/schedule-adjustments.ts` | Atomic timed/points racer deferral planning and whole-heat postponement. |
| `packages/race-engine/src/scheduling-utilities.ts` | Shared heat construction, active-lane validation, and schedule-history utilities. |
| `packages/race-engine/src/scheduling.ts` | Elimination scheduling, lane availability, advancement, result persistence, and racer-removal reconciliation. |
| `packages/race-engine/src/scoring.ts` | Race-scoped standings calculations for timed, points, round-robin, and elimination formats. |
| `packages/race-engine/src/test-helpers.ts` | Race-engine-only fixture builder used by regression tests. |
| `packages/race-engine/src/timed-scheduling.ts` | Timed and points heat generation with run, lane, opponent, and back-to-back balancing. |
| `packages/race-engine/src/types.ts` | Shared event, race, heat, result, standing, and IPC payload types. |
