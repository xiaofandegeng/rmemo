# rmemo 长期开发路线图（多模型可接力）

更新时间：2026-02-20  
适用仓库：`@xiaofandegeng/rmemo`  
当前基线：`0.36.x`

## 1. 文档定位

本文件是 `rmemo` 的长期主路线图，目标是：

- 把接下来多个版本拆成“可执行、可验收、可交接”的计划。
- 让任何大模型在上下文不完整时，也能按统一节奏推进。
- 避免“重复开发”“跨迭代混做”“文档与代码脱节”。

配套文档：

- 短周期执行：`docs/NEXT_CYCLE_PLAN.md`
- 任务看板入口：`docs/TASKS.md`
- 历史与发布：`CHANGELOG.md`

---

## 2. 当前能力地图（截至 0.33.x）

### 2.1 已稳定模块

- 基础记忆链路：`init / scan / context / print / log / status`
- 规则治理链路：`check / hook / setup / sync`
- 日常协作链路：`done / todo / handoff / pr / watch / session`
- 服务化链路：`serve + /ui + /events + watch controls`
- MCP 链路：`mcp`（读工具 + `--allow-write` 写工具）
- 语义记忆链路：`embed build/search/jobs/governance`
- 工作区治理链路：`ws focus + snapshots + reports + trends + alerts + rca + action plan + board + pulse`

### 2.2 当前短板（下一阶段重点）

- 治理阈值仍偏“命令行参数驱动”，策略模板化尚未完成全入口闭环
- action 执行还缺作业化编排（暂停/恢复/取消/重试）
- `DEVELOPMENT_PLAN.md` 仍有历史状态重复，容易误导后续模型
- 发布链路虽然已改造，但仍需完整实证并沉淀稳定 runbook

---

## 3. 长期产品目标（6-12 个月）

### 目标 A：记忆闭环

让“发现问题 -> 生成行动 -> 自动落地 -> 复盘沉淀”成为默认流程，减少手工操作。

### 目标 B：多入口一致性

CLI / HTTP API / MCP / UI 四个入口保持同一语义和同一参数模型。

### 目标 C：可持续运维

发布链路、版本说明、回滚策略、诊断能力做到稳定可用，降低维护成本。

### 目标 D：模型无关交接

任意模型都能按文档规则直接接手并继续开发，不依赖“上一轮对话记忆”。

---

## 4. 版本路线（建议）

> 规则：每个版本只做一个主题，不跨主题混做。每个版本必须满足“代码 + 测试 + 文档 + 发布说明”四件套。

## v0.34.0（Release 主题：Pulse 基础能力）

### 目标

发布 board pulse 的 SLA 检测与 incident history 基础能力。

### 范围

- CLI: `rmemo ws alerts board pulse|pulse-history`
- API: `/ws/focus/alerts/board-pulse`、`/board-pulse-history`
- MCP: `rmemo_ws_focus_alerts_board_pulse|history`
- UI: pulse/pulse-history 操作入口 + SSE 更新

### 任务拆解

1. 构建 overdue 检测与阈值策略输入
2. 增加历史落盘与 incident id
3. 完成 CLI/API/MCP/UI 同步接入
4. 发布并验证 release notes

### 验收标准

- `pulse` 与 `pulse-history` 命令/接口可用
- 可持久化 incident 历史
- 全量测试通过

---

## v0.35.0（Release 主题：Pulse Plan/Apply）

### 目标

发布 `pulse-plan` 与 `pulse-apply` 的执行闭环能力。

### 范围

- plan 生成：`next/blocker` 推荐任务
- apply 落库：写入 `todos.md` 与可选 journal
- 四入口统一执行（CLI/API/MCP/UI）

### 任务拆解

1. core 层新增 plan/apply 引擎
2. CLI 命令新增 `pulse-plan/pulse-apply`
3. API/MCP/UI 新增对应入口
4. 增加 handler/smoke/ui 回归覆盖

### 验收标准

- plan 结果可复用（json/md）
- apply 执行可追踪（journal + summary）
- 四入口一致可用

---

## v0.36.0（Release 主题：幂等去重）

### 目标

解决 `pulse-apply` 重复写入，支持 dedupe + window + dry-run。

### 范围

- 去重存储：`.repo-memory/ws-focus/action-boards/pulse-applied.json`
- 去重键：`boardId:itemId:kind`
- 支持窗口：`dedupeWindowHours`
- 支持 `dry-run`

### 任务拆解

1. core 层新增 dedupe 逻辑与数据结构
2. CLI 参数：`--dedupe --dedupe-window-hours --dry-run`
3. API/MCP 参数对齐
4. UI 增加 dedupe/dry-run 控件
5. 增加单测与 smoke 覆盖

### 验收标准

- 连续 apply 同一批计划不重复写入
- 输出包含 `proposed/appended/skipped` 统计
- dry-run 不落盘

---

## v0.37.0（Release 主题：执行编排与批量行动）

### 目标

让 action plan 可以分批、限流、优先级执行。

### 范围

- action apply 支持 batch size / priority
- 执行进度事件化（SSE）
- 可中断/恢复执行

