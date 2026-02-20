# rmemo 下一周期开发计划（可接力执行）

更新时间：2026-02-20  
适用分支：`main`  
基线版本：`@xiaofandegeng/rmemo@0.33.0`

## 1. 当前进度快照（事实基线）

### 1.1 已发布能力（截至 `v0.33.0`）

- 核心链路：`init/scan/context/print/log/status/check/sync/start/done/todo`
- 持续化链路：`setup/hook/watch/session/handoff/pr`
- 多工作区链路：`ws list/focus/batch/snapshots/report/trends/alerts/rca/action-plan`
- 执行治理链路：`alerts action board create/update/report/close + pulse`
- 服务链路：`serve` 本地 API + SSE + UI + 写入控制
- MCP 链路：`mcp`（读工具 + `--allow-write` 写工具）
- 集成链路：`integrate`（含 antigravity 配置片段）+ `doctor`
- 语义检索链路：`embed build/search/jobs/governance`
- CI/Release：测试工作流、release-please、发布链路、GitHub Release 自动化

### 1.2 当前未提交开发（本地工作区）

当前有 8 个文件已改动，属于“Action Board Pulse 自动计划/自动落库”增强：

- `src/core/workspaces.js`
- `src/cmd/ws.js`
- `src/core/serve.js`
- `src/core/mcp.js`
- `src/core/ui.js`
- `test/smoke.test.js`
- `test/serve_handler.test.js`
- `test/ui.test.js`

新增能力（已编码，待提交发布）：

- `rmemo ws alerts board pulse-plan`
- `rmemo ws alerts board pulse-apply`
- API: `GET /ws/focus/alerts/board-pulse-plan`
- API: `POST /ws/focus/alerts/board-pulse-apply`
- MCP: `rmemo_ws_focus_alerts_board_pulse_plan`
- MCP: `rmemo_ws_focus_alerts_board_pulse_apply`
- UI: Pulse Plan / Apply 按钮与事件流联动

### 1.3 当前稳定性验证

已通过：

- `node --test test/ui.test.js`
- `node --test test/serve_handler.test.js`
- `node --test test/smoke.test.js`
- `node --test`（全量 53 项，0 fail）

---

## 2. 下一周期目标（建议 3 个版本）

> 目标：把 “发现告警 -> 生成计划 -> 落地执行 -> 复盘改进” 做成稳定闭环，降低人工维护成本。

### 里程碑 A（建议 `v0.34.0`）：Pulse Plan/Apply 正式发布与文档补全

范围：

- 合并当前 8 文件改动并发布
- README / CHANGELOG / DEVELOPMENT_PLAN 状态同步
- 给出明确使用示例（CLI / API / MCP / UI）

任务清单：

- [ ] 提交当前功能改动（建议单一主题提交）
- [ ] 更新 `README.md` 的 `ws alerts board` 命令段，补 `pulse-plan/pulse-apply`
- [ ] 更新 `README.zh-CN.md` 对应章节
- [ ] 更新 `CHANGELOG.md`（Unreleased + release notes）
- [ ] 更新 `DEVELOPMENT_PLAN.md` 状态（避免旧章节重复误导）
- [ ] 发布 `v0.34.0` 并验证：
  - npm 版本可见
  - GitHub Release 有说明
  - release 产物可下载

验收标准：

- CLI/API/MCP/UI 四端都能触发 `pulse-plan` 与 `pulse-apply`
- `pulse-apply` 会写入 `todos.md`，可选写 `journal`
- 全量测试通过

---

### 里程碑 B（建议 `v0.35.0`）：计划执行的幂等与去重（防止重复写 todo）

背景：

- 现在 `pulse-apply` 可重复写入类似任务，长期运行会产生噪音。

范围：

- 对 `pulse-apply` 增加去重策略（基于 boardId/itemId/plan hash）
- 支持“仅预览新增项”和“忽略已存在项”

任务清单：

- [ ] 在 `.repo-memory` 持久化 apply 记录（如 `ws-focus/action-boards/pulse-applied.json`）
- [ ] 新增去重键策略（`boardId:itemId:kind`）
- [ ] CLI 参数：
  - `--dedupe`（默认开启）
  - `--dedupe-window-hours <n>`（默认 72）
  - `--dry-run`（只返回将新增的项）
- [ ] API 参数同步：
  - `POST /ws/focus/alerts/board-pulse-apply` 增加 dedupe 参数
