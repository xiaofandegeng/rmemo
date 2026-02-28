# rmemo 完整使用说明（含示例项目）

本手册面向第一次系统使用 `rmemo` 的开发者，目标是：

- 用一个示例项目把 `rmemo` 跑通。
- 说明每个顶层功能的作用与常用命令。
- 给出从个人开发到团队协作（CI / MCP / HTTP / Monorepo）的落地方式。

## 1. 示例项目

仓库内已提供示例项目：

- `examples/rmemo-demo-web-admin`

示例项目定位：一个最小化的 Vue 后台“用户管理”页面，便于演示：初始化、规则治理、日志、交接、PR 摘要、语义检索。

进入示例目录：

```bash
cd examples/rmemo-demo-web-admin
```

## 2. 5 分钟跑通

```bash
rmemo init --profile web-admin-vue
rmemo start
rmemo todo add "为用户列表增加手机号筛选"
rmemo log "决定：搜索参数使用 URL query 持久化"
rmemo done --next "明天先补分页边界测试" "今天完成：用户状态开关接口联调"
rmemo handoff
```

执行后，重点查看：

- `.repo-memory/rules.md`
- `.repo-memory/todos.md`
- `.repo-memory/journal/YYYY-MM-DD.md`
- `.repo-memory/context.md`
- `.repo-memory/handoff.md`

## 3. 每个顶层功能（30 个命令）

| 命令 | 作用 | 常用示例 |
| --- | --- | --- |
| `init` | 初始化 `.repo-memory`，可套用模板/画像 | `rmemo init --auto` |
| `scan` | 扫描仓库结构与变更线索，更新索引 | `rmemo scan --format md` |
| `log` | 追加一条开发日志到当天 journal | `rmemo log "修复登录重定向"` |
| `context` | 生成 AI 上下文包 `context.md` | `rmemo context` |
| `print` | 把 context 输出到 stdout | `rmemo print` |
| `status` | 输出当前规则/待办/日志摘要 | `rmemo status --mode brief` |
| `check` | 按 `rules.json` 做约束校验 | `rmemo check --staged` |
| `hook` | 管理 git hook（当前主要是 install） | `rmemo hook install --force` |
| `start` | 日开工入口（scan + context + status） | `rmemo start` |
| `done` | 日收工入口（记录总结并可追加 next/blocker） | `rmemo done --next "先补测试" "今天完成..."` |
| `todo` | 管理 Next/Blockers 待办 | `rmemo todo ls` |
| `template` | 查看/应用内置模板 | `rmemo template ls` |
| `sync` | 同步 AI 工具指令文件 | `rmemo sync --check` |
| `setup` | 一次性配置 hooks + config | `rmemo setup` |
| `handoff` | 生成一份可直接粘贴给 AI 的交接文档 | `rmemo handoff --format json` |
| `pr` | 生成 PR 描述摘要 | `rmemo pr --base origin/main` |
| `watch` | 持续监听仓库并自动刷新上下文 | `rmemo watch --interval 2000` |
| `ws` | Monorepo 工作区能力总入口 | `rmemo ws ls` |
| `profile` | 画像管理（默认规则/配置集合） | `rmemo profile ls` |
| `session` | 会话化记录（start/note/end） | `rmemo session start --title "用户搜索"` |
| `serve` | 本地 HTTP 服务（默认读） | `rmemo serve --token devtoken --port 7357` |
| `mcp` | 以 MCP stdio server 对外提供工具 | `rmemo mcp --allow-write` |
| `embed` | 语义向量索引与检索 | `rmemo embed build --provider mock` |
| `focus` | 针对一个问题生成焦点包 | `rmemo focus "登录失败排查"` |
| `integrate` | 生成/写入 MCP 集成配置片段 | `rmemo integrate antigravity --format json` |
| `doctor` | 环境与集成诊断 | `rmemo doctor` |
| `diagnostics` | 导出诊断报告 | `rmemo diagnostics export --format json` |
| `contract` | 校验 CLI/HTTP/MCP 契约是否漂移 | `rmemo contract check --fail-on any` |
| `timeline` | 聚合 journal/session/todo 时间线 | `rmemo timeline --days 14 --format md` |
| `resume` | 生成 next-day 恢复包与历史快照管理 | `rmemo resume digest --format md` |

## 4. 常用子命令一览

### 4.1 `todo`

- `rmemo todo add <text>`：加到 `## Next`
- `rmemo todo block <text>`：加到 `## Blockers`
- `rmemo todo done <n>`：完成第 n 条 Next
- `rmemo todo unblock <n>`：移除第 n 条 Blockers
- `rmemo todo ls`：查看解析结果

### 4.2 `template`

- `rmemo template ls`
- `rmemo template apply web-admin-vue`
- `rmemo template apply miniapp`

### 4.3 `profile`

- `rmemo profile ls`
- `rmemo profile describe web-admin-vue`
- `rmemo profile apply web-admin-vue`
- `rmemo profile check web-admin-vue --format json`
- `rmemo profile upgrade web-admin-vue`

内置 profile：`generic`、`web-admin-vue`、`miniapp`。

### 4.4 `session`

- `rmemo session start --title "功能：用户搜索"`
- `rmemo session note "决策：搜索状态写入 URL"`
- `rmemo session end`
- `rmemo session list`
- `rmemo session show <id>`

