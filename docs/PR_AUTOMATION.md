# PR Automation

This repo includes a GitHub Actions workflow that runs on `pull_request` and:
- runs tests
- runs `rmemo check`
- generates `.repo-memory/pr.md` and `.repo-memory/handoff.md`
- uploads them as artifacts
- comments on the PR with the generated content (updates in-place)

Workflow file:
- `.github/workflows/pr-assistant.yml`

## Notes

- The workflow uses `github.base_ref` as the PR base branch.
- It requires `pull-requests: write` permission to comment.
- If you prefer artifacts only (no comments), remove the `Comment on PR (rmemo)` step.

## Troubleshooting

- If the workflow cannot find the base ref (e.g. `origin/<base>`), ensure `actions/checkout` uses `fetch-depth: 0`.
