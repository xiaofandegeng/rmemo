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
import { buildEmbeddingsIndex, defaultEmbeddingConfig, planEmbeddingsBuild, semanticSearch } from "./embeddings.js";
import { generateFocus } from "./focus.js";
import { syncAiInstructions } from "./sync.js";
import { embedAuto, readEmbedConfig } from "./embed_auto.js";
import { getEmbedStatus } from "./embed_status.js";
import { createEmbedJobsController } from "./embed_jobs.js";
import {
  applyWorkspaceFocusAlertsActionPlan,
  appendWorkspaceFocusAlertIncident,
  applyWorkspaceFocusAlertsBoardsPulsePlan,
  batchWorkspaceFocus,
  closeWorkspaceFocusAlertsBoard,
  compareWorkspaceFocusSnapshots,
  compareWorkspaceFocusWithLatest,
  createWorkspaceFocusAlertsBoard,
  evaluateWorkspaceFocusAlertsBoardsPulse,
  evaluateWorkspaceFocusAlerts,
  generateWorkspaceFocusAlertsActionPlan,
  generateWorkspaceFocusAlertsBoardReport,
  generateWorkspaceFocusAlertsBoardsPulsePlan,
  generateWorkspaceFocusAlertsRca,
  getWorkspaceFocusAlertsConfig,
  getWorkspaceFocusAlertsAction,
  getWorkspaceFocusAlertsBoard,
  getWorkspaceFocusReport,
  getWorkspaceFocusTrend,
  listWorkspaceFocusAlertsBoards,
  listWorkspaceFocusAlertsBoardsPulseHistory,
  listWorkspaceFocusAlertsActions,
  generateWorkspaceFocusReport,
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

function parseKindsList(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((x) => x.trim()).filter(Boolean);
  return [];
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
    }),
    tool("rmemo_ws_list", "List detected monorepo subprojects from root manifest scan.", {
      type: "object",
      properties: {
        root: rootProp,
        noGit: { type: "boolean", default: false },
        maxFiles: { type: "number", default: 4000 },
        only: {
          oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
          description: "Optional subset of subproject dirs."
        }
      },
      additionalProperties: false
    }),
    tool("rmemo_ws_focus", "Run focus query across all detected subprojects and return aggregated results.", {
      type: "object",
      properties: {
        root: rootProp,
        q: { type: "string" },
        mode: { type: "string", enum: ["semantic", "keyword"], default: "semantic" },
        k: { type: "number", default: 8 },
        minScore: { type: "number", default: 0.15 },
        maxHits: { type: "number", default: 50 },
        recentDays: { type: "number", default: 14 },
        includeStatus: { type: "boolean", default: false },
        saveSnapshot: { type: "boolean", default: false },
        compareLatest: { type: "boolean", default: false },
        tag: { type: "string", default: "" },
        noGit: { type: "boolean", default: false },
        maxFiles: { type: "number", default: 4000 },
        only: {
          oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
          description: "Optional subset of subproject dirs."
        }
      },
      required: ["q"],
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_snapshots", "List workspace-focus snapshots saved under .repo-memory/ws-focus.", {
      type: "object",
      properties: {
        root: rootProp,
        limit: { type: "number", default: 20 }
      },
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_compare", "Compare two workspace-focus snapshots by id.", {
      type: "object",
      properties: {
        root: rootProp,
        fromId: { type: "string" },
        toId: { type: "string" }
      },
      required: ["fromId", "toId"],
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_report", "Generate workspace-focus drift report (json or markdown) from two snapshots (or latest two).", {
      type: "object",
      properties: {
        root: rootProp,
        fromId: { type: "string" },
        toId: { type: "string" },
        format: { type: "string", enum: ["json", "md"], default: "json" },
        maxItems: { type: "number", default: 50 },
        save: { type: "boolean", default: false },
        tag: { type: "string", default: "" }
      },
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_report_history", "List saved workspace-focus drift reports.", {
      type: "object",
      properties: {
        root: rootProp,
        limit: { type: "number", default: 20 }
      },
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_report_get", "Get one saved workspace-focus drift report by id.", {
      type: "object",
      properties: {
        root: rootProp,
        id: { type: "string" }
      },
      required: ["id"],
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_trends", "List workspace-focus trend groups aggregated from saved drift reports.", {
      type: "object",
      properties: {
        root: rootProp,
        limitGroups: { type: "number", default: 20 },
        limitReports: { type: "number", default: 200 }
      },
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_trend_get", "Get one workspace-focus trend series by trend key.", {
      type: "object",
      properties: {
        root: rootProp,
        key: { type: "string" },
        limit: { type: "number", default: 100 }
      },
      required: ["key"],
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts", "Evaluate workspace-focus trend alerts using saved reports and current alert config.", {
      type: "object",
      properties: {
        root: rootProp,
        key: { type: "string" },
        limitGroups: { type: "number", default: 20 },
        limitReports: { type: "number", default: 200 }
      },
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_config", "Get workspace-focus alert configuration.", {
      type: "object",
      properties: {
        root: rootProp
      },
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_history", "List persisted workspace-focus alert incidents.", {
      type: "object",
      properties: {
        root: rootProp,
        limit: { type: "number", default: 20 },
        key: { type: "string" },
        level: { type: "string", enum: ["high", "medium"] }
      },
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_rca", "Generate RCA pack from workspace-focus alert incidents.", {
      type: "object",
      properties: {
        root: rootProp,
        incidentId: { type: "string" },
        key: { type: "string" },
        limit: { type: "number", default: 20 },
        format: { type: "string", enum: ["json", "md"], default: "json" }
      },
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_action_plan", "Generate actionable remediation plan from workspace alerts RCA.", {
      type: "object",
      properties: {
        root: rootProp,
        incidentId: { type: "string" },
        key: { type: "string" },
        limit: { type: "number", default: 20 },
        format: { type: "string", enum: ["json", "md"], default: "json" },
        save: { type: "boolean", default: false },
        tag: { type: "string", default: "" }
      },
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_actions", "List saved workspace alerts action plans.", {
      type: "object",
      properties: {
        root: rootProp,
        limit: { type: "number", default: 20 }
      },
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_action_get", "Get one saved workspace alerts action plan by id.", {
      type: "object",
      properties: {
        root: rootProp,
        id: { type: "string" }
      },
      required: ["id"],
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_boards", "List workspace alerts execution boards.", {
      type: "object",
      properties: {
        root: rootProp,
        limit: { type: "number", default: 20 }
      },
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_board_get", "Get one workspace alerts execution board by id.", {
      type: "object",
      properties: {
        root: rootProp,
        id: { type: "string" }
      },
      required: ["id"],
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_board_report", "Generate board progress report (json or markdown).", {
      type: "object",
      properties: {
        root: rootProp,
        boardId: { type: "string" },
        format: { type: "string", enum: ["json", "md"], default: "json" },
        maxItems: { type: "number", default: 20 }
      },
      required: ["boardId"],
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_board_pulse", "Evaluate open boards for overdue items using status SLA thresholds.", {
      type: "object",
      properties: {
        root: rootProp,
        limitBoards: { type: "number", default: 50 },
        todoHours: { type: "number", default: 24 },
        doingHours: { type: "number", default: 12 },
        blockedHours: { type: "number", default: 6 },
        save: { type: "boolean", default: false },
        source: { type: "string", default: "ws-alert-board-mcp" }
      },
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_board_pulse_history", "List board pulse incidents history.", {
      type: "object",
      properties: {
        root: rootProp,
        limit: { type: "number", default: 20 }
      },
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_board_pulse_plan", "Generate remediation plan from board pulse overdue items.", {
      type: "object",
      properties: {
        root: rootProp,
        limitBoards: { type: "number", default: 50 },
        todoHours: { type: "number", default: 24 },
        doingHours: { type: "number", default: 12 },
        blockedHours: { type: "number", default: 6 },
        limitItems: { type: "number", default: 20 },
        includeWarn: { type: "boolean", default: false },
        format: { type: "string", enum: ["json", "md"], default: "json" }
      },
      additionalProperties: false
    }),
    tool("rmemo_embed_status", "Get embeddings index status/health (config + index + up-to-date check).", {
      type: "object",
      properties: {
        root: rootProp,
        checkUpToDate: { type: "boolean", default: true }
      },
      additionalProperties: false
    }),
    tool("rmemo_embed_plan", "Preview which files would be reused vs embedded on the next embeddings build.", {
      type: "object",
      properties: {
        root: rootProp,
        provider: { type: "string", enum: ["mock", "openai"], default: "mock" },
        model: { type: "string", default: "" },
        dim: { type: "number", default: 128 },
        parallelism: { type: "number", default: 4 },
        batchDelayMs: { type: "number", default: 0 },
        kinds: {
          oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
          description: "Comma-separated or array: rules,todos,context,journal,sessions,handoff,pr"
        },
        recentDays: { type: "number" }
      },
      additionalProperties: false
    }),
    tool("rmemo_embed_jobs", "List embeddings background jobs in this MCP process (active/queued/history).", {
      type: "object",
      properties: {},
      additionalProperties: false
    }),
    tool("rmemo_embed_jobs_failures", "Get clustered failed embedding jobs (errorClass + signature).", {
      type: "object",
      properties: {
        limit: { type: "number", default: 20 },
        errorClass: { type: "string", description: "Optional filter: auth|rate_limit|network|config|runtime|unknown" }
      },
      additionalProperties: false
    }),
    tool("rmemo_embed_jobs_governance", "Get governance report for embed jobs (health + recommendations).", {
      type: "object",
      properties: {},
      additionalProperties: false
    }),
    tool("rmemo_embed_jobs_governance_history", "List governance policy versions for embed jobs.", {
      type: "object",
      properties: {
        limit: { type: "number", default: 20 }
      },
      additionalProperties: false
    }),
    tool("rmemo_embed_jobs_governance_simulate", "Dry-run governance policy simulation and impact prediction.", {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["recommend", "apply_top"], default: "recommend" },
        assumeNoCooldown: { type: "boolean", default: true },
        maxConcurrent: { type: "number" },
        retryTemplate: { type: "string", enum: ["conservative", "balanced", "aggressive"] },
        defaultPriority: { type: "string", enum: ["low", "normal", "high"] },
        governanceEnabled: { type: "boolean" },
        governanceWindow: { type: "number" },
        governanceMinSample: { type: "number" },
        governanceFailureRateHigh: { type: "number" },
        governanceCooldownMs: { type: "number" },
        governanceAutoScaleConcurrency: { type: "boolean" },
        governanceAutoSwitchTemplate: { type: "boolean" }
      },
      additionalProperties: false
    }),
    tool("rmemo_embed_jobs_governance_benchmark", "Replay benchmark across candidate governance policies and windows.", {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["recommend", "apply_top"], default: "apply_top" },
        assumeNoCooldown: { type: "boolean", default: true },
        windowSizes: { type: "array", items: { type: "number" } },
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              patch: { type: "object" }
            },
            additionalProperties: true
          }
        }
      },
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
    }),
    tool("rmemo_embed_job_enqueue", "Enqueue an embeddings build job (async background in this MCP process).", {
      type: "object",
      properties: {
        root: rootProp,
        provider: { type: "string", enum: ["mock", "openai"] },
        model: { type: "string" },
        apiKey: { type: "string" },
        dim: { type: "number" },
        parallelism: { type: "number" },
        batchDelayMs: { type: "number" },
        kinds: {
          oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
          description: "Comma-separated or array: rules,todos,context,journal,sessions,handoff,pr"
        },
        recentDays: { type: "number" },
        force: { type: "boolean", default: false },
        priority: { type: "string", enum: ["low", "normal", "high"], default: "normal" },
        retryTemplate: { type: "string", enum: ["conservative", "balanced", "aggressive"], default: "balanced" },
        retryStrategy: { type: "string", enum: ["fixed", "exponential"] },
        maxRetries: { type: "number", default: 1 },
        retryDelayMs: { type: "number", default: 1000 },
        maxDelayMs: { type: "number" },
        backoffMultiplier: { type: "number" },
        jitterRatio: { type: "number" }
      },
      additionalProperties: false
    }),
    tool("rmemo_embed_job_cancel", "Cancel a queued/running embeddings job by id.", {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
      additionalProperties: false
    }),
    tool("rmemo_embed_build", "Build embeddings index now (uses config if enabled, unless overridden).", {
      type: "object",
      properties: {
        root: rootProp,
        force: { type: "boolean", default: false },
        useConfig: { type: "boolean", default: true },
        provider: { type: "string", enum: ["mock", "openai"] },
        model: { type: "string" },
        apiKey: { type: "string" },
        dim: { type: "number" },
        parallelism: { type: "number" },
        batchDelayMs: { type: "number" },
        kinds: {
          oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
          description: "Comma-separated or array: rules,todos,context,journal,sessions,handoff,pr"
        },
        recentDays: { type: "number" },
        maxChunksPerFile: { type: "number" },
        maxCharsPerChunk: { type: "number" },
        overlapChars: { type: "number" },
        maxTotalChunks: { type: "number" }
      },
      additionalProperties: false
    }),
    tool("rmemo_embed_jobs_config", "Get/set background embed jobs config (max concurrent workers).", {
      type: "object",
      properties: {
        action: { type: "string", enum: ["get", "set"], default: "get" },
        maxConcurrent: { type: "number", description: "Used when action=set; range [1,8]." },
        retryTemplate: { type: "string", enum: ["conservative", "balanced", "aggressive"] },
        defaultPriority: { type: "string", enum: ["low", "normal", "high"] }
      },
      additionalProperties: false
    }),
    tool("rmemo_embed_job_retry", "Retry one failed/canceled embedding job by source job id.", {
      type: "object",
      properties: {
        jobId: { type: "string" },
        priority: { type: "string", enum: ["low", "normal", "high"] },
        retryTemplate: { type: "string", enum: ["conservative", "balanced", "aggressive"] }
      },
      required: ["jobId"],
      additionalProperties: false
    }),
    tool("rmemo_embed_jobs_retry_failed", "Bulk retry failed embedding jobs with optional filters.", {
      type: "object",
      properties: {
        limit: { type: "number", default: 5 },
        errorClass: { type: "string" },
        clusterKey: { type: "string" },
        priority: { type: "string", enum: ["low", "normal", "high"] },
        retryTemplate: { type: "string", enum: ["conservative", "balanced", "aggressive"] }
      },
      additionalProperties: false
    }),
    tool("rmemo_embed_jobs_governance_config", "Get/set auto-governance config for embed jobs.", {
      type: "object",
      properties: {
        action: { type: "string", enum: ["get", "set"], default: "get" },
        governanceEnabled: { type: "boolean" },
        governanceWindow: { type: "number" },
        governanceMinSample: { type: "number" },
        governanceFailureRateHigh: { type: "number" },
        governanceCooldownMs: { type: "number" },
        governanceAutoScaleConcurrency: { type: "boolean" },
        governanceAutoSwitchTemplate: { type: "boolean" },
        benchmarkAutoAdoptEnabled: { type: "boolean" },
        benchmarkAutoAdoptMinScore: { type: "number" },
        benchmarkAutoAdoptMinGap: { type: "number" }
      },
      additionalProperties: false
    }),
    tool("rmemo_embed_jobs_governance_apply", "Apply top governance recommendation manually.", {
      type: "object",
      properties: {
        source: { type: "string", default: "mcp" }
      },
      additionalProperties: false
    }),
    tool("rmemo_embed_jobs_governance_rollback", "Rollback governance policy by version id.", {
      type: "object",
      properties: {
        versionId: { type: "string" },
        source: { type: "string", default: "mcp" }
      },
      required: ["versionId"],
      additionalProperties: false
    }),
    tool("rmemo_embed_jobs_governance_benchmark_adopt", "Benchmark governance candidates and adopt top candidate when threshold gates pass.", {
      type: "object",
      properties: {
        source: { type: "string", default: "mcp" },
        mode: { type: "string", enum: ["recommend", "apply_top"], default: "apply_top" },
        assumeNoCooldown: { type: "boolean", default: true },
        windowSizes: { type: "array", items: { type: "number" } },
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              patch: { type: "object" }
            },
            additionalProperties: true
          }
        }
      },
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_config_set", "Set workspace-focus alert configuration (write tool).", {
      type: "object",
      properties: {
        root: rootProp,
        enabled: { type: "boolean" },
        minReports: { type: "number" },
        maxRegressedErrors: { type: "number" },
        maxAvgChangedCount: { type: "number" },
        maxChangedCount: { type: "number" },
        autoGovernanceEnabled: { type: "boolean" },
        autoGovernanceCooldownMs: { type: "number" }
      },
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_check", "Evaluate alerts and optionally trigger auto-governance apply.", {
      type: "object",
      properties: {
        root: rootProp,
        key: { type: "string" },
        limitGroups: { type: "number", default: 20 },
        limitReports: { type: "number", default: 200 },
        autoGovernance: { type: "boolean", default: false },
        source: { type: "string", default: "ws-alert-mcp" }
      },
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_action_apply", "Apply one saved workspace alerts action plan to todos/journal.", {
      type: "object",
      properties: {
        root: rootProp,
        id: { type: "string" },
        includeBlockers: { type: "boolean", default: false },
        noLog: { type: "boolean", default: false },
        maxTasks: { type: "number", default: 20 }
      },
      required: ["id"],
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_board_create", "Create execution board from one saved alerts action plan (write tool).", {
      type: "object",
      properties: {
        root: rootProp,
        actionId: { type: "string" },
        title: { type: "string", default: "" }
      },
      required: ["actionId"],
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_board_update", "Update one board item status/note (write tool).", {
      type: "object",
      properties: {
        root: rootProp,
        boardId: { type: "string" },
        itemId: { type: "string" },
        status: { type: "string", enum: ["todo", "doing", "done", "blocked"] },
        note: { type: "string", default: "" }
      },
      required: ["boardId", "itemId", "status"],
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_board_close", "Close one execution board when tasks are completed (write tool).", {
      type: "object",
      properties: {
        root: rootProp,
        boardId: { type: "string" },
        reason: { type: "string", default: "" },
        force: { type: "boolean", default: false },
        noLog: { type: "boolean", default: false }
      },
      required: ["boardId"],
      additionalProperties: false
    }),
    tool("rmemo_ws_focus_alerts_board_pulse_apply", "Apply board pulse remediation plan into todos/journal (write tool).", {
      type: "object",
      properties: {
        root: rootProp,
        limitBoards: { type: "number", default: 50 },
        todoHours: { type: "number", default: 24 },
        doingHours: { type: "number", default: 12 },
        blockedHours: { type: "number", default: 6 },
        limitItems: { type: "number", default: 20 },
        includeWarn: { type: "boolean", default: false },
        noLog: { type: "boolean", default: false },
        dedupe: { type: "boolean", default: true },
        dedupeWindowHours: { type: "number", default: 72 },
        dryRun: { type: "boolean", default: false }
      },
      additionalProperties: false
    })
  ]);
}

