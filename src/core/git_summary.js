import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { hasGit, isGitRepo } from "../lib/git.js";

const execFileAsync = promisify(execFile);

function normalizeNewlines(s) {
  return String(s || "").replace(/\r\n/g, "\n");
}

export async function gitCmd(root, args, { maxBuffer = 1024 * 1024 * 20 } = {}) {
  const { stdout } = await execFileAsync("git", args, { cwd: root, maxBuffer });
  return normalizeNewlines(stdout.toString("utf8"));
}

export async function gitOk(root) {
  return (await hasGit()) && (await isGitRepo(root));
}

export async function revParse(root, ref) {
  return (await gitCmd(root, ["rev-parse", ref])).trim();
}

export async function refExists(root, ref) {
  try {
    await gitCmd(root, ["rev-parse", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
}

export async function resolveDefaultBaseRef(root) {
  // Prefer the remote default branch if present; fall back to common local branches.
  try {
    const sym = (await gitCmd(root, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"])).trim();
    // refs/remotes/origin/main -> origin/main
    if (sym.startsWith("refs/remotes/")) return sym.slice("refs/remotes/".length);
  } catch {
    // ignore
  }

  const candidates = ["origin/main", "origin/master", "main", "master"];
  for (const c of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await refExists(root, c)) return c;
  }

  return ""; // unknown
}

export async function mergeBase(root, refA, refB) {
  return (await gitCmd(root, ["merge-base", refA, refB])).trim();
}

export async function getGitSummary(root, { since = "", staged = false } = {}) {
  if (!(await gitOk(root))) return null;

  let head = null;
  try {
    head = (await gitCmd(root, ["rev-parse", "HEAD"])).trim();
  } catch {
    head = null;
  }

  const status = (await gitCmd(root, ["status", "--porcelain=v1"])).trimEnd();

  let diffNames = "";
  try {
    if (staged) diffNames = (await gitCmd(root, ["diff", "--cached", "--name-status"])).trimEnd();
    else diffNames = (await gitCmd(root, ["diff", "--name-status"])).trimEnd();
  } catch {
    diffNames = "";
  }

  let range = null;
  let rangeLog = "";
  let rangeNames = "";
  if (since) {
    range = `${since}..HEAD`;
    try {
      rangeLog = (await gitCmd(root, ["log", "--oneline", "--no-decorate", "--max-count=30", range])).trimEnd();
    } catch {
      rangeLog = "";
    }
    try {
      rangeNames = (await gitCmd(root, ["diff", "--name-status", range])).trimEnd();
    } catch {
      rangeNames = "";
    }
  }

  return { head, status, diffNames, range, rangeLog, rangeNames };
}

