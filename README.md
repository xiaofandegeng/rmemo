# rmemo

Repo memory + dev journal CLI: scan any project, persist conventions/progress, and generate an AI-ready context pack.

[English](./README.md) | [简体中文](./README.zh-CN.md)

Docs:
- [Usage (AI Workflow)](./docs/USAGE.md)
- [Releasing](./RELEASING.md)
- [PR Automation](./docs/PR_AUTOMATION.md)
- [Upgrading to v1.0](./docs/UPGRADING_TO_1_0.md)
- [Contracts](./docs/CONTRACTS.md)
- [Regression Matrix](./docs/REGRESSION_MATRIX.md)
- [Release Checklist](./docs/RELEASE_CHECKLIST.md)
- [Release Notes Template](./docs/RELEASE_NOTES_TEMPLATE.md)
- [Long-term Roadmap (ZH)](./docs/LONG_TERM_ROADMAP.zh-CN.md)
- [Iteration Master Plan (ZH)](./docs/ITERATION_MASTER_PLAN.zh-CN.md)

## 🛡 Stability Contract (v1.0.0+)
From v1.0.0 onwards, `rmemo` guarantees the following:
- **CLI Commands**: Command names (e.g. `rmemo ws`, `rmemo embed`) and their flags will not be removed or renamed without a major version bump. Additive flags are permitted in minor versions.
- **HTTP/MCP APIs**: Response payloads will remain structurally backwards-compatible. New fields may be appended, but existing fields will remain typed identically. Breaking changes require a `v2.0.0` release.
- **Storage Format**: `.repo-memory` folder structure (`context.md`, `rules.md`, `todos.md`, `ws-focus/`) is frozen. We guarantee seamless parsing for downstream workflow integrations.

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
rmemo contract check
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
- `GET /timeline?format=md|json&days=14&limit=80&include=journal,session,todo` (ordered project memory timeline)
- `GET /resume?format=md|json&timelineDays=14&timelineLimit=40` (next-day resume pack)
- `GET /resume/digest?format=md|json&timelineDays=7&timelineLimit=20` (auto concise handoff digest)
- `GET /resume/history?format=md|json&limit=20` (resume digest snapshots history)
- `GET /resume/history/item?id=<snapshotId>&format=md|json` (one snapshot detail)
- `GET /resume/history/compare?from=<id>&to=<id>&format=md|json` (snapshot diff for resume handoff)
- `GET /ws/list?only=apps/a,apps/b` (detected monorepo subprojects)
- `GET /ws/focus?q=...&mode=semantic|keyword` (cross-workspace aggregated focus results; supports `save=1`, `compareLatest=1`, `tag=...`)
- `GET /ws/focus/snapshots?limit=20` (workspace focus snapshot history)
- `GET /ws/focus/compare?from=<id>&to=<id>` (compare two workspace focus snapshots)
- `GET /ws/focus/report?from=<id>&to=<id>&format=json|md&save=1&tag=<name>` (workspace drift report; omit ids to use latest two snapshots)
- `GET /ws/focus/reports?limit=20` (saved workspace drift report history)
- `GET /ws/focus/report-item?id=<reportId>&format=json|md` (get one saved workspace drift report)
- `GET /ws/focus/trends?limitGroups=20&limitReports=200` (workspace trend board grouped by query/mode)
- `GET /ws/focus/trend?key=<trendKey>&format=json|md&limit=100` (get one trend series by key)
- `GET /ws/focus/alerts?limitGroups=20&limitReports=200&key=<trendKey>` (evaluate drift alerts from trend groups)
- `GET /ws/focus/alerts/config` (get workspace alert policy config)
- `GET /ws/focus/alerts/history?limit=20&key=<trendKey>&level=high|medium` (recent alert incidents timeline)
- `GET /ws/focus/alerts/rca?incidentId=<id>&key=<trendKey>&format=json|md&limit=20` (RCA pack from alert timeline)
- `GET /ws/focus/alerts/action-plan?incidentId=<id>&key=<trendKey>&format=json|md&limit=20&save=1&tag=<name>` (generate actionable remediation plan)
- `GET /ws/focus/alerts/actions?limit=20` (saved action plans)
- `GET /ws/focus/alerts/action-item?id=<actionId>&format=json|md` (one saved action plan)
- `GET /ws/focus/alerts/boards?limit=20` (saved action execution boards)
- `GET /ws/focus/alerts/board-item?id=<boardId>&format=json|md` (one execution board)
- `GET /ws/focus/alerts/board-report?id=<boardId>&format=json|md&maxItems=20` (board progress report)
- `GET /ws/focus/alerts/board-pulse?limitBoards=50&todoHours=24&doingHours=12&blockedHours=6&save=1&source=<name>` (overdue pulse for open boards)
- `GET /ws/focus/alerts/board-pulse-history?limit=20` (saved board pulse incidents)

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
- `POST /resume/history/save {timelineDays?,timelineLimit?,maxTimeline?,maxTodos?,tag?}`
- `POST /resume/history/prune {keep?,olderThanDays?}`
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
- `POST /ws/focus/alerts/config {enabled?,minReports?,maxRegressedErrors?,maxAvgChangedCount?,maxChangedCount?,autoGovernanceEnabled?,autoGovernanceCooldownMs?}`
- `POST /ws/focus/alerts/check?autoGovernance=1&source=ws-alert`
- `POST /ws/focus/alerts/action-plan {incidentId,key,format,limit,save,tag}`
- `POST /ws/focus/alerts/action-apply {id,includeBlockers?,noLog?,maxTasks?}`
- `POST /ws/focus/alerts/action-jobs {actionId,priority?,batchSize?,retryPolicy?}` (enqueue job)
- `GET /ws/focus/alerts/action-jobs` (list jobs)
- `GET /ws/focus/alerts/action-jobs/:id` (show job)
- `POST /ws/focus/alerts/action-jobs/:id/pause`
- `POST /ws/focus/alerts/action-jobs/:id/resume`
- `POST /ws/focus/alerts/action-jobs/:id/cancel`
- `GET /ws/focus/alerts/action-jobs/events` (SSE progress stream)
- `POST /ws/focus/alerts/board-create {actionId,title?}`
- `POST /ws/focus/alerts/board-update {boardId,itemId,status,note?}`
- `POST /ws/focus/alerts/board-close {boardId,reason?,force?,noLog?}`

