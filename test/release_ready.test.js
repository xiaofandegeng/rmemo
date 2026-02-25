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

function runCmd(bin, args, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString("utf8")));
    p.stderr.on("data", (d) => (err += d.toString("utf8")));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

async function writeExecutable(filePath, content) {
  await fs.writeFile(filePath, content, "utf8");
  await fs.chmod(filePath, 0o755);
}

async function setupReleaseReadyFixture({ matrixFails = false } = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-ready-"));
  const binDir = path.join(tmp, "tools");
  await fs.mkdir(binDir, { recursive: true });
  await fs.mkdir(path.join(tmp, "bin"), { recursive: true });

  await fs.writeFile(
    path.join(tmp, "bin", "rmemo.js"),
    [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "if (args[0] === 'contract' && args[1] === 'check') {",
      "  process.stdout.write('{\"ok\":true}\\n');",
      "  process.exit(0);",
      "}",
      "process.exit(0);"
    ].join("\n"),
    "utf8"
  );
  await fs.chmod(path.join(tmp, "bin", "rmemo.js"), 0o755);

  const fakeNpm = [
    "#!/usr/bin/env bash",
    "if [[ \"$1\" == \"run\" && \"$2\" == \"verify:matrix\" ]]; then",
    matrixFails
      ? "  echo \"npm ERR! code ENOTFOUND\" >&2\n  echo \"npm ERR! network getaddrinfo ENOTFOUND registry.npmjs.org\" >&2\n  exit 1"
      : "  exit 0",
    "fi",
    "exit 0"
  ].join("\n");
  await writeExecutable(path.join(binDir, "npm"), fakeNpm);

  const gitInit = await runCmd("git", ["init"], { cwd: tmp });
  assert.equal(gitInit.code, 0, gitInit.err || gitInit.out);

  return { tmp, binDir };
}

test("release-ready fails and records network error when regression-matrix command fails", async () => {
  const { tmp, binDir } = await setupReleaseReadyFixture({ matrixFails: true });
  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH || ""}`
  };

  const r = await runNode(
    [path.resolve("scripts/release-ready.js"), "--root", tmp, "--format", "json", "--skip-tests", "--allow-dirty"],
    { cwd: path.resolve("."), env }
  );

  assert.equal(r.code, 1, r.err || r.out);
  const report = JSON.parse(r.out);
  const matrix = report.checks.find((c) => c.name === "regression-matrix");
  assert.ok(matrix, "regression-matrix check should exist");
  assert.equal(matrix.status, "fail");
  assert.match(String(matrix.error || ""), /ENOTFOUND/);
  assert.equal(report.ok, false);
});

test("release-ready markdown includes condensed network failure line", async () => {
  const { tmp, binDir } = await setupReleaseReadyFixture({ matrixFails: true });
  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH || ""}`
  };

  const r = await runNode(
    [path.resolve("scripts/release-ready.js"), "--root", tmp, "--format", "md", "--skip-tests", "--allow-dirty"],
    { cwd: path.resolve("."), env }
  );

  assert.equal(r.code, 1, r.err || r.out);
  assert.match(r.out, /- result: NOT READY/);
  assert.match(r.out, /## regression-matrix/);
  assert.match(r.out, /- error: npm ERR! code ENOTFOUND/);
});

test("release-ready reports timeout when a check command hangs", async () => {
  const { tmp, binDir } = await setupReleaseReadyFixture({ matrixFails: false });
  const slowNpm = [
    "#!/usr/bin/env bash",
    "if [[ \"$1\" == \"run\" && \"$2\" == \"verify:matrix\" ]]; then",
    "  sleep 5",
    "  exit 0",
    "fi",
    "exit 0"
  ].join("\n");
  await writeExecutable(path.join(binDir, "npm"), slowNpm);

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH || ""}`
  };

  const r = await runNode(
    [path.resolve("scripts/release-ready.js"), "--root", tmp, "--format", "json", "--skip-tests", "--allow-dirty", "--step-timeout-ms", "1000"],
    { cwd: path.resolve("."), env }
  );

  assert.equal(r.code, 1, r.err || r.out);
  const report = JSON.parse(r.out);
  const matrix = report.checks.find((c) => c.name === "regression-matrix");
  assert.ok(matrix, "regression-matrix check should exist");
  assert.equal(matrix.status, "fail");
  assert.equal(matrix.timedOut, true);
  assert.match(String(matrix.error || ""), /timed out after 1000ms/);
});
