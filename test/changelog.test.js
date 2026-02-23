import test from "node:test";
import assert from "node:assert/strict";
import { analyzeChangelog } from "../src/core/changelog.js";

test("analyzeChangelog reports duplicate versions", () => {
  const md = [
    "# Changelog",
    "",
    "## [1.0.0](x)",
    "- a",
    "",
    "## [1.0.0](x)",
    "- b"
  ].join("\n");
  const r = analyzeChangelog(md);
  assert.equal(r.ok, false);
  assert.equal(r.duplicates.length, 1);
  assert.equal(r.duplicates[0].version, "1.0.0");
});

test("analyzeChangelog reports v-prefix headings", () => {
  const md = ["# Changelog", "", "## [v0.9.0] - 2026-01-01", "- x"].join("\n");
  const r = analyzeChangelog(md);
  assert.equal(r.ok, false);
  assert.equal(r.nonNormalized.length, 1);
  assert.equal(r.nonNormalized[0].version, "v0.9.0");
});

test("analyzeChangelog passes normalized unique headings", () => {
  const md = ["# Changelog", "", "## [1.0.0](x)", "- x", "", "## [0.9.0](x)", "- y"].join("\n");
  const r = analyzeChangelog(md);
  assert.equal(r.ok, true);
});
