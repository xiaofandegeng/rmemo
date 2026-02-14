import path from "node:path";
import { resolveRoot } from "../lib/paths.js";
import { appendJournalEntry } from "../core/journal.js";

export async function cmdLog({ rest, flags }) {
  const root = resolveRoot(flags);
  const text = rest.join(" ").trim();
  if (!text) throw new Error("Missing log text. Usage: rmemo log <text>");

  const p = await appendJournalEntry(root, { kind: "Log", text });
  process.stdout.write(`Logged: ${path.relative(process.cwd(), p)}\n`);
}
