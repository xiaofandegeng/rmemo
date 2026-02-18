import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { fileExists, readJson, readText } from "../lib/io.js";
import {
  contextPath,
  handoffJsonPath,
  handoffPath,
  indexPath,
  journalDir,
  manifestPath,
  prJsonPath,
  prPath,
  rulesJsonPath,
  rulesPath,
  todosPath
} from "../lib/paths.js";
import { parseTodos } from "./todos.js";
import { generateHandoff } from "./handoff.js";
import { generatePr } from "./pr.js";
import { buildEmbeddingsIndex, defaultEmbeddingConfig, planEmbeddingsBuild, semanticSearch } from "./embeddings.js";
import { generateFocus } from "./focus.js";
import { renderUiHtml } from "./ui.js";
import { addTodoBlocker, addTodoNext, removeTodoBlockerByIndex, removeTodoNextByIndex } from "./todos.js";
import { appendJournalEntry } from "./journal.js";
import { syncAiInstructions } from "./sync.js";
import { embedAuto, readEmbedConfig } from "./embed_auto.js";
import { getEmbedStatus } from "./embed_status.js";
import { refreshRepoMemory, watchRepo } from "./watch.js";
import { createEmbedJobsController } from "./embed_jobs.js";
import {
  applyWorkspaceFocusAlertsActionPlan,
  appendWorkspaceFocusAlertIncident,
  batchWorkspaceFocus,
  closeWorkspaceFocusAlertsBoard,
  compareWorkspaceFocusSnapshots,
  compareWorkspaceFocusWithLatest,
  createWorkspaceFocusAlertsBoard,
  evaluateWorkspaceFocusAlerts,
  generateWorkspaceFocusAlertsActionPlan,
  generateWorkspaceFocusAlertsBoardReport,
  generateWorkspaceFocusAlertsRca,
  getWorkspaceFocusAlertsConfig,
  getWorkspaceFocusAlertsAction,
  getWorkspaceFocusAlertsBoard,
  getWorkspaceFocusReport,
  getWorkspaceFocusTrend,
  generateWorkspaceFocusReport,
  listWorkspaceFocusAlertsBoards,
  listWorkspaceFocusAlertsActions,
  listWorkspaceFocusReports,
  listWorkspaceFocusSnapshots,
  listWorkspaceFocusAlertIncidents,
  listWorkspaceFocusTrends,
  listWorkspaces,
  setWorkspaceFocusAlertsConfig,
  saveWorkspaceFocusReport,
  saveWorkspaceFocusSnapshot,
  saveWorkspaceFocusAlertsActionPlan,
  updateWorkspaceFocusAlertsBoardItem
} from "./workspaces.js";

function json(res, code, obj) {
  const s = JSON.stringify(obj, null, 2) + "\n";
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(s)
  });
  res.end(s);
}

function text(res, code, s, contentType = "text/plain; charset=utf-8") {
  res.writeHead(code, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(s)
  });
  res.end(s);
}

function badRequest(res, msg) {
  json(res, 400, { ok: false, error: msg });
}

function notFound(res, msg = "Not found") {
  json(res, 404, { ok: false, error: msg });
}

function unauthorized(res) {
  res.writeHead(401, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false, error: "Unauthorized" }) + "\n");
}

function sseHeaders() {
  return {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  };
}

function sseWrite(res, { event, data, id } = {}) {
  // SSE format: https://html.spec.whatwg.org/multipage/server-sent-events.html
  let s = "";
  if (id !== undefined && id !== null) s += `id: ${String(id)}\n`;
  if (event) s += `event: ${String(event)}\n`;
  if (data !== undefined) s += `data: ${typeof data === "string" ? data : JSON.stringify(data)}\n`;
  s += "\n";
  res.write(s);
}

function ssePing(res) {
  // Comment line keeps the connection alive without firing an event handler.
  res.write(`: ping ${Date.now()}\n\n`);
}

function eventToMdLine(e) {
  const at = e?.at || "";
  const type = e?.type || "event";
  const reason = e?.reason ? ` reason=${e.reason}` : "";
  const d = e?.durationMs !== undefined ? ` durationMs=${e.durationMs}` : "";
  const files = e?.stats?.fileCount !== undefined ? ` files=${e.stats.fileCount}` : "";
  const err = e?.error ? ` error=${String(e.error).replace(/\s+/g, " ").slice(0, 220)}` : "";
  return `- [${at}] ${type}${reason}${d}${files}${err}`;
}

async function buildDiagnostics(root, { events, watchState, limitEvents = 200, recentDays = 7, snipLines = 120 } = {}) {
  const status = await buildStatus(root, { format: "json", mode: "full", recentDays, snipLines });
  const hist = (events?.history?.() || []).slice(-Math.min(2000, Math.max(1, Number(limitEvents || 200))));
  const watch = {
    enabled: !!watchState?.enabled,
    intervalMs: watchState?.intervalMs ?? null,
    sync: watchState?.sync ?? null,
    embed: watchState?.embed ?? null,
    runtime: {
      clients: events?.size?.() ?? 0,
      lastOkAt: watchState?.lastOkAt || null,
      lastErrAt: watchState?.lastErrAt || null,
      lastErr: watchState?.lastErr || null,
      lastRefresh: watchState?.lastRefresh || null
    }
  };
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    watch,
    status,
    events: hist
  };
}

export function createEventsBus({ max = 200 } = {}) {
  const clients = new Set();
  const history = [];
  let seq = 0;

  const add = (res) => {
    clients.add(res);
    res.on?.("close", () => clients.delete(res));
    res.on?.("error", () => clients.delete(res));
  };

  const emit = (evt) => {
    const id = ++seq;
    const payload = { id, at: new Date().toISOString(), ...evt };
    history.push(payload);
    while (history.length > max) history.shift();
    for (const res of clients) {
      try {
        sseWrite(res, { id, event: payload.type || "event", data: payload });
      } catch {
        clients.delete(res);
      }
    }
  };

  return { add, emit, history: () => history.slice(), size: () => clients.size };
}

export function createWatchController(root, { events, watchState } = {}) {
  let abort = null;

  const ctl = {
    start: async ({ intervalMs, sync, embed } = {}) => {
      // Restart semantics: stop existing then start with new config.
      await ctl.stop("restart");
      if (intervalMs !== undefined && intervalMs !== null) watchState.intervalMs = Number(intervalMs);
      if (sync !== undefined) watchState.sync = !!sync;
      if (embed !== undefined) watchState.embed = !!embed;
      if (!Number.isFinite(watchState.intervalMs) || watchState.intervalMs < 200) {
        throw new Error(`Invalid watch intervalMs: ${watchState.intervalMs}`);
      }

      abort = new AbortController();
      watchState.enabled = true;
      events?.emit?.({ type: "watch:starting", intervalMs: watchState.intervalMs, sync: watchState.sync, embed: watchState.embed });

      void watchRepo(root, {
        preferGit: true,
        maxFiles: 4000,
        snipLines: 120,
        recentDays: 7,
        intervalMs: watchState.intervalMs,
        once: false,
        sync: watchState.sync,
        embed: watchState.embed,
        signal: abort.signal,
        noSignals: true,
        onEvent: (e) => {
          if (e.type === "refresh:ok") {
            watchState.lastOkAt = e.at;
            watchState.lastRefresh = {
              reason: e.reason || "watch",
              generatedAt: e.generatedAt || null,
              durationMs: e.durationMs ?? null,
              stats: e.stats || null,
              sync: e.sync || null,
              embed: e.embed || null
            };
          } else if (e.type === "refresh:err") {
            watchState.lastErrAt = e.at;
            watchState.lastErr = e.error || null;
          } else if (e.type === "stop") {
            watchState.enabled = false;
          }
          events?.emit?.(e);
        }
      }).catch((e) => {
        events?.emit?.({ type: "watch:error", error: e?.message || String(e) });
      });

      return { enabled: true, intervalMs: watchState.intervalMs, sync: watchState.sync, embed: watchState.embed };
    },
    stop: async (reason = "stop") => {
      if (!abort) {
        watchState.enabled = false;
        return { enabled: false };
      }
      try {
        abort.abort();
      } catch {
        // ignore
      }
      abort = null;
      watchState.enabled = false;
      events?.emit?.({ type: "watch:stopping", reason });
      return { enabled: false };
    }
  };

  return ctl;
}

function parseAuthToken(req, url) {
  const q = url.searchParams.get("token");
  if (q) return q;
  const h1 = req.headers["x-rmemo-token"];
  if (typeof h1 === "string" && h1) return h1;
  const auth = req.headers.authorization;
  if (typeof auth === "string") {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) return m[1].trim();
  }
  return "";
}

function isLoopbackHost(host) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

