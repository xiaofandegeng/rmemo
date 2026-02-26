#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > 0) {
      flags[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const k = a.slice(2);
    const n = argv[i + 1];
    if (n && !n.startsWith("-")) {
      flags[k] = n;
      i++;
    } else {
      flags[k] = "true";
    }
  }
  return flags;
}

function run(cmd, args, cwd, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 0);
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let timeout = null;
    let finished = false;
    p.stdout.on("data", (d) => (out += d.toString("utf8")));
    p.stderr.on("data", (d) => (err += d.toString("utf8")));
    p.on("error", (e) => {
      if (timeout) clearTimeout(timeout);
      reject(e);
    });
    p.on("close", (code, signal) => {
      if (timeout) clearTimeout(timeout);
      finished = true;
      resolve({ code, signal: signal || "", out, err });
    });

    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        if (finished) return;
        p.kill("SIGTERM");
        setTimeout(() => {
          if (!finished) p.kill("SIGKILL");
        }, 1000);
      }, timeoutMs);
    }
  });
}

async function check(name, cmd, args, cwd, validate, timeoutMs = 0) {
  const t0 = Date.now();
  try {
    const r = await run(cmd, args, cwd, { timeoutMs });
    const timedOut = timeoutMs > 0 && r.signal === "SIGTERM" && r.code !== 0;
    const customErr = validate ? validate(r) : null;
    if (timedOut) {
      return { name, ok: false, durationMs: Date.now() - t0, code: r.code, error: `timed out after ${timeoutMs}ms`, timedOut: true };
    }
    if (r.code !== 0 || customErr) {
      return { name, ok: false, durationMs: Date.now() - t0, code: r.code, error: customErr || r.err || r.out, timedOut: false };
    }
    return { name, ok: true, durationMs: Date.now() - t0, code: r.code, timedOut: false };
  } catch (e) {
    return { name, ok: false, durationMs: Date.now() - t0, code: -1, error: String(e?.message || e), timedOut: false };
  }
}

function toMd(report) {
  const lines = [];
  lines.push("# rmemo Release Readiness");
  lines.push("");
  lines.push(`- root: ${report.root}`);
  lines.push(`- generatedAt: ${report.generatedAt}`);
  lines.push(`- summary: pass=${report.summary.pass} fail=${report.summary.fail} skipped=${report.summary.skipped}`);
  lines.push(`- result: ${report.ok ? "READY" : "NOT READY"}`);
  if (report.standardized?.resultCode) lines.push(`- resultCode: ${report.standardized.resultCode}`);
  if (Array.isArray(report.standardized?.failureCodes) && report.standardized.failureCodes.length > 0) {
    lines.push(`- failureCodes: ${report.standardized.failureCodes.join(",")}`);
  }
  lines.push("");
  for (const c of report.checks) {
    lines.push(`## ${c.name}`);
    lines.push(`- status: ${c.status}`);
    lines.push(`- durationMs: ${c.durationMs}`);
    if (c.code !== undefined) lines.push(`- exitCode: ${c.code}`);
    if (c.reason) lines.push(`- reason: ${c.reason}`);
    if (c.error) lines.push(`- error: ${String(c.error).trim().split("\n")[0]}`);
    lines.push("");
  }
  return lines.join("\n");
}

function statusFromOk(ok) {
  return ok ? "pass" : "fail";
}

function classifyFailure(check) {
  const msg = String(check?.error || "").toLowerCase();
  if (check?.timedOut || /timed out|timeout/.test(msg)) {
    return { code: "STEP_TIMEOUT", retryable: true };
  }
  if (/econn|enotfound|eai_again|network|socket|request timeout|429|5\d\d/.test(msg)) {
    return { code: "NETWORK_UNAVAILABLE", retryable: true };
  }
  const codeByCheck = {
    "git-clean": "RELEASE_READY_GIT_CLEAN_FAILED",
    "node-test": "RELEASE_READY_NODE_TEST_FAILED",
    "pack-dry": "RELEASE_READY_PACK_DRY_FAILED",
    "changelog-lint": "RELEASE_READY_CHANGELOG_LINT_FAILED",
    "contract-check": "RELEASE_READY_CONTRACT_CHECK_FAILED",
    "regression-matrix": "RELEASE_READY_REGRESSION_MATRIX_FAILED"
  };
  return {
    code: codeByCheck[String(check?.name || "")] || "RELEASE_READY_CHECK_FAILED",
    retryable: false
  };
}

