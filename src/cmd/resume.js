import { resolveRoot } from "../lib/paths.js";
import { buildResumePack, formatResumeMarkdown } from "../core/resume.js";

export async function cmdResume({ flags }) {
  const root = resolveRoot(flags);
  const format = String(flags.format || "md").toLowerCase();
  const brief = !!flags.brief;

  const timelineDays = Number(flags["timeline-days"] || 14);
  const timelineLimit = Number(flags["timeline-limit"] || 40);
  const includeTimeline = flags["no-timeline"] ? false : true;
  const includeContext = flags["no-context"] ? false : true;
  const contextLines = Number(flags["context-lines"] || 100);
  const recentDays = Number(flags["recent-days"] || 7);

  const pack = await buildResumePack(root, {
    timelineDays,
    timelineLimit,
    includeTimeline,
    includeContext,
    contextLines,
    recentDays
  });

  if (format === "json") {
    process.stdout.write(JSON.stringify(pack, null, 2) + "\n");
    return;
  }
  if (format !== "md") throw new Error(`Unsupported --format: ${format} (use md or json)`);

  process.stdout.write(formatResumeMarkdown(pack, { brief }));
}
