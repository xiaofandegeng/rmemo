import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, readJson, readText, writeJson } from "../lib/io.js";
import { contextPath, embeddingsIndexPath, embeddingsMetaPath, handoffPath, journalDir, prPath, rulesPath, sessionsDir, todosPath } from "../lib/paths.js";
import { gitDiffNameOnly, gitHead, gitStatusChangedFiles, hasGit, isGitRepo } from "../lib/git.js";

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s || ""), "utf8").digest("hex");
}

function fileKey(kind, file) {
  return `${kind}:${file}`;
}

function clampText(s, maxChars) {
  const t = String(s || "");
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars) + "\n[...truncated]";
}

function normalize(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const n = Math.sqrt(sum) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= n;
  return vec;
}

function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

function encodeVector(vec) {
  const f32 = vec instanceof Float32Array ? vec : Float32Array.from(vec);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength).toString("base64");
}

function decodeVector(b64) {
  const buf = Buffer.from(String(b64 || ""), "base64");
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

function fnv1a32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mockEmbedOne(text, dim) {
  const v = new Float32Array(dim);
  const tokens = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9_\\-\\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  for (const tok of tokens) {
    const h = fnv1a32(tok);
    const idx = h % dim;
    // Spread weights a bit so repeated tokens matter.
    v[idx] += 1 + ((h >>> 8) % 3);
  }
  return normalize(v);
}

function chunkMarkdown(text, { maxChars = 1400, overlapChars = 200, maxChunks = 400 } = {}) {
  const s = String(text || "").replace(/\r\n/g, "\n");
  const lines = s.split("\n");
  const chunks = [];
  let cur = [];
  let curLen = 0;
  let startLine = 1;

  const flush = () => {
    if (!cur.length) return;
    const t = cur.join("\n").trim();
    if (t) {
      const endLine = startLine + cur.length - 1;
      chunks.push({ startLine, endLine, text: t });
    }
    // Prepare overlap (by chars, not lines).
    if (overlapChars > 0 && curLen > overlapChars) {
      let keep = "";
      for (let i = cur.length - 1; i >= 0; i--) {
        keep = (cur[i] + "\n" + keep).slice(0, overlapChars);
        if (keep.length >= overlapChars) {
          startLine = startLine + i;
          cur = cur.slice(i);
          curLen = cur.join("\n").length;
          return;
        }
      }
    }
    startLine = startLine + cur.length;
    cur = [];
    curLen = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const addLen = (cur.length ? 1 : 0) + line.length;
    if (curLen + addLen > maxChars && cur.length) {
      flush();
      if (chunks.length >= maxChunks) break;
    }
    cur.push(line);
    curLen += addLen;
  }
  if (chunks.length < maxChunks) flush();
  return chunks;
}

async function listRecentJournalFiles(root, recentDays) {
  const dir = journalDir(root);
  try {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    return ents
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort()
      .reverse()
      .slice(0, Math.max(0, recentDays));
  } catch {
    return [];
  }
}

async function listRecentSessionNotes(root, { maxSessions = 30 } = {}) {
  const dir = sessionsDir(root);
  try {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    const ids = ents.filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse().slice(0, Math.max(0, maxSessions));
    return ids.map((id) => path.join(dir, id, "notes.md"));
  } catch {
    return [];
  }
}

export function defaultEmbeddingConfig() {
  return {
    schema: 1,
    provider: "mock",
    model: "mock-128",
    dim: 128,
    kinds: ["rules", "todos", "context", "journal", "sessions"],
    recentDays: 60,
    maxChunksPerFile: 200,
    maxCharsPerChunk: 1400,
    overlapChars: 200,
    maxTotalChunks: 1200
  };
}

async function buildDocList(root, { kinds, recentDays } = {}) {
  const want = new Set((kinds || []).map((k) => String(k).trim()).filter(Boolean));
  const docs = [];

  const addFile = (kind, abs) => docs.push({ kind, abs });

  if (want.has("rules")) addFile("rules", rulesPath(root));
  if (want.has("todos")) addFile("todos", todosPath(root));
  if (want.has("context")) addFile("context", contextPath(root));
  if (want.has("handoff")) addFile("handoff", handoffPath(root));
  if (want.has("pr")) addFile("pr", prPath(root));

  if (want.has("journal")) {
    const files = await listRecentJournalFiles(root, Number(recentDays || 60));
    for (const fn of files) addFile("journal", path.join(journalDir(root), fn));
  }

  if (want.has("sessions")) {
    const files = await listRecentSessionNotes(root, { maxSessions: 30 });
    for (const abs of files) addFile("sessions", abs);
  }

  // Only keep existing.
  const filtered = [];
  for (const d of docs) {
    // eslint-disable-next-line no-await-in-loop
    if (await fileExists(d.abs)) filtered.push(d);
  }
  return filtered;
}

function createMockEmbedder({ dim }) {
  return {
    provider: "mock",
    model: `mock-${dim}`,
    dim,
    embedBatch: async (texts) => texts.map((t) => mockEmbedOne(t, dim))
  };
}

function createOpenAiEmbedder({ apiKey, model }) {
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY (or pass --api-key)");
  const m = model || "text-embedding-3-small";

  return {
    provider: "openai",
    model: m,
    dim: 0,
    embedBatch: async (texts) => {
      const r = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ model: m, input: texts })
      });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(`OpenAI embeddings failed: ${r.status} ${r.statusText}${body ? ` - ${body.slice(0, 500)}` : ""}`);
      }
      const j = await r.json();
      if (!j || !Array.isArray(j.data)) throw new Error("OpenAI embeddings: bad response");
      const vecs = j.data.map((x) => Float32Array.from(x.embedding || []));
      if (!vecs.length) throw new Error("OpenAI embeddings: empty data");
      const dim = vecs[0].length;
      for (const v of vecs) {
        if (v.length !== dim) throw new Error("OpenAI embeddings: inconsistent dimensions");
        normalize(v);
      }
      return vecs;
    }
  };
}

