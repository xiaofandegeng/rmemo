# rmemo

Repo memory + dev journal CLI for any codebase.

`rmemo` scans a repository, stores working rules/progress in `.repo-memory/`, and generates an AI-ready context pack for next-session continuity.

[English](./README.md) | [简体中文](./README.zh-CN.md)

## Install

```bash
npm i -g @xiaofandegeng/rmemo
```

## 5-Minute Start

Run in your project root:

```bash
rmemo init --auto
rmemo start
rmemo done "today's progress"
rmemo handoff
```

If you do not want global install:

```bash
node /path/to/rmemo/bin/rmemo.js --root /path/to/your-repo init
```

## Daily Workflow

```bash
rmemo start
rmemo check --staged
rmemo done "what changed / next"
rmemo handoff
rmemo pr --base origin/main
```

Recommended one-time setup:

```bash
rmemo setup
```

This sets up sync targets and git hooks (`pre-commit`, `post-commit`, `post-merge`, `post-checkout`).

## Key Outputs

`rmemo` manages these files under `.repo-memory/`:

- `rules.md`: team/project conventions
- `todos.md`: next steps and blockers
- `journal/YYYY-MM-DD.md`: daily progress log
- `context.md`: AI context pack
- `manifest.json` / `index.json`: scanned project metadata

## Integrations

Sync repo instructions for AI tools:

```bash
rmemo sync
rmemo sync --check
```

Serve local HTTP endpoints (dashboard + context APIs):

```bash
rmemo serve --root . --token devtoken --port 7357
```

Run as MCP server:

```bash
rmemo mcp --root .
rmemo mcp --root . --allow-write
```

Build semantic index (optional):

```bash
rmemo embed build
rmemo embed search "auth token refresh"
```

Monorepo support:

```bash
rmemo ws ls
rmemo ws batch handoff
```

## Stability Contract

From `v1.0.0+`:

- CLI command names and existing flags are stable across minor versions.
- HTTP/MCP responses remain backward-compatible (new fields may be added).
- `.repo-memory` structure is stable for automation consumers.

## Release & Quality

Common checks:

```bash
node --test
npm run pack:dry
npm run verify:release-ready
```

For full release flow, use:

- [Releasing](./RELEASING.md)
- [Release Checklist](./docs/RELEASE_CHECKLIST.md)

## Documentation

- [Usage](./docs/USAGE.md)
- [PR Automation](./docs/PR_AUTOMATION.md)
- [Contracts](./docs/CONTRACTS.md)
- [Regression Matrix](./docs/REGRESSION_MATRIX.md)
- [Release Notes Template](./docs/RELEASE_NOTES_TEMPLATE.md)
- [Upgrade Guide (v1.0)](./docs/UPGRADING_TO_1_0.md)
- [Roadmap (ZH)](./docs/LONG_TERM_ROADMAP.zh-CN.md)
