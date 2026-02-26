import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

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

test("changelog-lint emits standardized pass result for normalized changelog", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-changelog-lint-ok-"));
  await fs.writeFile(path.join(tmp, "CHANGELOG.md"), "# Changelog\n\n## [1.0.0](x)\n- ok\n", "utf8");

  const r = await runNode([path.resolve("scripts/changelog-lint.js"), "--root", tmp, "--format", "json"], {
    cwd: path.resolve("."),
    env: { ...process.env }
  });

  assert.equal(r.code, 0, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.ok, true);
  assert.equal(report.standardized.status, "pass");
  assert.equal(report.standardized.resultCode, "CHANGELOG_LINT_OK");
  assert.deepEqual(report.standardized.failureCodes, []);
  assert.equal(report.standardized.checkStatuses.duplicates, "pass");
  assert.equal(report.standardized.checkStatuses.nonNormalized, "pass");
});

test("changelog-lint emits standardized fail codes for duplicate and non-normalized headings", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-changelog-lint-fail-"));
  await fs.writeFile(
    path.join(tmp, "CHANGELOG.md"),
    "# Changelog\n\n## [v1.0.0](x)\n- a\n\n## [1.0.0](x)\n- b\n",
    "utf8"
  );

  const r = await runNode([path.resolve("scripts/changelog-lint.js"), "--root", tmp, "--format", "json"], {
    cwd: path.resolve("."),
    env: { ...process.env }
  });

  assert.equal(r.code, 1, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.ok, false);
  assert.equal(report.standardized.status, "fail");
  assert.equal(report.standardized.resultCode, "CHANGELOG_LINT_FAIL");
  assert.equal(report.standardized.failureCodes.includes("CHANGELOG_DUPLICATE_VERSION"), true);
  assert.equal(report.standardized.failureCodes.includes("CHANGELOG_NON_NORMALIZED_HEADING"), true);
  assert.equal(report.standardized.checkStatuses.duplicates, "fail");
  assert.equal(report.standardized.checkStatuses.nonNormalized, "fail");
});
