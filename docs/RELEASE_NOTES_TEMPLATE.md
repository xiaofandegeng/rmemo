# Release Notes Template

Use this template for GitHub Release body.

Automation:

- `node scripts/release-notes.js --version <x.y.z> --out artifacts/release-notes.md`
- release workflow will auto-sync GitHub Release body from CHANGELOG section when body is empty/placeholder.

## Title

`vX.Y.Z`

## Overview

One paragraph summary of this release and why it matters.

## Highlights

- Feature:
- Improvement:
- Stability/CI:

## Contracts

- Contract check: pass/fail
- Drift type: breaking/additive/none
- Snapshot update: yes/no

## Verification

- `node --test`: pass/fail
- `npm run pack:dry`: pass/fail
- `npm run verify:matrix`: pass/fail (+ skipped if environment constrained)
- `node scripts/release-health.js ...`: pass/fail

## Breaking Changes

- None / List details

## Migration Notes

- For users upgrading from previous version:

## Assets

- Source code (zip)
- Source code (tar.gz)
- npm tarball (`*.tgz`) if uploaded

## Full Changelog

`https://github.com/<owner>/<repo>/compare/v<prev>...vX.Y.Z`
