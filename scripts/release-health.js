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

function md(report) {
  const lines = [];
  lines.push("# rmemo Release Health");
  lines.push("");
  lines.push(`- package: ${report.packageName}`);
  lines.push(`- version: ${report.version}`);
  lines.push(`- tag: ${report.tag}`);
  lines.push(`- repo: ${report.repo.owner}/${report.repo.name}`);
  lines.push(`- result: ${report.ok ? "OK" : "FAIL"}`);
  lines.push("");
  lines.push("## npm");
  lines.push(`- status: ${report.checks.npm.ok ? "OK" : "FAIL"}`);
  if (report.checks.npm.value) lines.push(`- value: ${report.checks.npm.value}`);
  if (report.checks.npm.error) lines.push(`- error: ${report.checks.npm.error.trim()}`);
  lines.push("");
  lines.push("## githubRelease");
  lines.push(`- status: ${report.checks.githubRelease.ok ? "OK" : "FAIL"}`);
  if (report.checks.githubRelease.status) lines.push(`- httpStatus: ${report.checks.githubRelease.status}`);
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
  const version = flags.version || pkg.version;
  const tag = flags.tag || `v${version}`;
  const packageBaseName = String(packageName || "").includes("/") ? String(packageName).split("/").pop() : String(packageName || "");
  const expectedAsset = String(flags["expected-asset"] || `${packageBaseName}-${version}.tgz`);
  const allowLegacyScopedAsset = String(flags["allow-legacy-scoped-asset"] || "true") !== "false";
  const legacyScopedAsset = `${String(packageName || "").replace(/^@/, "").replace("/", "-")}-${version}.tgz`;

  const repoArg = flags.repo || process.env.GITHUB_REPOSITORY || "";
  const [owner, name] = repoArg.split("/");
  if (!owner || !name) throw new Error("repo is required (use --repo owner/name or set GITHUB_REPOSITORY)");
  const timeoutMs = Math.max(1000, Number(flags["timeout-ms"] || 15000));

  const npmCheck = await npmVersionExists(packageName, version, cwd, timeoutMs);
  let gh;
  try {
    gh = await getGithubReleaseByTag({ owner, repo: name, tag, token: process.env.GITHUB_TOKEN || "", timeoutMs });
  } catch (e) {
    gh = { ok: false, status: 0, error: String(e?.message || e) };
  }

  const ghCheck = {
    ok: !!gh.ok,
    status: gh.status || 0,
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
    checks: {
      npm: npmCheck,
      githubRelease: ghCheck,
      releaseAssets: releaseAssetsCheck
    },
    ok: npmCheck.ok && ghCheck.ok && releaseAssetsCheck.ok
  };

  if (format === "json") process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  else process.stdout.write(md(report));

  if (!report.ok) process.exitCode = 1;
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e) + "\n");
  process.exitCode = 1;
});
