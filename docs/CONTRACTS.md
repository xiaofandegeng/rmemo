# Contracts

`rmemo` stores baseline contract snapshots under `contracts/`:

- `contracts/cli.json`: top-level CLI command contract
- `contracts/http.json`: HTTP route contract from `src/core/serve.js`
- `contracts/mcp.json`: MCP tool-name contract from `src/core/mcp.js`

## Commands

Check for drift:

```bash
rmemo contract check
rmemo contract check --format json
rmemo contract check --fail-on any
```

Update snapshots intentionally (after reviewed contract changes):

```bash
rmemo contract check --update
```

## CI rule

Recommended CI gate:

```bash
rmemo contract check --format json --fail-on any
```

If contract snapshots drift, the command exits non-zero.

## Fail policy

- `--fail-on breaking` (default): only breaking drift blocks checks (removed commands/routes/tools or missing snapshots).
- `--fail-on any`: any drift blocks CI (added or removed).
- `--fail-on none`: report-only mode (never exits non-zero due to drift).
