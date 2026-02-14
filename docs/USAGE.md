# Usage (AI Workflow)

This doc shows a practical workflow to use `rmemo` with any AI coding tool.

## Daily Workflow

### Start of day

From your repo:

```bash
node /path/to/rmemo/bin/rmemo.js --root . start
```

What to paste to AI:
1. Paste `.repo-memory/context.md`
2. Optionally paste the `rmemo start` output (Status)

Tip:
- The `Status` output numbers Next/Blockers items in `--mode brief`, which matches `rmemo todo done|unblock <n>`.

### During the day

Log important decisions (keep it short and factual):

```bash
node /path/to/rmemo/bin/rmemo.js --root . log "Decided: keep API error codes aligned with backend enums"
```

Track next steps and blockers:

```bash
node /path/to/rmemo/bin/rmemo.js --root . todo add "Implement user search filters"
node /path/to/rmemo/bin/rmemo.js --root . todo block "Waiting for backend API contract"
```

### End of day

Write a summary and set the first task for tomorrow:

```bash
node /path/to/rmemo/bin/rmemo.js --root . done --next "Tomorrow: implement search filters UI" "Today: finished list page; refactored table component"
```

## Rules (Prevent AI Drift)

Create/maintain:
- `.repo-memory/rules.md` (human rules)
- `.repo-memory/rules.json` (executable checks)

Run:

```bash
node /path/to/rmemo/bin/rmemo.js --root . check
```

For git pre-commit (fast, staged only):

```bash
node /path/to/rmemo/bin/rmemo.js --root . hook install
```

## Sync Instructions Into AI Tools

If your AI tool supports repo-local instruction files, generate them from `.repo-memory/`:

```bash
node /path/to/rmemo/bin/rmemo.js --root . sync
```

CI / sanity check (no writes):

```bash
node /path/to/rmemo/bin/rmemo.js --root . --check sync
```

## One-Time Setup (Hooks + Config)

If the repo is a git repo, you can enable an "always-on" workflow:

```bash
node /path/to/rmemo/bin/rmemo.js --root . setup
```

Notes:
- `pre-commit` blocks commits that violate `rules.json` (`rmemo check --staged`).
- other hooks keep AI instruction files updated (`rmemo sync`, non-blocking).

Audit / CI:

```bash
node /path/to/rmemo/bin/rmemo.js --root . --check setup
```

Uninstall:

```bash
node /path/to/rmemo/bin/rmemo.js --root . --uninstall setup
node /path/to/rmemo/bin/rmemo.js --root . --uninstall --remove-config setup
```

## One-File Handoff (Paste-Ready)

If you prefer one single paste, generate a handoff file:

```bash
node /path/to/rmemo/bin/rmemo.js --root . handoff
```

It updates scan/context first, then prints the handoff markdown and writes `.repo-memory/handoff.md`.

Machine-readable:

```bash
node /path/to/rmemo/bin/rmemo.js --root . --format json handoff
```

## PR Summary (Paste-Ready)

Generate a PR description snippet:

```bash
node /path/to/rmemo/bin/rmemo.js --root . pr
```

If your base branch is not detected correctly, pass `--base`:

```bash
node /path/to/rmemo/bin/rmemo.js --root . --base origin/main pr
```

## PR Comment Automation (GitHub Actions)

This repo includes a workflow that comments PR summaries automatically:
- [PR Automation](./PR_AUTOMATION.md)

## Watch Mode

Keep context and instruction files fresh while you work:

```bash
node /path/to/rmemo/bin/rmemo.js --root . watch
```

## Monorepo Workspaces

If you are in a monorepo, list subprojects and run commands inside them:

```bash
node /path/to/rmemo/bin/rmemo.js --root . ws ls
node /path/to/rmemo/bin/rmemo.js --root . ws start 1
node /path/to/rmemo/bin/rmemo.js --root . ws handoff apps/admin-web
```

## Tips

- Keep `rules.md` short and strict: 10-20 bullets.
- Put module boundaries in rules: "Do not import X from Y".
- When AI gets confused, regenerate context: `rmemo context` and paste again.
