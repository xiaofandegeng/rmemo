import fs from "node:fs/promises";
import path from "node:path";
import { writeJson } from "../lib/io.js";
import { resolveRoot } from "../lib/paths.js";
import { manifestPath, indexPath } from "../lib/paths.js";
import { scanRepo } from "../core/scan.js";
import { generateContext } from "../core/context.js";
import { contextPath, memDir } from "../lib/paths.js";
import { ensureRepoMemory } from "../core/memory.js";
import { applyProfile, recommendProfileFromManifest } from "../core/profiles.js";

export async function cmdInit({ flags }) {
  const root = resolveRoot(flags);

  const preferGit = flags["no-git"] ? false : true;
  const maxFiles = Number(flags["max-files"] || 4000);
  const { manifest, index } = await scanRepo(root, { maxFiles, preferGit });

  // Profiles: apply team defaults (rules + config) based on repo scan.
  const force = !!flags.force;
  const profileId = flags.profile ? String(flags.profile).trim() : "";
  const auto = !!flags.auto;
  const tpl = flags.template ? String(flags.template).trim() : "";

  if (profileId) {
    await applyProfile(root, profileId, { force });
  } else if (auto) {
    const rec = recommendProfileFromManifest(manifest);
    await applyProfile(root, rec, { force });
    process.stdout.write(`Auto profile: ${rec}\n`);
  } else {
    await ensureRepoMemory(root, { template: tpl, force });
  }

  await writeJson(manifestPath(root), manifest);
  await writeJson(indexPath(root), index);

  const snipLines = Number(flags["snip-lines"] || 120);
  const recentDays = Number(flags["recent-days"] || 7);
  const ctx = await generateContext(root, { snipLines, recentDays });
  await fs.writeFile(contextPath(root), ctx, "utf8");

  process.stdout.write(`Initialized: ${path.relative(process.cwd(), memDir(root))}\n`);
}
