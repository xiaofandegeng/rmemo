# Development Plan

This plan is optimized for "daily use" and long-term maintainability. Each milestone should keep the tool usable.

## v0.1 (Current)

Done:
- CLI: `init`, `scan`, `log`, `context`, `print`
- Repo scan (git-aware) -> `.repo-memory/manifest.json` + `.repo-memory/index.json`
- Context Pack generator -> `.repo-memory/context.md`

## v0.2 (Make Memory More Useful)

Goals:
- Produce a better "project memory" without tying to any specific repo type.
- Reduce manual work to keep rules/todos/journal consistent.

Tasks:
- Add `rmemo status`:
  - Summarize "Next / Blockers / Recent log" from `.repo-memory/*`
  - Output should be pasteable to issues/PR descriptions
- Improve scan heuristics:
  - Detect monorepo candidates (workspaces, pnpm, turborepo, packages/apps)
  - Detect common app folders (web/admin/backend/miniapp/mp) as hints only
  - Detect API contract files and doc roots (openapi/swagger/docs)
- Add `--format md|json` for commands that output structured info (`status`, `scan`)

## v0.3 (Rules Become Enforceable)

Goals:
- Prevent "AI drift" by making key conventions executable.

Tasks:
- Add `.repo-memory/rules.json` (optional, generated or edited):
  - Structure rules: required dirs/files, forbidden paths, naming regexes
  - Codegen hints: which files are "entry points" or "do not touch"
- Add `rmemo check`:
  - Validate repo against rules.json (no network)
  - Exit code for CI usage
  - Print actionable diff-like messages
- Add `rmemo hook install`:
  - Install a pre-commit hook to run `rmemo check` (opt-in)

## v0.4 (Workflow: Start/Stop The Day)

Goals:
- Make the daily routine effortless.

Tasks:
- Add `rmemo start`:
  - Run `scan` + generate `context`
  - Print "what to paste to AI" section
- Add `rmemo done`:
  - Promptless mode: take stdin to append to journal
  - Optionally extract "next steps" into todos.md

## v0.5 (Polish + Adoption)

Goals:
- Make it easy for others to adopt.

Tasks:
- Publish to npm (`rmemo` name might be taken; decide final package name)
- Add tests (node:test) for scan/context/rules checking
- Add docs:
  - "How I use this with Cursor/Claude/ChatGPT"
  - Examples of rules.md templates for web + miniapp projects

