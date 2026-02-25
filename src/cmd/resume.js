import { resolveRoot } from "../lib/paths.js";
import { buildResumeDigest, buildResumePack, formatResumeDigestMarkdown, formatResumeMarkdown } from "../core/resume.js";
import {
  compareResumeDigestSnapshots,
  formatResumeHistoryCompareMarkdown,
  formatResumeHistoryListMarkdown,
  formatResumeHistorySnapshotMarkdown,
  getResumeDigestSnapshot,
  listResumeDigestSnapshots,
  pruneResumeDigestSnapshots,
  saveResumeDigestSnapshot
} from "../core/resume_history.js";

function help() {
  return [
    "Usage:",
    "  rmemo resume [--format md|json] [--brief] [--timeline-days <n>] [--timeline-limit <n>] [--context-lines <n>]",
    "  rmemo resume digest [--format md|json] [--timeline-days <n>] [--timeline-limit <n>] [--max-timeline <n>] [--max-todos <n>]",
    "  rmemo resume history list [--format md|json] [--limit <n>]",
    "  rmemo resume history save [--format md|json] [--tag <name>] [--timeline-days <n>] [--timeline-limit <n>] [--max-timeline <n>] [--max-todos <n>]",
    "  rmemo resume history show <id> [--format md|json]",
    "  rmemo resume history compare <fromId> <toId> [--format md|json]",
    "  rmemo resume history prune [--format md|json] [--keep <n>] [--older-than-days <n>]",
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

  if (sub && sub !== "digest" && sub !== "history") {
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

  if (sub === "history") {
    const op = String(rest[1] || "list").toLowerCase();
    const outFormat = String(flags.format || "md").toLowerCase();
    if (outFormat !== "md" && outFormat !== "json") throw new Error(`Unsupported --format: ${outFormat} (use md or json)`);

    if (op === "list" || op === "ls") {
      const out = await listResumeDigestSnapshots(root, { limit: Number(flags.limit || 20) });
      if (outFormat === "json") process.stdout.write(JSON.stringify(out, null, 2) + "\n");
      else process.stdout.write(formatResumeHistoryListMarkdown(out));
      return;
    }

    if (op === "save") {
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
      const saved = await saveResumeDigestSnapshot(root, digest, { tag: String(flags.tag || ""), source: "cli" });
      if (outFormat === "json") process.stdout.write(JSON.stringify(saved, null, 2) + "\n");
      else process.stdout.write(`${formatResumeHistorySnapshotMarkdown(saved)}\n${formatResumeDigestMarkdown(saved.snapshot.digest)}`);
      return;
    }

    if (op === "show") {
      const id = String(rest[2] || "").trim();
      if (!id) throw new Error("Usage: rmemo resume history show <id>");
      const got = await getResumeDigestSnapshot(root, id);
      if (outFormat === "json") process.stdout.write(JSON.stringify(got, null, 2) + "\n");
      else process.stdout.write(`${formatResumeHistorySnapshotMarkdown(got)}\n${formatResumeDigestMarkdown(got.snapshot.digest)}`);
      return;
    }

    if (op === "compare" || op === "diff") {
      const fromId = String(rest[2] || "").trim();
      const toId = String(rest[3] || "").trim();
      if (!fromId || !toId) throw new Error("Usage: rmemo resume history compare <fromId> <toId>");
      const cmp = await compareResumeDigestSnapshots(root, { fromId, toId });
      if (outFormat === "json") process.stdout.write(JSON.stringify(cmp, null, 2) + "\n");
      else process.stdout.write(formatResumeHistoryCompareMarkdown(cmp));
      return;
    }

    if (op === "prune" || op === "clean") {
      const out = await pruneResumeDigestSnapshots(root, {
        keep: flags.keep,
        olderThanDays: flags["older-than-days"]
      });
      if (outFormat === "json") {
        process.stdout.write(JSON.stringify(out, null, 2) + "\n");
      } else {
        process.stdout.write(
          [
            "# Resume History Prune",
            "",
            `- keep: ${out.keep}`,
            `- olderThanDays: ${out.olderThanDays}`,
            `- before: ${out.before}`,
            `- after: ${out.after}`,
            `- pruned: ${out.pruned}`,
            out.deletedIds.length ? `- deletedIds: ${out.deletedIds.join(", ")}` : "- deletedIds: (none)",
            ""
          ].join("\n")
        );
      }
      return;
    }

    throw new Error(`Unknown resume history subcommand: ${op}`);
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