export function createEmbedder({ provider = "mock", dim = 128, apiKey = "", model = "" } = {}) {
  const p = String(provider || "mock").toLowerCase();
  if (p === "mock") return createMockEmbedder({ dim: Number(dim || 128) });
  if (p === "openai") return createOpenAiEmbedder({ apiKey: apiKey || process.env.OPENAI_API_KEY || "", model });
  throw new Error(`Unknown provider: ${provider}`);
}

export async function loadEmbeddingsIndex(root) {
  const p = embeddingsIndexPath(root);
  if (!(await fileExists(p))) return null;
  return await readJson(p);
}

export async function loadEmbeddingsMeta(root) {
  const p = embeddingsMetaPath(root);
  if (!(await fileExists(p))) return null;
  return await readJson(p);
}

function sameConfig(a, b) {
  if (!a || !b) return false;
  const keys = [
    "provider",
    "model",
    "dim",
    "recentDays",
    "maxChunksPerFile",
    "maxCharsPerChunk",
    "overlapChars",
    "maxTotalChunks"
  ];
  for (const k of keys) {
    if (String(a[k] ?? "") !== String(b[k] ?? "")) return false;
  }
  const ak = Array.isArray(a.kinds) ? a.kinds.join(",") : "";
  const bk = Array.isArray(b.kinds) ? b.kinds.join(",") : "";
  return ak === bk;
}

async function currentFileStamp(abs) {
  try {
    const st = await fs.stat(abs);
    return { size: Number(st.size), mtimeMs: Number(st.mtimeMs) };
  } catch {
    return null;
  }
}

