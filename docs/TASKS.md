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

## Snapshot (2026-02-25)

- Package: `@xiaofandegeng/rmemo`
- Current version: `1.4.0`（已完成双端可见性核验）
- Next release target: `1.5.0`（预研入口已建立）
- Current focus:
  - v1.4 发布与核验已闭环（见 `docs/RELEASE_VERIFICATION_v1.4.0.md`）
  - 发布 runbook/checklist 已与 strict 资产命名 + timeout/retry 基线对齐
  - 已切换到 v1.5 预研入口：`docs/V1_5_PRE_RESEARCH.zh-CN.md`
  - v1.5 M1 已落地：`release-rehearsal --summary-out` 紧凑摘要输出
  - v1.5 M1 已落地：`release-health` 标准化结果字段（便于告警/平台接入）
  - v1.5 M1 已落地：`release-archive` 版本化归档与留存清理（含 `latest/catalog` 索引）

## Execution Rule

- 每次开发先读 `docs/NEXT_CYCLE_PLAN.md`
- 再读 `docs/V1_4_CYCLE_PLAN.zh-CN.md`
- 严格按里程碑顺序推进（M1 -> M2 -> M3）
- 不跨里程碑混做
- v1.4 已闭环，默认从 `docs/V1_5_PRE_RESEARCH.zh-CN.md` 开始下一阶段
