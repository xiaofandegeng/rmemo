import path from "node:path";
import { resolveRoot } from "../lib/paths.js";
import { readStdinText } from "../lib/stdin.js";
import { appendJournalEntry } from "../core/journal.js";
import { addTodoBlocker, addTodoNext } from "../core/todos.js";
import { runKnowledgeAutoExtract } from "../core/knowledge_auto.js";

function normalizeNote(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  // Collapse consecutive blank lines.
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

async function appendJournal(root, text) {
  return await appendJournalEntry(root, { kind: "Done", text });
}

async function maybeAppendNext(root, nextText) {
  if (!nextText) return null;
  const p = await addTodoNext(root, nextText);
  return p;
}

export async function cmdDone({ rest, flags }) {
  const root = resolveRoot(flags);

  const next = flags.next ? String(flags.next).trim() : "";
  const blocker = flags.blocker ? String(flags.blocker).trim() : "";
  const argText = normalizeNote(rest.join(" "));
  const stdinText = argText ? "" : normalizeNote(await readStdinText());

  const text = argText || stdinText;
  if (!text) {
    process.stderr.write(
      [
        "Missing note text.",
        "Usage:",
        "  rmemo done \"today summary\"",
        "  echo \"today summary\" | rmemo done",
        "Options:",
        "  --next \"tomorrow's next step\""
      ].join("\n") + "\n"
    );
    process.exitCode = 2;
    return;
  }

  const jp = await appendJournal(root, text);
  const tp = await maybeAppendNext(root, next);
  const bp = blocker ? await addTodoBlocker(root, blocker) : null;
  const memory = await runKnowledgeAutoExtract(root, { reason: "done", sourcePrefix: "cli:auto" });

  process.stdout.write(`Wrote journal: ${path.relative(process.cwd(), jp)}\n`);
  if (tp) process.stdout.write(`Updated todos: ${path.relative(process.cwd(), tp)}\n`);
  if (bp && bp !== tp) process.stdout.write(`Updated todos: ${path.relative(process.cwd(), bp)}\n`);
  if (!memory.ok) {
    process.stderr.write(`warn: auto memory extract failed: ${memory.error || "unknown"}\n`);
  }
}