## MCP Server (stdio)

If your AI tool supports MCP, you can run:

```bash
rmemo mcp --root .
```

It exposes tools (examples): `rmemo_status`, `rmemo_context`, `rmemo_handoff`, `rmemo_pr`, `rmemo_rules`, `rmemo_todos`, `rmemo_search`, `rmemo_focus`, `rmemo_timeline`, `rmemo_resume`, `rmemo_resume_digest`, `rmemo_resume_history`, `rmemo_embed_status`, `rmemo_embed_plan`.

Optional: enable write tools (safety: disabled by default):

```bash
rmemo mcp --root . --allow-write
```

Write tools:
- `rmemo_todo_add`
- `rmemo_todo_done`
- `rmemo_log`
- `rmemo_resume_history_save`
- `rmemo_resume_history_prune`
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
- `rmemo_resume_history`
- `rmemo_embed_jobs`
- `rmemo_embed_jobs_failures`
- `rmemo_embed_jobs_governance`
- `rmemo_embed_jobs_governance_history`
- `rmemo_embed_jobs_governance_simulate`
- `rmemo_embed_jobs_governance_benchmark`
- `rmemo_ws_list`
- `rmemo_ws_focus`
- `rmemo_ws_focus_snapshots`
- `rmemo_ws_focus_compare`
- `rmemo_ws_focus_report`
- `rmemo_ws_focus_report_history`
- `rmemo_ws_focus_report_get`
- `rmemo_ws_focus_trends`
- `rmemo_ws_focus_trend_get`
- `rmemo_ws_focus_alerts`
- `rmemo_ws_focus_alerts_config`
- `rmemo_ws_focus_alerts_history`
- `rmemo_ws_focus_alerts_rca`
- `rmemo_ws_focus_alerts_action_plan`
- `rmemo_ws_focus_alerts_actions`
- `rmemo_ws_focus_alerts_action_get`
- `rmemo_ws_focus_alerts_boards`
- `rmemo_ws_focus_alerts_board_get`
- `rmemo_ws_focus_alerts_board_report`
- `rmemo_ws_focus_alerts_board_pulse`
- `rmemo_ws_focus_alerts_board_pulse_history`
- `rmemo_ws_focus_alerts_config_set` (write tool)
- `rmemo_ws_focus_alerts_check` (write tool; optional auto-governance)
- `rmemo_ws_focus_alerts_action_apply` (write tool)
- `rmemo_ws_focus_alerts_board_create` (write tool)
- `rmemo_ws_focus_alerts_board_update` (write tool)
- `rmemo_ws_focus_alerts_board_close` (write tool)
- `rmemo_ws_focus_action_jobs`
- `rmemo_ws_focus_action_job_enqueue` (write tool)
- `rmemo_ws_focus_action_job_control` (write tool)

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
rmemo ws batch focus "auth token refresh" --mode keyword --format json --save --compare-latest --tag daily
rmemo ws focus-history list --format json
rmemo ws focus-history report --format md --save-report --report-tag daily-rpt
rmemo ws focus-history report <fromId> <toId> --format json --max-items 20 --save-report
rmemo ws report-history list --format json
rmemo ws report-history show <reportId> --format json
rmemo ws trend --format json --limit-groups 20 --limit-reports 200
rmemo ws trend show "keyword::auth token refresh" --format json --limit 100
rmemo ws alerts --format json --limit-groups 20 --limit-reports 200
rmemo ws alerts check --format json --key "keyword::auth token refresh"
rmemo ws alerts history --format json --limit 20 --level high
rmemo ws alerts rca --format md --incident <incidentId> --limit 20
rmemo ws alerts action-plan --format json --incident <incidentId> --save --tag daily-action
rmemo ws alerts action-history --format json --limit 20
rmemo ws alerts action-show --format json --action <actionId>
rmemo ws alerts action-apply --format json --action <actionId> --include-blockers --max-tasks 10
rmemo ws alerts board create --format json --action <actionId> --title "daily board"
rmemo ws alerts board list --format json --limit 20
rmemo ws alerts board show --format json --board <boardId>
rmemo ws alerts board remove --format json --board <boardId> --item <itemId>
rmemo ws action-jobs list --format json --limit 20
rmemo ws action-jobs show --format json --job <jobId>
rmemo ws action-jobs pause --format json --job <jobId>
rmemo ws action-jobs resume --format json --job <jobId>
rmemo ws action-jobs cancel --format json --job <jobId>
rmemo ws alerts board update --format json --board <boardId> --item <itemId> --status doing --note "started"
rmemo ws alerts board report --format json --board <boardId> --max-items 20
rmemo ws alerts board close --format json --board <boardId> --reason "done" --force
rmemo ws alerts board policy show --format json
rmemo ws alerts board policy set --preset strict --format json
rmemo ws alerts board pulse --format json --policy strict --save
rmemo ws alerts board pulse-history --format json --limit 20
rmemo ws alerts board pulse-plan --format json --policy strict
rmemo ws alerts board pulse-apply --format json --policy strict --limit-items 10
rmemo ws alerts config set --alerts-enabled --alerts-min-reports 2 --alerts-max-regressed-errors 0 --alerts-max-avg-changed 8 --alerts-max-changed 20 --alerts-auto-governance
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

