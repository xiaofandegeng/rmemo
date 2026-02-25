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

test("release-archive copies reports into versioned snapshot and writes indexes", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-archive-ok-"));
  const artifacts = path.join(tmp, "artifacts");
  await fs.mkdir(artifacts, { recursive: true });
  await fs.writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "x", version: "9.9.9", type: "module" }) + "\n", "utf8");
  await fs.writeFile(path.join(artifacts, "release-ready.json"), JSON.stringify({ ok: true }) + "\n", "utf8");
  await fs.writeFile(path.join(artifacts, "release-health.json"), JSON.stringify({ ok: true }) + "\n", "utf8");

  const r = await runNode(
    [
      path.resolve("scripts/release-archive.js"),
      "--root",
      tmp,
      "--format",
      "json",
      "--snapshot-id",
      "20260225_100000"
    ],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 0, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.ok, true);
  assert.equal(report.version, "9.9.9");
  assert.equal(report.snapshotId, "20260225_100000");
  assert.equal(report.copiedFiles.length, 2);

  const manifestPath = path.join(report.snapshotDir, "manifest.json");
  const catalogPath = path.join(tmp, "artifacts", "release-archive", "catalog.json");
  const latestPath = path.join(tmp, "artifacts", "release-archive", "9.9.9", "latest.json");
  assert.equal(Boolean(await fs.stat(manifestPath)), true);
  assert.equal(Boolean(await fs.stat(catalogPath)), true);
  assert.equal(Boolean(await fs.stat(latestPath)), true);
});

test("release-archive prunes snapshots by max-snapshots-per-version", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-archive-prune-"));
  const artifacts = path.join(tmp, "artifacts");
  const versionDir = path.join(artifacts, "release-archive", "9.9.9");
  await fs.mkdir(path.join(versionDir, "20260224_100000"), { recursive: true });
  await fs.mkdir(path.join(versionDir, "20260224_110000"), { recursive: true });
  await fs.writeFile(path.join(versionDir, "20260224_100000", "manifest.json"), "{}\n", "utf8");
  await fs.writeFile(path.join(versionDir, "20260224_110000", "manifest.json"), "{}\n", "utf8");

  await fs.writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "x", version: "9.9.9", type: "module" }) + "\n", "utf8");
  await fs.mkdir(artifacts, { recursive: true });
  await fs.writeFile(path.join(artifacts, "release-ready.json"), JSON.stringify({ ok: true }) + "\n", "utf8");

  const r = await runNode(
    [
      path.resolve("scripts/release-archive.js"),
      "--root",
      tmp,
      "--format",
      "json",
      "--snapshot-id",
      "20260225_120000",
      "--max-snapshots-per-version",
      "1",
      "--retention-days",
      "3650"
    ],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 0, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.ok, true);
  assert.ok(report.prunedSnapshots.length >= 2);

  const names = await fs.readdir(versionDir);
  assert.ok(names.includes("20260225_120000"));
  assert.equal(names.includes("20260224_100000"), false);
  assert.equal(names.includes("20260224_110000"), false);
});

test("release-archive fails when artifacts directory has no releasable files", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-archive-empty-"));
  await fs.mkdir(path.join(tmp, "artifacts"), { recursive: true });
  await fs.writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "x", version: "9.9.9", type: "module" }) + "\n", "utf8");

  const r = await runNode([path.resolve("scripts/release-archive.js"), "--root", tmp, "--format", "json"], {
    cwd: path.resolve("."),
    env: { ...process.env }
  });

  assert.equal(r.code, 1, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.ok, false);
  assert.match(String(report.error || ""), /no release artifact files found/i);
});
