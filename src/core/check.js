import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, readJson } from "../lib/io.js";
import { hasGit, isGitRepo, listGitFiles } from "../lib/git.js";
import { walkFiles } from "../lib/walk.js";
import { rulesJsonPath } from "../lib/paths.js";

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function globToRegExp(glob) {
  // Minimal, but good enough:
  // - ** matches across segments
  // - * matches within a segment
  // - ? matches a single char within a segment
  let s = String(glob);
  // Escape everything first (including * and ?), then re-enable glob tokens.
  s = s.replace(/[.+^${}()|[\]\\*?]/g, "\\$&");
  s = s.replace(/\\\*\\\*/g, ".*");
  s = s.replace(/\\\*/g, "[^/]*");
  s = s.replace(/\\\?/g, "[^/]");
  return new RegExp("^" + s + "$");
}

function compilePattern(pat) {
  const s = String(pat);
  if (s.startsWith("re:")) return new RegExp(s.slice(3));
  if (s.startsWith("/") && s.lastIndexOf("/") > 0) {
    // Support "/.../i" style
    const last = s.lastIndexOf("/");
    const body = s.slice(1, last);
    const flags = s.slice(last + 1);
    try {
      return new RegExp(body, flags);
    } catch {
      // fallthrough to glob
    }
  }
  return globToRegExp(s);
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
  if (rules.namingRules && !Array.isArray(rules.namingRules)) return "namingRules must be an array";
  return null;
}

export async function runCheck(root, { maxFiles = 4000, preferGit = true } = {}) {
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

  const files = (await getFileList(root, { preferGit, maxFiles })).map(toPosix);

  const violations = [];
  const errors = [];

  // requiredPaths
  if (rules.requiredPaths?.length) {
    for (const rel of rules.requiredPaths) {
      const relPosix = toPosix(rel);
      // Allow glob in required paths.
      if (String(relPosix).includes("*") || String(relPosix).includes("?") || String(relPosix).startsWith("re:") || String(relPosix).startsWith("/")) {
        const ok = files.some((f) => compilePattern(relPosix).test(f));
        if (!ok) violations.push({ type: "required", pattern: relPosix, message: `Missing required path match: ${relPosix}` });
      } else {
        const ok = await existsRel(root, relPosix);
        if (!ok) violations.push({ type: "required", path: relPosix, message: `Missing required path: ${relPosix}` });
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

  if (errors.length) {
    return { ok: false, exitCode: 2, errors, violations };
  }

  const ok = violations.length === 0;
  return { ok, exitCode: ok ? 0 : 1, errors: [], violations };
}
