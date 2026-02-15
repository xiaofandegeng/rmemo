import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileExists, readJson, readText, writeJson, writeText } from "../lib/io.js";
import { configPath } from "../lib/paths.js";
import { ensureRepoMemory } from "./memory.js";
import { getDefaultSyncTargets } from "./sync.js";

const execFileAsync = promisify(execFile);

function normalizeNewlines(s) {
  return String(s || "").replace(/\r\n/g, "\n");
}

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

function splitList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseHookListFromFlags(flags) {
  if (flags["no-hooks"]) return [];
  const raw = flags.hooks || "";
  const list = splitList(raw);
  if (list.length) return list;
  return ["pre-commit", "post-commit", "post-merge", "post-checkout"];
}

async function gitTopLevel(root) {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: root });
  return stdout.trim();
}

function q(s) {
  return `"${String(s).replace(/"/g, '\\"')}"`;
}

function renderHookScript({ hookName, rmemoBinAbs }) {
  const marker = `rmemo hook:${hookName}`;
  const header = `#!/usr/bin/env bash
# ${marker}
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
`;

  if (hookName === "pre-commit") {
    return (
      header +
      `
${q(rmemoBinAbs)} --root "$repo_root" --staged check
`
    );
  }

  // Non-blocking hooks: keep repo consistent without breaking normal git operations.
  return (
    header +
    `
if ! ${q(rmemoBinAbs)} --root "$repo_root" sync >/dev/null 2>&1; then
  echo "rmemo: sync failed (non-blocking) for ${hookName}" >&2
fi
if ! ${q(rmemoBinAbs)} --root "$repo_root" embed auto >/dev/null 2>&1; then
  echo "rmemo: embed auto failed (non-blocking) for ${hookName}" >&2
fi
exit 0
`
  );
}

function isManagedHook(existing, hookName) {
  return String(existing || "").includes(`rmemo hook:${hookName}`);
}

async function checkHook({ repoRoot, hookName, rmemoBinAbs }) {
  const hookPath = path.join(repoRoot, ".git", "hooks", hookName);
  const expected = renderHookScript({ hookName, rmemoBinAbs });
  if (!(await fileExists(hookPath))) {
    return { hook: hookName, path: hookPath, ok: false, status: "MISSING" };
  }
  const existing = await readText(hookPath, 256_000);
  const ours = isManagedHook(existing, hookName);
  if (!ours) {
    return { hook: hookName, path: hookPath, ok: false, status: "EXTERNAL" };
  }
  if (normalizeNewlines(existing) !== normalizeNewlines(expected)) {
    return { hook: hookName, path: hookPath, ok: false, status: "DIFF" };
  }
  return { hook: hookName, path: hookPath, ok: true, status: "OK" };
}

async function installHook({ repoRoot, hookName, rmemoBinAbs, force }) {
  const hooksDir = path.join(repoRoot, ".git", "hooks");
  await fs.mkdir(hooksDir, { recursive: true });

  const hookPath = path.join(hooksDir, hookName);
  const content = renderHookScript({ hookName, rmemoBinAbs });

  if (await fileExists(hookPath)) {
    const existing = await readText(hookPath, 256_000);
    const ours = isManagedHook(existing, hookName);
    if (!force && !ours) {
      return { hook: hookName, path: hookPath, installed: false, skipped: true, reason: "exists-and-not-managed" };
    }
    if (force && !ours) {
      const bak = `${hookPath}.bak.${nowStamp()}`;
      await fs.copyFile(hookPath, bak);
    }
  }

  await writeText(hookPath, content);
  await fs.chmod(hookPath, 0o755);
  return { hook: hookName, path: hookPath, installed: true, skipped: false };
}

