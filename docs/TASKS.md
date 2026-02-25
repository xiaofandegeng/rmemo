# Tasks

当前主任务看板已经迁移到：

- `docs/NEXT_CYCLE_PLAN.md`（唯一执行计划 / 接力开发基线）
- `docs/V1_4_CYCLE_PLAN.zh-CN.md`（v1.4 周期详细计划）
- `docs/RELEASE_CHECKLIST.md`（发布前后执行清单）
- `docs/RELEASE_NOTES_TEMPLATE.md`（Release 说明模板）

历史归档（仅供追溯，不作为当前执行入口）：

- `docs/LONG_TERM_ROADMAP.zh-CN.md`
- `docs/ITERATION_MASTER_PLAN.zh-CN.md`
- `docs/V1_0_CHAPTER.zh-CN.md`
- `docs/V1_1_CYCLE_PLAN.zh-CN.md`

## Snapshot (2026-02-25)

- Package: `@xiaofandegeng/rmemo`
- Current version: `1.3.0`
- Next release target: `1.4.0`（待下一轮计划确认）
- Current focus:
  - v1.4 计划已切换（入口与里程碑已建立）
  - v1.4 稳定性迭代：workflow timeout 显式化 + release-health 重试策略
  - 契约门禁强化：`contract check --fail-on any`（CI / release workflow / release-ready）

## Execution Rule

- 每次开发先读 `docs/NEXT_CYCLE_PLAN.md`
- 再读 `docs/V1_4_CYCLE_PLAN.zh-CN.md`
- 严格按里程碑顺序推进（M1 -> M2 -> M3）
- 不跨里程碑混做
