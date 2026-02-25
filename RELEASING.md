# Releasing (npm + GitHub Release)

The canonical release pipeline is `.github/workflows/release-please.yml`.

## One-time setup

1. Configure repository Actions permissions:
   - `Settings -> Actions -> General -> Workflow permissions`
   - Enable `Read and write permissions`
   - Enable `Allow GitHub Actions to create and approve pull requests`
2. Add `NPM_TOKEN` repository secret:
   - Must be able to publish `@xiaofandegeng/rmemo`
   - If npm account enforces 2FA, use an automation-compatible token

## Pre-release local rehearsal (recommended)

Run one command before releasing:

```bash
npm run verify:release-rehearsal -- --repo xiaofandegeng/rmemo
```

Artifacts written under `artifacts/`:
- `release-notes.md`
- `release-ready.md`
- `release-ready.json`
- `release-health.md`
- `release-health.json`
- `release-rehearsal.md`
- `release-rehearsal.json`

Useful flags:
- `--skip-health` when GitHub API is unavailable
- `--allow-dirty` for local dry runs with uncommitted changes
- `--skip-tests` for quick smoke checks
- `--health-timeout-ms <ms>` to cap GitHub API checks during rehearsal (default `15000`)
- `--step-timeout-ms <ms>` on `scripts/release-ready.js` to cap each readiness check (default `600000`)

## Release flow (default)

1. Push conventional commits to `main`
2. `Release Please` workflow runs and creates/updates the release PR
3. Merge the release PR
4. The workflow publishes npm, syncs release notes/body, uploads `.tgz` assets, and generates audit artifacts

Notes:
- `release-please` step is retried once in the same workflow run to absorb transient GitHub API failures.
- If the target npm version already exists, publish step exits safely.

## Failure handling

If workflow fails:

1. Check failed step in `Release Please` workflow
2. Download diagnostics artifact:
   - `rmemo-release-diagnostics-<version>`
3. Run local diagnostics if needed:

```bash
node bin/rmemo.js diagnostics export --format json
node scripts/release-health.js --repo xiaofandegeng/rmemo --version <version> --tag v<version> --format md
```

If `release-please` fails with a GitHub HTML error page (for example `Unicorn`), treat it as transient platform failure:
- Re-run failed jobs/workflow
- Do not edit version files manually before rerun
