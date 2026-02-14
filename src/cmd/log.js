import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, fileExists, readText } from "../lib/io.js";
import { resolveRoot } from "../lib/paths.js";
import { journalDir } from "../lib/paths.js";
import { nowHm, todayYmd } from "../lib/time.js";

export async function cmdLog({ rest, flags }) {
  const root = resolveRoot(flags);
  const text = rest.join(" ").trim();
  if (!text) throw new Error("Missing log text. Usage: rmemo log <text>");

  const dir = journalDir(root);
  await ensureDir(dir);

  const fn = `${todayYmd()}.md`;
  const p = path.join(dir, fn);

  const line = `- ${nowHm()} ${text}\n`;
  if (await fileExists(p)) {
    await fs.appendFile(p, line, "utf8");
  } else {
    const head = `# Journal ${todayYmd()}\n\n`;
    await fs.writeFile(p, head + line, "utf8");
  }

  process.stdout.write(`Logged: ${path.relative(process.cwd(), p)}\n`);
}