export async function embeddingsUpToDate(
  root,
  {
    provider = "mock",
    model = "",
    apiKey = "",
    dim = 128,
    kinds = defaultEmbeddingConfig().kinds,
    recentDays = defaultEmbeddingConfig().recentDays,
    maxChunksPerFile = defaultEmbeddingConfig().maxChunksPerFile,
    maxCharsPerChunk = defaultEmbeddingConfig().maxCharsPerChunk,
    overlapChars = defaultEmbeddingConfig().overlapChars,
    maxTotalChunks = defaultEmbeddingConfig().maxTotalChunks
  } = {}
) {
  const embedder = createEmbedder({ provider, dim, apiKey, model });
  const wantConfig = {
    provider: embedder.provider,
    model: embedder.model,
    dim: embedder.provider === "mock" ? Number(embedder.dim) : undefined,
    kinds,
    recentDays,
    maxChunksPerFile,
    maxCharsPerChunk,
    overlapChars,
    maxTotalChunks
  };

  const [meta, idx] = await Promise.all([loadEmbeddingsMeta(root), loadEmbeddingsIndex(root)]);
  if (!meta || !idx) return { ok: false, reason: "missing_index_or_meta" };
  if (!sameConfig(meta, wantConfig)) return { ok: false, reason: "config_changed" };

  const files = idx && idx.files && typeof idx.files === "object" ? idx.files : null;
  if (!files) return { ok: false, reason: "missing_files_index" };

  const gitOk = (await hasGit()) && (await isGitRepo(root));
  const curHead = gitOk ? await gitHead(root) : "";
  const prevHead = String(meta.gitHead || "");
  const dirty = gitOk ? await gitStatusChangedFiles(root) : new Set();
  const changedByCommits =
    gitOk && prevHead && curHead && prevHead !== curHead ? await gitDiffNameOnly(root, prevHead, curHead, { pathspec: "." }) : new Set();

  const docList = await buildDocList(root, { kinds, recentDays });
  for (const d of docList) {
    const fileRel = path.relative(root, d.abs).replace(/\\/g, "/");
    const fk = fileKey(d.kind, fileRel);
    // eslint-disable-next-line no-await-in-loop
    const stamp = await currentFileStamp(d.abs);
    if (!stamp) return { ok: false, reason: "file_missing", file: fk };
    const prev = files[fk];
    if (!prev) return { ok: false, reason: "file_not_indexed", file: fk };
    // If git is available, use git-aware change detection to avoid false positives from timestamp changes.
    if (gitOk && prevHead && curHead) {
      if (dirty.has(fileRel)) return { ok: false, reason: "file_dirty", file: fk };
      if (changedByCommits.has(fileRel)) return { ok: false, reason: "file_changed_in_git", file: fk };
    } else {
      if (Number(prev.size) !== stamp.size || Number(prev.mtimeMs) !== stamp.mtimeMs) return { ok: false, reason: "file_changed", file: fk };
    }
    if (!Array.isArray(prev.ids) || prev.ids.length === 0) return { ok: false, reason: "file_ids_missing", file: fk };
  }

  return { ok: true };
}

