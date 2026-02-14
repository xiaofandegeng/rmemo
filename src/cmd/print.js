import fs from "node:fs/promises";
import { resolveRoot } from "../lib/paths.js";
import { contextPath } from "../lib/paths.js";
import { ensureContextFile } from "../core/context.js";

export async function cmdPrint({ flags }) {
  const root = resolveRoot(flags);
  await ensureContextFile(root, {
    snipLines: Number(flags["snip-lines"] || 120),
    recentDays: Number(flags["recent-days"] || 7)
  });
  const s = await fs.readFile(contextPath(root), "utf8");
  process.stdout.write(s);
}

