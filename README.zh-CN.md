# rmemo

面向任何代码仓库的“项目记忆 + 开发日志”CLI：自动扫描项目结构，沉淀约定/进度，一键生成可直接粘贴给 AI 的 Context Pack。

[English](./README.md) | [简体中文](./README.zh-CN.md)

文档：
- [使用方式（配合 AI 开发）](./docs/USAGE.zh-CN.md)
- [发版说明](./RELEASING.md)
- [PR 自动化](./docs/PR_AUTOMATION.md)
- [升级到 v1.0 指南](./docs/UPGRADING_TO_1_0.md)
- [接口契约（Contracts）](./docs/CONTRACTS.md)
- [回归矩阵（Regression Matrix）](./docs/REGRESSION_MATRIX.md)
- [发布检查清单（Release Checklist）](./docs/RELEASE_CHECKLIST.md)
- [发布说明模板（Release Notes Template）](./docs/RELEASE_NOTES_TEMPLATE.md)
- [长期演进路线 (ZH)](./docs/LONG_TERM_ROADMAP.zh-CN.md)
- [迭代开发看板 (ZH)](./docs/ITERATION_MASTER_PLAN.zh-CN.md)

## 🛡 稳定性契约 (v1.0.0+)
自 v1.0.0 起，`rmemo` 保证以下接口和行为的向后兼容性：
- **CLI 命令**：命令字（如 `rmemo ws`, `rmemo embed`）及其对应参数不再更改或删除。只有重大版本升级（Major version）才会包含破坏性更改，次要版本（Minor version）仅允许附加新增参数。
- **HTTP/MCP 接口**：响应体结构的向后兼容性受到严格保护。新字段可能被添加，但已被定义的字段类型不会被改变。
- **存储格式**：`.repo-memory` 文件夹内的目录拓扑形态（如 `context.md`, `rules.md`, `todos.md`, `ws-focus/`）已被冻结。这确保外部自动化工作流对该格式解析的稳定预期。

## 为什么需要它

隔天继续开发时，AI 工具经常会：
- 忘记项目结构和约定（目录边界、命名、规范）
- 重复做你已经做过的决策
- 逐渐偏离仓库里既有的模式（AI drift）

`rmemo` 的思路是把“项目记忆”放回仓库本身：把规则、进度、下一步、结构索引固化为文件，然后生成一个统一的 `Context Pack`，你可以把它喂给任何 AI（不绑定某一个模型/产品）。

## 安装 / 运行

全局安装：

```bash
npm i -g @xiaofandegeng/rmemo
```

然后在任意仓库中使用：

```bash
rmemo --root . init --auto
rmemo --root . init --template web-admin-vue
rmemo --root . start
rmemo --root . done "今天：..."
```

如果你不想全局安装，也可以在本仓库内用 Node 直接运行。

## 用在任意项目

在目标项目根目录执行：

```bash
node /path/to/rmemo/bin/rmemo.js init
node /path/to/rmemo/bin/rmemo.js log "做了 X；下一步 Y"
node /path/to/rmemo/bin/rmemo.js context
node /path/to/rmemo/bin/rmemo.js print
```

如果已全局安装：

```bash
rmemo --root . init
rmemo --root . init --template web-admin-vue
rmemo --root . start
rmemo --root . status --mode brief
rmemo --root . check --staged
```

或者不切目录，直接指定仓库根路径：

```bash
node /path/to/rmemo/bin/rmemo.js --root /path/to/your-repo init
```

## 它会创建哪些文件

- `.repo-memory/manifest.json`：检测到的结构信息、技术栈提示、关键文件
- `.repo-memory/index.json`：文件索引（用于生成 context）
- `.repo-memory/rules.md`：你的规则/约定（手写）
- `.repo-memory/rules.json`：可执行规则（用于 `check`）
- `.repo-memory/todos.md`：下一步与阻塞（手写/命令追加）
- `.repo-memory/journal/YYYY-MM-DD.md`：按天顺序记录进度（手写/命令追加）
- `.repo-memory/context.md`：生成的 AI 上下文包（生成文件）
- `.repo-memory/embeddings/index.json`：用于语义检索的 embeddings 索引（生成文件）

