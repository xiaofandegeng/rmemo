import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, fileExists } from "../lib/io.js";
import { journalDir, memDir } from "../lib/paths.js";
import { nowHm, todayYmd } from "../lib/time.js";

function formatEntry({ kind, text, stamp }) {
  const body = String(text || "").trimEnd();
  const normalized = body.includes("\n") ? `\n\n${body}\n` : `${body}\n`;
  return `\n## ${stamp} ${kind}\n${normalized}`;
}

export async function appendJournalEntry(root, { kind, text, date = todayYmd(), stamp = nowHm() }) {
  await ensureDir(memDir(root));
  await ensureDir(journalDir(root));

  const fn = `${date}.md`;
  const p = path.join(journalDir(root), fn);

  const entry = formatEntry({ kind, text, stamp });

  if (await fileExists(p)) {
    await fs.appendFile(p, entry, "utf8");
  } else {
    const head = `# Journal ${date}\n`;
    await fs.writeFile(p, head + entry, "utf8");
  }

  return p;
}

