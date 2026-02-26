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

test("release-rehearsal marks health steps as timeout failures", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-rehearsal-timeout-"));
  await fs.mkdir(path.join(tmp, "scripts"), { recursive: true });

  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "test-release-rehearsal", version: "9.9.9", type: "module" }, null, 2) + "\n",
    "utf8"
  );

  await fs.writeFile(
    path.join(tmp, "scripts", "release-notes.js"),
    [
      "import fs from 'node:fs/promises';",
      "const outIdx = process.argv.indexOf('--out');",
      "const out = outIdx >= 0 ? process.argv[outIdx + 1] : null;",
      "if (out) await fs.writeFile(out, '# notes\\n', 'utf8');",
      "process.stdout.write('# notes\\n');"
    ].join("\n"),
    "utf8"
  );

  await fs.writeFile(
    path.join(tmp, "scripts", "release-ready.js"),
    [
      "import fs from 'node:fs/promises';",
      "const outIdx = process.argv.indexOf('--out');",
      "const out = outIdx >= 0 ? process.argv[outIdx + 1] : null;",
      "const fmtIdx = process.argv.indexOf('--format');",
      "const fmt = fmtIdx >= 0 ? process.argv[fmtIdx + 1] : 'md';",
      "const body = fmt === 'json' ? JSON.stringify({ ok: true }, null, 2) + '\\n' : '# ready\\n';",
      "if (out) await fs.writeFile(out, body, 'utf8');",
      "process.stdout.write(body);"
    ].join("\n"),
    "utf8"
  );

  await fs.writeFile(
    path.join(tmp, "scripts", "release-health.js"),
    [
      "setTimeout(() => {",
      "  process.stdout.write('{\"ok\":true}\\n');",
      "  process.exit(0);",
      "}, 15000);"
    ].join("\n"),
    "utf8"
  );

  const summaryPath = "artifacts/release-summary.json";
  const r = await runNode(
    [
      path.resolve("scripts/release-rehearsal.js"),
      "--root",
      tmp,
      "--repo",
      "owner/repo",
      "--format",
      "json",
      "--health-timeout-ms",
      "200",
      "--summary-out",
      summaryPath,
      "--skip-tests",
      "--allow-dirty"
    ],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 1, r.err || r.out);
  const report = JSON.parse(r.out);
  const healthMd = report.steps.find((s) => s.name === "release-health-md");
  const healthJson = report.steps.find((s) => s.name === "release-health-json");

  assert.ok(healthMd, "release-health-md step should exist");
  assert.ok(healthJson, "release-health-json step should exist");

  assert.equal(healthMd.status, "fail");
  assert.equal(healthJson.status, "fail");
  assert.equal(healthMd.timedOut, true);
  assert.equal(healthJson.timedOut, true);
  assert.match(String(healthMd.error || ""), /timed out after/);
  assert.match(String(healthJson.error || ""), /timed out after/);
  assert.equal(report.standardized.status, "fail");
  assert.equal(report.standardized.resultCode, "RELEASE_REHEARSAL_SUMMARY_FAIL");
  assert.equal(report.standardized.failureCodes.includes("STEP_TIMEOUT"), true);
  assert.equal(report.summaryFailureCodes.includes("STEP_TIMEOUT"), true);

  const summary = JSON.parse(await fs.readFile(path.join(tmp, summaryPath), "utf8"));
  assert.ok(Array.isArray(summary.failedSteps));
  assert.equal(summary.failedSteps.some((x) => x.category === "timeout"), true);
  assert.ok(Number(summary.failureBreakdown.timeout || 0) >= 1);
  assert.ok(Number(summary.retryableFailures || 0) >= 1);
  assert.ok(Array.isArray(summary.actionHints));
  assert.ok(summary.actionHints.length >= 1);
  assert.equal(summary.standardized.status, "fail");
  assert.equal(summary.standardized.resultCode, "RELEASE_REHEARSAL_SUMMARY_FAIL");
  assert.equal(summary.standardized.failureCodes.includes("STEP_TIMEOUT"), true);
});

