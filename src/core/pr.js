import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, readText, writeJson, writeText } from "../lib/io.js";
import { contextPath, indexPath, journalDir, manifestPath, prJsonPath, prPath, rulesPath, todosPath } from "../lib/paths.js";
import { ensureRepoMemory } from "./memory.js";
import { scanRepo } from "./scan.js";
import { generateContext } from "./context.js";
import { parseTodos } from "./todos.js";
import { getGitRangeData, getGitSummary, gitOk, mergeBase, resolveDefaultBaseRef } from "./git_summary.js";

function clampLines(s, maxLines) {
  const lines = String(s || "").split("\n");
  if (lines.length <= maxLines) return String(s || "").trimEnd();
  return lines.slice(0, maxLines).join("\n").trimEnd() + "\n[...truncated]";
}

function ensureTrailingNewline(s) {
  const t = String(s || "").replace(/\r\n/g, "\n").trimEnd();
  return t ? t + "\n" : "\n";
}

async function listRecentJournalFiles(root, recentDays) {
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

async function readMaybe(p, maxBytes = 512_000) {
  try {
    if (!(await fileExists(p))) return null;
    return await readText(p, maxBytes);
  } catch {
    return null;
  }
}

async function buildPrMarkdown(root, { snipLines, recentDays, baseRef, baseSha, staged } = {}) {
  const generatedAt = new Date().toISOString();

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
  const git = await getGitSummary(root, { since: baseSha, staged });

  const journalFiles = await listRecentJournalFiles(root, recentDays);
  const journal = [];
  for (const fn of journalFiles) {
    // eslint-disable-next-line no-await-in-loop
    const t = await readMaybe(path.join(journalDir(root), fn), 512_000);
    if (!t) continue;
    journal.push({ file: fn, text: t.trimEnd() });
  }

  const parts = [];
  parts.push(`# PR Summary\n`);
  parts.push(`Generated: ${generatedAt}\n`);
  parts.push(`Root: ${root}\n`);
  if (manifest?.title) parts.push(`Repo: ${manifest.title}\n`);

  parts.push(`\n## Range\n`);
  parts.push(`Base ref: \`${baseRef || "(unknown)"}\`\n`);
  parts.push(`Merge base: \`${baseSha || "(unknown)"}\`\n`);
  if (git?.head) parts.push(`Head: \`${git.head.slice(0, 12)}\`\n`);

  parts.push(`\n## What Changed\n`);
  if (git?.rangeLog) {
    parts.push(`\n### Commits\n\n\`\`\`text\n${git.rangeLog}\n\`\`\`\n`);
  } else {
    parts.push(`\n### Commits\n\n\`\`\`text\n(no commits detected)\n\`\`\`\n`);
  }
  parts.push(`### Files\n\n\`\`\`text\n${git?.rangeNames || "(no changes detected)"}\n\`\`\`\n`);

  parts.push(`\n## Status (Brief)\n`);
  parts.push(`### Next\n`);
  if (todos.next.length) parts.push(todos.next.map((x, i) => `${i + 1}. ${x}`).join("\n") + "\n");
  else parts.push(`- (empty)\n`);
  parts.push(`\n### Blockers\n`);
  if (todos.blockers.length) parts.push(todos.blockers.map((x, i) => `${i + 1}. ${x}`).join("\n") + "\n");
  else parts.push(`- (none)\n`);

  if (rules) {
    parts.push(`\n## Rules (Excerpt)\n\n`);
    parts.push(clampLines(rules, Math.min(snipLines, 120)) + "\n");
  }

  if (journal.length) {
    parts.push(`\n## Recent Journal\n`);
    for (const j of journal) {
      parts.push(`\n### ${j.file}\n\n`);
      parts.push(clampLines(j.text, Math.min(snipLines, 120)) + "\n");
    }
  }

  if (git) {
    parts.push(`\n## Working Tree (Debug)\n`);
    parts.push(`\n\`\`\`text\n${git.status || "(clean)"}\n\`\`\`\n`);
    parts.push(`\n\`\`\`text\n${git.diffNames || "(none)"}\n\`\`\`\n`);
  }

  parts.push(`\n## Notes\n`);
  parts.push(`- If reviewers need more context, attach/paste: \`.repo-memory/context.md\`\n`);
  parts.push(`- Keep changes aligned with instruction files: run \`rmemo sync\` when rules/todos change\n`);

  return ensureTrailingNewline(parts.join("").trimEnd());
}

async function buildPrJson(root, { snipLines, recentDays, baseRef, baseSha, staged, maxChanges } = {}) {
  const generatedAt = new Date().toISOString();

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
    journal.push({ file: fn, text: clampLines(t.trimEnd(), Math.min(snipLines, 120)) });
  }

  const git = await getGitRangeData(root, {
    sinceRef: baseSha,
    staged,
    maxCommits: maxChanges,
    maxFiles: maxChanges
  });

  return {
    schema: 1,
    generatedAt,
    root,
    title: manifest?.title || null,
    range: { baseRef, baseSha, head: git?.head || null },
    changes: { commits: git?.commits || [], files: git?.files || [] },
    status: { next: todos.next, blockers: todos.blockers },
    rulesExcerpt: rules ? clampLines(rules, Math.min(snipLines, 120)) : null,
    recentJournal: journal,
    git
  };
}

export async function generatePr(root, opts) {
  const {
    preferGit = true,
    maxFiles = 4000,
    snipLines = 120,
    recentDays = 2,
    base = "",
    staged = false,
    refresh = true,
    maxChanges = 200,
    format = "md"
  } = opts || {};

  await ensureRepoMemory(root);

  if (refresh) {
    const { manifest, index } = await scanRepo(root, { maxFiles, preferGit });
    await writeJson(manifestPath(root), manifest);
    await writeJson(indexPath(root), index);
    const ctx = await generateContext(root, { snipLines, recentDays: Math.max(7, recentDays) });
    await fs.writeFile(contextPath(root), ctx, "utf8");
  }

  if (!(await gitOk(root))) {
    const err = new Error(`rmemo pr requires a git repo under: ${root}`);
    err.code = "RMEMO_NOT_GIT";
    throw err;
  }

  const baseRef = base || (await resolveDefaultBaseRef(root));
  if (!baseRef) {
    const err = new Error(`Could not determine base ref. Pass: --base <ref>`);
    err.code = "RMEMO_NO_BASE";
    throw err;
  }

  const baseSha = await mergeBase(root, "HEAD", baseRef);
  const md = await buildPrMarkdown(root, { snipLines, recentDays, baseRef, baseSha, staged });
  const out = prPath(root);
  await writeText(out, md);

  let json = null;
  let outJson = null;
  if (format === "json") {
    json = await buildPrJson(root, { snipLines, recentDays, baseRef, baseSha, staged, maxChanges });
    outJson = prJsonPath(root);
    await writeText(outJson, JSON.stringify(json, null, 2) + "\n");
  }

  return { schema: 1, generatedAt: new Date().toISOString(), root, out, outJson, baseRef, baseSha, markdown: md, json };
}
