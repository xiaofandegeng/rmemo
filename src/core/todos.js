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

function findSectionRange(lines, title) {
  const headerRe = new RegExp(`^##\\s+${title}\\s*$`, "i");
  const start = lines.findIndex((l) => headerRe.test(l.trim()));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !/^##\s+/.test(lines[end])) end++;
  return { start, end };
}

function insertBulletIntoSection(md, title, bulletText) {
  let s = String(md || "");
  s = ensureSection(s, title);
  const lines = s.split("\n");
  const headerRe = new RegExp(`^##\\s+${title}\\s*$`, "i");
  const idx = lines.findIndex((l) => headerRe.test(l.trim()));
  if (idx === -1) return s.trimEnd() + `\n- ${bulletText}\n`;

  // Drop default template placeholder bullets once real items are being added.
  const range = findSectionRange(lines, title);
  if (range) {
    const placeholder =
      title.toLowerCase() === "next"
        ? /^\s*-\s+\(Write the next concrete step\)\s*$/
        : title.toLowerCase() === "blockers"
          ? /^\s*-\s+\(If any\)\s*$/
          : null;
    if (placeholder) {
      for (let i = range.start + 1; i < range.end; i++) {
        if (placeholder.test(lines[i])) {
          lines.splice(i, 1);
          break;
        }
      }
    }
  }

  // Insert after header + blank lines, but before next section header.
  let insertAt = idx + 1;
  while (insertAt < lines.length && lines[insertAt].trim() === "") insertAt++;
  while (insertAt < lines.length && !/^##\s+/.test(lines[insertAt])) insertAt++;

  lines.splice(insertAt, 0, `- ${bulletText}`);
  return lines.join("\n").trimEnd() + "\n";
}

function removeNthBulletFromSection(md, title, n1) {
  const n = Number(n1);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Index must be a positive integer (got: ${n1})`);

  const lines = String(md || "").split("\n");
  const range = findSectionRange(lines, title);
  if (!range) throw new Error(`Missing section: ## ${title}`);

  const bulletIdxs = [];
  for (let i = range.start + 1; i < range.end; i++) {
    if (/^\s*-\s+/.test(lines[i])) bulletIdxs.push(i);
  }
  if (n > bulletIdxs.length) throw new Error(`No such item: ${title} #${n} (total: ${bulletIdxs.length})`);

  const rmAt = bulletIdxs[n - 1];
  lines.splice(rmAt, 1);
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

export async function removeTodoNextByIndex(root, index1) {
  const p = await ensureTodosFile(root);
  const s = await fs.readFile(p, "utf8");
  const updated = removeNthBulletFromSection(s, "Next", index1);
  await fs.writeFile(p, updated, "utf8");
  return p;
}

export async function removeTodoBlockerByIndex(root, index1) {
  const p = await ensureTodosFile(root);
  const s = await fs.readFile(p, "utf8");
  const updated = removeNthBulletFromSection(s, "Blockers", index1);
  await fs.writeFile(p, updated, "utf8");
  return p;
}
