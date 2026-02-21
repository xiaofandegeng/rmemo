# rmemo 主执行计划（0.37 -> 1.0）

更新时间：2026-02-20  
适用分支：`main`（按 `origin/main` 对齐）  
当前发布基线：`v0.36.0`（代码版本 `0.36.0`）

## 1. 目标与约束

## 1.1 目标

- 在 `0.37 ~ 0.40` 完成“治理策略化 + 执行编排 + 可观测 + 发布自动化”。
- 在 `1.0.0` 冻结稳定契约（CLI/API/MCP/UI 统一语义）。
- 保证换模型后可无缝接力，不依赖会话上下文。

## 1.2 强约束

- 一次版本只做一个主题，不跨版本混做。
- 每个版本必须包含：`代码 + 测试 + 文档 + 发布验证`。
- 新增参数/接口必须四端一致：CLI/API/MCP/UI。
- 未通过 `node --test` 不允许进入发布流程。

---

## 2. 当前状态（事实）

- 已发布：
  - `v0.34.0`：board pulse SLA + incident history
  - `v0.35.0`：pulse plan/apply
  - `v0.36.0`：idempotent apply + dedupe window
- 正在演进：
  - board policy（strict/balanced/relaxed/custom）仍未完成“全入口闭环”
  - npm 自动发布链路刚切换到 release-please 同 workflow，需要一次完整验证

---

## 3. 版本与迭代计划

> 每个版本拆成 3 个迭代：I1 设计与核心实现、I2 全入口打通、I3 稳定性与发布。

## v0.37.0（策略模板化闭环）

### 版本目标

完成 board pulse policy 的全链路落地，让阈值和 dedupe 策略支持 repo 默认配置。

### I1：核心策略模型

- [ ] 定义统一策略结构：
  - `boardPulsePolicy`: `strict|balanced|relaxed|custom`
  - `boardPulseDedupePolicy`: 同上
  - `custom` 的字段：`todoHours/doingHours/blockedHours/dedupeWindowHours`
- [ ] core 层新增：
  - policy 读取优先级：CLI 参数 > config > preset 默认
  - policy 回填到响应体（便于可观测）
- [ ] 配置读写：
  - `.repo-memory/config.json` 中 `wsAlerts` 节点统一管理

验收：
- [ ] 无参数运行也能稳定得到策略值
- [ ] JSON 输出可见“最终生效策略”

### I2：四入口打通

- [ ] CLI：
  - `rmemo ws alerts board policy show`
  - `rmemo ws alerts board policy set --preset <...>`
  - 支持 `--todo-hours/--doing-hours/--blocked-hours/--dedupe-window-hours` 自定义覆盖
- [ ] HTTP：
  - `GET /ws/focus/alerts/board-policy`
  - `POST /ws/focus/alerts/board-policy`
- [ ] MCP：
  - `rmemo_ws_focus_alerts_board_policy`
  - `rmemo_ws_focus_alerts_board_policy_set`
- [ ] UI：
  - policy 配置面板（load/save）
  - policy 与 pulse-plan/pulse-apply 联动显示

验收：
- [ ] 同一策略在 CLI/API/MCP/UI 结果一致
- [ ] policy 修改后立即生效

### I3：测试、文档、发布

- [ ] 测试：
  - core 单测（policy resolve）
  - handler 测试（GET/POST policy）
  - smoke 覆盖 policy show/set + pulse plan/apply
- [ ] 文档：
  - `README.md` / `README.zh-CN.md`
  - `DEVELOPMENT_PLAN.md`
  - `CHANGELOG.md`
- [ ] 发布验证：
  - GitHub release notes 正确
  - npm 版本同步可见

发布门禁：
- [ ] `node --test` 全绿
- [ ] `npm run pack:dry` 通过
- [ ] 文档示例命令可实跑

---

## v0.38.0（执行编排与动作队列）

### 版本目标

把 action 执行从“单次 apply”升级为“可排队、可暂停、可恢复”的作业系统。

### I1：作业模型与调度器