Timeline (ordered memory for handoff/next-day resume):

```bash
rmemo timeline --days 14 --limit 80
rmemo timeline --format json --include journal,session,todo
rmemo timeline --brief
```

Resume pack (single command for next-day continuation):

```bash
rmemo resume
rmemo resume --brief --no-context
rmemo resume --format json --timeline-days 14 --timeline-limit 40
rmemo resume digest
rmemo resume digest --format json --timeline-days 7 --timeline-limit 20 --max-timeline 8 --max-todos 5
rmemo resume history list --format md --limit 20
rmemo resume history save --tag daily-check
rmemo resume history compare <fromId> <toId> --format json
rmemo resume history prune --keep 100 --older-than-days 30 --format json
# keep / older-than-days must be non-negative integers
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

## SRE & Publish Runbook

Since `v1.0.0`, package publishing is automated via `.github/workflows/release-please.yml`.
If the pipeline fails, it will attempt to dump a JSON diagnostics payload to the Action logs.

**One-command release rehearsal**

```bash
npm run verify:release-rehearsal -- --repo xiaofandegeng/rmemo
```

This writes release audit files to `artifacts/`:
- `release-notes.md`
- `release-ready.md` / `release-ready.json`
- `release-health.md` / `release-health.json`
- `release-rehearsal.md` / `release-rehearsal.json`
- `release-rehearsal.json` now includes `standardized.status/resultCode/checkStatuses/failureCodes/failures` and `summaryFailureCodes` (merged step classification + failed-step downstream standardized codes + health codes)
- `release-rehearsal.md` now includes a `Failure Signals` section (when failures exist) with step/check/code/category/retryable details
- `release-notes` also supports `--format json` with `standardized.status/resultCode/checkStatuses/failureCodes/failures`
- `verify:changelog` (`changelog-lint`) JSON now includes `standardized.status/resultCode/checkStatuses/failureCodes/failures`
- `verify:matrix` (`regression-matrix`) JSON now includes `standardized.status/resultCode/checkStatuses/failureCodes/failures`

Timeout tuning (avoid hanging checks on unstable networks):
- `npm run verify:release-rehearsal -- --repo xiaofandegeng/rmemo --health-timeout-ms 15000`
- `npm run verify:release-rehearsal -- --repo xiaofandegeng/rmemo --summary-out artifacts/release-summary.json`
- `npm run verify:release-rehearsal -- --repo xiaofandegeng/rmemo --summary-out artifacts/release-summary.md --summary-format md`
- `npm run verify:release-rehearsal-archive -- --repo xiaofandegeng/rmemo --health-timeout-ms 15000 --archive-snapshot-id <yyyymmdd_hhmmss>`
- `npm run verify:release-rehearsal-archive-verify -- --repo xiaofandegeng/rmemo --health-timeout-ms 15000 --archive-snapshot-id <yyyymmdd_hhmmss>`
- `node scripts/release-ready.js --format md --step-timeout-ms 120000`
- `release-ready` JSON includes integration-friendly summary block (`standardized.status/resultCode/checkStatuses/failureCodes/failures`)

Archive release reports with a versioned snapshot:
- `npm run verify:release-archive -- --version <version> --tag v<version> --snapshot-id <yyyymmdd_hhmmss> --retention-days 30 --max-snapshots-per-version 20`
- `release-archive` JSON includes integration-friendly summary block (`standardized.status/resultCode/checkStatuses/failureCodes/failures`)
- `npm run verify:release-archive-find -- --version <version> --format json` (resolve latest snapshot / query archive index)
- `npm run verify:release-archive-find -- --version <version> --require-files release-ready.json,release-health.json,release-rehearsal.json --format json` (validate latest snapshot completeness)
- `release-archive-find` JSON includes integration-friendly summary block (`standardized.status/resultCode/checkStatuses/failureCodes/failures`)
- when using `--archive` in rehearsal mode, `artifacts/release-summary.json` and `artifacts/release-archive.json` are generated automatically
- when using `--archive-verify`, `artifacts/release-archive-verify.json` is generated and missing required files fail the rehearsal
- `release-summary.json` now includes failure categories + recovery hints (`failureBreakdown`, `retryableFailures`, `actionHints`)
- `release-summary.json` includes archive status details (`archive.snapshotId`, `archive.archiveStep`, `archive.verify`)
- `release-summary.json` also aggregates `release-health` + failed-step downstream standardized failure signals (`health.*`, `summaryFailureCodes`)
- `release-summary.json` includes integration-friendly summary block (`standardized.status/resultCode/checkStatuses/failureCodes/failures`)
- `release-summary.json.standardized.failures` now includes step-level failures + downstream step failure details + health-level failures (from `release-health`)
- summary output supports `--summary-format md|json` (default `json`; `.md` summary paths auto-infer markdown)

Post-release convergence check:
- `npm run verify:release-verify -- --repo xiaofandegeng/rmemo --version <version> --tag v<version>`
- `release-verify` JSON includes integration-friendly summary block (`standardized.status/resultCode/checkStatuses/failureCodes/failures`)

**Manual Fallback Publishing (Emergency Only)**
If GitHub Actions is down or npm tokens are expired, a manual release requires administrator privileges:
1. Generate diagnostics to ensure your local environment is sound: `rmemo diagnostics export` Check that `npm identity` matches the org owner.
2. Checkout the `main` branch and pull latest changes.
3. Verify tests pass: `node --test`
4. Publish: `npm publish`
5. Create a GitHub release from the local tag.