## 命令

```bash
rmemo init
rmemo scan
rmemo log <text>
rmemo status
rmemo check
rmemo sync
rmemo hook install
rmemo start
rmemo done
rmemo handoff
rmemo pr
rmemo watch
rmemo ws
rmemo todo add <text>
rmemo todo block <text>
rmemo todo ls
rmemo session
rmemo serve
rmemo mcp
rmemo embed
rmemo contract check
rmemo context
rmemo print
rmemo template ls
rmemo template apply <id>
```

## 同步到 AI 工具的“项目指令文件”

一些 AI 工具支持把“项目规则”存为仓库内的指令文件，这样隔天继续开发时不容易忘记约定。

`rmemo sync` 会把 `.repo-memory/` 的规则/进度同步生成到：
- `AGENTS.md`
- `.github/copilot-instructions.md`
- `.cursor/rules/rmemo.mdc`

示例：

```bash
rmemo sync
rmemo sync --check
rmemo sync --targets agents,copilot,cursor
rmemo sync --force
```

## 一次性初始化（推荐）

如果你希望这个能力在仓库里“默认一直生效”，执行：

```bash
rmemo setup
```

它会：
- 创建/更新 `.repo-memory/config.json`（sync 的 targets 配置）
- 安装一组 git hooks：
  - `pre-commit`：`rmemo check --staged`（阻止不符合规则的提交）
  - `post-commit/post-merge/post-checkout`：`rmemo sync`（不阻塞，只负责保持 AI 指令文件最新）

不安装 hooks：

```bash
rmemo setup --no-hooks
```

审计检查（适合 CI）：

```bash
rmemo setup --check
```

卸载（安全：只移除 rmemo 管理的 hooks）：

```bash
rmemo setup --uninstall
rmemo setup --uninstall --remove-config
```

## 一份文件的 AI 交接包

生成一个可直接粘贴给 AI 的 markdown（同时写入 `.repo-memory/handoff.md`）：

```bash
rmemo handoff
rmemo handoff --recent-days 5
rmemo handoff --since v0.0.3
rmemo handoff --staged
rmemo handoff --format json
```

## PR 摘要

生成一份可直接用作 PR 描述的 markdown（同时写入 `.repo-memory/pr.md`）：

```bash
rmemo pr
rmemo pr --base origin/main
rmemo pr --format json
rmemo pr --no-refresh
```

## Watch 模式（保持一直最新）

如果你希望开发过程中 context 与指令文件始终保持最新：

```bash
rmemo watch
rmemo watch --interval 5000
rmemo watch --no-sync
```

## Sessions（开始 -> 记录 -> 结束）

如果你希望把开发过程按“session”顺序沉淀，并在结束时自动生成一份交接包快照：

```bash
rmemo session start --title "修复登录流程"
rmemo session note "定位到原因：token refresh 竞态"
rmemo session end
rmemo session ls
```

## Repo Memory HTTP API（本地）

如果你的 AI 工具支持拉取 URL，可以用本地 HTTP 暴露仓库记忆（默认只读）：

```bash
rmemo serve --root . --token devtoken --port 7357
```

