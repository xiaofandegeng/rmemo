# rmemo v1.0.0 Migration Guide

Welcome to `rmemo` v1.0.0! This release marks our **Stability Contract** milestone. It means the core rules, APIs, MCP tool schemas, and `.repo-memory/` directory behaviors are officially frozen and guaranteed to be backward-compatible for all `1.x` releases.

If you are upgrading from `v0.3x` to `v1.0.0`, the transition is designed to be seamless. However, there are a few important details to review.

## 1. Zero Breaking Changes in Local Storage
If you have an existing `.repo-memory` folder, you do **not** need to migrate it. 
`v1.0.0` perfectly understands:
- `context.md`
- `rules.md` (and `rules.json`)
- `todos.md` (and `todos.json`)
- `journal/`
- `ws-focus/`

You can safely upgrade the CLI tool without running any upgrade scripts.

## 2. CLI Commands & Arguments
All CLI commands from `v0.39.0` and `v0.40.0` remain exactly the same.
The primary commands are:
- `rmemo init`
- `rmemo start`
- `rmemo done`
- `rmemo ws focus`
- `rmemo embed build`
- `rmemo mcp`

**Deprecations**:
No commands were deprecated in this release. All flags (`--format`, `--limit`, `--save`) function identically.

## 3. HTTP and MCP API Stability
If you built custom AI scripts interacting with `rmemo serve` or `rmemo mcp`:
- **Response Schemas**: We guarantee that existing JSON keys in responses will not be renamed or removed. 
- **Additive Changes**: We may add new fields to JSON responses in future `1.x` minor releases. Ensure your parsers are permissive and ignore unknown fields.
- **MCP Tools**: Tools like `rmemo_ws_focus` and `rmemo_embed_jobs` are now marked stable. Their argument objects (`q`, `limit`, `format` etc.) are frozen.

## 4. GitHub Actions / CI Pipelines
If you are using `rmemo check` in your CI/CD pipelines, ensure your workflow is using the `latest` version, or explicitly pin to `^1.0.0`.
Since `v0.39.0`, we advise piping `rmemo diagnostics export --format json` on CI failure. This remains the official recommendation for `v1.0.0` pipeline governance.

## 5. What's Next?
Enjoy the stability! You can confidently hardcode `rmemo` tool schemas into your custom LLM agents and Cursor/Cline configurations. We will not break your workflows.
