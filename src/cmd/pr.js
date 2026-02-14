import { resolveRoot } from "../lib/paths.js";
import { exitWithError } from "../lib/io.js";
import { generatePr } from "../core/pr.js";

export async function cmdPr({ flags }) {
  const root = resolveRoot(flags);
  const preferGit = flags["no-git"] ? false : true;
  const maxFiles = Number(flags["max-files"] || 4000);
  const snipLines = Number(flags["snip-lines"] || 120);
  const recentDays = Number(flags["recent-days"] || 2);
  const base = flags.base ? String(flags.base) : "";
  const staged = !!flags.staged;
  const refresh = flags["no-refresh"] ? false : true;
  const format = String(flags.format || "md").toLowerCase();

  try {
    const r = await generatePr(root, { preferGit, maxFiles, snipLines, recentDays, base, staged, refresh });
    if (format === "json") {
      process.stdout.write(
        JSON.stringify(
          { schema: r.schema, generatedAt: r.generatedAt, root: r.root, out: r.out, baseRef: r.baseRef, baseSha: r.baseSha },
          null,
          2
        ) + "\n"
      );
      return;
    }
    process.stdout.write(r.markdown);
  } catch (err) {
    if (err?.code === "RMEMO_NOT_GIT" || err?.code === "RMEMO_NO_BASE") {
      process.stderr.write(String(err.message).trimEnd() + "\n");
      process.exitCode = 2;
      return;
    }
    exitWithError(err?.stack || err?.message || String(err));
  }
}
