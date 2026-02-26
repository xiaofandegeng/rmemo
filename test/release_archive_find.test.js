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

async function setupArchive(root) {
  const archiveRoot = path.join(root, "artifacts", "release-archive");
  await fs.mkdir(path.join(archiveRoot, "1.5.0", "20260225_100000"), { recursive: true });
  await fs.mkdir(path.join(archiveRoot, "1.5.0", "20260225_090000"), { recursive: true });
  await fs.mkdir(path.join(archiveRoot, "1.4.0", "20260224_220000"), { recursive: true });

  await fs.writeFile(
    path.join(archiveRoot, "catalog.json"),
    JSON.stringify({
      schema: 1,
      versions: [
        { version: "1.5.0", latestSnapshotId: "20260225_100000", snapshotCount: 2, snapshots: ["20260225_100000", "20260225_090000"] },
        { version: "1.4.0", latestSnapshotId: "20260224_220000", snapshotCount: 1, snapshots: ["20260224_220000"] }
      ]
    }) + "\n",
    "utf8"
  );

  await fs.writeFile(
    path.join(archiveRoot, "1.5.0", "latest.json"),
    JSON.stringify({
      schema: 1,
      version: "1.5.0",
      latestSnapshotId: "20260225_100000",
      latestSnapshotDir: path.join(archiveRoot, "1.5.0", "20260225_100000")
    }) + "\n",
    "utf8"
  );

  await fs.writeFile(
    path.join(archiveRoot, "1.5.0", "20260225_100000", "manifest.json"),
    JSON.stringify({
      schema: 1,
      version: "1.5.0",
      tag: "v1.5.0",
      snapshotDir: path.join(archiveRoot, "1.5.0", "20260225_100000"),
      copiedFiles: [{ file: "release-health.json" }, { file: "release-ready.json" }],
      missingFiles: ["release-verify.json"]
    }) + "\n",
    "utf8"
  );
}

test("release-archive-find lists versions from catalog", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-archive-find-versions-"));
  await setupArchive(tmp);

  const r = await runNode([path.resolve("scripts/release-archive-find.js"), "--root", tmp, "--format", "json"], {
    cwd: path.resolve("."),
    env: { ...process.env }
  });

  assert.equal(r.code, 0, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.mode, "versions");
  assert.equal(report.ok, true);
  assert.equal(report.versions[0].version, "1.5.0");
  assert.equal(report.standardized.status, "pass");
  assert.equal(report.standardized.resultCode, "RELEASE_ARCHIVE_FIND_OK");
  assert.equal(report.standardized.checkStatuses.archiveIndex, "pass");
  assert.deepEqual(report.standardized.failureCodes, []);
});

test("release-archive-find resolves latest snapshot for a version", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-archive-find-latest-"));
  await setupArchive(tmp);

  const r = await runNode(
    [path.resolve("scripts/release-archive-find.js"), "--root", tmp, "--format", "json", "--version", "1.5.0"],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 0, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.mode, "version-latest");
  assert.equal(report.latestSnapshot.snapshotId, "20260225_100000");
  assert.equal(report.snapshots.includes("20260225_100000"), true);
  assert.equal(report.standardized.status, "pass");
  assert.equal(report.standardized.checkStatuses.latestSnapshot, "pass");
});

test("release-archive-find resolves a specific snapshot manifest summary", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-archive-find-snapshot-"));
  await setupArchive(tmp);

  const r = await runNode(
    [
      path.resolve("scripts/release-archive-find.js"),
      "--root",
      tmp,
      "--format",
      "json",
      "--version",
      "1.5.0",
      "--snapshot-id",
      "20260225_100000"
    ],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 0, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.mode, "snapshot");
  assert.equal(report.snapshot.copiedFiles, 2);
  assert.equal(report.snapshot.missingFiles, 1);
  assert.equal(report.snapshot.tag, "v1.5.0");
  assert.equal(report.standardized.status, "pass");
  assert.equal(report.standardized.checkStatuses.snapshotManifest, "pass");
});

test("release-archive-find fails when version has no snapshots", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-archive-find-miss-"));
  await setupArchive(tmp);

  const r = await runNode(
    [path.resolve("scripts/release-archive-find.js"), "--root", tmp, "--format", "json", "--version", "9.9.9"],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 1, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.ok, false);
  assert.match(String(report.error || ""), /has no snapshots/i);
  assert.equal(report.standardized.status, "fail");
  assert.equal(report.standardized.resultCode, "RELEASE_ARCHIVE_FIND_FAIL");
  assert.equal(report.standardized.checkStatuses.latestSnapshot, "fail");
  assert.equal(report.standardized.failureCodes.includes("ARCHIVE_VERSION_NO_SNAPSHOTS"), true);
});

test("release-archive-find validates required files on latest snapshot", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-archive-find-required-ok-"));
  await setupArchive(tmp);

  const r = await runNode(
    [
      path.resolve("scripts/release-archive-find.js"),
      "--root",
      tmp,
      "--format",
      "json",
      "--version",
      "1.5.0",
      "--require-files",
      "release-health.json,release-ready.json"
    ],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 0, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.ok, true);
  assert.deepEqual(report.missingRequiredFiles, []);
  assert.equal(report.standardized.status, "pass");
  assert.equal(report.standardized.checkStatuses.requiredFiles, "pass");
});