常用接口：
- `GET /ui`（本地面板）
- `GET /events`（SSE 事件流；用于实时刷新）
- `GET /events/export?format=json|md&limit=200`（导出最近事件）
- `GET /diagnostics/export?format=json|md`（一键导出 status+watch+events 诊断包）
- `GET /embed/status?format=json|md`（embeddings 健康/状态）
- `GET /embed/plan?format=json|md`（构建前预演：复用/重算哪些文件）
- `GET /embed/jobs`、`GET /embed/jobs/:id`（后台 embeddings 任务）
- `GET /embed/jobs/failures?limit=20&errorClass=config`（失败任务聚类，便于治理）
- `GET /embed/jobs/governance`（健康度指标 + 治理建议）
- `GET /embed/jobs/governance/history?limit=20`（治理策略版本历史）
- `GET /embed/jobs/config`（任务调度配置）
- `GET /watch`（watch 运行状态）
- `GET /status?format=json`
- `GET /context`
- `GET /rules`
- `GET /todos?format=json`
- `GET /search?q=...`（关键字检索）
- `GET /search?mode=semantic&q=...`（语义检索；需要先执行 `rmemo embed build`）
- `GET /timeline?format=md|json&days=14&limit=80&include=journal,session,todo`（按时间顺序的项目记忆时间线）
- `GET /resume?format=md|json&timelineDays=14&timelineLimit=40`（次日续接包）
- `GET /resume/digest?format=md|json&timelineDays=7&timelineLimit=20`（自动化精简续接摘要）
- `GET /resume/history?format=md|json&limit=20`（resume digest 快照历史）
- `GET /resume/history/item?id=<snapshotId>&format=md|json`（读取单个快照）
- `GET /resume/history/compare?from=<id>&to=<id>&format=md|json`（对比两个续接快照）
- `GET /ws/list?only=apps/a,apps/b`（列出检测到的 monorepo 子项目）
- `GET /ws/focus?q=...&mode=semantic|keyword`（跨子项目聚合 focus 检索；支持 `save=1`、`compareLatest=1`、`tag=...`）
- `GET /ws/focus/snapshots?limit=20`（workspace focus 快照历史）
- `GET /ws/focus/compare?from=<id>&to=<id>`（对比两个 workspace focus 快照）
- `GET /ws/focus/report?from=<id>&to=<id>&format=json|md&save=1&tag=<name>`（workspace 漂移报告；不传 id 时默认对比最近两次快照）
- `GET /ws/focus/reports?limit=20`（已保存的 workspace 漂移报告历史）
- `GET /ws/focus/report-item?id=<reportId>&format=json|md`（读取某一条已保存的 workspace 漂移报告）
- `GET /ws/focus/trends?limitGroups=20&limitReports=200`（按 query/mode 聚合的 workspace 趋势看板）
- `GET /ws/focus/trend?key=<trendKey>&format=json|md&limit=100`（按 key 读取某一条趋势序列）
- `GET /ws/focus/alerts?limitGroups=20&limitReports=200&key=<trendKey>`（基于趋势分组评估漂移告警）
- `GET /ws/focus/alerts/config`（读取 workspace 告警策略配置）
- `GET /ws/focus/alerts/history?limit=20&key=<trendKey>&level=high|medium`（告警事件时间线）
- `GET /ws/focus/alerts/rca?incidentId=<id>&key=<trendKey>&format=json|md&limit=20`（基于告警时间线生成 RCA）
- `GET /ws/focus/alerts/action-plan?incidentId=<id>&key=<trendKey>&format=json|md&limit=20&save=1&tag=<name>`（生成可执行改进计划）
- `GET /ws/focus/alerts/actions?limit=20`（已保存的改进计划）
- `GET /ws/focus/alerts/action-item?id=<actionId>&format=json|md`（读取单条改进计划）
- `GET /ws/focus/alerts/boards?limit=20`（已保存执行看板）
- `GET /ws/focus/alerts/board-item?id=<boardId>&format=json|md`（读取单条执行看板）
- `GET /ws/focus/alerts/board-report?id=<boardId>&format=json|md&maxItems=20`（执行看板进度报告）
- `GET /ws/focus/alerts/board-pulse?limitBoards=50&todoHours=24&doingHours=12&blockedHours=6&save=1&source=<name>`（对开放看板执行逾期节奏检查）
- `GET /ws/focus/alerts/board-pulse-history?limit=20`（已保存的节奏检查事件）

