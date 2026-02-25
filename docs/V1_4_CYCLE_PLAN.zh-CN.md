# rmemo v1.4 周期计划（1.3 发布后）

更新时间：2026-02-25  
当前基线：`v1.3.0`

## 1. 周期目标

v1.4 聚焦“发布稳定性工程化”，确保发布链路在网络抖动、平台瞬时异常下仍具备可预期行为。

- 目标 A：发布资产命名与健康检查口径统一。
- 目标 B：发布门禁具备超时与重试能力，避免卡死。
- 目标 C：完成 v1.4 发布并沉淀标准化 runbook。

---

## 2. 里程碑拆分

## M1（v1.4.0-alpha）资产一致性

任务：

- [x] GitHub Release 资产命名统一为 `rmemo-<version>.tgz`。
- [x] `release-health` 增加资产名一致性检查。
- [x] workflow 严格模式校验（拒绝 legacy scoped 资产名）。
- [x] 补齐资产一致性测试（含 strict/legacy 分支）。

验收：

- [x] 资产命名与健康检查规则一致。
- [x] legacy 命名在 strict 模式下可稳定拦截。

## M2（v1.4.0-beta）门禁鲁棒性

任务：

- [x] `release-ready` 增加 `--step-timeout-ms`。
- [x] `release-health` / `release-rehearsal` 增加 timeout 控制。
- [x] workflow 显式传递 timeout 参数（release-ready/release-health）。
- [x] `release-health` 增加 GitHub API 重试策略（429/5xx）。

验收：

- [x] 发布演练不会因单步阻塞而无限等待。
- [x] 平台瞬时故障可在日志中快速定位并重试恢复。

## M3（v1.4.0）正式发布闭环

任务：

- [ ] 发布 `v1.4.0`。
- [ ] 完成 npm 与 GitHub Release 双端校验。
- [x] 更新 `RELEASING.md` / `RELEASE_CHECKLIST.md` 的 v1.4 运行规范。

验收：

- [ ] 发布后 30 分钟内完成端到端核验闭环。
- [ ] 新接力模型可仅依赖文档完成发布演练。

---

## 3. 交接模板（后续模型固定流程）

1. 先执行：
- `git status --short`
- `node --test`
- `npm run pack:dry`

2. 阅读：
- `docs/V1_4_CYCLE_PLAN.zh-CN.md`
- `docs/NEXT_CYCLE_PLAN.md`
- `docs/RELEASE_CHECKLIST.md`

3. 本轮只做一个里程碑内的一项任务，不跨里程碑。

4. 结束时输出：
- 改动文件
- 验收结果
- 剩余任务
- 下一步第一条命令
