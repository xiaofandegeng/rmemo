# rmemo v1.6 周期计划

更新时间：2026-02-27  
适用分支：`main`  
当前基线：`@xiaofandegeng/rmemo@1.15.2`

## 1. 周期目标

- 目标 A：发布链路参数防漂移（workflow 关键命令可回归校验）。
- 目标 B：发布后真实安装链路冒烟（从 npm registry 拉取并执行）。
- 目标 C：文档入口收敛（降低接力与维护成本）。

## 2. 里程碑拆解

### M1 发布链路防漂移（已完成）

- [x] `release-please` workflow 中审计导出阶段 `release-ready` 显式携带 `--allow-dirty`。
- [x] 新增 workflow 回归测试，锁定关键命令参数约束。

### M2 发布后真实安装冒烟（已完成）

- [x] workflow 在发布成功后执行 `npx -y <pkg>@<version>`。
- [x] 冒烟命令覆盖：`--help`、`init`、`status --format json`。

### M3 文档入口治理（已完成）

- [x] 新增 `docs/INDEX.md` 作为统一导航入口。
- [x] README/README.zh-CN 精简为“快速上手 + 文档跳转”结构。
- [x] v1.5 文档状态收口并切换默认执行入口到 v1.6。

## 3. 下一步候选

- [ ] 增补 Windows runner 的发布后安装冒烟（PowerShell）。
- [ ] 增加 `verify:release-workflow` 本地预检脚本（与 workflow 测试互补）。
- [ ] 增加 release 资产校验清单（checksum）并纳入发布审计。

## 4. 开发前固定动作

1. `git pull --ff-only origin main`
2. `git status --short`
3. `node --test`
4. 阅读：
   - `docs/INDEX.md`
   - `docs/NEXT_CYCLE_PLAN.md`
   - `docs/TASKS.md`
