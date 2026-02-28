import path from "node:path";
import { resolveRoot } from "../lib/paths.js";
import { appendJournalEntry } from "../core/journal.js";
import { runKnowledgeAutoExtract } from "../core/knowledge_auto.js";

export async function cmdLog({ rest, flags }) {
  const root = resolveRoot(flags);
  const text = rest.join(" ").trim();
  if (!text) throw new Error("Missing log text. Usage: rmemo log <text>");

  const p = await appendJournalEntry(root, { kind: "Log", text });
  const memory = await runKnowledgeAutoExtract(root, { reason: "log", sourcePrefix: "cli:auto" });
  if (!memory.ok) {
    process.stderr.write(`warn: auto memory extract failed: ${memory.error || "unknown"}\n`);
  }
  process.stdout.write(`Logged: ${path.relative(process.cwd(), p)}\n`);
}
