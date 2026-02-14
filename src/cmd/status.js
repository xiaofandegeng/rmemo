import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, readText } from "../lib/io.js";
import { resolveRoot } from "../lib/paths.js";
import { journalDir, manifestPath, rulesPath, todosPath } from "../lib/paths.js";
import { parseTodos } from "../core/todos.js";

function clampLines(s, maxLines) {
  const lines = s.split("\n");
  if (lines.length <= maxLines) return s.trimEnd();
  return lines.slice(0, maxLines).join("\n").trimEnd() + "\n[...truncated]";
}

async function readMaybe(p, maxBytes = 512_000) {
  try {
    if (!(await fileExists(p))) return null;
    return await readText(p, maxBytes);
  } catch {
    return null;
  }
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

export async function cmdStatus({ flags }) {
  const root = resolveRoot(flags);
  const format = String(flags.format || "md").toLowerCase();
  const mode = String(flags.mode || "full").toLowerCase();
  const snipLines = Number(flags["snip-lines"] || 120);
  const recentDays = Number(flags["recent-days"] || 7);

  const rules = await readMaybe(rulesPath(root), 512_000);
  const todosMd = await readMaybe(todosPath(root), 512_000);
  const manifestText = await readMaybe(manifestPath(root), 2_000_000);

  if (!rules && !todosMd && !manifestText) {
    process.stderr.write(`No .repo-memory found under: ${root}\nRun: rmemo --root <repo> init\n`);
    process.exitCode = 2;
    return;
  }

  let manifest = null;
  if (manifestText) {
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      manifest = { parseError: true };
    }
  }

  const todos = todosMd ? parseTodos(todosMd) : null;
  const journalFiles = await listRecentJournalFiles(root, recentDays);
  const journal = [];
  for (const fn of journalFiles) {
    const jp = path.join(journalDir(root), fn);
    const s = await readMaybe(jp, 512_000);
    if (!s) continue;
    journal.push({ file: fn, text: s.trimEnd() });
  }

  if (format === "json") {
    const payload = {
      schema: 1,
      generatedAt: new Date().toISOString(),
      root,
      mode,
      title: manifest?.title || null,
      manifest,
      rules: rules ? clampLines(rules, snipLines) : null,
      todos,
      recentJournal: journal.map((j) => ({ file: j.file, text: clampLines(j.text, snipLines) }))
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return;
  }

  if (format !== "md") {
    throw new Error(`Unsupported --format: ${format} (use md or json)`);
  }

  const parts = [];
  parts.push(`# Status\n`);
  if (manifest?.title) parts.push(`Repo: ${manifest.title}\n`);
  parts.push(`Root: ${root}\n`);
  parts.push(`Generated: ${new Date().toISOString()}\n`);

  if (todos) {
    parts.push(`## Next\n`);
    if (todos.next.length) parts.push(todos.next.map((x) => `- ${x}`).join("\n") + "\n");
    else parts.push(`- (empty)\n`);

    parts.push(`## Blockers\n`);
    if (todos.blockers.length) parts.push(todos.blockers.map((x) => `- ${x}`).join("\n") + "\n");
    else parts.push(`- (none)\n`);
  }

  if (manifest) {
    parts.push(`## Structure Hints\n`);
    if (Array.isArray(manifest.repoHints) && manifest.repoHints.length) parts.push(`- repoHints: ${manifest.repoHints.join(", ")}\n`);
    if (Array.isArray(manifest.lockfiles) && manifest.lockfiles.length) parts.push(`- lockfiles: ${manifest.lockfiles.join(", ")}\n`);
    if (manifest.packageJson?.frameworks?.length) parts.push(`- frameworks: ${manifest.packageJson.frameworks.join(", ")}\n`);
    if (manifest.packageJson?.packageManager) parts.push(`- packageManager: ${manifest.packageJson.packageManager}\n`);
    if (Array.isArray(manifest.topDirs) && manifest.topDirs.length) {
      const dirs = manifest.topDirs.slice(0, 10).map((d) => `${d.name}(${d.fileCount})`).join(", ");
      parts.push(`- topDirs: ${dirs}\n`);
    }
  }

  if (mode !== "brief") {
    if (rules) {
      parts.push(`## Rules (Excerpt)\n`);
      parts.push(clampLines(rules, Math.min(snipLines, 80)) + "\n");
    }

    if (journal.length) {
      parts.push(`## Recent Journal\n`);
      for (const j of journal) {
        parts.push(`### ${j.file}\n`);
        parts.push(clampLines(j.text, Math.min(snipLines, 120)) + "\n");
      }
    }
  }

  parts.push(`## Paste To AI\n`);
  parts.push(
    [
      "1. Run: `rmemo context`",
      "2. Paste: `.repo-memory/context.md`",
      "3. Optionally paste this `status` output for a quick 'where we are now'."
    ].join("\n") + "\n"
  );

  process.stdout.write(parts.join("\n").trimEnd() + "\n");
}
