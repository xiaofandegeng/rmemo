# rmemo v1.5 预研入口（草案）

更新时间：2026-02-26  
状态：v1.5 M1/M2 已完成，M3 启动

## 1. 进入条件

- `v1.4.0` 已发布并完成 npm / GitHub Release 双端核验。
- `docs/NEXT_CYCLE_PLAN.md` 的 v1.4 里程碑 C 已完成勾选。

## 2. 预研目标（候选）

- 目标 A：发布审计进一步自动化（减少人工回放步骤）。
- 目标 B：异常分层与可观测性增强（快速定位失败类别与恢复动作）。
- 目标 C：为后续功能迭代建立稳定的发布节奏模板。

## 3. 候选课题池（待评估）

- [x] 课题 1：`release-health` 结果结构标准化（便于告警/平台接入）。
- [x] 课题 2：发布产物与运行报告统一归档约定（命名、留存期、检索方式）。
- [x] 课题 3：`release-rehearsal` 增加一键“预发布演练摘要”输出（`--summary-out`）。

## 4. 当前入口任务（v1.5 M1）

- [x] `release-health` JSON 输出新增标准化字段：`standardized.status/resultCode/checkStatuses/failureCodes/failures`。
- [x] 新增 `release-archive` 统一归档：`artifacts/release-archive/<version>/<snapshot-id>/`，并生成 `latest/catalog` 索引与留存清理。
- [x] 新增 `release-archive-find` 归档检索命令：支持版本列表、最新快照定位、指定快照摘要查询。
- [x] 在 `release-rehearsal` 中新增 `--summary-out <path>`，输出紧凑 JSON 摘要（含 `failedSteps`）。
- [x] 补充自动化测试覆盖 `summary-out` 行为。

## 5. 当前执行任务（v1.5 M2）

- [x] `release-rehearsal` 新增 `--archive` 一键归档模式，串联演练与 `release-archive`。
- [x] `release-rehearsal` 支持归档参数透传（`archive-snapshot-id/archive-retention-days/archive-max-snapshots-per-version`）。
- [x] 在 `--archive` 模式下自动输出 `artifacts/release-summary.json` 与 `artifacts/release-archive.json`，补充成功/失败测试。
- [x] `release-summary.json` 增加失败分层与恢复提示（`category/code/retryable/nextAction` + `failureBreakdown/actionHints`）。
- [x] `release-archive-find` 新增 `--require-files` 校验模式，可直接检查最新快照关键文件完整性。
- [x] `release-summary.json` 聚合 `release-health.standardized` 失败码（`health.*` + `summaryFailureCodes`）。
- [x] `release-rehearsal` 新增 `--archive-verify` 串联归档完整性校验，输出 `release-archive-verify.json`。
- [x] `release-summary.json` 输出归档可观测字段（`archive.snapshotId/archiveStep/verify`）。
- [x] `release-summary.json` 新增 `standardized` 汇总块（status/resultCode/checkStatuses/failureCodes/failures）。
- [x] `release-archive-find` JSON 新增 `standardized` 汇总块（status/resultCode/checkStatuses/failureCodes/failures）。
- [x] `release-archive` JSON 新增 `standardized` 汇总块（status/resultCode/checkStatuses/failureCodes/failures）。
- [x] `release-summary.json.standardized.failures` 聚合步骤失败与 health 失败（跨来源统一失败明细）。
- [x] `release-verify` JSON 新增 `standardized` 汇总块（status/resultCode/checkStatuses/failureCodes/failures）。
- [x] `release-ready` JSON 新增 `standardized` 汇总块（status/resultCode/checkStatuses/failureCodes/failures）。
- [x] `release-notes` 支持 `--format json` 并新增 `standardized` 汇总块（status/resultCode/checkStatuses/failureCodes/failures）。
- [x] `changelog-lint` JSON 新增 `standardized` 汇总块（status/resultCode/checkStatuses/failureCodes/failures）。
- [x] `regression-matrix` JSON 新增 `standardized` 汇总块（status/resultCode/checkStatuses/failureCodes/failures）。
- [x] `release-rehearsal.json` 输出 `standardized` 汇总块与 `summaryFailureCodes`（便于直接接入告警/平台）。
- [x] `release-summary.json/release-rehearsal.json` 的 `summaryFailureCodes` 聚合失败步骤下游 `standardized.failureCodes`（不仅限步骤分类码与 health 失败码）。
- [x] `release-rehearsal.md` 新增 `Failure Signals` 失败明细段（直接展示 `standardized.failures`，便于人工排障）。
- [x] `release-rehearsal --summary-out` 新增 `--summary-format md|json`（支持产出可读 Markdown 摘要）。
- [x] `release-rehearsal --summary-format` 边界行为补齐测试（非法值拦截；archive 默认摘要路径按格式落盘）。
- [x] `release-summary.md` 增强观测段（`Failure Breakdown/Health Signals/Archive`），并补齐回归测试。
- [x] `release-rehearsal` 新增 `summary-out` 与 `summary-format` 冲突校验（后缀与格式不一致时快速失败）。
- [x] `release-rehearsal --archive` 在 Markdown 摘要模式下仍保留 `release-summary.json` 兼容输出（避免归档链路断裂）。
- [x] `release-archive` 收录 `release-summary.md`（存在时）到快照归档，补齐 Markdown 摘要归档链路。
- [x] `release-rehearsal --archive-verify` 默认 `--require-files` 扩展包含 `release-summary.json`（归档完整性覆盖摘要文件）。
- [x] `verify:release-rehearsal-archive-verify` npm 脚本改为复用 `release-rehearsal` 默认必需文件（避免脚本参数写死导致与默认值漂移）。
- [x] `release-archive-find` 新增 `--require-preset rehearsal-archive-verify` 内置必需文件集合（减少命令长参数与文档漂移）。
- [x] `release-rehearsal --archive-verify` 默认改为透传 `--require-preset rehearsal-archive-verify`（并支持 `--archive-require-preset`；与 `--archive-require-files` 互斥）。
- [x] `release-summary.json/.md` 新增归档校验 preset 透出（`archive.verify.requiredFilesPreset`），便于审计回放定位校验基线。
- [x] `release-archive-find` 新增 `--list-require-presets`（并提供 `verify:release-archive-find-presets` 脚本）用于查看内置 preset 及文件清单。
- [x] `release-archive-find --list-require-presets` 输出新增 `standardized` 汇总块（与其它 JSON 模式结构一致）。
- [x] `release-summary.md` 的 `Archive.verify` 段补充 `requiredFiles` 展示（人工审阅可直接看到完整性校验基线）。
- [x] `release-archive-find` 参数前置校验：`--snapshot-id/--require-files/--require-preset` 必须配套 `--version`（避免静默误用）。
- [x] `release-rehearsal` 参数前置校验：`--archive-verify` 必须配套 `--archive`；`--archive-require-files/--archive-require-preset` 必须配套 `--archive-verify`。
- [x] `release-rehearsal` 参数前置校验补齐：`--archive-snapshot-id/--snapshot-id/--archive-retention-days/--archive-max-snapshots-per-version` 必须配套 `--archive`。
- [x] `release-archive-find` 参数前置校验补齐：`--list-require-presets` 与 `--version/--snapshot-id/--require-files/--require-preset` 互斥（避免模式混用）。
- [x] `release-summary.json` 在 archive verify 非 JSON 输出场景下仍保留校验基线（`archive.verify.requiredFiles/requiredFilesPreset`）以便排障回放。
- [x] `release-archive-find` 支持 `--version current`（自动读取根目录 `package.json.version`），减少手工传版本。
- [x] `release-rehearsal` 支持 `--version current`（自动读取根目录 `package.json.version`），避免把字面量 `current` 传入下游脚本。