test("release-rehearsal passes github retry flags to release-health steps", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-rehearsal-retry-flags-"));
  await fs.mkdir(path.join(tmp, "scripts"), { recursive: true });

  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "test-release-rehearsal", version: "9.9.9", type: "module" }, null, 2) + "\n",
    "utf8"
  );

  await fs.writeFile(
    path.join(tmp, "scripts", "release-notes.js"),
    [
      "import fs from 'node:fs/promises';",
      "const outIdx = process.argv.indexOf('--out');",
      "const out = outIdx >= 0 ? process.argv[outIdx + 1] : null;",
      "if (out) await fs.writeFile(out, '# notes\\n', 'utf8');",
      "process.stdout.write('# notes\\n');"
    ].join("\n"),
    "utf8"
  );

  await fs.writeFile(
    path.join(tmp, "scripts", "release-ready.js"),
    [
      "import fs from 'node:fs/promises';",
      "const outIdx = process.argv.indexOf('--out');",
      "const out = outIdx >= 0 ? process.argv[outIdx + 1] : null;",
      "const fmtIdx = process.argv.indexOf('--format');",
      "const fmt = fmtIdx >= 0 ? process.argv[fmtIdx + 1] : 'md';",
      "const body = fmt === 'json' ? JSON.stringify({ ok: true }, null, 2) + '\\n' : '# ready\\n';",
      "if (out) await fs.writeFile(out, body, 'utf8');",
      "process.stdout.write(body);"
    ].join("\n"),
    "utf8"
  );

  await fs.writeFile(
    path.join(tmp, "scripts", "release-health.js"),
    [
      "import fs from 'node:fs/promises';",
      "import path from 'node:path';",
      "const args = process.argv.slice(2);",
      "const logFile = path.resolve('artifacts', 'health-args.log');",
      "await fs.mkdir(path.dirname(logFile), { recursive: true });",
      "await fs.appendFile(logFile, JSON.stringify(args) + '\\n', 'utf8');",
      "const fmtIdx = args.indexOf('--format');",
      "const fmt = fmtIdx >= 0 ? args[fmtIdx + 1] : 'md';",
      "if (fmt === 'json') {",
      "  process.stdout.write(JSON.stringify({ ok: true, assets: [{ name: 'rmemo-9.9.9.tgz' }] }, null, 2) + '\\n');",
      "} else {",
      "  process.stdout.write('# health\\n- status: OK\\n');",
      "}"
    ].join("\n"),
    "utf8"
  );

  const r = await runNode(
    [
      path.resolve("scripts/release-rehearsal.js"),
      "--root",
      tmp,
      "--repo",
      "owner/repo",
      "--format",
      "json",
      "--health-timeout-ms",
      "2000",
      "--health-github-retries",
      "5",
      "--health-github-retry-delay-ms",
      "123",
      "--skip-tests",
      "--allow-dirty"
    ],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 0, r.err || r.out);

  const argsLogPath = path.join(tmp, "artifacts", "health-args.log");
  const lines = String(await fs.readFile(argsLogPath, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  assert.equal(lines.length, 2);
  for (const args of lines) {
    const timeoutIdx = args.indexOf("--timeout-ms");
    const retryIdx = args.indexOf("--github-retries");
    const delayIdx = args.indexOf("--github-retry-delay-ms");
    assert.notEqual(timeoutIdx, -1);
    assert.notEqual(retryIdx, -1);
    assert.notEqual(delayIdx, -1);
    assert.equal(args[timeoutIdx + 1], "2000");
    assert.equal(args[retryIdx + 1], "5");
    assert.equal(args[delayIdx + 1], "123");
  }

  const formats = lines
    .map((args) => {
      const formatIdx = args.indexOf("--format");
      return formatIdx >= 0 ? args[formatIdx + 1] : "";
    })
    .sort();
  assert.deepEqual(formats, ["json", "md"]);
});

