import { resolveRoot } from "../lib/paths.js";
import { runCheck } from "../core/check.js";

export async function cmdCheck({ flags }) {
  const root = resolveRoot(flags);
  const maxFiles = Number(flags["max-files"] || 4000);
  const preferGit = flags["no-git"] ? false : true;

  const res = await runCheck(root, { maxFiles, preferGit });

  for (const e of res.errors) {
    process.stderr.write(`ERROR: ${e}\n`);
  }

  if (res.violations.length) {
    for (const v of res.violations.slice(0, 200)) {
      process.stderr.write(`VIOLATION: ${v.message}\n`);
    }
    if (res.violations.length > 200) process.stderr.write(`...and ${res.violations.length - 200} more\n`);
  }

  if (res.ok) {
    process.stdout.write("OK: rules check passed\n");
  } else if (!res.errors.length && res.violations.length) {
    process.stderr.write(`FAIL: ${res.violations.length} violation(s)\n`);
  }

  process.exitCode = res.exitCode;
}

