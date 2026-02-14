# Tasks

This file is a lightweight "what are we doing next" board.

## Current Status

- Latest tag: `v0.1.0`
- Package name: `@xiaofandegeng/rmemo`
- Milestones:
  - v0.1-v0.6: shipped
  - v0.7-v1.4: shipped (AI integration, always-on, handoff/pr, watch, monorepo workspaces)

## Next Iteration (Recommended)

Theme: **Profiles (Auto-Adopt + Team Defaults)**

1. Add `rmemo profile` (or evolve `template` into profiles with metadata)
2. Auto-suggest/apply profile on first run:
   - `rmemo init --auto` (detect repo type -> apply recommended profile)
3. Profile-driven defaults (write to `.repo-memory/config.json`)
   - sync targets, watch interval, PR base ref, handoff/pr max-changes
4. Profile diff/upgrade:
   - `rmemo profile check` shows drift from profile
   - `rmemo profile upgrade` updates rules/config safely (with backups)

## Backlog (Smaller / Optional)

1. Improve `rmemo sync`
   - add `--targets` docs per tool
   - add `--print <target>` (stdout) for quick copy/paste
2. Add more templates
   - `web-admin-react`
   - `backend-node`
   - `fullstack-monorepo`
3. Add `rmemo template describe <id>` (prints what it writes and why)
4. Add `rmemo check` UX flags
   - `--max-violations <n>`
   - stable ordering for violations
5. Add `rmemo scan` optional outputs
   - `--format md` include a compact subproject table
6. Watch mode
   - add ignore patterns and stable poll signature for non-git repos
   - consider `--format json` events for tooling
7. Monorepo workspaces
   - `rmemo ws batch` add `pr` example coverage with `--base` and JSON output in docs
8. GitHub integration
   - PR workflow: run `rmemo check` on working tree (not `--staged`)
