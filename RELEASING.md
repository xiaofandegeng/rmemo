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
