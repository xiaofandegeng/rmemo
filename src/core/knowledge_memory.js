import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ensureDir, fileExists, readJson, readText, writeJson } from "../lib/io.js";
import { journalDir, knowledgeDir, knowledgeStorePath, todosPath } from "../lib/paths.js";
import { parseTodos } from "./todos.js";
import { getGitRangeData, gitOk } from "./git_summary.js";

const KNOWN_TYPES = new Set(["note", "decision", "todo", "blocker", "change", "risk"]);
const KNOWN_STATUSES = new Set(["open", "wip", "done", "blocked"]);

function nowIso() {
  return new Date().toISOString();
}

function hashText(s) {
  return crypto.createHash("sha1").update(String(s || "")).digest("hex");
}

function emptyStore() {
  return {
    schema: 1,
    updatedAt: nowIso(),
    seq: 0,
    entries: [],
    relations: []
  };
}

async function readStore(root) {
  const p = knowledgeStorePath(root);
  if (!(await fileExists(p))) return emptyStore();
  try {
    const j = await readJson(p);
    const entries = Array.isArray(j?.entries) ? j.entries : [];
    const relations = Array.isArray(j?.relations) ? j.relations : [];
    return {
      schema: 1,
      updatedAt: String(j?.updatedAt || nowIso()),
      seq: Number.isInteger(j?.seq) ? j.seq : entries.length,
      entries,
      relations
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(root, store) {
  const p = knowledgeStorePath(root);
  await ensureDir(knowledgeDir(root));
  const next = {
    schema: 1,
    updatedAt: nowIso(),
    seq: Number.isInteger(store?.seq) ? store.seq : 0,
    entries: Array.isArray(store?.entries) ? store.entries : [],
    relations: Array.isArray(store?.relations) ? store.relations : []
  };
  await writeJson(p, next);
  return next;
}

function nextId(store, prefix = "mem") {
  const seq = Number.isInteger(store.seq) ? store.seq + 1 : 1;
  store.seq = seq;
  return `${prefix}_${Date.now()}_${seq}`;
}

function clampText(s, max = 5000) {
  const t = String(s || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 20).trimEnd() + " [truncated]";
}

function toArray(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((x) => x.trim()).filter(Boolean);
  return [];
}

function uniq(arr) {
  return Array.from(new Set((arr || []).map((x) => String(x).trim()).filter(Boolean)));
}

function firstLine(s) {
  return String(s || "")
    .split("\n")
    .map((x) => x.trim())
    .find(Boolean) || "";
}

function shortTitle(s, max = 96) {
  const t = firstLine(s);
  if (t.length <= max) return t;
  return t.slice(0, max - 3) + "...";
}

function detectModulesFromText(text) {
  const out = [];
  const s = String(text || "");
  const re = /\b([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+)\b/g;
  let m;
  while ((m = re.exec(s))) {
    const token = m[1];
    if (token.startsWith("http://") || token.startsWith("https://")) continue;
    out.push(token.replace(/^\.\//, ""));
  }
  return uniq(out).slice(0, 20);
}

function detectModulesFromFiles(files = []) {
  const out = [];
  for (const f of files) {
    const p = String(f || "").trim();
    if (!p) continue;
    const norm = p.replace(/^\.\//, "");
    const segs = norm.split("/");
    if (segs.length >= 2) out.push(`${segs[0]}/${segs[1]}`);
    else out.push(norm);
  }
  return uniq(out).slice(0, 20);
}

function detectTags(text) {
  const s = String(text || "").toLowerCase();
  const map = [
    ["auth", ["auth", "token", "login", "oauth", "jwt"]],
    ["api", ["api", "endpoint", "request", "response"]],
    ["db", ["db", "database", "sql", "migration", "schema"]],
    ["ui", ["ui", "vue", "react", "component", "page", "css"]],
    ["test", ["test", "spec", "vitest", "jest", "e2e"]],
    ["build", ["build", "ci", "pipeline", "release", "deploy"]],
    ["perf", ["perf", "performance", "slow", "latency"]],
    ["risk", ["risk", "incident", "outage", "regression", "failure"]]
  ];
  const out = [];
  for (const [tag, keys] of map) {
    if (keys.some((k) => s.includes(k))) out.push(tag);
  }
  return uniq(out);
}

function inferType(kind, text) {
  const k = String(kind || "").toLowerCase();
  const s = String(text || "").toLowerCase();
  if (k.includes("block") || s.includes("blocker")) return "blocker";
  if (k.includes("done") || s.includes("decision") || s.includes("decide")) return "decision";
  if (s.includes("risk") || s.includes("incident") || s.includes("regression")) return "risk";
  if (s.includes("todo") || s.includes("next")) return "todo";
  return "note";
}

function inferStatus(type) {
  if (type === "blocker") return "blocked";
  if (type === "decision") return "done";
  return "open";
}

function normalizeType(v, fallback = "note") {
  const t = String(v || fallback).toLowerCase();
  return KNOWN_TYPES.has(t) ? t : fallback;
}

function normalizeStatus(v, fallback = "open") {
  const s = String(v || fallback).toLowerCase();
  return KNOWN_STATUSES.has(s) ? s : fallback;
}

function normalizeConfidence(v, fallback = 0.7) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function normalizeEntry(raw, { now = nowIso(), id = "", key = "" } = {}) {
  const type = normalizeType(raw?.type, "note");
  const title = clampText(raw?.title || shortTitle(raw?.summary || "untitled"), 200);
  const summary = clampText(raw?.summary || "", 5000);
  const tags = uniq([...(toArray(raw?.tags)), ...detectTags(`${title}\n${summary}`)]).slice(0, 32);
  const modules = uniq([...(toArray(raw?.modules)), ...detectModulesFromText(`${title}\n${summary}`)]).slice(0, 32);
  return {
    id,
    key: String(key || raw?.key || ""),
    type,
    title,
    summary,
    tags,
    modules,
    status: normalizeStatus(raw?.status, inferStatus(type)),
    source: String(raw?.source || "manual"),
    confidence: normalizeConfidence(raw?.confidence, 0.7),
    relatedCommits: uniq(toArray(raw?.relatedCommits)).slice(0, 64),
    relatedFiles: uniq(toArray(raw?.relatedFiles)).slice(0, 128),
    relatedTodos: uniq(toArray(raw?.relatedTodos)).slice(0, 64),
    relatedJournalFiles: uniq(toArray(raw?.relatedJournalFiles)).slice(0, 64),
    createdAt: String(raw?.createdAt || now),
    updatedAt: now
  };
}

function mergeEntries(existing, incoming, now = nowIso()) {
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    key: existing.key || incoming.key || "",
    tags: uniq([...(existing.tags || []), ...(incoming.tags || [])]).slice(0, 32),
    modules: uniq([...(existing.modules || []), ...(incoming.modules || [])]).slice(0, 32),
    relatedCommits: uniq([...(existing.relatedCommits || []), ...(incoming.relatedCommits || [])]).slice(0, 64),
    relatedFiles: uniq([...(existing.relatedFiles || []), ...(incoming.relatedFiles || [])]).slice(0, 128),
    relatedTodos: uniq([...(existing.relatedTodos || []), ...(incoming.relatedTodos || [])]).slice(0, 64),
    relatedJournalFiles: uniq([...(existing.relatedJournalFiles || []), ...(incoming.relatedJournalFiles || [])]).slice(0, 64),
    createdAt: existing.createdAt || incoming.createdAt || now,
    updatedAt: now
  };
}

function upsertByKey(store, rawEntry) {
  const now = nowIso();
  const key = String(rawEntry?.key || "").trim();
  const normalized = normalizeEntry(rawEntry, { now, key });
  if (key) {
    const idx = store.entries.findIndex((x) => String(x?.key || "") === key);
    if (idx >= 0) {
      const merged = mergeEntries(store.entries[idx], normalized, now);
      store.entries[idx] = merged;
      return { created: false, entry: merged };
    }
  }
  const id = nextId(store, "mem");
  const created = { ...normalized, id, createdAt: now, updatedAt: now };
  store.entries.push(created);
  return { created: true, entry: created };
}

function listRecentJournalNames(files, recentDays = 7) {
  const lim = Math.max(1, Math.min(120, Number(recentDays || 7)));
  return files
    .filter((x) => /^\d{4}-\d{2}-\d{2}\.md$/.test(x))
    .sort()
    .reverse()
    .slice(0, lim);
}

async function readRecentJournalSections(root, recentDays = 7) {
  const dir = journalDir(root);
  if (!(await fileExists(dir))) return [];
  let files = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const picked = listRecentJournalNames(files, recentDays);
  const out = [];
  for (const file of picked) {
    // eslint-disable-next-line no-await-in-loop
    const text = await readText(path.join(dir, file), 2_000_000).catch(() => "");
    const lines = String(text || "").split("\n");
    let cur = null;
    let body = [];
    const flush = () => {
      if (!cur) return;
      const summary = body.join("\n").trim();
      if (!summary) return;
      out.push({
        file,
        stamp: cur.stamp,
        kind: cur.kind,
        summary
      });
    };
    for (const line of lines) {
      const m = line.match(/^##\s+(\d{2}:\d{2})\s+(.+)\s*$/);
      if (m) {
        flush();
        cur = { stamp: m[1], kind: m[2] };
        body = [];
        continue;
      }
      if (cur) body.push(line);
    }
    flush();
  }
  return out;
}

function buildTodoEntries(parsed, source = "auto:todos") {
  const out = [];
  for (const text of parsed?.next || []) {
    const clean = String(text || "").trim();
    if (!clean) continue;
    const key = `todo:next:${hashText(clean).slice(0, 20)}`;
    out.push({
      key,
      type: "todo",
      title: shortTitle(clean),
      summary: clean,
      tags: ["todo"],
      modules: detectModulesFromText(clean),
      status: "open",
      source,
      confidence: 0.85,
      relatedTodos: [clean]
    });
  }
  for (const text of parsed?.blockers || []) {
    const clean = String(text || "").trim();
    if (!clean) continue;
    const key = `todo:blocker:${hashText(clean).slice(0, 20)}`;
    out.push({
      key,
      type: "blocker",
      title: shortTitle(clean),
      summary: clean,
      tags: ["todo", "blocker"],
      modules: detectModulesFromText(clean),
      status: "blocked",
      source,
      confidence: 0.9,
      relatedTodos: [clean]
    });
  }
  return out;
}

function buildJournalEntries(sections, source = "auto:journal") {
  const out = [];
  for (const sec of sections) {
    const summary = clampText(sec.summary, 5000);
    const type = inferType(sec.kind, summary);
    const key = `journal:${sec.file}:${sec.stamp}:${hashText(`${sec.kind}\n${summary}`).slice(0, 16)}`;
    out.push({
      key,
      type,
      title: shortTitle(summary),
      summary,
      tags: detectTags(`${sec.kind}\n${summary}`),
      modules: detectModulesFromText(summary),
      status: inferStatus(type),
      source,
      confidence: 0.75,
      relatedJournalFiles: [sec.file]
    });
  }
  return out;
}

function buildGitEntries(range, source = "auto:git") {
  const out = [];
  const files = Array.isArray(range?.workingTree?.diff) ? range.workingTree.diff.map((x) => x.file).filter(Boolean) : [];
  if (files.length) {
    const sorted = files.slice().sort((a, b) => a.localeCompare(b));
    const key = `working-tree:${hashText(sorted.join("\n")).slice(0, 20)}`;
    const preview = sorted.slice(0, 10).join(", ");
    out.push({
      key,
      type: "change",
      title: `Working tree changes (${sorted.length})`,
      summary: preview,
      tags: ["change"],
      modules: detectModulesFromFiles(sorted),
      status: "wip",
      source,
      confidence: 0.8,
      relatedFiles: sorted
    });
  }

  for (const c of range?.commits || []) {
    const sha = String(c?.sha || "").trim();
    const subject = String(c?.subject || "").trim();
    if (!sha || !subject) continue;
    out.push({
      key: `commit:${sha}`,
      type: "change",
      title: shortTitle(subject),
      summary: `${sha} ${subject}`,
      tags: ["commit", ...detectTags(subject)],
      modules: detectModulesFromText(subject),
      status: "done",
      source,
      confidence: 0.95,
      relatedCommits: [sha]
    });
  }
  return out;
}

function relationForSearch(store, hitIds) {
  const set = new Set(hitIds);
  return (store.relations || []).filter((r) => set.has(r.from) || set.has(r.to));
}

function scoreEntry(e, q) {
  if (!q) return 0;
  const needle = q.toLowerCase();
  let score = 0;
  if (String(e.title || "").toLowerCase().includes(needle)) score += 4;
  if (String(e.summary || "").toLowerCase().includes(needle)) score += 3;
  if ((e.tags || []).some((x) => String(x).toLowerCase().includes(needle))) score += 2;
  if ((e.modules || []).some((x) => String(x).toLowerCase().includes(needle))) score += 2;
  if ((e.relatedFiles || []).some((x) => String(x).toLowerCase().includes(needle))) score += 1;
  if ((e.relatedCommits || []).some((x) => String(x).toLowerCase().includes(needle))) score += 1;
  return score;
}

export async function extractKnowledgeMemories(root, {
  recentDays = 7,
  since = "",
  limit = 200,
  source = "auto"
} = {}) {
  const store = await readStore(root);

  let todosMd = "";
  if (await fileExists(todosPath(root))) {
    todosMd = await readText(todosPath(root), 2_000_000).catch(() => "");
  }
  const todos = parseTodos(todosMd || "");
  const todoEntries = buildTodoEntries(todos, `${source}:todos`);

  const sections = await readRecentJournalSections(root, recentDays);
  const journalEntries = buildJournalEntries(sections, `${source}:journal`);

  let gitEntries = [];
  if (await gitOk(root)) {
    const range = await getGitRangeData(root, {
      sinceRef: String(since || "").trim(),
      staged: false,
      maxCommits: 30,
      maxFiles: 200
    });
    gitEntries = buildGitEntries(range || {}, `${source}:git`);
  }

  const merged = [...todoEntries, ...journalEntries, ...gitEntries].slice(0, Math.max(1, Math.min(2000, Number(limit || 200))));

  let created = 0;
  let updated = 0;
  const touched = [];
  for (const item of merged) {
    const r = upsertByKey(store, item);
    touched.push(r.entry.id);
    if (r.created) created += 1;
    else updated += 1;
  }

  const next = await writeStore(root, store);
  return {
    schema: 1,
    root,
    generatedAt: nowIso(),
    source,
    options: {
      recentDays: Number(recentDays || 7),
      since: String(since || "")
    },
    candidates: merged.length,
    created,
    updated,
    totalEntries: next.entries.length,
    touchedIds: touched
  };
}

export async function writeKnowledgeMemory(root, payload = {}) {
  const store = await readStore(root);
  const now = nowIso();
  const id = String(payload?.id || "").trim();

  if (id) {
    const idx = store.entries.findIndex((x) => x.id === id);
    if (idx === -1) throw new Error(`memory_entry_not_found:${id}`);
    const normalized = normalizeEntry({ ...store.entries[idx], ...payload }, { now, id, key: store.entries[idx].key || payload.key || "" });
    const merged = mergeEntries(store.entries[idx], normalized, now);
    store.entries[idx] = merged;
    await writeStore(root, store);
    return {
      schema: 1,
      root,
      created: false,
      entry: merged
    };
  }

  const title = String(payload?.title || "").trim();
  if (!title) throw new Error("memory_title_required");
  const r = upsertByKey(store, {
    ...payload,
    key: payload?.key || `manual:${hashText(`${title}\n${payload?.summary || ""}`).slice(0, 20)}`,
    source: String(payload?.source || "manual")
  });
  await writeStore(root, store);
  return {
    schema: 1,
    root,
    created: r.created,
    entry: r.entry
  };
}

export async function linkKnowledgeMemories(root, {
  from,
  to,
  kind = "relates",
  note = "",
  weight = 1,
  source = "manual"
} = {}) {
  const fromId = String(from || "").trim();
  const toId = String(to || "").trim();
  if (!fromId || !toId) throw new Error("memory_link_requires_from_to");
  if (fromId === toId) throw new Error("memory_link_self_not_allowed");

  const store = await readStore(root);
  const hasFrom = store.entries.some((x) => x.id === fromId);
  const hasTo = store.entries.some((x) => x.id === toId);
  if (!hasFrom) throw new Error(`memory_entry_not_found:${fromId}`);
  if (!hasTo) throw new Error(`memory_entry_not_found:${toId}`);

  const relKind = String(kind || "relates").trim().toLowerCase() || "relates";
  const idx = store.relations.findIndex((r) => r.from === fromId && r.to === toId && r.kind === relKind);
  const now = nowIso();

  if (idx >= 0) {
    const next = {
      ...store.relations[idx],
      note: clampText(note, 1000),
      weight: Number.isFinite(Number(weight)) ? Number(weight) : 1,
      source: String(source || store.relations[idx].source || "manual"),
      updatedAt: now
    };
    store.relations[idx] = next;
    await writeStore(root, store);
    return { schema: 1, root, created: false, relation: next };
  }

  const relation = {
    id: nextId(store, "rel"),
    from: fromId,
    to: toId,
    kind: relKind,
    note: clampText(note, 1000),
    weight: Number.isFinite(Number(weight)) ? Number(weight) : 1,
    source: String(source || "manual"),
    createdAt: now,
    updatedAt: now
  };
  store.relations.push(relation);
  await writeStore(root, store);
  return { schema: 1, root, created: true, relation };
}

export async function searchKnowledgeMemories(root, {
  q = "",
  topic = "",
  module = "",
  type = "",
  commit = "",
  since = "",
  until = "",
  limit = 20
} = {}) {
  const store = await readStore(root);
  const needle = String(q || "").trim().toLowerCase();
  const topicNeedle = String(topic || "").trim().toLowerCase();
  const moduleNeedle = String(module || "").trim().toLowerCase();
  const typeNeedle = String(type || "").trim().toLowerCase();
  const commitNeedle = String(commit || "").trim().toLowerCase();
  const sinceMs = since ? Date.parse(String(since)) : NaN;
  const untilMs = until ? Date.parse(String(until)) : NaN;
  const lim = Math.max(1, Math.min(200, Number(limit || 20)));

  const entries = (store.entries || []).filter((e) => {
    const eTs = Date.parse(String(e.updatedAt || e.createdAt || ""));
    if (Number.isFinite(sinceMs) && Number.isFinite(eTs) && eTs < sinceMs) return false;
    if (Number.isFinite(untilMs) && Number.isFinite(eTs) && eTs > untilMs) return false;

    if (typeNeedle && String(e.type || "").toLowerCase() !== typeNeedle) return false;
    if (topicNeedle && !(e.tags || []).some((x) => String(x).toLowerCase().includes(topicNeedle))) return false;
    if (moduleNeedle && !(e.modules || []).some((x) => String(x).toLowerCase().includes(moduleNeedle))) return false;
    if (commitNeedle && !(e.relatedCommits || []).some((x) => String(x).toLowerCase().startsWith(commitNeedle))) return false;

    if (!needle) return true;
    return scoreEntry(e, needle) > 0;
  });

  entries.sort((a, b) => {
    const sb = scoreEntry(b, needle);
    const sa = scoreEntry(a, needle);
    if (sb !== sa) return sb - sa;
    return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
  });

  const hits = entries.slice(0, lim);
  const relations = relationForSearch(store, hits.map((x) => x.id));
  return {
    schema: 1,
    root,
    query: {
      q: String(q || ""),
      topic: String(topic || ""),
      module: String(module || ""),
      type: String(type || ""),
      commit: String(commit || ""),
      since: String(since || ""),
      until: String(until || "")
    },
    total: entries.length,
    entries: hits,
    relations
  };
}

export function formatKnowledgeSearchMarkdown(out) {
  const lines = [];
  lines.push("# Knowledge Memory Search");
  lines.push("");
  lines.push(`- root: ${out.root}`);
  lines.push(`- total: ${out.total}`);
  lines.push("");
  if (!out.entries.length) {
    lines.push("- (empty)");
    lines.push("");
    return lines.join("\n");
  }
  for (const e of out.entries) {
    lines.push(`## ${e.id} | ${e.type} | ${e.status}`);
    lines.push("");
    lines.push(`- title: ${e.title}`);
    lines.push(`- updatedAt: ${e.updatedAt}`);
    if (e.tags?.length) lines.push(`- tags: ${e.tags.join(", ")}`);
    if (e.modules?.length) lines.push(`- modules: ${e.modules.join(", ")}`);
    if (e.relatedCommits?.length) lines.push(`- commits: ${e.relatedCommits.join(", ")}`);
    if (e.relatedFiles?.length) lines.push(`- files: ${e.relatedFiles.slice(0, 8).join(", ")}`);
    lines.push("");
    lines.push(e.summary || "(no summary)");
    lines.push("");
  }
  if (out.relations?.length) {
    lines.push("## Relations");
    lines.push("");
    for (const r of out.relations) {
      lines.push(`- ${r.from} -[${r.kind}]-> ${r.to} (weight=${r.weight})`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