test("release-rehearsal summary aggregates standardized failure codes from release-health", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-rehearsal-health-codes-"));
  await fs.mkdir(path.join(tmp, "scripts"), { recursive: true });

  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "test-release-rehearsal", version: "9.9.9", type: "module" }, null, 2) + "\n",
    "utf8"
  );

  await fs.writeFile(path.join(tmp, "scripts", "release-notes.js"), "process.stdout.write('# notes\\n');\n", "utf8");
  await fs.writeFile(path.join(tmp, "scripts", "release-ready.js"), "process.stdout.write('# ready\\n');\n", "utf8");

  await fs.writeFile(
    path.join(tmp, "scripts", "release-health.js"),
    [
      "const args = process.argv.slice(2);",
      "const fmtIdx = args.indexOf('--format');",
      "const fmt = fmtIdx >= 0 ? args[fmtIdx + 1] : 'md';",
      "if (fmt === 'json') {",
      "  process.stdout.write(JSON.stringify({",
      "    ok: false,",
      "    standardized: {",
      "      status: 'fail',",
      "      resultCode: 'RELEASE_HEALTH_FAIL',",
      "      failureCodes: ['GITHUB_RELEASE_HTTP_5XX', 'RELEASE_ASSET_CHECK_BLOCKED'],",
      "      failures: [",
      "        { check: 'githubRelease', code: 'GITHUB_RELEASE_HTTP_5XX', message: 'service unavailable', retryable: true }",
      "      ]",
      "    }",
      "  }, null, 2) + '\\n');",
      "  process.exit(1);",
      "}",
      "process.stdout.write('# health\\n- status: FAIL\\n');",
      "process.exit(1);"
    ].join("\n"),
    "utf8"
  );

  const summaryPath = "artifacts/release-summary.json";
  const r = await runNode(
    [
      path.resolve("scripts/release-rehearsal.js"),
      "--root",
      tmp,
      "--repo",
      "owner/repo",
      "--format",
      "json",
      "--summary-out",
      summaryPath,
      "--skip-tests",
      "--allow-dirty"
    ],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 1, r.err || r.out);
  const summary = JSON.parse(await fs.readFile(path.join(tmp, summaryPath), "utf8"));
  assert.equal(summary.health.resultCode, "RELEASE_HEALTH_FAIL");
  assert.equal(summary.health.failureCodes.includes("GITHUB_RELEASE_HTTP_5XX"), true);
  assert.equal(summary.health.failureCodes.includes("RELEASE_ASSET_CHECK_BLOCKED"), true);
  assert.equal(summary.summaryFailureCodes.includes("GITHUB_RELEASE_HTTP_5XX"), true);
  assert.equal(summary.summaryFailureCodes.includes("RELEASE_ASSET_CHECK_BLOCKED"), true);
  assert.equal(summary.standardized.failureCodes.includes("GITHUB_RELEASE_HTTP_5XX"), true);
  assert.equal(summary.standardized.failures.some((x) => x.category === "health" && x.code === "GITHUB_RELEASE_HTTP_5XX"), true);
  assert.equal(summary.failedSteps.some((x) => typeof x.code === "string"), true);
  assert.equal(summary.archive, null);
});

test("release-rehearsal writes compact summary report when summary-out is provided", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-rehearsal-summary-"));
  await fs.mkdir(path.join(tmp, "scripts"), { recursive: true });

  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "test-release-rehearsal", version: "9.9.9", type: "module" }, null, 2) + "\n",
    "utf8"
  );

  await fs.writeFile(
    path.join(tmp, "scripts", "release-notes.js"),
    "process.stdout.write('# notes\\n');\n",
    "utf8"
  );

  await fs.writeFile(
    path.join(tmp, "scripts", "release-ready.js"),
    [
      "const fmtIdx = process.argv.indexOf('--format');",
      "const fmt = fmtIdx >= 0 ? process.argv[fmtIdx + 1] : 'md';",
      "if (fmt === 'json') process.stdout.write(JSON.stringify({ ok: true }) + '\\n');",
      "else process.stdout.write('# ready\\n');"
    ].join("\n"),
    "utf8"
  );

  await fs.writeFile(
    path.join(tmp, "scripts", "release-health.js"),
    [
      "const fmtIdx = process.argv.indexOf('--format');",
      "const fmt = fmtIdx >= 0 ? process.argv[fmtIdx + 1] : 'md';",
      "if (fmt === 'json') process.stdout.write(JSON.stringify({ ok: true }) + '\\n');",
      "else process.stdout.write('# health\\n- status: OK\\n');"
    ].join("\n"),
    "utf8"
  );

  const summaryPath = "artifacts/release-summary.json";
  const r = await runNode(
    [
      path.resolve("scripts/release-rehearsal.js"),
      "--root",
      tmp,
      "--repo",
      "owner/repo",
      "--format",
      "json",
      "--summary-out",
      summaryPath,
      "--skip-tests",
      "--allow-dirty"
    ],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 0, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.standardized.status, "pass");
  assert.equal(report.standardized.resultCode, "RELEASE_REHEARSAL_SUMMARY_OK");
  assert.deepEqual(report.summaryFailureCodes, []);
  const summary = JSON.parse(await fs.readFile(path.join(tmp, summaryPath), "utf8"));
  assert.equal(summary.ok, true);
  assert.equal(summary.version, "9.9.9");
  assert.equal(summary.summary.fail, 0);
  assert.equal(summary.failedSteps.length, 0);
  assert.equal(summary.standardized.status, "pass");
  assert.equal(summary.standardized.resultCode, "RELEASE_REHEARSAL_SUMMARY_OK");
  assert.deepEqual(summary.standardized.failureCodes, []);
});

