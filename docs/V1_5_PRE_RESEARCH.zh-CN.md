# rmemo v1.5 预研入口（草案）

更新时间：2026-02-25  
状态：v1.5 M1 已完成，M2 持续收敛中

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

## 6. 启动时固定动作

1. 从 `main` 拉取最新代码并确认工作区干净。
2. 复核 `docs/RELEASE_CHECKLIST.md` 的 v1.4 实际执行记录。
3. 在本文件中选定一个课题作为当前里程碑（M1/M2）的唯一入口任务。
