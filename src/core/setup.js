import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileExists, readJson, readText, writeJson, writeText } from "../lib/io.js";
import { configPath } from "../lib/paths.js";
import { ensureRepoMemory } from "./memory.js";
import { getDefaultSyncTargets } from "./sync.js";

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
exit 0
`
  );
}

function isManagedHook(existing, hookName) {
  return String(existing || "").includes(`rmemo hook:${hookName}`);
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

async function ensureConfig(rootAbs, { targets, force }) {
  const p = configPath(rootAbs);
  const wanted = (targets && targets.length ? targets : getDefaultSyncTargets()).map((t) => String(t).toLowerCase());

  if (await fileExists(p)) {
    if (!force && (!targets || !targets.length)) return { path: p, changed: false };
    try {
      const cfg = await readJson(p);
      const next = {
        ...cfg,
        schema: 1,
        sync: {
          ...(cfg?.sync || {}),
          enabled: true,
          targets: wanted
        }
      };
      await writeJson(p, next);
      return { path: p, changed: true };
    } catch {
      // Fallthrough: overwrite invalid config if force or explicit targets were provided.
      if (!force && (!targets || !targets.length)) return { path: p, changed: false };
    }
  }

  await writeJson(p, { schema: 1, sync: { enabled: true, targets: wanted } });
  return { path: p, changed: true };
}

export async function setupRepo({ root, targets, hooks, force = false } = {}) {
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
  const cfg = await ensureConfig(repoRoot, { targets, force });

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