function buildStandardized(report) {
  const checkStatuses = Object.fromEntries(report.checks.map((check) => [check.name, check.status]));
  const failures = report.checks
    .filter((check) => check.status === "fail")
    .map((check) => {
      const classified = classifyFailure(check);
      return {
        check: check.name,
        code: classified.code,
        message: String(check.error || ""),
        retryable: !!classified.retryable
      };
    });
  const checkEntries = Object.entries(checkStatuses);
  return {
    schema: 1,
    status: statusFromOk(report.ok),
    resultCode: report.ok ? "RELEASE_READY_OK" : "RELEASE_READY_FAIL",
    summary: {
      totalChecks: checkEntries.length,
      passCount: checkEntries.filter(([, status]) => status === "pass").length,
      failCount: checkEntries.filter(([, status]) => status === "fail").length,
      skippedCount: checkEntries.filter(([, status]) => status === "skipped").length
    },
    checkStatuses,
    failureCodes: Array.from(new Set(failures.map((failure) => failure.code).filter(Boolean))),
    failures
  };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const root = flags.root ? path.resolve(flags.root) : process.cwd();
  const format = String(flags.format || "md").toLowerCase();
  const allowDirty = flags["allow-dirty"] === "true";
  const skipTests = flags["skip-tests"] === "true";
  const stepTimeoutMs = Math.max(1000, Number(flags["step-timeout-ms"] || 600000));
  const outPath = flags.out ? path.resolve(root, String(flags.out)) : "";
  if (!["md", "json"].includes(format)) throw new Error("format must be md|json");

  const checks = [];
  checks.push(
    await check("git-clean", "git", ["status", "--short"], root, (r) => {
      if (allowDirty) return null;
      return String(r.out || "").trim() ? "working tree is not clean" : null;
    }, stepTimeoutMs)
  );
  if (skipTests) {
    checks.push({ name: "node-test", status: "skipped", durationMs: 0, reason: "skip-tests=true" });
  } else {
    const t = await check("node-test", "node", ["--test"], root, null, stepTimeoutMs);
    checks.push(t);
  }
  checks.push(await check("pack-dry", "npm", ["run", "pack:dry"], root, null, stepTimeoutMs));
  checks.push(await check("changelog-lint", "npm", ["run", "verify:changelog"], root, null, stepTimeoutMs));
  checks.push(
    await check("contract-check", "node", ["bin/rmemo.js", "contract", "check", "--format", "json", "--fail-on", "any"], root, null, stepTimeoutMs)
  );
  checks.push(await check("regression-matrix", "npm", ["run", "verify:matrix"], root, null, stepTimeoutMs));

  const normalized = checks.map((c) => {
    if (c.status === "skipped") return c;
    return { ...c, status: c.ok ? "pass" : "fail" };
  });
  const summary = {
    pass: normalized.filter((x) => x.status === "pass").length,
    fail: normalized.filter((x) => x.status === "fail").length,
    skipped: normalized.filter((x) => x.status === "skipped").length
  };
  const report = {
    schema: 1,
    root,
    generatedAt: new Date().toISOString(),
    options: { allowDirty, skipTests, stepTimeoutMs },
    checks: normalized,
    summary,
    ok: summary.fail === 0
  };
  report.standardized = buildStandardized(report);

  const rendered = format === "json" ? JSON.stringify(report, null, 2) + "\n" : toMd(report) + "\n";
  process.stdout.write(rendered);
  if (outPath) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, rendered, "utf8");
  }

  if (!report.ok) process.exitCode = 1;
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e) + "\n");
  process.exitCode = 1;
});
