import fs from "node:fs/promises";
import path from "node:path";
import { writeJson } from "../lib/io.js";
import { resolveRoot } from "../lib/paths.js";
import { indexPath, manifestPath, contextPath } from "../lib/paths.js";
import { scanRepo } from "../core/scan.js";
import { generateContext } from "../core/context.js";

function renderScanMd(manifest) {
  const parts = [];
  parts.push(`# Scan Summary\n`);
  parts.push(`Generated: ${manifest.generatedAt}\n`);
  if (manifest.title) parts.push(`Repo: ${manifest.title}\n`);
  parts.push(`Root: ${manifest.root}\n`);
  parts.push(`Using git: ${manifest.usingGit ? "yes" : "no"}\n`);
  parts.push(`Files indexed: ${manifest.fileCount}\n`);

  if (manifest.monorepo?.signals?.length) parts.push(`\n## Monorepo Signals\n\n- ${manifest.monorepo.signals.join("\n- ")}\n`);
  if (manifest.docsRoots?.length) parts.push(`\n## Docs Roots\n\n- ${manifest.docsRoots.join("\n- ")}\n`);
  if (manifest.apiContracts?.length) parts.push(`\n## API Contracts\n\n- ${manifest.apiContracts.join("\n- ")}\n`);

  if (manifest.subprojects?.length) {
    parts.push(`\n## Subprojects (Heuristic)\n`);
    for (const sp of manifest.subprojects.slice(0, 20)) {
      const reasons = (sp.reasons || []).join(", ");
      parts.push(`- ${sp.dir}${reasons ? ` (${reasons})` : ""}`);
    }
    parts.push("");
  }

  if (manifest.keyFiles?.length) parts.push(`\n## Key Files\n\n- ${manifest.keyFiles.join("\n- ")}\n`);
  if (manifest.topDirs?.length) {
    const dirs = manifest.topDirs.slice(0, 12).map((d) => `${d.name} (${d.fileCount})`);
    parts.push(`\n## Top Dirs\n\n- ${dirs.join("\n- ")}\n`);
  }
  return parts.join("\n").trimEnd() + "\n";
}

export async function cmdScan({ flags }) {
  const root = resolveRoot(flags);
  const preferGit = flags["no-git"] ? false : true;
  const maxFiles = Number(flags["max-files"] || 4000);
  const { manifest, index } = await scanRepo(root, { maxFiles, preferGit });

  await writeJson(manifestPath(root), manifest);
  await writeJson(indexPath(root), index);

  const snipLines = Number(flags["snip-lines"] || 120);
  const recentDays = Number(flags["recent-days"] || 7);
  const ctx = await generateContext(root, { snipLines, recentDays });
  await fs.writeFile(contextPath(root), ctx, "utf8");

  const format = flags.format ? String(flags.format).toLowerCase() : "";
  if (format === "json") {
    process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
    return;
  }
  if (format === "md") {
    process.stdout.write(renderScanMd(manifest));
    return;
  }

  process.stdout.write(`Scanned: ${path.relative(process.cwd(), root)}\n`);
}
