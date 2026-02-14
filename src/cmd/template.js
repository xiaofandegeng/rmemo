import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRoot } from "../lib/paths.js";
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
  // src/cmd/template.js -> ../../templates
  return fileURLToPath(new URL("../../templates", import.meta.url));
}

async function listTemplates() {
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

export async function cmdTemplate({ rest, flags }) {
  const root = resolveRoot(flags);
  const sub = rest[0];
  const force = !!flags.force;

  if (!sub || sub === "help") {
    process.stdout.write(
      [
        "Usage:",
        "  rmemo template ls",
        "  rmemo template apply <id> [--force]",
        ""
      ].join("\n") + "\n"
    );
    return;
  }

  if (sub === "ls") {
    const items = await listTemplates();
    for (const id of items) process.stdout.write(id + "\n");
    return;
  }

  if (sub === "apply") {
    const id = rest[1];
    if (!id) throw new Error("Missing template id. Usage: rmemo template apply <id>");

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

    for (const t of targets) {
      const bak = await backupIfExists(t.abs, force);
      if (bak) process.stdout.write(`Backed up: ${bak}\n`);
      await writeText(t.abs, t.content);
      process.stdout.write(`Wrote: ${path.relative(process.cwd(), t.abs)}\n`);
    }

    process.stdout.write(`Applied template: ${id}\n`);
    return;
  }

  throw new Error(`Unknown subcommand: template ${sub}`);
}

