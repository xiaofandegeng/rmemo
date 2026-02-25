#!/usr/bin/env node
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";

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

function md(report) {
  const lines = [];
  lines.push("# rmemo Release Archive Find");
  lines.push("");
  lines.push(`- status: ${report.ok ? "OK" : "FAIL"}`);
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
  return `${lines.join("\n")}\n`;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const root = flags.root ? path.resolve(flags.root) : process.cwd();
  const format = String(flags.format || "md").toLowerCase();
  if (!["md", "json"].includes(format)) throw new Error("format must be md|json");

  const artifactsDir = flags["artifacts-dir"] ? path.resolve(root, String(flags["artifacts-dir"])) : path.join(root, "artifacts");
  const archiveRoot = path.join(artifactsDir, "release-archive");
  const version = String(flags.version || "").trim();
  const snapshotId = String(flags["snapshot-id"] || "").trim();
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
    }
  }

  process.stdout.write(format === "json" ? `${JSON.stringify(report, null, 2)}\n` : md(report));
  if (!report.ok) process.exitCode = 1;
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e) + "\n");
  process.exitCode = 1;
});
