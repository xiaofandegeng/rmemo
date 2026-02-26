# Tasks

当前主任务看板已经迁移到：

- `docs/NEXT_CYCLE_PLAN.md`（唯一执行计划 / 接力开发基线）
- `docs/V1_4_CYCLE_PLAN.zh-CN.md`（v1.4 周期详细计划）
- `docs/V1_5_PRE_RESEARCH.zh-CN.md`（v1.5 预研入口，仅在 v1.4 收尾后启用）
- `docs/RELEASE_CHECKLIST.md`（发布前后执行清单）
- `docs/RELEASE_NOTES_TEMPLATE.md`（Release 说明模板）

历史归档（仅供追溯，不作为当前执行入口）：

- `docs/LONG_TERM_ROADMAP.zh-CN.md`
- `docs/ITERATION_MASTER_PLAN.zh-CN.md`
- `docs/V1_0_CHAPTER.zh-CN.md`
- `docs/V1_1_CYCLE_PLAN.zh-CN.md`

## Snapshot (2026-02-26)

- Package: `@xiaofandegeng/rmemo`
- Current version: `1.13.0`（当前 `main` 分支 `package.json`）
- Next release target: `1.5.0`（预研入口已建立）
- Current focus:
  - v1.4 发布与核验已闭环（见 `docs/RELEASE_VERIFICATION_v1.4.0.md`）
  - 发布 runbook/checklist 已与 strict 资产命名 + timeout/retry 基线对齐
  - 已切换到 v1.5 预研入口：`docs/V1_5_PRE_RESEARCH.zh-CN.md`
  - v1.5 M1 已落地：`release-rehearsal --summary-out` 紧凑摘要输出
  - v1.5 M1 已落地：`release-health` 标准化结果字段（便于告警/平台接入）
  - v1.5 M1 已落地：`release-archive` 版本化归档与留存清理（含 `latest/catalog` 索引）
  - v1.5 M1 已落地：`release-archive-find` 归档检索命令（版本/快照查询）
  - v1.5 M2 已启动并落地首项：`release-rehearsal --archive` 一键归档（含归档参数透传）
  - v1.5 M2 已落地：`release-summary.json` 失败分层与恢复提示（快速定位 timeout/network/archive/config）
  - v1.5 M2 已落地：`release-archive-find --require-files` 快照完整性校验
  - v1.5 M2 已落地：`release-summary.json` 聚合 `release-health.standardized` failure codes（跨步骤统一失败码视图）
  - v1.5 M2 已落地：`release-rehearsal --archive-verify` 归档后完整性校验（输出 `release-archive-verify.json`）
  - v1.5 M2 已落地：`release-summary.json` 归档可观测字段（snapshot/verify 缺失项）统一输出
  - v1.5 M2 已落地：`release-summary.json.standardized` 统一状态块（便于告警/平台接入）
  - v1.5 M2 已落地：`release-archive-find.standardized` 统一状态块（便于告警/平台接入）
  - v1.5 M2 已落地：`release-archive.standardized` 统一状态块（便于告警/平台接入）
  - v1.5 M2 已落地：`release-summary.standardized.failures` 跨来源聚合（步骤失败 + health 失败）
  - v1.5 M2 已落地：`release-verify.standardized` 统一状态块（便于告警/平台接入）
  - v1.5 M2 已落地：`release-ready.standardized` 统一状态块（便于告警/平台接入）
  - v1.5 M2 已落地：`release-notes --format json` + `standardized` 统一状态块（便于告警/平台接入）
  - v1.5 M2 已落地：`changelog-lint.standardized` 统一状态块（便于告警/平台接入）
  - v1.5 M2 已落地：`regression-matrix.standardized` 统一状态块（便于告警/平台接入）
  - v1.5 M2 已落地：`release-rehearsal.json.standardized` + `summaryFailureCodes`（便于告警/平台接入）
  - v1.5 M2 已落地：`release-summary/rehearsal.summaryFailureCodes` 聚合失败步骤下游 `standardized.failureCodes`（细化跨步骤失败码视图）
  - v1.5 M2 已落地：`release-rehearsal.md` 新增 `Failure Signals` 失败明细段（人工排障可不依赖 JSON）
  - v1.5 M2 已落地：`release-rehearsal --summary-format md|json`（摘要同时支持机器消费与人工阅读）
  - v1.5 M2 已落地：`release-rehearsal --summary-format` 边界测试补齐（非法值校验 + archive 默认摘要路径按格式输出）
  - v1.5 M2 已落地：`release-summary.md` 高信号分段增强（Failure Breakdown/Health Signals/Archive）
  - v1.5 M2 已落地：`summary-out` 与 `summary-format` 冲突校验（后缀与格式不一致时快速失败）
  - v1.5 M2 已落地：`--archive + --summary-format md` 仍写出 `release-summary.json` 兼容文件（归档链路兼容）
  - v1.5 M2 已落地：`release-archive` 收录 `release-summary.md`（存在时）到快照归档
  - v1.5 M2 已落地：`release-rehearsal --archive-verify` 默认必需文件增加 `release-summary.json`
  - v1.5 M2 已落地：`verify:release-rehearsal-archive-verify` 复用默认必需文件集合（避免 npm 脚本参数漂移）
  - v1.5 M2 已落地：`release-archive-find --require-preset rehearsal-archive-verify` 内置必需文件集合（减少长参数与文档漂移）
  - v1.5 M2 已落地：`release-rehearsal --archive-verify` 默认透传 `--require-preset rehearsal-archive-verify`（支持 `--archive-require-preset`，且与 `--archive-require-files` 互斥）
  - v1.5 M2 已落地：`release-summary.json/.md` 输出 `archive.verify.requiredFilesPreset`（preset 校验链路可观测）
  - v1.5 M2 已落地：`release-archive-find --list-require-presets` + `verify:release-archive-find-presets`（内置 preset 清单可发现）
  - v1.5 M2 已落地：`release-archive-find --list-require-presets` 新增 `standardized` 汇总块（JSON 结构同构）
  - v1.5 M2 已落地：`release-summary.md` 的 `Archive.verify` 段补充 `requiredFiles`（人工审阅可直接看到校验基线）
  - v1.5 M2 已落地：`release-archive-find` 增加参数前置校验（`--snapshot-id/--require-files/--require-preset` 必须配套 `--version`）
  - v1.5 M2 已落地：`release-rehearsal` 增加参数前置校验（`--archive-verify` 需配套 `--archive`；`--archive-require-files/--archive-require-preset` 需配套 `--archive-verify`）
  - v1.5 M2 已落地：`release-rehearsal` 增加 archive 参数前置校验（`--archive-snapshot-id/--snapshot-id/--archive-retention-days/--archive-max-snapshots-per-version` 需配套 `--archive`）
  - v1.5 M2 已落地：`release-archive-find` 增加 list 模式互斥校验（`--list-require-presets` 与 `--version/--snapshot-id/--require-files/--require-preset` 互斥）
  - v1.5 M2 已落地：archive verify 非 JSON 失败时 `release-summary.json` 仍保留 `archive.verify.requiredFiles/requiredFilesPreset`（便于排障回放）
  - v1.5 M2 已落地：`release-archive-find --version current`（自动读取根目录 `package.json.version`）
  - v1.5 M2 已落地：`release-rehearsal --version current`（自动读取根目录 `package.json.version`，避免字面量透传）
  - v1.5 M3 已启动：进入“发布工具链一致性收敛”阶段
  - v1.5 M3 已落地首项：`release-health/release-archive/release-verify` 支持 `--version current`（跨脚本 alias 一致）
  - v1.5 M3 已落地：`release-rehearsal --preflight` 预检模式（仅参数/依赖/输出路径校验，不执行耗时步骤）
  - v1.5 M3 已落地：发布资产命名共享实现（`scripts/release-asset-names.js`，workflow 与 `release-health` 统一使用）
  - v1.5 M3 已落地：`release-rehearsal --bundle rehearsal-archive-verify` + `verify:release-rehearsal-bundle` 一键组合入口（演练+归档+完整性校验）

## Execution Rule

- 每次开发先读 `docs/NEXT_CYCLE_PLAN.md`
- 再读 `docs/V1_4_CYCLE_PLAN.zh-CN.md`
- 严格按里程碑顺序推进（M1 -> M2 -> M3）
- 不跨里程碑混做
- v1.4 已闭环，默认从 `docs/V1_5_PRE_RESEARCH.zh-CN.md` 开始下一阶段