可选：开启写入操作（必须设置 token）：

```bash
rmemo serve --root . --token devtoken --allow-write
```

可选：开启 watch（自动保持 repo memory 最新）并输出事件流：

```bash
rmemo serve --root . --token devtoken --watch --watch-interval 2000
```

写入接口：
- `POST /watch/start {intervalMs?,sync?,embed?}`
- `POST /watch/stop`
- `POST /refresh {sync?,embed?}`
- `POST /todos/next {text}`
- `POST /todos/blockers {text}`
- `POST /todos/next/done {index}`（从 1 开始）
- `POST /todos/blockers/unblock {index}`（从 1 开始）
- `POST /log {text, kind?}`
- `POST /resume/history/save {timelineDays?,timelineLimit?,maxTimeline?,maxTodos?,tag?}`
- `POST /resume/history/prune {keep?,olderThanDays?}`
- `POST /sync`
- `POST /embed/auto`
- `POST /embed/build {force?,useConfig?,provider?,model?,dim?,parallelism?,batchDelayMs?,kinds?...}`
  - 会推送 SSE 事件：`embed:build:start`、`embed:build:progress`、`embed:build:ok`、`embed:build:err`
  - 任务编排事件：`embed:job:queued`、`embed:job:start`、`embed:job:retry`、`embed:job:ok`、`embed:job:err`、`embed:job:canceled`、`embed:job:requeued`、`embed:jobs:retry-failed`
- `POST /embed/jobs {provider?,model?,dim?,parallelism?,batchDelayMs?,...}`（异步排队构建）
- `POST /embed/jobs/config {maxConcurrent,retryTemplate?,defaultPriority?}`（设置并发与默认重试策略）
- `POST /embed/jobs/:id/cancel`
- `POST /embed/jobs/:id/retry {priority?,retryTemplate?}`（一键重试单个失败/取消任务）
- `POST /embed/jobs/retry-failed {limit?,errorClass?,clusterKey?,priority?,retryTemplate?}`（批量重试失败任务）
- `POST /embed/jobs/governance/config {governanceEnabled?,governanceWindow?,governanceFailureRateHigh?,...}`（设置自动治理策略）
- `POST /embed/jobs/governance/apply`（立即应用当前最佳治理建议）
- `POST /embed/jobs/governance/simulate`（治理策略 dry-run / 影响预估）
- `POST /embed/jobs/governance/benchmark`（多策略回放基准测试与排序）
- `POST /embed/jobs/governance/benchmark/adopt`（基准回放后，按阈值自动采纳最优候选）
- `POST /embed/jobs/governance/rollback {versionId}`（按版本回滚治理策略）
- `POST /ws/focus/alerts/config {enabled?,minReports?,maxRegressedErrors?,maxAvgChangedCount?,maxChangedCount?,autoGovernanceEnabled?,autoGovernanceCooldownMs?}`
- `POST /ws/focus/alerts/check?autoGovernance=1&source=ws-alert`
- `POST /ws/focus/alerts/action-apply {id,includeBlockers?,noLog?,maxTasks?}`
- `POST /ws/focus/alerts/board-create {actionId,title?}`
- `POST /ws/focus/alerts/board-update {boardId,itemId,status,note?}`
- `POST /ws/focus/alerts/board-close {boardId,reason?,force?,noLog?}`

## MCP Server（stdio）

如果你的 AI 工具支持 MCP，可以运行：

```bash
rmemo mcp --root .
```

它会暴露一组 tools（示例）：`rmemo_status`、`rmemo_context`、`rmemo_handoff`、`rmemo_pr`、`rmemo_rules`、`rmemo_todos`、`rmemo_search`、`rmemo_focus`、`rmemo_timeline`、`rmemo_resume`、`rmemo_resume_digest`、`rmemo_resume_history`、`rmemo_embed_status`、`rmemo_embed_plan`。

