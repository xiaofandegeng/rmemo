import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const execFileAsync = promisify(execFile);

export async function hasGit() {
  try {
    await execFileAsync("git", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export async function isGitRepo(root) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root });
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

async function gitTopLevel(root) {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: root });
  return stdout.trim();
}

export async function gitHead(root) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
    return stdout.trim();
  } catch {
    return "";
  }
}

function parseNulList(stdout) {
  return String(stdout || "")
    .split("\0")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function gitStatusChangedFiles(root) {
  // Returns paths relative to cwd (root).
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1", "-z"], { cwd: root, maxBuffer: 1024 * 1024 * 20 });
    const toks = parseNulList(stdout);
    const out = new Set();
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.length < 4) continue;
      const x = t[0];
      const y = t[1];
      const p1 = t.slice(3);
      if (p1) out.add(p1);
      // Renames/copies: next token is the new path.
      const isRenameOrCopy = x === "R" || x === "C" || y === "R" || y === "C";
      if (isRenameOrCopy) {
        const p2 = toks[i + 1];
        if (p2) out.add(p2);
        i++;
      }
    }
    return out;
  } catch {
    return new Set();
  }
}

export async function gitDiffNameOnly(root, fromRef, toRef, { pathspec = "." } = {}) {
  // Returns paths relative to cwd (root).
  try {
    const args = ["diff", "--name-only", "-z", `${fromRef}..${toRef}`, "--", pathspec];
    const { stdout } = await execFileAsync("git", args, { cwd: root, maxBuffer: 1024 * 1024 * 50 });
    return new Set(parseNulList(stdout));
  } catch {
    return new Set();
  }
}

function toPosixRel(p) {
  // Convert a filesystem relative path to the posix-ish form git returns.
  return p.split(path.sep).join("/");
}

function stripPrefix(p, prefix) {
  if (!prefix) return p;
  if (p === prefix) return "";
  if (p.startsWith(prefix + "/")) return p.slice(prefix.length + 1);
  return p;
}

export async function listGitFiles(root) {
  // `git rev-parse --show-toplevel` may return a realpath (e.g. /private/var/..)
  // while user paths may be symlinked (e.g. /var/..). Normalize with realpath
  // to avoid generating an invalid pathspec outside the repo.
  const top = await gitTopLevel(root);
  const [topReal, rootReal] = await Promise.all([fs.realpath(top), fs.realpath(root)]);

  const relFs = path.relative(topReal, rootReal);
  const rel = relFs && relFs !== "." ? toPosixRel(relFs) : "";
  const relSafe = rel && !rel.startsWith("..") ? rel : "";

  // When `root` points to a subdir of a git repo, scope file listing to that subdir.
  // Important: pathspecs are evaluated relative to the current working directory.
  // So from within the subdir, use `-- .` to mean "this directory".
  const pathspec = relSafe ? ["--", "."] : [];

  const tracked = await execFileAsync("git", ["ls-files", "-z", ...pathspec], { cwd: root, maxBuffer: 1024 * 1024 * 50 });
  const untracked = await execFileAsync("git", ["ls-files", "--others", "--exclude-standard", "-z", ...pathspec], {
    cwd: root,
    maxBuffer: 1024 * 1024 * 50
  });

  const out = (tracked.stdout + untracked.stdout)
    .split("\0")
    .filter(Boolean)
    .map((p) => stripPrefix(p, relSafe))
    .filter(Boolean);

  return Array.from(new Set(out)).sort();
}
