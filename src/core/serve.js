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
import { buildEmbeddingsIndex, defaultEmbeddingConfig, semanticSearch } from "./embeddings.js";
import { generateFocus } from "./focus.js";
import { renderUiHtml } from "./ui.js";
import { addTodoBlocker, addTodoNext, removeTodoBlockerByIndex, removeTodoNextByIndex } from "./todos.js";
import { appendJournalEntry } from "./journal.js";
import { syncAiInstructions } from "./sync.js";
import { embedAuto, readEmbedConfig } from "./embed_auto.js";
import { getEmbedStatus } from "./embed_status.js";
import { refreshRepoMemory, watchRepo } from "./watch.js";

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
  const { host, port, token, allowRefresh, allowWrite, allowShutdown, cors, getServer, events, watchState, getWatchCtl } = opts;

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
        args.force = force;

        const built = await buildEmbeddingsIndex(root, args);
        return json(res, 200, { ok: true, result: { meta: built.meta } });
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
    getWatchCtl: () => watchCtl
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