可选：开启写入 tools（出于安全默认关闭）：

```bash
rmemo mcp --root . --allow-write
```

写入 tools：
- `rmemo_todo_add`
- `rmemo_todo_done`
- `rmemo_log`
- `rmemo_resume_history_save`
- `rmemo_resume_history_prune`
- `rmemo_sync`
- `rmemo_embed_auto`
- `rmemo_embed_build`
- `rmemo_embed_job_enqueue`
- `rmemo_embed_job_cancel`
- `rmemo_embed_jobs_config`
- `rmemo_embed_job_retry`
- `rmemo_embed_jobs_retry_failed`
- `rmemo_embed_jobs_governance_config`
- `rmemo_embed_jobs_governance_apply`
- `rmemo_embed_jobs_governance_rollback`
- `rmemo_embed_jobs_governance_benchmark_adopt`

读取 tool：
- `rmemo_resume_history`
- `rmemo_embed_jobs`
- `rmemo_embed_jobs_failures`
- `rmemo_embed_jobs_governance`
- `rmemo_embed_jobs_governance_history`
- `rmemo_embed_jobs_governance_simulate`
- `rmemo_embed_jobs_governance_benchmark`
- `rmemo_ws_list`
- `rmemo_ws_focus`
- `rmemo_ws_focus_snapshots`
- `rmemo_ws_focus_compare`
- `rmemo_ws_focus_report`
- `rmemo_ws_focus_report_history`
- `rmemo_ws_focus_report_get`
- `rmemo_ws_focus_trends`
- `rmemo_ws_focus_trend_get`
- `rmemo_ws_focus_alerts`
- `rmemo_ws_focus_alerts_config`
- `rmemo_ws_focus_alerts_history`
- `rmemo_ws_focus_alerts_rca`
- `rmemo_ws_focus_alerts_action_plan`
- `rmemo_ws_focus_alerts_actions`
- `rmemo_ws_focus_alerts_action_get`
- `rmemo_ws_focus_alerts_boards`
- `rmemo_ws_focus_alerts_board_get`
- `rmemo_ws_focus_alerts_board_report`
- `rmemo_ws_focus_alerts_board_pulse`
- `rmemo_ws_focus_alerts_board_pulse_history`
- `rmemo_ws_focus_alerts_config_set`（写入 tool）
- `rmemo_ws_focus_alerts_check`（写入 tool，可选触发自动治理）
- `rmemo_ws_focus_alerts_action_apply`（写入 tool）
- `rmemo_ws_focus_alerts_board_create`（写入 tool）
- `rmemo_ws_focus_alerts_board_update`（写入 tool）
- `rmemo_ws_focus_alerts_board_close`（写入 tool）

## 集成（MCP 配置片段）

有些 IDE/Agent 需要你粘贴一段 JSON 片段来注册 MCP server（并且 GUI 环境里 PATH 可能不完整）。

生成 Antigravity 配置片段（粘贴到 “View raw config”）：

```bash
rmemo integrate antigravity
rmemo integrate antigravity --format json
```

其他 MCP 客户端：

```bash
rmemo integrate cursor --format json
rmemo integrate cline --format json
rmemo integrate claude-desktop --format json
```

自动合并到现有 JSON 配置文件（若发生修改会先创建备份）：

```bash
rmemo integrate claude-desktop --apply
rmemo integrate claude-desktop --apply --config /path/to/claude_desktop_config.json
```

如果你遇到 `Unknown command: mcp`，说明你全局安装的 `rmemo` 太旧；这个片段默认使用 `node` + `bin/rmemo.js` 绝对路径来绕过 PATH/版本冲突。

## 语义检索（Embeddings）

构建本地 embeddings 索引（默认使用确定性的 `mock` provider）：

```bash
rmemo embed build
rmemo embed plan --parallel 4 --format json
rmemo embed search "auth token refresh"
rmemo embed status --format json
```

可选 OpenAI provider：