async function readBodyJson(req, { maxBytes = 200_000 } = {}) {
  const chunks = [];
  let total = 0;
  for await (const ch of req) {
    const b = Buffer.isBuffer(ch) ? ch : Buffer.from(String(ch));
    total += b.byteLength;
    if (total > maxBytes) throw new Error(`Body too large (max ${maxBytes} bytes)`);
    chunks.push(b);
  }
  const buf = Buffer.concat(chunks);
  const s = buf.toString("utf8").trim();
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function readBodyJsonOr400(req, res) {
  try {
    return await readBodyJson(req);
  } catch (e) {
    badRequest(res, e?.message || "Invalid request body");
    return null;
  }
}

async function readMaybe(abs, maxBytes = 2_000_000) {
  try {
    if (!(await fileExists(abs))) return null;
    return await readText(abs, maxBytes);
  } catch {
    return null;
  }
}

async function listRecentJournalFiles(root, recentDays) {
  const dir = journalDir(root);
  try {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    const files = ents
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort()
      .reverse();
    return files.slice(0, Math.max(0, recentDays));
  } catch {
    return [];
  }
}

function clampLines(s, maxLines) {
  const lines = String(s || "").split("\n");
  if (lines.length <= maxLines) return String(s || "").trimEnd();
  return lines.slice(0, maxLines).join("\n").trimEnd() + "\n[...truncated]";
}

function parseKindsList(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((x) => x.trim()).filter(Boolean);
  return [];
}

async function buildStatus(root, { format = "json", mode = "full", snipLines = 120, recentDays = 7 } = {}) {
  const [rules, todosMd, manifestText] = await Promise.all([
    readMaybe(rulesPath(root), 512_000),
    readMaybe(todosPath(root), 512_000),
    readMaybe(manifestPath(root), 2_000_000)
  ]);

  let manifest = null;
  if (manifestText) {
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      manifest = { parseError: true };
    }
  }

  const todos = todosMd ? parseTodos(todosMd) : { next: [], blockers: [] };
  const journalFiles = await listRecentJournalFiles(root, recentDays);
  const journal = [];
  for (const fn of journalFiles) {
    // eslint-disable-next-line no-await-in-loop
    const t = await readMaybe(path.join(journalDir(root), fn), 512_000);
    if (!t) continue;
    journal.push({ file: fn, text: t.trimEnd() });
  }

  if (format === "json") {
    return {
      schema: 1,
      generatedAt: new Date().toISOString(),
      root,
      mode,
      title: manifest?.title || null,
      manifest,
      rules: rules ? clampLines(rules, snipLines) : null,
      todos,
      recentJournal: journal.map((j) => ({ file: j.file, text: clampLines(j.text, snipLines) }))
    };
  }

  const parts = [];
  parts.push(`# Status\n`);
  if (manifest?.title) parts.push(`Repo: ${manifest.title}\n`);
  parts.push(`Root: ${root}\n`);
  parts.push(`Generated: ${new Date().toISOString()}\n`);

  const renderList = (items, { empty, none } = {}) => {
    if (!items.length) return `- ${empty || none || "(empty)"}\n`;
    if (mode === "brief") return items.map((x, i) => `${i + 1}. ${x}`).join("\n") + "\n";
    return items.map((x) => `- ${x}`).join("\n") + "\n";
  };

  parts.push(`## Next\n`);
  parts.push(renderList(todos.next, { empty: "(empty)" }));
  parts.push(`\n## Blockers\n`);
  parts.push(renderList(todos.blockers, { none: "(none)" }));

  if (manifest) {
    parts.push(`\n## Structure Hints\n`);
    if (Array.isArray(manifest.repoHints) && manifest.repoHints.length) parts.push(`- repoHints: ${manifest.repoHints.join(", ")}\n`);
    if (Array.isArray(manifest.lockfiles) && manifest.lockfiles.length) parts.push(`- lockfiles: ${manifest.lockfiles.join(", ")}\n`);
    if (manifest.packageJson?.frameworks?.length) parts.push(`- frameworks: ${manifest.packageJson.frameworks.join(", ")}\n`);
    if (manifest.packageJson?.packageManager) parts.push(`- packageManager: ${manifest.packageJson.packageManager}\n`);
  }

  if (mode !== "brief") {
    if (rules) {
      parts.push(`\n## Rules (Excerpt)\n\n`);
      parts.push(clampLines(rules, Math.min(snipLines, 80)) + "\n");
    }
    if (journal.length) {
      parts.push(`\n## Recent Journal\n`);
      for (const j of journal) {
        parts.push(`\n### ${j.file}\n\n`);
        parts.push(clampLines(j.text, Math.min(snipLines, 120)) + "\n");
      }
    }
  }

  return parts.join("").trimEnd() + "\n";
}

async function searchInText({ file, text, q, maxHits = 50 }) {
  const needle = String(q || "").toLowerCase();
  if (!needle) return [];
  const lines = String(text || "").split("\n");
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.toLowerCase().includes(needle)) {
      hits.push({ file, line: i + 1, text: line.slice(0, 400) });
      if (hits.length >= maxHits) break;
    }
  }
  return hits;
}

