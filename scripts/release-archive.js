#!/usr/bin/env node
import path from "node:path";
import crypto from "node:crypto";
import { readFile, writeFile, mkdir, readdir, stat, rm, copyFile } from "node:fs/promises";

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > 0) {
      flags[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const k = a.slice(2);
    const n = argv[i + 1];
    if (n && !n.startsWith("-")) {
      flags[k] = n;
      i++;
    } else {
      flags[k] = "true";
    }
  }
  return flags;
}

function formatSnapshotId(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(filePath) {
  const buf = await readFile(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function listSnapshotDirs(versionDir) {
  try {
    const entries = await readdir(versionDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => b.localeCompare(a));
  } catch {
    return [];
  }
}

async function removeDirSafe(p) {
  try {
    await rm(p, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function md(report) {
  const lines = [];
  lines.push("# rmemo Release Archive");
  lines.push("");
  lines.push(`- status: ${report.ok ? "OK" : "FAIL"}`);
  if (report.standardized?.resultCode) lines.push(`- resultCode: ${report.standardized.resultCode}`);
  if (Array.isArray(report.standardized?.failureCodes) && report.standardized.failureCodes.length > 0) {
    lines.push(`- failureCodes: ${report.standardized.failureCodes.join(",")}`);
  }
  lines.push(`- version: ${report.version}`);
  lines.push(`- tag: ${report.tag}`);
  lines.push(`- snapshotId: ${report.snapshotId}`);
  lines.push(`- snapshotDir: ${report.snapshotDir}`);
  lines.push(`- copiedCount: ${report.copiedFiles.length}`);
  lines.push(`- missingCount: ${report.missingFiles.length}`);
  lines.push(`- prunedCount: ${report.prunedSnapshots.length}`);
  lines.push(`- catalog: ${report.catalogPath}`);
  lines.push(`- latest: ${report.latestPath}`);
  if (!report.ok && report.error) lines.push(`- error: ${report.error}`);
  return `${lines.join("\n")}\n`;
}

function statusFromOk(ok) {
  return ok ? "pass" : "fail";
}

function buildStandardized(report) {
  const checkStatuses = {
    sourceArtifacts: report.copiedFiles.length > 0 ? "pass" : "fail",
    snapshotManifest: "pass",
    archiveIndexes: report.catalogPath && report.latestPath ? "pass" : "fail"
  };
  const failures = [];
  if (checkStatuses.sourceArtifacts === "fail") {
    failures.push({
      check: "sourceArtifacts",
      code: "ARCHIVE_SOURCE_FILES_MISSING",
      message: String(report.error || "no release artifact files found under artifacts/"),
      retryable: false
    });
  }
  if (!report.ok && failures.length === 0) {
    failures.push({
      check: "releaseArchive",
      code: "RELEASE_ARCHIVE_FAIL",
      message: String(report.error || "release archive failed"),
      retryable: false
    });
  }
  const checkEntries = Object.entries(checkStatuses);
  return {
    schema: 1,
    status: statusFromOk(report.ok),
    resultCode: report.ok ? "RELEASE_ARCHIVE_OK" : "RELEASE_ARCHIVE_FAIL",
    summary: {
      totalChecks: checkEntries.length,
      passCount: checkEntries.filter(([, status]) => status === "pass").length,
      failCount: checkEntries.filter(([, status]) => status === "fail").length
    },
    checkStatuses,
    failureCodes: failures.map((failure) => failure.code),
    failures
  };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const root = flags.root ? path.resolve(flags.root) : process.cwd();
  const format = String(flags.format || "md").toLowerCase();
  if (!["md", "json"].includes(format)) throw new Error("format must be md|json");

  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const pkgVersion = String(pkg.version || "").trim();
  const versionFlag = String(flags.version || "").trim();
  if (versionFlag.toLowerCase() === "current" && !pkgVersion) {
    throw new Error("--version current requires package.json with a valid version field");
  }
  const version = versionFlag.toLowerCase() === "current" ? pkgVersion : String(versionFlag || pkgVersion || "").trim();
  if (!version) throw new Error("version is required (--version or package.json version)");
  const tag = String(flags.tag || `v${version}`).trim();

  const artifactsDir = flags["artifacts-dir"] ? path.resolve(root, String(flags["artifacts-dir"])) : path.join(root, "artifacts");
  const archiveRoot = path.join(artifactsDir, "release-archive");
  const versionDir = path.join(archiveRoot, version);
  const snapshotId = String(flags["snapshot-id"] || formatSnapshotId(new Date())).trim();
  const snapshotDir = path.join(versionDir, snapshotId);
  const retentionDays = Math.max(1, Number(flags["retention-days"] || 30));
  const maxSnapshotsPerVersion = Math.max(1, Number(flags["max-snapshots-per-version"] || 20));

  const sourceFiles = [
    "release-notes.md",
    "release-ready.md",
    "release-ready.json",
    "release-health.md",
    "release-health.json",
    "release-rehearsal.md",
    "release-rehearsal.json",
    "release-summary.md",
    "release-summary.json",
    "release-verify.json"
  ];

  await mkdir(snapshotDir, { recursive: true });
  const copiedFiles = [];
  const missingFiles = [];
  for (const rel of sourceFiles) {
    const from = path.join(artifactsDir, rel);
    const to = path.join(snapshotDir, rel);
    if (!(await exists(from))) {
      missingFiles.push(rel);
      continue;
    }
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to);
    const s = await stat(to);
    copiedFiles.push({
      file: rel,
      bytes: s.size,
      sha256: await sha256File(to)
    });
  }

  const manifest = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    artifactsDir,
    archiveRoot,
    version,
    tag,
    snapshotId,
    snapshotDir,
    copiedFiles,
    missingFiles,
    options: { retentionDays, maxSnapshotsPerVersion }
  };
  await writeFile(path.join(snapshotDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const prunedSnapshots = [];
  const snapshotNames = await listSnapshotDirs(versionDir);
  const now = Date.now();
  for (let i = 0; i < snapshotNames.length; i++) {
    const name = snapshotNames[i];
    const dir = path.join(versionDir, name);
    const st = await stat(dir);
    const tooOld = now - st.mtimeMs > retentionDays * 24 * 60 * 60 * 1000;
    const overflow = i >= maxSnapshotsPerVersion;
    if (!tooOld && !overflow) continue;
    const removed = await removeDirSafe(dir);
    if (removed) {
      prunedSnapshots.push({
        snapshotId: name,
        reason: tooOld ? "retention_days" : "max_snapshots_per_version"
      });
    }
  }

  const remaining = await listSnapshotDirs(versionDir);
  const latestSnapshotId = remaining[0] || "";
  const latestPath = path.join(versionDir, "latest.json");
  const latestInfo = {
    schema: 1,
    version,
    latestSnapshotId,
    latestSnapshotDir: latestSnapshotId ? path.join(versionDir, latestSnapshotId) : ""
  };
  await writeFile(latestPath, `${JSON.stringify(latestInfo, null, 2)}\n`, "utf8");

  const versionEntries = await readdir(archiveRoot, { withFileTypes: true }).catch(() => []);
  const versions = versionEntries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => b.localeCompare(a));
  const catalog = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    archiveRoot,
    versions: []
  };
  for (const v of versions) {
    const vDir = path.join(archiveRoot, v);
    const snaps = await listSnapshotDirs(vDir);
    catalog.versions.push({
      version: v,
      latestSnapshotId: snaps[0] || "",
      snapshotCount: snaps.length,
      snapshots: snaps
    });
  }
  const catalogPath = path.join(archiveRoot, "catalog.json");
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

  const ok = copiedFiles.length > 0;
  const report = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    artifactsDir,
    archiveRoot,
    version,
    tag,
    snapshotId,
    snapshotDir,
    copiedFiles,
    missingFiles,
    prunedSnapshots,
    catalogPath,
    latestPath,
    options: { retentionDays, maxSnapshotsPerVersion },
    ok,
    error: ok ? "" : "no release artifact files found under artifacts/"
  };
  report.standardized = buildStandardized(report);

  process.stdout.write(format === "json" ? `${JSON.stringify(report, null, 2)}\n` : md(report));
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e) + "\n");
  process.exitCode = 1;
});
