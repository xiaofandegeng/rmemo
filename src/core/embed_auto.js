import path from "node:path";
import { fileExists, readJson } from "../lib/io.js";
import { configPath } from "../lib/paths.js";
import { buildEmbeddingsIndex, defaultEmbeddingConfig, embeddingsUpToDate } from "./embeddings.js";

function parseKinds(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((x) => x.trim()).filter(Boolean);
  return [];
}

function pickNumber(v, dflt) {
  if (v === undefined || v === null || v === "") return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

export async function readEmbedConfig(root) {
  const p = configPath(root);
  if (!(await fileExists(p))) return { enabled: false, reason: "missing_config", path: p, embed: null };
  let cfg = null;
  try {
    cfg = await readJson(p);
  } catch {
    return { enabled: false, reason: "invalid_config", path: p, embed: null };
  }

  const e = cfg?.embed;
  const enabled = e?.enabled === true;
  if (!enabled) return { enabled: false, reason: "disabled", path: p, embed: e || null };

  const def = defaultEmbeddingConfig();
  const provider = e?.provider ? String(e.provider) : def.provider;
  const model = e?.model ? String(e.model) : "";
  const dim = pickNumber(e?.dim, def.dim);
  const kinds = parseKinds(e?.kinds).length ? parseKinds(e?.kinds) : def.kinds;
  const recentDays = pickNumber(e?.recentDays, def.recentDays);

  const maxChunksPerFile = pickNumber(e?.maxChunksPerFile, def.maxChunksPerFile);
  const maxCharsPerChunk = pickNumber(e?.maxCharsPerChunk, def.maxCharsPerChunk);
  const overlapChars = pickNumber(e?.overlapChars, def.overlapChars);
  const maxTotalChunks = pickNumber(e?.maxTotalChunks, def.maxTotalChunks);

  return {
    enabled: true,
    reason: "enabled",
    path: p,
    embed: {
      provider,
      model,
      dim,
      kinds,
      recentDays,
      maxChunksPerFile,
      maxCharsPerChunk,
      overlapChars,
      maxTotalChunks
    }
  };
}

export async function embedAuto(root, { checkOnly = false } = {}) {
  const rootAbs = path.resolve(root || process.cwd());
  const cfg = await readEmbedConfig(rootAbs);
  if (!cfg.enabled) return { ok: true, skipped: true, reason: cfg.reason };

  const args = cfg.embed;
  if (checkOnly) {
    const r = await embeddingsUpToDate(rootAbs, args);
    return r.ok ? { ok: true, skipped: true, reason: "up_to_date" } : { ok: false, skipped: false, reason: r.reason, file: r.file };
  }

  const r = await embeddingsUpToDate(rootAbs, args);
  if (r.ok) return { ok: true, skipped: true, reason: "up_to_date" };

  const built = await buildEmbeddingsIndex(rootAbs, args);
  return { ok: true, skipped: false, reason: "rebuilt", meta: built.meta };
}

