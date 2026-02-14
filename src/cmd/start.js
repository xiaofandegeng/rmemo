import fs from "node:fs/promises";
import path from "node:path";
import { resolveRoot } from "../lib/paths.js";
import { manifestPath, indexPath, contextPath } from "../lib/paths.js";
import { writeJson } from "../lib/io.js";
import { scanRepo } from "../core/scan.js";
import { generateContext } from "../core/context.js";
import { cmdStatus } from "./status.js";

export async function cmdStart({ flags }) {
  const root = resolveRoot(flags);
  const preferGit = flags["no-git"] ? false : true;
  const maxFiles = Number(flags["max-files"] || 4000);

  // 1) Scan and persist
  const { manifest, index } = await scanRepo(root, { maxFiles, preferGit });
  await writeJson(manifestPath(root), manifest);
  await writeJson(indexPath(root), index);

  // 2) Generate context pack
  const snipLines = Number(flags["snip-lines"] || 120);
  const recentDays = Number(flags["recent-days"] || 7);
  const ctx = await generateContext(root, { snipLines, recentDays });
  await fs.writeFile(contextPath(root), ctx, "utf8");

  // 3) Print status (md) to stdout (paste-ready)
  process.stdout.write("\n");
  await cmdStatus({ flags: { ...flags, format: "md" } });

  const ctxRel = path.relative(process.cwd(), contextPath(root));
  process.stdout.write(
    [
      "",
      "## Paste To AI (Start Of Day)",
      "",
      `1. Paste file: ${ctxRel}`,
      "2. If needed, also paste the Status above",
      ""
    ].join("\n")
  );
}

