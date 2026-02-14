import fs from "node:fs/promises";
import { ensureDir, fileExists, writeJson, writeText } from "../lib/io.js";
import { journalDir, memDir, rulesJsonPath, rulesPath, todosPath } from "../lib/paths.js";
import { applyTemplate } from "./templates.js";

export const DEFAULT_RULES_MD = `# Rules

This file is intentionally short and strict.

## Project Conventions
- (Add your conventions here)

## Structure
- (Add module boundaries here)

## AI Constraints
- Do not invent files or APIs. Ask if unsure.
- Follow existing patterns in this repo.
`;

export const DEFAULT_TODOS_MD = `# Todos

## Next
- (Write the next concrete step)

## Blockers
- (If any)
`;

export const DEFAULT_RULES_JSON = {
  schema: 1,
  // These are repo-relative patterns.
  // Patterns support glob like "src/**" or regex like "re:^src/.*\\.vue$".
  requiredPaths: [],
  // At least one of the patterns in each group must exist.
  // Example:
  // requiredOneOf: [
  //   ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"],
  //   ["openapi.yaml", "openapi.yml", "swagger.yaml", "swagger.yml"]
  // ]
  requiredOneOf: [],
  forbiddenPaths: [
    // Example: forbid committing secrets
    ".env",
    ".env.*"
  ],
  // Content scans are optional and disabled by default.
  // Use this to prevent committing secrets (keys/tokens) by matching patterns in file contents.
  // Example:
  // forbiddenContent: [
  //   { include: ["**/*"], exclude: ["**/*.png"], match: "BEGIN PRIVATE KEY", message: "Do not commit private keys." }
  // ]
  forbiddenContent: [],
  namingRules: []
};

export async function ensureRepoMemory(root, { template = "", force = false } = {}) {
  await ensureDir(memDir(root));
  await ensureDir(journalDir(root));

  if (template) {
    // Apply template first, then fill any missing files with defaults.
    await applyTemplate(root, template, { force });
  }

  if (!(await fileExists(rulesPath(root)))) await writeText(rulesPath(root), DEFAULT_RULES_MD);
  if (!(await fileExists(rulesJsonPath(root)))) await writeJson(rulesJsonPath(root), DEFAULT_RULES_JSON);
  if (!(await fileExists(todosPath(root)))) await writeText(todosPath(root), DEFAULT_TODOS_MD);
}

