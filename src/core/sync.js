import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, readText, writeText } from "../lib/io.js";
import { resolveRoot } from "../lib/paths.js";
import { ensureRepoMemory } from "./memory.js";
import { ensureContextFile } from "./context.js";
import { rulesPath, todosPath } from "../lib/paths.js";

const SYNC_MARKER = "rmemo:sync:v1";

function nowStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${y}${m}${day}_${hh}${mm}${ss}`;
}

function clampLines(s, maxLines) {
  const lines = String(s || "").split("\n");
  if (lines.length <= maxLines) return String(s || "").trimEnd();
  return lines.slice(0, maxLines).join("\n").trimEnd() + "\n[...truncated]";
}

function normalizeNewlines(s) {
  return String(s || "").replace(/\r\n/g, "\n");
}

function ensureTrailingNewline(s) {
  const t = normalizeNewlines(s).trimEnd();
  return t ? t + "\n" : "\n";
}

function splitTargets(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getDefaultSyncTargets() {
  // Keep the default set pragmatic: tool-agnostic + the most common dev tools.
  return ["agents", "copilot", "cursor"];
}

export function getSyncTargetPaths(root) {
  return {
    agents: path.join(root, "AGENTS.md"),
    copilot: path.join(root, ".github", "copilot-instructions.md"),
    cursor: path.join(root, ".cursor", "rules", "rmemo.mdc"),
    cline: path.join(root, ".clinerules", "rmemo.md"),
    claude: path.join(root, "CLAUDE.md")
  };
}

function renderInstructionBody({ rootAbs, rulesMd, todosMd, contextRel = ".repo-memory/context.md" }) {
  // Keep this short and stable. The detailed context pack remains in `.repo-memory/context.md`.
  const parts = [];
  parts.push(`<!-- ${SYNC_MARKER} -->\n`);
  parts.push(`# Project Instructions (rmemo)\n`);
  parts.push(
    [
      `This file is generated from \`.repo-memory/\` to keep AI tools aligned across days.`,
      ``,
      `If something is unclear, ask before inventing.`,
      ``,
      `Refresh sources:`,
      `- \`rmemo start\` to update scan/context + print status`,
      `- \`rmemo status --mode brief\` to get a paste-ready summary`,
      `- \`rmemo sync\` to re-generate this file`,
      ``,
      `Full context pack: \`${contextRel}\``,
      ``
    ].join("\n") + "\n"
  );

  parts.push(`## Rules (Excerpt)\n\n`);
  parts.push(clampLines(rulesMd || "(No rules yet. Run: rmemo init)", 220) + "\n\n");

  if (todosMd) {
    parts.push(`## Current Work (Todos)\n\n`);
    parts.push(clampLines(todosMd, 220) + "\n\n");
  }

  parts.push(`## Root\n\n\`${rootAbs}\`\n`);
  return ensureTrailingNewline(parts.join(""));
}

function renderAgentsMd(opts) {
  return renderInstructionBody(opts);
}

function renderCopilotMd(opts) {
  // Copilot instructions are standard markdown.
  return renderInstructionBody(opts);
}

function renderCursorMdc(opts) {
  // Cursor supports MDC rules with metadata frontmatter + markdown content.
  // See Cursor docs: rules are stored under `.cursor/rules/*.mdc`.
  const body = renderInstructionBody(opts);
  const fm = [
    "---",
    "description: rmemo generated project rules + current work snapshot",
    'globs: ["**/*"]',
    "alwaysApply: true",
    "---",
    ""
  ].join("\n");
  return ensureTrailingNewline(fm + body);
}

function renderClineMd(opts) {
  return renderInstructionBody(opts);
}

function renderClaudeMd(opts) {
  return renderInstructionBody(opts);
}

function isManagedByRmemo(existing) {
  return normalizeNewlines(existing).includes(SYNC_MARKER);
}

