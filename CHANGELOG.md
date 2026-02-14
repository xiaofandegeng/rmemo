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
- Add `rmemo ws batch` to run handoff/pr/sync/start across subprojects and write `.repo-memory/ws.md`.
- Add profiles (`rmemo profile`) and `rmemo init --auto` (detect + apply recommended profile).
- Add `rmemo profile check/upgrade` for profile drift reporting and safe re-apply with backups.
- Add `rmemo session` (start/note/end) to store sequential handoff snapshots in `.repo-memory/sessions/`.
- Add `rmemo serve` to expose repo memory over local HTTP (read-only by default, supports token auth).

## [0.2.0](https://github.com/xiaofandegeng/rmemo/compare/v0.1.0...v0.2.0) (2026-02-14)


### Features

* add profile check/upgrade ([d3254b5](https://github.com/xiaofandegeng/rmemo/commit/d3254b5a8e2ad5fe93f756fa2f088f19a3cd9eef))
* add rmemo serve (local http api) ([c478293](https://github.com/xiaofandegeng/rmemo/commit/c4782930b1606e3cf73226049f99dcee41e31454))
* add session workflow ([8e3ea85](https://github.com/xiaofandegeng/rmemo/commit/8e3ea85f98b0cad67000a2b8a4bc5f6a375a199d))
* workspace batch mode (ws batch) ([2f50fb1](https://github.com/xiaofandegeng/rmemo/commit/2f50fb105ad36c618e5a1a8dc8185e4c143d8151))

## 0.0.3

- Publish scoped package `@xiaofandegeng/rmemo` via GitHub Actions.
- Add templates and `init --template` for bootstrapping `.repo-memory/`.

## 0.0.2

- Add `check --staged` (pre-commit optimized) and read staged content from git index.
- Add release workflow hardening and docs around release.

## 0.0.1

- Initial public release.
- Core commands: init/scan/context/print/log/status/check/hook/start/done/todo.