export async function buildEmbeddingsIndex(
  root,
  {
    provider = "mock",
    model = "",
    apiKey = "",
    dim = 128,
    kinds = defaultEmbeddingConfig().kinds,
    recentDays = defaultEmbeddingConfig().recentDays,
    maxChunksPerFile = defaultEmbeddingConfig().maxChunksPerFile,
    maxCharsPerChunk = defaultEmbeddingConfig().maxCharsPerChunk,
    overlapChars = defaultEmbeddingConfig().overlapChars,
    maxTotalChunks = defaultEmbeddingConfig().maxTotalChunks,
    force = false
  } = {}
) {
  const embedder = createEmbedder({ provider, dim, apiKey, model });
  const startedAt = new Date().toISOString();
  const wantConfig = {
    provider: embedder.provider,
    model: embedder.model,
    dim: embedder.provider === "mock" ? Number(embedder.dim) : undefined,
    kinds,
    recentDays,
    maxChunksPerFile,
    maxCharsPerChunk,
    overlapChars,
    maxTotalChunks
  };

  const prevMeta = force ? null : await loadEmbeddingsMeta(root);
  const canReuse = sameConfig(prevMeta, wantConfig);
  const prev = force || !canReuse ? null : await loadEmbeddingsIndex(root);

  const docList = await buildDocList(root, { kinds, recentDays });
  const prevFiles = prev && prev.files && typeof prev.files === "object" ? prev.files : null;
  const gitRepo = (await hasGit()) && (await isGitRepo(root));
  const curHead = gitRepo ? await gitHead(root) : "";
  const gitOk = canReuse && gitRepo;
  const prevHead = gitOk ? String(prevMeta?.gitHead || "") : "";
  const dirty = gitOk ? await gitStatusChangedFiles(root) : new Set();
  const changedByCommits =
    gitOk && prevHead && curHead && prevHead !== curHead ? await gitDiffNameOnly(root, prevHead, curHead, { pathspec: "." }) : new Set();

  const prevById = new Map();
  if (prev && Array.isArray(prev.items)) {
    for (const it of prev.items) prevById.set(it.id, it);
  }

  const chunks = [];
  const outItems = [];
  const outFiles = {};
  let reusedFiles = 0;
  let reusedItems = 0;
  for (const d of docList) {
    const fileRel = path.relative(root, d.abs).replace(/\\/g, "/");
    const fk = fileKey(d.kind, fileRel);

    let st = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      st = await fs.stat(d.abs);
    } catch {
      st = null;
    }

    // Fast path: if previous index has per-file metadata and file stats match, reuse without reading/chunking.
    // Git-aware path: reuse if file is clean AND unchanged between prevHead..curHead.
    if (prevFiles && prevFiles[fk] && gitOk && !dirty.has(fileRel) && !changedByCommits.has(fileRel)) {
      const ids = Array.isArray(prevFiles[fk].ids) ? prevFiles[fk].ids : [];
      const keep = [];
      for (const id of ids) {
        const it = prevById.get(id);
        if (!it || !it.vectorB64 || !it.textHash) continue;
        keep.push(it);
        if (outItems.length + keep.length >= maxTotalChunks) break;
      }
      if (keep.length) {
        reusedFiles++;
        reusedItems += keep.length;
        outItems.push(...keep);
        // Update stamps for future non-git checks too.
        if (st) outFiles[fk] = { kind: d.kind, file: fileRel, size: st.size, mtimeMs: st.mtimeMs, ids: keep.map((x) => x.id) };
        else outFiles[fk] = { kind: d.kind, file: fileRel, size: Number(prevFiles[fk].size || 0), mtimeMs: Number(prevFiles[fk].mtimeMs || 0), ids: keep.map((x) => x.id) };
        if (outItems.length >= maxTotalChunks) break;
        continue;
      }
    }

    // Stamp-based path: reuse if file stats match.
    if (prevFiles && st && prevFiles[fk] && Number(prevFiles[fk].size) === Number(st.size) && Number(prevFiles[fk].mtimeMs) === Number(st.mtimeMs)) {
      const ids = Array.isArray(prevFiles[fk].ids) ? prevFiles[fk].ids : [];
      const keep = [];
      for (const id of ids) {
        const it = prevById.get(id);
        if (!it || !it.vectorB64 || !it.textHash) continue;
        keep.push(it);
        if (outItems.length + keep.length >= maxTotalChunks) break;
      }
      if (keep.length) {
        reusedFiles++;
        reusedItems += keep.length;
        outItems.push(...keep);
        outFiles[fk] = { kind: d.kind, file: fileRel, size: st.size, mtimeMs: st.mtimeMs, ids: keep.map((x) => x.id) };
        if (outItems.length >= maxTotalChunks) break;
        continue;
      }
    }

    // Slow path: read + chunk (still reuses per-chunk vectors by id+textHash later).
    // eslint-disable-next-line no-await-in-loop
    const text = await readText(d.abs, 2_000_000);
    const fileHash = sha256Hex(text);
    const parts = chunkMarkdown(text, { maxChars: maxCharsPerChunk, overlapChars, maxChunks: maxChunksPerFile });
    const ids = [];
    for (let i = 0; i < parts.length; i++) {
      const c = parts[i];
      const id = `${d.kind}:${fileRel}:${i + 1}:${c.startLine}-${c.endLine}`;
      const textHash = sha256Hex(c.text);
      chunks.push({
        id,
        kind: d.kind,
        file: fileRel,
        fileHash,
        startLine: c.startLine,
        endLine: c.endLine,
        text: clampText(c.text, maxCharsPerChunk),
        textHash,
        size: st ? st.size : undefined,
        mtimeMs: st ? st.mtimeMs : undefined
      });
      ids.push(id);
      if (outItems.length + chunks.length >= maxTotalChunks) break;
    }
    if (st) outFiles[fk] = { kind: d.kind, file: fileRel, size: st.size, mtimeMs: st.mtimeMs, ids };
    if (outItems.length + chunks.length >= maxTotalChunks) break;
  }

  const toEmbed = [];
  for (const c of chunks) {
    const old = prevById.get(c.id);
    if (old && old.textHash === c.textHash && old.vectorB64) {
      outItems.push({ ...c, vectorB64: old.vectorB64, scoreHint: old.scoreHint || undefined });
      continue;
    }
    toEmbed.push(c);
  }

  const BATCH = embedder.provider === "openai" ? 96 : 256;
  for (let i = 0; i < toEmbed.length; i += BATCH) {
    const batch = toEmbed.slice(i, i + BATCH);
    // eslint-disable-next-line no-await-in-loop
    const vecs = await embedder.embedBatch(batch.map((x) => x.text));
    for (let j = 0; j < batch.length; j++) {
      const vec = vecs[j];
      outItems.push({ ...batch[j], vectorB64: encodeVector(vec) });
    }
  }

  // Stable ordering for diffs.
  outItems.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const meta = {
    schema: 1,
    root,
    provider: embedder.provider,
    model: embedder.model,
    dim: embedder.provider === "mock" ? Number(embedder.dim) : undefined,
    startedAt,
    finishedAt: new Date().toISOString(),
    gitHead: gitRepo ? curHead : "",
    kinds,
    recentDays,
    maxChunksPerFile,
    maxCharsPerChunk,
    overlapChars,
    maxTotalChunks,
    itemCount: outItems.length,
    reusedFiles,
    reusedItems,
    embeddedItems: toEmbed.length,
    reusedFromPreviousIndex: canReuse
  };

  const index = {
    schema: 1,
    generatedAt: meta.finishedAt,
    provider: embedder.provider,
    model: embedder.model,
    dim: embedder.provider === "mock" ? Number(embedder.dim) : (outItems[0] ? decodeVector(outItems[0].vectorB64).length : 0),
    files: outFiles,
    items: outItems
  };

  await writeJson(embeddingsIndexPath(root), index);
  await writeJson(embeddingsMetaPath(root), meta);
  return { meta, index };
}