async function ensureConfig(rootAbs, { targets, embed, force }) {
  const p = configPath(rootAbs);
  const wanted = (targets && targets.length ? targets : getDefaultSyncTargets()).map((t) => String(t).toLowerCase());

  if (await fileExists(p)) {
    if (!force && (!targets || !targets.length) && embed === null) return { path: p, changed: false };
    try {
      const cfg = await readJson(p);
      const next = {
        ...cfg,
        schema: 1,
        sync: {
          ...(cfg?.sync || {}),
          enabled: true,
          targets: wanted
        },
        embed: embed === null ? cfg?.embed : { ...(cfg?.embed || {}), ...embed }
      };
      await writeJson(p, next);
      return { path: p, changed: true };
    } catch {
      // Fallthrough: overwrite invalid config if force or explicit targets were provided.
      if (!force && (!targets || !targets.length) && embed === null) return { path: p, changed: false };
    }
  }

  const base = { schema: 1, sync: { enabled: true, targets: wanted } };
  const next = embed === null ? base : { ...base, embed };
  await writeJson(p, next);
  return { path: p, changed: true };
}

async function checkConfig(rootAbs, { targets }) {
  const p = configPath(rootAbs);
  if (!(await fileExists(p))) return { path: p, ok: false, status: "MISSING" };
  try {
    const cfg = await readJson(p);
    const enabled = cfg?.sync?.enabled !== false;
    if (!enabled) return { path: p, ok: false, status: "DISABLED" };
    const arr = cfg?.sync?.targets;
    if (!Array.isArray(arr) || !arr.length) return { path: p, ok: false, status: "INVALID" };
    if (targets && targets.length) {
      const wanted = targets.map((t) => String(t).toLowerCase());
      const have = arr.map((t) => String(t).toLowerCase());
      const same = wanted.length === have.length && wanted.every((x, i) => x === have[i]);
      if (!same) return { path: p, ok: false, status: "DIFF" };
    }
    return { path: p, ok: true, status: "OK" };
  } catch {
    return { path: p, ok: false, status: "INVALID" };
  }
}

export async function checkSetup({ root, targets, hooks } = {}) {
  const rootAbs = path.resolve(root || process.cwd());
  let repoRoot;
  try {
    repoRoot = await gitTopLevel(rootAbs);
  } catch {
    const err = new Error(`Not a git repo (or git not available) under: ${rootAbs}`);
    err.code = "RMEMO_NOT_GIT";
    throw err;
  }

  const rmemoBinAbs = path.resolve(process.argv[1]);
  const hookList = hooks || [];
  const hookResults = [];
  for (const h of hookList) {
    // eslint-disable-next-line no-await-in-loop
    hookResults.push(await checkHook({ repoRoot, hookName: h, rmemoBinAbs }));
  }

  const cfg = await checkConfig(repoRoot, { targets });
  const ok = cfg.ok && hookResults.every((h) => h.ok);
  return { repoRoot, config: cfg, hooks: hookResults, ok };
}

async function uninstallHook({ repoRoot, hookName }) {
  const hookPath = path.join(repoRoot, ".git", "hooks", hookName);
  if (!(await fileExists(hookPath))) {
    return { hook: hookName, path: hookPath, removed: false, skipped: false, status: "MISSING" };
  }
  const existing = await readText(hookPath, 256_000);
  const ours = isManagedHook(existing, hookName);
  if (!ours) {
    return { hook: hookName, path: hookPath, removed: false, skipped: true, status: "EXTERNAL" };
  }
  const bak = `${hookPath}.bak.uninstalled.${nowStamp()}`;
  await fs.copyFile(hookPath, bak);
  await fs.unlink(hookPath);
  return { hook: hookName, path: hookPath, removed: true, skipped: false, status: "REMOVED", backup: bak };
}

