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
npm run verify:release-rehearsal -- --repo xiaofandegeng/rmemo --health-timeout-ms 15000 --health-github-retries 2 --health-github-retry-delay-ms 1000
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
- `--health-github-retries <n>` to retry release-health on `429/5xx` during rehearsal (default `2`)
- `--health-github-retry-delay-ms <ms>` delay between retry attempts during rehearsal (default `1000`)
- `--step-timeout-ms <ms>` on `scripts/release-ready.js` to cap each readiness check (default `600000`)

## v1.4 release guardrails

Keep these values aligned between local rehearsal and workflow:

- `release-health` timeout: `15000ms`
- `release-health` retries: `2`
- `release-health` retry delay: `1000ms`
- strict asset naming: `rmemo-<version>.tgz` (`legacy scoped` name is rejected in workflow strict mode)

## Release flow (default)

1. Push conventional commits to `main`
2. `Release Please` workflow runs and creates/updates the release PR
3. Merge the release PR
4. The workflow publishes npm, syncs release notes/body, uploads `.tgz` assets, and generates audit artifacts

Notes:
- `release-please` step is retried once in the same workflow run to absorb transient GitHub API failures.
- If the target npm version already exists, publish step exits safely.

## Post-release convergence verify (recommended)

After release PR is merged, you can wait for npm + GitHub Release convergence with one command:

```bash
npm run verify:release-verify -- --repo xiaofandegeng/rmemo --version <version> --tag v<version> --max-wait-ms 1800000 --poll-interval-ms 10000 --health-timeout-ms 15000 --health-github-retries 2 --health-github-retry-delay-ms 1000
```

This command reuses `release-health` in strict mode and exits non-zero if convergence is not reached in the wait window.

## Failure handling

If workflow fails:

1. Check failed step in `Release Please` workflow
2. Download diagnostics artifact:
   - `rmemo-release-diagnostics-<version>`
3. Run local diagnostics if needed:

```bash
node bin/rmemo.js diagnostics export --format json
node scripts/release-health.js --repo xiaofandegeng/rmemo --version <version> --tag v<version> --format md --allow-legacy-scoped-asset false --timeout-ms 15000 --github-retries 2 --github-retry-delay-ms 1000
```

If `release-please` fails with a GitHub HTML error page (for example `Unicorn`), treat it as transient platform failure:
- Re-run failed jobs/workflow
- Do not edit version files manually before rerun
