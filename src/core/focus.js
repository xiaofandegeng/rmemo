import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, readText } from "../lib/io.js";
import { journalDir, manifestPath, rulesPath, todosPath } from "../lib/paths.js";
import { parseTodos } from "./todos.js";
import { semanticSearch } from "./embeddings.js";

function clampLines(s, maxLines) {
  const lines = String(s || "").split("\n");
  if (lines.length <= maxLines) return String(s || "").trimEnd();
  return lines.slice(0, maxLines).join("\n").trimEnd() + "\n[...truncated]";
}

async function readMaybe(abs, maxBytes = 2_000_000) {
  try {
    if (!(await fileExists(abs))) return null;
    return await readText(abs, maxBytes);
  } catch {
    return null;
  }
}

async function listRecentJournalFiles(root, recentDays) {
  const dir = journalDir(root);
  try {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    return ents
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort()
      .reverse()
      .slice(0, Math.max(0, recentDays));
  } catch {
    return [];
  }
}

async function buildStatusBrief(root, { snipLines = 80, recentDays = 3 } = {}) {
  const [rules, todosMd, manifestText] = await Promise.all([
    readMaybe(rulesPath(root), 512_000),
    readMaybe(todosPath(root), 512_000),
    readMaybe(manifestPath(root), 2_000_000)
  ]);

  let manifest = null;
  if (manifestText) {
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      manifest = { parseError: true };
    }
  }

  const todos = todosMd ? parseTodos(todosMd) : { next: [], blockers: [] };

  const journalFiles = await listRecentJournalFiles(root, recentDays);
  const journal = [];
  for (const fn of journalFiles) {
    // eslint-disable-next-line no-await-in-loop
    const t = await readMaybe(path.join(journalDir(root), fn), 512_000);
    if (!t) continue;
    journal.push({ file: fn, text: clampLines(t.trimEnd(), snipLines) });
  }

  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    title: manifest?.title || null,
    manifest,
    rules: rules ? clampLines(rules, snipLines) : null,
    todos,
    recentJournal: journal
  };
}

async function keywordSearch(root, { q, scope = "rules,todos,context,manifest,journal", recentDays = 14, maxHits = 50 } = {}) {
  const needle = String(q || "").toLowerCase().trim();
  if (!needle) throw new Error("Missing q");
  const scopes = new Set(String(scope || "").split(",").map((s) => s.trim()).filter(Boolean));
  const lim = Math.min(200, Math.max(1, Number(maxHits || 50)));

  async function searchInText(file, text) {
    const lines = String(text || "").split("\n");
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toLowerCase().includes(needle)) {
        hits.push({ file, line: i + 1, text: line.slice(0, 400) });
        if (hits.length >= lim) break;
      }
    }
    return hits;
  }

  const hits = [];

  if (scopes.has("rules")) {
    const s = await readMaybe(rulesPath(root), 2_000_000);
    if (s) hits.push(...(await searchInText(".repo-memory/rules.md", s)));
  }
  if (scopes.has("todos")) {
    const s = await readMaybe(todosPath(root), 2_000_000);
    if (s) hits.push(...(await searchInText(".repo-memory/todos.md", s)));
  }
  if (scopes.has("manifest")) {
    const s = await readMaybe(manifestPath(root), 5_000_000);
    if (s) hits.push(...(await searchInText(".repo-memory/manifest.json", s)));
  }
  if (scopes.has("journal")) {
    const files = await listRecentJournalFiles(root, Number(recentDays || 14));
    for (const fn of files) {
      // eslint-disable-next-line no-await-in-loop
      const s = await readMaybe(path.join(journalDir(root), fn), 2_000_000);
      if (!s) continue;
      hits.push(...(await searchInText(`.repo-memory/journal/${fn}`, s)));
      if (hits.length >= lim) break;
    }
  }

  return { schema: 1, root, q: String(q), hits: hits.slice(0, lim) };
}

export async function generateFocus(
  root,
  {
    q,
    mode = "semantic",
    format = "md",
    k = 8,
    minScore = 0.15,
    maxHits = 50,
    scope = "rules,todos,manifest,journal",
    recentDays = 14,
    includeStatus = true,
    statusRecentDays = 3
  } = {}
) {
  const query = String(q || "").trim();
  if (!query) throw new Error("Missing query");

  const pickedMode = String(mode || "semantic").toLowerCase();
  let status = null;
  if (includeStatus) status = await buildStatusBrief(root, { recentDays: statusRecentDays });

  let search = null;
  if (pickedMode === "semantic") {
    try {
      search = await semanticSearch(root, { q: query, k: Number(k || 8), minScore: Number(minScore || 0.15) });
    } catch (e) {
      // Fallback to keyword if embeddings index is missing.
      search = await keywordSearch(root, { q: query, scope, recentDays, maxHits });
      search.mode = "keyword_fallback";
      search.error = e?.message || String(e);
    }
  } else if (pickedMode === "keyword") {
    search = await keywordSearch(root, { q: query, scope, recentDays, maxHits });
    search.mode = "keyword";
  } else {
    throw new Error("mode must be semantic|keyword");
  }

  if (String(format || "md").toLowerCase() === "json") {
    return {
      json: {
        schema: 1,
        generatedAt: new Date().toISOString(),
        root,
        q: query,
        mode: pickedMode,
        status,
        search
      },
      markdown: null
    };
  }

  const lines = [];
  lines.push("# Focus\n");
  lines.push(`Query: ${query}\n`);
  lines.push(`Mode: ${pickedMode}\n`);
  lines.push(`Generated: ${new Date().toISOString()}\n`);

  if (status) {
    lines.push("\n## Status (Brief)\n");
    if (status.title) lines.push(`Repo: ${status.title}\n`);
    if (status.todos) {
      lines.push("\n### Next\n");
      if (!status.todos.next.length) lines.push("- (empty)\n");
      else lines.push(status.todos.next.map((x) => `- ${x}`).join("\n") + "\n");
      lines.push("\n### Blockers\n");
      if (!status.todos.blockers.length) lines.push("- (none)\n");
      else lines.push(status.todos.blockers.map((x) => `- ${x}`).join("\n") + "\n");
    }
  }

  lines.push("\n## Top Hits\n");
  const hits = Array.isArray(search?.hits) ? search.hits : [];
  if (!hits.length) {
    lines.push("- (no hits)\n");
    if (pickedMode === "semantic") {
      lines.push("\nTip: run `rmemo embed build` (or enable `embed` in .repo-memory/config.json) then try again.\n");
    }
  } else {
    for (const h of hits) {
      if (h.score !== undefined) lines.push(`- [${h.score}] ${h.file}:${h.startLine}-${h.endLine} (${h.kind})\n`);
      else lines.push(`- ${h.file}:${h.line}\n`);
      const t = String(h.text || "").trim();
      if (t) lines.push(`\n  ${t.replace(/\n/g, "\n  ")}\n\n`);
    }
  }

  return { markdown: lines.join("").trimEnd() + "\n", json: null };
}

