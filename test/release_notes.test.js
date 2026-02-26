import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { extractReleaseNotesFromChangelog, buildReleaseNotesMarkdown } from "../src/core/release_notes.js";

function runNode(args, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString("utf8")));
    p.stderr.on("data", (d) => (err += d.toString("utf8")));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

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

test("release-notes script emits standardized json report when section exists", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-notes-json-ok-"));
  await fs.writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "x", version: "1.2.0", type: "module" }) + "\n", "utf8");
  await fs.writeFile(
    path.join(tmp, "CHANGELOG.md"),
    ["# Changelog", "", "## [1.2.0](x) (2026-01-01)", "", "### Features", "", "- add a"].join("\n"),
    "utf8"
  );

  const r = await runNode([path.resolve("scripts/release-notes.js"), "--root", tmp, "--format", "json"], {
    cwd: path.resolve("."),
    env: { ...process.env }
  });

  assert.equal(r.code, 0, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.ok, true);
  assert.equal(report.version, "1.2.0");
  assert.equal(report.hasChangelogSection, true);
  assert.equal(report.standardized.status, "pass");
  assert.equal(report.standardized.resultCode, "RELEASE_NOTES_OK");
  assert.equal(report.standardized.checkStatuses.changelogSection, "pass");
  assert.deepEqual(report.standardized.failureCodes, []);
});

test("release-notes script emits fallback result code when section is missing", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-notes-json-fallback-"));
  await fs.writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "x", version: "1.2.0", type: "module" }) + "\n", "utf8");
  await fs.writeFile(path.join(tmp, "CHANGELOG.md"), "# Changelog\n\n## [1.1.0](x) (2025-12-01)\n", "utf8");

  const r = await runNode([path.resolve("scripts/release-notes.js"), "--root", tmp, "--format", "json"], {
    cwd: path.resolve("."),
    env: { ...process.env }
  });

  assert.equal(r.code, 0, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.ok, true);
  assert.equal(report.hasChangelogSection, false);
  assert.equal(report.standardized.resultCode, "RELEASE_NOTES_FALLBACK");
  assert.equal(report.standardized.checkStatuses.changelogSection, "fail");
  assert.equal(report.standardized.failureCodes.includes("RELEASE_NOTES_CHANGELOG_SECTION_MISSING"), true);
});
