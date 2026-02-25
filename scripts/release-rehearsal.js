#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs/promises";
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

async function execStep({ name, cmd, args, cwd, optional = false, skipReason = "", timeoutMs = 0 }) {
  if (skipReason) {
    return {
      name,
      status: "skipped",
      optional,
      durationMs: 0,
      reason: skipReason
    };
  }

  const t0 = Date.now();
  try {
    const r = await run(cmd, args, cwd, { timeoutMs });
    const timedOut = timeoutMs > 0 && r.signal === "SIGTERM" && r.code !== 0;
    const ok = r.code === 0;
    return {
      name,
      status: ok ? "pass" : "fail",
      optional,
      durationMs: Date.now() - t0,
      code: r.code,
      error: ok ? "" : timedOut ? `timed out after ${timeoutMs}ms` : String(r.err || r.out || "unknown error"),
      out: String(r.out || ""),
      err: String(r.err || ""),
      timedOut
    };
  } catch (e) {
    return {
      name,
      status: "fail",
      optional,
      durationMs: Date.now() - t0,
      code: -1,
      error: String(e?.message || e)
    };
  }
}

function toMd(report) {
  const lines = [];
  lines.push("# rmemo Release Rehearsal");
  lines.push("");
  lines.push(`- root: ${report.root}`);
  lines.push(`- generatedAt: ${report.generatedAt}`);
  lines.push(`- version: ${report.version}`);
  lines.push(`- outDir: ${report.outDir}`);
  lines.push(`- summary: pass=${report.summary.pass} fail=${report.summary.fail} skipped=${report.summary.skipped}`);
  lines.push(`- result: ${report.ok ? "READY" : "NOT READY"}`);
  lines.push("");

  lines.push("## Steps");
  lines.push("");
  for (const s of report.steps) {
    lines.push(`- ${s.name}: ${s.status}`);
    if (s.reason) lines.push(`  - reason: ${s.reason}`);
    if (s.code !== undefined) lines.push(`  - exitCode: ${s.code}`);
    if (s.durationMs !== undefined) lines.push(`  - durationMs: ${s.durationMs}`);
    if (s.error) lines.push(`  - error: ${String(s.error).trim().split("\n")[0]}`);
  }

  lines.push("");
  lines.push("## Generated Files");
  lines.push("");
  for (const file of report.files) lines.push(`- ${file}`);

  return lines.join("\n") + "\n";
}

