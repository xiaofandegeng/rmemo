import { resolveRoot } from "../lib/paths.js";
import { exitWithError } from "../lib/io.js";
import {
  checkSetup,
  formatSetupCheckSummary,
  formatSetupSummary,
  formatSetupUninstallSummary,
  parseHookListFromFlags,
  setupRepo,
  uninstallSetup
} from "../core/setup.js";
import { parseSyncTargetsFromFlags } from "../core/sync.js";

export async function cmdSetup({ flags }) {
  const root = resolveRoot(flags);
  const force = !!flags.force;
  const hooks = parseHookListFromFlags(flags);
  const targets = parseSyncTargetsFromFlags(flags);
  const checkOnly = !!flags.check;
  const uninstall = !!flags.uninstall;
  const removeConfig = !!flags["remove-config"];
  const format = String(flags.format || "md").toLowerCase();

  try {
    if (uninstall) {
      const r = await uninstallSetup({ root, hooks, removeConfig });
      process.stdout.write(formatSetupUninstallSummary(r));
      const skipped = r.hooks.some((h) => h.skipped);
      if (skipped) process.exitCode = 2;
      return;
    }

    if (checkOnly) {
      const r = await checkSetup({ root, targets, hooks });
      if (format === "json") {
        process.stdout.write(
          JSON.stringify(
            {
              schema: 1,
              ok: r.ok,
              root: r.repoRoot,
              config: r.config,
              hooks: r.hooks
            },
            null,
            2
          ) + "\n"
        );
      } else {
        process.stdout.write(formatSetupCheckSummary(r));
      }
      if (!r.ok) process.exitCode = 2;
      return;
    }

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
