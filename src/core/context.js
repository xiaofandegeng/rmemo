import path from "node:path";
import fs from "node:fs/promises";
import { fileExists, readText } from "../lib/io.js";
import { contextPath, indexPath, journalDir, manifestPath, rulesPath, todosPath } from "../lib/paths.js";
import { todayYmd } from "../lib/time.js";

function clampLines(s, maxLines) {
  const lines = s.split("\n");
  if (lines.length <= maxLines) return s.trimEnd();
  return lines.slice(0, maxLines).join("\n").trimEnd() + "\n[...truncated]";
}

async function readMaybe(p, maxBytes) {
  try {
    if (!(await fileExists(p))) return null;
    return await readText(p, maxBytes);
  } catch {
    return null;
  }
}

async function listRecentJournals(root, recentDays) {
  const dir = journalDir(root);
  try {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    const files = ents
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort()
      .reverse();
    return files.slice(0, Math.max(0, recentDays));
  } catch {
    return [];
  }
}

function formatJsonBlock(title, obj) {
  return `## ${title}\n\n\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\`\n`;
}

export async function generateContext(root, { snipLines = 120, recentDays = 7 } = {}) {
  const manifest = await readMaybe(manifestPath(root), 2_000_000);
  const rules = await readMaybe(rulesPath(root), 512_000);
  const todos = await readMaybe(todosPath(root), 256_000);
  const index = await readMaybe(indexPath(root), 5_000_000);

  const ctxParts = [];
  ctxParts.push(`# Repo Context Pack\n`);
  ctxParts.push(`Generated: ${new Date().toISOString()}\n`);
  ctxParts.push(`Root: ${root}\n`);
  ctxParts.push(`Today: ${todayYmd()}\n`);

  ctxParts.push(`## How To Use This\n`);
  ctxParts.push(
    [
      "- Read Rules first. Follow them strictly.",
      "- Then read Manifest and Key Files list to understand structure.",
      "- Then read Recent Journal to continue work without re-discovery."
    ].join("\n") + "\n"
  );

  if (rules) {
    ctxParts.push(`## Rules\n\n` + clampLines(rules, snipLines) + "\n");
  } else {
    ctxParts.push(`## Rules\n\n(No rules yet. Run: rmemo init)\n`);
  }

  if (manifest) {
    try {
      ctxParts.push(formatJsonBlock("Manifest", JSON.parse(manifest)));
    } catch {
      ctxParts.push(`## Manifest\n\n` + clampLines(manifest, snipLines) + "\n");
    }
  }

  if (todos) {
    ctxParts.push(`## Todos\n\n` + clampLines(todos, snipLines) + "\n");
  }

  if (index) {
    try {
      const idx = JSON.parse(index);
      const files = Array.isArray(idx.files) ? idx.files : [];
      ctxParts.push(`## File Index (Top)\n\n`);
      ctxParts.push("```text\n" + files.slice(0, 300).join("\n") + "\n```" + "\n");
      if (files.length > 300) ctxParts.push(`(Index truncated. Total files in index: ${files.length})\n`);
    } catch {
      // ignore
    }
  }

  const recent = await listRecentJournals(root, recentDays);
  if (recent.length) {
    ctxParts.push(`## Recent Journal\n`);
    for (const fn of recent) {
      const jp = path.join(journalDir(root), fn);
      const s = await readMaybe(jp, 512_000);
      if (!s) continue;
      ctxParts.push(`### ${fn}\n\n` + clampLines(s, snipLines) + "\n");
    }
  }

  return ctxParts.join("\n").trimEnd() + "\n";
}

export async function ensureContextFile(root, opts) {
  const p = contextPath(root);
  if (await fileExists(p)) return p;
  const s = await generateContext(root, opts);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, s, "utf8");
  return p;
}