test("release-rehearsal runs archive step and auto-writes default summary when archive is enabled", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-rehearsal-archive-ok-"));
  await fs.mkdir(path.join(tmp, "scripts"), { recursive: true });

  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "test-release-rehearsal", version: "9.9.9", type: "module" }, null, 2) + "\n",
    "utf8"
  );

  await fs.writeFile(path.join(tmp, "scripts", "release-notes.js"), "process.stdout.write('# notes\\n');\n", "utf8");

  await fs.writeFile(
    path.join(tmp, "scripts", "release-ready.js"),
    [
      "const fmtIdx = process.argv.indexOf('--format');",
      "const fmt = fmtIdx >= 0 ? process.argv[fmtIdx + 1] : 'md';",
      "if (fmt === 'json') process.stdout.write(JSON.stringify({ ok: true }) + '\\n');",
      "else process.stdout.write('# ready\\n');"
    ].join("\n"),
    "utf8"
  );

  await fs.writeFile(
    path.join(tmp, "scripts", "release-health.js"),
    [
      "const fmtIdx = process.argv.indexOf('--format');",
      "const fmt = fmtIdx >= 0 ? process.argv[fmtIdx + 1] : 'md';",
      "if (fmt === 'json') process.stdout.write(JSON.stringify({ ok: true }) + '\\n');",
      "else process.stdout.write('# health\\n- status: OK\\n');"
    ].join("\n"),
    "utf8"
  );

  await fs.writeFile(
    path.join(tmp, "scripts", "release-archive.js"),
    [
      "import fs from 'node:fs/promises';",
      "import path from 'node:path';",
      "const args = process.argv.slice(2);",
      "const snapshotIdx = args.indexOf('--snapshot-id');",
      "const snapshotId = snapshotIdx >= 0 ? args[snapshotIdx + 1] : 'default_snapshot';",
      "const artifactsIdx = args.indexOf('--artifacts-dir');",
      "const artifactsDir = artifactsIdx >= 0 ? args[artifactsIdx + 1] : path.resolve('artifacts');",
      "await fs.mkdir(artifactsDir, { recursive: true });",
      "await fs.writeFile(path.join(artifactsDir, 'archive-args.log'), JSON.stringify(args) + '\\n', 'utf8');",
      "const hasRehearsal = await fs.stat(path.join(artifactsDir, 'release-rehearsal.json')).then(() => true).catch(() => false);",
      "const hasSummary = await fs.stat(path.join(artifactsDir, 'release-summary.json')).then(() => true).catch(() => false);",
      "process.stdout.write(JSON.stringify({ ok: true, snapshotId, hasRehearsal, hasSummary }, null, 2) + '\\n');"
    ].join("\n"),
    "utf8"
  );

  await fs.writeFile(
    path.join(tmp, "scripts", "release-archive-find.js"),
    [
      "import fs from 'node:fs/promises';",
      "import path from 'node:path';",
      "const args = process.argv.slice(2);",
      "await fs.writeFile(path.resolve('artifacts', 'archive-find-args.log'), JSON.stringify(args) + '\\n', 'utf8');",
      "const requireIdx = args.indexOf('--require-files');",
      "const required = requireIdx >= 0 ? String(args[requireIdx + 1] || '').split(',').filter(Boolean) : [];",
      "process.stdout.write(JSON.stringify({ ok: true, requiredFiles: required, missingRequiredFiles: [] }, null, 2) + '\\n');"
    ].join("\n"),
    "utf8"
  );

  const r = await runNode(
    [
      path.resolve("scripts/release-rehearsal.js"),
      "--root",
      tmp,
      "--repo",
      "owner/repo",
      "--format",
      "json",
      "--archive",
      "--archive-snapshot-id",
      "20260225_130000",
      "--archive-retention-days",
      "45",
      "--archive-max-snapshots-per-version",
      "8",
      "--archive-verify",
      "--archive-require-files",
      "release-ready.json,release-health.json,release-rehearsal.json",
      "--skip-tests",
      "--allow-dirty"
    ],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 0, r.err || r.out);
  const report = JSON.parse(r.out);
  const archiveStep = report.steps.find((s) => s.name === "release-archive");
  const archiveVerifyStep = report.steps.find((s) => s.name === "release-archive-verify");
  assert.ok(archiveStep);
  assert.ok(archiveVerifyStep);
  assert.equal(archiveStep.status, "pass");
  assert.equal(archiveVerifyStep.status, "pass");
  assert.equal(report.options.archive, true);
  assert.equal(report.options.archiveVerify, true);
  assert.match(String(report.options.summaryOut || ""), /artifacts\/release-summary\.json$/);

  const archiveReport = JSON.parse(await fs.readFile(path.join(tmp, "artifacts", "release-archive.json"), "utf8"));
  assert.equal(archiveReport.ok, true);
  assert.equal(archiveReport.snapshotId, "20260225_130000");
  assert.equal(archiveReport.hasRehearsal, true);
  assert.equal(archiveReport.hasSummary, true);

  const archiveArgs = JSON.parse(await fs.readFile(path.join(tmp, "artifacts", "archive-args.log"), "utf8"));
  assert.ok(archiveArgs.includes("--retention-days"));
  assert.ok(archiveArgs.includes("--max-snapshots-per-version"));
  assert.ok(archiveArgs.includes("--snapshot-id"));

  const archiveVerifyReport = JSON.parse(await fs.readFile(path.join(tmp, "artifacts", "release-archive-verify.json"), "utf8"));
  assert.equal(archiveVerifyReport.ok, true);
  assert.deepEqual(archiveVerifyReport.missingRequiredFiles, []);
  const archiveFindArgs = JSON.parse(await fs.readFile(path.join(tmp, "artifacts", "archive-find-args.log"), "utf8"));
  assert.ok(archiveFindArgs.includes("--snapshot-id"));
  assert.ok(archiveFindArgs.includes("--require-files"));

  const summary = JSON.parse(await fs.readFile(path.join(tmp, "artifacts", "release-summary.json"), "utf8"));
  assert.equal(summary.archive.archiveStep.ok, true);
  assert.equal(summary.archive.verify.ok, true);
  assert.equal(summary.archive.snapshotId, "20260225_130000");
  assert.deepEqual(summary.archive.verify.missingRequiredFiles, []);
});

