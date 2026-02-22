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

async function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString("utf8")));
    p.stderr.on("data", (d) => (err += d.toString("utf8")));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

async function npmVersionExists(pkgName, version, cwd) {
  const r = await run("npm", ["view", `${pkgName}@${version}`, "version"], cwd);
  if (r.code !== 0) return { ok: false, value: null, error: r.err || r.out };
  const v = String(r.out || "").trim();
  return { ok: v === version, value: v, error: null };
}

async function getGithubReleaseByTag({ owner, repo, tag, token }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
      {
        method: "GET",
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
    req.on("error", reject);
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

  const repoArg = flags.repo || process.env.GITHUB_REPOSITORY || "";
  const [owner, name] = repoArg.split("/");
  if (!owner || !name) throw new Error("repo is required (use --repo owner/name or set GITHUB_REPOSITORY)");

  const npmCheck = await npmVersionExists(packageName, version, cwd);
  const gh = await getGithubReleaseByTag({ owner, repo: name, tag, token: process.env.GITHUB_TOKEN || "" });

  const ghCheck = {
    ok: !!gh.ok,
    status: gh.status || 0,
    releaseName: gh.ok ? String(gh.data?.name || "") : "",
    assetsCount: gh.ok ? (Array.isArray(gh.data?.assets) ? gh.data.assets.length : 0) : 0,
    error: gh.ok ? null : String(gh.error || "")
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
      githubRelease: ghCheck
    },
    ok: npmCheck.ok && ghCheck.ok
  };

  if (format === "json") process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  else process.stdout.write(md(report));

  if (!report.ok) process.exitCode = 1;
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e) + "\n");
  process.exitCode = 1;
});
