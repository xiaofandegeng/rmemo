import { resolveRoot } from "../lib/paths.js";
import { buildTimeline, formatTimelineMarkdown } from "../core/timeline.js";

function parseInclude(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

export async function cmdTimeline({ flags }) {
  const root = resolveRoot(flags);
  const format = String(flags.format || "md").toLowerCase();
  const days = Number(flags.days || 14);
  const limit = Number(flags.limit || 80);
  const include = parseInclude(flags.include || "");
  const brief = !!flags.brief;

  const report = await buildTimeline(root, { days, limit, include });

  if (format === "json") {
    process.stdout.write(JSON.stringify({ ...report, root }, null, 2) + "\n");
    return;
  }

  if (format !== "md") {
    throw new Error(`Unsupported --format: ${format} (use md or json)`);
  }

  process.stdout.write(formatTimelineMarkdown(report, { brief }));
}
