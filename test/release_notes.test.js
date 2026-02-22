import test from "node:test";
import assert from "node:assert/strict";
import { extractReleaseNotesFromChangelog, buildReleaseNotesMarkdown } from "../src/core/release_notes.js";

test("extractReleaseNotesFromChangelog returns matching section", () => {
  const md = [
    "# Changelog",
    "",
    "## [1.2.0](x) (2026-01-01)",
    "",
    "### Features",
    "",
    "- add a",
    "",
    "## [1.1.0](x) (2025-12-01)",
    "",
    "### Fixes",
    "",
    "- fix b"
  ].join("\n");
  const out = extractReleaseNotesFromChangelog(md, "1.2.0");
  assert.ok(out);
  assert.ok(out.includes("### Features"));
  assert.ok(!out.includes("## [1.1.0]"));
});

test("extractReleaseNotesFromChangelog supports v-prefixed heading", () => {
  const md = ["# Changelog", "", "## [v1.0.1] - 2026-02-02", "", "- hello"].join("\n");
  const out = extractReleaseNotesFromChangelog(md, "1.0.1");
  assert.ok(out);
  assert.ok(out.includes("v1.0.1"));
});

test("buildReleaseNotesMarkdown creates fallback content when missing section", () => {
  const out = buildReleaseNotesMarkdown({ version: "1.3.0", changelogSection: null });
  assert.ok(out.includes("## v1.3.0"));
  assert.ok(out.includes("No detailed changelog section"));
});
