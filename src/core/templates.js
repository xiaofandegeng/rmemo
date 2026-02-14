import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDir, fileExists, readText, writeText } from "../lib/io.js";
import { memDir, rulesJsonPath, rulesPath, todosPath } from "../lib/paths.js";

function nowStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${y}${m}${day}_${hh}${mm}${ss}`;
}

function templatesDir() {
  // src/core/templates.js -> ../../templates
  return fileURLToPath(new URL("../../templates", import.meta.url));
}

export async function listTemplates() {
  const dir = templatesDir();
  const ents = await fs.readdir(dir, { withFileTypes: true });
  return ents.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function readTemplateFile(id, rel) {
  const p = path.join(templatesDir(), id, rel);
  return await readText(p, 2_000_000);
}

async function backupIfExists(dstAbs, force) {
  if (!(await fileExists(dstAbs))) return null;
  if (!force) throw new Error(`Refusing to overwrite existing file: ${dstAbs} (use --force)`);
  const bak = `${dstAbs}.bak.${nowStamp()}`;
  await fs.copyFile(dstAbs, bak);
  return bak;
}

export async function applyTemplate(root, id, { force = false } = {}) {
  const items = await listTemplates();
  if (!items.includes(id)) {
    throw new Error(`Unknown template id: ${id}\nAvailable:\n- ${items.join("\n- ")}`);
  }

  await ensureDir(memDir(root));

  const rulesMd = await readTemplateFile(id, "rules.md");
  const rulesJson = await readTemplateFile(id, "rules.json");
  const todosMd = await readTemplateFile(id, "todos.md");

  const targets = [
    { abs: rulesPath(root), content: rulesMd },
    { abs: rulesJsonPath(root), content: rulesJson },
    { abs: todosPath(root), content: todosMd }
  ];

  const backups = [];
  for (const t of targets) {
    const bak = await backupIfExists(t.abs, force);
    if (bak) backups.push(bak);
    await writeText(t.abs, t.content);
  }

  return { id, targets: targets.map((t) => t.abs), backups };
}

