# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- Add `rmemo sync` to generate AI tool instruction files from `.repo-memory/`.
- Add `.repo-memory/config.json` and `rmemo setup` (one-time hooks + config).
- Add `rmemo handoff` to generate a one-file, paste-ready AI handoff markdown.
- Add `rmemo pr` to generate a PR-ready markdown summary (`.repo-memory/pr.md`).
- Add a GitHub Actions PR workflow that comments rmemo summaries on pull requests.
- Add `rmemo watch` to auto-refresh context/sync while working (poll-based).
- Add `--format json` for `handoff` and `pr`, with `--max-changes` and `.repo-memory/*.json` outputs.
- Add monorepo workspace helper `rmemo ws` and scope git scanning to `--root` subdir.

## 0.0.3

- Publish scoped package `@xiaofandegeng/rmemo` via GitHub Actions.
- Add templates and `init --template` for bootstrapping `.repo-memory/`.

## 0.0.2

- Add `check --staged` (pre-commit optimized) and read staged content from git index.
- Add release workflow hardening and docs around release.

## 0.0.1

- Initial public release.
- Core commands: init/scan/context/print/log/status/check/hook/start/done/todo.
