# 使用方式（配合 AI 开发）

这份文档给出一个可落地的日常工作流：用 `rmemo` 固化项目记忆，然后把 Context Pack 喂给任何 AI 工具。

## 每日工作流

### 开工

在你的项目仓库里执行：

```bash
node /path/to/rmemo/bin/rmemo.js --root . start
```

你应该粘贴给 AI 的内容：
1. 粘贴 `.repo-memory/context.md`
2. 可选：再粘贴 `rmemo start` 输出的 Status（当前 Next/Blockers/结构提示）

小提示：
- `--mode brief` 下的 Status 会给 Next/Blockers 编号，对应 `rmemo todo done|unblock <n>` 的序号。

### 开发过程中

记录关键决策（短、明确、可执行）：

```bash
node /path/to/rmemo/bin/rmemo.js --root . log "决策：错误码统一从后端枚举生成"
```

维护下一步与阻塞（不想打开文件改就用命令）：

```bash
node /path/to/rmemo/bin/rmemo.js --root . todo add "实现用户搜索筛选"
node /path/to/rmemo/bin/rmemo.js --root . todo block "等待后端接口契约"
```

### 收工

写总结，并把“明天第一步”写进 todos：

```bash
node /path/to/rmemo/bin/rmemo.js --root . done --next "明天：实现搜索筛选 UI" "今天：完成列表页；重构表格组件"
```

## 规则（防止 AI 漂移）

维护：
- `.repo-memory/rules.md`（人类可读规则）
- `.repo-memory/rules.json`（可执行检查）

执行：

```bash
node /path/to/rmemo/bin/rmemo.js --root . check
```

安装 git pre-commit（更快，只检查暂存区）：

```bash
node /path/to/rmemo/bin/rmemo.js --root . hook install
```

## 同步到 AI 工具指令文件

如果你使用的 AI 工具支持“仓库内指令文件”，可以从 `.repo-memory/` 生成同步：

```bash
node /path/to/rmemo/bin/rmemo.js --root . sync
```

CI / 检查模式（不写文件）：

```bash
node /path/to/rmemo/bin/rmemo.js --root . --check sync
```

## 一次性初始化（hooks + 配置）

如果目标仓库是 git 仓库，可以开启“默认一直生效”的工作流：

```bash
node /path/to/rmemo/bin/rmemo.js --root . setup
```

说明：
- `pre-commit` 会阻止不符合 `rules.json` 的提交（`rmemo check --staged`）。
- 其它 hooks 用于保持 AI 指令文件更新（`rmemo sync`，不阻塞提交/切分支等操作）。

审计检查 / CI：

```bash
node /path/to/rmemo/bin/rmemo.js --root . --check setup
```

卸载：

```bash
node /path/to/rmemo/bin/rmemo.js --root . --uninstall setup
node /path/to/rmemo/bin/rmemo.js --root . --uninstall --remove-config setup
```

## 一份文件的交接包（可直接粘贴）

如果你更喜欢“一次性粘贴一份”，生成 handoff 文件：

```bash
node /path/to/rmemo/bin/rmemo.js --root . handoff
```

它会先更新 scan/context，然后把 handoff markdown 打印到 stdout，并写入 `.repo-memory/handoff.md`。

## PR 摘要（可直接粘贴）

生成一段 PR 描述内容：

```bash
node /path/to/rmemo/bin/rmemo.js --root . pr
```

如果 base 分支识别不对，可以显式传 `--base`：

```bash
node /path/to/rmemo/bin/rmemo.js --root . --base origin/main pr
```

## 小建议

- `rules.md` 尽量控制在 10-20 条强约束。
- 把模块边界写清楚，例如“禁止跨模块 import”。
- AI 迷路时，重新生成并粘贴一次：`rmemo context`。
