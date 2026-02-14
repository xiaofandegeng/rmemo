import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_IGNORES = new Set([
  ".git",
  ".repo-memory",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".vite",
  ".idea",
  ".vscode"
]);

export async function walkFiles(root, { maxFiles = 4000 } = {}) {
  const result = [];

  async function walkDir(rel) {
    const abs = path.join(root, rel);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    for (const ent of entries) {
      const name = ent.name;
      if (DEFAULT_IGNORES.has(name)) continue;
      const relPath = rel ? path.posix.join(rel, name) : name;
      const absPath = path.join(root, relPath);
      if (ent.isDirectory()) {
        await walkDir(relPath);
      } else if (ent.isFile()) {
        result.push(relPath);
        if (result.length >= maxFiles) return;
      }
      if (result.length >= maxFiles) return;
    }
  }

  await walkDir("");
  return result.sort();
}

