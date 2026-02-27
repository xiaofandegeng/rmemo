# Tasks

当前执行入口请以以下顺序为准：

1. `docs/INDEX.md`（文档导航入口）
2. `docs/NEXT_CYCLE_PLAN.md`（当前周期执行基线）
3. `docs/V1_6_CYCLE_PLAN.zh-CN.md`（v1.6 里程碑细化）
4. `docs/RELEASE_CHECKLIST.md`（发布前后检查）

历史计划归档（仅追溯，不作为当前入口）：

- `docs/V1_5_PRE_RESEARCH.zh-CN.md`
- `docs/V1_4_CYCLE_PLAN.zh-CN.md`
- `docs/V1_1_CYCLE_PLAN.zh-CN.md`
- `docs/V1_0_CHAPTER.zh-CN.md`
- `docs/ITERATION_MASTER_PLAN.zh-CN.md`
- `docs/LONG_TERM_ROADMAP.zh-CN.md`

## Snapshot (2026-02-27)

- Package: `@xiaofandegeng/rmemo`
- Latest published: `1.15.2`
- Main branch status: `origin/main` 同步、工作区干净
- Current cycle: `v1.6`

## v1.6 Progress

- [x] 发布审计导出命令防漂移（`release-ready --allow-dirty` 固化）。
- [x] 新增 release workflow 回归测试（关键命令参数约束）。
- [x] 发布后真实安装冒烟（`npx -y <pkg>@<version>`）。
- [x] README / README.zh-CN 精简，文档入口统一到索引页。
- [x] v1.5 文档收口，执行入口切换到 v1.6。

## Next Candidates

- [ ] Windows runner 的安装冒烟覆盖。
- [ ] `verify:release-workflow` 本地预检脚本。
- [ ] 发布资产 checksum 审计。
