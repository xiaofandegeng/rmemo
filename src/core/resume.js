import path from "node:path";
import { readText, fileExists } from "../lib/io.js";
import { contextPath, todosPath } from "../lib/paths.js";
import { parseTodos } from "./todos.js";
import { buildTimeline } from "./timeline.js";
import { ensureContextFile } from "./context.js";
import { getActiveSession, listSessions, showSession } from "./session.js";

function clampLines(s, maxLines) {
  const lines = String(s || "").split("\n");
  if (lines.length <= maxLines) return String(s || "").trimEnd();
  return lines.slice(0, maxLines).join("\n").trimEnd() + "\n[...truncated]";
}

async function readTodos(root) {
  const p = todosPath(root);
  if (!(await fileExists(p))) return { next: [], blockers: [] };
  const md = await readText(p, 512_000);
  return parseTodos(md);
}

async function latestSessionSummary(root) {
  const active = await getActiveSession(root);
  const ids = await listSessions(root);
  const latestId = ids[0] || "";
  const latest = latestId ? await showSession(root, latestId) : null;

  return {
    active: active?.id
      ? {
          id: active.id,
          startedAt: active.startedAt || null
        }
      : null,
    latest: latest
      ? {
          id: latest.id,
          startedAt: latest.meta?.startedAt || null,
          endedAt: latest.meta?.endedAt || null,
          title: latest.meta?.title || null
        }
      : null
  };
}

export async function buildResumePack(
  root,
  {
    timelineDays = 14,
    timelineLimit = 40,
    includeTimeline = true,
    includeContext = true,
    contextLines = 100,
    recentDays = 7
  } = {}
) {
  const [todos, sessions] = await Promise.all([readTodos(root), latestSessionSummary(root)]);

  let timeline = null;
  if (includeTimeline) {
    timeline = await buildTimeline(root, {
      days: Number(timelineDays),
      limit: Number(timelineLimit),
      include: ["journal", "session", "todo"]
    });
  }

  let context = null;
  if (includeContext) {
    const cp = await ensureContextFile(root, { recentDays: Number(recentDays || 7) });
    const ctx = await readText(cp, 2_000_000);
    context = {
      path: cp,
      excerpt: clampLines(ctx, Number(contextLines || 100))
    };
  }

  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    todos,
    sessions,
    timeline,
    context
  };
}

export function formatResumeMarkdown(pack, { brief = false } = {}) {
  const lines = [];
  lines.push("# Resume Pack");
  lines.push("");
  lines.push(`- generatedAt: ${pack.generatedAt}`);
  lines.push(`- root: ${pack.root}`);
  lines.push("");

  lines.push("## Sessions");
  lines.push("");
  if (pack.sessions.active) {
    lines.push(`- active: ${pack.sessions.active.id} (started ${pack.sessions.active.startedAt || "unknown"})`);
  } else {
    lines.push("- active: (none)");
  }
  if (pack.sessions.latest) {
    lines.push(`- latest: ${pack.sessions.latest.id} (${pack.sessions.latest.title || "untitled"})`);
    lines.push(`- latestStartedAt: ${pack.sessions.latest.startedAt || "unknown"}`);
    lines.push(`- latestEndedAt: ${pack.sessions.latest.endedAt || "(not ended)"}`);
  } else {
    lines.push("- latest: (none)");
  }
  lines.push("");

  lines.push("## Next");
  lines.push("");
  if (pack.todos.next.length) lines.push(...pack.todos.next.map((x) => `- ${x}`));
  else lines.push("- (empty)");
  lines.push("");

  lines.push("## Blockers");
  lines.push("");
  if (pack.todos.blockers.length) lines.push(...pack.todos.blockers.map((x) => `- ${x}`));
  else lines.push("- (none)");
  lines.push("");

  if (pack.timeline) {
    lines.push("## Timeline Highlights");
    lines.push("");
    lines.push(`- total: ${pack.timeline.summary.total}`);
    const top = pack.timeline.events.slice(0, brief ? 8 : 20);
    for (const e of top) {
      lines.push(`- ${e.at} | ${e.title} | ${e.source}`);
      if (e.summary) lines.push(`  - ${e.summary}`);
    }
    lines.push("");
  }

  if (pack.context) {
    lines.push("## Context Excerpt");
    lines.push("");
    lines.push(`- file: ${path.relative(process.cwd(), pack.context.path)}`);
    lines.push("");
    if (!brief) {
      lines.push("```md");
      lines.push(pack.context.excerpt);
      lines.push("```");
      lines.push("");
    }
  }

  lines.push("## Paste To AI");
  lines.push("");
  lines.push("1. Paste this Resume Pack first.");
  lines.push("2. Then ask AI to continue from Next/Blockers and latest timeline events.");
  lines.push("3. If needed, append full `.repo-memory/context.md`.");
  lines.push("");

  return lines.join("\n").trimEnd() + "\n";
}
