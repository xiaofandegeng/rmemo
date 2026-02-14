import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, fileExists, writeText } from "../lib/io.js";
import { resolveRoot } from "../lib/paths.js";
import { memDir, todosPath } from "../lib/paths.js";
import { readStdinText } from "../lib/stdin.js";
import { appendJournalEntry } from "../core/journal.js";

function normalizeNote(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  // Collapse consecutive blank lines.
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

async function appendJournal(root, text) {
  return await appendJournalEntry(root, { kind: "Done", text });
}

function ensureTodosTemplate() {
  return `# Todos

## Next
- (Write the next concrete step)

## Blockers
- (If any)
`;
}

function appendNextBullet(todosMd, nextText) {
  const lines = todosMd.split("\n");
  const bullet = `- ${nextText}`;

  // Find "## Next" section.
  let idx = lines.findIndex((l) => /^##\s+Next\s*$/i.test(l.trim()));
  if (idx === -1) {
    // Create section at end.
    if (!todosMd.trim()) return `## Next\n${bullet}\n`;
    return todosMd.trimEnd() + `\n\n## Next\n${bullet}\n`;
  }

  // Insert after header and any blank lines, before next "## " header.
  let insertAt = idx + 1;
  while (insertAt < lines.length && lines[insertAt].trim() === "") insertAt++;
  while (insertAt < lines.length && !/^##\s+/.test(lines[insertAt])) insertAt++;

  lines.splice(insertAt, 0, bullet);
  return lines.join("\n").trimEnd() + "\n";
}

async function maybeAppendNext(root, nextText) {
  if (!nextText) return null;
  await ensureDir(memDir(root));

  const p = todosPath(root);
  let s = "";
  if (await fileExists(p)) {
    s = await fs.readFile(p, "utf8");
  } else {
    s = ensureTodosTemplate();
    await writeText(p, s);
  }

  const updated = appendNextBullet(s, nextText);
  await fs.writeFile(p, updated, "utf8");
  return p;
}

export async function cmdDone({ rest, flags }) {
  const root = resolveRoot(flags);

  const next = flags.next ? String(flags.next).trim() : "";
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

  process.stdout.write(`Wrote journal: ${path.relative(process.cwd(), jp)}\n`);
  if (tp) process.stdout.write(`Updated todos: ${path.relative(process.cwd(), tp)}\n`);
}