export async function semanticSearch(root, { q, k = 8, minScore = 0.15 } = {}) {
  const query = String(q || "").trim();
  if (!query) throw new Error("Missing q");
  const idx = await loadEmbeddingsIndex(root);
  if (!idx || !Array.isArray(idx.items) || !idx.items.length) {
    throw new Error("Missing embeddings index (run: rmemo embed build)");
  }

  const provider = String(idx.provider || "mock");
  const model = String(idx.model || "");
  const dim = Number(idx.dim || 0);

  // Query embedding: if index was built with openai, you probably want openai for queries too.
  // For now: support mock queries always; openai requires key.
  const embedder = createEmbedder({
    provider,
    dim: dim || 128,
    model,
    apiKey: process.env.OPENAI_API_KEY || ""
  });
  const [qv] = await embedder.embedBatch([query]);

  const hits = [];
  for (const it of idx.items) {
    if (!it.vectorB64) continue;
    const v = decodeVector(it.vectorB64);
    const score = cosine(qv, v);
    if (score < Number(minScore || 0)) continue;
    hits.push({
      id: it.id,
      kind: it.kind,
      file: it.file,
      startLine: it.startLine,
      endLine: it.endLine,
      score: Number(score.toFixed(4)),
      text: clampText(it.text || "", 600)
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return {
    schema: 1,
    root,
    q: query,
    provider,
    model,
    k: Math.max(1, Math.min(50, Number(k || 8))),
    hits: hits.slice(0, Math.max(1, Math.min(50, Number(k || 8))))
  };
}
