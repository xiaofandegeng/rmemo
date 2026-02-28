import { fileExists, readJson } from "../lib/io.js";
import { configPath } from "../lib/paths.js";
import { extractKnowledgeMemories } from "./knowledge_memory.js";

function toNumber(v, dflt, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function normalizeReason(v, dflt = "auto") {
  const s = String(v || "").trim().toLowerCase();
  return s || dflt;
}

export async function readKnowledgeAutoConfig(root) {
  const p = configPath(root);
  const defaults = {
    enabled: true,
    recentDays: 7,
    limit: 400,
    sourcePrefix: "auto",
    path: p,
    reason: "default"
  };

  if (!(await fileExists(p))) return { ...defaults, reason: "missing_config" };

  let cfg = null;
  try {
    cfg = await readJson(p);
  } catch {
    return { ...defaults, reason: "invalid_config" };
  }

  const raw = cfg?.memory?.autoExtract;
  if (!raw || typeof raw !== "object") return { ...defaults, reason: "enabled" };

  return {
    enabled: raw.enabled !== false,
    recentDays: toNumber(raw.recentDays, defaults.recentDays, { min: 1, max: 120 }),
    limit: toNumber(raw.limit, defaults.limit, { min: 1, max: 2000 }),
    sourcePrefix: String(raw.sourcePrefix || defaults.sourcePrefix).trim() || defaults.sourcePrefix,
    path: p,
    reason: raw.enabled === false ? "disabled" : "enabled"
  };
}

export async function runKnowledgeAutoExtract(root, {
  reason = "auto",
  sourcePrefix = "",
  recentDays,
  limit,
  strict = false
} = {}) {
  const cfg = await readKnowledgeAutoConfig(root);
  if (!cfg.enabled) {
    return {
      ok: true,
      skipped: true,
      reason: "disabled",
      config: cfg
    };
  }

  const finalRecentDays = recentDays !== undefined ? toNumber(recentDays, cfg.recentDays, { min: 1, max: 120 }) : cfg.recentDays;
  const finalLimit = limit !== undefined ? toNumber(limit, cfg.limit, { min: 1, max: 2000 }) : cfg.limit;
  const finalSourcePrefix = String(sourcePrefix || cfg.sourcePrefix || "auto").trim() || "auto";
  const finalReason = normalizeReason(reason, "auto");

  try {
    const result = await extractKnowledgeMemories(root, {
      recentDays: finalRecentDays,
      limit: finalLimit,
      source: `${finalSourcePrefix}:${finalReason}`
    });
    return {
      ok: true,
      skipped: false,
      reason: "extracted",
      config: cfg,
      result
    };
  } catch (e) {
    if (strict) throw e;
    return {
      ok: false,
      skipped: true,
      reason: "error",
      config: cfg,
      error: e?.message || String(e)
    };
  }
}
