# Contributing to PackRacer

Thanks for helping make small, volunteer-run race days easier to operate.

## Before starting

- Search existing issues before opening a bug report or feature request.
- Keep proposals aligned with the local-first, race-day-reliable direction in `VISION.md`.
- For hardware timer changes, include the timer model, firmware when known, serial settings, and sanitized protocol transcripts.
- Keep race rules in `packages/race-engine`; renderer components should not own scheduling or scoring logic.

## Local setup

PackRacer requires Node.js 20 or newer and npm 10 or newer.

```sh
npm install
npm run typecheck
npm test
npm run build
```

Use `npm run dev` for ordinary local development. Windows contributors can use `npm run pack:win` for an unpacked production build or `npm run dist:win` for an installer.

## Pull requests

- Keep each pull request focused and explain the operator-visible behavior it changes.
- Add or update race-engine regression tests when changing scheduling, scoring, advancement, or result validation.
- Verify UI changes at common laptop and desktop-monitor sizes.
- Update `README.md`, `FILEMAP.md`, and relevant protocol documentation when responsibilities or behavior change.
- Do not include real participant data, local SQLite databases, build output, or hardware serial numbers.

The MVP release target is Windows x64. macOS, Linux, and Windows ARM contributions are welcome, but those platforms remain unvalidated until their packaging and race-day workflows are tested end to end.
