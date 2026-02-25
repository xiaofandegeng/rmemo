# rmemo v1.1 周期计划（1.0 发布后）

更新时间：2026-02-25  
当前基线：`v1.2.0`（v1.1 周期目标已完成）

## 1. 周期目标

v1.1 聚焦“契约守护自动化 + 生产可用验证”，不引入大规模新功能面。

- 目标 A：把 1.0 稳定契约变成可执行检查（CI 自动守护）。
- 目标 B：提升发布与运维可观测性（可追溯、可回放、可诊断）。
- 目标 C：建立 1.x 迭代节奏模板，降低后续模型接力成本。

---

## 2. 里程碑拆分

## M1（v1.1.0-alpha）契约检查器

任务：

- [x] 新增 `rmemo contract check` 命令。
- [x] 生成并校验三类契约清单：CLI / HTTP / MCP。
- [x] CI 增加 `contract-check` job（对破坏性变更直接 fail）。
- [x] 文档：`docs/CONTRACTS.md` + 使用说明。

验收：

- [x] 人为改坏一个接口字段，CI 能稳定拦截。
- [x] 本地命令可输出差异明细（结构化 JSON + 可读 md）。

## M2（v1.1.0-beta）回归矩阵固化

任务：

- [x] 增加端到端回归脚本（CLI/API/MCP/UI 各 1 条主流程）。
- [x] 增加“发布后健康检查”脚本（npm + GitHub Release + 资产）。
- [x] 补充诊断汇总：`rmemo diagnostics export` 增加 contract 章节。

验收：

- [x] 每次 release 后自动产出健康报告。
- [x] 失败场景能自动附带诊断信息。

## M3（v1.1.0）稳定发布

任务：

- [x] 清理 1.0 遗留计划文档状态（勾选与真实进度一致）。
- [x] 更新 `README.md` / `README.zh-CN.md` 的 1.1 新能力说明。
- [x] 发布 v1.1.0（后续已迭代发布至 v1.2.0）。

验收：

- [x] `node --test` 全绿。
- [x] `npm run pack:dry` 通过。
- [x] npm 与 GitHub Release 均可见发布版本（当前 `v1.2.0`）。

---

## 3. 每周执行节奏

Week 1:
- 完成 M1 核心与 CI 接入。

Week 2:
- 完成 M2 回归矩阵与诊断增强。

Week 3:
- 完成 M3 文档收敛与发布。

---

## 4. 交接模板（后续模型固定流程）

1. 先执行：
- `git status --short`
- `node --test`
- `npm run pack:dry`

2. 阅读：
- `docs/V1_1_CYCLE_PLAN.zh-CN.md`
- `docs/V1_0_CHAPTER.zh-CN.md`
- `CHANGELOG.md`

3. 本轮只做一个里程碑内的一项任务，不跨里程碑。

4. 结束时输出：
- 改动文件
- 验收结果
- 剩余任务
- 下一步第一条命令
