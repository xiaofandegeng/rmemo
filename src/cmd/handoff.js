import { resolveRoot } from "../lib/paths.js";
import { generateHandoff } from "../core/handoff.js";

export async function cmdHandoff({ flags }) {
  const root = resolveRoot(flags);
  const preferGit = flags["no-git"] ? false : true;
  const maxFiles = Number(flags["max-files"] || 4000);
  const snipLines = Number(flags["snip-lines"] || 120);
  const recentDays = Number(flags["recent-days"] || 3);
  const since = flags.since ? String(flags.since) : "";
  const staged = !!flags.staged;
  const maxChanges = Number(flags["max-changes"] || 200);
  const format = String(flags.format || "md").toLowerCase();

  const r = await generateHandoff(root, { preferGit, maxFiles, snipLines, recentDays, since, staged, maxChanges, format });

  if (format === "json") {
    process.stdout.write(JSON.stringify(r.json, null, 2) + "\n");
    return;
  }

  process.stdout.write(r.markdown);
}
