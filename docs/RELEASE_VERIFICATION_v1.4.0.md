# rmemo v1.4.0 Release Verification

Verification date: 2026-02-25

## 1. Release PR status

- Release PR: `#52` (`chore(main): release 1.4.0`)
- State: `merged`
- Merged at: `2026-02-25T06:49:33Z`
- Merge commit: `0a025dab49b444cbaa8b7bd7c0cf6f31e7741228`

## 2. npm visibility

Command:

```bash
npm view @xiaofandegeng/rmemo@1.4.0 version
```

Result:

```text
1.4.0
```

## 3. GitHub Release visibility and asset naming

Command:

```bash
curl -sL https://github.com/xiaofandegeng/rmemo/releases/expanded_assets/v1.4.0
```

Observed release asset:

- `rmemo-1.4.0.tgz`
- uploaded at: `2026-02-25T06:50:29Z`

Conclusion:

- GitHub Release for `v1.4.0` is visible.
- Expected unscoped asset naming rule is satisfied (`rmemo-<version>.tgz`).
