import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

export async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readText(p, maxBytes = 2_000_000) {
  const buf = await fs.readFile(p);
  if (buf.byteLength > maxBytes) {
    return buf.subarray(0, maxBytes).toString("utf8") + "\n[...truncated]";
  }
  return buf.toString("utf8");
}

export async function writeText(p, s) {
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, s, "utf8");
}

export async function writeJson(p, obj) {
  await writeText(p, JSON.stringify(obj, null, 2) + "\n");
}

export async function readJson(p) {
  const s = await readText(p);
  return JSON.parse(s);
}

export async function readJsonSafe(p, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const s = await readText(p);
      return JSON.parse(s);
    } catch (e) {
      if (e instanceof SyntaxError && i < retries - 1) {
        // file might be mid-write; Wait and retry
        await new Promise(r => setTimeout(r, 20 + Math.random() * 50));
      } else {
        throw e;
      }
    }
  }
}

export function exitWithError(msg) {
  process.stderr.write(String(msg).trimEnd() + "\n");
  process.exitCode = 1;
}

