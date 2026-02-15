# rmemo

面向任何代码仓库的“项目记忆 + 开发日志”CLI：自动扫描项目结构，沉淀约定/进度，一键生成可直接粘贴给 AI 的 Context Pack。

[English](./README.md) | [简体中文](./README.zh-CN.md)

文档：
- [使用方式（配合 AI 开发）](./docs/USAGE.zh-CN.md)
- [发布说明](./RELEASING.md)
- [PR 自动化](./docs/PR_AUTOMATION.md)

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
- `GET /status?format=json`
- `GET /context`
- `GET /rules`
- `GET /todos?format=json`
- `GET /search?q=...`（关键字检索）
- `GET /search?mode=semantic&q=...`（语义检索；需要先执行 `rmemo embed build`）

可选：开启写入操作（必须设置 token）：

```bash
rmemo serve --root . --token devtoken --allow-write
```

写入接口：
- `POST /todos/next {text}`
- `POST /todos/blockers {text}`
- `POST /todos/next/done {index}`（从 1 开始）
- `POST /todos/blockers/unblock {index}`（从 1 开始）
- `POST /log {text, kind?}`
- `POST /sync`
- `POST /embed/auto`

## MCP Server（stdio）

如果你的 AI 工具支持 MCP，可以运行：

```bash
rmemo mcp --root .
```

它会暴露一组 tools（示例）：`rmemo_status`、`rmemo_context`、`rmemo_handoff`、`rmemo_pr`、`rmemo_rules`、`rmemo_todos`、`rmemo_search`。

可选：开启写入 tools（出于安全默认关闭）：

```bash
rmemo mcp --root . --allow-write
```

写入 tools：
- `rmemo_todo_add`
- `rmemo_todo_done`
- `rmemo_log`
- `rmemo_sync`
- `rmemo_embed_auto`

## 集成（MCP 配置片段）

有些 IDE/Agent 需要你粘贴一段 JSON 片段来注册 MCP server（并且 GUI 环境里 PATH 可能不完整）。

生成 Antigravity 配置片段（粘贴到 “View raw config”）：

```bash
rmemo integrate antigravity
rmemo integrate antigravity --format json
```

如果你遇到 `Unknown command: mcp`，说明你全局安装的 `rmemo` 太旧；这个片段默认使用 `node` + `bin/rmemo.js` 绝对路径来绕过 PATH/版本冲突。

## 语义检索（Embeddings）

构建本地 embeddings 索引（默认使用确定性的 `mock` provider）：

```bash
rmemo embed build
rmemo embed search "auth token refresh"
```

可选 OpenAI provider：

```bash
export OPENAI_API_KEY=...
rmemo embed build --provider openai --model text-embedding-3-small
rmemo embed search "鉴权在哪里做的？"
```

## Monorepo 工作区（子项目）

如果你的仓库是 monorepo，`rmemo ws` 可以检测子项目并在子项目内执行命令：

```bash
rmemo ws ls
rmemo ws start 1
rmemo ws handoff apps/admin-web
rmemo ws pr apps/admin-web --base origin/main
rmemo ws batch handoff
rmemo ws batch pr --base origin/main
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

## Roadmap（简版）

- v0.2：增强通用扫描（monorepo/子项目/API 契约/文档根目录）
- v0.3：规则能力增强 + 更好的 `check` 输出 + hooks/CI 体验打磨
- v0.4：VS Code 扩展（快速 log/start/done）