export function createServeHandler(root, opts = {}) {
  const { host, port, token, allowRefresh, allowWrite, allowShutdown, cors, getServer, events, watchState, getWatchCtl, getEmbedJobs } = opts;
  const embedJobs = getEmbedJobs?.() || createEmbedJobsController(root, { events, maxHistory: 50 });

  return async function handler(req, res) {
    const url = new URL(req.url || "/", `http://${host}:${port || 80}`);

    if (cors) {
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-headers", "authorization, x-rmemo-token, content-type");
      res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    // Health is always unauthenticated.
    if (req.method === "GET" && url.pathname === "/health") {
      json(res, 200, { ok: true, schema: 1, root, time: new Date().toISOString() });
      return;
    }

    // UI is always unauthenticated (it does not expose repo content by itself).
    // If token is enabled, the UI uses x-rmemo-token for API calls.
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/ui")) {
      if (url.pathname === "/") {
        res.writeHead(302, { location: "/ui" });
        res.end("");
        return;
      }
      const html = renderUiHtml({ title: "rmemo", apiBasePath: "" });
      return text(res, 200, html, "text/html; charset=utf-8");
    }

    // Auth: if token is set, require it for everything else.
    if (token) {
      const got = parseAuthToken(req, url);
      if (got !== token) {
        unauthorized(res);
        return;
      }
    }

    try {
      if (req.method === "GET" && url.pathname === "/events") {
        res.writeHead(200, sseHeaders());
        // Initial hello + recent history for quick UI boot (supports Last-Event-ID resume).
        sseWrite(res, { event: "hello", data: { ok: true, schema: 1, root } });
        const lastIdRaw = req.headers["last-event-id"];
        const lastId = lastIdRaw ? Number(String(lastIdRaw)) : null;
        const hist = events?.history?.() || [];
        for (const h of hist) {
          if (lastId !== null && Number.isFinite(lastId) && h.id <= lastId) continue;
          sseWrite(res, { id: h.id, event: h.type || "event", data: h });
        }
        events?.add?.(res);
        // Keepalive ping so proxies/clients don't drop idle connections.
        // Only start the timer if we can observe `close` (unit tests use a plain object res).
        if (typeof res.on === "function") {
          const t = setInterval(() => {
            try {
              ssePing(res);
            } catch {
              clearInterval(t);
            }
          }, 15_000);
          res.on("close", () => clearInterval(t));
        }
        return;
      }

      if (req.method === "GET" && url.pathname === "/events/export") {
        const format = String(url.searchParams.get("format") || "json").toLowerCase();
        const limitRaw = Number(url.searchParams.get("limit") || 200);
        const limit = Math.min(2000, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 200));
        const hist = (events?.history?.() || []).slice(-limit);
        if (format === "json") {
          return json(res, 200, { ok: true, schema: 1, root, count: hist.length, events: hist });
        }
        if (format === "md") {
          const lines = ["# Events", "", `- root: ${root}`, `- count: ${hist.length}`, ""];
          for (const e of hist) lines.push(eventToMdLine(e));
          lines.push("");
          return text(res, 200, lines.join("\n"), "text/markdown; charset=utf-8");
        }
        return badRequest(res, "format must be json|md");
      }

      if (req.method === "GET" && url.pathname === "/diagnostics/export") {
        const format = String(url.searchParams.get("format") || "json").toLowerCase();
        const limitEvents = Number(url.searchParams.get("limitEvents") || 200);
        const recentDays = Number(url.searchParams.get("recentDays") || 7);
        const snipLines = Number(url.searchParams.get("snipLines") || 120);
        const d = await buildDiagnostics(root, { events, watchState, limitEvents, recentDays, snipLines });
        if (format === "json") return json(res, 200, { ok: true, ...d });
        if (format === "md") {
          const lines = [];
          lines.push("# Diagnostics");
          lines.push("");
          lines.push(`- generatedAt: ${d.generatedAt}`);
          lines.push(`- root: ${d.root}`);
          lines.push(`- events: ${d.events.length}`);
          lines.push("");
          lines.push("## Watch");
          lines.push(`- enabled: ${d.watch.enabled}`);
          lines.push(`- intervalMs: ${d.watch.intervalMs}`);
          lines.push(`- sync: ${d.watch.sync}`);
          lines.push(`- embed: ${d.watch.embed}`);
          lines.push(`- clients: ${d.watch.runtime.clients}`);
          if (d.watch.runtime.lastOkAt) lines.push(`- lastOkAt: ${d.watch.runtime.lastOkAt}`);
          if (d.watch.runtime.lastErrAt) lines.push(`- lastErrAt: ${d.watch.runtime.lastErrAt}`);
          if (d.watch.runtime.lastErr) lines.push(`- lastErr: ${d.watch.runtime.lastErr}`);
          if (d.watch.runtime.lastRefresh?.durationMs !== undefined) lines.push(`- lastRefresh.durationMs: ${d.watch.runtime.lastRefresh.durationMs}`);
          if (d.watch.runtime.lastRefresh?.stats?.fileCount !== undefined) lines.push(`- lastRefresh.fileCount: ${d.watch.runtime.lastRefresh.stats.fileCount}`);
          lines.push("");
          lines.push("## Status Snapshot");
          lines.push(`- title: ${d.status.title || ""}`);
          lines.push(`- repoHints: ${(d.status.manifest?.repoHints || []).join(", ")}`);
          lines.push(`- nextTodos: ${Array.isArray(d.status.todos?.next) ? d.status.todos.next.length : 0}`);
          lines.push(`- blockers: ${Array.isArray(d.status.todos?.blockers) ? d.status.todos.blockers.length : 0}`);
          lines.push("");
          lines.push("## Events");
          for (const e of d.events) lines.push(eventToMdLine(e));
          lines.push("");
          return text(res, 200, lines.join("\n"), "text/markdown; charset=utf-8");
        }
        return badRequest(res, "format must be json|md");
      }

      if (req.method === "GET" && url.pathname === "/watch") {
        const ws = watchState || {};
        return json(res, 200, {
          ok: true,
          schema: 1,
          root,
          watch: {
            enabled: !!ws.enabled,
            intervalMs: ws.intervalMs ?? null,
            sync: ws.sync ?? null,
            embed: ws.embed ?? null
          },
          runtime: {
            clients: events?.size?.() ?? 0,
            lastOkAt: ws.lastOkAt || null,
            lastErrAt: ws.lastErrAt || null,
            lastErr: ws.lastErr || null,
            lastRefresh: ws.lastRefresh || null
          }
        });
      }

      if (req.method === "POST" && url.pathname === "/watch/start") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        const intervalMs = body.intervalMs !== undefined ? Number(body.intervalMs) : undefined;
        const sync = body.sync !== undefined ? !!body.sync : undefined;
        const embed = body.embed !== undefined ? !!body.embed : undefined;
        const r = await getWatchCtl?.()?.start?.({ intervalMs, sync, embed });
        return json(res, 200, { ok: true, result: r || null });
      }

      if (req.method === "POST" && url.pathname === "/watch/stop") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const r = await getWatchCtl?.()?.stop?.("api");
        return json(res, 200, { ok: true, result: r || null });
      }

      if (req.method === "POST" && url.pathname === "/refresh") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        const doSync = body.sync !== undefined ? !!body.sync : true;
        const doEmbed = body.embed !== undefined ? !!body.embed : false;
        events?.emit?.({ type: "refresh:start", reason: "api" });
        try {
          const r = await refreshRepoMemory(root, {
            preferGit: true,
            maxFiles: 4000,
            snipLines: 120,
            recentDays: 7,
            sync: doSync,
            embed: doEmbed
          });
          if (watchState) {
            watchState.lastOkAt = new Date().toISOString();
            watchState.lastRefresh = {
              reason: "api",
              generatedAt: r.generatedAt,
              durationMs: r.durationMs,
              stats: r.stats,
              sync: r.sync ? { ok: !!r.sync.ok, changed: (r.sync.results || []).filter((x) => x.changed).length } : null,
              embed: r.embed || null
            };
          }
          events?.emit?.({
            type: "refresh:ok",
            reason: "api",
            generatedAt: r.generatedAt,
            durationMs: r.durationMs,
            stats: r.stats
          });
          return json(res, 200, { ok: true, result: r });
        } catch (e) {
          if (watchState) {
            watchState.lastErrAt = new Date().toISOString();
            watchState.lastErr = e?.message || String(e);
          }
          events?.emit?.({ type: "refresh:err", reason: "api", error: e?.message || String(e) });
          return json(res, 500, { ok: false, error: e?.message || String(e) });
        }
      }

      // Write operations: only allowed if allowWrite is true.
      if (req.method === "POST" && url.pathname.startsWith("/todos/")) {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        const textVal = body && body.text !== undefined ? String(body.text).trim() : "";
        if (url.pathname === "/todos/next") {
          if (!textVal) return badRequest(res, "Missing text");
          await addTodoNext(root, textVal);
          return json(res, 200, { ok: true });
        }
        if (url.pathname === "/todos/blockers") {
          if (!textVal) return badRequest(res, "Missing text");
          await addTodoBlocker(root, textVal);
          return json(res, 200, { ok: true });
        }
        if (url.pathname === "/todos/next/done") {
          const idx = body && body.index !== undefined ? body.index : null;
          if (idx === null || idx === undefined) return badRequest(res, "Missing index");
          await removeTodoNextByIndex(root, idx);
          return json(res, 200, { ok: true });
        }
        if (url.pathname === "/todos/blockers/unblock") {
          const idx = body && body.index !== undefined ? body.index : null;
          if (idx === null || idx === undefined) return badRequest(res, "Missing index");
          await removeTodoBlockerByIndex(root, idx);
          return json(res, 200, { ok: true });
        }
        return notFound(res);
      }

      if (req.method === "POST" && url.pathname === "/log") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        const textVal = body && body.text !== undefined ? String(body.text).trim() : "";
        if (!textVal) return badRequest(res, "Missing text");
        const kind = body && body.kind ? String(body.kind).trim() : "Log";
        const p = await appendJournalEntry(root, { kind, text: textVal });
        return json(res, 200, { ok: true, path: p });
      }

      if (req.method === "POST" && url.pathname === "/sync") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        await syncAiInstructions({ root });
        return json(res, 200, { ok: true });
      }

      if (req.method === "POST" && url.pathname === "/embed/auto") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const r = await embedAuto(root, { checkOnly: false });
        return json(res, 200, { ok: true, result: r });
      }

      if (req.method === "GET" && url.pathname === "/embed/status") {
        const format = String(url.searchParams.get("format") || "json").toLowerCase();
        if (format !== "json" && format !== "md") return badRequest(res, "format must be json|md");
        const r = await getEmbedStatus(root, { checkUpToDate: true });
        if (format === "json") return json(res, 200, r);
        const lines = [];
        lines.push("# Embeddings Status");
        lines.push("");
        lines.push(`- root: ${r.root}`);
        lines.push(`- status: ${r.status}`);
        lines.push(`- config.enabled: ${r.config.enabled ? "yes" : "no"} (${r.config.reason})`);
        lines.push(`- index.exists: ${r.index.exists ? "yes" : "no"} (items=${r.index.itemCount}, files=${r.index.fileCount})`);
        lines.push(`- provider: ${r.index.provider || "-"}`);
        lines.push(`- model: ${r.index.model || "-"}`);
        lines.push(`- dim: ${r.index.dim || "-"}`);
        if (r.index.generatedAt) lines.push(`- generatedAt: ${r.index.generatedAt}`);
        lines.push(`- parallelism: ${r.meta.parallelism || 1}`);
        lines.push(`- batchSize: ${r.meta.batchSize || "-"}`);
        lines.push(`- totalBatches: ${r.meta.totalBatches || 0}`);
        lines.push(`- elapsedMs: ${r.meta.elapsedMs || 0}`);
        lines.push("");
        lines.push("## Up To Date");
        if (!r.upToDate) lines.push("- check: skipped");
        else lines.push(`- ok: ${r.upToDate.ok ? "yes" : "no"}${r.upToDate.reason ? ` (${r.upToDate.reason})` : ""}${r.upToDate.file ? `: ${r.upToDate.file}` : ""}`);
        lines.push("");
        return text(res, 200, lines.join("\n"), "text/markdown; charset=utf-8");
      }

      if (req.method === "POST" && url.pathname === "/embed/build") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;

        const force = !!body.force;
        const useConfig = body.useConfig !== false;
        let args = null;
        if (useConfig) {
          const cfg = await readEmbedConfig(root);
          if (cfg.enabled && cfg.embed) args = { ...cfg.embed };
        }
        if (!args) args = { ...defaultEmbeddingConfig() };

        if (body.provider !== undefined) args.provider = String(body.provider);
        if (body.model !== undefined) args.model = String(body.model);
        if (body.apiKey !== undefined) args.apiKey = String(body.apiKey);
        if (body.dim !== undefined) args.dim = Number(body.dim);
        if (body.kinds !== undefined) {
          const kinds = parseKindsList(body.kinds);
          if (!kinds.length) return badRequest(res, "kinds must be a non-empty list/string when provided");
          args.kinds = kinds;
        }
        if (body.recentDays !== undefined) args.recentDays = Number(body.recentDays);
        if (body.maxChunksPerFile !== undefined) args.maxChunksPerFile = Number(body.maxChunksPerFile);
        if (body.maxCharsPerChunk !== undefined) args.maxCharsPerChunk = Number(body.maxCharsPerChunk);
        if (body.overlapChars !== undefined) args.overlapChars = Number(body.overlapChars);
        if (body.maxTotalChunks !== undefined) args.maxTotalChunks = Number(body.maxTotalChunks);
        if (body.parallelism !== undefined) args.parallelism = Number(body.parallelism);
        if (body.parallel !== undefined) args.parallelism = Number(body.parallel);
        if (body.batchDelayMs !== undefined) args.batchDelayMs = Number(body.batchDelayMs);
        args.force = force;
        events?.emit?.({
          type: "embed:build:start",
          provider: args.provider || "mock",
          parallelism: args.parallelism ?? null,
          batchDelayMs: args.batchDelayMs ?? null
        });
        try {
          const built = await buildEmbeddingsIndex(root, {
            ...args,
            onProgress: (p) => events?.emit?.({ type: "embed:build:progress", ...p })
          });
          events?.emit?.({
            type: "embed:build:ok",
            provider: built.meta.provider,
            model: built.meta.model,
            embeddedItems: built.meta.embeddedItems,
            reusedItems: built.meta.reusedItems,
            totalBatches: built.meta.totalBatches,
            elapsedMs: built.meta.elapsedMs
          });
          return json(res, 200, { ok: true, result: { meta: built.meta } });
        } catch (e) {
          events?.emit?.({ type: "embed:build:err", error: e?.message || String(e) });
          throw e;
        }
      }

      if (req.method === "GET" && url.pathname === "/embed/jobs") {
        const out = embedJobs?.status?.() || {
          schema: 1,
          generatedAt: new Date().toISOString(),
          active: null,
          queued: [],
          history: []
        };
        return json(res, 200, { ok: true, ...out });
      }

      if (req.method === "GET" && url.pathname === "/embed/jobs/config") {
        const cfg = embedJobs?.getConfig?.() || { maxConcurrent: 1, retryTemplate: "balanced", defaultPriority: "normal" };
        const templates = embedJobs?.retryTemplates?.() || {};
        return json(res, 200, { ok: true, config: cfg, retryTemplates: templates });
      }

      if (req.method === "POST" && url.pathname === "/embed/jobs/config") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        try {
          const cfg = embedJobs?.setConfig?.({
            maxConcurrent: body.maxConcurrent,
            retryTemplate: body.retryTemplate,
            defaultPriority: body.defaultPriority
          });
          const templates = embedJobs?.retryTemplates?.() || {};
          return json(res, 200, { ok: true, config: cfg || { maxConcurrent: 1 }, retryTemplates: templates });
        } catch (e) {
          return badRequest(res, e?.message || String(e));
        }
      }

      if (req.method === "GET" && url.pathname === "/embed/jobs/failures") {
        const limit = url.searchParams.get("limit") !== null ? Number(url.searchParams.get("limit")) : 20;
        const errorClass = String(url.searchParams.get("errorClass") || "");
        const clusters = embedJobs?.getFailureClusters?.({ limit, errorClass }) || [];
        return json(res, 200, { ok: true, schema: 1, generatedAt: new Date().toISOString(), failures: clusters });
      }

      if (req.method === "GET" && url.pathname === "/embed/jobs/governance") {
        const report = embedJobs?.getGovernanceReport?.() || {
          schema: 1,
          generatedAt: new Date().toISOString(),
          config: {},
          state: {},
          metrics: {},
          recommendations: []
        };
        return json(res, 200, { ok: true, report });
      }

      if (req.method === "GET" && url.pathname === "/embed/jobs/governance/history") {
        const limit = url.searchParams.get("limit") !== null ? Number(url.searchParams.get("limit")) : 20;
        const versions = embedJobs?.listPolicyVersions?.({ limit }) || [];
        return json(res, 200, { ok: true, schema: 1, generatedAt: new Date().toISOString(), versions });
      }

      if (req.method === "POST" && url.pathname === "/embed/jobs/governance/config") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        try {
          const cfg = embedJobs?.setConfig?.({
            governanceEnabled: body.governanceEnabled,
            governanceWindow: body.governanceWindow,
            governanceMinSample: body.governanceMinSample,
            governanceFailureRateHigh: body.governanceFailureRateHigh,
            governanceCooldownMs: body.governanceCooldownMs,
            governanceAutoScaleConcurrency: body.governanceAutoScaleConcurrency,
            governanceAutoSwitchTemplate: body.governanceAutoSwitchTemplate,
            benchmarkAutoAdoptEnabled: body.benchmarkAutoAdoptEnabled,
            benchmarkAutoAdoptMinScore: body.benchmarkAutoAdoptMinScore,
            benchmarkAutoAdoptMinGap: body.benchmarkAutoAdoptMinGap
          });
          const report = embedJobs?.getGovernanceReport?.() || null;
          return json(res, 200, { ok: true, config: cfg || {}, report });
        } catch (e) {
          return badRequest(res, e?.message || String(e));
        }
      }

      if (req.method === "POST" && url.pathname === "/embed/jobs/governance/apply") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        const source = body.source !== undefined ? String(body.source) : "api";
        const r = embedJobs?.applyTopGovernanceRecommendation?.({ source }) || { ok: false, error: "governance_not_available" };
        if (!r.ok) return badRequest(res, r.error || "no governance recommendation");
        return json(res, 200, { ok: true, result: r });
      }

      if (req.method === "POST" && url.pathname === "/embed/jobs/governance/simulate") {
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        try {
          const configPatch = {
            maxConcurrent: body.maxConcurrent,
            retryTemplate: body.retryTemplate,
            defaultPriority: body.defaultPriority,
            governanceEnabled: body.governanceEnabled,
            governanceWindow: body.governanceWindow,
            governanceMinSample: body.governanceMinSample,
            governanceFailureRateHigh: body.governanceFailureRateHigh,
            governanceCooldownMs: body.governanceCooldownMs,
            governanceAutoScaleConcurrency: body.governanceAutoScaleConcurrency,
            governanceAutoSwitchTemplate: body.governanceAutoSwitchTemplate
          };
          const r = embedJobs?.simulateGovernance?.({
            configPatch,
            mode: body.mode !== undefined ? String(body.mode) : "recommend",
            assumeNoCooldown: body.assumeNoCooldown !== undefined ? !!body.assumeNoCooldown : true
          });
          return json(res, 200, { ok: true, result: r || null });
        } catch (e) {
          return badRequest(res, e?.message || String(e));
        }
      }

      if (req.method === "POST" && url.pathname === "/embed/jobs/governance/benchmark") {
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        try {
          const candidates = Array.isArray(body.candidates)
            ? body.candidates.map((x, i) => ({
                name: String(x?.name || `candidate_${i + 1}`),
                patch: { ...(x?.patch || {}) }
              }))
            : undefined;
          const windowSizes = Array.isArray(body.windowSizes) ? body.windowSizes.map((x) => Number(x)) : undefined;
          const r = embedJobs?.benchmarkGovernance?.({
            candidates,
            windowSizes,
            mode: body.mode !== undefined ? String(body.mode) : "apply_top",
            assumeNoCooldown: body.assumeNoCooldown !== undefined ? !!body.assumeNoCooldown : true
          });
          return json(res, 200, { ok: true, result: r || null });
        } catch (e) {
          return badRequest(res, e?.message || String(e));
        }
      }

      if (req.method === "POST" && url.pathname === "/embed/jobs/governance/benchmark/adopt") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        try {
          const candidates = Array.isArray(body.candidates)
            ? body.candidates.map((x, i) => ({
                name: String(x?.name || `candidate_${i + 1}`),
                patch: { ...(x?.patch || {}) }
              }))
            : undefined;
          const windowSizes = Array.isArray(body.windowSizes) ? body.windowSizes.map((x) => Number(x)) : undefined;
          const benchmark = embedJobs?.benchmarkGovernance?.({
            candidates,
            windowSizes,
            mode: body.mode !== undefined ? String(body.mode) : "apply_top",
            assumeNoCooldown: body.assumeNoCooldown !== undefined ? !!body.assumeNoCooldown : true
          });
          const source = body.source !== undefined ? String(body.source) : "api";
          const r = embedJobs?.adoptBenchmarkRecommendation?.({ benchmarkResult: benchmark, source }) || { ok: false, error: "benchmark_adopt_not_available" };
          if (!r.ok) return badRequest(res, r.error || "benchmark adopt failed");
          return json(res, 200, { ok: true, result: r });
        } catch (e) {
          return badRequest(res, e?.message || String(e));
        }
      }

      if (req.method === "POST" && url.pathname === "/embed/jobs/governance/rollback") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        const versionId = body.versionId !== undefined ? String(body.versionId) : "";
        const source = body.source !== undefined ? String(body.source) : "api";
        const r = embedJobs?.rollbackPolicyVersion?.(versionId, { source }) || { ok: false, error: "governance_not_available" };
        if (!r.ok) return badRequest(res, r.error || "rollback failed");
        return json(res, 200, { ok: true, result: r });
      }

      if (req.method === "POST" && url.pathname === "/embed/jobs") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        const args = {};
        if (body.provider !== undefined) args.provider = String(body.provider);
        if (body.model !== undefined) args.model = String(body.model);
        if (body.apiKey !== undefined) args.apiKey = String(body.apiKey);
        if (body.dim !== undefined) args.dim = Number(body.dim);
        if (body.kinds !== undefined) {
          const kinds = parseKindsList(body.kinds);
          if (!kinds.length) return badRequest(res, "kinds must be a non-empty list/string when provided");
          args.kinds = kinds;
        }
        if (body.recentDays !== undefined) args.recentDays = Number(body.recentDays);
        if (body.maxChunksPerFile !== undefined) args.maxChunksPerFile = Number(body.maxChunksPerFile);
        if (body.maxCharsPerChunk !== undefined) args.maxCharsPerChunk = Number(body.maxCharsPerChunk);
        if (body.overlapChars !== undefined) args.overlapChars = Number(body.overlapChars);
        if (body.maxTotalChunks !== undefined) args.maxTotalChunks = Number(body.maxTotalChunks);
        if (body.parallelism !== undefined) args.parallelism = Number(body.parallelism);
        if (body.parallel !== undefined) args.parallelism = Number(body.parallel);
        if (body.batchDelayMs !== undefined) args.batchDelayMs = Number(body.batchDelayMs);
        if (body.force !== undefined) args.force = !!body.force;

        const job = embedJobs?.enqueue?.(
          args,
          {
            trigger: String(body.trigger || "api"),
            reason: String(body.reason || ""),
            priority: String(body.priority || "normal"),
            maxRetries: body.maxRetries !== undefined ? Number(body.maxRetries) : 1,
            retryDelayMs: body.retryDelayMs !== undefined ? Number(body.retryDelayMs) : 1000,
            retryTemplate: body.retryTemplate !== undefined ? String(body.retryTemplate) : undefined,
            retryStrategy: body.retryStrategy !== undefined ? String(body.retryStrategy) : undefined,
            maxDelayMs: body.maxDelayMs !== undefined ? Number(body.maxDelayMs) : undefined,
            backoffMultiplier: body.backoffMultiplier !== undefined ? Number(body.backoffMultiplier) : undefined,
            jitterRatio: body.jitterRatio !== undefined ? Number(body.jitterRatio) : undefined
          }
        );
        return json(res, 200, { ok: true, job });
      }

      if (req.method === "POST" && url.pathname === "/embed/jobs/retry-failed") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        const r = embedJobs?.retryFailed?.({
          limit: body.limit !== undefined ? Number(body.limit) : 5,
          errorClass: body.errorClass !== undefined ? String(body.errorClass) : "",
          clusterKey: body.clusterKey !== undefined ? String(body.clusterKey) : "",
          priority: body.priority !== undefined ? String(body.priority) : undefined,
          retryTemplate: body.retryTemplate !== undefined ? String(body.retryTemplate) : undefined
        });
        return json(res, 200, { ok: true, result: r || { ok: true, retried: [] } });
      }

      const jobM = req.method === "GET" ? url.pathname.match(/^\/embed\/jobs\/([^/]+)$/) : null;
      if (jobM) {
        const id = decodeURIComponent(jobM[1] || "");
        const job = embedJobs?.getJob?.(id);
        if (!job) return notFound(res, "embed job not found");
        return json(res, 200, { ok: true, job });
      }

      const retryM = req.method === "POST" ? url.pathname.match(/^\/embed\/jobs\/([^/]+)\/retry$/) : null;
      if (retryM) {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        const id = decodeURIComponent(retryM[1] || "");
        const r = embedJobs?.retryJob?.(id, {
          priority: body.priority !== undefined ? String(body.priority) : undefined,
          retryTemplate: body.retryTemplate !== undefined ? String(body.retryTemplate) : undefined,
          retryStrategy: body.retryStrategy !== undefined ? String(body.retryStrategy) : undefined,
          maxRetries: body.maxRetries !== undefined ? Number(body.maxRetries) : undefined,
          retryDelayMs: body.retryDelayMs !== undefined ? Number(body.retryDelayMs) : undefined,
          maxDelayMs: body.maxDelayMs !== undefined ? Number(body.maxDelayMs) : undefined,
          backoffMultiplier: body.backoffMultiplier !== undefined ? Number(body.backoffMultiplier) : undefined,
          jitterRatio: body.jitterRatio !== undefined ? Number(body.jitterRatio) : undefined
        });
        if (!r?.ok) return badRequest(res, r?.error || "retry failed");
        return json(res, 200, { ok: true, result: r });
      }

      const cancelM = req.method === "POST" ? url.pathname.match(/^\/embed\/jobs\/([^/]+)\/cancel$/) : null;
      if (cancelM) {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const id = decodeURIComponent(cancelM[1] || "");
        const r = embedJobs?.cancel?.(id);
        if (!r?.ok) return notFound(res, "embed job not found");
        return json(res, 200, { ok: true, result: r });
      }

      if (req.method === "GET" && url.pathname === "/embed/plan") {
        const format = String(url.searchParams.get("format") || "json").toLowerCase();
        if (format !== "json" && format !== "md") return badRequest(res, "format must be json|md");
        const provider = String(url.searchParams.get("provider") || "mock");
        const model = String(url.searchParams.get("model") || "");
        const dim = Number(url.searchParams.get("dim") || 128);
        const recentDays = url.searchParams.get("recentDays") !== null ? Number(url.searchParams.get("recentDays")) : undefined;
        const parallelism =
          url.searchParams.get("parallelism") !== null
            ? Number(url.searchParams.get("parallelism"))
            : (url.searchParams.get("parallel") !== null ? Number(url.searchParams.get("parallel")) : undefined);
        const batchDelayMs =
          url.searchParams.get("batchDelayMs") !== null
            ? Number(url.searchParams.get("batchDelayMs"))
            : (url.searchParams.get("batch-delay-ms") !== null ? Number(url.searchParams.get("batch-delay-ms")) : undefined);
        const kindsRaw = url.searchParams.get("kinds");
        const kinds = kindsRaw ? parseKindsList(kindsRaw) : undefined;

        const r = await planEmbeddingsBuild(root, { provider, model, dim, kinds, recentDays, parallelism, batchDelayMs });
        if (format === "json") return json(res, 200, r);
        const lines = [];
        lines.push("# Embeddings Build Plan");
        lines.push("");
        lines.push(`- root: ${r.root}`);
        lines.push(`- upToDate: ${r.summary.upToDate ? "yes" : "no"}`);
        lines.push(`- files: total=${r.summary.totalFiles}, reuse=${r.summary.reuseFiles}, embed=${r.summary.embedFiles}`);
        lines.push(`- staleIndexedFiles: ${r.summary.staleIndexedFiles}`);
        if (r.staleIndexedFiles.length) {
          lines.push("");
          lines.push("## Stale Indexed Files");
          for (const s of r.staleIndexedFiles) lines.push(`- ${s}`);
        }
        lines.push("");
        lines.push("## File Actions");
        if (!r.files.length) lines.push("- (no files)");
        for (const f of r.files) lines.push(`- [${f.action}] ${f.file} (${f.kind}) reason=${f.reason} indexedChunkIds=${f.indexedChunkIds}`);
        lines.push("");
        return text(res, 200, lines.join("\n"), "text/markdown; charset=utf-8");
      }

      if (req.method === "GET" && url.pathname === "/status") {
        const format = String(url.searchParams.get("format") || "json").toLowerCase();
        const mode = String(url.searchParams.get("mode") || "full").toLowerCase();
        const snipLines = Number(url.searchParams.get("snipLines") || 120);
        const recentDays = Number(url.searchParams.get("recentDays") || 7);
        if (format !== "json" && format !== "md") return badRequest(res, "format must be json|md");
        const out = await buildStatus(root, { format, mode, snipLines, recentDays });
        if (format === "json") return json(res, 200, out);
        return text(res, 200, out, "text/markdown; charset=utf-8");
      }

      if (req.method === "GET" && url.pathname === "/context") {
        const p = contextPath(root);
        const s = await readMaybe(p, 5_000_000);
        if (!s) return notFound(res, "Missing .repo-memory/context.md (run: rmemo context or rmemo start)");
        return text(res, 200, s, "text/markdown; charset=utf-8");
      }

      if (req.method === "GET" && url.pathname === "/manifest") {
        const p = manifestPath(root);
        const s = await readMaybe(p, 5_000_000);
        if (!s) return notFound(res, "Missing .repo-memory/manifest.json (run: rmemo scan or rmemo init)");
        return text(res, 200, s, "application/json; charset=utf-8");
      }

      if (req.method === "GET" && url.pathname === "/index") {
        const p = indexPath(root);
        const s = await readMaybe(p, 10_000_000);
        if (!s) return notFound(res, "Missing .repo-memory/index.json (run: rmemo scan or rmemo init)");
        return text(res, 200, s, "application/json; charset=utf-8");
      }

      if (req.method === "GET" && url.pathname === "/rules") {
        const p = rulesPath(root);
        const s = await readMaybe(p, 2_000_000);
        if (!s) return notFound(res, "Missing .repo-memory/rules.md (run: rmemo init)");
        return text(res, 200, s, "text/markdown; charset=utf-8");
      }

      if (req.method === "GET" && url.pathname === "/rules.json") {
        const p = rulesJsonPath(root);
        const s = await readMaybe(p, 2_000_000);
        if (!s) return notFound(res, "Missing .repo-memory/rules.json (run: rmemo init)");
        return text(res, 200, s, "application/json; charset=utf-8");
      }

      if (req.method === "GET" && url.pathname === "/todos") {
        const format = String(url.searchParams.get("format") || "md").toLowerCase();
        const p = todosPath(root);
        const s = await readMaybe(p, 2_000_000);
        if (!s) return notFound(res, "Missing .repo-memory/todos.md (run: rmemo init)");
        if (format === "json") {
          return json(res, 200, { schema: 1, root, todos: parseTodos(s) });
        }
        return text(res, 200, s, "text/markdown; charset=utf-8");
      }

      if (req.method === "GET" && url.pathname === "/handoff") {
        const format = String(url.searchParams.get("format") || "md").toLowerCase();
        const refresh = url.searchParams.get("refresh") === "1";
        if (refresh) {
          if (!allowRefresh) return badRequest(res, "Refresh not allowed. Start with: rmemo serve --allow-refresh");
          const preferGit = url.searchParams.get("noGit") === "1" ? false : true;
          const maxFiles = Number(url.searchParams.get("maxFiles") || 4000);
          const snipLines = Number(url.searchParams.get("snipLines") || 120);
          const recentDays = Number(url.searchParams.get("recentDays") || 3);
          const since = String(url.searchParams.get("since") || "");
          const staged = url.searchParams.get("staged") === "1";
          const maxChanges = Number(url.searchParams.get("maxChanges") || 200);
          const r = await generateHandoff(root, { preferGit, maxFiles, snipLines, recentDays, since, staged, maxChanges, format });
          if (format === "json") return json(res, 200, r.json);
          return text(res, 200, r.markdown, "text/markdown; charset=utf-8");
        }
        if (format === "json") {
          const s = await readMaybe(handoffJsonPath(root), 5_000_000);
          if (!s) return notFound(res, "Missing .repo-memory/handoff.json (run: rmemo --format json handoff)");
          return text(res, 200, s, "application/json; charset=utf-8");
        }
        const s = await readMaybe(handoffPath(root), 5_000_000);
        if (!s) return notFound(res, "Missing .repo-memory/handoff.md (run: rmemo handoff)");
        return text(res, 200, s, "text/markdown; charset=utf-8");
      }

      if (req.method === "GET" && url.pathname === "/pr") {
        const format = String(url.searchParams.get("format") || "md").toLowerCase();
        const refresh = url.searchParams.get("refresh") === "1";
        if (refresh) {
          if (!allowRefresh) return badRequest(res, "Refresh not allowed. Start with: rmemo serve --allow-refresh");
          const preferGit = url.searchParams.get("noGit") === "1" ? false : true;
          const maxFiles = Number(url.searchParams.get("maxFiles") || 4000);
          const snipLines = Number(url.searchParams.get("snipLines") || 120);
          const recentDays = Number(url.searchParams.get("recentDays") || 2);
          const base = String(url.searchParams.get("base") || "");
          const staged = url.searchParams.get("staged") === "1";
          const maxChanges = Number(url.searchParams.get("maxChanges") || 200);
          const r = await generatePr(root, { preferGit, maxFiles, snipLines, recentDays, base, staged, refresh: true, maxChanges, format });
          if (format === "json") return json(res, 200, r.json);
          return text(res, 200, r.markdown, "text/markdown; charset=utf-8");
        }
        if (format === "json") {
          const s = await readMaybe(prJsonPath(root), 5_000_000);
          if (!s) return notFound(res, "Missing .repo-memory/pr.json (run: rmemo --format json pr)");
          return text(res, 200, s, "application/json; charset=utf-8");
        }
        const s = await readMaybe(prPath(root), 5_000_000);
        if (!s) return notFound(res, "Missing .repo-memory/pr.md (run: rmemo pr)");
        return text(res, 200, s, "text/markdown; charset=utf-8");
      }

      if (req.method === "GET" && url.pathname === "/journal") {
        const recentDays = Number(url.searchParams.get("recentDays") || 7);
        const files = await listRecentJournalFiles(root, recentDays);
        return json(res, 200, { schema: 1, root, files });
      }

      if (req.method === "GET" && url.pathname.startsWith("/journal/")) {
        const name = url.pathname.slice("/journal/".length);
        if (!/^\d{4}-\d{2}-\d{2}\.md$/.test(name)) return badRequest(res, "Invalid journal filename");
        const p = path.join(journalDir(root), name);
        const s = await readMaybe(p, 2_000_000);
        if (!s) return notFound(res, "Missing journal file");
        return text(res, 200, s, "text/markdown; charset=utf-8");
      }

      if (req.method === "GET" && url.pathname === "/search") {
        const q = String(url.searchParams.get("q") || "").trim();
        if (!q) return badRequest(res, "Missing q");
        const mode = String(url.searchParams.get("mode") || "keyword").toLowerCase();

        if (mode === "semantic") {
          const k = Number(url.searchParams.get("k") || url.searchParams.get("maxHits") || 8);
          const minScore = Number(url.searchParams.get("minScore") || url.searchParams.get("min-score") || 0.15);
          const out = await semanticSearch(root, { q, k, minScore });
          return json(res, 200, out);
        }

        if (mode !== "keyword") return badRequest(res, "mode must be keyword|semantic");

        const maxHits = Math.min(200, Math.max(1, Number(url.searchParams.get("maxHits") || 50)));
        const scope = String(url.searchParams.get("scope") || "rules,todos,context,manifest,journal").toLowerCase();
        const scopes = new Set(scope.split(",").map((s) => s.trim()).filter(Boolean));

        const hits = [];

        if (scopes.has("rules")) {
          const s = await readMaybe(rulesPath(root), 2_000_000);
          if (s) hits.push(...(await searchInText({ file: ".repo-memory/rules.md", text: s, q, maxHits })));
        }
        if (scopes.has("todos")) {
          const s = await readMaybe(todosPath(root), 2_000_000);
          if (s) hits.push(...(await searchInText({ file: ".repo-memory/todos.md", text: s, q, maxHits })));
        }
        if (scopes.has("context")) {
          const s = await readMaybe(contextPath(root), 5_000_000);
          if (s) hits.push(...(await searchInText({ file: ".repo-memory/context.md", text: s, q, maxHits })));
        }
        if (scopes.has("manifest")) {
          const s = await readMaybe(manifestPath(root), 5_000_000);
          if (s) hits.push(...(await searchInText({ file: ".repo-memory/manifest.json", text: s, q, maxHits })));
        }
        if (scopes.has("journal")) {
          const files = await listRecentJournalFiles(root, Number(url.searchParams.get("recentDays") || 14));
          for (const fn of files) {
            // eslint-disable-next-line no-await-in-loop
            const s = await readMaybe(path.join(journalDir(root), fn), 2_000_000);
            if (!s) continue;
            hits.push(...(await searchInText({ file: `.repo-memory/journal/${fn}`, text: s, q, maxHits })));
            if (hits.length >= maxHits) break;
          }
        }

        return json(res, 200, { schema: 1, root, q, hits: hits.slice(0, maxHits) });
      }

      if (req.method === "GET" && url.pathname === "/focus") {
        const q = String(url.searchParams.get("q") || "").trim();
        if (!q) return badRequest(res, "Missing q");
        const format = String(url.searchParams.get("format") || "md").toLowerCase();
        const mode = String(url.searchParams.get("mode") || "semantic").toLowerCase();
        const k = Number(url.searchParams.get("k") || 8);
        const minScore = Number(url.searchParams.get("minScore") || url.searchParams.get("min-score") || 0.15);
        const maxHits = Number(url.searchParams.get("maxHits") || 50);
        const recentDays = Number(url.searchParams.get("recentDays") || 14);
        const includeStatus = url.searchParams.get("includeStatus") === "0" ? false : true;

        if (format !== "md" && format !== "json") return badRequest(res, "format must be md|json");
        const out = await generateFocus(root, { q, mode, format, k, minScore, maxHits, recentDays, includeStatus });
        if (format === "json") return json(res, 200, out.json);
        return text(res, 200, out.markdown, "text/markdown; charset=utf-8");
      }

      if (req.method === "GET" && url.pathname === "/ws/list") {
        const maxFiles = Number(url.searchParams.get("maxFiles") || 4000);
        const preferGit = url.searchParams.get("noGit") === "1" ? false : true;
        const onlyDirs = String(url.searchParams.get("only") || "");
        const out = await listWorkspaces(root, { preferGit, maxFiles, onlyDirs });
        return json(res, 200, out);
      }

      if (req.method === "GET" && url.pathname === "/ws/focus") {
        const q = String(url.searchParams.get("q") || "").trim();
        if (!q) return badRequest(res, "Missing q");
        const mode = String(url.searchParams.get("mode") || "semantic").toLowerCase();
        if (mode !== "semantic" && mode !== "keyword") return badRequest(res, "mode must be semantic|keyword");
        const k = Number(url.searchParams.get("k") || 8);
        const minScore = Number(url.searchParams.get("minScore") || url.searchParams.get("min-score") || 0.15);
        const maxHits = Number(url.searchParams.get("maxHits") || 50);
        const recentDays = Number(url.searchParams.get("recentDays") || 14);
        const includeStatus = url.searchParams.get("includeStatus") === "1";
        const save = url.searchParams.get("save") === "1";
        const compareLatest = url.searchParams.get("compareLatest") === "1";
        const tag = String(url.searchParams.get("tag") || "");
        const maxFiles = Number(url.searchParams.get("maxFiles") || 4000);
        const preferGit = url.searchParams.get("noGit") === "1" ? false : true;
        const onlyDirs = String(url.searchParams.get("only") || "");
        const report = await batchWorkspaceFocus(root, {
          q,
          mode,
          k,
          minScore,
          maxHits,
          recentDays,
          includeStatus,
          preferGit,
          maxFiles,
          onlyDirs
        });
        const comparison = compareLatest ? await compareWorkspaceFocusWithLatest(root, report) : null;
        const snapshot = save ? await saveWorkspaceFocusSnapshot(root, report, { tag }) : null;
        return json(res, 200, {
          ...report,
          snapshot: snapshot ? { id: snapshot.id, path: snapshot.path, tag: snapshot.snapshot?.tag || null } : null,
          comparison
        });
      }

      if (req.method === "GET" && url.pathname === "/ws/focus/snapshots") {
        const limit = Number(url.searchParams.get("limit") || 20);
        const out = await listWorkspaceFocusSnapshots(root, { limit });
        return json(res, 200, out);
      }

      if (req.method === "GET" && url.pathname === "/ws/focus/compare") {
        const fromId = String(url.searchParams.get("from") || "").trim();
        const toId = String(url.searchParams.get("to") || "").trim();
        if (!fromId || !toId) return badRequest(res, "Missing from/to snapshot ids");
        const out = await compareWorkspaceFocusSnapshots(root, { fromId, toId });
        return json(res, 200, out);
      }

      if (req.method === "GET" && url.pathname === "/ws/focus/report") {
        const fromId = String(url.searchParams.get("from") || "").trim();
        const toId = String(url.searchParams.get("to") || "").trim();
        const format = String(url.searchParams.get("format") || "json").toLowerCase();
        const maxItems = Number(url.searchParams.get("maxItems") || 50);
        const save = url.searchParams.get("save") === "1";
        const tag = String(url.searchParams.get("tag") || "");
        if (format !== "json" && format !== "md") return badRequest(res, "format must be json|md");
        const out = await generateWorkspaceFocusReport(root, { fromId, toId, maxItems });
        const saved = save ? await saveWorkspaceFocusReport(root, out.json, { tag }) : null;
        if (format === "md") {
          let body = out.markdown;
          if (saved) body += `Saved report: ${saved.id}\n`;
          return text(res, 200, body, "text/markdown; charset=utf-8");
        }
        return json(res, 200, { ...out.json, savedReport: saved ? { id: saved.id, path: saved.path, tag: saved.report?.tag || null } : null });
      }

      if (req.method === "GET" && url.pathname === "/ws/focus/reports") {
        const limit = Number(url.searchParams.get("limit") || 20);
        const out = await listWorkspaceFocusReports(root, { limit });
        return json(res, 200, out);
      }

      if (req.method === "GET" && url.pathname === "/ws/focus/report-item") {
        const id = String(url.searchParams.get("id") || "").trim();
        const format = String(url.searchParams.get("format") || "json").toLowerCase();
        if (!id) return badRequest(res, "Missing report id");
        if (format !== "json" && format !== "md") return badRequest(res, "format must be json|md");
        const out = await getWorkspaceFocusReport(root, id);
        if (format === "json") return json(res, 200, out);
        const report = out?.report || {};
        const lines = [];
        lines.push(`# Workspace Focus Report ${out.id}\n`);
        lines.push(`Created: ${out.createdAt || "-"}`);
        lines.push(`Tag: ${out.tag || "-"}`);
        lines.push(`From: ${report?.from?.id || "-"}`);
        lines.push(`To: ${report?.to?.id || "-"}`);
        lines.push("");
        lines.push("## Summary\n");
        lines.push(`- changedCount: ${report?.summary?.changedCount ?? 0}`);
        lines.push(`- increased: ${report?.summary?.increased ?? 0}`);
        lines.push(`- decreased: ${report?.summary?.decreased ?? 0}`);
        lines.push(`- regressedErrors: ${report?.summary?.regressedErrors ?? 0}`);
        lines.push("");
        return text(res, 200, lines.join("\n"), "text/markdown; charset=utf-8");
      }

      if (req.method === "GET" && url.pathname === "/ws/focus/trends") {
        const limitGroups = Number(url.searchParams.get("limitGroups") || 20);
        const limitReports = Number(url.searchParams.get("limitReports") || 200);
        const out = await listWorkspaceFocusTrends(root, { limitGroups, limitReports });
        return json(res, 200, out);
      }

      if (req.method === "GET" && url.pathname === "/ws/focus/trend") {
        const key = String(url.searchParams.get("key") || "").trim();
        const limit = Number(url.searchParams.get("limit") || 100);
        if (!key) return badRequest(res, "Missing trend key");
        const format = String(url.searchParams.get("format") || "json").toLowerCase();
        if (format !== "json" && format !== "md") return badRequest(res, "format must be json|md");
        const out = await getWorkspaceFocusTrend(root, { key, limit });
        if (format === "json") return json(res, 200, out);
        const lines = [];
        lines.push(`# Workspace Trend ${out.key}\n`);
        lines.push(`Query: "${out.query}"`);
        lines.push(`Mode: ${out.mode}\n`);
        lines.push("## Summary\n");
        lines.push(`- reports: ${out.summary?.reports ?? 0}`);
        lines.push(`- avgChangedCount: ${out.summary?.avgChangedCount ?? 0}`);
        lines.push(`- maxChangedCount: ${out.summary?.maxChangedCount ?? 0}`);
        lines.push(`- maxRegressedErrors: ${out.summary?.maxRegressedErrors ?? 0}\n`);
        lines.push("## Series\n");
        for (const p of out.series) lines.push(`- ${p.createdAt}: changed=${p.changedCount}, regressedErrors=${p.regressedErrors}`);
        lines.push("");
        return text(res, 200, lines.join("\n"), "text/markdown; charset=utf-8");
      }

      if (req.method === "GET" && url.pathname === "/ws/focus/alerts") {
        const limitGroups = Number(url.searchParams.get("limitGroups") || 20);
        const limitReports = Number(url.searchParams.get("limitReports") || 200);
        const key = String(url.searchParams.get("key") || "");
        const out = await evaluateWorkspaceFocusAlerts(root, { limitGroups, limitReports, key });
        return json(res, 200, out);
      }

      if (req.method === "GET" && url.pathname === "/ws/focus/alerts/config") {
        const cfg = await getWorkspaceFocusAlertsConfig(root);
        return json(res, 200, { schema: 1, root, config: cfg });
      }

      if (req.method === "POST" && url.pathname === "/ws/focus/alerts/config") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        const patch = {
          enabled: body.enabled,
          minReports: body.minReports,
          maxRegressedErrors: body.maxRegressedErrors,
          maxAvgChangedCount: body.maxAvgChangedCount,
          maxChangedCount: body.maxChangedCount,
          autoGovernanceEnabled: body.autoGovernanceEnabled,
          autoGovernanceCooldownMs: body.autoGovernanceCooldownMs
        };
        const cfg = await setWorkspaceFocusAlertsConfig(root, patch);
        events?.emit?.({ type: "ws:alerts:config", config: cfg });
        return json(res, 200, { ok: true, config: cfg });
      }

      if (req.method === "POST" && url.pathname === "/ws/focus/alerts/check") {
        const autoGovernance = url.searchParams.get("autoGovernance") === "1";
        const source = String(url.searchParams.get("source") || "ws-alert");
        if (autoGovernance && !allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const out = await evaluateWorkspaceFocusAlerts(root, {});
        let auto = { attempted: false, triggered: false, reason: "disabled" };
        if (autoGovernance) {
          const cfg = out?.config || {};
          auto.attempted = true;
          const hasHigh = (out?.alerts || []).some((x) => x.level === "high");
          const now = Date.now();
          const lastAtMs = cfg.lastAutoGovernanceAt ? Date.parse(cfg.lastAutoGovernanceAt) : 0;
          const cooldownMs = Number(cfg.autoGovernanceCooldownMs || 0);
          if (!cfg.autoGovernanceEnabled) {
            auto = { attempted: true, triggered: false, reason: "auto_governance_disabled" };
          } else if (!hasHigh) {
            auto = { attempted: true, triggered: false, reason: "no_high_alert" };
          } else if (lastAtMs && now - lastAtMs < cooldownMs) {
            auto = { attempted: true, triggered: false, reason: "cooldown", retryAfterMs: cooldownMs - (now - lastAtMs) };
          } else {
            const embedJobs = getEmbedJobs?.();
            const r = embedJobs?.applyTopGovernanceRecommendation?.({ source }) || { ok: false, error: "governance_not_available" };
            if (r.ok) {
              const cfg2 = await setWorkspaceFocusAlertsConfig(root, { lastAutoGovernanceAt: new Date().toISOString() });
              auto = { attempted: true, triggered: true, result: r, config: cfg2 };
              events?.emit?.({ type: "ws:alerts:auto-governance", ok: true, source, alerts: out.summary });
            } else {
              auto = { attempted: true, triggered: false, reason: r.error || "governance_apply_failed", result: r };
              events?.emit?.({ type: "ws:alerts:auto-governance", ok: false, source, error: r.error || "failed" });
            }
          }
        }
        const incident = await appendWorkspaceFocusAlertIncident(root, { alerts: out, autoGovernance: auto, source, key: String(url.searchParams.get("key") || "") });
        events?.emit?.({ type: "ws:alerts:incident", incidentId: incident.id, source, summary: out.summary });
        events?.emit?.({ type: "ws:alerts:check", summary: out.summary, autoGovernance: auto });
        return json(res, 200, { ok: true, alerts: out, autoGovernance: auto, incident: { id: incident.id, createdAt: incident.createdAt } });
      }

      if (req.method === "GET" && url.pathname === "/ws/focus/alerts/history") {
        const limit = Number(url.searchParams.get("limit") || 20);
        const key = String(url.searchParams.get("key") || "");
        const level = String(url.searchParams.get("level") || "");
        const out = await listWorkspaceFocusAlertIncidents(root, { limit, key, level });
        return json(res, 200, out);
      }

      if (req.method === "GET" && url.pathname === "/ws/focus/alerts/rca") {
        const incidentId = String(url.searchParams.get("incidentId") || "");
        const key = String(url.searchParams.get("key") || "");
        const limit = Number(url.searchParams.get("limit") || 20);
        const format = String(url.searchParams.get("format") || "json").toLowerCase();
        if (format !== "json" && format !== "md") return badRequest(res, "format must be json|md");
        const out = await generateWorkspaceFocusAlertsRca(root, { incidentId, key, limit });
        if (format === "json") return json(res, 200, out.json);
        return text(res, 200, out.markdown, "text/markdown; charset=utf-8");
      }

      if (req.method === "GET" && url.pathname === "/ws/focus/alerts/action-plan") {
        const incidentId = String(url.searchParams.get("incidentId") || "");
        const key = String(url.searchParams.get("key") || "");
        const limit = Number(url.searchParams.get("limit") || 20);
        const save = url.searchParams.get("save") === "1";
        const tag = String(url.searchParams.get("tag") || "");
        const format = String(url.searchParams.get("format") || "json").toLowerCase();
        if (format !== "json" && format !== "md") return badRequest(res, "format must be json|md");
        if (save && !allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const out = await generateWorkspaceFocusAlertsActionPlan(root, { incidentId, key, limit });
        const saved = save ? await saveWorkspaceFocusAlertsActionPlan(root, out.json, { tag }) : null;
        if (format === "md") {
          let body = out.markdown;
          if (saved) body += `Saved action plan: ${saved.id}\n`;
          return text(res, 200, body, "text/markdown; charset=utf-8");
        }
        return json(res, 200, { ...out.json, savedAction: saved ? { id: saved.id, path: saved.path, tag: saved.action?.tag || null } : null });
      }

      if (req.method === "GET" && url.pathname === "/ws/focus/alerts/actions") {
        const limit = Number(url.searchParams.get("limit") || 20);
        const out = await listWorkspaceFocusAlertsActions(root, { limit });
        return json(res, 200, out);
      }

      if (req.method === "GET" && url.pathname === "/ws/focus/alerts/action-item") {
        const id = String(url.searchParams.get("id") || "");
        const format = String(url.searchParams.get("format") || "json").toLowerCase();
        if (!id) return badRequest(res, "Missing action id");
        if (format !== "json" && format !== "md") return badRequest(res, "format must be json|md");
        const out = await getWorkspaceFocusAlertsAction(root, id);
        if (format === "json") return json(res, 200, out);
        const lines = [];
        lines.push(`# Workspace Alerts Action ${out.id}`);
        lines.push("");
        lines.push(`- createdAt: ${out.createdAt || "-"}`);
        lines.push(`- tag: ${out.tag || "-"}`);
        lines.push(`- anchorIncident: ${out.plan?.rcaAnchor?.id || "-"}`);
        lines.push("");
        lines.push("## Tasks");
        const tasks = Array.isArray(out.plan?.tasks) ? out.plan.tasks : [];
        if (!tasks.length) lines.push("- (none)");
        else for (const t of tasks) lines.push(`- [${t.kind}] ${t.text}`);
        lines.push("");
        return text(res, 200, lines.join("\n"), "text/markdown; charset=utf-8");
      }

      if (req.method === "POST" && url.pathname === "/ws/focus/alerts/action-apply") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        const id = String(body.id || "").trim();
        if (!id) return badRequest(res, "Missing action id");
        const out = await applyWorkspaceFocusAlertsActionPlan(root, {
          id,
          includeBlockers: !!body.includeBlockers,
          noLog: !!body.noLog,
          maxTasks: body.maxTasks !== undefined ? Number(body.maxTasks) : 20
        });
        events?.emit?.({
          type: "ws:alerts:action-applied",
          actionId: out.actionId,
          next: out.applied?.next?.length || 0,
          blockers: out.applied?.blockers?.length || 0
        });
        return json(res, 200, { ok: true, result: out });
      }

      if (req.method === "POST" && url.pathname === "/ws/focus/alerts/board-create") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        const actionId = String(body.actionId || "").trim();
        const title = String(body.title || "");
        if (!actionId) return badRequest(res, "Missing action id");
        const out = await createWorkspaceFocusAlertsBoard(root, { actionId, title });
        events?.emit?.({ type: "ws:alerts:board-created", boardId: out.id, actionId });
        return json(res, 200, { ok: true, result: out });
      }

      if (req.method === "GET" && url.pathname === "/ws/focus/alerts/boards") {
        const limit = Number(url.searchParams.get("limit") || 20);
        const out = await listWorkspaceFocusAlertsBoards(root, { limit });
        return json(res, 200, out);
      }

      if (req.method === "GET" && url.pathname === "/ws/focus/alerts/board-item") {
        const id = String(url.searchParams.get("id") || "");
        const format = String(url.searchParams.get("format") || "json").toLowerCase();
        if (!id) return badRequest(res, "Missing board id");
        if (format !== "json" && format !== "md") return badRequest(res, "format must be json|md");
        const out = await getWorkspaceFocusAlertsBoard(root, id);
        if (format === "json") return json(res, 200, out);
        const lines = [];
        lines.push(`# Workspace Alerts Board ${out.id}`);
        lines.push("");
        lines.push(`- title: ${out.title || "-"}`);
        lines.push(`- actionId: ${out.actionId || "-"}`);
        lines.push(`- updatedAt: ${out.updatedAt || "-"}`);
        lines.push(`- summary: todo=${out.summary?.todo ?? 0} doing=${out.summary?.doing ?? 0} done=${out.summary?.done ?? 0} blocked=${out.summary?.blocked ?? 0}`);
        lines.push("");
        lines.push("## Items");
        const items = Array.isArray(out.items) ? out.items : [];
        if (!items.length) lines.push("- (none)");
        else for (const it of items) lines.push(`- ${it.id} [${it.status}] [${it.kind}] ${it.text}`);
        lines.push("");
        return text(res, 200, lines.join("\n"), "text/markdown; charset=utf-8");
      }

      if (req.method === "POST" && url.pathname === "/ws/focus/alerts/board-update") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        const boardId = String(body.boardId || "").trim();
        const itemId = String(body.itemId || "").trim();
        const status = String(body.status || "").trim();
        const note = String(body.note || "");
        if (!boardId) return badRequest(res, "Missing board id");
        if (!itemId) return badRequest(res, "Missing item id");
        if (!status) return badRequest(res, "Missing status");
        const out = await updateWorkspaceFocusAlertsBoardItem(root, { boardId, itemId, status, note });
        events?.emit?.({ type: "ws:alerts:board-updated", boardId, itemId, status: out.item?.status || status });
        return json(res, 200, { ok: true, result: out });
      }

      if (req.method === "GET" && url.pathname === "/ws/focus/alerts/board-report") {
        const id = String(url.searchParams.get("id") || "");
        const format = String(url.searchParams.get("format") || "json").toLowerCase();
        const maxItems = Number(url.searchParams.get("maxItems") || 20);
        if (!id) return badRequest(res, "Missing board id");
        if (format !== "json" && format !== "md") return badRequest(res, "format must be json|md");
        const out = await generateWorkspaceFocusAlertsBoardReport(root, { boardId: id, maxItems });
        if (format === "json") return json(res, 200, out.json);
        return text(res, 200, out.markdown, "text/markdown; charset=utf-8");
      }

      if (req.method === "POST" && url.pathname === "/ws/focus/alerts/board-close") {
        if (!allowWrite) return badRequest(res, "Write not allowed. Start with: rmemo serve --allow-write");
        const body = await readBodyJsonOr400(req, res);
        if (!body) return;
        const boardId = String(body.boardId || "").trim();
        const reason = String(body.reason || "");
        const force = !!body.force;
        const noLog = !!body.noLog;
        if (!boardId) return badRequest(res, "Missing board id");
        const out = await closeWorkspaceFocusAlertsBoard(root, { boardId, reason, force, noLog });
        events?.emit?.({ type: "ws:alerts:board-closed", boardId, forced: force, summary: out.summary || null });
        return json(res, 200, { ok: true, result: out });
      }

      if (req.method === "POST" && url.pathname === "/shutdown") {
        if (!allowShutdown) return badRequest(res, "Shutdown not allowed. Start with: rmemo serve --allow-shutdown");
        json(res, 200, { ok: true });
        // Close after responding.
        setTimeout(() => getServer?.()?.close(), 10).unref?.();
        return;
      }

      return notFound(res);
    } catch (e) {
      json(res, 500, { ok: false, error: e?.message || String(e) });
    }
  };
}

