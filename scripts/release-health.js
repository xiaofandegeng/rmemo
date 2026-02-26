#!/usr/bin/env node
import path from "node:path";
import { spawn } from "node:child_process";
import https from "node:https";
import { readFile } from "node:fs/promises";

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

async function run(cmd, args, cwd, options = {}) {
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

async function npmVersionExists(pkgName, version, cwd, timeoutMs) {
  const r = await run("npm", ["view", `${pkgName}@${version}`, "version"], cwd, { timeoutMs });
  const timedOut = timeoutMs > 0 && r.signal === "SIGTERM" && r.code !== 0;
  if (r.code !== 0) {
    return { ok: false, value: null, error: timedOut ? `npm view timed out after ${timeoutMs}ms` : r.err || r.out };
  }
  const v = String(r.out || "").trim();
  return { ok: v === version, value: v, error: null };
}

async function getGithubReleaseByTag({ owner, repo, tag, token, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const req = https.request(
      `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
      {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "rmemo-release-health",
          Accept: "application/vnd.github+json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          clearTimeout(timer);
          const status = res.statusCode || 0;
          if (status >= 200 && status < 300) {
            try {
              resolve({ ok: true, status, data: JSON.parse(body) });
            } catch (e) {
              resolve({ ok: false, status, error: `invalid json: ${e?.message || e}` });
            }
            return;
          }
          resolve({ ok: false, status, error: body || `http ${status}` });
        });
      }
    );
    req.on("error", (err) => {
      clearTimeout(timer);
      if (err?.name === "AbortError") {
        reject(new Error(`request timeout after ${timeoutMs}ms`));
        return;
      }
      reject(err);
    });
    req.end();
  });
}

function isRetryableGithubStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

async function getGithubReleaseByTagWithRetry({ owner, repo, tag, token, timeoutMs, retries, retryDelayMs }) {
  const maxAttempts = Math.max(1, Number(retries || 0) + 1);
  let last = { ok: false, status: 0, error: "unknown error" };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await getGithubReleaseByTag({ owner, repo, tag, token, timeoutMs });
      if (res.ok) return { ...res, attempts: attempt, retryable: false };
      const retryable = isRetryableGithubStatus(Number(res.status || 0));
      last = { ...res, attempts: attempt, retryable };
      if (!retryable || attempt === maxAttempts) return last;
    } catch (e) {
      last = { ok: false, status: 0, error: String(e?.message || e), attempts: attempt, retryable: false };
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(retryDelayMs || 0))));
  }
  return last;
}

function statusFromOk(ok) {
  return ok ? "pass" : "fail";
}

function firstLine(v) {
  return String(v || "").trim().split("\n")[0];
}

function isTimeoutLike(v) {
  return /timed out|timeout/i.test(String(v || ""));
}

function buildStandardizedChecks({ npmCheck, ghCheck, releaseAssetsCheck, reportOk }) {
  const npmStandard = {
    status: statusFromOk(npmCheck.ok),
    code: npmCheck.ok ? "NPM_VERSION_FOUND" : isTimeoutLike(npmCheck.error) ? "NPM_VIEW_TIMEOUT" : "NPM_VIEW_FAILED",
    message: npmCheck.ok ? `found version ${String(npmCheck.value || "").trim()}` : firstLine(npmCheck.error) || "npm view failed",
    retryable: false
  };

  let ghCode = "GITHUB_RELEASE_FOUND";
  if (!ghCheck.ok) {
    if (Number(ghCheck.status) === 429) ghCode = "GITHUB_RELEASE_RATE_LIMITED";
    else if (Number(ghCheck.status) >= 500) ghCode = "GITHUB_RELEASE_HTTP_5XX";
    else if (Number(ghCheck.status) >= 400) ghCode = "GITHUB_RELEASE_HTTP_4XX";
    else if (isTimeoutLike(ghCheck.error)) ghCode = "GITHUB_RELEASE_TIMEOUT";
    else ghCode = "GITHUB_RELEASE_UNAVAILABLE";
  }
  const ghStandard = {
    status: statusFromOk(ghCheck.ok),
    code: ghCode,
    message: ghCheck.ok
      ? `found release tag with ${Number(ghCheck.assetsCount || 0)} asset(s)`
      : firstLine(ghCheck.error) || `github release check failed (http ${Number(ghCheck.status || 0)})`,
    retryable: ghCode === "GITHUB_RELEASE_RATE_LIMITED" || ghCode === "GITHUB_RELEASE_HTTP_5XX" || ghCode === "GITHUB_RELEASE_TIMEOUT",
    httpStatus: Number(ghCheck.status || 0),
    attempts: Number(ghCheck.attempts || 1)
  };

  let assetCode = "RELEASE_ASSET_EXPECTED_PRESENT";
  if (!releaseAssetsCheck.ok) {
    if (!ghCheck.ok) assetCode = "RELEASE_ASSET_CHECK_BLOCKED";
    else if (releaseAssetsCheck.foundLegacy && !releaseAssetsCheck.foundExpected) assetCode = "RELEASE_ASSET_LEGACY_ONLY";
    else assetCode = "RELEASE_ASSET_EXPECTED_MISSING";
  }
  const assetStandard = {
    status: statusFromOk(releaseAssetsCheck.ok),
    code: assetCode,
    message: releaseAssetsCheck.ok
      ? `expected asset present: ${String(releaseAssetsCheck.expectedAsset || "")}`
      : firstLine(releaseAssetsCheck.error) || "release asset check failed",
    retryable: false
  };

  const checks = {
    npm: npmStandard,
    githubRelease: ghStandard,
    releaseAssets: assetStandard
  };
  const entries = Object.entries(checks);
  const failures = entries
    .filter(([, v]) => v.status === "fail")
    .map(([check, v]) => ({
      check,
      code: v.code,
      message: v.message,
      retryable: !!v.retryable,
      ...(check === "githubRelease" ? { httpStatus: v.httpStatus, attempts: v.attempts } : {})
    }));

  return {
    schema: 1,
    status: statusFromOk(reportOk),
    resultCode: reportOk ? "RELEASE_HEALTH_OK" : "RELEASE_HEALTH_FAIL",
    summary: {
      totalChecks: entries.length,
      passCount: entries.filter(([, v]) => v.status === "pass").length,
      failCount: entries.filter(([, v]) => v.status === "fail").length
    },
    checkStatuses: Object.fromEntries(entries.map(([k, v]) => [k, v.status])),
    checks,
    failureCodes: failures.map((x) => x.code),
    failures
  };
}

function md(report) {
  const lines = [];
  lines.push("# rmemo Release Health");
  lines.push("");
  lines.push(`- package: ${report.packageName}`);
  lines.push(`- version: ${report.version}`);
  lines.push(`- tag: ${report.tag}`);
  lines.push(`- repo: ${report.repo.owner}/${report.repo.name}`);
  lines.push(`- result: ${report.ok ? "OK" : "FAIL"}`);
  if (report.standardized?.resultCode) lines.push(`- resultCode: ${report.standardized.resultCode}`);
  if (Array.isArray(report.standardized?.failureCodes) && report.standardized.failureCodes.length) {
    lines.push(`- failureCodes: ${report.standardized.failureCodes.join(",")}`);
  }
  lines.push("");
  lines.push("## npm");
  lines.push(`- status: ${report.checks.npm.ok ? "OK" : "FAIL"}`);
  if (report.checks.npm.value) lines.push(`- value: ${report.checks.npm.value}`);
  if (report.checks.npm.error) lines.push(`- error: ${report.checks.npm.error.trim()}`);
  lines.push("");
  lines.push("## githubRelease");
  lines.push(`- status: ${report.checks.githubRelease.ok ? "OK" : "FAIL"}`);
  if (report.checks.githubRelease.status) lines.push(`- httpStatus: ${report.checks.githubRelease.status}`);
  if (report.checks.githubRelease.attempts !== undefined) lines.push(`- attempts: ${report.checks.githubRelease.attempts}`);
  if (report.checks.githubRelease.releaseName) lines.push(`- releaseName: ${report.checks.githubRelease.releaseName}`);
  lines.push(`- assetsCount: ${report.checks.githubRelease.assetsCount}`);
  if (report.checks.githubRelease.error) lines.push(`- error: ${report.checks.githubRelease.error.trim()}`);
  lines.push("");
  lines.push("## releaseAssets");
  lines.push(`- status: ${report.checks.releaseAssets.ok ? "OK" : "FAIL"}`);
  lines.push(`- expected: ${report.checks.releaseAssets.expectedAsset}`);
  if (report.checks.releaseAssets.legacyAsset) lines.push(`- legacyAsset: ${report.checks.releaseAssets.legacyAsset}`);
  lines.push(`- foundExpected: ${report.checks.releaseAssets.foundExpected ? "yes" : "no"}`);
  lines.push(`- foundLegacy: ${report.checks.releaseAssets.foundLegacy ? "yes" : "no"}`);
  lines.push(`- foundAnyTgz: ${report.checks.releaseAssets.foundAnyTgz ? "yes" : "no"}`);
  if (report.checks.releaseAssets.error) lines.push(`- error: ${report.checks.releaseAssets.error.trim()}`);
  return lines.join("\n") + "\n";
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const cwd = flags.root ? path.resolve(flags.root) : process.cwd();
  const format = (flags.format || "md").toLowerCase();
  if (!["md", "json"].includes(format)) throw new Error("format must be md|json");

  const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8"));
  const packageName = pkg.name;
  const pkgVersion = String(pkg.version || "").trim();
  const versionFlag = String(flags.version || "").trim();
  if (versionFlag.toLowerCase() === "current" && !pkgVersion) {
    throw new Error("--version current requires package.json with a valid version field");
  }
  const version = versionFlag.toLowerCase() === "current" ? pkgVersion : String(versionFlag || pkgVersion || "").trim();
  if (!version) throw new Error("version is required (--version or package.json version)");
  const tag = flags.tag || `v${version}`;
  const packageBaseName = String(packageName || "").includes("/") ? String(packageName).split("/").pop() : String(packageName || "");
  const expectedAsset = String(flags["expected-asset"] || `${packageBaseName}-${version}.tgz`);
  const allowLegacyScopedAsset = String(flags["allow-legacy-scoped-asset"] || "true") !== "false";
  const legacyScopedAsset = `${String(packageName || "").replace(/^@/, "").replace("/", "-")}-${version}.tgz`;

  const repoArg = flags.repo || process.env.GITHUB_REPOSITORY || "";
  const [owner, name] = repoArg.split("/");
  if (!owner || !name) throw new Error("repo is required (use --repo owner/name or set GITHUB_REPOSITORY)");
  const timeoutMs = Math.max(1000, Number(flags["timeout-ms"] || 15000));
  const githubRetries = Math.max(0, Number(flags["github-retries"] || 2));
  const githubRetryDelayMs = Math.max(0, Number(flags["github-retry-delay-ms"] || 1000));

  const npmCheck = await npmVersionExists(packageName, version, cwd, timeoutMs);
  const gh = await getGithubReleaseByTagWithRetry({
    owner,
    repo: name,
    tag,
    token: process.env.GITHUB_TOKEN || "",
    timeoutMs,
    retries: githubRetries,
    retryDelayMs: githubRetryDelayMs
  });

  const ghCheck = {
    ok: !!gh.ok,
    status: gh.status || 0,
    attempts: gh.attempts || 1,
    releaseName: gh.ok ? String(gh.data?.name || "") : "",
    assetsCount: gh.ok ? (Array.isArray(gh.data?.assets) ? gh.data.assets.length : 0) : 0,
    error: gh.ok ? null : String(gh.error || "")
  };

  const assetNames = gh.ok && Array.isArray(gh.data?.assets) ? gh.data.assets.map((a) => String(a?.name || "")) : [];
  const foundExpected = assetNames.includes(expectedAsset);
  const foundLegacy = assetNames.includes(legacyScopedAsset);
  const foundAnyTgz = assetNames.some((x) => x.endsWith(".tgz"));
  const assetCheckOk = ghCheck.ok && (foundExpected || (allowLegacyScopedAsset && foundLegacy));
  const assetCheckError = !ghCheck.ok
    ? "github release unavailable"
    : assetCheckOk
      ? null
      : `missing expected asset '${expectedAsset}'${allowLegacyScopedAsset ? ` (legacy accepted: '${legacyScopedAsset}')` : ""}`;

  const releaseAssetsCheck = {
    ok: assetCheckOk,
    expectedAsset,
    legacyAsset: allowLegacyScopedAsset ? legacyScopedAsset : "",
    foundExpected,
    foundLegacy,
    foundAnyTgz,
    error: assetCheckError
  };

  const report = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    packageName,
    version,
    tag,
    repo: { owner, name },
    options: { timeoutMs, githubRetries, githubRetryDelayMs },
    checks: {
      npm: npmCheck,
      githubRelease: ghCheck,
      releaseAssets: releaseAssetsCheck
    },
    ok: npmCheck.ok && ghCheck.ok && releaseAssetsCheck.ok
  };
  report.standardized = buildStandardizedChecks({
    npmCheck,
    ghCheck,
    releaseAssetsCheck,
    reportOk: report.ok
  });

  if (format === "json") process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  else process.stdout.write(md(report));

  if (!report.ok) process.exitCode = 1;
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e) + "\n");
  process.exitCode = 1;
});