```bash
export OPENAI_API_KEY=...
rmemo embed build --provider openai --model text-embedding-3-small --batch-delay-ms 200
rmemo embed search "鉴权在哪里做的？"
```

## Monorepo 工作区（子项目）

如果你的仓库是 monorepo，`rmemo ws` 可以检测子项目并在子项目内执行命令：

```bash
rmemo ws ls
rmemo ws start 1
rmemo ws handoff apps/admin-web
rmemo ws pr apps/admin-web --base origin/main
rmemo ws focus apps/admin-web "auth token refresh" --mode keyword
rmemo ws batch handoff
rmemo ws batch pr --base origin/main
rmemo ws batch focus "auth token refresh" --mode keyword --format json
rmemo ws batch focus "auth token refresh" --mode keyword --format json --save --compare-latest --tag daily
rmemo ws focus-history list --format json
rmemo ws focus-history report --format md --save-report --report-tag daily-rpt
rmemo ws focus-history report <fromId> <toId> --format json --max-items 20 --save-report
rmemo ws report-history list --format json
rmemo ws report-history show <reportId> --format json
rmemo ws trend --format json --limit-groups 20 --limit-reports 200
rmemo ws trend show "keyword::auth token refresh" --format json --limit 100
rmemo ws alerts --format json --limit-groups 20 --limit-reports 200
rmemo ws alerts check --format json --key "keyword::auth token refresh"
rmemo ws alerts history --format json --limit 20 --level high
rmemo ws alerts rca --format md --incident <incidentId> --limit 20
rmemo ws alerts action-plan --format json --incident <incidentId> --save --tag daily-action
rmemo ws alerts action-history --format json --limit 20
rmemo ws alerts action-show --format json --action <actionId>
rmemo ws alerts action-apply --format json --action <actionId> --include-blockers --max-tasks 10
rmemo ws alerts board create --format json --action <actionId> --title "daily board"
rmemo ws alerts board list --format json --limit 20
rmemo ws alerts board show --format json --board <boardId>
rmemo ws alerts board update --format json --board <boardId> --item <itemId> --status doing --note "started"
rmemo ws alerts board report --format json --board <boardId> --max-items 20
rmemo ws alerts board close --format json --board <boardId> --reason "done" --force
rmemo ws alerts board policy show --format json
rmemo ws alerts board policy set --preset strict --format json
rmemo ws alerts board pulse --format json --policy strict --save
rmemo ws alerts board pulse-history --format json --limit 20
rmemo ws alerts board pulse-plan --format json --policy strict
rmemo ws alerts board pulse-apply --format json --policy strict --limit-items 10
rmemo ws alerts config set --alerts-enabled --alerts-min-reports 2 --alerts-max-regressed-errors 0 --alerts-max-avg-changed 8 --alerts-max-changed 20 --alerts-auto-governance
rmemo ws batch handoff --only apps/admin-web,apps/miniapp
```

## 可执行规则（CI / Hooks）

`rmemo` 支持在 `.repo-memory/rules.json` 里写规则，并用 `rmemo check` 在本地或 CI 执行。

示例：

```json
{
  "schema": 1,
  "requiredPaths": ["README.md"],
  "requiredOneOf": [
    ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]
  ],
  "forbiddenPaths": [".env", ".env.*"],
  "forbiddenContent": [
    {
      "include": ["**/*"],
      "exclude": ["**/*.png", "**/*.jpg", "**/*.zip"],
      "match": "BEGIN PRIVATE KEY",
      "message": "禁止提交私钥内容。"
    }
  ],
  "namingRules": [
    {
      "include": ["src/pages/**"],
      "target": "basename",
      "match": "^[a-z0-9-]+\\.vue$",
      "message": "页面文件名必须是 kebab-case。"
    }
  ]
}
```

执行检查：

```bash
rmemo check
```

机器可读输出：

```bash
rmemo check --format json
```

