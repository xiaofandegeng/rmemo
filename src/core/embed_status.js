import path from "node:path";
import { fileExists, readJson } from "../lib/io.js";
import { embeddingsIndexPath, embeddingsMetaPath } from "../lib/paths.js";
import { defaultEmbeddingConfig, embeddingsUpToDate } from "./embeddings.js";
import { readEmbedConfig } from "./embed_auto.js";

function pick(v, dflt) {
  if (v === undefined || v === null || v === "") return dflt;
  return v;
}

function toConfigFromMeta(meta) {
  const def = defaultEmbeddingConfig();
  if (!meta) return null;
  return {
    provider: pick(meta.provider, def.provider),
    model: pick(meta.model, ""),
    dim: Number(pick(meta.dim, def.dim)),
    kinds: Array.isArray(meta.kinds) ? meta.kinds : def.kinds,
    recentDays: Number(pick(meta.recentDays, def.recentDays)),
    maxChunksPerFile: Number(pick(meta.maxChunksPerFile, def.maxChunksPerFile)),
    maxCharsPerChunk: Number(pick(meta.maxCharsPerChunk, def.maxCharsPerChunk)),
    overlapChars: Number(pick(meta.overlapChars, def.overlapChars)),
    maxTotalChunks: Number(pick(meta.maxTotalChunks, def.maxTotalChunks))
  };
}

function classifyStatus({ enabledByConfig, hasIndex, hasMeta, upToDateOk, upToDateReason, error }) {
  if (error) return "error";
  if (!enabledByConfig) {
    if (hasIndex && hasMeta) return "ready_manual";
    if (hasIndex || hasMeta) return "partial";
    return "disabled";
  }
  if (!hasIndex || !hasMeta) return "missing";
  if (upToDateOk === true) return "ready";
  if (upToDateReason) return "stale";
  return "unknown";
}

export async function getEmbedStatus(root, { checkUpToDate = true } = {}) {
  const rootAbs = path.resolve(root || process.cwd());
  const indexP = embeddingsIndexPath(rootAbs);
  const metaP = embeddingsMetaPath(rootAbs);
  const cfg = await readEmbedConfig(rootAbs);

  let idx = null;
  let meta = null;
  let loadError = null;
  const hasIndex = await fileExists(indexP);
  const hasMeta = await fileExists(metaP);
  try {
    if (hasIndex) idx = await readJson(indexP);
    if (hasMeta) meta = await readJson(metaP);
  } catch (e) {
    loadError = e?.message || String(e);
  }

  let up = null;
  let checkConfig = null;
  if (!loadError && checkUpToDate) {
    if (cfg.enabled) {
      checkConfig = cfg.embed;
      up = await embeddingsUpToDate(rootAbs, cfg.embed);
    } else if (hasIndex && hasMeta) {
      checkConfig = toConfigFromMeta(meta);
      if (checkConfig) up = await embeddingsUpToDate(rootAbs, checkConfig);
    }
  }

  const itemCount = Number(idx?.items?.length || meta?.itemCount || 0);
  const fileCount = Number(
    idx?.files && typeof idx.files === "object" ? Object.keys(idx.files).length : 0
  );

  const result = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root: rootAbs,
    status: classifyStatus({
      enabledByConfig: !!cfg.enabled,
      hasIndex,
      hasMeta,
      upToDateOk: up?.ok,
      upToDateReason: up && !up.ok ? up.reason : "",
      error: loadError
    }),
    config: {
      enabled: !!cfg.enabled,
      reason: cfg.reason,
      path: cfg.path,
      embed: cfg.embed || null
    },
    index: {
      exists: hasIndex,
      path: indexP,
      provider: idx?.provider || meta?.provider || null,
      model: idx?.model || meta?.model || null,
      dim: idx?.dim || meta?.dim || null,
      generatedAt: idx?.generatedAt || meta?.finishedAt || null,
      itemCount,
      fileCount
    },
    meta: {
      exists: hasMeta,
      path: metaP,
      gitHead: meta?.gitHead || null,
      startedAt: meta?.startedAt || null,
      finishedAt: meta?.finishedAt || null,
      reusedItems: Number(meta?.reusedItems || 0),
      embeddedItems: Number(meta?.embeddedItems || 0),
      reusedFromPreviousIndex: !!meta?.reusedFromPreviousIndex
    },
    upToDate: up
      ? {
          ok: !!up.ok,
          reason: up.reason || null,
          file: up.file || null
        }
      : null,
    errors: loadError ? [loadError] : []
  };

  if (checkConfig) {
    result.checkConfig = checkConfig;
  }
  return result;
}

