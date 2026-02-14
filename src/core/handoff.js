import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, readText, writeJson, writeText } from "../lib/io.js";
import {
  contextPath,
  handoffPath,
  indexPath,
  journalDir,
  manifestPath,
  rulesPath,
  todosPath
} from "../lib/paths.js";
import { parseTodos } from "./todos.js";
import { scanRepo } from "./scan.js";
import { ensureRepoMemory } from "./memory.js";
import { generateContext } from "./context.js";
import { getGitSummary } from "./git_summary.js";

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

function detectInstructionFiles(root) {
  const candidates = [
    "AGENTS.md",
    "CLAUDE.md",
    ".github/copilot-instructions.md",
    ".cursor/rules/rmemo.mdc"
  ];
  return candidates.map((p) => ({ rel: p, abs: path.join(root, p) }));
}

async function buildHandoffMarkdown(root, { snipLines, recentDays, since, staged } = {}) {
  const generatedAt = new Date().toISOString();

  const [rules, todosMd, manifestText, ctxExists] = await Promise.all([
    readMaybe(rulesPath(root), 512_000),
    readMaybe(todosPath(root), 512_000),
    readMaybe(manifestPath(root), 2_000_000),
    fileExists(contextPath(root))
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
    journal.push({ file: fn, text: t.trimEnd() });
  }

  const git = await getGitSummary(root, { since, staged });

  const instructionCandidates = detectInstructionFiles(root);
  const existingInstructionFiles = [];
  for (const c of instructionCandidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await fileExists(c.abs)) existingInstructionFiles.push(c.rel);
  }

  const parts = [];
  parts.push(`# Handoff\n`);
  parts.push(`Generated: ${generatedAt}\n`);
  parts.push(`Root: ${root}\n`);
  if (manifest?.title) parts.push(`Repo: ${manifest.title}\n`);

  parts.push(`## Paste To AI\n`);
  parts.push(`1. Paste instruction files (if present):\n`);
  if (existingInstructionFiles.length) {
    parts.push(existingInstructionFiles.map((p) => `   - \`${p}\``).join("\n") + "\n");
  } else {
    parts.push("   - (none) Run: `rmemo sync`\n");
  }
  parts.push(`2. Paste: \`.repo-memory/context.md\`${ctxExists ? "" : " (missing; run: rmemo context or rmemo start)"}\n`);
  parts.push(`3. Paste this handoff\n`);

  parts.push(`\n## Status (Brief)\n`);
  parts.push(`### Next\n`);
  if (todos.next.length) parts.push(todos.next.map((x, i) => `${i + 1}. ${x}`).join("\n") + "\n");
  else parts.push(`- (empty)\n`);
  parts.push(`\n### Blockers\n`);
  if (todos.blockers.length) parts.push(todos.blockers.map((x, i) => `${i + 1}. ${x}`).join("\n") + "\n");
  else parts.push(`- (none)\n`);

  if (manifest) {
    parts.push(`\n### Structure Hints\n`);
    if (Array.isArray(manifest.repoHints) && manifest.repoHints.length) parts.push(`- repoHints: ${manifest.repoHints.join(", ")}\n`);
    if (Array.isArray(manifest.lockfiles) && manifest.lockfiles.length) parts.push(`- lockfiles: ${manifest.lockfiles.join(", ")}\n`);
    if (manifest.packageJson?.frameworks?.length) parts.push(`- frameworks: ${manifest.packageJson.frameworks.join(", ")}\n`);
    if (manifest.packageJson?.packageManager) parts.push(`- packageManager: ${manifest.packageJson.packageManager}\n`);
    if (Array.isArray(manifest.topDirs) && manifest.topDirs.length) {
      const dirs = manifest.topDirs.slice(0, 10).map((d) => `${d.name}(${d.fileCount})`).join(", ");
      parts.push(`- topDirs: ${dirs}\n`);
    }
  }

  if (rules) {
    parts.push(`\n## Rules (Excerpt)\n\n`);
    parts.push(clampLines(rules, Math.min(snipLines, 120)) + "\n");
  }

  if (journal.length) {
    parts.push(`\n## Recent Journal\n`);
    for (const j of journal) {
      parts.push(`\n### ${j.file}\n\n`);
      parts.push(clampLines(j.text, Math.min(snipLines, 160)) + "\n");
    }
  }

  if (git) {
    parts.push(`\n## Git Summary\n`);
    if (git.head) parts.push(`HEAD: \`${git.head.slice(0, 12)}\`\n`);
    parts.push(`\n### Working Tree Status\n\n\`\`\`text\n${git.status || "(clean)"}\n\`\`\`\n`);
    parts.push(`### Diff Names (${staged ? "staged" : "working tree"})\n\n\`\`\`text\n${git.diffNames || "(none)"}\n\`\`\`\n`);
    if (git.range) {
      parts.push(`### Since \`${git.range}\`\n\n`);
      parts.push(`\`\`\`text\n${git.rangeLog || "(no commits)"}\n\`\`\`\n`);
      parts.push(`\`\`\`text\n${git.rangeNames || "(no changes)"}\n\`\`\`\n`);
    }
  }

  parts.push(`\n## Notes For AI\n`);
  parts.push(`- Follow the repo instruction files strictly.\n`);
  parts.push(`- If unsure, ask before creating new files/APIs.\n`);

  return ensureTrailingNewline(parts.join("").trimEnd());
}

export async function generateHandoff(root, opts) {
  const {
    preferGit = true,
    maxFiles = 4000,
    snipLines = 120,
    recentDays = 3,
    since = "",
    staged = false
  } = opts || {};

  await ensureRepoMemory(root);

  const { manifest, index } = await scanRepo(root, { maxFiles, preferGit });
  await writeJson(manifestPath(root), manifest);
  await writeJson(indexPath(root), index);

  const ctx = await generateContext(root, { snipLines, recentDays: Math.max(7, recentDays) });
  await fs.writeFile(contextPath(root), ctx, "utf8");

  const md = await buildHandoffMarkdown(root, { snipLines, recentDays, since, staged });
  const out = handoffPath(root);
  await writeText(out, md);
  return { schema: 1, generatedAt: new Date().toISOString(), root, out, markdown: md };
}
