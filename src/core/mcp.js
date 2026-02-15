import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, readJson, readText, writeJson, writeText } from "../lib/io.js";
import {
  configPath,
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
import { addTodoBlocker, addTodoNext, parseTodos, removeTodoBlockerByIndex, removeTodoNextByIndex } from "./todos.js";
import { appendJournalEntry } from "./journal.js";
import { scanRepo } from "./scan.js";
import { ensureRepoMemory } from "./memory.js";
import { generateContext } from "./context.js";
import { generateHandoff } from "./handoff.js";
import { generatePr } from "./pr.js";
import { semanticSearch } from "./embeddings.js";
import { generateFocus } from "./focus.js";
import { syncAiInstructions } from "./sync.js";
import { embedAuto } from "./embed_auto.js";

const SERVER_NAME = "rmemo";
const SERVER_VERSION = "0.0.0-dev";
const DEFAULT_PROTOCOL = "2024-11-05";

function logFactory(level) {
  const levels = { debug: 10, info: 20, warn: 30, error: 40 };
  const cur = levels[level] ?? levels.info;
  const emit = (lvl, msg) => {
    if ((levels[lvl] ?? 999) < cur) return;
    process.stderr.write(`[mcp:${lvl}] ${msg}\n`);
  };
  return {
    debug: (m) => emit("debug", m),
    info: (m) => emit("info", m),
    warn: (m) => emit("warn", m),
    error: (m) => emit("error", m)
  };
}

function send(msg) {
  // One JSON object per line.
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  send({ jsonrpc: "2.0", id, error: err });
}

function isRequest(m) {
  return m && m.jsonrpc === "2.0" && typeof m.method === "string" && Object.prototype.hasOwnProperty.call(m, "id");
}

function isNotification(m) {
  return m && m.jsonrpc === "2.0" && typeof m.method === "string" && !Object.prototype.hasOwnProperty.call(m, "id");
}

function clampLines(s, maxLines) {
  const lines = String(s || "").split("\n");
  if (lines.length <= maxLines) return String(s || "").trimEnd();
  return lines.slice(0, maxLines).join("\n").trimEnd() + "\n[...truncated]";
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

async function buildStatusJson(root, { mode = "full", snipLines = 120, recentDays = 7 } = {}) {
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

async function doSearch(root, { q, scope = "rules,todos,context,manifest,journal", recentDays = 14, maxHits = 50 } = {}) {
  const needle = String(q || "").toLowerCase().trim();
  if (!needle) throw new Error("Missing q");
  const scopes = new Set(String(scope || "").split(",").map((s) => s.trim()).filter(Boolean));
  const lim = Math.min(200, Math.max(1, Number(maxHits || 50)));

  async function searchInText(file, text) {
    const lines = String(text || "").split("\n");
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.toLowerCase().includes(needle)) {
        hits.push({ file, line: i + 1, text: line.slice(0, 400) });
        if (hits.length >= lim) break;
      }
    }
    return hits;
  }

  const hits = [];

  if (scopes.has("rules")) {
    const s = await readMaybe(rulesPath(root), 2_000_000);
    if (s) hits.push(...(await searchInText(".repo-memory/rules.md", s)));
  }
  if (scopes.has("todos")) {
    const s = await readMaybe(todosPath(root), 2_000_000);
    if (s) hits.push(...(await searchInText(".repo-memory/todos.md", s)));
  }
  if (scopes.has("context")) {
    const s = await readMaybe(contextPath(root), 5_000_000);
    if (s) hits.push(...(await searchInText(".repo-memory/context.md", s)));
  }
  if (scopes.has("manifest")) {
    const s = await readMaybe(manifestPath(root), 5_000_000);
    if (s) hits.push(...(await searchInText(".repo-memory/manifest.json", s)));
  }
  if (scopes.has("journal")) {
    const files = await listRecentJournalFiles(root, Number(recentDays || 14));
    for (const fn of files) {
      // eslint-disable-next-line no-await-in-loop
      const s = await readMaybe(path.join(journalDir(root), fn), 2_000_000);
      if (!s) continue;
      hits.push(...(await searchInText(`.repo-memory/journal/${fn}`, s)));
      if (hits.length >= lim) break;
    }
  }

  return { schema: 1, root, q: String(q), hits: hits.slice(0, lim) };
}

function tool(name, description, inputSchema) {
  return { name, description, inputSchema };
}

function toolsList() {
  const rootProp = {
    type: "string",
    description: "Repo root. Defaults to server root if omitted."
  };

  const base = [
    tool("rmemo_status", "Get status summary (rules/todos/journal/manifest) from .repo-memory.", {
      type: "object",
      properties: {
        root: rootProp,
        mode: { type: "string", enum: ["brief", "full"], default: "full" },
        snipLines: { type: "number", default: 120 },
        recentDays: { type: "number", default: 7 }
      },
      additionalProperties: false
    }),
    tool("rmemo_context", "Read .repo-memory/context.md, or generate it if missing (writes file).", {
      type: "object",
      properties: {
        root: rootProp,
        snipLines: { type: "number", default: 120 },
        recentDays: { type: "number", default: 7 },
        refresh: { type: "boolean", default: false, description: "If true, regenerate context (writes file)." },
        noGit: { type: "boolean", default: false },
        maxFiles: { type: "number", default: 4000 }
      },
      additionalProperties: false
    }),
    tool("rmemo_rules", "Read .repo-memory/rules.md.", {
      type: "object",
      properties: { root: rootProp },
      additionalProperties: false
    }),
    tool("rmemo_todos", "Read .repo-memory/todos.md or parsed JSON.", {
      type: "object",
      properties: { root: rootProp, format: { type: "string", enum: ["md", "json"], default: "md" } },
      additionalProperties: false
    }),
    tool("rmemo_handoff", "Read .repo-memory/handoff.md/.json. If refresh=true, regenerate (writes files).", {
      type: "object",
      properties: {
        root: rootProp,
        format: { type: "string", enum: ["md", "json"], default: "md" },
        refresh: { type: "boolean", default: false },
        noGit: { type: "boolean", default: false },
        maxFiles: { type: "number", default: 4000 },
        snipLines: { type: "number", default: 120 },
        recentDays: { type: "number", default: 3 },
        since: { type: "string", default: "" },
        staged: { type: "boolean", default: false },
        maxChanges: { type: "number", default: 200 }
      },
      additionalProperties: false
    }),
    tool("rmemo_pr", "Read .repo-memory/pr.md/.json. If refresh=true, regenerate (writes files).", {
      type: "object",
      properties: {
        root: rootProp,
        format: { type: "string", enum: ["md", "json"], default: "md" },
        refresh: { type: "boolean", default: false },
        base: { type: "string", default: "" },
        staged: { type: "boolean", default: false },
        noGit: { type: "boolean", default: false },
        maxFiles: { type: "number", default: 4000 },
        snipLines: { type: "number", default: 120 },
        recentDays: { type: "number", default: 2 },
        maxChanges: { type: "number", default: 200 }
      },
      additionalProperties: false
    }),
    tool("rmemo_search", "Search repo memory. mode=keyword searches files; mode=semantic uses embeddings index.", {
      type: "object",
      properties: {
        root: rootProp,
        q: { type: "string" },
        mode: { type: "string", enum: ["keyword", "semantic"], default: "keyword" },
        scope: { type: "string", default: "rules,todos,context,manifest,journal" },
        recentDays: { type: "number", default: 14 },
        maxHits: { type: "number", default: 50 },
        k: { type: "number", default: 8, description: "Top-k results for semantic search." },
        minScore: { type: "number", default: 0.15, description: "Minimum cosine similarity for semantic search." }
      },
      required: ["q"],
      additionalProperties: false
    }),
    tool("rmemo_focus", "Generate a paste-ready focus pack for a question (brief status + relevant hits).", {
      type: "object",
      properties: {
        root: rootProp,
        q: { type: "string" },
        mode: { type: "string", enum: ["semantic", "keyword"], default: "semantic" },
        format: { type: "string", enum: ["md", "json"], default: "md" },
        k: { type: "number", default: 8 },
        minScore: { type: "number", default: 0.15 },
        maxHits: { type: "number", default: 50 },
        recentDays: { type: "number", default: 14 },
        includeStatus: { type: "boolean", default: true }
      },
      required: ["q"],
      additionalProperties: false
    })
  ];

  return base;
}

async function ensureScanned(root, { preferGit = true, maxFiles = 4000 } = {}) {
  await ensureRepoMemory(root);
  const { manifest, index } = await scanRepo(root, { maxFiles, preferGit });
  await writeJson(manifestPath(root), manifest);
  await writeJson(indexPath(root), index);
}

function toolsListWithWrite({ allowWrite } = {}) {
  const tools = toolsList();
  if (!allowWrite) return tools;

  const rootProp = {
    type: "string",
    description: "Repo root. Defaults to server root if omitted."
  };

  return tools.concat([
    tool("rmemo_todo_add", "Add a todo item to .repo-memory/todos.md.", {
      type: "object",
      properties: {
        root: rootProp,
        kind: { type: "string", enum: ["next", "blockers"], default: "next" },
        text: { type: "string" }
      },
      required: ["text"],
      additionalProperties: false
    }),
    tool("rmemo_todo_done", "Mark a todo item as done (remove by 1-based index) from .repo-memory/todos.md.", {
      type: "object",
      properties: {
        root: rootProp,
        kind: { type: "string", enum: ["next", "blockers"], default: "next" },
        index: { type: "number", description: "1-based index" }
      },
      required: ["index"],
      additionalProperties: false
    }),
    tool("rmemo_log", "Append a journal entry to .repo-memory/journal/YYYY-MM-DD.md.", {
      type: "object",
      properties: {
        root: rootProp,
        kind: { type: "string", default: "Log" },
        text: { type: "string" }
      },
      required: ["text"],
      additionalProperties: false
    }),
    tool("rmemo_sync", "Generate AI tool instruction files from .repo-memory/ (AGENTS.md, etc.).", {
      type: "object",
      properties: { root: rootProp },
      additionalProperties: false
    }),
    tool("rmemo_embed_auto", "Run embed auto (reads .repo-memory/config.json) to build embeddings if enabled.", {
      type: "object",
      properties: { root: rootProp },
      additionalProperties: false
    })
  ]);
}

async function handleToolCall(serverRoot, name, args, logger, { allowWrite } = {}) {
  const root = args?.root ? path.resolve(String(args.root)) : serverRoot;

  const requireWrite = () => {
    if (!allowWrite) {
      const err = new Error("Write tools are disabled. Start with: rmemo mcp --allow-write");
      err.code = "RMEMO_WRITE_DISABLED";
      throw err;
    }
  };

  if (name === "rmemo_status") {
    const mode = String(args?.mode || "full");
    const snipLines = Number(args?.snipLines || 120);
    const recentDays = Number(args?.recentDays || 7);
    const j = await buildStatusJson(root, { mode, snipLines, recentDays });
    return JSON.stringify(j, null, 2);
  }

  if (name === "rmemo_context") {
    const snipLines = Number(args?.snipLines || 120);
    const recentDays = Number(args?.recentDays || 7);
    const refresh = !!args?.refresh;

    if (!refresh) {
      const s = await readMaybe(contextPath(root), 5_000_000);
      if (s) return s;
    }

    await ensureScanned(root, { preferGit: args?.noGit ? false : true, maxFiles: Number(args?.maxFiles || 4000) });
    const s = await generateContext(root, { snipLines, recentDays });
    await fs.mkdir(path.dirname(contextPath(root)), { recursive: true });
    await fs.writeFile(contextPath(root), s, "utf8");
    return s;
  }

  if (name === "rmemo_rules") {
    const s = await readMaybe(rulesPath(root), 2_000_000);
    if (!s) throw new Error("Missing .repo-memory/rules.md (run: rmemo init)");
    return s;
  }

  if (name === "rmemo_todos") {
    const format = String(args?.format || "md").toLowerCase();
    const s = await readMaybe(todosPath(root), 2_000_000);
    if (!s) throw new Error("Missing .repo-memory/todos.md (run: rmemo init)");
    if (format === "json") return JSON.stringify({ schema: 1, root, todos: parseTodos(s) }, null, 2);
    return s;
  }

  if (name === "rmemo_handoff") {
    const format = String(args?.format || "md").toLowerCase();
    const refresh = !!args?.refresh;
    if (!refresh) {
      const p = format === "json" ? handoffJsonPath(root) : handoffPath(root);
      const s = await readMaybe(p, 5_000_000);
      if (s) return s;
      throw new Error(`Missing ${path.relative(root, p)} (run: rmemo handoff or set refresh=true)`);
    }

    const preferGit = args?.noGit ? false : true;
    const maxFiles = Number(args?.maxFiles || 4000);
    const snipLines = Number(args?.snipLines || 120);
    const recentDays = Number(args?.recentDays || 3);
    const since = String(args?.since || "");
    const staged = !!args?.staged;
    const maxChanges = Number(args?.maxChanges || 200);

    const r = await generateHandoff(root, { preferGit, maxFiles, snipLines, recentDays, since, staged, maxChanges, format });
    return format === "json" ? JSON.stringify(r.json, null, 2) : r.markdown;
  }

  if (name === "rmemo_pr") {
    const format = String(args?.format || "md").toLowerCase();
    const refresh = !!args?.refresh;
    if (!refresh) {
      const p = format === "json" ? prJsonPath(root) : prPath(root);
      const s = await readMaybe(p, 5_000_000);
      if (s) return s;
      throw new Error(`Missing ${path.relative(root, p)} (run: rmemo pr or set refresh=true)`);
    }

    const preferGit = args?.noGit ? false : true;
    const maxFiles = Number(args?.maxFiles || 4000);
    const snipLines = Number(args?.snipLines || 120);
    const recentDays = Number(args?.recentDays || 2);
    const base = String(args?.base || "");
    const staged = !!args?.staged;
    const maxChanges = Number(args?.maxChanges || 200);

    const r = await generatePr(root, { preferGit, maxFiles, snipLines, recentDays, base, staged, refresh: true, maxChanges, format });
    return format === "json" ? JSON.stringify(r.json, null, 2) : r.markdown;
  }

  if (name === "rmemo_search") {
    const q = String(args?.q || "");
    const mode = String(args?.mode || "keyword").toLowerCase();
    if (mode === "semantic") {
      const k = Number(args?.k || 8);
      const minScore = Number(args?.minScore || 0.15);
      const r = await semanticSearch(root, { q, k, minScore });
      return JSON.stringify(r, null, 2);
    }
    const scope = String(args?.scope || "rules,todos,context,manifest,journal");
    const recentDays = Number(args?.recentDays || 14);
    const maxHits = Number(args?.maxHits || 50);
    const r = await doSearch(root, { q, scope, recentDays, maxHits });
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_focus") {
    const q = String(args?.q || "");
    const mode = String(args?.mode || "semantic").toLowerCase();
    const format = String(args?.format || "md").toLowerCase();
    const k = Number(args?.k || 8);
    const minScore = Number(args?.minScore || 0.15);
    const maxHits = Number(args?.maxHits || 50);
    const recentDays = Number(args?.recentDays || 14);
    const includeStatus = args?.includeStatus !== false;

    const r = await generateFocus(root, { q, mode, format, k, minScore, maxHits, recentDays, includeStatus });
    return format === "json" ? JSON.stringify(r.json, null, 2) : r.markdown;
  }

  if (name === "rmemo_todo_add") {
    requireWrite();
    const kind = String(args?.kind || "next").toLowerCase();
    const text = String(args?.text || "").trim();
    if (!text) throw new Error("Missing text");
    if (kind === "blockers") await addTodoBlocker(root, text);
    else await addTodoNext(root, text);
    const s = await readMaybe(todosPath(root), 2_000_000);
    return s || "";
  }

  if (name === "rmemo_todo_done") {
    requireWrite();
    const kind = String(args?.kind || "next").toLowerCase();
    const index = args?.index;
    if (index === undefined || index === null) throw new Error("Missing index");
    if (kind === "blockers") await removeTodoBlockerByIndex(root, index);
    else await removeTodoNextByIndex(root, index);
    const s = await readMaybe(todosPath(root), 2_000_000);
    return s || "";
  }

  if (name === "rmemo_log") {
    requireWrite();
    const kind = String(args?.kind || "Log").trim() || "Log";
    const text = String(args?.text || "").trim();
    if (!text) throw new Error("Missing text");
    const p = await appendJournalEntry(root, { kind, text });
    const s = await readMaybe(p, 2_000_000);
    return JSON.stringify({ ok: true, path: p, excerpt: clampLines(s || "", 120) }, null, 2);
  }

  if (name === "rmemo_sync") {
    requireWrite();
    const r = await syncAiInstructions({ root });
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_embed_auto") {
    requireWrite();
    const r = await embedAuto(root, { checkOnly: false });
    return JSON.stringify({ ok: true, result: r }, null, 2);
  }

  logger.warn(`Unknown tool call: ${name}`);
  throw new Error(`Unknown tool: ${name}`);
}

export async function startMcpServer({ root, logLevel = "info", allowWrite = false } = {}) {
  const serverRoot = path.resolve(root || process.cwd());
  const logger = logFactory(logLevel);

  logger.info(`Starting MCP server (root=${serverRoot}, allowWrite=${allowWrite ? "true" : "false"})`);

  let inited = false;
  const tools = toolsListWithWrite({ allowWrite });

  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buf += chunk;
    while (true) {
      const idx = buf.indexOf("\n");
      if (idx === -1) break;
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;

      let msg = null;
      try {
        msg = JSON.parse(line);
      } catch (e) {
        logger.warn(`Bad JSON: ${e?.message || e}`);
        continue;
      }

      void (async () => {
        if (isNotification(msg)) {
          if (msg.method === "notifications/initialized") {
            inited = true;
          }
          return;
        }

        if (!isRequest(msg)) return;

        const { id, method, params } = msg;
        try {
          if (method === "initialize") {
            const protocolVersion = String(params?.protocolVersion || DEFAULT_PROTOCOL);
            reply(id, {
              protocolVersion,
              capabilities: { tools: { listChanged: false } },
              serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
            });
            return;
          }

          if (method === "tools/list") {
            if (!inited) logger.debug("tools/list before initialized notification");
            reply(id, { tools });
            return;
          }

          if (method === "tools/call") {
            const name = params?.name;
            const args = params?.arguments || {};
            if (!name || typeof name !== "string") throw new Error("Missing tool name");
            const out = await handleToolCall(serverRoot, name, args, logger, { allowWrite });
            reply(id, { content: [{ type: "text", text: out }] });
            return;
          }

          replyError(id, -32601, `Method not found: ${method}`);
        } catch (e) {
          replyError(id, -32000, e?.message || String(e));
        }
      })();
    }
  });

  process.stdin.resume();
}