### 任务拆解

1. core 编排器（队列 + 优先级）
2. API：`/actions/apply-batch`、`/actions/jobs`
3. MCP：批量执行工具
4. UI：执行面板（开始/暂停/恢复/取消）

### 验收标准

- 大批量计划可稳定执行，不阻塞主流程
- 中断后可恢复

---

## v0.38.0（Release 主题：可观测性增强）

### 目标

补齐操作审计与错误定位，提升可维护性。

### 范围

- 统一操作日志（op-log）
- 关键动作 trace id
- 失败原因分层（config/runtime/network/permission）

### 任务拆解

1. core 加 trace id
2. API/MCP/UI 返回统一错误码结构
3. `doctor` 扩展：版本一致性检查、配置冲突检测
4. 新增导出命令：`rmemo diagnostics export`

### 验收标准

- 任何失败都能定位到入口 + 具体阶段 + 错误类别
- 一次诊断导出足够复现问题

---

## v0.39.0（Release 主题：发布与资产自动化）

### 目标

将“发版、release notes、assets、npm 同步”做成低人工成本流程。

### 范围

- release notes 自动分组（Features/Fixes/Breaking）
- tag 发布自动上传 `.tgz` 资产
- npm 发布成功后自动回写校验

### 任务拆解

1. 调整发布 workflow（按 tag 自动化）
2. release body 统一模板化
3. 加发布后校验步骤（GitHub Release + npm version）
4. 失败重试和降级策略

### 验收标准

- 发布无需手动点多个 workflow
- release 页面有完整说明与资产

---

## v0.40.0（Release 主题：LTS 稳定版收敛）

### 目标

形成首个“长期稳定”基线，为后续 1.x 做准备。

### 范围

- 清理历史重复计划文档
- API 稳定性评审（不兼容变更登记）
- 文档统一入口（中英同步）

### 任务拆解

1. 重构 `DEVELOPMENT_PLAN.md`（只保留真实状态）
2. 稳定性测试矩阵（CLI/API/MCP/UI）
3. 发布迁移指南（0.3x -> 0.40）

### 验收标准

- 新人/新模型按文档可独立完成一次发布
- 关键链路无阻断性回归

---

## v1.0.0（Release 主题：平台化）

### 目标

把 rmemo 从“工具集合”收敛为“记忆治理平台”。

### 范围

- 稳定 API 契约
- 稳定 MCP 工具集（命名与 schema 冻结）
- 稳定工作区治理流程（alerts -> actions -> boards -> pulse -> apply）

### 任务拆解

1. 完成 API/MCP 契约清单与向后兼容策略
2. 发布 `v1.0` 使用手册（管理员视角 + 开发者视角）
3. 发布升级指南与常见故障手册

### 验收标准

- 合作团队可按 1.0 契约长期集成
- 无需频繁改 client 配置

---

## 5. 每个版本固定执行模板（必须遵守）

### 5.1 开发启动清单

1. `git pull`
2. `git status --short`
3. `node --test`
4. 阅读：
   - `docs/LONG_TERM_ROADMAP.zh-CN.md`
   - `docs/NEXT_CYCLE_PLAN.md`
   - `CHANGELOG.md`

### 5.2 开发完成清单

1. `node --test`
2. `npm run pack:dry`
3. 文档同步：
   - `README.md`
   - `README.zh-CN.md`
   - `CHANGELOG.md`
4. 输出提交信息建议（遵循 conventional commits）

### 5.3 发布完成清单

1. GitHub Actions 通过
2. GitHub Release 有说明与资产
3. npm 新版本可见
4. 回写计划状态（打勾）

---

## 6. 多模型接力协议（核心）

### 6.1 输入协议（新模型进场时必须先做）

必须先执行并汇报：

1. 当前版本（`package.json`）
2. 当前分支与 HEAD
3. 未提交文件列表
4. 最近 3 次发布版本
5. 当前进行中的里程碑

### 6.2 执行协议

- 一次只做一个版本主题
- 不跨里程碑改动
- 代码改动必须带测试
- 新增命令/API 必须同步中英文文档

### 6.3 交接协议

交接输出必须包含：

1. 已完成项（精确到文件）
2. 未完成项（下一步第一条命令）
3. 风险项与阻塞项
4. 回滚方法
5. 建议 commit message

---

## 7. 风险清单与治理

- 风险：文档与代码不一致  
  治理：版本发布前强制文档检查清单。

- 风险：多入口参数漂移  
  治理：统一 core schema，四端共享校验。

- 风险：任务重复写入导致噪音  
  治理：去重 + 干运行 + 去重窗口。

- 风险：发布失败排查成本高  
  治理：发布后自动校验 + 诊断导出。

---

## 8. 路线图状态看板（维护区）

- [x] v0.34.0 发布完成
- [x] v0.35.0 发布完成
- [x] v0.36.0 发布完成
- [ ] v0.37.0 发布完成
- [ ] v0.38.0 发布完成
- [ ] v0.39.0 发布完成
- [ ] v0.40.0 发布完成
- [ ] v1.0.0 发布完成
