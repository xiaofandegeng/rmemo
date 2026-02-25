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
- Current version: `1.4.0`（release PR 已合并）
- Next release target: `1.5.0`（预研入口已建立）
- Current focus:
  - v1.4 已进入发布后复核阶段（待双端可见性最终确认）
  - 发布 runbook/checklist 已与 strict 资产命名 + timeout/retry 基线对齐
  - v1.5 预研入口已建立，待 v1.4 发布闭环后切换执行

## Execution Rule

- 每次开发先读 `docs/NEXT_CYCLE_PLAN.md`
- 再读 `docs/V1_4_CYCLE_PLAN.zh-CN.md`
- 严格按里程碑顺序推进（M1 -> M2 -> M3）
- 不跨里程碑混做
- 仅当 v1.4 发布与双端校验完成后，再切换到 `docs/V1_5_PRE_RESEARCH.zh-CN.md`
