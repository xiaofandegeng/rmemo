# Tasks

当前主任务看板已经迁移到：

- `docs/NEXT_CYCLE_PLAN.md`（唯一执行计划 / 接力开发基线）
- `docs/V1_1_CYCLE_PLAN.zh-CN.md`（v1.1 周期详细计划）
- `docs/RELEASE_CHECKLIST.md`（发布前后执行清单）
- `docs/RELEASE_NOTES_TEMPLATE.md`（Release 说明模板）

历史归档（仅供追溯，不作为当前执行入口）：

- `docs/LONG_TERM_ROADMAP.zh-CN.md`
- `docs/ITERATION_MASTER_PLAN.zh-CN.md`
- `docs/V1_0_CHAPTER.zh-CN.md`

## Snapshot (2026-02-25)

- Package: `@xiaofandegeng/rmemo`
- Current version: `1.3.0`
- Next release target: `1.4.0`（待下一轮计划确认）
- Current focus:
  - v1.1 发布收敛已完成（当前版本已到 `v1.3.0`）
  - v1.3 稳定性收尾：release 资产命名一致性 + 健康校验强化
  - 契约门禁强化：`contract check --fail-on any`（CI / release workflow / release-ready）

## Execution Rule

- 每次开发先读 `docs/NEXT_CYCLE_PLAN.md`
- 再读 `docs/V1_1_CYCLE_PLAN.zh-CN.md`
- 严格按里程碑顺序推进（M1 -> M2 -> M3）
- 不跨里程碑混做