Pre-commit 使用（更快，只检查暂存区文件）：

```bash
rmemo check --staged
```

安装 git pre-commit hook（提交前自动执行 `rmemo check`）：

```bash
rmemo hook install
```

## 日常工作流（推荐）

开工（扫描结构 + 生成 context + 打印 status，方便你粘贴给 AI）：

```bash
rmemo start
```

收工（写入当天 journal；可选同时更新 Next/Blockers）：

```bash
rmemo done "今天完成了什么/做了什么决策"
echo "今天总结..." | rmemo done
rmemo done --next "明天第一步做什么" --blocker "当前阻塞是什么" "今天总结..."
```

手动维护下一步/阻塞（不想打开文件改）：

```bash
rmemo todo add "实现用户搜索"
rmemo todo block "后端接口还没出"
rmemo todo ls
rmemo todo done 1
rmemo todo unblock 1
```

时间线（按时间顺序汇总记忆，方便第二天续接）：

```bash
rmemo timeline --days 14 --limit 80
rmemo timeline --format json --include journal,session,todo
rmemo timeline --brief
```

续接包（次日开工一条命令）：

```bash
rmemo resume
rmemo resume --brief --no-context
rmemo resume --format json --timeline-days 14 --timeline-limit 40
rmemo resume digest
rmemo resume digest --format json --timeline-days 7 --timeline-limit 20 --max-timeline 8 --max-todos 5
rmemo resume history list --format md --limit 20
rmemo resume history save --tag daily-check
rmemo resume history compare <fromId> <toId> --format json
rmemo resume history prune --keep 100 --older-than-days 30 --format json
# keep / older-than-days 必须是非负整数
```

## 扫描结果输出（可选）

把 scan 结果打印到 stdout：

```bash
rmemo scan --format json
rmemo scan --format md
```

## 模板（可选）

内置模板用于快速生成 `.repo-memory/` 的规则与 todos：

```bash
rmemo template ls
rmemo template apply web-admin-vue
rmemo template apply miniapp
```

## Profiles（推荐）

Profile 是 “模板 + 默认配置”（规则/待办 + config），用于快速适配常见项目类型。

```bash
rmemo profile ls
rmemo profile describe web-admin-vue
rmemo --root . profile apply web-admin-vue
rmemo --root . init --auto
```

## 发布演练（推荐）

`v1.0.0` 之后默认使用 GitHub Actions 自动发布。发布前建议先执行一次本地“彩排”：

```bash
npm run verify:release-rehearsal -- --repo xiaofandegeng/rmemo
```

该命令会统一生成 `artifacts/` 下的审计文件：
- `release-notes.md`
- `release-ready.md` / `release-ready.json`
- `release-health.md` / `release-health.json`
- `release-rehearsal.md` / `release-rehearsal.json`
- `release-rehearsal.json` 现已包含 `standardized.status/resultCode/checkStatuses/failureCodes/failures` 与 `summaryFailureCodes`（合并步骤分类码 + 失败步骤下游标准化 failure codes + health failure codes）
- `release-rehearsal.md` 在失败时新增 `Failure Signals` 段，直接展示 step/check/code/category/retryable 细节
- `release-notes` 同时支持 `--format json`，并提供 `standardized.status/resultCode/checkStatuses/failureCodes/failures`
- `verify:changelog`（`changelog-lint`）的 JSON 现已包含 `standardized.status/resultCode/checkStatuses/failureCodes/failures`
- `verify:matrix`（`regression-matrix`）的 JSON 现已包含 `standardized.status/resultCode/checkStatuses/failureCodes/failures`

