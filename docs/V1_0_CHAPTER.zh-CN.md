# rmemo v1.0 新篇章（验证报告 + 执行计划）

更新时间：2026-02-21  
验证基线：`main@c48b8bd`（`@xiaofandegeng/rmemo@0.37.2`）

## 1. 验证结论

本次对“当前待办是否完成、功能是否可用”进行了代码级与测试级核验。

结论：

- `v0.37 ~ v0.39` 计划项在代码层基本已完成并可用。
- 回归测试通过：`node --test` 全绿（58 pass / 0 fail / 1 skip）。
- 打包校验通过：`npm run pack:dry`。
- 发布链路具备“发布后校验 + 失败诊断导出”。

因此，项目进入 **v1.0 新篇章** 的条件已满足。

---

## 2. 本次核验范围与证据

### 2.1 测试与打包

- 执行：`node --test`
- 执行：`npm run pack:dry`
- 结果：均通过。

### 2.2 v0.37（策略模板化）

已验证能力：

- CLI：`rmemo ws alerts board policy show|set`
- HTTP：`GET/POST /ws/focus/alerts/board-policy`
- MCP：policy read/write tools
- UI：policy 加载与保存
- 核心策略模板：`strict/balanced/relaxed/custom`

### 2.3 v0.38（Action Job 编排）

已验证能力：

- CLI：`action-job enqueue/list/show/pause/resume/cancel`
- HTTP：`/ws/focus/alerts/action-jobs*`
- MCP：action-job 工具
- UI：job 列表与控制
- 稳定性：生命周期与大批量用例（>200）测试覆盖

### 2.4 v0.39（可观测与发布稳态）

已验证能力：

- 统一诊断 envelope 与错误分类能力（diagnostics）
- `doctor` 增强（发布链路诊断）
- 发布后 npm 校验
- 发布失败 diagnostics 导出
- 运行手册（runbook）文档已存在

---

## 3. v1.0 新篇章目标

## 3.1 章节目标

从“持续迭代功能”转入“稳定契约产品化”：

- 冻结 CLI/API/MCP 核心契约
- 明确 breaking 变更规则
- 提供可执行迁移与回滚手册
- 构建 1.0 发布门禁

## 3.2 章节边界

本章节聚焦“稳定化与发布治理”，不再扩展大功能面。

---

## 4. v1.0 执行计划（建议 3 个 Sprint）

### Sprint A：契约冻结（Contract Freeze）

任务：

- [ ] 产出 CLI 契约清单（命令、参数、默认行为）
- [ ] 产出 HTTP API 契约清单（路径、输入、输出、错误码）
- [ ] 产出 MCP 工具契约清单（name/schema/返回结构）
- [ ] 增加 `CONTRACT_VERSION` 文档标识

验收：

- [ ] 三份契约文档齐全并可追踪
- [ ] 与当前实现一致（抽样验证）

### Sprint B：兼容与迁移（Compatibility & Migration）

任务：

- [ ] 完成 `0.3x -> 1.0` 迁移核对清单
- [ ] 明确弃用策略（仅警告，不破坏）
- [ ] 完成回滚指南（1.0 -> 0.37.x）

验收：

- [ ] 新老用户均可按文档完成升级/回退
- [ ] 不出现无说明的 breaking 变更

### Sprint C：发布门禁（Release Gate）

任务：

- [ ] 固化 1.0 发布门禁：
  - 全量测试
  - pack dry-run
  - release workflow 通过
  - npm 可见性校验
- [ ] 增加 1.0 发布 checklist（仓库内文件）
- [ ] 预发布演练（`v1.0.0-rc.1`）

验收：

- [ ] 演练通过
- [ ] `v1.0.0` 可一键发布

---

## 5. v1.0 发布门禁（强制）

发布 `v1.0.0` 前必须全部通过：

- [ ] `node --test`
- [ ] `npm run pack:dry`
- [ ] release-please 工作流成功
- [ ] npm registry 可见 `@xiaofandegeng/rmemo@1.0.0`
- [ ] GitHub Release 说明与资产完整
- [ ] 迁移指南/稳定契约文档已更新

---

## 6. 接力提示词（给下一个模型）

```text
你现在进入 rmemo 的 v1.0 新篇章。
先读取 docs/V1_0_CHAPTER.zh-CN.md。
执行：
1) git status --short
2) node --test
3) npm run pack:dry

然后只做 Sprint A 的一个任务点（契约冻结），不要跨 Sprint。
完成后给出：改动文件、验收结果、剩余任务。
```

## 7. Release 触发说明

为保证通过 GitHub PR 合并触发 `v1.0.0`，可使用带以下提交尾注的提交进入 `main`：

`Release-As: 1.0.0`
