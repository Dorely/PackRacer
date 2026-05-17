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
- Keep `FILEMAP.md` entries concise — one to two lines per file maximum.

## Tech Stack
- TODO

## Architectural Overview
- TODO

## Project Structure
- TODO

## Code Style
- TODO PROJECT SPECIFIC INSTRUCTIONS

## Build & Run
TODO

## Conventions
- PROJECT SPECIFIC TODO
- When you need to understand the current wiring, start with `VISION.md`, then `Program.cs`, then the relevant feature area
- Trace each requested change through its full impact area before considering the work complete. Changes to models, contracts, or core concepts should include all affected layers such as persistence, services, queries, prompts, background jobs, and UI.
- Remove superseded code and concepts when replacing them. Do not leave deprecated pages, components, handlers, prompts, queries, or other logic in place just because the new path works; clean out obsolete implementations and reduce unnecessary complexity.
- This is a local development project. When a requested change replaces a concept, remove the superseded implementation outright; do not add or retain compatibility shims, legacy handlers/fallbacks, deprecated tool aliases, or dual paths unless the user explicitly asks for a transition path.
- Do not add test projects or automated tests to this repository; verify changes with TODO PROJECT SPECIFIC BUILD INSTRUCTION
- Never start the app without a plan to also terminate it after verifying the change. Do not leave the app running.