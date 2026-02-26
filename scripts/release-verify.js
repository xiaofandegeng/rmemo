#!/usr/bin/env node
import path from "node:path";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function md(report) {
  const lines = [];
  lines.push("# rmemo Release Verify");
  lines.push("");
  lines.push(`- package: ${report.packageName}`);
  lines.push(`- version: ${report.version}`);
  lines.push(`- tag: ${report.tag}`);
  lines.push(`- repo: ${report.repo}`);
  lines.push(`- result: ${report.ok ? "OK" : "FAIL"}`);
  if (report.standardized?.resultCode) lines.push(`- resultCode: ${report.standardized.resultCode}`);
  if (Array.isArray(report.standardized?.failureCodes) && report.standardized.failureCodes.length > 0) {
    lines.push(`- failureCodes: ${report.standardized.failureCodes.join(",")}`);
  }
  lines.push(`- attempts: ${report.attempts}`);
  lines.push(`- elapsedMs: ${report.elapsedMs}`);
  lines.push(`- maxWaitMs: ${report.options.maxWaitMs}`);
  lines.push(`- pollIntervalMs: ${report.options.pollIntervalMs}`);
  lines.push("");
  lines.push("## Last Check");
  lines.push(`- status: ${report.lastCheck.ok ? "OK" : "FAIL"}`);
  if (report.lastCheck.generatedAt) lines.push(`- generatedAt: ${report.lastCheck.generatedAt}`);
  if (report.lastCheck.error) lines.push(`- error: ${report.lastCheck.error}`);
  if (report.lastCheck.checks) {
    lines.push(`- npm: ${report.lastCheck.checks.npm?.ok ? "OK" : "FAIL"}`);
    lines.push(`- githubRelease: ${report.lastCheck.checks.githubRelease?.ok ? "OK" : "FAIL"}`);
    lines.push(`- releaseAssets: ${report.lastCheck.checks.releaseAssets?.ok ? "OK" : "FAIL"}`);
  }
  return `${lines.join("\n")}\n`;
}

function statusFromOk(ok) {
  return ok ? "pass" : "fail";
}

function buildStandardized({ ok, attempts, elapsedMs, options, lastCheck }) {
  const checkStatuses = {};
  if (lastCheck?.standardized && typeof lastCheck.standardized.checkStatuses === "object" && lastCheck.standardized.checkStatuses) {
    Object.assign(checkStatuses, lastCheck.standardized.checkStatuses);
  } else if (lastCheck?.checks && typeof lastCheck.checks === "object") {
    for (const [key, value] of Object.entries(lastCheck.checks)) {
      checkStatuses[key] = statusFromOk(!!value?.ok);
    }
  }
  checkStatuses.convergence = statusFromOk(ok);

  let failures = [];
  if (Array.isArray(lastCheck?.standardized?.failures) && lastCheck.standardized.failures.length > 0) {
    failures = lastCheck.standardized.failures.map((x) => ({
      check: String(x?.check || ""),
      code: String(x?.code || ""),
      message: String(x?.message || ""),
      retryable: !!x?.retryable
    }));
  } else if (lastCheck?.checks && typeof lastCheck.checks === "object") {
    failures = Object.entries(lastCheck.checks)
      .filter(([, value]) => !value?.ok)
      .map(([check, value]) => ({
        check,
        code: "RELEASE_VERIFY_CHECK_FAILED",
        message: String(value?.error || `${check} not ready`),
        retryable: true
      }));
  } else if (!ok) {
    failures = [
      {
        check: "convergence",
        code: "RELEASE_VERIFY_HEALTH_CHECK_FAILED",
        message: String(lastCheck?.error || "release-health did not converge in verify window"),
        retryable: true
      }
    ];
  }

  if (!ok && elapsedMs >= Number(options?.maxWaitMs || 0)) {
    failures.push({
      check: "convergence",
      code: "RELEASE_VERIFY_CONVERGENCE_TIMEOUT",
      message: `convergence not reached within ${Number(options?.maxWaitMs || 0)}ms`,
      retryable: true
    });
  }

  const failureCodes = Array.from(new Set(failures.map((x) => x.code).filter(Boolean)));
  const checkEntries = Object.entries(checkStatuses);
  return {
    schema: 1,
    status: statusFromOk(ok),
    resultCode: ok ? "RELEASE_VERIFY_OK" : "RELEASE_VERIFY_FAIL",
    summary: {
      totalChecks: checkEntries.length,
      passCount: checkEntries.filter(([, status]) => status === "pass").length,
      failCount: checkEntries.filter(([, status]) => status === "fail").length,
      attempts,
      elapsedMs
    },
    checkStatuses,
    failureCodes,
    failures
  };
}

