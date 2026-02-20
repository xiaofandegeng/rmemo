# Releasing (npm)

This repo includes a GitHub Actions workflow to publish to npm.

## One-time Setup

1. Ensure the npm package name is available.
   - Current name: `@xiaofandegeng/rmemo`
   - If publishing fails due to name conflict, rename `package.json` -> `name`.

2. Add an npm token as a GitHub Actions secret:
   - Secret name: `NPM_TOKEN`
   - Token should have permission to publish the package.
   - If your npm account requires 2FA for publishing, the token must bypass 2FA (Automation token or granular token with bypass enabled).

## Release Workflow

Use the GitHub Actions workflow: `Release`.

Inputs:
- `version`: exact version, e.g. `0.2.0`
- `dist_tag`: npm dist-tag, e.g. `latest` or `next`

What it does:
1. Runs tests
2. Updates `package.json` version (commit + git tag)
3. Pushes commit + tags to `main`
4. Publishes to npm
5. Creates a GitHub Release for the tag (release notes auto-generated)

## Fully Automatic Release (Recommended)

If you want "no GitHub clicking", you have 2 options:

### Option A: Tag-based publishing (one local command)

1. Update version locally (creates a git commit + tag):

```bash
npm version 0.2.0 -m "chore(release): %s"
git push origin main --follow-tags
```

2. GitHub Actions will auto-run workflow `Publish (tag)` on tag push (`v*`) to:
- run tests
- publish to npm (requires `NPM_TOKEN`)
- create a GitHub Release with notes + `.tgz` asset

### Option B: Release Please (auto version PR on merge to main)

If you want releases to be proposed automatically when you push commits to `main`, use `Release Please`.

How it works:
1. You push normal commits to `main`
2. GitHub Actions creates/updates a "release PR" automatically
3. Merge the release PR, then it will create the tag + GitHub Release
4. The same `Release Please` workflow then auto-publishes the new version to npm
   - if that exact version already exists on npm, it skips safely

Note:
- Release Please works best with Conventional Commits (e.g. `feat: ...`, `fix: ...`).
- One-time repo setting required:
  - Settings -> Actions -> General -> Workflow permissions:
    - Read and write permissions
    - Allow GitHub Actions to create and approve pull requests
- `NPM_TOKEN` secret is still required for npm publishing.

## GitHub Releases (Automation)

This repo also includes a workflow `GitHub Release` that:
- can be run manually to backfill releases for existing tags

Backfill example:
1. GitHub -> Actions -> GitHub Release -> Run workflow
2. Input `tag`: `v0.1.0`

## Backfill All Missing Releases (Automation)

If you already have tags but your Releases page is empty, use:
1. GitHub -> Actions -> Backfill GitHub Releases -> Run workflow

This workflow:
- scans tags with a prefix (default: `v`)
- creates GitHub Releases only when missing (safe to re-run)

Notes:
- If a release body is empty, re-run the workflow with `update_existing=true` to populate notes.
- The workflow prefers `CHANGELOG.md` sections when present; otherwise it falls back to a commit list between tags.
