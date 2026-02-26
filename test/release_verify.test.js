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

test("release-verify succeeds when release-health converges within wait window", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-verify-success-"));
  await fs.mkdir(path.join(tmp, "scripts"), { recursive: true });
  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "@test/release-verify", version: "9.9.9", type: "module" }, null, 2) + "\n",
    "utf8"
  );

  await fs.writeFile(
    path.join(tmp, "scripts", "release-health.js"),
    [
      "import fs from 'node:fs/promises';",
      "import path from 'node:path';",
      "const stateFile = path.join(process.cwd(), 'state.json');",
      "let count = 0;",
      "try {",
      "  const prev = JSON.parse(await fs.readFile(stateFile, 'utf8'));",
      "  count = Number(prev.count || 0);",
      "} catch {}",
      "count += 1;",
      "await fs.writeFile(stateFile, JSON.stringify({ count }), 'utf8');",
      "const ok = count >= 2;",
      "const report = {",
      "  schema: 1,",
      "  generatedAt: new Date().toISOString(),",
      "  checks: {",
      "    npm: { ok },",
      "    githubRelease: { ok },",
      "    releaseAssets: { ok }",
      "  },",
      "  ok",
      "};",
      "process.stdout.write(JSON.stringify(report) + '\\n');",
      "if (!ok) process.exitCode = 1;"
    ].join("\n"),
    "utf8"
  );

  const r = await runNode(
    [
      path.resolve("scripts/release-verify.js"),
      "--root",
      tmp,
      "--repo",
      "owner/repo",
      "--version",
      "9.9.9",
      "--tag",
      "v9.9.9",
      "--format",
      "json",
      "--max-wait-ms",
      "1000",
      "--poll-interval-ms",
      "10",
      "--health-timeout-ms",
      "1000",
      "--health-github-retries",
      "0",
      "--health-github-retry-delay-ms",
      "0"
    ],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 0, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.ok, true);
  assert.equal(report.attempts, 2);
  assert.equal(report.lastCheck.ok, true);
  assert.equal(report.standardized.status, "pass");
  assert.equal(report.standardized.resultCode, "RELEASE_VERIFY_OK");
  assert.equal(report.standardized.checkStatuses.convergence, "pass");
  assert.deepEqual(report.standardized.failureCodes, []);
});

test("release-verify supports --version current alias and derives tag from resolved version", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-verify-current-version-"));
  await fs.mkdir(path.join(tmp, "scripts"), { recursive: true });
  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "@test/release-verify", version: "2.3.4", type: "module" }, null, 2) + "\n",
    "utf8"
  );

  await fs.writeFile(
    path.join(tmp, "scripts", "release-health.js"),
    [
      "import fs from 'node:fs/promises';",
      "import path from 'node:path';",
      "const args = process.argv.slice(2);",
      "await fs.writeFile(path.join(process.cwd(), 'health-args.json'), JSON.stringify(args, null, 2) + '\\n', 'utf8');",
      "process.stdout.write(JSON.stringify({",
      "  schema: 1,",
      "  ok: true,",
      "  checks: { npm: { ok: true }, githubRelease: { ok: true }, releaseAssets: { ok: true } },",
      "  standardized: { status: 'pass', resultCode: 'RELEASE_HEALTH_OK', checkStatuses: { npm: 'pass', githubRelease: 'pass', releaseAssets: 'pass' }, failureCodes: [], failures: [] }",
      "}) + '\\n');"
    ].join("\n"),
    "utf8"
  );

  const r = await runNode(
    [
      path.resolve("scripts/release-verify.js"),
      "--root",
      tmp,
      "--repo",
      "owner/repo",
      "--version",
      "current",
      "--format",
      "json",
      "--max-wait-ms",
      "500",
      "--poll-interval-ms",
      "10",
      "--health-timeout-ms",
      "1000",
      "--health-github-retries",
      "0",
      "--health-github-retry-delay-ms",
      "0"
    ],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 0, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.version, "2.3.4");
  assert.equal(report.tag, "v2.3.4");
  assert.equal(report.ok, true);

  const healthArgs = JSON.parse(await fs.readFile(path.join(tmp, "health-args.json"), "utf8"));
  const versionIdx = healthArgs.indexOf("--version");
  const tagIdx = healthArgs.indexOf("--tag");
  assert.notEqual(versionIdx, -1);
  assert.notEqual(tagIdx, -1);
  assert.equal(healthArgs[versionIdx + 1], "2.3.4");
  assert.equal(healthArgs[tagIdx + 1], "v2.3.4");
});

test("release-verify fails when max wait window is exhausted", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-verify-timeout-"));
  await fs.mkdir(path.join(tmp, "scripts"), { recursive: true });
  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "@test/release-verify", version: "9.9.9", type: "module" }, null, 2) + "\n",
    "utf8"
  );

  await fs.writeFile(
    path.join(tmp, "scripts", "release-health.js"),
    [
      "const report = {",
      "  schema: 1,",
      "  generatedAt: new Date().toISOString(),",
      "  checks: {",
      "    npm: { ok: false, error: 'not ready' },",
      "    githubRelease: { ok: false, error: 'not ready' },",
      "    releaseAssets: { ok: false, error: 'not ready' }",
      "  },",
      "  ok: false",
      "};",
      "process.stdout.write(JSON.stringify(report) + '\\n');",
      "process.exitCode = 1;"
    ].join("\n"),
    "utf8"
  );

  const r = await runNode(
    [
      path.resolve("scripts/release-verify.js"),
      "--root",
      tmp,
      "--repo",
      "owner/repo",
      "--version",
      "9.9.9",
      "--tag",
      "v9.9.9",
      "--format",
      "json",
      "--max-wait-ms",
      "200",
      "--poll-interval-ms",
      "50",
      "--health-timeout-ms",
      "1000",
      "--health-github-retries",
      "0",
      "--health-github-retry-delay-ms",
      "0"
    ],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 1, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.ok, false);
  assert.ok(report.attempts >= 2);
  assert.equal(report.lastCheck.ok, false);
  assert.equal(report.standardized.status, "fail");
  assert.equal(report.standardized.resultCode, "RELEASE_VERIFY_FAIL");
  assert.equal(report.standardized.checkStatuses.convergence, "fail");
  assert.equal(report.standardized.failureCodes.includes("RELEASE_VERIFY_CONVERGENCE_TIMEOUT"), true);
  assert.equal(report.standardized.failures.some((x) => x.code === "RELEASE_VERIFY_CONVERGENCE_TIMEOUT"), true);
});
