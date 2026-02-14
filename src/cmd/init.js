import fs from "node:fs/promises";
import path from "node:path";
import { writeJson } from "../lib/io.js";
import { resolveRoot } from "../lib/paths.js";
import { manifestPath, indexPath } from "../lib/paths.js";
import { scanRepo } from "../core/scan.js";
import { generateContext } from "../core/context.js";
import { contextPath, memDir } from "../lib/paths.js";
import { ensureRepoMemory } from "../core/memory.js";

export async function cmdInit({ flags }) {
  const root = resolveRoot(flags);

  const tpl = flags.template ? String(flags.template).trim() : "";
  await ensureRepoMemory(root, { template: tpl, force: !!flags.force });

  const preferGit = flags["no-git"] ? false : true;
  const maxFiles = Number(flags["max-files"] || 4000);
  const { manifest, index } = await scanRepo(root, { maxFiles, preferGit });

  await writeJson(manifestPath(root), manifest);
  await writeJson(indexPath(root), index);

  const snipLines = Number(flags["snip-lines"] || 120);
  const recentDays = Number(flags["recent-days"] || 7);
  const ctx = await generateContext(root, { snipLines, recentDays });
  await fs.writeFile(contextPath(root), ctx, "utf8");

  process.stdout.write(`Initialized: ${path.relative(process.cwd(), memDir(root))}\n`);
}
