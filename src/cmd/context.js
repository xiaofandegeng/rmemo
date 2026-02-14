import fs from "node:fs/promises";
import path from "node:path";
import { resolveRoot } from "../lib/paths.js";
import { generateContext } from "../core/context.js";
import { contextPath } from "../lib/paths.js";

export async function cmdContext({ flags }) {
  const root = resolveRoot(flags);
  const snipLines = Number(flags["snip-lines"] || 120);
  const recentDays = Number(flags["recent-days"] || 7);
  const s = await generateContext(root, { snipLines, recentDays });
  await fs.writeFile(contextPath(root), s, "utf8");
  process.stdout.write(`Wrote: ${path.relative(process.cwd(), contextPath(root))}\n`);
}

