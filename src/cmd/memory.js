import { resolveRoot } from "../lib/paths.js";
import {
  extractKnowledgeMemories,
  formatKnowledgeSearchMarkdown,
  linkKnowledgeMemories,
  searchKnowledgeMemories,
  writeKnowledgeMemory
} from "../core/knowledge_memory.js";

function help() {
  return [
    "Usage:",
    "  rmemo memory search [--format md|json] [--q <text>] [--topic <tag>] [--module <path>] [--type <kind>] [--commit <sha>] [--since <iso>] [--until <iso>] [--limit <n>]",
    "  rmemo memory extract [--format md|json] [--recent-days <n>] [--since <ref>] [--limit <n>] [--source <name>]",
    "  rmemo memory write --title <text> [--summary <text>] [--type <kind>] [--status <state>] [--tags <a,b>] [--modules <a,b>] [--source <name>]",
    "  rmemo memory write --id <memId> [--title <text>] [--summary <text>] [--status <state>] [--tags <a,b>] [--modules <a,b>]",
    "  rmemo memory link --from <memId> --to <memId> [--kind <rel>] [--note <text>] [--weight <n>] [--source <name>]",
    ""
  ].join("\n");
}

function parseList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function printJson(out) {
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

function printMd(lines) {
  process.stdout.write(lines.join("\n") + "\n");
}

export async function cmdMemory({ flags, rest = [] }) {
  if (flags.help) {
    process.stdout.write(help());
    return;
  }

  const root = resolveRoot(flags);
  const sub = String(rest[0] || "search").toLowerCase();
  const format = String(flags.format || "md").toLowerCase();
  if (format !== "md" && format !== "json") throw new Error(`Unsupported --format: ${format} (use md or json)`);

  if (sub === "search" || sub === "find") {
    const out = await searchKnowledgeMemories(root, {
      q: String(flags.q || ""),
      topic: String(flags.topic || ""),
      module: String(flags.module || ""),
      type: String(flags.type || ""),
      commit: String(flags.commit || ""),
      since: String(flags.since || ""),
      until: String(flags.until || ""),
      limit: Number(flags.limit || 20)
    });
    if (format === "json") {
      printJson(out);
      return;
    }
    process.stdout.write(formatKnowledgeSearchMarkdown(out));
    return;
  }

  if (sub === "extract") {
    const out = await extractKnowledgeMemories(root, {
      recentDays: Number(flags["recent-days"] || 7),
      since: String(flags.since || ""),
      limit: Number(flags.limit || 200),
      source: String(flags.source || "cli:auto")
    });
    if (format === "json") {
      printJson(out);
      return;
    }
    printMd([
      "# Knowledge Memory Extract",
      "",
      `- root: ${out.root}`,
      `- candidates: ${out.candidates}`,
      `- created: ${out.created}`,
      `- updated: ${out.updated}`,
      `- totalEntries: ${out.totalEntries}`,
      ""
    ]);
    return;
  }

  if (sub === "write") {
    const payload = {
      id: flags.id !== undefined ? String(flags.id) : undefined,
      key: flags.key !== undefined ? String(flags.key) : undefined,
      title: flags.title !== undefined ? String(flags.title) : undefined,
      summary: flags.summary !== undefined ? String(flags.summary) : undefined,
      type: flags.type !== undefined ? String(flags.type) : undefined,
      status: flags.status !== undefined ? String(flags.status) : undefined,
      source: String(flags.source || "cli"),
      confidence: flags.confidence !== undefined ? Number(flags.confidence) : undefined,
      tags: parseList(flags.tags),
      modules: parseList(flags.modules),
      relatedCommits: parseList(flags["related-commits"]),
      relatedFiles: parseList(flags["related-files"]),
      relatedTodos: parseList(flags["related-todos"]),
      relatedJournalFiles: parseList(flags["related-journal-files"])
    };
    const out = await writeKnowledgeMemory(root, payload);
    if (format === "json") {
      printJson(out);
      return;
    }
    const e = out.entry;
    printMd([
      "# Knowledge Memory Write",
      "",
      `- root: ${out.root}`,
      `- created: ${out.created ? "yes" : "no"}`,
      `- id: ${e.id}`,
      `- type: ${e.type}`,
      `- status: ${e.status}`,
      `- title: ${e.title}`,
      ""
    ]);
    return;
  }

  if (sub === "link") {
    const out = await linkKnowledgeMemories(root, {
      from: String(flags.from || ""),
      to: String(flags.to || ""),
      kind: String(flags.kind || "relates"),
      note: String(flags.note || ""),
      weight: Number(flags.weight || 1),
      source: String(flags.source || "cli")
    });
    if (format === "json") {
      printJson(out);
      return;
    }
    const r = out.relation;
    printMd([
      "# Knowledge Memory Link",
      "",
      `- root: ${out.root}`,
      `- created: ${out.created ? "yes" : "no"}`,
      `- relation: ${r.from} -[${r.kind}]-> ${r.to}`,
      `- weight: ${r.weight}`,
      ""
    ]);
    return;
  }

  throw new Error(`Unknown memory subcommand: ${sub}\n\n${help()}`);
}
