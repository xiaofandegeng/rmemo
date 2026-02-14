import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, fileExists, writeJson, writeText } from "../lib/io.js";
import { resolveRoot } from "../lib/paths.js";
import { journalDir, manifestPath, indexPath, rulesPath, todosPath } from "../lib/paths.js";
import { scanRepo } from "../core/scan.js";
import { generateContext } from "../core/context.js";
import { contextPath, memDir } from "../lib/paths.js";

const DEFAULT_RULES = `# Rules

This file is intentionally short and strict.

## Project Conventions
- (Add your conventions here)

## Structure
- (Add module boundaries here)

## AI Constraints
- Do not invent files or APIs. Ask if unsure.
- Follow existing patterns in this repo.
`;

const DEFAULT_TODOS = `# Todos

## Next
- (Write the next concrete step)

## Blockers
- (If any)
`;

export async function cmdInit({ flags }) {
  const root = resolveRoot(flags);

  await ensureDir(memDir(root));
  await ensureDir(journalDir(root));

  if (!(await fileExists(rulesPath(root)))) await writeText(rulesPath(root), DEFAULT_RULES);
  if (!(await fileExists(todosPath(root)))) await writeText(todosPath(root), DEFAULT_TODOS);

  const preferGit = flags["no-git"] ? false : true;
  const maxFiles = Number(flags["max-files"] || 4000);
  const { manifest, index } = await scanRepo(root, { maxFiles, preferGit });

  await writeJson(manifestPath(root), manifest);
  await writeJson(indexPath(root), index);

  const snipLines = Number(flags["snip-lines"] || 120);
  const recentDays = Number(flags["recent-days"] || 7);
  const ctx = await generateContext(root, { snipLines, recentDays });
  await fs.writeFile(contextPath(root), ctx, "utf8");

  process.stdout.write(`Initialized: ${path.relative(process.cwd(), memDir(root))}\n`);
}

