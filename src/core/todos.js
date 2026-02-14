import fs from "node:fs/promises";
import { ensureDir, fileExists, writeText } from "../lib/io.js";
import { memDir, todosPath } from "../lib/paths.js";

const DEFAULT_TODOS = `# Todos

## Next
- (Write the next concrete step)

## Blockers
- (If any)
`;

export function parseTodos(md) {
  const out = { next: [], blockers: [], raw: String(md || "").trimEnd() };
  const lines = String(md || "").split("\n");
  let section = null;
  for (const line of lines) {
    const h = line.match(/^##\s+(.*)\s*$/);
    if (h) {
      const t = h[1].toLowerCase();
      if (t.startsWith("next")) section = "next";
      else if (t.startsWith("block")) section = "blockers";
      else section = null;
      continue;
    }
    const m = line.match(/^\s*-\s+(.*)\s*$/);
    if (m && section) out[section].push(m[1]);
  }
  return out;
}

function ensureSection(md, title) {
  const has = new RegExp(`^##\\s+${title}\\s*$`, "im").test(md);
  if (has) return md;
  const trimmed = md.trimEnd();
  if (!trimmed) return `## ${title}\n`;
  return trimmed + `\n\n## ${title}\n`;
}

function insertBulletIntoSection(md, title, bulletText) {
  let s = String(md || "");
  s = ensureSection(s, title);
  const lines = s.split("\n");
  const headerRe = new RegExp(`^##\\s+${title}\\s*$`, "i");
  const idx = lines.findIndex((l) => headerRe.test(l.trim()));
  if (idx === -1) return s.trimEnd() + `\n- ${bulletText}\n`;

  // Insert after header + blank lines, but before next section header.
  let insertAt = idx + 1;
  while (insertAt < lines.length && lines[insertAt].trim() === "") insertAt++;
  while (insertAt < lines.length && !/^##\s+/.test(lines[insertAt])) insertAt++;

  lines.splice(insertAt, 0, `- ${bulletText}`);
  return lines.join("\n").trimEnd() + "\n";
}

export async function ensureTodosFile(root) {
  await ensureDir(memDir(root));
  const p = todosPath(root);
  if (await fileExists(p)) return p;
  await writeText(p, DEFAULT_TODOS);
  return p;
}

export async function addTodoNext(root, text) {
  const p = await ensureTodosFile(root);
  const s = await fs.readFile(p, "utf8");
  const updated = insertBulletIntoSection(s, "Next", text);
  await fs.writeFile(p, updated, "utf8");
  return p;
}

export async function addTodoBlocker(root, text) {
  const p = await ensureTodosFile(root);
  const s = await fs.readFile(p, "utf8");
  const updated = insertBulletIntoSection(s, "Blockers", text);
  await fs.writeFile(p, updated, "utf8");
  return p;
}