### 4.5 `embed`

- `rmemo embed build [--provider mock|openai]`
- `rmemo embed plan --format md|json`
- `rmemo embed status --format md|json`
- `rmemo embed auto [--check]`
- `rmemo embed search <query> --k 8 --min-score 0.15`

说明：`provider=openai` 需要 `OPENAI_API_KEY` 或 `--api-key`。

### 4.6 `resume`

- `rmemo resume`：完整恢复包
- `rmemo resume digest`：精简恢复包
- `rmemo resume history list|save|show|compare|prune`

常见：

```bash
rmemo resume history save --tag before-refactor
rmemo resume history compare <fromId> <toId>
```

### 4.7 `diagnostics` 与 `contract`

- `rmemo diagnostics export --format md|json`
- `rmemo contract check --format json --fail-on any`
- `rmemo contract check --update`（仅在确认契约变更后使用）

### 4.8 `ws`（Monorepo）

`ws` 能力比较大，按用途分组记忆：

- 枚举与单项目执行：
  - `rmemo ws ls`
  - `rmemo ws start <n|dir>`
  - `rmemo ws status <n|dir>`
  - `rmemo ws handoff <n|dir>`
  - `rmemo ws pr <n|dir> --base origin/main`
  - `rmemo ws sync <n|dir> --targets cursor,copilot`

- 批处理：
  - `rmemo ws batch start|status|handoff|pr|sync|embed`
  - `rmemo ws batch focus "query" --save --compare-latest`

- Focus 历史与趋势：
  - `rmemo ws focus-history list|compare|report`
  - `rmemo ws report-history list|show`
  - `rmemo ws trend`
  - `rmemo ws trend show <trendKey>`

- Alerts / RCA / Action：
  - `rmemo ws alerts`
  - `rmemo ws alerts check`
  - `rmemo ws alerts history`
  - `rmemo ws alerts rca`
  - `rmemo ws alerts action-plan`
  - `rmemo ws alerts action-show --action <id>`
  - `rmemo ws alerts action-apply --action <id>`
  - `rmemo ws alerts action-job enqueue|list|show|pause|resume|cancel`

- Board / Pulse 治理：
  - `rmemo ws alerts board create|list|show|update|report|close`
  - `rmemo ws alerts board policy show|set`
  - `rmemo ws alerts board pulse`
  - `rmemo ws alerts board pulse-history`
  - `rmemo ws alerts board pulse-plan`
  - `rmemo ws alerts board pulse-apply`

## 5. 端到端示例流程（用示例项目）

在 `examples/rmemo-demo-web-admin` 内：

### 第 1 步：初始化与首扫

```bash
rmemo init --profile web-admin-vue
rmemo scan --format md
rmemo status --mode full
```

作用：创建记忆底座，确认结构识别是否符合预期。

### 第 2 步：开发期记录

```bash
rmemo todo add "支持手机号筛选"
rmemo todo block "等待后端补充手机号脱敏规则"
rmemo session start --title "用户列表筛选"
rmemo log "约定：筛选参数与分页参数都写入 query"
rmemo session note "实现：增加 keyword + enabled 两个筛选条件"
rmemo session end
```

作用：把“决策、进度、阻塞”结构化沉淀，减少口口相传。

### 第 3 步：收敛质量与交接

```bash
rmemo check --staged
rmemo done --next "补筛选参数 e2e" "今天完成：用户筛选 + 状态切换"
rmemo handoff
rmemo pr --base origin/main
```

作用：保证提交质量，并产出给 AI/同事可直接复用的说明。

### 第 4 步：AI 集成与服务化

```bash
rmemo sync
rmemo integrate antigravity --format md
rmemo serve --token devtoken --port 7357
```

作用：把仓库上下文能力暴露给 IDE Agent、本地自动化工具和 HTTP 调用方。

### 第 5 步：语义检索与问题定位（可选）

```bash
rmemo embed build --provider mock
rmemo focus "为什么用户状态切换会失败"
rmemo embed search "toggleUserStatus error handling"
```

作用：把“文本记忆”升级为“可检索记忆”，提高问题排查效率。

## 6. 与 CI / 团队协作结合

推荐最小门禁：

```bash
rmemo check --staged
rmemo contract check --format json --fail-on any
rmemo diagnostics export --format json
```

如果团队走发布流程，额外结合：

- `RELEASING.md`
- `docs/RELEASE_CHECKLIST.md`

## 7. 常见问题

- `rmemo: command not found`
  - 先执行 `npm i -g @xiaofandegeng/rmemo`，或用 `node /path/to/rmemo/bin/rmemo.js ...`。

- `check` 报错但不清楚改哪里
  - 先看 `.repo-memory/rules.json` 与 `rules.md`，再用 `rmemo check --staged` 缩小范围。

- `embed build --provider openai` 失败
  - 检查 `OPENAI_API_KEY`，或先用 `--provider mock` 验证流程。

- Monorepo 子项目没识别出来
  - 先 `rmemo scan --format md` 看启发式识别结果，再补齐项目结构特征。

## 8. 建议的学习路径

- 第一天：`init -> start -> todo/log -> done -> handoff`
- 第二天：加入 `check --staged`、`pr`、`sync`
- 第三天：加入 `embed/focus`、`serve/mcp`
- Monorepo 团队：重点用 `ws batch`、`ws alerts`、`board pulse`

