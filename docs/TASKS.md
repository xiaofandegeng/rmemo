# Tasks

This file is a lightweight "what are we doing next" board.

## Current Status

- Latest tag: `v0.0.3`
- Package name: `@xiaofandegeng/rmemo`
- Milestones:
  - v0.1-v0.5: shipped
  - v0.6: optional enhancements (partially shipped)

## Next (Recommended)

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
6. Improve `rmemo handoff`
   - add `--format json`
   - add `--max-changes` and stable ordering
   - optionally include a compact subproject table
7. Improve `rmemo pr`
   - add `--max-changes` and stable ordering
   - optionally include a short "why" section from journal heuristics
8. GitHub integration
   - PR workflow: run check + generate pr/handoff + comment
9. Watch mode
   - add ignore patterns and stable poll signature for non-git repos
   - consider `--format json` events for tooling
10. Monorepo workspaces
   - `rmemo ws ls/start/status/handoff/pr/sync`
   - ensure git scanning is scoped to `--root` subdir
