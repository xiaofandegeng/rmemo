# rmemo

Repo memory + dev journal CLI: scan any project, persist conventions/progress, and generate an AI-ready context pack.

[English](./README.md) | [简体中文](./README.zh-CN.md)

## Why

When you resume work the next day, AI tools often:
- forget project-specific rules and structure
- re-invent decisions you already made
- drift away from established conventions

`rmemo` fixes this by storing the "repo memory" inside the repo and generating a single `Context Pack` you can paste into any AI.

## Install

For now, run it directly with Node:

```bash
node bin/rmemo.js init
node bin/rmemo.js log "Finished user list page; next: add search filters"
node bin/rmemo.js context
node bin/rmemo.js print
```

Later you can publish to npm and install globally.

## Use On Any Repo

From the target repo root:

```bash
node /path/to/rmemo/bin/rmemo.js init
node /path/to/rmemo/bin/rmemo.js log "Did X; next: Y"
node /path/to/rmemo/bin/rmemo.js context
node /path/to/rmemo/bin/rmemo.js print
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
rmemo hook install
rmemo start
rmemo done
```

## Enforcing Rules (CI / Hooks)

`rmemo` supports executable repo rules in `.repo-memory/rules.json`.

Example:

```json
{
  "schema": 1,
  "requiredPaths": ["README.md"],
  "forbiddenPaths": [".env", ".env.*"],
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

## Roadmap (short)

- v0.2: better heuristics for monorepos, miniapp projects, and API contracts
- v0.3: `rmemo check` to enforce structure/rules (CI + git hook)
- v0.4: VS Code extension (quick log + generate/print context)
