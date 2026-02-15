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
import { semanticSearch } from "./embeddings.js";
import { generateFocus } from "./focus.js";

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

export async function startServe(root, opts = {}) {
  const {
    host = "127.0.0.1",
    port = 7357,
    token = "",
    allowRefresh = false,
    allowShutdown = false,
    cors = false
  } = opts;

  if (!isLoopbackHost(host) && !token) {
    throw new Error(`Refusing to bind to non-loopback host without --token (host=${host})`);
  }

  let server = null;

  const handler = async (req, res) => {
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

    // Auth: if token is set, require it for everything else.
    if (token) {
      const got = parseAuthToken(req, url);
      if (got !== token) {
        unauthorized(res);
        return;
      }
    }

    try {
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
        setTimeout(() => server?.close(), 10).unref?.();
        return;
      }

      return notFound(res);
    } catch (e) {
      json(res, 500, { ok: false, error: e?.message || String(e) });
    }
  };

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

  return { server, host, port: actualPort, baseUrl, close };
}