async function handleToolCall(serverRoot, name, args, logger, { allowWrite, embedJobs } = {}) {
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

  if (name === "rmemo_ws_list") {
    const r = await listWorkspaces(root, {
      preferGit: args?.noGit ? false : true,
      maxFiles: Number(args?.maxFiles || 4000),
      onlyDirs: args?.only
    });
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_ws_focus") {
    const q = String(args?.q || "").trim();
    if (!q) throw new Error("Missing q");
    const report = await batchWorkspaceFocus(root, {
      q,
      mode: args?.mode !== undefined ? String(args.mode) : "semantic",
      k: args?.k !== undefined ? Number(args.k) : 8,
      minScore: args?.minScore !== undefined ? Number(args.minScore) : 0.15,
      maxHits: args?.maxHits !== undefined ? Number(args.maxHits) : 50,
      recentDays: args?.recentDays !== undefined ? Number(args.recentDays) : 14,
      includeStatus: args?.includeStatus !== undefined ? !!args.includeStatus : false,
      preferGit: args?.noGit ? false : true,
      maxFiles: Number(args?.maxFiles || 4000),
      onlyDirs: args?.only
    });
    const compareLatest = args?.compareLatest !== undefined ? !!args.compareLatest : false;
    const saveSnapshot = args?.saveSnapshot !== undefined ? !!args.saveSnapshot : false;
    const tag = args?.tag !== undefined ? String(args.tag) : "";
    const comparison = compareLatest ? await compareWorkspaceFocusWithLatest(root, report) : null;
    const snapshot = saveSnapshot ? await saveWorkspaceFocusSnapshot(root, report, { tag }) : null;
    return JSON.stringify(
      {
        ...report,
        snapshot: snapshot ? { id: snapshot.id, path: snapshot.path, tag: snapshot.snapshot?.tag || null } : null,
        comparison
      },
      null,
      2
    );
  }

  if (name === "rmemo_ws_focus_snapshots") {
    const r = await listWorkspaceFocusSnapshots(root, { limit: Number(args?.limit || 20) });
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_ws_focus_compare") {
    const fromId = String(args?.fromId || "").trim();
    const toId = String(args?.toId || "").trim();
    if (!fromId || !toId) throw new Error("Missing fromId/toId");
    const r = await compareWorkspaceFocusSnapshots(root, { fromId, toId });
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_ws_focus_report") {
    const fromId = String(args?.fromId || "").trim();
    const toId = String(args?.toId || "").trim();
    const format = String(args?.format || "json").toLowerCase();
    const maxItems = args?.maxItems !== undefined ? Number(args.maxItems) : 50;
    const save = args?.save === true;
    const tag = String(args?.tag || "");
    const r = await generateWorkspaceFocusReport(root, { fromId, toId, maxItems });
    const saved = save ? await saveWorkspaceFocusReport(root, r.json, { tag }) : null;
    if (format === "md") {
      let md = r.markdown;
      if (saved) md += `Saved report: ${saved.id}\n`;
      return md;
    }
    return JSON.stringify({ ...r.json, savedReport: saved ? { id: saved.id, path: saved.path, tag: saved.report?.tag || null } : null }, null, 2);
  }

  if (name === "rmemo_ws_focus_report_history") {
    const limit = args?.limit !== undefined ? Number(args.limit) : 20;
    const r = await listWorkspaceFocusReports(root, { limit });
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_ws_focus_report_get") {
    const id = String(args?.id || "").trim();
    const r = await getWorkspaceFocusReport(root, id);
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_ws_focus_trends") {
    const limitGroups = args?.limitGroups !== undefined ? Number(args.limitGroups) : 20;
    const limitReports = args?.limitReports !== undefined ? Number(args.limitReports) : 200;
    const r = await listWorkspaceFocusTrends(root, { limitGroups, limitReports });
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_ws_focus_trend_get") {
    const key = String(args?.key || "").trim();
    const limit = args?.limit !== undefined ? Number(args.limit) : 100;
    const r = await getWorkspaceFocusTrend(root, { key, limit });
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts") {
    const key = String(args?.key || "");
    const limitGroups = args?.limitGroups !== undefined ? Number(args.limitGroups) : 20;
    const limitReports = args?.limitReports !== undefined ? Number(args.limitReports) : 200;
    const r = await evaluateWorkspaceFocusAlerts(root, { key, limitGroups, limitReports });
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_config") {
    const config = await getWorkspaceFocusAlertsConfig(root);
    return JSON.stringify({ schema: 1, root, config }, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_history") {
    const limit = args?.limit !== undefined ? Number(args.limit) : 20;
    const key = String(args?.key || "");
    const level = String(args?.level || "");
    const r = await listWorkspaceFocusAlertIncidents(root, { limit, key, level });
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_rca") {
    const incidentId = String(args?.incidentId || "");
    const key = String(args?.key || "");
    const limit = args?.limit !== undefined ? Number(args.limit) : 20;
    const format = String(args?.format || "json").toLowerCase();
    const r = await generateWorkspaceFocusAlertsRca(root, { incidentId, key, limit });
    return format === "md" ? r.markdown : JSON.stringify(r.json, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_action_plan") {
    const incidentId = String(args?.incidentId || "");
    const key = String(args?.key || "");
    const limit = args?.limit !== undefined ? Number(args.limit) : 20;
    const format = String(args?.format || "json").toLowerCase();
    const save = args?.save === true;
    const tag = String(args?.tag || "");
    if (save) requireWrite();
    const r = await generateWorkspaceFocusAlertsActionPlan(root, { incidentId, key, limit });
    const saved = save ? await saveWorkspaceFocusAlertsActionPlan(root, r.json, { tag }) : null;
    if (format === "md") {
      let md = r.markdown;
      if (saved) md += `Saved action plan: ${saved.id}\n`;
      return md;
    }
    return JSON.stringify({ ...r.json, savedAction: saved ? { id: saved.id, path: saved.path, tag: saved.action?.tag || null } : null }, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_actions") {
    const limit = args?.limit !== undefined ? Number(args.limit) : 20;
    const r = await listWorkspaceFocusAlertsActions(root, { limit });
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_action_get") {
    const id = String(args?.id || "").trim();
    if (!id) throw new Error("Missing action id");
    const r = await getWorkspaceFocusAlertsAction(root, id);
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_boards") {
    const limit = args?.limit !== undefined ? Number(args.limit) : 20;
    const r = await listWorkspaceFocusAlertsBoards(root, { limit });
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_board_get") {
    const id = String(args?.id || "").trim();
    if (!id) throw new Error("Missing board id");
    const r = await getWorkspaceFocusAlertsBoard(root, id);
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_board_report") {
    const boardId = String(args?.boardId || "").trim();
    if (!boardId) throw new Error("Missing board id");
    const format = String(args?.format || "json").toLowerCase();
    const maxItems = args?.maxItems !== undefined ? Number(args.maxItems) : 20;
    const r = await generateWorkspaceFocusAlertsBoardReport(root, { boardId, maxItems });
    return format === "md" ? r.markdown : JSON.stringify(r.json, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_board_pulse") {
    const limitBoards = args?.limitBoards !== undefined ? Number(args.limitBoards) : 50;
    const todoHours = args?.todoHours !== undefined ? Number(args.todoHours) : 24;
    const doingHours = args?.doingHours !== undefined ? Number(args.doingHours) : 12;
    const blockedHours = args?.blockedHours !== undefined ? Number(args.blockedHours) : 6;
    const save = args?.save === true;
    if (save) requireWrite();
    const source = String(args?.source || "ws-alert-board-mcp");
    const r = await evaluateWorkspaceFocusAlertsBoardsPulse(root, { limitBoards, todoHours, doingHours, blockedHours, save, source });
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_board_pulse_history") {
    const limit = args?.limit !== undefined ? Number(args.limit) : 20;
    const r = await listWorkspaceFocusAlertsBoardsPulseHistory(root, { limit });
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_board_pulse_plan") {
    const limitBoards = args?.limitBoards !== undefined ? Number(args.limitBoards) : 50;
    const todoHours = args?.todoHours !== undefined ? Number(args.todoHours) : 24;
    const doingHours = args?.doingHours !== undefined ? Number(args.doingHours) : 12;
    const blockedHours = args?.blockedHours !== undefined ? Number(args.blockedHours) : 6;
    const limitItems = args?.limitItems !== undefined ? Number(args.limitItems) : 20;
    const includeWarn = args?.includeWarn === true;
    const format = String(args?.format || "json").toLowerCase();
    const r = await generateWorkspaceFocusAlertsBoardsPulsePlan(root, {
      limitBoards,
      todoHours,
      doingHours,
      blockedHours,
      limitItems,
      includeWarn
    });
    return format === "md" ? r.markdown : JSON.stringify(r.json, null, 2);
  }

  if (name === "rmemo_embed_status") {
    const checkUpToDate = args?.checkUpToDate !== false;
    const r = await getEmbedStatus(root, { checkUpToDate });
    return JSON.stringify(r, null, 2);
  }

  if (name === "rmemo_embed_plan") {
    const provider = String(args?.provider || "mock");
    const model = String(args?.model || "");
    const dim = args?.dim !== undefined ? Number(args.dim) : 128;
    const parallelism = args?.parallelism !== undefined ? Number(args.parallelism) : undefined;
    const batchDelayMs = args?.batchDelayMs !== undefined ? Number(args.batchDelayMs) : undefined;
    const kinds = args?.kinds !== undefined ? parseKindsList(args.kinds) : undefined;
    const recentDays = args?.recentDays !== undefined ? Number(args.recentDays) : undefined;
    const r = await planEmbeddingsBuild(root, { provider, model, dim, kinds, recentDays, parallelism, batchDelayMs });
    return JSON.stringify(r, null, 2);
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

  if (name === "rmemo_embed_build") {
    requireWrite();
    const force = !!args?.force;
    const useConfig = args?.useConfig !== false;
    let cfg = null;
    if (useConfig) {
      const c = await readEmbedConfig(root);
      if (c.enabled && c.embed) cfg = { ...c.embed };
    }
    if (!cfg) cfg = { ...defaultEmbeddingConfig() };

    if (args?.provider !== undefined) cfg.provider = String(args.provider);
    if (args?.model !== undefined) cfg.model = String(args.model);
    if (args?.apiKey !== undefined) cfg.apiKey = String(args.apiKey);
    if (args?.dim !== undefined) cfg.dim = Number(args.dim);
    if (args?.parallelism !== undefined) cfg.parallelism = Number(args.parallelism);
    if (args?.batchDelayMs !== undefined) cfg.batchDelayMs = Number(args.batchDelayMs);
    if (args?.kinds !== undefined) {
      const kinds = parseKindsList(args.kinds);
      if (!kinds.length) throw new Error("kinds must be a non-empty list/string when provided");
      cfg.kinds = kinds;
    }
    if (args?.recentDays !== undefined) cfg.recentDays = Number(args.recentDays);
    if (args?.maxChunksPerFile !== undefined) cfg.maxChunksPerFile = Number(args.maxChunksPerFile);
    if (args?.maxCharsPerChunk !== undefined) cfg.maxCharsPerChunk = Number(args.maxCharsPerChunk);
    if (args?.overlapChars !== undefined) cfg.overlapChars = Number(args.overlapChars);
    if (args?.maxTotalChunks !== undefined) cfg.maxTotalChunks = Number(args.maxTotalChunks);
    cfg.force = force;

    const built = await buildEmbeddingsIndex(root, cfg);
    return JSON.stringify({ ok: true, result: { meta: built.meta } }, null, 2);
  }

  if (name === "rmemo_embed_job_enqueue") {
    requireWrite();
    const params = {};
    if (args?.provider !== undefined) params.provider = String(args.provider);
    if (args?.model !== undefined) params.model = String(args.model);
    if (args?.apiKey !== undefined) params.apiKey = String(args.apiKey);
    if (args?.dim !== undefined) params.dim = Number(args.dim);
    if (args?.parallelism !== undefined) params.parallelism = Number(args.parallelism);
    if (args?.batchDelayMs !== undefined) params.batchDelayMs = Number(args.batchDelayMs);
    if (args?.kinds !== undefined) {
      const kinds = parseKindsList(args.kinds);
      if (!kinds.length) throw new Error("kinds must be a non-empty list/string when provided");
      params.kinds = kinds;
    }
    if (args?.recentDays !== undefined) params.recentDays = Number(args.recentDays);
    if (args?.force !== undefined) params.force = !!args.force;
    const job = embedJobs?.enqueue?.(params, {
      trigger: "mcp",
      reason: "tool",
      priority: String(args?.priority || "normal"),
      retryTemplate: args?.retryTemplate !== undefined ? String(args.retryTemplate) : undefined,
      retryStrategy: args?.retryStrategy !== undefined ? String(args.retryStrategy) : undefined,
      maxRetries: args?.maxRetries !== undefined ? Number(args.maxRetries) : 1,
      retryDelayMs: args?.retryDelayMs !== undefined ? Number(args.retryDelayMs) : 1000,
      maxDelayMs: args?.maxDelayMs !== undefined ? Number(args.maxDelayMs) : undefined,
      backoffMultiplier: args?.backoffMultiplier !== undefined ? Number(args.backoffMultiplier) : undefined,
      jitterRatio: args?.jitterRatio !== undefined ? Number(args.jitterRatio) : undefined
    });
    return JSON.stringify({ ok: true, job }, null, 2);
  }

  if (name === "rmemo_embed_job_cancel") {
    requireWrite();
    const jobId = String(args?.jobId || "").trim();
    if (!jobId) throw new Error("Missing jobId");
    const r = embedJobs?.cancel?.(jobId) || { ok: false, error: "job_not_found" };
    return JSON.stringify({ ok: !!r.ok, result: r }, null, 2);
  }

  if (name === "rmemo_embed_jobs") {
    const s = embedJobs?.status?.() || { schema: 1, generatedAt: new Date().toISOString(), active: null, queued: [], history: [] };
    return JSON.stringify(s, null, 2);
  }

  if (name === "rmemo_embed_jobs_failures") {
    const limit = args?.limit !== undefined ? Number(args.limit) : 20;
    const errorClass = args?.errorClass !== undefined ? String(args.errorClass) : "";
    const failures = embedJobs?.getFailureClusters?.({ limit, errorClass }) || [];
    return JSON.stringify({ ok: true, schema: 1, generatedAt: new Date().toISOString(), failures }, null, 2);
  }

  if (name === "rmemo_embed_jobs_governance") {
    const report = embedJobs?.getGovernanceReport?.() || {
      schema: 1,
      generatedAt: new Date().toISOString(),
      config: {},
      state: {},
      metrics: {},
      recommendations: []
    };
    return JSON.stringify({ ok: true, report }, null, 2);
  }

  if (name === "rmemo_embed_jobs_governance_history") {
    const limit = args?.limit !== undefined ? Number(args.limit) : 20;
    const versions = embedJobs?.listPolicyVersions?.({ limit }) || [];
    return JSON.stringify({ ok: true, schema: 1, generatedAt: new Date().toISOString(), versions }, null, 2);
  }

  if (name === "rmemo_embed_jobs_governance_simulate") {
    const configPatch = {
      maxConcurrent: args?.maxConcurrent,
      retryTemplate: args?.retryTemplate,
      defaultPriority: args?.defaultPriority,
      governanceEnabled: args?.governanceEnabled,
      governanceWindow: args?.governanceWindow,
      governanceMinSample: args?.governanceMinSample,
      governanceFailureRateHigh: args?.governanceFailureRateHigh,
      governanceCooldownMs: args?.governanceCooldownMs,
      governanceAutoScaleConcurrency: args?.governanceAutoScaleConcurrency,
      governanceAutoSwitchTemplate: args?.governanceAutoSwitchTemplate
    };
    const r = embedJobs?.simulateGovernance?.({
      configPatch,
      mode: args?.mode !== undefined ? String(args.mode) : "recommend",
      assumeNoCooldown: args?.assumeNoCooldown !== undefined ? !!args.assumeNoCooldown : true
    }) || { ok: false, error: "governance_not_available" };
    return JSON.stringify({ ok: true, result: r }, null, 2);
  }

  if (name === "rmemo_embed_jobs_governance_benchmark") {
    const candidates = Array.isArray(args?.candidates)
      ? args.candidates.map((x, i) => ({ name: String(x?.name || `candidate_${i + 1}`), patch: { ...(x?.patch || {}) } }))
      : undefined;
    const windowSizes = Array.isArray(args?.windowSizes) ? args.windowSizes.map((x) => Number(x)) : undefined;
    const r = embedJobs?.benchmarkGovernance?.({
      candidates,
      windowSizes,
      mode: args?.mode !== undefined ? String(args.mode) : "apply_top",
      assumeNoCooldown: args?.assumeNoCooldown !== undefined ? !!args.assumeNoCooldown : true
    }) || { ok: false, error: "governance_not_available" };
    return JSON.stringify({ ok: true, result: r }, null, 2);
  }

  if (name === "rmemo_embed_jobs_config") {
    const action = String(args?.action || "get").toLowerCase();
    if (action === "get") {
      const cfg = embedJobs?.getConfig?.() || { maxConcurrent: 1, retryTemplate: "balanced", defaultPriority: "normal" };
      const retryTemplates = embedJobs?.retryTemplates?.() || {};
      return JSON.stringify({ ok: true, config: cfg, retryTemplates }, null, 2);
    }
    requireWrite();
    const cfg = embedJobs?.setConfig?.({
      maxConcurrent: args?.maxConcurrent !== undefined ? Number(args.maxConcurrent) : undefined,
      retryTemplate: args?.retryTemplate !== undefined ? String(args.retryTemplate) : undefined,
      defaultPriority: args?.defaultPriority !== undefined ? String(args.defaultPriority) : undefined
    }) || { maxConcurrent: 1 };
    const retryTemplates = embedJobs?.retryTemplates?.() || {};
    return JSON.stringify({ ok: true, config: cfg, retryTemplates }, null, 2);
  }

  if (name === "rmemo_embed_job_retry") {
    requireWrite();
    const jobId = String(args?.jobId || "").trim();
    if (!jobId) throw new Error("Missing jobId");
    const r = embedJobs?.retryJob?.(jobId, {
      priority: args?.priority !== undefined ? String(args.priority) : undefined,
      retryTemplate: args?.retryTemplate !== undefined ? String(args.retryTemplate) : undefined
    }) || { ok: false, error: "job_not_found" };
    if (!r.ok) throw new Error(r.error || "retry failed");
    return JSON.stringify({ ok: true, result: r }, null, 2);
  }

  if (name === "rmemo_embed_jobs_retry_failed") {
    requireWrite();
    const r = embedJobs?.retryFailed?.({
      limit: args?.limit !== undefined ? Number(args.limit) : 5,
      errorClass: args?.errorClass !== undefined ? String(args.errorClass) : "",
      clusterKey: args?.clusterKey !== undefined ? String(args.clusterKey) : "",
      priority: args?.priority !== undefined ? String(args.priority) : undefined,
      retryTemplate: args?.retryTemplate !== undefined ? String(args.retryTemplate) : undefined
    }) || { ok: true, retried: [] };
    return JSON.stringify({ ok: true, result: r }, null, 2);
  }

  if (name === "rmemo_embed_jobs_governance_config") {
    const action = String(args?.action || "get").toLowerCase();
    if (action === "get") {
      const config = embedJobs?.getConfig?.() || {};
      const report = embedJobs?.getGovernanceReport?.() || null;
      return JSON.stringify({ ok: true, config, report }, null, 2);
    }
    requireWrite();
    const config = embedJobs?.setConfig?.({
      governanceEnabled: args?.governanceEnabled,
      governanceWindow: args?.governanceWindow,
      governanceMinSample: args?.governanceMinSample,
      governanceFailureRateHigh: args?.governanceFailureRateHigh,
      governanceCooldownMs: args?.governanceCooldownMs,
      governanceAutoScaleConcurrency: args?.governanceAutoScaleConcurrency,
      governanceAutoSwitchTemplate: args?.governanceAutoSwitchTemplate,
      benchmarkAutoAdoptEnabled: args?.benchmarkAutoAdoptEnabled,
      benchmarkAutoAdoptMinScore: args?.benchmarkAutoAdoptMinScore,
      benchmarkAutoAdoptMinGap: args?.benchmarkAutoAdoptMinGap
    }) || {};
    const report = embedJobs?.getGovernanceReport?.() || null;
    return JSON.stringify({ ok: true, config, report }, null, 2);
  }

  if (name === "rmemo_embed_jobs_governance_apply") {
    requireWrite();
    const source = args?.source !== undefined ? String(args.source) : "mcp";
    const r = embedJobs?.applyTopGovernanceRecommendation?.({ source }) || { ok: false, error: "governance_not_available" };
    if (!r.ok) throw new Error(r.error || "no recommendation");
    return JSON.stringify({ ok: true, result: r }, null, 2);
  }

  if (name === "rmemo_embed_jobs_governance_rollback") {
    requireWrite();
    const versionId = String(args?.versionId || "").trim();
    if (!versionId) throw new Error("Missing versionId");
    const source = args?.source !== undefined ? String(args.source) : "mcp";
    const r = embedJobs?.rollbackPolicyVersion?.(versionId, { source }) || { ok: false, error: "governance_not_available" };
    if (!r.ok) throw new Error(r.error || "rollback failed");
    return JSON.stringify({ ok: true, result: r }, null, 2);
  }

  if (name === "rmemo_embed_jobs_governance_benchmark_adopt") {
    requireWrite();
    const candidates = Array.isArray(args?.candidates)
      ? args.candidates.map((x, i) => ({ name: String(x?.name || `candidate_${i + 1}`), patch: { ...(x?.patch || {}) } }))
      : undefined;
    const windowSizes = Array.isArray(args?.windowSizes) ? args.windowSizes.map((x) => Number(x)) : undefined;
    const benchmark = embedJobs?.benchmarkGovernance?.({
      candidates,
      windowSizes,
      mode: args?.mode !== undefined ? String(args.mode) : "apply_top",
      assumeNoCooldown: args?.assumeNoCooldown !== undefined ? !!args.assumeNoCooldown : true
    }) || null;
    const source = args?.source !== undefined ? String(args.source) : "mcp";
    const r = embedJobs?.adoptBenchmarkRecommendation?.({
      benchmarkResult: benchmark,
      source
    }) || { ok: false, error: "governance_not_available" };
    if (!r.ok) throw new Error(r.error || "benchmark adopt failed");
    return JSON.stringify({ ok: true, result: r }, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_config_set") {
    requireWrite();
    const patch = {
      enabled: args?.enabled,
      minReports: args?.minReports,
      maxRegressedErrors: args?.maxRegressedErrors,
      maxAvgChangedCount: args?.maxAvgChangedCount,
      maxChangedCount: args?.maxChangedCount,
      autoGovernanceEnabled: args?.autoGovernanceEnabled,
      autoGovernanceCooldownMs: args?.autoGovernanceCooldownMs
    };
    const config = await setWorkspaceFocusAlertsConfig(root, patch);
    return JSON.stringify({ ok: true, config }, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_check") {
    const key = String(args?.key || "");
    const limitGroups = args?.limitGroups !== undefined ? Number(args.limitGroups) : 20;
    const limitReports = args?.limitReports !== undefined ? Number(args.limitReports) : 200;
    const autoGovernance = args?.autoGovernance === true;
    const source = String(args?.source || "ws-alert-mcp");
    if (autoGovernance) requireWrite();
    const alerts = await evaluateWorkspaceFocusAlerts(root, { key, limitGroups, limitReports });
    let auto = { attempted: false, triggered: false, reason: "disabled" };
    if (autoGovernance) {
      const cfg = alerts?.config || {};
      const hasHigh = (alerts?.alerts || []).some((x) => x.level === "high");
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
        const r = embedJobs?.applyTopGovernanceRecommendation?.({ source }) || { ok: false, error: "governance_not_available" };
        if (r.ok) {
          const cfg2 = await setWorkspaceFocusAlertsConfig(root, { lastAutoGovernanceAt: new Date().toISOString() });
          auto = { attempted: true, triggered: true, result: r, config: cfg2 };
        } else {
          auto = { attempted: true, triggered: false, reason: r.error || "governance_apply_failed", result: r };
        }
      }
    }
    const incident = await appendWorkspaceFocusAlertIncident(root, { alerts, autoGovernance: auto, source, key });
    return JSON.stringify({ ok: true, alerts, autoGovernance: auto, incident: { id: incident.id, createdAt: incident.createdAt } }, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_action_apply") {
    requireWrite();
    const id = String(args?.id || "").trim();
    if (!id) throw new Error("Missing action id");
    const r = await applyWorkspaceFocusAlertsActionPlan(root, {
      id,
      includeBlockers: args?.includeBlockers === true,
      noLog: args?.noLog === true,
      maxTasks: args?.maxTasks !== undefined ? Number(args.maxTasks) : 20
    });
    return JSON.stringify({ ok: true, result: r }, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_board_create") {
    requireWrite();
    const actionId = String(args?.actionId || "").trim();
    if (!actionId) throw new Error("Missing action id");
    const title = String(args?.title || "");
    const r = await createWorkspaceFocusAlertsBoard(root, { actionId, title });
    return JSON.stringify({ ok: true, result: r }, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_board_update") {
    requireWrite();
    const boardId = String(args?.boardId || "").trim();
    const itemId = String(args?.itemId || "").trim();
    const status = String(args?.status || "").trim();
    const note = String(args?.note || "");
    if (!boardId) throw new Error("Missing board id");
    if (!itemId) throw new Error("Missing item id");
    if (!status) throw new Error("Missing status");
    const r = await updateWorkspaceFocusAlertsBoardItem(root, { boardId, itemId, status, note });
    return JSON.stringify({ ok: true, result: r }, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_board_close") {
    requireWrite();
    const boardId = String(args?.boardId || "").trim();
    const reason = String(args?.reason || "");
    if (!boardId) throw new Error("Missing board id");
    const r = await closeWorkspaceFocusAlertsBoard(root, {
      boardId,
      reason,
      force: args?.force === true,
      noLog: args?.noLog === true
    });
    return JSON.stringify({ ok: true, result: r }, null, 2);
  }

  if (name === "rmemo_ws_focus_alerts_board_pulse_apply") {
    requireWrite();
    const r = await applyWorkspaceFocusAlertsBoardsPulsePlan(root, {
      limitBoards: args?.limitBoards !== undefined ? Number(args.limitBoards) : 50,
      todoHours: args?.todoHours !== undefined ? Number(args.todoHours) : 24,
      doingHours: args?.doingHours !== undefined ? Number(args.doingHours) : 12,
      blockedHours: args?.blockedHours !== undefined ? Number(args.blockedHours) : 6,
      limitItems: args?.limitItems !== undefined ? Number(args.limitItems) : 20,
      includeWarn: args?.includeWarn === true,
      noLog: args?.noLog === true,
      dedupe: args?.dedupe !== false,
      dedupeWindowHours: args?.dedupeWindowHours !== undefined ? Number(args.dedupeWindowHours) : 72,
      dryRun: args?.dryRun === true
    });
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
  const embedJobs = createEmbedJobsController(serverRoot, { maxHistory: 40 });

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
            const out = await handleToolCall(serverRoot, name, args, logger, { allowWrite, embedJobs });
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
