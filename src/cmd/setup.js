import { resolveRoot } from "../lib/paths.js";
import { exitWithError } from "../lib/io.js";
import { formatSetupSummary, parseHookListFromFlags, setupRepo } from "../core/setup.js";
import { parseSyncTargetsFromFlags } from "../core/sync.js";

export async function cmdSetup({ flags }) {
  const root = resolveRoot(flags);
  const force = !!flags.force;
  const hooks = parseHookListFromFlags(flags);
  const targets = parseSyncTargetsFromFlags(flags);

  try {
    const r = await setupRepo({ root, targets, hooks, force });
    process.stdout.write(formatSetupSummary(r));
    const skipped = r.hooks.some((h) => h.skipped);
    if (skipped) process.exitCode = 2;
  } catch (err) {
    if (err?.code === "RMEMO_NOT_GIT") {
      process.stderr.write(String(err.message).trimEnd() + "\n");
      process.exitCode = 2;
      return;
    }
    exitWithError(err?.stack || err?.message || String(err));
  }
}

