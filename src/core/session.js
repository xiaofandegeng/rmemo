import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ensureDir, fileExists, readJson, readText, writeJson, writeText } from "../lib/io.js";
import { activeSessionPath, contextPath, handoffJsonPath, handoffPath, memDir, sessionsDir } from "../lib/paths.js";
import { hasGit, isGitRepo } from "../lib/git.js";
import { ensureRepoMemory } from "./memory.js";
import { generateHandoff } from "./handoff.js";

const execFileAsync = promisify(execFile);

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

async function gitInfo(root) {
  const ok = (await hasGit()) && (await isGitRepo(root));
  if (!ok) return null;
  try {
    const [branch, head] = await Promise.all([
      execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root }),
      execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root })
    ]);
    return { branch: branch.stdout.trim(), head: head.stdout.trim() };
  } catch {
    return null;
  }
}

export async function getActiveSession(root) {
  try {
    const j = await readJson(activeSessionPath(root));
    if (j?.schema !== 1) return null;
    if (!j?.id) return null;
    return j;
  } catch {
    return null;
  }
}

export async function listSessions(root) {
  const dir = sessionsDir(root);
  try {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    return ents.filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse();
  } catch {
    return [];
  }
}

function sessionDir(root, id) {
  return path.join(sessionsDir(root), id);
}

function sessionMetaPath(root, id) {
  return path.join(sessionDir(root, id), "meta.json");
}

function sessionNotesPath(root, id) {
  return path.join(sessionDir(root, id), "notes.md");
}

function sessionHandoffPath(root, id) {
  return path.join(sessionDir(root, id), "handoff.md");
}

function sessionHandoffJsonPath(root, id) {
  return path.join(sessionDir(root, id), "handoff.json");
}

export async function startSession(root, { title = "" } = {}) {
  await ensureRepoMemory(root);
  await ensureDir(sessionsDir(root));

  const active = await getActiveSession(root);
  if (active?.id) throw new Error(`An active session already exists: ${active.id} (run: rmemo session end)`);

  const id = nowStamp();
  const dir = sessionDir(root, id);
  await ensureDir(dir);

  const meta = {
    schema: 1,
    id,
    title: String(title || "").trim() || null,
    root,
    startedAt: new Date().toISOString(),
    endedAt: null,
    git: await gitInfo(root)
  };
  await writeJson(sessionMetaPath(root, id), meta);

  const head = `# Session ${id}\n\nStarted: ${meta.startedAt}\n${meta.title ? `Title: ${meta.title}\n` : ""}\n## Notes\n`;
  await writeText(sessionNotesPath(root, id), head);

  await writeJson(activeSessionPath(root), { schema: 1, id, startedAt: meta.startedAt });
  return { id, dir, meta: sessionMetaPath(root, id), notes: sessionNotesPath(root, id) };
}

export async function appendSessionNote(root, text) {
  await ensureDir(memDir(root));
  const active = await getActiveSession(root);
  if (!active?.id) throw new Error("No active session. Run: rmemo session start");
  const p = sessionNotesPath(root, active.id);
  const body = String(text || "").trimEnd();
  const normalized = body.includes("\n") ? `\n${body}\n` : `${body}\n`;
  await fs.appendFile(p, normalized, "utf8");
  return { id: active.id, notes: p };
}

export async function endSession(root, opts) {
  await ensureDir(memDir(root));
  const active = await getActiveSession(root);
  if (!active?.id) throw new Error("No active session. Run: rmemo session start");

  const id = active.id;

  // Generate the standard handoff pack (also updates manifest/index/context).
  const r = await generateHandoff(root, opts || {});

  // Snapshot key outputs into the session directory.
  const sdir = sessionDir(root, id);
  await ensureDir(sdir);
  await fs.copyFile(handoffPath(root), sessionHandoffPath(root, id));
  if (await fileExists(contextPath(root))) await fs.copyFile(contextPath(root), path.join(sdir, "context.md"));
  if (await fileExists(handoffJsonPath(root))) await fs.copyFile(handoffJsonPath(root), sessionHandoffJsonPath(root, id));

  // Mark endedAt.
  try {
    const meta = await readJson(sessionMetaPath(root, id));
    meta.endedAt = new Date().toISOString();
    await writeJson(sessionMetaPath(root, id), meta);
  } catch {
    // ignore
  }

  // Clear active pointer.
  try {
    await fs.unlink(activeSessionPath(root));
  } catch {
    // ignore
  }

  return { id, dir: sdir, handoff: sessionHandoffPath(root, id), handoffJson: sessionHandoffJsonPath(root, id), out: r.out };
}

export async function showSession(root, id) {
  const dir = sessionDir(root, id);
  if (!(await fileExists(dir))) return null;
  const metaP = sessionMetaPath(root, id);
  let meta = null;
  try {
    meta = await readJson(metaP);
  } catch {
    meta = null;
  }
  let notes = null;
  try {
    notes = await readText(sessionNotesPath(root, id), 2_000_000);
  } catch {
    notes = null;
  }
  return {
    schema: 1,
    id,
    dir,
    meta,
    paths: {
      meta: metaP,
      notes: sessionNotesPath(root, id),
      handoff: sessionHandoffPath(root, id),
      handoffJson: sessionHandoffJsonPath(root, id)
    },
    notes
  };
}

