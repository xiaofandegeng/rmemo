import { resolveRoot } from "../lib/paths.js";
import { runCheck } from "../core/check.js";

function groupBy(list, keyFn) {
  const m = new Map();
  for (const item of list) {
    const k = keyFn(item);
    const arr = m.get(k) || [];
    arr.push(item);
    m.set(k, arr);
  }
  return m;
}

function hintFor(v) {
  if (!v || typeof v !== "object") return null;
  if (v.type === "forbidden") {
    if (typeof v.pattern === "string" && v.pattern.startsWith(".env")) {
      return "Use .env.example and keep real .env out of git.";
    }
    return "Remove the forbidden file/path or adjust forbiddenPaths in .repo-memory/rules.json.";
  }
  if (v.type === "forbidden-content") {
    return "Remove secrets from the repo history if needed, rotate leaked credentials, and add a forbiddenContent rule to prevent recurrence.";
  }
  if (v.type === "required") {
    return "Create the missing file/path (or change requiredPaths/required pattern in .repo-memory/rules.json).";
  }
  if (v.type === "required-oneof") {
    return "Add at least one of the required files, or adjust requiredOneOf in .repo-memory/rules.json.";
  }
  if (v.type === "naming") {
    const match = v.rule?.match ? String(v.rule.match) : null;
    return match ? `Rename to match: ${match}` : "Rename to match the naming rule.";
  }
  return null;
}

function formatViolation(v) {
  const parts = [];
  if (v.file) parts.push(v.file);
  if (v.path) parts.push(v.path);
  if (v.pattern) parts.push(String(v.pattern));
  const loc = parts.length ? ` (${parts.join(", ")})` : "";
  return `${v.message || "Violation"}${loc}`;
}

export async function cmdCheck({ flags }) {
  const root = resolveRoot(flags);
  const maxFiles = Number(flags["max-files"] || 4000);
  const preferGit = flags["no-git"] ? false : true;
  const stagedOnly = !!flags.staged;
  const format = flags.format ? String(flags.format).toLowerCase() : "text";

  const res = await runCheck(root, { maxFiles, preferGit, stagedOnly });

  if (format === "json") {
    process.stdout.write(
      JSON.stringify(
        {
          schema: 1,
          generatedAt: new Date().toISOString(),
          root,
          stagedOnly,
          ok: res.ok,
          exitCode: res.exitCode,
          errors: res.errors,
          violations: res.violations
        },
        null,
        2
      ) + "\n"
    );
    process.exitCode = res.exitCode;
    return;
  }

  for (const e of res.errors) {
    process.stderr.write(`ERROR: ${e}\n`);
  }

  if (res.violations.length) {
    process.stderr.write(`FAIL: ${res.violations.length} violation(s)\n`);

    const groups = groupBy(res.violations, (v) => v.type || "unknown");
    const order = ["forbidden-content", "forbidden", "required", "naming", "unknown"];
    const keys = [...groups.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));

    let printed = 0;
    const LIMIT = 200;

    for (const type of keys) {
      const items = groups.get(type) || [];
      process.stderr.write(`\n== ${type} (${items.length}) ==\n`);
      const uniqHint = hintFor(items[0]);
      if (uniqHint) process.stderr.write(`Hint: ${uniqHint}\n`);

      for (const v of items) {
        if (printed >= LIMIT) break;
        process.stderr.write(`- ${formatViolation(v)}\n`);
        printed++;
      }
      if (printed >= LIMIT) break;
    }

    if (res.violations.length > printed) {
      process.stderr.write(`\n...and ${res.violations.length - printed} more\n`);
    }
  }

  if (res.ok) {
    process.stdout.write("OK: rules check passed\n");
  }

  process.exitCode = res.exitCode;
}
