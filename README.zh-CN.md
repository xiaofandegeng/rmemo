# rmemo

面向任意代码仓库的“项目记忆 + 开发日志”CLI。

`rmemo` 会扫描仓库、把规则和进度沉淀到 `.repo-memory/`，并生成可直接给 AI 使用的上下文包，减少跨天开发丢失上下文。

[English](./README.md) | [简体中文](./README.zh-CN.md)

## 安装

```bash
npm i -g @xiaofandegeng/rmemo
```

## 5 分钟上手

在你的项目根目录执行：

```bash
rmemo init --auto
rmemo start
rmemo done "今天完成了什么"
rmemo handoff
```

如果不想全局安装：

```bash
node /path/to/rmemo/bin/rmemo.js --root /path/to/your-repo init
```

## 日常工作流

```bash
rmemo start
rmemo check --staged
rmemo done "今天变更 / 下一步"
rmemo handoff
rmemo pr --base origin/main
```

建议一次性执行：

```bash
rmemo setup
```

会自动配置 sync 目标和 git hooks（`pre-commit`、`post-commit`、`post-merge`、`post-checkout`）。

## 关键产物

`rmemo` 主要维护 `.repo-memory/` 下这些文件：

- `rules.md`：团队/项目约定
- `todos.md`：下一步与阻塞
- `journal/YYYY-MM-DD.md`：每日进展日志
- `context.md`：AI 上下文包
- `manifest.json` / `index.json`：项目扫描元数据

## 集成能力

同步 AI 指令文件：

```bash
rmemo sync
rmemo sync --check
```

本地 HTTP 服务（面板 + API）：

```bash
rmemo serve --root . --token devtoken --port 7357
```

以 MCP Server 方式运行：

```bash
rmemo mcp --root .
rmemo mcp --root . --allow-write
```

可选语义检索：

```bash
rmemo embed build
rmemo embed search "auth token refresh"
```

Monorepo 支持：

```bash
rmemo ws ls
rmemo ws batch handoff
```

## 稳定性契约

从 `v1.0.0+` 开始：

- CLI 命令名和已存在参数在次版本内保持稳定。
- HTTP/MCP 响应结构向后兼容（可新增字段，不破坏旧字段）。
- `.repo-memory` 目录结构可稳定用于自动化。

## 发版与质量校验

常用校验命令：

```bash
node --test
npm run pack:dry
npm run verify:release-ready
```

完整发版流程请看：

- [发版说明](./RELEASING.md)
- [发布检查清单](./docs/RELEASE_CHECKLIST.md)

## 文档入口

- [文档索引](./docs/INDEX.md)
- [完整使用说明（含示例项目）](./docs/COMPLETE_USAGE_GUIDE.zh-CN.md)
- [使用方式（AI 协作）](./docs/USAGE.zh-CN.md)
- [PR 自动化](./docs/PR_AUTOMATION.zh-CN.md)
- [接口契约（Contracts）](./docs/CONTRACTS.md)
- [回归矩阵（Regression Matrix）](./docs/REGRESSION_MATRIX.md)
- [发布说明模板](./docs/RELEASE_NOTES_TEMPLATE.md)
- [升级到 v1.0 指南](./docs/UPGRADING_TO_1_0.md)
- [长期路线（ZH）](./docs/LONG_TERM_ROADMAP.zh-CN.md)
- [示例项目（Web Admin）](./examples/rmemo-demo-web-admin/README.zh-CN.md)
