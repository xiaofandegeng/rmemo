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

async function writeExecutable(filePath, content) {
  await fs.writeFile(filePath, content, "utf8");
  await fs.chmod(filePath, 0o755);
}

test("release-health reports npm timeout when npm view exceeds timeout", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-health-timeout-"));
  const binDir = path.join(tmp, "bin");
  await fs.mkdir(binDir, { recursive: true });

  const fakeNpm = path.join(binDir, "npm");
  await writeExecutable(
    fakeNpm,
    "#!/usr/bin/env bash\n" +
      "sleep 5\n" +
      "echo 1.2.0\n"
  );

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH || ""}`
  };

  const r = await runNode(
    ["scripts/release-health.js", "--repo", "owner/repo", "--version", "1.2.0", "--tag", "v1.2.0", "--format", "json", "--timeout-ms", "200"],
    { cwd: path.resolve("."), env }
  );

  assert.equal(r.code, 1, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.checks.npm.ok, false);
  assert.match(String(report.checks.npm.error || ""), /npm view timed out after 1000ms/);
});

test("release-health reports github timeout when request exceeds timeout", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-health-gh-timeout-"));
  const binDir = path.join(tmp, "bin");
  await fs.mkdir(binDir, { recursive: true });

  const fakeNpm = path.join(binDir, "npm");
  await writeExecutable(
    fakeNpm,
    "#!/usr/bin/env bash\n" +
      "echo 1.2.0\n"
  );

  const preload = path.join(tmp, "mock-https-timeout.cjs");
  await fs.writeFile(
    preload,
    [
      "const https = require('node:https');",
      "const { EventEmitter } = require('node:events');",
      "https.request = function mockRequest(url, options, callback) {",
      "  const req = new EventEmitter();",
      "  req.setTimeout = () => {};",
      "  req.end = () => {};",
      "  req.destroy = (err) => {",
      "    process.nextTick(() => req.emit('error', err || new Error('destroyed')));",
      "  };",
      "  if (options && options.signal) {",
      "    options.signal.addEventListener('abort', () => {",
      "      const e = new Error('aborted');",
      "      e.name = 'AbortError';",
      "      req.emit('error', e);",
      "    }, { once: true });",
      "  }",
      "  if (typeof callback === 'function') {",
      "    // never invokes callback to simulate hanging request until abort",
      "  }",
      "  return req;",
      "};"
    ].join("\n"),
    "utf8"
  );

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH || ""}`,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : ""}--require=${preload}`
  };

  const r = await runNode(
    ["scripts/release-health.js", "--repo", "owner/repo", "--version", "1.2.0", "--tag", "v1.2.0", "--format", "json", "--timeout-ms", "150"],
    { cwd: path.resolve("."), env }
  );

  assert.equal(r.code, 1, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.checks.githubRelease.ok, false);
  assert.match(String(report.checks.githubRelease.error || ""), /request timeout after 1000ms/);
});