export async function startServe(root, opts = {}) {
  const {
    host = "127.0.0.1",
    port = 7357,
    token = "",
    allowRefresh = false,
    allowWrite = false,
    allowShutdown = false,
    cors = false,
    watch = false,
    watchIntervalMs = 2000,
    watchSync = true,
    watchEmbed = false
  } = opts;

  if (!isLoopbackHost(host) && !token) {
    throw new Error(`Refusing to bind to non-loopback host without --token (host=${host})`);
  }
  if (allowWrite && !token) {
    throw new Error("Refusing --allow-write without --token (set a token to protect write endpoints).");
  }

  let server = null;
  const events = createEventsBus({ max: 200 });
  const watchState = {
    enabled: false,
    intervalMs: watchIntervalMs,
    sync: watchSync,
    embed: watchEmbed,
    lastOkAt: null,
    lastErrAt: null,
    lastErr: null,
    lastRefresh: null
  };
  const watchCtl = createWatchController(root, { events, watchState });
  const embedJobs = createEmbedJobsController(root, { events, maxHistory: 50 });
  const handler = createServeHandler(root, {
    host,
    port,
    token,
    allowRefresh,
    allowWrite,
    allowShutdown,
    cors,
    getServer: () => server,
    events,
    watchState,
    getWatchCtl: () => watchCtl,
    getEmbedJobs: () => embedJobs
  });

  server = http.createServer((req, res) => {
    // Keep errors isolated per request.
    void handler(req, res);
  });

  await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen({ host, port }, () => resolve());
  });

  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;
  const baseUrl = `http://${host}:${actualPort}`;

  const close = () =>
    new Promise((resolve) => {
      server.close(() => resolve());
    });

  if (watch) {
    await watchCtl.start({ intervalMs: watchIntervalMs, sync: watchSync, embed: watchEmbed });
  }

  const closeAll = async () => {
    await watchCtl.stop("server-close");
    await close();
  };

  return { server, host, port: actualPort, baseUrl, close: closeAll, events, watchCtl };
}
