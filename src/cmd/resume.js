import { resolveRoot } from "../lib/paths.js";
import { buildResumeDigest, buildResumePack, formatResumeDigestMarkdown, formatResumeMarkdown } from "../core/resume.js";

function help() {
  return [
    "Usage:",
    "  rmemo resume [--format md|json] [--brief] [--timeline-days <n>] [--timeline-limit <n>] [--context-lines <n>]",
    "  rmemo resume digest [--format md|json] [--timeline-days <n>] [--timeline-limit <n>] [--max-timeline <n>] [--max-todos <n>]",
    ""
  ].join("\n");
}

export async function cmdResume({ flags, rest = [] }) {
  if (flags.help) {
    process.stdout.write(help());
    return;
  }

  const root = resolveRoot(flags);
  const format = String(flags.format || "md").toLowerCase();
  const brief = !!flags.brief;
  const sub = String(rest[0] || "").toLowerCase();

  const timelineDays = Number(flags["timeline-days"] || 14);
  const timelineLimit = Number(flags["timeline-limit"] || 40);
  const recentDays = Number(flags["recent-days"] || 7);

  if (sub && sub !== "digest") {
    throw new Error(`Unknown resume subcommand: ${sub}`);
  }

  if (sub === "digest") {
    const maxTimeline = Number(flags["max-timeline"] || 8);
    const maxTodos = Number(flags["max-todos"] || 5);
    const pack = await buildResumePack(root, {
      timelineDays,
      timelineLimit,
      includeTimeline: true,
      includeContext: false,
      recentDays
    });
    const digest = buildResumeDigest(pack, { maxTimeline, maxTodos });
    if (format === "json") {
      process.stdout.write(JSON.stringify(digest, null, 2) + "\n");
      return;
    }
    if (format !== "md") throw new Error(`Unsupported --format: ${format} (use md or json)`);
    process.stdout.write(formatResumeDigestMarkdown(digest));
    return;
  }

  const includeTimeline = flags["no-timeline"] ? false : true;
  const includeContext = flags["no-context"] ? false : true;
  const contextLines = Number(flags["context-lines"] || 100);

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