超时参数（网络不稳定时建议设置，避免命令长时间挂起）：
- `npm run verify:release-rehearsal -- --repo xiaofandegeng/rmemo --health-timeout-ms 15000`
- `npm run verify:release-rehearsal -- --repo xiaofandegeng/rmemo --summary-out artifacts/release-summary.json`
- `npm run verify:release-rehearsal -- --repo xiaofandegeng/rmemo --summary-out artifacts/release-summary.md --summary-format md`
- `npm run verify:release-rehearsal-archive -- --repo xiaofandegeng/rmemo --health-timeout-ms 15000 --archive-snapshot-id <yyyymmdd_hhmmss>`
- `npm run verify:release-rehearsal-archive-verify -- --repo xiaofandegeng/rmemo --health-timeout-ms 15000 --archive-snapshot-id <yyyymmdd_hhmmss>`
- `node scripts/release-ready.js --format md --step-timeout-ms 120000`
- `release-ready` JSON 现已包含适合集成消费的标准化块（`standardized.status/resultCode/checkStatuses/failureCodes/failures`）

按版本快照归档发布报告：
- `npm run verify:release-archive -- --version <version> --tag v<version> --snapshot-id <yyyymmdd_hhmmss> --retention-days 30 --max-snapshots-per-version 20`
- `release-archive` JSON 现已包含适合集成消费的标准化块（`standardized.status/resultCode/checkStatuses/failureCodes/failures`）
- `npm run verify:release-archive-find -- --version <version> --format json`（定位最新快照/查询归档索引）
- `npm run verify:release-archive-find -- --version <version> --require-files release-ready.json,release-health.json,release-rehearsal.json --format json`（校验最新快照的关键文件完整性）
- `release-archive-find` JSON 现已包含适合集成消费的标准化块（`standardized.status/resultCode/checkStatuses/failureCodes/failures`）
- 在演练命令中启用 `--archive` 时，会自动生成 `artifacts/release-summary.json` 与 `artifacts/release-archive.json`
- 启用 `--archive-verify` 时，会生成 `artifacts/release-archive-verify.json`，并在关键文件缺失时使演练失败
- `release-summary.json` 现已包含失败分层与恢复提示（`failureBreakdown`、`retryableFailures`、`actionHints`）
- `release-summary.json` 会包含归档状态详情（`archive.snapshotId`、`archive.archiveStep`、`archive.verify`）
- `release-summary.json` 还会汇总 `release-health` 与失败步骤下游标准化失败信号（`health.*`、`summaryFailureCodes`）
- `release-summary.json` 新增适合集成消费的标准化块（`standardized.status/resultCode/checkStatuses/failureCodes/failures`）
- `release-summary.json.standardized.failures` 现已同时包含步骤级失败、步骤下游失败细节与 health 失败（来自 `release-health`）
- 摘要输出支持 `--summary-format md|json`（默认 `json`；当 `--summary-out` 以 `.md` 结尾时会自动推断为 Markdown）
- 在 `--archive` 且未显式传 `--summary-out` 时，若设置 `--summary-format md`，默认摘要路径为 `artifacts/release-summary.md`（否则为 `artifacts/release-summary.json`）
- 在 `--archive` 模式下，即使主摘要输出为 Markdown，仍会保留机器可读的兼容摘要 `artifacts/release-summary.json`
- `release-archive` 现已支持归档 `release-summary.md`（存在时）以及 `release-summary.json`
- Markdown 摘要新增 `Failure Breakdown` / `Health Signals` / `Archive` 高信号分段，便于快速排障
- 当同时传 `--summary-out` 与 `--summary-format` 时，文件后缀（`.md/.json`）必须与格式一致，否则会快速失败

发布后收敛校验：
- `npm run verify:release-verify -- --repo xiaofandegeng/rmemo --version <version> --tag v<version>`
- `release-verify` JSON 现已包含适合集成消费的标准化块（`standardized.status/resultCode/checkStatuses/failureCodes/failures`）

## Roadmap（简版）

- v0.2：增强通用扫描（monorepo/子项目/API 契约/文档根目录）
- v0.3：规则能力增强 + 更好的 `check` 输出 + hooks/CI 体验打磨
- v0.4：VS Code 扩展（快速 log/start/done）