test("release-rehearsal fails when archive step fails", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-rehearsal-archive-fail-"));
  await fs.mkdir(path.join(tmp, "scripts"), { recursive: true });

  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "test-release-rehearsal", version: "9.9.9", type: "module" }, null, 2) + "\n",
    "utf8"
  );

  await fs.writeFile(path.join(tmp, "scripts", "release-notes.js"), "process.stdout.write('# notes\\n');\n", "utf8");
  await fs.writeFile(path.join(tmp, "scripts", "release-ready.js"), "process.stdout.write('# ready\\n');\n", "utf8");
  await fs.writeFile(path.join(tmp, "scripts", "release-health.js"), "process.stdout.write('{\"ok\":true}\\n');\n", "utf8");
  await fs.writeFile(
    path.join(tmp, "scripts", "release-archive.js"),
    [
      "process.stdout.write(JSON.stringify({ ok: false, error: 'archive failed' }) + '\\n');",
      "process.exit(1);"
    ].join("\n"),
    "utf8"
  );

  const r = await runNode(
    [
      path.resolve("scripts/release-rehearsal.js"),
      "--root",
      tmp,
      "--repo",
      "owner/repo",
      "--format",
      "json",
      "--archive",
      "--skip-tests",
      "--allow-dirty"
    ],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 1, r.err || r.out);
  const report = JSON.parse(r.out);
  const archiveStep = report.steps.find((s) => s.name === "release-archive");
  assert.ok(archiveStep);
  assert.equal(archiveStep.status, "fail");
  assert.ok(report.summary.fail >= 1);

  const summary = JSON.parse(await fs.readFile(path.join(tmp, "artifacts", "release-summary.json"), "utf8"));
  assert.equal(summary.failedSteps.some((x) => x.category === "archive"), true);
  assert.ok(Number(summary.failureBreakdown.archive || 0) >= 1);
  assert.equal(Number(summary.retryableFailures || 0) >= 1, false);
});

