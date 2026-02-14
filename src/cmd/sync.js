import { resolveRoot } from "../lib/paths.js";
import { exitWithError } from "../lib/io.js";
import { formatSyncSummary, parseSyncTargetsFromFlags, syncAiInstructions } from "../core/sync.js";

export async function cmdSync({ flags }) {
  const root = resolveRoot(flags);
  const force = !!flags.force;
  const checkOnly = !!flags.check;
  const dryRun = !!flags["dry-run"] || !!flags.dryrun;
  const targets = parseSyncTargetsFromFlags(flags);

  try {
    const r = await syncAiInstructions({ root, targets, force, checkOnly, dryRun });
    process.stdout.write(formatSyncSummary(r, { checkOnly, dryRun }));

    if (r.results.some((x) => x.skipped)) {
      // Existing file not managed by rmemo; treat as failure for CI/check mode.
      process.exitCode = 2;
      return;
    }

    if (checkOnly && r.results.some((x) => x.changed)) {
      process.exitCode = 2;
      return;
    }
  } catch (err) {
    exitWithError(err?.message || String(err));
  }
}

