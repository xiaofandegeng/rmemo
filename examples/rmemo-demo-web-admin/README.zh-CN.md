# rmemo 示例项目：Web Admin

这是一个给 `rmemo` 演示用的最小示例项目，模拟后台管理系统中的“用户管理”页面。

## 目录结构

```text
rmemo-demo-web-admin/
├─ package.json
├─ src/
│  ├─ api/
│  │  └─ user.ts
│  └─ views/
│     └─ user/
│        └─ index.vue
```

## 场景目标

- 维护“用户列表 + 搜索 + 状态切换”功能。
- 演示如何用 `rmemo` 沉淀规则、记录日志、生成交接与 PR 摘要。

## 在这个示例里体验 rmemo

在本目录执行：

```bash
rmemo init --profile web-admin-vue
rmemo start
rmemo todo add "为用户列表增加手机号筛选"
rmemo log "决定：搜索参数使用 URL query 持久化"
rmemo done --next "明天先补分页边界测试" "今天完成：用户状态开关接口联调"
rmemo handoff
rmemo pr --base origin/main
```

可选：

```bash
rmemo embed build --provider mock
rmemo focus "用户状态切换失败排查路径"
```

执行后可在 `.repo-memory/` 查看规则、待办、日志、交接文档与上下文包。
