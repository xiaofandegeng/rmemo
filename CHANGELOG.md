# Changelog

All notable changes to this project will be documented in this file.

## [0.37.2](https://github.com/xiaofandegeng/rmemo/compare/v0.37.1...v0.37.2) (2026-02-21)


### 📚 Documentation

* add v1.0.0 stability contract and migration guide ([d5e0f09](https://github.com/xiaofandegeng/rmemo/commit/d5e0f09d88a4fcfd84386ba7eecb13eff7759799))


### 🧹 Chores

* freeze master plan checkboxes ([923157a](https://github.com/xiaofandegeng/rmemo/commit/923157a3d3868e4ed0f3291cbfc909947f299665))
* prepare for v1.0.0 stability contract release ([b8705e8](https://github.com/xiaofandegeng/rmemo/commit/b8705e8f01ec464adaf20f60b52782f4c2179e3d))

## [1.0.0] - 2026-02-21

- **Stability Contract Milestone**: All CLI commands, HTTP endpoints, and MCP Schemas have been frozen. Backwards compatibility for `.repo-memory/` formats and AI payloads is formally guaranteed for all 1.x releases.
- Add `UPGRADING_TO_1_0.md` Migration Guide to document seamless upgrades from 0.3x environments.
- Stabilized failure governance payloads with JSON CI/CD exports (`node bin/rmemo.js diagnostics export --format json`) integrated into PR assistant and GitHub pipelines.
- Consolidated release pipeline using `release-please` for NPM dry-run validation and GitHub robust releases.

## [v0.39.0] - 2026-02-21

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
- Add `rmemo ws alerts board pulse-plan` and `rmemo ws alerts board pulse-apply` workflows.
- Add `rmemo embed` to build a local embeddings index and support semantic search (CLI/HTTP/MCP).

- Add persistent Action Job queue and execution manager for background processing.
- Add `rmemo ws alerts action-job` CLI commands (enqueue, list, show, pause, resume, cancel).
- Expose Action Job HTTP endpoints and Server-Sent Events (SSE) for progress updates.
- Expose Action Job control tools over MCP (`rmemo_ws_focus_action_jobs`, `rmemo_ws_focus_action_job_enqueue`, `rmemo_ws_focus_action_job_control`).
- Add Action Jobs dashboard and controls to the web UI.

## [0.37.1](https://github.com/xiaofandegeng/rmemo/compare/v0.37.0...v0.37.1) (2026-02-21)


### 📚 Documentation

* add release runbook ([1b118be](https://github.com/xiaofandegeng/rmemo/commit/1b118be93350118d5f9d33918c4cb6fd56c2d95e))


### 🧹 Chores

* consolidate publishing pipeline to release-please ([71fbd8b](https://github.com/xiaofandegeng/rmemo/commit/71fbd8bb9845f3d0ffb6b1d4f042518c30e09118))


### 🎯 Testing

* remove stray merge marker from workspaces.test.js ([6b2697a](https://github.com/xiaofandegeng/rmemo/commit/6b2697a35a0a1fa545295d60f2c7e6329eb42b22))

## [0.37.0](https://github.com/xiaofandegeng/rmemo/compare/v0.36.0...v0.37.0) (2026-02-20)


### Features

* add diagnostics export with cli/http/mcp integration ([52fb3fe](https://github.com/xiaofandegeng/rmemo/commit/52fb3fe4de8644ed19fa147f6533a93061eeb12f))
* implement governance policy templating (v0.37.0) ([d65eb7b](https://github.com/xiaofandegeng/rmemo/commit/d65eb7b9f6c3517490016c476f9dfd3b2f7bf292))
* **ws:** implement persistent action job queue and execution manager ([a401496](https://github.com/xiaofandegeng/rmemo/commit/a401496056ac02c0beddfd6e0a69f6d9feab6d7d))

## [0.36.0](https://github.com/xiaofandegeng/rmemo/compare/v0.35.0...v0.36.0) (2026-02-20)


### Features

* idempotent pulse application and dedupe windowing ([49184f6](https://github.com/xiaofandegeng/rmemo/commit/49184f6dafb31913039b77dad1a35d8c1b8c2beb))

## [0.35.0](https://github.com/xiaofandegeng/rmemo/compare/v0.34.0...v0.35.0) (2026-02-20)


### Features

* add board pulse plan/apply and next-cycle handoff plan ([9393092](https://github.com/xiaofandegeng/rmemo/commit/93930927701eaf89dafe1166582a0839645ff2ca))

## [0.34.0](https://github.com/xiaofandegeng/rmemo/compare/v0.33.0...v0.34.0) (2026-02-18)


### Features

* add alerts board pulse sla and incident history ([27a99f1](https://github.com/xiaofandegeng/rmemo/commit/27a99f14d0c59290c5ebc128fe3f667e15dabe72))

## [0.33.0](https://github.com/xiaofandegeng/rmemo/compare/v0.32.0...v0.33.0) (2026-02-18)


### Features

* add action board lifecycle report and close workflows ([e446e6d](https://github.com/xiaofandegeng/rmemo/commit/e446e6d3e52f609b4f76ccd4f4612bba51c223b6))

## [0.32.0](https://github.com/xiaofandegeng/rmemo/compare/v0.31.0...v0.32.0) (2026-02-18)


### Features

* add alerts action board across cli api mcp and ui ([55afc3d](https://github.com/xiaofandegeng/rmemo/commit/55afc3d9acfeadfb820d926911494234884af01f))

## [0.31.0](https://github.com/xiaofandegeng/rmemo/compare/v0.30.0...v0.31.0) (2026-02-17)


### Features

* add alerts action plans with apply workflow ([3c81aae](https://github.com/xiaofandegeng/rmemo/commit/3c81aae4a523fa0912df06f67a22de85b335c5ee))

## [0.30.0](https://github.com/xiaofandegeng/rmemo/compare/v0.29.0...v0.30.0) (2026-02-17)


### Features

* add workspace alert timeline and RCA pack ([9aa006e](https://github.com/xiaofandegeng/rmemo/commit/9aa006e746ad61890f5329a260cc0758d6e175dd))

## [0.29.0](https://github.com/xiaofandegeng/rmemo/compare/v0.28.0...v0.29.0) (2026-02-17)


### Features

* **ws:** add trend alerts with configurable policy and governance hook ([6354296](https://github.com/xiaofandegeng/rmemo/commit/6354296b8f71ef9221992b52366816a54be9249c))

## [0.28.0](https://github.com/xiaofandegeng/rmemo/compare/v0.27.0...v0.28.0) (2026-02-17)


### Features

* **ws:** add trend board across CLI/HTTP/MCP/UI ([e6d3df4](https://github.com/xiaofandegeng/rmemo/commit/e6d3df4822c29b6042981b5d9eb50a7c8a04afcd))

## [0.27.0](https://github.com/xiaofandegeng/rmemo/compare/v0.26.0...v0.27.0) (2026-02-17)


### Features

* **ws:** persist drift reports and add report history APIs/tools ([0578944](https://github.com/xiaofandegeng/rmemo/commit/0578944e0efbc46c351b6af733b37e731121b13e))

## [0.26.0](https://github.com/xiaofandegeng/rmemo/compare/v0.25.0...v0.26.0) (2026-02-16)


### Features

* add workspace focus snapshots and drift comparison ([853fd5f](https://github.com/xiaofandegeng/rmemo/commit/853fd5f26dfd1f4c9721cced021a16cfecded172))
* **ws:** add workspace focus drift report across CLI/HTTP/MCP/UI ([8739f94](https://github.com/xiaofandegeng/rmemo/commit/8739f941a61809f36e76e070993ddd9292e70699))

## [0.25.0](https://github.com/xiaofandegeng/rmemo/compare/v0.24.0...v0.25.0) (2026-02-16)


### Features

* add workspace hub panel to UI for ws list and focus ([645938a](https://github.com/xiaofandegeng/rmemo/commit/645938ad8d0192a65b5f488a41832d8081ae8b8e))

## [0.24.0](https://github.com/xiaofandegeng/rmemo/compare/v0.23.0...v0.24.0) (2026-02-16)


### Features

* add cross-workspace focus APIs for serve and MCP ([8a565db](https://github.com/xiaofandegeng/rmemo/commit/8a565dbfd63f1a2dc56fb0914dc82240fc23a0ef))

## [0.23.0](https://github.com/xiaofandegeng/rmemo/compare/v0.22.0...v0.23.0) (2026-02-16)


### Features

* add cross-workspace focus for monorepo orchestration ([77a402b](https://github.com/xiaofandegeng/rmemo/commit/77a402b934b029a2475693bab8bbe567c2dcae98))
* add governance benchmark auto-adopt across API MCP and UI ([e03ea18](https://github.com/xiaofandegeng/rmemo/commit/e03ea1867dea8e71c3a89e0eb9fdc207c3eeb562))

## [0.22.0](https://github.com/xiaofandegeng/rmemo/compare/v0.21.0...v0.22.0) (2026-02-16)


### Features

* add governance benchmark replay and ranking ([35e8b27](https://github.com/xiaofandegeng/rmemo/commit/35e8b270a8d29e401688e8d8c8a02a0255a6de8a))
* add governance policy simulator and impact preview ([c720040](https://github.com/xiaofandegeng/rmemo/commit/c72004006223759023b870ed343cf8c0aba58cf4))

## [0.21.0](https://github.com/xiaofandegeng/rmemo/compare/v0.20.0...v0.21.0) (2026-02-16)


### Features

* add governance policy versioning and rollback ([5500305](https://github.com/xiaofandegeng/rmemo/commit/5500305648756e50a84e2c763092c5b7d2c6cd78))

## [0.20.0](https://github.com/xiaofandegeng/rmemo/compare/v0.19.0...v0.20.0) (2026-02-16)


### Features

* add auto-governance engine for embed jobs ([8c0c233](https://github.com/xiaofandegeng/rmemo/commit/8c0c233df7f2f60deab0e4835675ea25002b8858))

## [0.19.0](https://github.com/xiaofandegeng/rmemo/compare/v0.18.0...v0.19.0) (2026-02-16)


### Features

* task governance v2 for embeddings jobs ([1a972a8](https://github.com/xiaofandegeng/rmemo/commit/1a972a823b6e152b08868e125f29c3c7619bb87b))

## [0.18.0](https://github.com/xiaofandegeng/rmemo/compare/v0.17.0...v0.18.0) (2026-02-16)


### Features

* embeddings job orchestration (priority retry concurrency) ([8edd3be](https://github.com/xiaofandegeng/rmemo/commit/8edd3beb8575b5bc1c4c6df13fe460813003edbc))

## [0.17.0](https://github.com/xiaofandegeng/rmemo/compare/v0.16.0...v0.17.0) (2026-02-16)


### Features

* accelerate embeddings build with progress events ([59f1f92](https://github.com/xiaofandegeng/rmemo/commit/59f1f9239c708f71a9581202a71c2e016129f150))
* embeddings background job queue for workbench and mcp ([f218b2c](https://github.com/xiaofandegeng/rmemo/commit/f218b2c6fd8332244b338ffefb4fab89423213f4))

## [0.16.0](https://github.com/xiaofandegeng/rmemo/compare/v0.15.0...v0.16.0) (2026-02-16)


### Features

* embeddings build plan across cli/http/mcp/ui ([9c079ab](https://github.com/xiaofandegeng/rmemo/commit/9c079abe6d17cb1610f25ce32ca4c97be9085708))

## [0.15.0](https://github.com/xiaofandegeng/rmemo/compare/v0.14.0...v0.15.0) (2026-02-16)


### Features

* diagnostics bundle export (status/watch/events) ([161c435](https://github.com/xiaofandegeng/rmemo/commit/161c435652b1f90ee722e143bae82b9e312eee49))
* embeddings ops surface (status/build) across cli/http/mcp/ui ([0e64b5c](https://github.com/xiaofandegeng/rmemo/commit/0e64b5c190fbb5fb534459bea86feb0f0a39a693))

## [0.14.0](https://github.com/xiaofandegeng/rmemo/compare/v0.13.0...v0.14.0) (2026-02-16)


### Features

* observability loop (watch metrics + events export) ([97de17a](https://github.com/xiaofandegeng/rmemo/commit/97de17a737718df7e5ab629a68cf30fac8237812))

## [0.13.0](https://github.com/xiaofandegeng/rmemo/compare/v0.12.0...v0.13.0) (2026-02-15)


### Features

* workbench watch control panel ([b438ebc](https://github.com/xiaofandegeng/rmemo/commit/b438ebc26bcacbf59b7f02c1910fbaf52b40a571))

## [0.12.0](https://github.com/xiaofandegeng/rmemo/compare/v0.11.0...v0.12.0) (2026-02-15)


### Features

* ui refresh repo memory button ([dbe76c7](https://github.com/xiaofandegeng/rmemo/commit/dbe76c7d5f619b229248fffb78cbb3131c212b9c))

## [0.11.0](https://github.com/xiaofandegeng/rmemo/compare/v0.10.0...v0.11.0) (2026-02-15)


### Features

* persistent workbench (sse resume + watch status + refresh api) ([2051cd7](https://github.com/xiaofandegeng/rmemo/commit/2051cd75c5769330c5e36d325a89edf00ec8db46))

## [0.10.0](https://github.com/xiaofandegeng/rmemo/compare/v0.9.0...v0.10.0) (2026-02-15)


### Features

* serve watch mode + sse events ([67385f0](https://github.com/xiaofandegeng/rmemo/commit/67385f0d92da9b304de9e5c79221b4dd2abe59de))

## [0.9.0](https://github.com/xiaofandegeng/rmemo/compare/v0.8.0...v0.9.0) (2026-02-15)


### Features

* integrate snippets + doctor ([c591125](https://github.com/xiaofandegeng/rmemo/commit/c591125c03857eca8fefbc13c441f89676cb12bf))
* integrate supports multiple clients and apply ([eb27789](https://github.com/xiaofandegeng/rmemo/commit/eb27789a21ad8168f1b183c865c92cadcb820544))

## [0.8.0](https://github.com/xiaofandegeng/rmemo/compare/v0.7.0...v0.8.0) (2026-02-15)


### Features

* mcp write tools (allow-write) ([a10c6a8](https://github.com/xiaofandegeng/rmemo/commit/a10c6a8dd9dcf09aed7ba1a3908a02a3ef35c478))
* serve workbench write endpoints ([0598bb3](https://github.com/xiaofandegeng/rmemo/commit/0598bb3a3b46f750dc0bcb2488034c0c88f35f78))

## [0.7.0](https://github.com/xiaofandegeng/rmemo/compare/v0.6.0...v0.7.0) (2026-02-15)


### Features

* serve /ui dashboard ([4caf82f](https://github.com/xiaofandegeng/rmemo/commit/4caf82fecd68991fe0bb1acd370a0087140f4623))

## [0.6.0](https://github.com/xiaofandegeng/rmemo/compare/v0.5.0...v0.6.0) (2026-02-15)


### Features

* focus pack (cli/http/mcp) ([4e883c0](https://github.com/xiaofandegeng/rmemo/commit/4e883c06f8dbe84e870406ddd1e974143321f9c0))
* ws batch embed (auto/check) for monorepos ([60c0d90](https://github.com/xiaofandegeng/rmemo/commit/60c0d902961a8547738fa1d3f12b21f222afb7a2))

## [0.5.0](https://github.com/xiaofandegeng/rmemo/compare/v0.4.0...v0.5.0) (2026-02-15)


### Features

* embed auto + setup/watch integration ([b72f6b0](https://github.com/xiaofandegeng/rmemo/commit/b72f6b0de724d19375a99c36a158620cfe3637ca))

## [0.4.0](https://github.com/xiaofandegeng/rmemo/compare/v0.3.0...v0.4.0) (2026-02-15)


### Features

* embed build --check for up-to-date index ([1c52819](https://github.com/xiaofandegeng/rmemo/commit/1c52819641311c8654674ce25f652b70f6b01065))
* semantic search via embeddings index ([1a857aa](https://github.com/xiaofandegeng/rmemo/commit/1a857aaea0e35095212c528c4c46f335f6c00a33))


### Performance Improvements

* git-aware embeddings reuse across commits ([410a46c](https://github.com/xiaofandegeng/rmemo/commit/410a46c54a0c707c5a1e4751cc6144205153fc80))
* incremental embeddings rebuild with config-aware reuse ([9e2b0e0](https://github.com/xiaofandegeng/rmemo/commit/9e2b0e05c38df1620a18cacb72188bd6b681affc))

## [0.3.0](https://github.com/xiaofandegeng/rmemo/compare/v0.2.0...v0.3.0) (2026-02-14)


### Features

* add MCP stdio server ([b58c263](https://github.com/xiaofandegeng/rmemo/commit/b58c2634d623513a8054d217161e0ee0da974f94))

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