async function runReleaseHealth({ root, repo, version, tag, timeoutMs, retries, retryDelayMs, allowLegacyScopedAsset }) {
  const args = [
    "scripts/release-health.js",
    "--repo",
    repo,
    "--version",
    version,
    "--tag",
    tag,
    "--format",
    "json",
    "--timeout-ms",
    String(timeoutMs),
    "--github-retries",
    String(retries),
    "--github-retry-delay-ms",
    String(retryDelayMs),
    "--allow-legacy-scoped-asset",
    allowLegacyScopedAsset ? "true" : "false"
  ];
  const r = await run("node", args, root, { timeoutMs: timeoutMs + 3000 });
  const timedOut = timeoutMs > 0 && r.signal === "SIGTERM" && r.code !== 0;
  if (!String(r.out || "").trim()) {
    return {
      ok: false,
      error: timedOut ? `release-health timed out after ${timeoutMs}ms` : String(r.err || "release-health returned empty output")
    };
  }
  try {
    return JSON.parse(r.out);
  } catch (e) {
    return { ok: false, error: `invalid release-health json: ${e?.message || e}` };
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const root = flags.root ? path.resolve(flags.root) : process.cwd();
  const format = String(flags.format || "md").toLowerCase();
  if (!["md", "json"].includes(format)) throw new Error("format must be md|json");

  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const packageName = String(pkg.name || "");
  const pkgVersion = String(pkg.version || "").trim();
  const versionFlag = String(flags.version || "").trim();
  if (versionFlag.toLowerCase() === "current" && !pkgVersion) {
    throw new Error("--version current requires package.json with a valid version field");
  }
  const version = versionFlag.toLowerCase() === "current" ? pkgVersion : String(versionFlag || pkgVersion || "").trim();
  if (!version) throw new Error("version is required (--version or package.json version)");

  const repo = String(flags.repo || process.env.GITHUB_REPOSITORY || "").trim();
  if (!repo) throw new Error("repo is required (use --repo owner/name or set GITHUB_REPOSITORY)");
  const tag = String(flags.tag || `v${version}`).trim();

  const pollIntervalMs = Math.max(100, Number(flags["poll-interval-ms"] || 10000));
  const maxWaitMs = Math.max(1000, Number(flags["max-wait-ms"] || 30 * 60 * 1000));
  const healthTimeoutMs = Math.max(1000, Number(flags["health-timeout-ms"] || 15000));
  const healthRetries = Math.max(0, Number(flags["health-github-retries"] || 2));
  const healthRetryDelayMs = Math.max(0, Number(flags["health-github-retry-delay-ms"] || 1000));
  const allowLegacyScopedAsset = String(flags["allow-legacy-scoped-asset"] || "false") === "true";

  const startedAt = Date.now();
  let attempts = 0;
  let last = { ok: false, error: "no checks executed" };

  while (Date.now() - startedAt <= maxWaitMs) {
    attempts += 1;
    last = await runReleaseHealth({
      root,
      repo,
      version,
      tag,
      timeoutMs: healthTimeoutMs,
      retries: healthRetries,
      retryDelayMs: healthRetryDelayMs,
      allowLegacyScopedAsset
    });
    if (last.ok) break;
    if (Date.now() - startedAt >= maxWaitMs) break;
    await sleep(pollIntervalMs);
  }

  const report = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    packageName,
    version,
    tag,
    repo,
    attempts,
    elapsedMs: Date.now() - startedAt,
    options: {
      maxWaitMs,
      pollIntervalMs,
      healthTimeoutMs,
      healthGithubRetries: healthRetries,
      healthGithubRetryDelayMs: healthRetryDelayMs,
      allowLegacyScopedAsset
    },
    lastCheck: last,
    ok: !!last.ok
  };
  report.standardized = buildStandardized(report);

  process.stdout.write(format === "json" ? `${JSON.stringify(report, null, 2)}\n` : md(report));
  if (!report.ok) process.exitCode = 1;
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e) + "\n");
  process.exitCode = 1;
});
