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

function splitList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseEmbedConfigFromFlags(flags) {
  const hasAny =
    !!flags.embed ||
    !!flags["no-embed"] ||
    flags["embed-provider"] !== undefined ||
    flags["embed-model"] !== undefined ||
    flags["embed-dim"] !== undefined ||
    flags["embed-kinds"] !== undefined ||
    flags["embed-recent-days"] !== undefined ||
    flags["embed-max-chunks-per-file"] !== undefined ||
    flags["embed-max-chars-per-chunk"] !== undefined ||
    flags["embed-overlap-chars"] !== undefined ||
    flags["embed-max-total-chunks"] !== undefined;
  if (!hasAny) return null;

  const enabled = flags["no-embed"] ? false : !!flags.embed;
  const out = { enabled };
  if (!enabled) return out;

  if (flags["embed-provider"] !== undefined) out.provider = String(flags["embed-provider"]);
  if (flags["embed-model"] !== undefined) out.model = String(flags["embed-model"]);
  if (flags["embed-dim"] !== undefined) out.dim = Number(flags["embed-dim"]);
  if (flags["embed-kinds"] !== undefined) out.kinds = splitList(flags["embed-kinds"]);
  if (flags["embed-recent-days"] !== undefined) out.recentDays = Number(flags["embed-recent-days"]);
  if (flags["embed-max-chunks-per-file"] !== undefined) out.maxChunksPerFile = Number(flags["embed-max-chunks-per-file"]);
  if (flags["embed-max-chars-per-chunk"] !== undefined) out.maxCharsPerChunk = Number(flags["embed-max-chars-per-chunk"]);
  if (flags["embed-overlap-chars"] !== undefined) out.overlapChars = Number(flags["embed-overlap-chars"]);
  if (flags["embed-max-total-chunks"] !== undefined) out.maxTotalChunks = Number(flags["embed-max-total-chunks"]);
  return out;
}

export async function cmdSetup({ flags }) {
  const root = resolveRoot(flags);
  const force = !!flags.force;
  const hooks = parseHookListFromFlags(flags);
  const targets = parseSyncTargetsFromFlags(flags);
  const embed = parseEmbedConfigFromFlags(flags);
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

    const r = await setupRepo({ root, targets, hooks, embed, force });
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
