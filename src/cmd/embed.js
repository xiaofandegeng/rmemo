import { resolveRoot } from "../lib/paths.js";
import { exitWithError } from "../lib/io.js";
import { buildEmbeddingsIndex, semanticSearch } from "../core/embeddings.js";

function help() {
  return [
    "Usage:",
    "  rmemo embed build [--provider mock|openai] [--kinds <list>]",
    "  rmemo embed search <query> [--k <n>] [--min-score <n>] [--format md|json]",
    "",
    "Notes:",
    "- This builds a local embeddings index under .repo-memory/embeddings/ for semantic search.",
    "- provider=openai requires OPENAI_API_KEY (or --api-key).",
    "",
    "Examples:",
    "  rmemo embed build",
    "  rmemo embed build --provider openai --model text-embedding-3-small",
    "  rmemo embed search \"where is auth token validated?\"",
    ""
  ].join("\\n");
}

function parseKinds(s) {
  const v = String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return v.length ? v : undefined;
}

export async function cmdEmbed({ rest, flags }) {
  if (flags.help) {
    process.stdout.write(help() + "\n");
    return;
  }

  const root = resolveRoot(flags);
  const sub = rest[0];

  if (sub === "build") {
    const provider = flags.provider ? String(flags.provider) : "mock";
    const model = flags.model ? String(flags.model) : "";
    const apiKey = flags["api-key"] ? String(flags["api-key"]) : "";
    const dim = flags.dim !== undefined ? Number(flags.dim) : 128;
    const kinds = parseKinds(flags.kinds) || undefined;
    const recentDays = flags["recent-days"] !== undefined ? Number(flags["recent-days"]) : undefined;
    const force = !!flags.force;

    const r = await buildEmbeddingsIndex(root, { provider, model, apiKey, dim, kinds, recentDays, force });
    process.stdout.write(
      [
        "OK: embeddings index built",
        `- provider: ${r.meta.provider}`,
        `- model: ${r.meta.model}`,
        `- items: ${r.meta.itemCount}`,
        `- reusedFromPreviousIndex: ${r.meta.reusedFromPreviousIndex ? "yes" : "no"}`,
        `- reusedFiles: ${r.meta.reusedFiles || 0}`,
        `- reusedItems: ${r.meta.reusedItems || 0}`,
        `- embeddedItems: ${r.meta.embeddedItems || 0}`,
        `- kinds: ${(r.meta.kinds || []).join(", ")}`,
        `- recentDays: ${r.meta.recentDays}`
      ].join("\n") + "\n"
    );
    return;
  }

  if (sub === "search") {
    const q = rest.slice(1).join(" ").trim();
    if (!q) return exitWithError("Missing query. Usage: rmemo embed search <query>");
    const k = flags.k !== undefined ? Number(flags.k) : 8;
    const minScore = flags["min-score"] !== undefined ? Number(flags["min-score"]) : 0.15;
    const format = flags.format ? String(flags.format).toLowerCase() : "md";
    if (format !== "md" && format !== "json") return exitWithError("format must be md|json");

    const r = await semanticSearch(root, { q, k, minScore });
    if (format === "json") {
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      return;
    }

    const lines = [];
    lines.push(`# Semantic Search\n`);
    lines.push(`Query: ${r.q}\n`);
    lines.push(`Provider: ${r.provider}${r.model ? ` (${r.model})` : ""}\n`);
    lines.push(`\n## Top Hits\n`);
    if (!r.hits.length) {
      lines.push(`- (no hits)\n`);
      process.stdout.write(lines.join("").trimEnd() + "\n");
      return;
    }
    for (const h of r.hits) {
      lines.push(`- [${h.score}] ${h.file}:${h.startLine}-${h.endLine} (${h.kind})\n`);
      lines.push(`\n  ${String(h.text || "").replace(/\n/g, "\n  ").trim()}\n\n`);
    }
    process.stdout.write(lines.join("").trimEnd() + "\n");
    return;
  }

  process.stdout.write(help() + "\n");
  process.exitCode = 1;
}