- [ ] MCP 工具输入 schema 同步
- [ ] UI 增加 `dedupe/dry-run` 控件
- [ ] 测试：
  - 重复 apply 不重复写入
  - 窗口外可再次生成
  - dry-run 不落盘

验收标准：

- 同一批 overdue item 连续 apply 不会重复污染 todo
- JSON 响应明确返回：
  - `proposedCount`
  - `appendedCount`
  - `skippedDuplicateCount`

---

### 里程碑 C（建议 `v0.36.0`）：治理策略模板化（不同团队可配置）

背景：

- 目前阈值参数依赖命令输入，缺少团队级默认策略。

范围：

- 策略模板持久化与切换：`strict/balanced/relaxed/custom`
- 支持 repo 级默认策略与命令行覆盖

任务清单：

- [ ] 在 `.repo-memory/config.json` 增加：
  - `wsAlerts.boardPulsePolicy`
  - `wsAlerts.boardPulseDedupePolicy`
- [ ] CLI 新增：
  - `rmemo ws alerts board policy show`
  - `rmemo ws alerts board policy set --preset strict|balanced|relaxed`
- [ ] API 新增：
  - `GET /ws/focus/alerts/board-policy`
  - `POST /ws/focus/alerts/board-policy`
- [ ] MCP 新增：
  - `rmemo_ws_focus_alerts_board_policy`
  - `rmemo_ws_focus_alerts_board_policy_set`
- [ ] UI 新增 policy panel（读取/保存）
- [ ] 文档新增“推荐策略场景”：
  - 单人项目
  - 多人并行项目
  - 高风险线上项目

验收标准：

- 不传阈值参数时自动使用 repo 默认策略
- 策略切换后，CLI/API/MCP/UI 结果一致

---

## 3. 执行顺序（给后续模型直接照做）

### Sprint-1（先完成）

1. 合并当前未提交改动并确保测试绿
2. 文档补全 + 发布 `v0.34.0`
3. 回写本计划实际状态（打勾）

### Sprint-2

1. 设计并实现 dedupe 数据结构
2. 完成 CLI/API/MCP/UI 全链路接入
3. 发布 `v0.35.0`

### Sprint-3

1. 设计策略模板配置结构
2. 完成 policy show/set + 四端接入
3. 发布 `v0.36.0`

---

## 4. 每次开发前后固定动作（强约束）

### 开发前

- `git pull`
- `node --test`
- `git status --short`（确认基线）
- 读取本文件 + `DEVELOPMENT_PLAN.md` + `CHANGELOG.md`

### 开发后（提交前）

- `node --test`
- `npm run pack:dry`
- 更新 `README.md`（若新增命令/API）
- 更新 `README.zh-CN.md`（保持中文同步）
- 更新 `CHANGELOG.md`

### 发布前

- 确认 `package.json` 版本
- 确认 tag 与 version 一致
- 确认 GitHub Actions 权限与 npm 发布身份

---

## 5. 风险与规避

- 风险 1：文档状态滞后于代码  
  规避：功能 PR 必须同时更新 README/CHANGELOG/DEVELOPMENT_PLAN。

- 风险 2：apply 重复写 todo  
  规避：v0.35 引入 dedupe + dry-run。

- 风险 3：CLI/API/MCP/UI 参数不一致  
  规避：统一从 core 层输入 schema 派生，测试覆盖四端。

- 风险 4：release 成功但 npm 未同步  
  规避：发布后检查 npm package 页面版本与发布时间。

---

## 6. 接力模板（给下一个模型）

可直接复制以下提示词给下一个模型：

```text
你在开发 rmemo，先读取 docs/NEXT_CYCLE_PLAN.md，并严格按“里程碑 A -> B -> C”推进。
先执行：
1) git status --short
2) node --test
3) 汇报当前版本、未提交改动、最近一次发布版本

然后只做一个里程碑内的任务，完成后：
1) 跑全量测试
2) 更新 README.md + README.zh-CN.md + CHANGELOG.md（若涉及）
3) 给出可直接 git commit 的提交说明
不要跨里程碑混做。
```

---

## 7. 本计划状态看板（执行时维护）

- [ ] 里程碑 A 完成（目标 `v0.34.0`）
- [ ] 里程碑 B 完成（目标 `v0.35.0`）
- [ ] 里程碑 C 完成（目标 `v0.36.0`）

