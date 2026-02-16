import { resolveRoot } from "../lib/paths.js";
import { exitWithError } from "../lib/io.js";
import { buildEmbeddingsIndex, embeddingsUpToDate, planEmbeddingsBuild, semanticSearch } from "../core/embeddings.js";
import { embedAuto } from "../core/embed_auto.js";
import { getEmbedStatus } from "../core/embed_status.js";

function help() {
  return [
    "Usage:",
    "  rmemo embed build [--provider mock|openai] [--kinds <list>]",
    "  rmemo embed plan [--provider mock|openai] [--kinds <list>] [--format md|json]",
    "  rmemo embed status [--format md|json]",
    "  rmemo embed auto [--check]",
    "  rmemo embed search <query> [--k <n>] [--min-score <n>] [--format md|json]",
    "",
    "Notes:",
    "- This builds a local embeddings index under .repo-memory/embeddings/ for semantic search.",
    "- provider=openai requires OPENAI_API_KEY (or --api-key).",
    "",
    "Examples:",
    "  rmemo embed build",
    "  rmemo embed build --provider openai --model text-embedding-3-small",
    "  rmemo embed plan --format json",
    "  rmemo embed status --format json",
    "  rmemo embed auto",
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
    const check = !!flags.check;

    if (check) {
      const r = await embeddingsUpToDate(root, { provider, model, apiKey, dim, kinds, recentDays });
      if (r.ok) {
        process.stdout.write("OK: embeddings index is up to date\n");
        return;
      }
      process.stderr.write(`FAIL: embeddings index is out of date (${r.reason}${r.file ? `: ${r.file}` : ""})\n`);
      process.exitCode = 1;
      return;
    }

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

  if (sub === "plan") {
    const provider = flags.provider ? String(flags.provider) : "mock";
    const model = flags.model ? String(flags.model) : "";
    const apiKey = flags["api-key"] ? String(flags["api-key"]) : "";
    const dim = flags.dim !== undefined ? Number(flags.dim) : 128;
    const kinds = parseKinds(flags.kinds) || undefined;
    const recentDays = flags["recent-days"] !== undefined ? Number(flags["recent-days"]) : undefined;
    const format = flags.format ? String(flags.format).toLowerCase() : "md";
    if (format !== "md" && format !== "json") return exitWithError("format must be md|json");

    const r = await planEmbeddingsBuild(root, { provider, model, apiKey, dim, kinds, recentDays });
    if (format === "json") {
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      return;
    }
    const lines = [];
    lines.push("# Embeddings Build Plan\n");
    lines.push(`- root: ${r.root}`);
    lines.push(`- upToDate: ${r.summary.upToDate ? "yes" : "no"}`);
    lines.push(`- files: total=${r.summary.totalFiles}, reuse=${r.summary.reuseFiles}, embed=${r.summary.embedFiles}`);
    lines.push(`- staleIndexedFiles: ${r.summary.staleIndexedFiles}`);
    if (r.staleIndexedFiles.length) {
      lines.push("\n## Stale Indexed Files");
      for (const s of r.staleIndexedFiles) lines.push(`- ${s}`);
    }
    lines.push("\n## File Actions");
    if (!r.files.length) lines.push("- (no files)");
    for (const f of r.files) {
      lines.push(`- [${f.action}] ${f.file} (${f.kind}) reason=${f.reason} indexedChunkIds=${f.indexedChunkIds}`);
    }
    process.stdout.write(lines.join("\n").trimEnd() + "\n");
    return;
  }

  if (sub === "auto") {
    const check = !!flags.check;
    const r = await embedAuto(root, { checkOnly: check });
    if (r.ok && r.skipped && r.reason === "up_to_date") {
      process.stdout.write("OK: embeddings are up to date\n");
      return;
    }
    if (r.ok && r.skipped) {
      process.stdout.write(`OK: embeddings skipped (${r.reason})\n`);
      return;
    }
    if (r.ok) {
      process.stdout.write("OK: embeddings rebuilt\n");
      return;
    }
    process.stderr.write(`FAIL: embeddings out of date (${r.reason}${r.file ? `: ${r.file}` : ""})\n`);
    process.exitCode = 1;
    return;
  }

  if (sub === "status") {
    const format = flags.format ? String(flags.format).toLowerCase() : "md";
    if (format !== "md" && format !== "json") return exitWithError("format must be md|json");
    const r = await getEmbedStatus(root, { checkUpToDate: true });
    if (format === "json") {
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      return;
    }
    const lines = [];
    lines.push("# Embeddings Status\n");
    lines.push(`- root: ${r.root}`);
    lines.push(`- status: ${r.status}`);
    lines.push(`- config.enabled: ${r.config.enabled ? "yes" : "no"} (${r.config.reason})`);
    lines.push(`- index.exists: ${r.index.exists ? "yes" : "no"} (items=${r.index.itemCount}, files=${r.index.fileCount})`);
    lines.push(`- provider: ${r.index.provider || "-"}`);
    lines.push(`- model: ${r.index.model || "-"}`);
    lines.push(`- dim: ${r.index.dim || "-"}`);
    if (r.index.generatedAt) lines.push(`- generatedAt: ${r.index.generatedAt}`);
    lines.push("");
    lines.push("## Up To Date");
    if (!r.upToDate) lines.push("- check: skipped");
    else lines.push(`- ok: ${r.upToDate.ok ? "yes" : "no"}${r.upToDate.reason ? ` (${r.upToDate.reason})` : ""}${r.upToDate.file ? `: ${r.upToDate.file}` : ""}`);
    if (r.errors?.length) {
      lines.push("");
      lines.push("## Errors");
      for (const e of r.errors) lines.push(`- ${e}`);
    }
    process.stdout.write(lines.join("\n").trimEnd() + "\n");
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
