import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, readJson, readText } from "../lib/io.js";
import { journalDir, sessionsDir, todosPath } from "../lib/paths.js";
import { parseTodos } from "./todos.js";

function parseDateOnly(input) {
  const s = String(input || "").trim();
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDateTime(date, hhmm) {
  const s = `${String(date || "").trim()}T${String(hhmm || "").trim()}:00`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function summarizeText(s, maxLen = 120) {
  const oneLine = String(s || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!oneLine) return "";
  if (oneLine.length <= maxLen) return oneLine;
  return oneLine.slice(0, Math.max(0, maxLen - 3)) + "...";
}

function parseJournalEntries(content, fileName) {
  const date = String(fileName || "").replace(/\.md$/i, "");
  const lines = String(content || "").split("\n");
  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(\d{2}:\d{2})\s+(.+)\s*$/);
    if (!m) continue;

    const hhmm = m[1];
    const kind = String(m[2] || "entry").trim();

    let j = i + 1;
    const bodyLines = [];
    while (j < lines.length && !/^##\s+\d{2}:\d{2}\s+/.test(lines[j])) {
      bodyLines.push(lines[j]);
      j++;
    }

    const text = bodyLines.join("\n").trim();
    const at = parseDateTime(date, hhmm) || parseDateOnly(date);
    if (!at) continue;

    entries.push({
      source: "journal",
      type: `journal:${kind.toLowerCase()}`,
      at: at.toISOString(),
      title: kind,
      summary: summarizeText(text),
      details: text,
      file: path.join(".repo-memory", "journal", fileName)
    });

    i = j - 1;
  }

  return entries;
}

async function readJournalEvents(root) {
  const dir = journalDir(root);
  try {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    const files = ents.filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => e.name).sort().reverse();
    const events = [];
    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      const s = await readText(path.join(dir, file), 1_000_000);
      events.push(...parseJournalEntries(s, file));
    }
    return events;
  } catch {
    return [];
  }
}

async function readSessionEvents(root) {
  const dir = sessionsDir(root);
  try {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    const ids = ents.filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse();
    const events = [];
    for (const id of ids) {
      const metaPath = path.join(dir, id, "meta.json");
      // eslint-disable-next-line no-await-in-loop
      if (!(await fileExists(metaPath))) continue;
      // eslint-disable-next-line no-await-in-loop
      const meta = await readJson(metaPath);
      if (!meta || typeof meta !== "object") continue;

      const title = meta.title ? ` (${meta.title})` : "";
      if (meta.startedAt) {
        events.push({
          source: "session",
          type: "session:start",
          at: String(meta.startedAt),
          title: `Session started${title}`,
          summary: `id=${id}`,
          details: "",
          file: path.join(".repo-memory", "sessions", id, "meta.json")
        });
      }
      if (meta.endedAt) {
        events.push({
          source: "session",
          type: "session:end",
          at: String(meta.endedAt),
          title: `Session ended${title}`,
          summary: `id=${id}`,
          details: "",
          file: path.join(".repo-memory", "sessions", id, "meta.json")
        });
      }
    }
    return events.filter((e) => !Number.isNaN(new Date(e.at).getTime()));
  } catch {
    return [];
  }
}

async function readTodoEvents(root) {
  const p = todosPath(root);
  if (!(await fileExists(p))) return [];

  const [md, stat] = await Promise.all([readText(p, 1_000_000), fs.stat(p)]);
  const parsed = parseTodos(md);
  const at = (stat?.mtime || new Date()).toISOString();
  const events = [];

  for (const text of parsed.next || []) {
    events.push({
      source: "todo",
      type: "todo:next",
      at,
      title: "Todo Next",
      summary: summarizeText(text),
      details: String(text || ""),
      file: path.join(".repo-memory", "todos.md")
    });
  }
  for (const text of parsed.blockers || []) {
    events.push({
      source: "todo",
      type: "todo:blocker",
      at,
      title: "Todo Blocker",
      summary: summarizeText(text),
      details: String(text || ""),
      file: path.join(".repo-memory", "todos.md")
    });
  }

  return events;
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    if (tb !== ta) return tb - ta;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

function withinDays(events, days) {
  if (!Number.isFinite(days) || days <= 0) return events;
  const min = Date.now() - days * 24 * 60 * 60 * 1000;
  return events.filter((e) => new Date(e.at).getTime() >= min);
}

export async function buildTimeline(root, { days = 14, limit = 80, include = ["journal", "session", "todo"] } = {}) {
  const scope = new Set((Array.isArray(include) ? include : []).map((x) => String(x).trim().toLowerCase()).filter(Boolean));
  const useAll = scope.size === 0;

  const [journal, sessions, todos] = await Promise.all([
    useAll || scope.has("journal") ? readJournalEvents(root) : Promise.resolve([]),
    useAll || scope.has("session") || scope.has("sessions") ? readSessionEvents(root) : Promise.resolve([]),
    useAll || scope.has("todo") || scope.has("todos") ? readTodoEvents(root) : Promise.resolve([])
  ]);

  let events = sortEvents([...journal, ...sessions, ...todos]);
  events = withinDays(events, Number(days));

  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 80;
  events = events.slice(0, safeLimit);

  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    options: { days: Number(days), limit: safeLimit, include: useAll ? ["journal", "session", "todo"] : [...scope] },
    summary: {
      total: events.length,
      bySource: {
        journal: events.filter((e) => e.source === "journal").length,
        session: events.filter((e) => e.source === "session").length,
        todo: events.filter((e) => e.source === "todo").length
      }
    },
    events
  };
}

export function formatTimelineMarkdown(report, { brief = false } = {}) {
  const lines = [];
  lines.push("# Timeline");
  lines.push("");
  lines.push(`- generatedAt: ${report.generatedAt}`);
  lines.push(`- total: ${report.summary.total}`);
  lines.push(`- bySource: journal=${report.summary.bySource.journal}, session=${report.summary.bySource.session}, todo=${report.summary.bySource.todo}`);
  lines.push("");

  for (const e of report.events) {
    lines.push(`## ${e.at} | ${e.title}`);
    lines.push(`- source: ${e.source}`);
    lines.push(`- type: ${e.type}`);
    if (e.file) lines.push(`- file: ${e.file}`);
    if (e.summary) lines.push(`- summary: ${e.summary}`);
    if (!brief && e.details && e.details !== e.summary) {
      lines.push(`- details: ${e.details.replace(/\n/g, " ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