async function writeManagedFile({ targetPath, content, force, checkOnly, dryRun }) {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });

  const exists = await fileExists(targetPath);
  if (exists) {
    const existing = await readText(targetPath, 2_000_000);
    if (normalizeNewlines(existing) === normalizeNewlines(content)) {
      return { path: targetPath, changed: false, skipped: false };
    }

    const ours = isManagedByRmemo(existing);
    if (!ours && !force) {
      return { path: targetPath, changed: false, skipped: true, reason: "exists-and-not-managed" };
    }

    if (checkOnly) return { path: targetPath, changed: true, skipped: false };

    if (force && !ours) {
      const bak = `${targetPath}.bak.${nowStamp()}`;
      await fs.copyFile(targetPath, bak);
    }
  } else {
    if (checkOnly) return { path: targetPath, changed: true, skipped: false };
  }

  if (dryRun) return { path: targetPath, changed: true, skipped: false, dryRun: true };

  await writeText(targetPath, content);
  return { path: targetPath, changed: true, skipped: false };
}

export async function syncAiInstructions({ root, targets, force = false, checkOnly = false, dryRun = false } = {}) {
  const rootAbs = root ? path.resolve(root) : resolveRoot({});

  // Ensure `.repo-memory/` exists so we have a stable source-of-truth.
  await ensureRepoMemory(rootAbs);

  // Ensure context pack exists (some tools benefit from linking to a stable file).
  await ensureContextFile(rootAbs);

  const [rulesMd, todosMd] = await Promise.all([
    fileExists(rulesPath(rootAbs)) ? readText(rulesPath(rootAbs), 2_000_000) : Promise.resolve(""),
    fileExists(todosPath(rootAbs)) ? readText(todosPath(rootAbs), 1_000_000) : Promise.resolve("")
  ]);

  const opts = { rootAbs, rulesMd, todosMd, contextRel: ".repo-memory/context.md" };

  const renderers = {
    agents: renderAgentsMd,
    copilot: renderCopilotMd,
    cursor: renderCursorMdc,
    cline: renderClineMd,
    claude: renderClaudeMd
  };

  const targetPaths = getSyncTargetPaths(rootAbs);

  const wanted = (targets && targets.length ? targets : getDefaultSyncTargets()).map((t) => t.toLowerCase());
  const unknown = wanted.filter((t) => !renderers[t] || !targetPaths[t]);
  if (unknown.length) {
    const msg = `Unknown sync target(s): ${unknown.join(", ")}\n` + `Known: ${Object.keys(renderers).join(", ")}`;
    const err = new Error(msg);
    err.code = "RMEMO_BAD_TARGET";
    throw err;
  }

  const results = [];
  for (const t of wanted) {
    const content = renderers[t](opts);
    const targetPath = targetPaths[t];
    // eslint-disable-next-line no-await-in-loop
    const r = await writeManagedFile({ targetPath, content, force, checkOnly, dryRun });
    results.push({ target: t, ...r });
  }

  const wouldChange = results.some((r) => r.changed);
  const skipped = results.filter((r) => r.skipped);
  return { root: rootAbs, results, ok: !wouldChange && skipped.length === 0 };
}

export function formatSyncSummary({ root, results, ok }, { checkOnly = false, dryRun = false } = {}) {
  const lines = [];
  lines.push(`# Sync`);
  lines.push(`Root: ${root}`);
  lines.push("");

  for (const r of results) {
    const status = r.skipped ? "SKIP" : r.changed ? (checkOnly ? "DIFF" : dryRun ? "WOULD_WRITE" : "WRITE") : "OK";
    lines.push(`- ${status} [${r.target}] ${r.path}${r.reason ? ` (${r.reason})` : ""}`);
  }

  lines.push("");
  lines.push(ok ? "OK: in sync" : checkOnly ? "FAIL: out of sync" : "OK: synced");
  return ensureTrailingNewline(lines.join("\n"));
}

export function parseSyncTargetsFromFlags(flags) {
  const raw = flags.targets || flags.target || "";
  return splitTargets(raw);
}