export async function uninstallSetup({ root, hooks, removeConfig = false } = {}) {
  const rootAbs = path.resolve(root || process.cwd());
  let repoRoot;
  try {
    repoRoot = await gitTopLevel(rootAbs);
  } catch {
    const err = new Error(`Not a git repo (or git not available) under: ${rootAbs}`);
    err.code = "RMEMO_NOT_GIT";
    throw err;
  }

  const hookList = hooks || [];
  const hookResults = [];
  for (const h of hookList) {
    // eslint-disable-next-line no-await-in-loop
    hookResults.push(await uninstallHook({ repoRoot, hookName: h }));
  }

  let cfg = { path: configPath(repoRoot), removed: false, skipped: false, status: "KEEP" };
  if (removeConfig) {
    const p = configPath(repoRoot);
    if (!(await fileExists(p))) {
      cfg = { path: p, removed: false, skipped: false, status: "MISSING" };
    } else {
      const bak = `${p}.bak.uninstalled.${nowStamp()}`;
      await fs.copyFile(p, bak);
      await fs.unlink(p);
      cfg = { path: p, removed: true, skipped: false, status: "REMOVED", backup: bak };
    }
  }

  const ok = hookResults.every((h) => h.status === "MISSING" || h.status === "REMOVED") && (!removeConfig || cfg.status !== "KEEP");
  return { repoRoot, config: cfg, hooks: hookResults, ok };
}

export async function setupRepo({ root, targets, hooks, embed = null, force = false } = {}) {
  const rootAbs = path.resolve(root || process.cwd());

  let repoRoot;
  try {
    repoRoot = await gitTopLevel(rootAbs);
  } catch {
    const err = new Error(`Not a git repo (or git not available) under: ${rootAbs}`);
    err.code = "RMEMO_NOT_GIT";
    throw err;
  }

  await ensureRepoMemory(repoRoot);
  const cfg = await ensureConfig(repoRoot, { targets, embed, force });

  const rmemoBinAbs = path.resolve(process.argv[1]);
  const hookList = hooks || [];
  const hookResults = [];
  for (const h of hookList) {
    // eslint-disable-next-line no-await-in-loop
    hookResults.push(await installHook({ repoRoot, hookName: h, rmemoBinAbs, force }));
  }

  return { repoRoot, config: cfg, hooks: hookResults };
}

export function formatSetupSummary({ repoRoot, config, hooks }) {
  const lines = [];
  lines.push(`# Setup`);
  lines.push(`Root: ${repoRoot}`);
  lines.push("");
  lines.push(`Config: ${config.changed ? "WRITE" : "OK"} ${config.path}`);
  lines.push("");
  lines.push(`Hooks:`);
  if (!hooks.length) {
    lines.push(`- (none)`);
  } else {
    for (const h of hooks) {
      const status = h.skipped ? "SKIP" : h.installed ? "WRITE" : "OK";
      lines.push(`- ${status} ${h.hook} ${h.path}${h.reason ? ` (${h.reason})` : ""}`);
    }
  }
  lines.push("");
  lines.push("OK: setup complete");
  return lines.join("\n").trimEnd() + "\n";
}

export function formatSetupCheckSummary({ repoRoot, config, hooks, ok }) {
  const lines = [];
  lines.push(`# Setup Check`);
  lines.push(`Root: ${repoRoot}`);
  lines.push("");
  lines.push(`Config: ${config.status} ${config.path}`);
  lines.push("");
  lines.push(`Hooks:`);
  if (!hooks.length) {
    lines.push(`- (none requested)`);
  } else {
    for (const h of hooks) lines.push(`- ${h.status} ${h.hook} ${h.path}`);
  }
  lines.push("");
  lines.push(ok ? "OK: setup is correct" : "FAIL: setup missing or out of date");
  return lines.join("\n").trimEnd() + "\n";
}

export function formatSetupUninstallSummary({ repoRoot, config, hooks, ok }) {
  const lines = [];
  lines.push(`# Setup Uninstall`);
  lines.push(`Root: ${repoRoot}`);
  lines.push("");
  lines.push(`Config: ${config.status} ${config.path}${config.backup ? ` (backup: ${config.backup})` : ""}`);
  lines.push("");
  lines.push(`Hooks:`);
  if (!hooks.length) {
    lines.push(`- (none requested)`);
  } else {
    for (const h of hooks) {
      lines.push(
        `- ${h.status} ${h.hook} ${h.path}${h.backup ? ` (backup: ${h.backup})` : ""}${h.skipped ? " (skipped)" : ""}`
      );
    }
  }
  lines.push("");
  lines.push(ok ? "OK: uninstall complete" : "WARN: some items were not removed");
  return lines.join("\n").trimEnd() + "\n";
}
