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

  const r = await generateHandoff(root, { preferGit, maxFiles, snipLines, recentDays, since, staged });

  // Paste-ready output (also written to `.repo-memory/handoff.md`).
  process.stdout.write(r.markdown);
}

