# rmemo 下一周期开发计划（可接力执行）

更新时间：2026-02-20  
适用分支：`main`（建议先与 `origin/main` 同步）  
基线版本：`@xiaofandegeng/rmemo@0.36.0`

## 1. 当前进度快照（事实基线）

### 1.1 已发布能力（截至 `v0.36.0`）

- 核心链路：`init/scan/context/print/log/status/check/sync/start/done/todo`
- 持续化链路：`setup/hook/watch/session/handoff/pr`
- 多工作区链路：`ws list/focus/batch/snapshots/report/trends/alerts/rca/action-plan`
- 执行治理链路：`alerts action board create/update/report/close + pulse + plan/apply + dedupe`
- 服务链路：`serve` 本地 API + SSE + UI + 写入控制
- MCP 链路：`mcp`（读工具 + `--allow-write` 写工具）
- 集成链路：`integrate`（含 antigravity 配置片段）+ `doctor`
- 语义检索链路：`embed build/search/jobs/governance`
- CI/Release：`release-please` + GitHub Release 自动化（npm 自动发布链路已改造，待完整实证）

### 1.2 当前需推进事项

- `v0.37.0`：治理策略模板化（policy）全链路闭环
- 发布流程：验证新 `release-please -> npm publish` 自动化链路可稳定工作
- 文档状态：持续对齐 `DEVELOPMENT_PLAN.md`（清理历史重复状态）

### 1.3 当前稳定性验证基线

- `node --test` 必须通过
- `npm run pack:dry` 必须通过
- 新增命令/API 必须同步中英文文档

---

## 2. 下一周期目标（建议 3 个版本）

> 目标：把“告警发现 -> 计划生成 -> 执行编排 -> 复盘治理”做成稳定、可持续、可交接闭环。

### 里程碑 A（目标 `v0.37.0`）：治理策略模板化闭环

范围：

- policy 配置持久化与读取优先级（CLI 参数 > config > preset）
- CLI/API/MCP/UI 四入口统一支持策略读写

任务清单：

- [ ] core：定义策略模型
  - `boardPulsePolicy`: `strict|balanced|relaxed|custom`
  - `boardPulseDedupePolicy`: `strict|balanced|relaxed|custom`
  - `custom` 支持：`todoHours/doingHours/blockedHours/dedupeWindowHours`
- [ ] CLI：
  - `rmemo ws alerts board policy show`
  - `rmemo ws alerts board policy set --preset <...>`
- [ ] API：
  - `GET /ws/focus/alerts/board-policy`
  - `POST /ws/focus/alerts/board-policy`
- [ ] MCP：
  - `rmemo_ws_focus_alerts_board_policy`
  - `rmemo_ws_focus_alerts_board_policy_set`
- [ ] UI：策略读取/保存面板
- [ ] 测试：core + handler + smoke + ui

验收标准：

- CLI/API/MCP/UI 策略读写结果一致
- 不传阈值参数时自动按默认策略生效
- 全量测试通过

---

### 里程碑 B（目标 `v0.38.0`）：执行编排与作业队列

范围：

- 把 action 执行从“单次 apply”升级为“可排队、可暂停、可恢复、可取消”

任务清单：

- [ ] core：action-job schema 与 runner
  - `queued/running/paused/succeeded/failed/canceled`
- [ ] core：支持 `priority/batchSize/retryPolicy`
- [ ] CLI：`action-job enqueue|list|show|pause|resume|cancel`
- [ ] API：action-jobs 端点
- [ ] MCP：action-jobs 工具
- [ ] UI：job 面板 + SSE 进度
- [ ] 稳定性测试：大批量、失败重试、中断恢复

验收标准：

- 大批量执行不阻塞主流程
- 可暂停/恢复/取消
- 可追踪每个 job 状态与结果

---

### 里程碑 C（目标 `v0.39.0`）：可观测与发布稳态

范围：

- 提升排障效率与发布可见性

任务清单：

- [ ] 统一错误码与事件 envelope（`traceId/errorClass/source`）
- [ ] 扩展 `rmemo doctor`（发布链路自检）
- [ ] 扩展 `rmemo diagnostics export`
- [ ] 发布后自动校验：GitHub Release 与 npm 版本一致性
- [ ] 发布失败 runbook 文档化

验收标准：

- 发布异常可在 10 分钟内定位根因
- 发布成功后 GitHub 与 npm 版本一致可见

---

## 3. 执行顺序（给后续模型直接照做）

### Sprint-1（当前）

1. 完成策略模板化（v0.37）
2. 完成四端接入与回归
3. 验证 npm 自动发布链路

### Sprint-2

1. 完成 action job 编排（v0.38）
2. 完成作业控制与恢复机制
3. 完成规模化测试

### Sprint-3

1. 完成可观测与发布稳态（v0.39）
2. 固化运维 runbook
3. 进入 0.40/1.0 稳定收敛

---

## 4. 每次开发前后固定动作（强约束）

### 开发前

- `git pull`
- `node --test`
- `git status --short`
- 阅读：
  - `docs/ITERATION_MASTER_PLAN.zh-CN.md`
  - `docs/NEXT_CYCLE_PLAN.md`
  - `CHANGELOG.md`

### 开发后（提交前）

- `node --test`
- `npm run pack:dry`
- 更新文档：
  - `README.md`
  - `README.zh-CN.md`
  - `CHANGELOG.md`

### 发布前

- 校验 `package.json` / tag 对齐
- 校验 workflow 与 secrets（`NPM_TOKEN`）
- 校验 release notes 和资产上传

---

## 5. 接力模板（给下一个模型）

```text
你在开发 rmemo。先读取 docs/ITERATION_MASTER_PLAN.zh-CN.md 和 docs/NEXT_CYCLE_PLAN.md。
先执行：
1) git status --short
2) node --test
3) 汇报当前版本、未提交改动、最近发布版本

然后只做当前里程碑（v0.37）中的一个任务点，不跨里程碑。
完成后：
1) 跑全量测试
2) 更新 README.md + README.zh-CN.md + CHANGELOG.md（若涉及）
3) 给出可直接 git commit 的提交说明
```

---

## 6. 本计划状态看板（执行时维护）

- [x] 里程碑 A 完成（目标 `v0.37.0`）
- [ ] 里程碑 B 完成（目标 `v0.38.0`）
- [ ] 里程碑 C 完成（目标 `v0.39.0`）
