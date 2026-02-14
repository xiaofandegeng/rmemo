import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveRoot } from "../lib/paths.js";
import { ensureDir, fileExists, readText, writeText } from "../lib/io.js";

const execFileAsync = promisify(execFile);

const HOOK_MARKER = "rmemo pre-commit hook";

async function gitTopLevel(root) {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: root });
  return stdout.trim();
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

function renderPreCommit({ rmemoBinAbs }) {
  // Prefer calling the exact rmemo entrypoint that installed the hook.
  // This keeps behavior consistent even before rmemo is published to npm.
  const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

  return `#!/usr/bin/env bash
# ${HOOK_MARKER}
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"

${q(rmemoBinAbs)} --root "$repo_root" --staged check
`;
}

async function installPreCommitHook({ repoRoot, rmemoBinAbs, force }) {
  const hooksDir = path.join(repoRoot, ".git", "hooks");
  await ensureDir(hooksDir);

  const hookPath = path.join(hooksDir, "pre-commit");
  const content = renderPreCommit({ rmemoBinAbs });

  if (await fileExists(hookPath)) {
    const existing = await readText(hookPath, 256_000);
    const ours = existing.includes(HOOK_MARKER);
    if (!force && !ours) {
      process.stderr.write(
        `Refusing to overwrite existing pre-commit hook: ${hookPath}\n` +
          `Re-run with --force to overwrite (a backup will be created).\n`
      );
      process.exitCode = 2;
      return;
    }
    if (force && !ours) {
      const bak = `${hookPath}.bak.${nowStamp()}`;
      await fs.copyFile(hookPath, bak);
      process.stdout.write(`Backed up existing hook to: ${bak}\n`);
    }
  }

  await writeText(hookPath, content);
  await fs.chmod(hookPath, 0o755);
  process.stdout.write(`Installed pre-commit hook: ${hookPath}\n`);
}

export async function cmdHook({ rest, flags }) {
  const sub = rest[0];
  if (!sub || sub === "help") {
    process.stdout.write(
      [
        "Usage:",
        "  rmemo hook install [--force]",
        "",
        "Notes:",
        "- The hook runs `rmemo check` before commit.",
        "- Run `rmemo init` in the target repo to create `.repo-memory/rules.json`."
      ].join("\n") + "\n"
    );
    return;
  }

  if (sub !== "install") {
    throw new Error(`Unknown subcommand: hook ${sub}`);
  }

  const root = resolveRoot(flags);
  const force = !!flags.force;

  let repoRoot;
  try {
    repoRoot = await gitTopLevel(root);
  } catch {
    process.stderr.write(`Not a git repo (or git not available) under: ${root}\n`);
    process.exitCode = 2;
    return;
  }

  // Absolute path to the rmemo entrypoint used to install this hook.
  const rmemoBinAbs = path.resolve(process.argv[1]);
  await installPreCommitHook({ repoRoot, rmemoBinAbs, force });
}
