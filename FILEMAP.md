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

## Desktop Preload

| File | Description |
|------|-------------|
| `apps/desktop/src/preload/index.ts` | Safe context bridge API exposed from Electron to the renderer. |

## Desktop Renderer

| File | Description |
|------|-------------|
| `apps/desktop/src/renderer/index.html` | Renderer HTML entry point. |
| `apps/desktop/src/renderer/src/App.tsx` | Initial PackRacer operator shell UI. |
| `apps/desktop/src/renderer/src/env.d.ts` | Renderer global and Vite type declarations. |
| `apps/desktop/src/renderer/src/main.tsx` | React renderer bootstrap. |
| `apps/desktop/src/renderer/src/styles.css` | Desktop app shell styling. |
