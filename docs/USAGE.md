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

## Tips

- Keep `rules.md` short and strict: 10-20 bullets.
- Put module boundaries in rules: "Do not import X from Y".
- When AI gets confused, regenerate context: `rmemo context` and paste again.

