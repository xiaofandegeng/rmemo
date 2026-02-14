# PR 自动化

本仓库提供一个 GitHub Actions 工作流（`pull_request` 触发），用于：
- 跑测试
- 执行 `rmemo check`
- 生成 `.repo-memory/pr.md` 与 `.repo-memory/handoff.md`
- 上传为 artifacts
- 自动在 PR 下留言（会覆盖更新同一条评论）

工作流文件：
- `.github/workflows/pr-assistant.yml`

说明：
- base 分支来自 `github.base_ref`。
- 评论需要 `pull-requests: write` 权限。
- 如果你只想要 artifacts、不想自动评论，删除 `Comment on PR (rmemo)` 这一步即可。

## 排查

- 如果工作流找不到 base ref（例如 `origin/<base>` 不存在），确认 `actions/checkout` 设置了 `fetch-depth: 0`。
