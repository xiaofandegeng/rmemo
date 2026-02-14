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

function parseOnelineLog(text, { max = 30 } = {}) {
  const lines = String(text || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, max);
  return lines.map((line) => {
    const sp = line.indexOf(" ");
    if (sp === -1) return { sha: line, subject: "" };
    return { sha: line.slice(0, sp), subject: line.slice(sp + 1) };
  });
}

function parseNameStatus(text, { max = 200, stable = true } = {}) {
  const rows = String(text || "")
    .split("\n")
    .map((x) => x.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split(/\s+/);
      const file = rest.join(" ").trim();
      return { status, file };
    })
    .filter((r) => r.status && r.file)
    .slice(0, max);

  if (!stable) return rows;
  return rows.slice().sort((a, b) => a.file.localeCompare(b.file));
}

export async function getGitRangeData(root, { sinceRef = "", staged = false, maxCommits = 30, maxFiles = 200 } = {}) {
  if (!(await gitOk(root))) return null;

  const out = {
    schema: 1,
    head: null,
    sinceRef: sinceRef || "",
    range: null,
    commits: [],
    files: [],
    workingTree: { status: "", diff: [] }
  };

  try {
    out.head = (await gitCmd(root, ["rev-parse", "HEAD"])).trim();
  } catch {
    out.head = null;
  }

  out.workingTree.status = (await gitCmd(root, ["status", "--porcelain=v1"])).trimEnd();
  try {
    const ns = staged
      ? await gitCmd(root, ["diff", "--cached", "--name-status"])
      : await gitCmd(root, ["diff", "--name-status"]);
    out.workingTree.diff = parseNameStatus(ns, { max: maxFiles, stable: true });
  } catch {
    out.workingTree.diff = [];
  }

  if (!sinceRef) return out;

  out.range = `${sinceRef}..HEAD`;
  try {
    const log = await gitCmd(root, ["log", "--oneline", "--no-decorate", `--max-count=${maxCommits}`, out.range]);
    out.commits = parseOnelineLog(log, { max: maxCommits });
  } catch {
    out.commits = [];
  }

  try {
    const ns = await gitCmd(root, ["diff", "--name-status", out.range]);
    out.files = parseNameStatus(ns, { max: maxFiles, stable: true });
  } catch {
    out.files = [];
  }

  return out;
}
