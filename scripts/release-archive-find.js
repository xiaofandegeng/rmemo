#!/usr/bin/env node
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";

const REQUIRED_FILE_PRESETS = Object.freeze({
  "rehearsal-archive-verify": [
    "release-ready.json",
    "release-health.json",
    "release-rehearsal.json",
    "release-summary.json"
  ]
});

function listRequirePresets() {
  return Object.entries(REQUIRED_FILE_PRESETS).map(([name, files]) => ({
    name,
    files: Array.isArray(files) ? files.slice() : []
  }));
}

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

async function readJsonSafe(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function listDirNames(dirPath) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

function normalizeCopiedFiles(copiedFiles) {
  if (!Array.isArray(copiedFiles)) return [];
  return copiedFiles
    .map((entry) => {
      if (typeof entry === "string") return entry;
      return String(entry?.file || "");
    })
    .map((x) => x.trim())
    .filter(Boolean);
}

function validateRequiredFiles(requiredFiles, copiedFiles) {
  const required = Array.isArray(requiredFiles) ? requiredFiles : [];
  const copied = Array.isArray(copiedFiles) ? copiedFiles : [];
  const missingRequiredFiles = required.filter((f) => !copied.includes(f));
  return {
    requiredFiles: required,
    missingRequiredFiles,
    ok: missingRequiredFiles.length === 0
  };
}

function statusFromOk(ok) {
  return ok ? "pass" : "fail";
}

function buildStandardized(report) {
  const checkStatuses = {};

  if (report.mode === "versions") {
    checkStatuses.archiveIndex = statusFromOk(report.ok);
  } else if (report.mode === "version-latest") {
    checkStatuses.latestSnapshot = report.latestSnapshot ? "pass" : "fail";
  } else if (report.mode === "snapshot") {
    checkStatuses.snapshotManifest = report.snapshot ? "pass" : "fail";
  }

  const hasRequiredFilesCheck = Array.isArray(report.requiredFiles) && report.requiredFiles.length > 0;
  const missingRequiredFiles = Array.isArray(report.missingRequiredFiles) ? report.missingRequiredFiles : [];
  if (hasRequiredFilesCheck) {
    checkStatuses.requiredFiles = missingRequiredFiles.length === 0 ? "pass" : "fail";
  }

  const failures = [];
  if (!report.ok) {
    if (missingRequiredFiles.length > 0) {
      failures.push({
        check: "requiredFiles",
        code: "ARCHIVE_REQUIRED_FILES_MISSING",
        message: `missing required files: ${missingRequiredFiles.join(",")}`,
        retryable: false
      });
    }

    if (report.mode === "version-latest" && !report.latestSnapshot) {
      failures.push({
        check: "latestSnapshot",
        code: "ARCHIVE_VERSION_NO_SNAPSHOTS",
        message: String(report.error || "version has no snapshots"),
        retryable: false
      });
    }

    if (report.mode === "snapshot" && !report.snapshot) {
      failures.push({
        check: "snapshotManifest",
        code: "ARCHIVE_MANIFEST_NOT_FOUND",
        message: String(report.error || "snapshot manifest not found"),
        retryable: false
      });
    }

    if (failures.length === 0) {
      failures.push({
        check: "archiveFind",
        code: "RELEASE_ARCHIVE_FIND_FAIL",
        message: String(report.error || "release archive find failed"),
        retryable: false
      });
    }
  }

  const checkEntries = Object.entries(checkStatuses);
  return {
    schema: 1,
    status: statusFromOk(report.ok),
    resultCode: report.ok ? "RELEASE_ARCHIVE_FIND_OK" : "RELEASE_ARCHIVE_FIND_FAIL",
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

function md(report) {
  const lines = [];
  lines.push("# rmemo Release Archive Find");
  lines.push("");
  lines.push(`- status: ${report.ok ? "OK" : "FAIL"}`);
  if (report.standardized?.resultCode) lines.push(`- resultCode: ${report.standardized.resultCode}`);
  if (Array.isArray(report.standardized?.failureCodes) && report.standardized.failureCodes.length > 0) {
    lines.push(`- failureCodes: ${report.standardized.failureCodes.join(",")}`);
  }
  lines.push(`- mode: ${report.mode}`);
  lines.push(`- archiveRoot: ${report.archiveRoot}`);
  if (report.version) lines.push(`- version: ${report.version}`);
  if (report.snapshotId) lines.push(`- snapshotId: ${report.snapshotId}`);
  if (report.error) lines.push(`- error: ${report.error}`);
  if (report.mode === "versions" && Array.isArray(report.versions)) {
    lines.push(`- versions: ${report.versions.map((x) => x.version).join(",")}`);
  }
  if (report.mode === "version-latest" && report.latestSnapshot) {
    lines.push(`- latestSnapshot: ${report.latestSnapshot.snapshotId}`);
    lines.push(`- snapshotDir: ${report.latestSnapshot.snapshotDir}`);
  }
  if (report.mode === "snapshot" && report.snapshot) {
    lines.push(`- snapshotDir: ${report.snapshot.snapshotDir}`);
    lines.push(`- copiedFiles: ${report.snapshot.copiedFiles}`);
    lines.push(`- missingFiles: ${report.snapshot.missingFiles}`);
  }
  if (Array.isArray(report.requiredFiles) && report.requiredFiles.length > 0) {
    if (report.requiredFilesPreset) lines.push(`- requiredFilesPreset: ${report.requiredFilesPreset}`);
    lines.push(`- requiredFiles: ${report.requiredFiles.join(",")}`);
    lines.push(`- missingRequiredFiles: ${Array.isArray(report.missingRequiredFiles) ? report.missingRequiredFiles.join(",") : ""}`);
  }
  return `${lines.join("\n")}\n`;
}

function mdRequirePresets(report) {
  const lines = [];
  lines.push("# rmemo Release Archive Find Require Presets");
  lines.push("");
  lines.push(`- status: ${report.ok ? "OK" : "FAIL"}`);
  lines.push(`- presetCount: ${Array.isArray(report.requirePresets) ? report.requirePresets.length : 0}`);
  lines.push("");
  lines.push("## Presets");
  lines.push("");
  for (const preset of report.requirePresets || []) {
    lines.push(`- ${preset.name}: ${(preset.files || []).join(",")}`);
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const root = flags.root ? path.resolve(flags.root) : process.cwd();
  const format = String(flags.format || "md").toLowerCase();
  if (!["md", "json"].includes(format)) throw new Error("format must be md|json");
  const listRequirePresetsMode = flags["list-require-presets"] === "true";

  if (listRequirePresetsMode) {
    const report = {
      schema: 1,
      generatedAt: new Date().toISOString(),
      mode: "require-presets",
      ok: true,
      requirePresets: listRequirePresets()
    };
    process.stdout.write(format === "json" ? `${JSON.stringify(report, null, 2)}\n` : mdRequirePresets(report));
    return;
  }

  const artifactsDir = flags["artifacts-dir"] ? path.resolve(root, String(flags["artifacts-dir"])) : path.join(root, "artifacts");
  const archiveRoot = path.join(artifactsDir, "release-archive");
  const version = String(flags.version || "").trim();
  const snapshotId = String(flags["snapshot-id"] || "").trim();
  const requiredFilesPreset = String(flags["require-preset"] || "").trim();
  const requiredFilesFromFlag = String(flags["require-files"] || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (requiredFilesPreset && requiredFilesFromFlag.length > 0) {
    throw new Error("cannot combine --require-files with --require-preset");
  }
  const requiredFiles = requiredFilesPreset
    ? REQUIRED_FILE_PRESETS[requiredFilesPreset]
    : requiredFilesFromFlag;
  if (requiredFilesPreset && !requiredFiles) {
    throw new Error(`unknown require preset '${requiredFilesPreset}', expected one of: ${Object.keys(REQUIRED_FILE_PRESETS).join(",")}`);
  }
  const limit = Math.max(1, Number(flags.limit || 20));

  let report = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    archiveRoot,
    mode: "versions",
    ok: true
  };

  if (!version) {
    const catalog = await readJsonSafe(path.join(archiveRoot, "catalog.json"), { versions: [] });
    const versions = Array.isArray(catalog?.versions) ? catalog.versions.slice(0, limit) : [];
    report = {
      ...report,
      mode: "versions",
      versions
    };
  } else if (!snapshotId) {
    const latest = await readJsonSafe(path.join(archiveRoot, version, "latest.json"), null);
    if (!latest?.latestSnapshotId) {
      report = {
        ...report,
        mode: "version-latest",
        version,
        ok: false,
        error: `version '${version}' has no snapshots`
      };
    } else {
      const snapshots = (await listDirNames(path.join(archiveRoot, version)))
        .filter((x) => x !== "latest.json")
        .sort((a, b) => b.localeCompare(a))
        .slice(0, limit);
      report = {
        ...report,
        mode: "version-latest",
        version,
        latestSnapshot: {
          snapshotId: latest.latestSnapshotId,
          snapshotDir: latest.latestSnapshotDir
        },
        snapshots
      };
      if (requiredFiles.length > 0) {
        const manifest = await readJsonSafe(path.join(archiveRoot, version, latest.latestSnapshotId, "manifest.json"), null);
        const check = validateRequiredFiles(requiredFiles, normalizeCopiedFiles(manifest?.copiedFiles));
        report.requiredFiles = check.requiredFiles;
        if (requiredFilesPreset) report.requiredFilesPreset = requiredFilesPreset;
        report.missingRequiredFiles = check.missingRequiredFiles;
        if (!check.ok) {
          report.ok = false;
          report.error = `latest snapshot '${latest.latestSnapshotId}' missing required files: ${check.missingRequiredFiles.join(",")}`;
        }
      }
    }
  } else {
    const manifestPath = path.join(archiveRoot, version, snapshotId, "manifest.json");
    const manifest = await readJsonSafe(manifestPath, null);
    if (!manifest) {
      report = {
        ...report,
        mode: "snapshot",
        version,
        snapshotId,
        ok: false,
        error: `manifest not found for ${version}/${snapshotId}`
      };
    } else {
      report = {
        ...report,
        mode: "snapshot",
        version,
        snapshotId,
        snapshot: {
          snapshotDir: manifest.snapshotDir || path.join(archiveRoot, version, snapshotId),
          copiedFiles: Array.isArray(manifest.copiedFiles) ? manifest.copiedFiles.length : 0,
          missingFiles: Array.isArray(manifest.missingFiles) ? manifest.missingFiles.length : 0,
          tag: manifest.tag || ""
        }
      };
      if (requiredFiles.length > 0) {
        const check = validateRequiredFiles(requiredFiles, normalizeCopiedFiles(manifest.copiedFiles));
        report.requiredFiles = check.requiredFiles;
        if (requiredFilesPreset) report.requiredFilesPreset = requiredFilesPreset;
        report.missingRequiredFiles = check.missingRequiredFiles;
        if (!check.ok) {
          report.ok = false;
          report.error = `snapshot '${snapshotId}' missing required files: ${check.missingRequiredFiles.join(",")}`;
        }
      }
    }
  }

  report.standardized = buildStandardized(report);

  process.stdout.write(format === "json" ? `${JSON.stringify(report, null, 2)}\n` : md(report));
  if (!report.ok) process.exitCode = 1;
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e) + "\n");
  process.exitCode = 1;
});
