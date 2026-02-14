# rmemo

Repo memory + dev journal CLI: scan any project, persist conventions/progress, and generate an AI-ready context pack.

[English](./README.md) | [简体中文](./README.zh-CN.md)

Docs:
- [Usage (AI Workflow)](./docs/USAGE.md)
- [Releasing](./RELEASING.md)
- [PR Automation](./docs/PR_AUTOMATION.md)

## Why

When you resume work the next day, AI tools often:
- forget project-specific rules and structure
- re-invent decisions you already made
- drift away from established conventions

`rmemo` fixes this by storing the "repo memory" inside the repo and generating a single `Context Pack` you can paste into any AI.

## Install

Install globally:

```bash
npm i -g @xiaofandegeng/rmemo
```

Then run in any repo:

```bash
rmemo --root . init --auto
rmemo --root . init --template web-admin-vue
rmemo --root . start
rmemo --root . done "Today: ..."
```

If you prefer not installing globally, you can run it with Node from this repo too.

## Use On Any Repo

From the target repo root:

```bash
node /path/to/rmemo/bin/rmemo.js init
node /path/to/rmemo/bin/rmemo.js log "Did X; next: Y"
node /path/to/rmemo/bin/rmemo.js context
node /path/to/rmemo/bin/rmemo.js print
```

If installed globally:

```bash
rmemo --root . init
rmemo --root . init --template web-admin-vue
rmemo --root . start
rmemo --root . status --mode brief
rmemo --root . check --staged
```

Or without changing directories:

```bash
node /path/to/rmemo/bin/rmemo.js --root /path/to/your-repo init
```

## Files It Creates

- `.repo-memory/manifest.json`: detected structure, tech stack hints, key files
- `.repo-memory/index.json`: file list for context generation
- `.repo-memory/rules.md`: your conventions and constraints (human-written)
- `.repo-memory/todos.md`: next steps and blockers (human-written)
- `.repo-memory/journal/YYYY-MM-DD.md`: daily progress log (human-written)
- `.repo-memory/context.md`: generated AI-ready context pack (generated)

## Commands

```bash
rmemo init
rmemo scan
rmemo log <text>
rmemo context
rmemo print
rmemo status
rmemo check
rmemo sync
rmemo hook install
rmemo start
rmemo done
rmemo handoff
rmemo pr
  rmemo watch
rmemo ws
rmemo template ls
rmemo template apply <id>
rmemo session
rmemo serve
```

## Sync AI Tool Instructions

Some AI tools support repo-local instruction files (so they don't "forget" between sessions).

`rmemo sync` generates these files from `.repo-memory/`:
- `AGENTS.md`
- `.github/copilot-instructions.md`
- `.cursor/rules/rmemo.mdc`

Run:

```bash
rmemo sync
rmemo sync --check
rmemo sync --targets agents,copilot,cursor
rmemo sync --force
```

## One-Time Setup (Recommended)

If you want this to be "always on" in a repo, run:

```bash
rmemo setup
```

This will:
- create/update `.repo-memory/config.json` (sync targets)
- install git hooks:
  - `pre-commit`: `rmemo check --staged` (blocks bad commits)
  - `post-commit/post-merge/post-checkout`: `rmemo sync` (non-blocking, keeps AI instruction files fresh)

Disable hook installation:

```bash
rmemo setup --no-hooks
```

Audit (CI-friendly):

```bash
rmemo setup --check
```

Uninstall (safe: only removes rmemo-managed hooks):

```bash
rmemo setup --uninstall
rmemo setup --uninstall --remove-config
```

## One-File AI Handoff

Generate a single markdown you can paste into AI (also written to `.repo-memory/handoff.md`):

```bash
rmemo handoff
rmemo handoff --recent-days 5
rmemo handoff --since v0.0.3
rmemo handoff --staged
rmemo handoff --format json
```

## PR Summary

Generate a PR-ready markdown summary (also written to `.repo-memory/pr.md`):

```bash
rmemo pr
rmemo pr --base origin/main
rmemo pr --format json
rmemo pr --no-refresh
```

## Watch Mode (Always Fresh)

If you want context + instruction files to stay up to date while you work:

```bash
rmemo watch
rmemo watch --interval 5000
rmemo watch --no-sync
```

## Sessions (Start -> Note -> End)

If you want a lightweight "work session" trail (and a handoff snapshot per session):

```bash
rmemo session start --title "Fix login flow"
rmemo session note "Found root cause: token refresh race"
rmemo session end
rmemo session ls
```

## Repo Memory HTTP API (Local)

If your AI tool can fetch URLs, you can expose repo memory over local HTTP:

```bash
rmemo serve --root . --token devtoken --port 7357
```

Then fetch:
- `GET /status?format=json`
- `GET /context`
- `GET /rules`
- `GET /todos?format=json`

## Monorepo Workspaces

If your repo is a monorepo, `rmemo ws` can detect subprojects and run commands inside them:

```bash
rmemo ws ls
rmemo ws start 1
rmemo ws handoff apps/admin-web
rmemo ws pr apps/admin-web --base origin/main
rmemo ws batch handoff
rmemo ws batch pr --base origin/main
rmemo ws batch handoff --only apps/admin-web,apps/miniapp
```

## Enforcing Rules (CI / Hooks)

`rmemo` supports executable repo rules in `.repo-memory/rules.json`.

Example:

```json
{
  "schema": 1,
  "requiredPaths": ["README.md"],
  "requiredOneOf": [
    ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]
  ],
  "forbiddenPaths": [".env", ".env.*"],
  "forbiddenContent": [
    {
      "include": ["**/*"],
      "exclude": ["**/*.png", "**/*.jpg", "**/*.zip"],
      "match": "BEGIN PRIVATE KEY",
      "message": "Do not commit private keys."
    }
  ],
  "namingRules": [
    {
      "include": ["src/pages/**"],
      "target": "basename",
      "match": "^[a-z0-9-]+\\.vue$",
      "message": "Page filenames must be kebab-case."
    }
  ]
}
```

Run:

```bash
rmemo check
```

Machine-readable output:

```bash
rmemo check --format json
```

Pre-commit usage (faster, checks only staged files):

```bash
rmemo check --staged
```

Install a pre-commit hook (runs `rmemo check` before commit):

```bash
rmemo hook install
```

Start-of-day entrypoint (scan + generate context + print status):

```bash
rmemo start
```

End-of-day note (append to journal; supports stdin):

```bash
rmemo done "Finished X; decided Y"
echo "Finished X; decided Y" | rmemo done
rmemo done --next "Tomorrow: implement Z" --blocker "Waiting for API spec" "Summary: ..."
```

Todo helpers:

```bash
rmemo todo add "Implement user search"
rmemo todo block "Backend API missing"
rmemo todo ls
rmemo todo done 1
rmemo todo unblock 1
```

## Scan Output (Optional)

Print scan results to stdout:

```bash
rmemo scan --format json
rmemo scan --format md
```

## Templates (Optional)

Built-in templates can bootstrap `.repo-memory/` rules/todos:

```bash
rmemo template ls
rmemo template apply web-admin-vue
rmemo template apply miniapp
```

## Profiles (Recommended)

Profiles are "templates + defaults" (rules/todos + config) for common repo types.

```bash
rmemo profile ls
rmemo profile describe web-admin-vue
rmemo --root . profile apply web-admin-vue
rmemo --root . init --auto
```

## Roadmap (short)

- v0.2: better heuristics for monorepos, miniapp projects, and API contracts
- v0.3: `rmemo check` to enforce structure/rules (CI + git hook)
- v0.4: VS Code extension (quick log + generate/print context)
