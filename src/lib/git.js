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
