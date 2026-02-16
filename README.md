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
- `.repo-memory/embeddings/index.json`: embeddings index for semantic search (generated)

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
rmemo mcp
rmemo embed
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
- `GET /ui` (local dashboard)
- `GET /events` (SSE stream; for live updates)
- `GET /events/export?format=json|md&limit=200` (export recent events)
- `GET /diagnostics/export?format=json|md` (status + watch + events bundle)
- `GET /embed/status?format=json|md` (embeddings health/status)
- `GET /embed/plan?format=json|md` (preview reuse/embed actions before build)
- `GET /embed/jobs`, `GET /embed/jobs/:id` (background embeddings jobs)
- `GET /embed/jobs/failures?limit=20&errorClass=config` (failed-job clustering for governance)
- `GET /embed/jobs/governance` (health metrics + governance recommendations)
- `GET /embed/jobs/governance/history?limit=20` (governance policy versions)
- `GET /embed/jobs/config` (job scheduler config)
- `GET /watch` (watch runtime status)
- `GET /status?format=json`
- `GET /context`
- `GET /rules`
- `GET /todos?format=json`
- `GET /search?q=...` (keyword search)
- `GET /search?mode=semantic&q=...` (semantic search; requires `rmemo embed build`)
- `GET /ws/list?only=apps/a,apps/b` (detected monorepo subprojects)
- `GET /ws/focus?q=...&mode=semantic|keyword` (cross-workspace aggregated focus results)

Optional: enable write actions (token required):

```bash
rmemo serve --root . --token devtoken --allow-write
```

Optional: keep repo memory fresh automatically (watch mode) and stream events:

```bash
rmemo serve --root . --token devtoken --watch --watch-interval 2000
```

Write endpoints:
- `POST /watch/start {intervalMs?,sync?,embed?}`
- `POST /watch/stop`
- `POST /refresh {sync?,embed?}`
- `POST /todos/next {text}`
- `POST /todos/blockers {text}`
- `POST /todos/next/done {index}` (1-based)
- `POST /todos/blockers/unblock {index}` (1-based)
- `POST /log {text, kind?}`
- `POST /sync`
- `POST /embed/auto`
- `POST /embed/build {force?,useConfig?,provider?,model?,dim?,parallelism?,batchDelayMs?,kinds?...}`
  - emits SSE events: `embed:build:start`, `embed:build:progress`, `embed:build:ok`, `embed:build:err`
  - job orchestration events: `embed:job:queued`, `embed:job:start`, `embed:job:retry`, `embed:job:ok`, `embed:job:err`, `embed:job:canceled`, `embed:job:requeued`, `embed:jobs:retry-failed`
- `POST /embed/jobs {provider?,model?,dim?,parallelism?,batchDelayMs?,...}` (enqueue async build)
- `POST /embed/jobs/config {maxConcurrent,retryTemplate?,defaultPriority?}` (set scheduler concurrency + default retry policy)
- `POST /embed/jobs/:id/cancel`
- `POST /embed/jobs/:id/retry {priority?,retryTemplate?}` (one-click retry one failed/canceled job)
- `POST /embed/jobs/retry-failed {limit?,errorClass?,clusterKey?,priority?,retryTemplate?}` (bulk retry)
- `POST /embed/jobs/governance/config {governanceEnabled?,governanceWindow?,governanceFailureRateHigh?,...}` (set auto-governance policy)
- `POST /embed/jobs/governance/apply` (apply top governance recommendation now)
- `POST /embed/jobs/governance/simulate` (dry-run governance recommendations / apply impact)
- `POST /embed/jobs/governance/benchmark` (replay benchmark across policy candidates/windows)
- `POST /embed/jobs/governance/benchmark/adopt` (benchmark then adopt top candidate if score/gap gates pass)
- `POST /embed/jobs/governance/rollback {versionId}` (rollback to a governance policy version)

## MCP Server (stdio)

If your AI tool supports MCP, you can run:

```bash
rmemo mcp --root .
```

It exposes tools (examples): `rmemo_status`, `rmemo_context`, `rmemo_handoff`, `rmemo_pr`, `rmemo_rules`, `rmemo_todos`, `rmemo_search`, `rmemo_embed_status`, `rmemo_embed_plan`.

Optional: enable write tools (safety: disabled by default):

```bash
rmemo mcp --root . --allow-write
```

Write tools:
- `rmemo_todo_add`
- `rmemo_todo_done`
- `rmemo_log`
- `rmemo_sync`
- `rmemo_embed_auto`
- `rmemo_embed_build`
- `rmemo_embed_job_enqueue`
- `rmemo_embed_job_cancel`
- `rmemo_embed_jobs_config`
- `rmemo_embed_job_retry`
- `rmemo_embed_jobs_retry_failed`
- `rmemo_embed_jobs_governance_config`
- `rmemo_embed_jobs_governance_apply`
- `rmemo_embed_jobs_governance_rollback`
- `rmemo_embed_jobs_governance_benchmark_adopt`

Read tool:
- `rmemo_embed_jobs`
- `rmemo_embed_jobs_failures`
- `rmemo_embed_jobs_governance`
- `rmemo_embed_jobs_governance_history`
- `rmemo_embed_jobs_governance_simulate`
- `rmemo_embed_jobs_governance_benchmark`
- `rmemo_ws_list`
- `rmemo_ws_focus`

## Integrations (MCP Config Snippets)

Some IDEs/agents require a JSON snippet to register MCP servers (and may run with a restricted PATH).

Generate an Antigravity snippet (paste into "View raw config"):

```bash
rmemo integrate antigravity
rmemo integrate antigravity --format json
```

Other MCP clients:

```bash
rmemo integrate cursor --format json
rmemo integrate cline --format json
rmemo integrate claude-desktop --format json
```

Apply/merge into an existing JSON config file (creates a backup when changing it):

```bash
rmemo integrate claude-desktop --apply
rmemo integrate claude-desktop --apply --config /path/to/claude_desktop_config.json
```

If you hit `Unknown command: mcp`, your global `rmemo` is outdated. The snippet uses `node` + an absolute `bin/rmemo.js` path to avoid this.

## Semantic Search (Embeddings)

Build a local embeddings index (default: deterministic `mock` provider):

```bash
rmemo embed build
rmemo embed plan --parallel 4 --format json
rmemo embed search "auth token refresh"
rmemo embed status --format json
```

Optional OpenAI provider:

```bash
export OPENAI_API_KEY=...
rmemo embed build --provider openai --model text-embedding-3-small --batch-delay-ms 200
rmemo embed search "where is auth validated?"
```

## Monorepo Workspaces

If your repo is a monorepo, `rmemo ws` can detect subprojects and run commands inside them:

```bash
rmemo ws ls
rmemo ws start 1
rmemo ws handoff apps/admin-web
rmemo ws pr apps/admin-web --base origin/main
rmemo ws focus apps/admin-web "auth token refresh" --mode keyword
rmemo ws batch handoff
rmemo ws batch pr --base origin/main
rmemo ws batch focus "auth token refresh" --mode keyword --format json
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