function toSummary(report) {
  const failedSteps = report.steps
    .filter((s) => s.status === "fail")
    .map((s) => ({
      name: s.name,
      optional: !!s.optional,
      code: s.code,
      timedOut: !!s.timedOut,
      error: String(s.error || "").trim()
    }));

  return {
    schema: 1,
    generatedAt: report.generatedAt,
    root: report.root,
    outDir: report.outDir,
    version: report.version,
    tag: report.tag,
    repo: report.repo,
    ok: report.ok,
    summary: report.summary,
    failedSteps
  };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const root = flags.root ? path.resolve(flags.root) : process.cwd();
  const outDir = flags["out-dir"] ? path.resolve(root, String(flags["out-dir"])) : path.join(root, "artifacts");
  const summaryOut = flags["summary-out"] ? path.resolve(root, String(flags["summary-out"])) : "";
  const format = String(flags.format || "md").toLowerCase();
  const skipHealth = flags["skip-health"] === "true";
  const allowDirty = flags["allow-dirty"] === "true";
  const skipTests = flags["skip-tests"] === "true";
  const healthTimeoutMs = Math.max(1000, Number(flags["health-timeout-ms"] || 15000));
  const healthGithubRetries = Math.max(0, Number(flags["health-github-retries"] || 2));
  const healthGithubRetryDelayMs = Math.max(0, Number(flags["health-github-retry-delay-ms"] || 1000));

  if (![
    "md",
    "json"
  ].includes(format)) throw new Error("format must be md|json");

  const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  const version = String(flags.version || pkg.version || "").trim();
  if (!version) throw new Error("version is required (--version or package.json version)");

  await fs.mkdir(outDir, { recursive: true });

  const files = {
    notesMd: path.join(outDir, "release-notes.md"),
    readyMd: path.join(outDir, "release-ready.md"),
    readyJson: path.join(outDir, "release-ready.json"),
    healthMd: path.join(outDir, "release-health.md"),
    healthJson: path.join(outDir, "release-health.json"),
    rehearsalMd: path.join(outDir, "release-rehearsal.md"),
    rehearsalJson: path.join(outDir, "release-rehearsal.json")
  };

  const steps = [];
  steps.push(
    await execStep({
      name: "release-notes",
      cmd: "node",
      args: ["scripts/release-notes.js", "--version", version, "--out", files.notesMd],
      cwd: root
    })
  );

  const readyArgs = ["scripts/release-ready.js"];
  if (allowDirty) readyArgs.push("--allow-dirty");
  if (skipTests) readyArgs.push("--skip-tests");

  steps.push(
    await execStep({
      name: "release-ready-md",
      cmd: "node",
      args: [...readyArgs, "--format", "md", "--out", files.readyMd],
      cwd: root
    })
  );
  steps.push(
    await execStep({
      name: "release-ready-json",
      cmd: "node",
      args: [...readyArgs, "--format", "json", "--out", files.readyJson],
      cwd: root
    })
  );

  const repo = String(flags.repo || process.env.GITHUB_REPOSITORY || "").trim();
  const tag = String(flags.tag || `v${version}`).trim();
  const healthSkipReason = skipHealth ? "skip-health=true" : !repo ? "missing repo (use --repo owner/name or GITHUB_REPOSITORY)" : "";

  steps.push(
    await execStep({
      name: "release-health-md",
      cmd: "node",
      args: [
        "scripts/release-health.js",
        "--repo",
        repo,
        "--version",
        version,
        "--tag",
        tag,
        "--format",
        "md",
        "--timeout-ms",
        String(healthTimeoutMs),
        "--github-retries",
        String(healthGithubRetries),
        "--github-retry-delay-ms",
        String(healthGithubRetryDelayMs)
      ],
      cwd: root,
      optional: true,
      skipReason: healthSkipReason,
      timeoutMs: healthTimeoutMs + 2000
    })
  );
  steps.push(
    await execStep({
      name: "release-health-json",
      cmd: "node",
      args: [
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
        String(healthTimeoutMs),
        "--github-retries",
        String(healthGithubRetries),
        "--github-retry-delay-ms",
        String(healthGithubRetryDelayMs)
      ],
      cwd: root,
      optional: true,
      skipReason: healthSkipReason,
      timeoutMs: healthTimeoutMs + 2000
    })
  );

  const healthMdStep = steps.find((x) => x.name === "release-health-md");
  const healthJsonStep = steps.find((x) => x.name === "release-health-json");

  if (healthMdStep?.status === "pass") {
    await fs.writeFile(files.healthMd, healthMdStep.out || "", "utf8");
  } else if (healthMdStep?.status === "skipped") {
    await fs.writeFile(files.healthMd, `# rmemo Release Health\n\n- status: skipped\n- reason: ${healthMdStep.reason}\n`, "utf8");
  } else if (healthMdStep?.status === "fail") {
    await fs.writeFile(files.healthMd, `# rmemo Release Health\n\n- status: fail\n- error: ${(healthMdStep.error || "").trim()}\n`, "utf8");
  }

  if (healthJsonStep?.status === "pass") {
    await fs.writeFile(files.healthJson, healthJsonStep.out || "{}\n", "utf8");
  } else if (healthJsonStep?.status === "skipped") {
    await fs.writeFile(
      files.healthJson,
      JSON.stringify({ schema: 1, skipped: true, reason: healthJsonStep.reason, version, tag, repo }, null, 2) + "\n",
      "utf8"
    );
  } else if (healthJsonStep?.status === "fail") {
    await fs.writeFile(
      files.healthJson,
      JSON.stringify({ schema: 1, skipped: false, ok: false, reason: "release-health failed", error: healthJsonStep.error || "" }, null, 2) +
        "\n",
      "utf8"
    );
  }

  const summary = {
    pass: steps.filter((s) => s.status === "pass").length,
    fail: steps.filter((s) => s.status === "fail").length,
    skipped: steps.filter((s) => s.status === "skipped").length
  };

  const report = {
    schema: 1,
    root,
    outDir,
    version,
    tag,
    repo,
    generatedAt: new Date().toISOString(),
    options: { skipHealth, allowDirty, skipTests, healthTimeoutMs, healthGithubRetries, healthGithubRetryDelayMs },
    steps,
    files: Object.values(files),
    summary,
    ok: summary.fail === 0
  };

  const md = toMd(report);
  const json = JSON.stringify(report, null, 2) + "\n";
  await fs.writeFile(files.rehearsalMd, md, "utf8");
  await fs.writeFile(files.rehearsalJson, json, "utf8");
  if (summaryOut) {
    const summary = toSummary(report);
    await fs.mkdir(path.dirname(summaryOut), { recursive: true });
    await fs.writeFile(summaryOut, JSON.stringify(summary, null, 2) + "\n", "utf8");
  }

  process.stdout.write(format === "json" ? json : md);
  if (!report.ok) process.exitCode = 1;
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e) + "\n");
  process.exitCode = 1;
});
