# Releasing PackRacer

PackRacer currently ships an unsigned Windows x64 NSIS installer. macOS, Linux, and Windows ARM packaging are future work.

## Release outputs

The release pipeline creates:

- `release/PackRacer-Setup-VERSION-x64.exe`
- `release/PackRacer-Setup-VERSION-x64.exe.sha256`

`release/` is ignored by Git. Do not commit installers or unpacked application files.

## Local Windows build

From a clean checkout on Windows with Node.js 20+ and npm 10+:

```powershell
npm ci
npm run release:win
```

The release script verifies that:

- the Git working tree is clean;
- the root and desktop package versions match;
- race-engine regression tests pass;
- TypeScript and the production Electron bundles build;
- the expected x64 installer exists;
- a SHA-256 checksum is written next to the installer.

Use `npm run pack:win` when you only need an unpacked app for a quick local smoke test. Use `npm run dist:win` to build the installer without the clean-tree and test gates.

## Version and publish workflow

1. Update the root and desktop versions together and review the lockfile update.
2. Commit the version change and confirm `npm run release:win` passes from the clean commit.
3. Create an annotated tag matching the desktop version exactly, such as `v0.1.0`.
4. Push the commit and tag.

The `.github/workflows/release-windows.yml` workflow runs on Windows for both manual dispatches and `v*` tags. Manual runs retain the installer and checksum as a workflow artifact. A matching version tag also creates a public GitHub Release with generated release notes.

If release creation is denied, confirm that GitHub Actions has permission to write repository contents under **Settings → Actions → General → Workflow permissions**.

## Signing and reputation

The current installer is unsigned. Windows SmartScreen may warn testers because the executable has no trusted publisher reputation. Before promoting PackRacer beyond early testers:

- obtain a Windows code-signing certificate;
- store signing credentials in GitHub Actions secrets, never in the repository;
- configure electron-builder signing;
- confirm both the app executable and installer report the expected publisher.

## Platform follow-up

Before calling another platform supported, add its package target and CI runner, then validate installation, database recovery, display pop-outs, simulator behavior, serial-port enumeration, USB removal/reconnection, and a complete race workflow on real hardware.