test("release-archive-find supports built-in require preset for rehearsal archive verify", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-archive-find-required-preset-"));
  await setupArchive(tmp);

  const r = await runNode(
    [
      path.resolve("scripts/release-archive-find.js"),
      "--root",
      tmp,
      "--format",
      "json",
      "--version",
      "1.5.0",
      "--require-preset",
      "rehearsal-archive-verify"
    ],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 1, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.requiredFilesPreset, "rehearsal-archive-verify");
  assert.deepEqual(report.requiredFiles, [
    "release-ready.json",
    "release-health.json",
    "release-rehearsal.json",
    "release-summary.json"
  ]);
  assert.equal(report.missingRequiredFiles.includes("release-rehearsal.json"), true);
  assert.equal(report.missingRequiredFiles.includes("release-summary.json"), true);
  assert.equal(report.standardized.status, "fail");
  assert.equal(report.standardized.checkStatuses.requiredFiles, "fail");
});

test("release-archive-find fails when required files are missing", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-archive-find-required-fail-"));
  await setupArchive(tmp);

  const r = await runNode(
    [
      path.resolve("scripts/release-archive-find.js"),
      "--root",
      tmp,
      "--format",
      "json",
      "--version",
      "1.5.0",
      "--require-files",
      "release-health.json,release-notes.md"
    ],
    { cwd: path.resolve("."), env: { ...process.env } }
  );

  assert.equal(r.code, 1, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.ok, false);
  assert.equal(Array.isArray(report.missingRequiredFiles), true);
  assert.equal(report.missingRequiredFiles.includes("release-notes.md"), true);
  assert.match(String(report.error || ""), /missing required files/i);
  assert.equal(report.standardized.status, "fail");
  assert.equal(report.standardized.checkStatuses.requiredFiles, "fail");
  assert.equal(report.standardized.failureCodes.includes("ARCHIVE_REQUIRED_FILES_MISSING"), true);
});

test("release-archive-find rejects unknown require preset", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-release-archive-find-unknown-preset-"));
  await setupArchive(tmp);
  const r = await runNode(
    [path.resolve("scripts/release-archive-find.js"), "--root", tmp, "--format", "json", "--version", "1.5.0", "--require-preset", "unknown"],
    {
      cwd: path.resolve("."),
      env: { ...process.env }
    }
  );
  assert.equal(r.code, 1);
  assert.match(String(r.err || ""), /unknown require preset/i);
});

test("release-archive-find rejects require preset without version", async () => {
  const r = await runNode(
    [path.resolve("scripts/release-archive-find.js"), "--format", "json", "--require-preset", "rehearsal-archive-verify"],
    {
      cwd: path.resolve("."),
      env: { ...process.env }
    }
  );
  assert.equal(r.code, 1);
  assert.match(String(r.err || ""), /--require-files\/--require-preset requires --version/i);
});

test("release-archive-find rejects require files without version", async () => {
  const r = await runNode([path.resolve("scripts/release-archive-find.js"), "--format", "json", "--require-files", "release-ready.json"], {
    cwd: path.resolve("."),
    env: { ...process.env }
  });
  assert.equal(r.code, 1);
  assert.match(String(r.err || ""), /--require-files\/--require-preset requires --version/i);
});

test("release-archive-find rejects snapshot-id without version", async () => {
  const r = await runNode([path.resolve("scripts/release-archive-find.js"), "--format", "json", "--snapshot-id", "20260225_100000"], {
    cwd: path.resolve("."),
    env: { ...process.env }
  });
  assert.equal(r.code, 1);
  assert.match(String(r.err || ""), /--snapshot-id requires --version/i);
});

test("release-archive-find rejects mixing require-files and require-preset", async () => {
  const r = await runNode(
    [
      path.resolve("scripts/release-archive-find.js"),
      "--format",
      "json",
      "--require-files",
      "release-ready.json",
      "--require-preset",
      "rehearsal-archive-verify"
    ],
    {
      cwd: path.resolve("."),
      env: { ...process.env }
    }
  );
  assert.equal(r.code, 1);
  assert.match(String(r.err || ""), /cannot combine --require-files with --require-preset/i);
});

test("release-archive-find lists built-in require presets in json mode", async () => {
  const r = await runNode([path.resolve("scripts/release-archive-find.js"), "--format", "json", "--list-require-presets"], {
    cwd: path.resolve("."),
    env: { ...process.env }
  });
  assert.equal(r.code, 0, r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.mode, "require-presets");
  assert.equal(report.ok, true);
  assert.equal(report.standardized?.status, "pass");
  assert.equal(report.standardized?.resultCode, "RELEASE_ARCHIVE_FIND_PRESETS_OK");
  assert.equal(report.standardized?.checkStatuses?.requirePresets, "pass");
  assert.deepEqual(report.standardized?.failureCodes, []);
  assert.ok(Number(report.standardized?.metrics?.presetCount || 0) >= 1);
  const preset = Array.isArray(report.requirePresets)
    ? report.requirePresets.find((x) => x?.name === "rehearsal-archive-verify")
    : null;
  assert.ok(preset);
  assert.deepEqual(preset.files, [
    "release-ready.json",
    "release-health.json",
    "release-rehearsal.json",
    "release-summary.json"
  ]);
});

test("release-archive-find lists built-in require presets in markdown mode", async () => {
  const r = await runNode([path.resolve("scripts/release-archive-find.js"), "--format", "md", "--list-require-presets"], {
    cwd: path.resolve("."),
    env: { ...process.env }
  });
  assert.equal(r.code, 0, r.err || r.out);
  assert.match(r.out, /^# rmemo Release Archive Find Require Presets/m);
  assert.match(r.out, /- resultCode: RELEASE_ARCHIVE_FIND_PRESETS_OK/);
  assert.match(r.out, /- rehearsal-archive-verify: release-ready\.json,release-health\.json,release-rehearsal\.json,release-summary\.json/);
});