- [ ] 定义 job schema：`queued/running/paused/succeeded/failed/canceled`
- [ ] 支持：
  - `priority`
  - `batchSize`
  - `retryPolicy`
  - `resumeToken`
- [ ] 持久化：
  - `.repo-memory/ws-focus/actions-jobs/*.json`
  - job 索引和历史

### I2：接口与可观测

- [ ] CLI：
  - `rmemo ws alerts action-job enqueue|list|show|pause|resume|cancel`
- [ ] API：
  - `POST /ws/focus/alerts/action-jobs`
  - `GET /ws/focus/alerts/action-jobs`
  - `POST /ws/focus/alerts/action-jobs/:id/pause|resume|cancel`
- [ ] MCP：
  - action-jobs 读写工具
- [ ] UI：
  - job 列表 + 控制按钮
  - 实时进度（SSE）

### I3：稳定性与发布

- [ ] 大任务压力测试（>200 task）
- [ ] 中断恢复测试（进程重启后恢复）
- [ ] 文档 + 发布

---

## v0.39.0（可观测与诊断升级）

### 版本目标

建立完整的操作审计和问题定位能力，减少线上排查时间。

### I1：统一观测模型

- [ ] 统一事件 envelope：
  - `traceId`
  - `source`
  - `category`
  - `errorClass`
  - `costMs`
- [ ] 统一错误码：
  - `RMEMO_CONFIG_*`
  - `RMEMO_RUNTIME_*`
  - `RMEMO_PERMISSION_*`

### I2：诊断能力

- [ ] 扩展 `rmemo doctor`：
  - 发布配置检查
  - npm 身份与 token 可用性检查
  - release-please 触发链路检查
- [ ] 新增：
  - `rmemo diagnostics export --format md|json`

### I3：发布

- [ ] 新增观测文档章节（SRE/维护指南）
- [ ] 发布并验证 observability 回归

---

## v0.40.0（发布自动化稳态）

### 版本目标

实现“代码合并 -> release-please -> npm 发布 -> 资产上传”的稳定流水线。

### I1：发布流水线收敛

- [ ] 保留一条主发布链路（避免重复 workflow）
- [ ] release notes 模板标准化
- [ ] 发布后自动校验（GitHub release + npm version）

### I2：失败治理

- [ ] 增加重试策略与幂等保护
- [ ] 发布失败自动输出诊断包

### I3：LTS 准备

- [ ] 清理过时 workflow
- [ ] 固化发布 runbook
- [ ] 完成 `0.40` 稳定发布

---

## v1.0.0（稳定契约）

### 版本目标

冻结 1.0 契约，让外部工具可长期依赖。

### I1：契约冻结

- [ ] CLI 命令与参数稳定性声明
- [ ] HTTP API 稳定性声明（breaking 规则）
- [ ] MCP tool schema 冻结

### I2：迁移与兼容

- [ ] `0.3x -> 1.0` 迁移指南
- [ ] 兼容层与弃用说明

### I3：1.0 发布

- [ ] 完整回归矩阵
- [ ] 文档与示例仓库验证
- [ ] 正式发布 `v1.0.0`

---

## 4. 每个版本固定执行模板（给所有模型）

## 4.1 开发前

1. `git pull`
2. `git status --short`
3. `node --test`
4. 阅读：
   - `docs/ITERATION_MASTER_PLAN.zh-CN.md`
   - `docs/NEXT_CYCLE_PLAN.md`
   - `CHANGELOG.md`

## 4.2 开发后

1. `node --test`
2. `npm run pack:dry`
3. 更新文档：
   - `README.md`
   - `README.zh-CN.md`
   - `CHANGELOG.md`

## 4.3 交接输出（必须）

1. 已完成内容（文件级别）
2. 未完成内容（下一步第一条命令）
3. 风险与阻塞
4. 回滚方案
5. 推荐 commit message

---

## 5. 当前执行看板

- [x] v0.34.0
- [x] v0.35.0
- [x] v0.36.0（功能已发布，待 npm 自动发布链路实证）
- [x] v0.37.0
- [x] v0.38.0
- [x] v0.39.0
- [x] v0.40.0
- [ ] v1.0.0

