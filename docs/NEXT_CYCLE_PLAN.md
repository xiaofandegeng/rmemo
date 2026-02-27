# rmemo Next Cycle Plan (v1.6)

Last updated: 2026-02-27  
Branch: `main`  
Current baseline: `@xiaofandegeng/rmemo@1.15.2`

## 1. Current State

- `v1.5` milestone track is complete (M1-M5 finished).
- Release automation is running and publishing from `release-please`.
- Current focus has shifted from feature expansion to release confidence and docs governance.

## 2. v1.6 Goals

- Goal A: strengthen release pipeline guardrails to prevent parameter drift regressions.
- Goal B: verify published artifact can be installed and executed from npm registry.
- Goal C: simplify and centralize docs navigation for faster handoff.

## 3. Milestones

### M1: Release Workflow Regression Guard (completed)

- [x] Keep release audit export commands stable with explicit `--allow-dirty`.
- [x] Add test coverage for release workflow critical command invariants.

### M2: Post-publish Install Smoke (completed)

- [x] Add workflow step to run `npx -y <pkg>@<version>` smoke checks after publish success.
- [x] Validate real command execution path (`--help`, `init`, `status --format json`).

### M3: Docs Entry Simplification (completed)

- [x] Create docs index page (`docs/INDEX.md`) as central navigation.
- [x] Update README/README.zh-CN to prioritize concise quick-start + docs index links.
- [x] Mark v1.5 cycle as closed and point execution baseline to v1.6.

## 4. Next Candidates (v1.6.x)

- [ ] Add Windows-focused post-publish smoke path (PowerShell runner).
- [ ] Add a dedicated `verify:release-workflow` script for local preflight checks.
- [ ] Add release artifact integrity verification (checksum manifest) in workflow.

## 5. Execution Rule

Before each iteration:

1. `git pull --ff-only`
2. `git status --short`
3. `node --test`

Read in order:

1. `docs/INDEX.md`
2. `docs/NEXT_CYCLE_PLAN.md`
3. `docs/TASKS.md`
