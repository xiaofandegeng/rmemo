# Regression Matrix

`rmemo` provides a lightweight regression matrix script to validate core channels:

- CLI
- HTTP API + UI
- MCP

## Run locally

```bash
npm run verify:matrix
node scripts/regression-matrix.js --format json
```

## Output

- Default: markdown report
- Optional: JSON report (`--format json`)

The script exits non-zero when any channel fails.

Notes:
- In constrained local environments where sockets are disallowed, `api-ui` may be marked `skipped`.
- CI environments should execute full checks.

## Release health

After a release is published, validate npm + GitHub release consistency:

```bash
npm run verify:release-health
node scripts/release-health.js --repo xiaofandegeng/rmemo --version 1.0.0 --tag v1.0.0 --format json
```

## Release readiness

Run one aggregated gate before release:

```bash
npm run verify:release-ready
node scripts/release-ready.js --format json
node scripts/release-ready.js --format md --out artifacts/release-ready.md
```
