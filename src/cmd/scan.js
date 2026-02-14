import fs from "node:fs/promises";
import path from "node:path";
import { writeJson } from "../lib/io.js";
import { resolveRoot } from "../lib/paths.js";
import { indexPath, manifestPath, contextPath } from "../lib/paths.js";
import { scanRepo } from "../core/scan.js";
import { generateContext } from "../core/context.js";

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

  process.stdout.write(`Scanned: ${path.relative(process.cwd(), root)}\n`);
}