## 6. 当前执行任务（v1.5 M3）

- [x] `release-health/release-archive/release-verify` 统一支持 `--version current`（自动读取根目录 `package.json.version`，避免工具间 alias 能力不一致）。
- [x] `release-rehearsal` 新增预检模式（`--preflight`，仅参数/依赖/输出路径校验，不执行耗时检查）以加快本地演练前自检。
- [x] 发布资产命名规则收敛为单一可复用实现（新增 `scripts/release-asset-names.js`，workflow 与 `release-health` 共享命名推导，减少漂移风险）。
- [x] 增加一键“演练+归档+完整性校验”组合命令入口（`--bundle rehearsal-archive-verify` + `verify:release-rehearsal-bundle`），减少手工拼装长参数。

## 7. 当前执行任务（v1.5 M4）

- [x] `release-rehearsal` 支持 `--list-bundles`，输出内置组合入口清单（JSON/Markdown）。
- [x] 新增 `release-rehearsal --bundle` 与 `--list-bundles` 互斥与边界测试收敛（覆盖更多参数组合，含 Markdown/JSON 列表输出与多参数冲突校验）。
- [x] 发布 checklist/runbook 增加“优先使用 bundle 入口”的推荐路径与故障回退路径。

## 8. 当前执行任务（v1.5 M5）

- [x] 归档 require preset 改为共享源（新增 `scripts/release-require-presets.js`，`release-archive-find` 与 `release-rehearsal --list-bundles` 复用同一基线）。
- [x] `release-rehearsal --list-bundles` 增加 `standardized.metrics.bundleCount`，方便平台侧直接观测 bundle 数量。
- [ ] 新增 `--bundle` 显式执行摘要字段（例如 `bundleResolved`）到 `release-summary.json/.md`，降低排障时对参数回放依赖。

## 9. 启动时固定动作

1. 从 `main` 拉取最新代码并确认工作区干净。
2. 复核 `docs/RELEASE_CHECKLIST.md` 的 v1.4 实际执行记录。
3. 在本文件中选定一个课题作为当前里程碑（M5）的唯一入口任务。
