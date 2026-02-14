import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, fileExists, writeText } from "../lib/io.js";
import { resolveRoot } from "../lib/paths.js";
import { journalDir, memDir, todosPath } from "../lib/paths.js";
import { nowHm, todayYmd } from "../lib/time.js";
import { readStdinText } from "../lib/stdin.js";

function normalizeNote(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  // Collapse consecutive blank lines.
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

async function appendJournal(root, text) {
  await ensureDir(memDir(root));
  await ensureDir(journalDir(root));

  const fn = `${todayYmd()}.md`;
  const p = path.join(journalDir(root), fn);

  const stamp = nowHm();
  const body = text.includes("\n") ? `\n\n${text}\n` : `${text}\n`;
  const entry = `\n## ${stamp} Done\n${body}`;

  if (await fileExists(p)) {
    await fs.appendFile(p, entry, "utf8");
  } else {
    const head = `# Journal ${todayYmd()}\n`;
    await fs.writeFile(p, head + entry, "utf8");
  }

  return p;
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
  const stdinText = normalizeNote(await readStdinText());

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