test("release-rehearsal fails when archive verify step fails", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-rehearsal-archive-verify-fail-"));
  await fs.mkdir(path.join(tmp, "scripts"), { recursive: true });

  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "test-release-rehearsal", version: "9.9.9", type: "module" }, null, 2) + "\n",
    "utf8"
  );

  await fs.writeFile(path.join(tmp, "scripts", "release-notes.js"), "process.stdout.write('# notes\\n');\n", "utf8");
  await fs.writeFile(path.join(tmp, "scripts", "release-ready.js"), "process.stdout.write('# ready\\n');\n", "utf8");
  await fs.writeFile(path.join(tmp, "scripts", "release-health.js"), "process.stdout.write('{\"ok\":true}\\n');\n", "utf8");
  await fs.writeFile(
    path.join(tmp, "scripts", "release-archive.js"),
    [
      "process.stdout.write(JSON.stringify({ ok: true, snapshotId: '20260225_131000' }) + '\\n');",
      "process.exit(0);"
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(tmp, "scripts", "release-archive-find.js"),
    [
      "process.stdout.write(JSON.stringify({ ok: false, requiredFiles: ['release-ready.json','release-health.json','release-rehearsal.json'], missingRequiredFiles: ['release-health.json'] }) + '\\n');",
      "process.exit(1);"
    ].join("\n"),
    "utf8"
  );

  const r = await runNode(
    [
      path.resolve("scripts/release-rehearsal.js"),
      "--root",
      tmp,
      "--repo",
      "owner/repo",
      "--format",
      "json",
      "--archive",
      "--archive-verify",
      "--archive-require-files",
      "release-ready.json,release-health.json,release-rehearsal.json",
      "--skip-tests",
      "--allow-dirty"
    ],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 1, r.err || r.out);
  const report = JSON.parse(r.out);
  const archiveVerifyStep = report.steps.find((s) => s.name === "release-archive-verify");
  assert.ok(archiveVerifyStep);
  assert.equal(archiveVerifyStep.status, "fail");
  assert.equal(report.standardized.status, "fail");
  assert.equal(report.standardized.failureCodes.includes("RELEASE_ARCHIVE_VERIFY_FAILED"), true);

  const summary = JSON.parse(await fs.readFile(path.join(tmp, "artifacts", "release-summary.json"), "utf8"));
  assert.equal(summary.failedSteps.some((x) => x.name === "release-archive-verify"), true);
  assert.ok(Number(summary.failureBreakdown.archive || 0) >= 1);
  assert.equal(summary.summaryFailureCodes.includes("RELEASE_ARCHIVE_VERIFY_FAILED"), true);
  assert.equal(summary.archive.archiveStep.ok, true);
  assert.equal(summary.archive.verify.ok, false);
  assert.equal(summary.archive.verify.missingRequiredFiles.includes("release-health.json"), true);
  assert.equal(summary.standardized.status, "fail");
  assert.equal(summary.standardized.checkStatuses["release-archive-verify"], "fail");
  assert.equal(summary.standardized.failureCodes.includes("RELEASE_ARCHIVE_VERIFY_FAILED"), true);
});
