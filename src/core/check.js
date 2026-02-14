import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, readJson } from "../lib/io.js";
import { hasGit, isGitRepo, listGitFiles } from "../lib/git.js";
import { walkFiles } from "../lib/walk.js";
import { rulesJsonPath } from "../lib/paths.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PATTERN_CACHE = new Map();
const CONTENT_MATCH_CACHE = new Map();

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function isProbablyBinary(buf) {
  // NUL byte is a strong indicator.
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

async function readFileHeadBytes(absPath, maxBytes) {
  const fh = await fs.open(absPath, "r");
  try {
    const st = await fh.stat();
    const n = Math.max(0, Math.min(Number(maxBytes) || 0, st.size));
    const buf = Buffer.allocUnsafe(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return bytesRead === n ? buf : buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

function globToRegExp(glob) {
  // Minimal glob matcher:
  // - ** matches across path segments
  // - **/ matches zero or more directories (so "**/*.txt" matches "a.txt" too)
  // - * matches within a segment
  // - ? matches a single char within a segment
  const s = String(glob);
  let out = "^";
  for (let i = 0; i < s.length; ) {
    const ch = s[i];
    if (ch === "*") {
      if (s[i + 1] === "*") {
        if (s[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 3;
        } else {
          out += ".*";
          i += 2;
        }
        continue;
      }
      out += "[^/]*";
      i += 1;
      continue;
    }
    if (ch === "?") {
      out += "[^/]";
      i += 1;
      continue;
    }
    // Escape regex special chars, but keep "/" literal.
    if ("\\.[]{}()+-^$|".includes(ch)) out += "\\" + ch;
    else out += ch;
    i += 1;
  }
  out += "$";
  return new RegExp(out);
}

function compilePattern(pat) {
  const s = String(pat);
  const cached = PATTERN_CACHE.get(s);
  if (cached) return cached;
  if (s.startsWith("re:")) {
    const re = new RegExp(s.slice(3));
    PATTERN_CACHE.set(s, re);
    return re;
  }
  if (s.startsWith("/") && s.lastIndexOf("/") > 0) {
    // Support "/.../i" style
    const last = s.lastIndexOf("/");
    const body = s.slice(1, last);
    const flags = s.slice(last + 1);
    try {
      const re = new RegExp(body, flags);
      PATTERN_CACHE.set(s, re);
      return re;
    } catch {
      // fallthrough to glob
    }
  }
  const re = globToRegExp(s);
  PATTERN_CACHE.set(s, re);
  return re;
}

function escapeRegExpLiteral(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileContentMatcher(match) {
  const s = String(match ?? "");
  if (!s) return null;
  const cached = CONTENT_MATCH_CACHE.get(s);
  if (cached) return cached;
  if (s.startsWith("re:")) {
    const re = new RegExp(s.slice(3));
    CONTENT_MATCH_CACHE.set(s, re);
    return re;
  }
  if (s.startsWith("/") && s.lastIndexOf("/") > 0) {
    const last = s.lastIndexOf("/");
    const body = s.slice(1, last);
    const flags = s.slice(last + 1);
    const re = new RegExp(body, flags);
    CONTENT_MATCH_CACHE.set(s, re);
    return re;
  }
  // Default: treat as literal substring.
  const re = new RegExp(escapeRegExpLiteral(s), "g");
  CONTENT_MATCH_CACHE.set(s, re);
  return re;
}

function matchAny(str, patterns) {
  if (!patterns || !patterns.length) return false;
  for (const p of patterns) {
    const re = compilePattern(p);
    if (re.test(str)) return true;
  }
  return false;
}

async function getFileList(root, { preferGit = true, maxFiles = 4000 } = {}) {
  // Do not rely on `.repo-memory/index.json` here: it can be stale if files changed
  // after the last `scan`. A check must reflect the current working tree.
  const gitOk = preferGit && (await hasGit()) && (await isGitRepo(root));
  if (gitOk) {
    const files = await listGitFiles(root);
    return files.slice(0, maxFiles);
  }
  const files = await walkFiles(root, { maxFiles });
  return files.slice(0, maxFiles);
}

async function getStagedFiles(root, { maxFiles = 4000 } = {}) {
  // Requires git repo.
  const { stdout } = await execFileAsync("git", ["diff", "--cached", "--name-only", "-z"], {
    cwd: root,
    maxBuffer: 1024 * 1024 * 20
  });
  const files = stdout.split("\0").filter(Boolean);
  // git returns posix separators already.
  return files.slice(0, maxFiles);
}

async function readStagedFileHeadBytes(root, relPosixPath, maxBytes) {
  // Reads file content from the git index (staged version), not from the working tree.
  // Note: git doesn't support partial reads here; we cap via maxBuffer and then slice.
  const mb = Number(maxBytes) || 0;
  const maxBuffer = Math.max(1024 * 1024, mb + 64 * 1024);
  const { stdout } = await execFileAsync("git", ["show", `:${relPosixPath}`], {
    cwd: root,
    encoding: "buffer",
    maxBuffer
  });
  const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  return mb > 0 && buf.byteLength > mb ? buf.subarray(0, mb) : buf;
}

async function existsRel(root, rel) {
  try {
    await fs.access(path.join(root, rel));
    return true;
  } catch {
    return false;
  }
}

function validateRulesShape(rules) {
  if (!rules || typeof rules !== "object") return "rules.json must be an object";
  if (rules.schema !== 1) return "rules.json schema must be 1";
  if (rules.forbiddenPaths && !Array.isArray(rules.forbiddenPaths)) return "forbiddenPaths must be an array";
  if (rules.requiredPaths && !Array.isArray(rules.requiredPaths)) return "requiredPaths must be an array";
  if (rules.requiredOneOf && !Array.isArray(rules.requiredOneOf)) return "requiredOneOf must be an array";
  if (rules.forbiddenContent && !Array.isArray(rules.forbiddenContent)) return "forbiddenContent must be an array";
  if (rules.namingRules && !Array.isArray(rules.namingRules)) return "namingRules must be an array";
  return null;
}

export async function runCheck(root, { maxFiles = 4000, preferGit = true, stagedOnly = false } = {}) {
  if (!(await fileExists(rulesJsonPath(root)))) {
    return {
      ok: false,
      exitCode: 2,
      errors: [`Missing ${toPosix(rulesJsonPath(root))}. Run: rmemo init (or create rules.json manually).`],
      violations: []
    };
  }

  let rules;
  try {
    rules = await readJson(rulesJsonPath(root));
  } catch (e) {
    return {
      ok: false,
      exitCode: 2,
      errors: [`Failed to parse rules.json: ${e?.message || String(e)}`],
      violations: []
    };
  }

  const shapeErr = validateRulesShape(rules);
  if (shapeErr) {
    return { ok: false, exitCode: 2, errors: [shapeErr], violations: [] };
  }

  let files = [];
  if (stagedOnly) {
    const gitOk = (await hasGit()) && (await isGitRepo(root));
    if (!gitOk) {
      return {
        ok: false,
        exitCode: 2,
        errors: ["--staged requires a git repository"],
        violations: []
      };
    }
    files = (await getStagedFiles(root, { maxFiles })).map(toPosix);
  } else {
    files = (await getFileList(root, { preferGit, maxFiles })).map(toPosix);
  }

  const violations = [];
  const errors = [];

  // requiredPaths
  if (rules.requiredPaths?.length) {
    // requiredPaths should validate the repo, not just staged files.
    // Even in stagedOnly mode, we check existence on disk.
    for (const rel of rules.requiredPaths) {
      const relPosix = toPosix(rel);
      // Allow glob in required paths.
      if (String(relPosix).includes("*") || String(relPosix).includes("?") || String(relPosix).startsWith("re:") || String(relPosix).startsWith("/")) {
        // In stagedOnly mode we still want to check against the whole repo file list
        // to avoid false failures.
        const universe = stagedOnly ? (await getFileList(root, { preferGit, maxFiles })).map(toPosix) : files;
        const ok = universe.some((f) => compilePattern(relPosix).test(f));
        if (!ok) violations.push({ type: "required", pattern: relPosix, message: `Missing required path match: ${relPosix}` });
      } else {
        const ok = await existsRel(root, relPosix);
        if (!ok) violations.push({ type: "required", path: relPosix, message: `Missing required path: ${relPosix}` });
      }
    }
  }

  // requiredOneOf
  if (rules.requiredOneOf?.length) {
    // Validate groups against whole repo to avoid staged-only false failures.
    const universe = (await getFileList(root, { preferGit, maxFiles })).map(toPosix);

    for (const group of rules.requiredOneOf) {
      if (!Array.isArray(group) || group.length === 0) {
        errors.push("requiredOneOf entries must be non-empty arrays");
        continue;
      }
      const pats = group.map(toPosix);
      const ok = pats.some((p) => {
        if (String(p).includes("*") || String(p).includes("?") || String(p).startsWith("re:") || String(p).startsWith("/")) {
          const re = compilePattern(p);
          return universe.some((f) => re.test(f));
        }
        return universe.includes(p) || false;
      });
      if (!ok) {
        violations.push({
          type: "required-oneof",
          group: pats,
          message: `Missing required one-of group: ${pats.join(" OR ")}`
        });
      }
    }
  }

  // forbiddenPaths
  if (rules.forbiddenPaths?.length) {
    for (const pat of rules.forbiddenPaths) {
      const p = toPosix(pat);
      const re = compilePattern(p);
      const hit = files.find((f) => re.test(f) || (p.endsWith("/") && f.startsWith(p)));
      if (hit) violations.push({ type: "forbidden", pattern: p, file: hit, message: `Forbidden path matched: ${p} (hit: ${hit})` });
    }
  }

  // namingRules
  if (rules.namingRules?.length) {
    for (const rule of rules.namingRules) {
      if (!rule || typeof rule !== "object") {
        errors.push("namingRules entries must be objects");
        continue;
      }
      const include = Array.isArray(rule.include) ? rule.include.map(toPosix) : rule.include ? [toPosix(rule.include)] : [];
      const exclude = Array.isArray(rule.exclude) ? rule.exclude.map(toPosix) : rule.exclude ? [toPosix(rule.exclude)] : [];
      const target = rule.target === "path" ? "path" : "basename";
      const match = rule.match ? String(rule.match) : null;
      if (!include.length || !match) {
        errors.push("namingRules entries must have include and match");
        continue;
      }
      const matchRe = compilePattern(match.startsWith("re:") || (match.startsWith("/") && match.lastIndexOf("/") > 0) ? match : "re:" + match);

      for (const f of files) {
        if (!matchAny(f, include)) continue;
        if (exclude.length && matchAny(f, exclude)) continue;

        const v = target === "path" ? f : path.posix.basename(f);
        if (!matchRe.test(v)) {
          violations.push({
            type: "naming",
            file: f,
            rule: { include, exclude, target, match },
            message: rule.message || `Naming rule violated for ${f} (target: ${target}, match: ${match})`
          });
        }
      }
    }
  }

  // forbiddenContent
  if (rules.forbiddenContent?.length) {
    const SKIP_EXT = new Set([
      "png",
      "jpg",
      "jpeg",
      "gif",
      "webp",
      "ico",
      "svg",
      "pdf",
      "zip",
      "gz",
      "tgz",
      "bz2",
      "7z",
      "rar",
      "dmg",
      "exe",
      "bin",
      "woff",
      "woff2",
      "ttf",
      "otf",
      "mp3",
      "mp4",
      "mov",
      "avi"
    ]);

    for (const rule of rules.forbiddenContent) {
      if (!rule || typeof rule !== "object") {
        errors.push("forbiddenContent entries must be objects");
        continue;
      }
      const include = Array.isArray(rule.include) ? rule.include.map(toPosix) : rule.include ? [toPosix(rule.include)] : ["**/*"];
      const exclude = Array.isArray(rule.exclude) ? rule.exclude.map(toPosix) : rule.exclude ? [toPosix(rule.exclude)] : [];
      const maxBytes = rule.maxBytes ? Number(rule.maxBytes) : 1_000_000;
      const match = rule.match ? String(rule.match) : "";
      const message = rule.message ? String(rule.message) : null;

      const re = compileContentMatcher(match);
      if (!re) {
        errors.push("forbiddenContent entries must have match");
        continue;
      }

      for (const f of files) {
        if (!matchAny(f, include)) continue;
        if (exclude.length && matchAny(f, exclude)) continue;

        const ext = path.posix.extname(f).slice(1).toLowerCase();
        if (ext && SKIP_EXT.has(ext)) continue;

        let buf = null;
        try {
          buf = stagedOnly
            ? await readStagedFileHeadBytes(root, f, maxBytes)
            : await readFileHeadBytes(path.join(root, f), maxBytes);
        } catch {
          // Staged file might be deleted/renamed; ignore.
          continue;
        }
        if (!buf || buf.byteLength === 0) continue;
        if (isProbablyBinary(buf.subarray(0, Math.min(buf.byteLength, 4096)))) continue;

        const text = buf.toString("utf8");
        re.lastIndex = 0;
        if (re.test(text)) {
          // Don't print the matched content, only the file and rule.
          violations.push({
            type: "forbidden-content",
            file: f,
            rule: { include, exclude, match },
            message: message || `Forbidden content matched in ${f} (match: ${match})`
          });
        }
      }
    }
  }

  if (errors.length) {
    return { ok: false, exitCode: 2, errors, violations };
  }

  const ok = violations.length === 0;
  return { ok, exitCode: ok ? 0 : 1, errors: [], violations };
}
