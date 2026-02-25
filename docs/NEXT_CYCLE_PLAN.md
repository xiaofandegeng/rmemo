# rmemo 下一周期开发计划（v1.4）

更新时间：2026-02-25  
适用分支：`main`  
当前基线：`@xiaofandegeng/rmemo@1.3.0`

## 1. 当前进度快照（事实）

- 发布状态：`v1.3.0` 已发布。
- 质量基线：`node --test` 与 `npm run pack:dry` 作为发布门禁。
- 已落地的发布稳定性能力：
  - release-please 失败自动重试（瞬时 GitHub 故障兜底）
  - `release-ready` 步骤级超时控制（避免门禁卡死）
  - `release-health` 网络超时控制与资产一致性校验
  - GitHub Release 资产改为无 scope 命名（`rmemo-<version>.tgz`）

## 2. 下一周期目标（v1.4）

目标：把发布链路从“可用”提升到“可预期、可观测、可审计”，并完成 v1.4 正式发布闭环。

### 里程碑 A（`v1.4.0-alpha`）：资产一致性收敛（已完成）

- [x] Release 资产上传命名统一为 `rmemo-<version>.tgz`。
- [x] `release-health` 增加期望资产校验（默认兼容 legacy）。
- [x] workflow 进入 strict 模式（`--allow-legacy-scoped-asset false`）。
- [x] 补齐 strict/legacy 资产行为测试。

验收标准：

- [x] 新发布版本的 GitHub Release 资产名不再带 scope 前缀。
- [x] 仅存在 legacy 资产名时，健康检查会明确失败。

### 里程碑 B（`v1.4.0-beta`）：发布鲁棒性增强（已完成）

- [x] `release-ready` 增加 `--step-timeout-ms`。
- [x] `release-health` / `release-rehearsal` 增加网络超时控制与测试。
- [x] workflow 对 `release-ready` / `release-health` 显式传递 timeout 参数（避免默认值漂移）。
- [x] `release-health` 增加 GitHub API 重试策略（429 / 5xx）。

验收标准：

- [x] 网络抖动时发布检查不长时间挂起，并在日志中给出可定位错误。
- [x] 健康检查对限流或平台瞬时失败有可复现、可回放的处理路径。

### 里程碑 C（`v1.4.0`）：发布与文档闭环（待开始）

- [ ] 发布 `v1.4.0`，完成 npm 与 GitHub Release 双端可见性验证。
- [x] 更新 runbook（异常排障路径、严格模式说明、资产命名约束）。
- [x] 校准 `docs/TASKS.md` 与下一周期入口（切换到 v1.5 预研）。

验收标准：

- [ ] 发布后 30 分钟内可完成端到端核验并留存审计文件。
- [ ] 新接力模型仅阅读当前文档即可独立完成一次发布演练。

## 3. 执行顺序（固定节奏）

Week 1：

1. 完成里程碑 B 的 workflow timeout 显式化。
2. 完成 `release-health` 的重试策略与测试。

Week 2：

1. 进行预发布演练并固化异常排障 runbook。
2. 收敛发布相关文档与检查清单。

Week 3：

1. 发布 `v1.4.0` 并完成双端核验。
2. 校准下一周期入口（`v1.5`）。

## 4. 每次开发前后固定动作（强约束）

开发前：

- `git pull --ff-only`
- `git status --short`
- `node --test`
- 阅读：
  - `docs/V1_4_CYCLE_PLAN.zh-CN.md`
  - `docs/NEXT_CYCLE_PLAN.md`
  - `CHANGELOG.md`

开发后（提交前）：

- `node --test`
- `npm run pack:dry`
- 更新文档（若涉及能力变更）：
  - `README.md`
  - `README.zh-CN.md`
  - `CHANGELOG.md`

## 5. 接力模板（给任意后续模型）

```text
你在开发 rmemo v1.4 周期。
先执行：
1) git status --short
2) node --test
3) npm run pack:dry

然后读取：
- docs/V1_4_CYCLE_PLAN.zh-CN.md
- docs/NEXT_CYCLE_PLAN.md
- docs/TASKS.md

只处理一个里程碑中的一个任务点，不跨里程碑。
完成后输出：
1) 改动文件
2) 验收结果
3) 剩余任务
4) 下一步第一条命令
```

## 6. 计划状态看板

- [x] 里程碑 A 完成（资产一致性收敛）
- [x] 里程碑 B 完成（发布鲁棒性增强）
- [ ] 里程碑 C 完成（发布与文档闭环）
