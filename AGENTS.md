# PackRacer - Project Guidelines

## First Read
- Read `VISION.md` immediately before doing any substantive work in this repo.
- Read `FILEMAP.md` at the start of every session to understand the full codebase layout.
- Treat `VISION.md` as the high-level direction for the project.
- Do not assume everything in `VISION.md` is implemented or currently part of the implementation plan. Use the codebase to confirm current behavior.
- Keep this file (`.github/copilot-instructions.md` / `AGENTS.md`) stable and high level. Do not add notes here that are likely to become stale during normal development.

## File Map Maintenance
- After adding, deleting, or renaming any source file, update `FILEMAP.md` to reflect the change.
- When refactoring moves code between files or changes a file's responsibility, update the description in `FILEMAP.md`.
- Keep `FILEMAP.md` entries concise: one to two lines per file maximum.

## Tech Stack
- Package manager: npm workspaces.
- Desktop shell: Electron through `electron-vite`.
- Renderer: React, TypeScript, Vite, and CSS files scoped to the desktop app.
- Icons: `lucide-react` for UI icons.
- Future local backend: Node.js service hosted by the Electron app.
- Future persistence: SQLite event files, with Drizzle ORM as the preferred access layer unless implementation evidence points elsewhere.

## Architectural Overview
- PackRacer is local-first and desktop-first. A single laptop must be able to run a race without accounts, cloud services, or internet access.
- Keep Electron main-process work, preload bridge APIs, and renderer UI separated.
- The race engine should remain isolated from UI concerns. Domain rules belong in future packages such as `packages/race-engine`, `packages/scheduling`, and `packages/scoring`.
- API, websocket, discovery, import/export, and hardware integration work should live outside renderer components and expose narrow interfaces to the UI.

## Project Structure
- `apps/desktop/` contains the Electron desktop application.
- `apps/desktop/src/main/` contains Electron main-process code.
- `apps/desktop/src/preload/` contains the context-bridged preload API exposed to the renderer.
- `apps/desktop/src/renderer/` contains the React UI and browser-facing assets.
- `packages/` is reserved for shared libraries such as race engine, shared types, scheduling, scoring, UI primitives, and export systems.
- `services/` is reserved for local API, websocket, and discovery services when those layers are added.

## Code Style
- Use strict TypeScript and keep types close to the code that owns them until a cross-package boundary exists.
- Prefer plain React function components and small focused modules.
- Keep race-day workflows clear and recoverable. Favor explicit state and obvious controls over clever abstractions.
- Do not put core race rules, scheduling, scoring, or persistence logic inside renderer components.
- Maintain Electron security defaults: context isolation on, node integration off, and renderer access through preload APIs.
- Keep UI copy operational. Avoid marketing-style pages inside the app; the first screen should be useful to an event operator.

## Build & Run
- Install dependencies with `npm install` from the repo root.
- Run the desktop app with `npm run dev`.
- Type-check with `npm run typecheck`.
- Build with `npm run build`.
- Do not try to Preview the built app with `npm run preview`. Your sandboxed environment makes it fail
- Do not add test projects or automated tests to this repository yet. Verify changes with `npm run typecheck`, `npm run build`, and a short app launch when UI behavior changes.

## Conventions
- When you need to understand the current wiring, start with `VISION.md`, then `apps/desktop/src/main/index.ts`, then the relevant feature area.
- Trace each requested change through its full impact area before considering the work complete. Changes to models, contracts, or core concepts should include all affected layers such as persistence, services, queries, background jobs, and UI.
- Remove superseded code and concepts when replacing them. Do not leave deprecated pages, components, handlers, prompts, queries, or other logic in place just because the new path works; clean out obsolete implementations and reduce unnecessary complexity.
- This is a local development project. When a requested change replaces a concept, remove the superseded implementation outright; do not add or retain compatibility shims, legacy handlers/fallbacks, deprecated tool aliases, or dual paths unless the user explicitly asks for a transition path.
- Never start the app without a plan to also terminate it after verifying the change. Do not leave the app running.
