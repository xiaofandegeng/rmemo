import { execFile } from "node:child_process";
import { promisify } from "node:util";

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

export async function listGitFiles(root) {
  const tracked = await execFileAsync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 1024 * 1024 * 50 });
  const untracked = await execFileAsync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    maxBuffer: 1024 * 1024 * 50
  });

  const out = (tracked.stdout + untracked.stdout).split("\0").filter(Boolean);
  // Normalize to posix-like relative paths (git always returns / separators).
  return Array.from(new Set(out)).sort();
}

