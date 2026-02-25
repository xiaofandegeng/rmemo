# rmemo 下一周期开发计划（v1.1）

更新时间：2026-02-25  
适用分支：`main`  
当前基线：`@xiaofandegeng/rmemo@1.2.0`

## 1. 当前进度快照（事实）

- 发布状态：`v1.2.0` 已发布（包含 v1.1 周期核心成果）。
- 质量基线：`node --test` 与 `npm run pack:dry` 作为发布门禁。
- 现有核心能力：
  - 记忆与规则链路：`init/scan/context/status/check/sync/start/done/todo`
  - 治理链路：`ws alerts board policy/pulse/action-plan/action-job`
  - 集成链路：`serve`、`mcp`、`integrate`、`doctor`、`diagnostics`
  - 发布链路：release-please + tag 发布 + npm 发布校验

## 2. 下一周期目标（v1.1）

目标：把“1.0 稳定契约”变成可自动守护、可回归、可审计的长期工程体系。

### 里程碑 A（`v1.1.0-alpha`）：契约检查自动化

- [x] 新增 `rmemo contract check` 命令（输出 `json` 与 `md` 差异）。
- [x] 生成并校验三类契约快照：CLI / HTTP / MCP。
- [x] CI 增加 `contract-check` job，破坏性变更直接失败。
- [x] 文档：新增 `docs/CONTRACTS.md`（契约来源、更新方式、breaking 规则）。

验收标准：

- [x] 人工修改一个接口字段后，CI 可稳定拦截。
- [x] 本地可读性输出能说明“哪一层契约被破坏”。

### 里程碑 B（`v1.1.0-beta`）：回归矩阵与健康检查

- [x] 增加统一回归矩阵脚本（CLI/API/MCP/UI 主流程各 1 条）。
- [x] 新增发布后健康检查（npm 版本、GitHub Release、资产文件一致性）。
- [x] `rmemo diagnostics export` 增加 `contracts` 与 `release-health` 章节。
- [x] 失败时自动附带诊断包路径（便于多模型接力排障）。

验收标准：

- [x] 每次发布后自动产出健康报告。
- [x] 失败场景可直接定位是“契约问题”还是“发布环境问题”。

### 里程碑 C（`v1.1.0`）：文档与发布收敛

- [x] 清理计划文档中的旧版本叙述（`0.3x` 时代遗留状态）。
- [x] 更新 `README.md` / `README.zh-CN.md` 的 1.1 能力与运维入口。
- [x] 发布 `v1.1.0`，完成 GitHub Release 与 npm 双端可见性校验（后续已迭代至 `v1.2.0`）。

验收标准：

- [x] 主文档与代码现状一致，无冲突指引。
- [x] 发布后 30 分钟内可完成端到端验证闭环。

## 3. 执行顺序（固定节奏）

Week 1：

1. 完成契约快照模型与 `contract check` 最小可用版本。
2. 接入 CI 并制造 1 个破坏性样例验证拦截能力。

Week 2：

1. 完成回归矩阵与发布后健康检查脚本。
2. 把诊断包结构与导出命令连通。

Week 3：

1. 完成文档收敛与发布演练。
2. 发布 `v1.1.0` 并补齐 release notes 模板（已完成，后续已发布 `v1.2.0`）。

## 4. 每次开发前后固定动作（强约束）

开发前：

- `git pull --ff-only`
- `git status --short`
- `node --test`
- 阅读：
  - `docs/V1_1_CYCLE_PLAN.zh-CN.md`
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
你在开发 rmemo v1.1 周期。
先执行：
1) git status --short
2) node --test
3) npm run pack:dry

然后读取：
- docs/V1_1_CYCLE_PLAN.zh-CN.md
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

- [x] 里程碑 A 完成（契约检查自动化）
- [x] 里程碑 B 完成（回归矩阵与健康检查）
- [x] 里程碑 C 完成（文档与发布收敛）

## 7. v1.2+ 开发快照（`v1.2.0` 已发布）

- [x] `resume history prune` 已在 CLI / HTTP / MCP 打通
- [x] UI 面板已增加 Resume History prune 操作入口
- [x] prune 参数已增加非负整数校验（非法输入返回明确错误）
- [x] 覆盖测试已补齐（core / serve / mcp / cli / ui）
- [x] 契约门禁已切换到 `--fail-on any`（CI / release workflow / release-ready）
