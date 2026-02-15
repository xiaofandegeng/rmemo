import { resolveRoot } from "../lib/paths.js";
import { generateFocus } from "../core/focus.js";

function help() {
  return [
    "Usage:",
    "  rmemo focus <query> [--mode semantic|keyword] [--format md|json]",
    "",
    "Options:",
    "  --mode <semantic|keyword>    Search mode (default: semantic; falls back to keyword if embeddings missing)",
    "  --k <n>                      Top-k hits for semantic search (default: 8)",
    "  --min-score <n>              Minimum cosine similarity (default: 0.15)",
    "  --max-hits <n>               Max hits for keyword search (default: 50)",
    "  --recent-days <n>            Keyword search journal window (default: 14)",
    "  --no-status                  Do not include brief status section",
    "",
    "Examples:",
    "  rmemo focus \"auth token refresh\"",
    "  rmemo focus \"login flow\" --mode keyword",
    "  rmemo focus \"why build failed\" --format json",
    ""
  ].join("\n");
}

export async function cmdFocus({ rest, flags }) {
  if (flags.help) {
    process.stdout.write(help() + "\n");
    return;
  }

  const root = resolveRoot(flags);
  const q = rest.join(" ").trim();
  if (!q) {
    process.stderr.write("Missing query.\n\n" + help() + "\n");
    process.exitCode = 2;
    return;
  }

  const format = String(flags.format || "md").toLowerCase();
  const mode = String(flags.mode || "semantic").toLowerCase();
  const k = flags.k !== undefined ? Number(flags.k) : 8;
  const minScore = flags["min-score"] !== undefined ? Number(flags["min-score"]) : 0.15;
  const maxHits = flags["max-hits"] !== undefined ? Number(flags["max-hits"]) : 50;
  const recentDays = flags["recent-days"] !== undefined ? Number(flags["recent-days"]) : 14;
  const includeStatus = flags["no-status"] ? false : true;

  const r = await generateFocus(root, { q, mode, format, k, minScore, maxHits, recentDays, includeStatus });
  if (format === "json") {
    process.stdout.write(JSON.stringify(r.json, null, 2) + "\n");
    return;
  }
  process.stdout.write(r.markdown);
}
