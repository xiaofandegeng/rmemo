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
});
