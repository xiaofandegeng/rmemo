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
  function renderFailureSignals(lines) {
    const failures = Array.isArray(report.standardized?.failures) ? report.standardized.failures : [];
    if (failures.length === 0) return;

    lines.push("");
    lines.push("## Failure Signals");
    lines.push("");

    for (const failure of failures) {
      const step = String(failure?.step || "").trim();
      const check = String(failure?.check || "").trim();
      const code = String(failure?.code || "").trim() || "STEP_FAILED";
      const target = step || check || "unknown";
      lines.push(`- ${target}: ${code}`);
      if (step && check) lines.push(`  - check: ${check}`);
      if (failure?.category) lines.push(`  - category: ${String(failure.category)}`);
      if (typeof failure?.retryable === "boolean") lines.push(`  - retryable: ${failure.retryable}`);
    }
  }

  const lines = [];
  lines.push("# rmemo Release Rehearsal");
  lines.push("");
  lines.push(`- root: ${report.root}`);
  lines.push(`- generatedAt: ${report.generatedAt}`);
  lines.push(`- version: ${report.version}`);
  lines.push(`- outDir: ${report.outDir}`);
  lines.push(`- summary: pass=${report.summary.pass} fail=${report.summary.fail} skipped=${report.summary.skipped}`);
  lines.push(`- result: ${report.ok ? "READY" : "NOT READY"}`);
  if (report.standardized?.resultCode) lines.push(`- resultCode: ${report.standardized.resultCode}`);
  if (Array.isArray(report.standardized?.failureCodes) && report.standardized.failureCodes.length > 0) {
    lines.push(`- failureCodes: ${report.standardized.failureCodes.join(",")}`);
  }
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

  renderFailureSignals(lines);

  lines.push("");
  lines.push("## Generated Files");
  lines.push("");
  for (const file of report.files) lines.push(`- ${file}`);

  return lines.join("\n") + "\n";
}

function toSummary(report) {
  function parseJsonSafe(input) {
    const raw = String(input || "").trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function parseStepPayload(step) {
    if (!step) return null;
    const parsedOut = parseJsonSafe(step.out);
    if (parsedOut && typeof parsedOut === "object") return parsedOut;
    const parsedErr = parseJsonSafe(step.err);
    if (parsedErr && typeof parsedErr === "object") return parsedErr;
    return null;
  }

  function normalizeFailureCodes(input) {
    if (!Array.isArray(input)) return [];
    return input.map((x) => String(x)).filter(Boolean);
  }

  function extractStepFailureDetail(step) {
    const payload = parseStepPayload(step);
    if (!payload || typeof payload !== "object") {
      return { resultCode: "", failureCodes: [], failures: [] };
    }

    const standardized = payload.standardized && typeof payload.standardized === "object" ? payload.standardized : null;
    const resultCode = String(standardized?.resultCode || payload.resultCode || "").trim();
    const failureCodes = normalizeFailureCodes(standardized?.failureCodes || payload.failureCodes);
    const failures = Array.isArray(standardized?.failures)
      ? standardized.failures
          .map((x) => ({
            check: String(x?.check || ""),
            code: String(x?.code || ""),
            category: String(x?.category || ""),
            retryable: typeof x?.retryable === "boolean" ? x.retryable : null
          }))
          .filter((x) => x.code)
      : [];

    return { resultCode, failureCodes, failures };
  }

  function extractHealthStandardized() {
    const step = report.steps.find((s) => s.name === "release-health-json" && (s.status === "pass" || s.status === "fail"));
    if (!step) return null;
    const parsedOut = parseJsonSafe(step.out);
    if (parsedOut?.standardized && typeof parsedOut.standardized === "object") return parsedOut.standardized;
    const parsedErr = parseJsonSafe(step.err);
    if (parsedErr?.standardized && typeof parsedErr.standardized === "object") return parsedErr.standardized;
    return null;
  }

  function extractArchiveResult() {
    const step = report.steps.find((s) => s.name === "release-archive");
    if (!step) return null;
    const parsedOut = parseJsonSafe(step.out);
    const parsedErr = parseJsonSafe(step.err);
    const payload = parsedOut || parsedErr || null;
    return {
      status: step.status,
      stepExitCode: step.code,
      snapshotId: String(payload?.snapshotId || "").trim(),
      ok: step.status === "pass" && payload?.ok !== false
    };
  }

  function extractArchiveVerifyResult() {
    const step = report.steps.find((s) => s.name === "release-archive-verify");
    if (!step) return null;
    const parsedOut = parseJsonSafe(step.out);
    const parsedErr = parseJsonSafe(step.err);
    const payload = parsedOut || parsedErr || null;
    const requiredFiles = Array.isArray(payload?.requiredFiles)
      ? payload.requiredFiles.map((x) => String(x)).filter(Boolean)
      : [];
    const missingRequiredFiles = Array.isArray(payload?.missingRequiredFiles)
      ? payload.missingRequiredFiles.map((x) => String(x)).filter(Boolean)
      : [];
    return {
      status: step.status,
      stepExitCode: step.code,
      ok: step.status === "pass" && payload?.ok !== false,
      requiredFiles,
      missingRequiredFiles
    };
  }

  const hints = {
    timeout: "Increase timeout or inspect upstream command latency before rerun.",
    network: "Retry after network/platform recovers; keep github retries enabled.",
    auth: "Check token/permission scopes before rerun.",
    config: "Fix command flags/environment inputs before rerun.",
    archive: "Inspect artifacts completeness and archive parameters before rerun.",
    unknown: "Inspect release-rehearsal step stderr/stdout for the failing step."
  };

  function classifyFailure(step) {
    const msg = String(step.error || "").toLowerCase();
    if (step.timedOut || /timed out|timeout/.test(msg)) {
      return { category: "timeout", code: "STEP_TIMEOUT", retryable: true };
    }
    if (step.name === "release-archive") {
      return { category: "archive", code: "RELEASE_ARCHIVE_FAILED", retryable: false };
    }
    if (step.name === "release-archive-verify") {
      return { category: "archive", code: "RELEASE_ARCHIVE_VERIFY_FAILED", retryable: false };
    }
    if (/econn|enotfound|eai_again|429|5\d\d|network|socket|request timeout|github release unavailable/.test(msg)) {
      return { category: "network", code: "NETWORK_UNAVAILABLE", retryable: true };
    }
    if (/401|403|forbidden|unauthorized|auth|token|permission/.test(msg)) {
      return { category: "auth", code: "AUTH_FAILED", retryable: false };
    }
    if (/missing repo|version is required|format must be|invalid/.test(msg)) {
      return { category: "config", code: "INPUT_INVALID", retryable: false };
    }
    return { category: "unknown", code: "STEP_FAILED", retryable: false };
  }

  const failedSteps = report.steps
    .filter((s) => s.status === "fail")
    .map((s) => {
      const classified = classifyFailure(s);
      const stepFailureDetail = extractStepFailureDetail(s);
      return {
        ...classified,
        name: s.name,
        optional: !!s.optional,
        stepExitCode: s.code,
        timedOut: !!s.timedOut,
        error: String(s.error || "").trim(),
        downstreamResultCode: stepFailureDetail.resultCode,
        downstreamFailureCodes: stepFailureDetail.failureCodes,
        downstreamFailures: stepFailureDetail.failures,
        nextAction: hints[classified.category] || hints.unknown
      };
    });

  const failureBreakdown = failedSteps.reduce((acc, step) => {
    acc[step.category] = Number(acc[step.category] || 0) + 1;
    return acc;
  }, {});
  const actionHints = Array.from(new Set(failedSteps.map((x) => x.nextAction).filter(Boolean)));
  const retryableFailures = failedSteps.filter((x) => x.retryable).length;
  const healthStandardized = extractHealthStandardized();
  const archive = extractArchiveResult();
  const archiveVerify = extractArchiveVerifyResult();
  const healthFailureCodes = Array.isArray(healthStandardized?.failureCodes)
    ? healthStandardized.failureCodes.map((x) => String(x)).filter(Boolean)
    : [];
  const healthFailures = Array.isArray(healthStandardized?.failures)
    ? healthStandardized.failures.map((x) => ({
        check: String(x?.check || ""),
        code: String(x?.code || ""),
        message: String(x?.message || ""),
        retryable: !!x?.retryable
      }))
    : [];
  const downstreamFailureCodes = failedSteps.flatMap((x) => normalizeFailureCodes(x.downstreamFailureCodes));
  const summaryFailureCodes = Array.from(new Set([...failedSteps.map((x) => x.code), ...downstreamFailureCodes, ...healthFailureCodes]));
  const checkStatuses = Object.fromEntries(report.steps.map((s) => [s.name, s.status]));
  const standardizedStepFailures = failedSteps.flatMap((x) => {
    const detailFailures = x.name === "release-health-json"
      ? []
      : Array.isArray(x.downstreamFailures)
        ? x.downstreamFailures
        : [];

    const mappedDetailFailures = detailFailures
      .map((detail) => ({
        step: x.name,
        code: String(detail.code || ""),
        category: String(detail.category || x.category || "step"),
        ...(detail.check ? { check: String(detail.check) } : {}),
        retryable: typeof detail.retryable === "boolean" ? detail.retryable : !!x.retryable
      }))
      .filter((detail) => detail.code);

    return [
      {
        step: x.name,
        code: x.code,
        category: x.category,
        retryable: !!x.retryable
      },
      ...mappedDetailFailures
    ];
  });
  const standardizedHealthFailures = healthFailures.map((x) => ({
    step: "release-health-json",
    code: x.code,
    category: "health",
    check: x.check,
    retryable: !!x.retryable
  }));
  const standardized = {
    schema: 1,
    status: report.ok ? "pass" : "fail",
    resultCode: report.ok ? "RELEASE_REHEARSAL_SUMMARY_OK" : "RELEASE_REHEARSAL_SUMMARY_FAIL",
    summary: {
      totalSteps: report.steps.length,
      passCount: report.summary.pass,
      failCount: report.summary.fail,
      skippedCount: report.summary.skipped
    },
    checkStatuses,
    failureCodes: summaryFailureCodes,
    failures: [...standardizedStepFailures, ...standardizedHealthFailures]
  };

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
    failedSteps,
    failureBreakdown,
    retryableFailures,
    actionHints,
    archive: archive || archiveVerify
      ? {
          ...(archive ? { snapshotId: archive.snapshotId, archiveStep: { status: archive.status, ok: archive.ok, stepExitCode: archive.stepExitCode } } : {}),
          ...(archiveVerify
            ? {
                verify: {
                  status: archiveVerify.status,
                  ok: archiveVerify.ok,
                  stepExitCode: archiveVerify.stepExitCode,
                  requiredFiles: archiveVerify.requiredFiles,
                  missingRequiredFiles: archiveVerify.missingRequiredFiles
                }
              }
            : {})
        }
      : null,
    health: healthStandardized
      ? {
          status: String(healthStandardized.status || ""),
          resultCode: String(healthStandardized.resultCode || ""),
          failureCodes: healthFailureCodes,
          failures: healthFailures
        }
      : null,
    summaryFailureCodes,
    standardized
  };
}

function buildReport({ root, outDir, version, tag, repo, options, steps, files }) {
  const summary = {
    pass: steps.filter((s) => s.status === "pass").length,
    fail: steps.filter((s) => s.status === "fail").length,
    skipped: steps.filter((s) => s.status === "skipped").length
  };

  return {
    schema: 1,
    root,
    outDir,
    version,
    tag,
    repo,
    generatedAt: new Date().toISOString(),
    options,
    steps,
    files: Object.values(files),
    summary,
    ok: summary.fail === 0
  };
}

function toSummaryMd(summary) {
  const lines = [];
  const failureBreakdown = summary.failureBreakdown && typeof summary.failureBreakdown === "object" ? summary.failureBreakdown : {};
  const failureBreakdownEntries = Object.entries(failureBreakdown).filter(([, count]) => Number(count) > 0);
  lines.push("# rmemo Release Rehearsal Summary");
  lines.push("");
  lines.push(`- generatedAt: ${summary.generatedAt}`);
  lines.push(`- version: ${summary.version}`);
  lines.push(`- result: ${summary.ok ? "READY" : "NOT READY"}`);
  if (summary.standardized?.resultCode) lines.push(`- resultCode: ${summary.standardized.resultCode}`);
  if (Array.isArray(summary.summaryFailureCodes) && summary.summaryFailureCodes.length > 0) {
    lines.push(`- failureCodes: ${summary.summaryFailureCodes.join(",")}`);
  }
  lines.push(
    `- summary: pass=${Number(summary.summary?.pass || 0)} fail=${Number(summary.summary?.fail || 0)} skipped=${Number(summary.summary?.skipped || 0)}`
  );
  lines.push(`- retryableFailures: ${Number(summary.retryableFailures || 0)}`);

  if (failureBreakdownEntries.length > 0) {
    lines.push("");
    lines.push("## Failure Breakdown");
    lines.push("");
    for (const [category, count] of failureBreakdownEntries) {
      lines.push(`- ${category}: ${Number(count)}`);
    }
  }

  if (Array.isArray(summary.failedSteps) && summary.failedSteps.length > 0) {
    lines.push("");
    lines.push("## Failed Steps");
    lines.push("");
    for (const step of summary.failedSteps) {
      const name = String(step?.name || "unknown");
      const code = String(step?.code || "STEP_FAILED");
      lines.push(`- ${name}: ${code}`);
      if (step?.category) lines.push(`  - category: ${String(step.category)}`);
      if (typeof step?.retryable === "boolean") lines.push(`  - retryable: ${step.retryable}`);
      if (step?.downstreamResultCode) lines.push(`  - downstreamResultCode: ${String(step.downstreamResultCode)}`);
      if (Array.isArray(step?.downstreamFailureCodes) && step.downstreamFailureCodes.length > 0) {
        lines.push(`  - downstreamFailureCodes: ${step.downstreamFailureCodes.join(",")}`);
      }
    }
  }

  if (summary.health && typeof summary.health === "object") {
    lines.push("");
    lines.push("## Health Signals");
    lines.push("");
    lines.push(`- status: ${String(summary.health.status || "unknown")}`);
    if (summary.health.resultCode) lines.push(`- resultCode: ${String(summary.health.resultCode)}`);
    if (Array.isArray(summary.health.failureCodes) && summary.health.failureCodes.length > 0) {
      lines.push(`- failureCodes: ${summary.health.failureCodes.join(",")}`);
    }
  }

  if (summary.archive && typeof summary.archive === "object") {
    lines.push("");
    lines.push("## Archive");
    lines.push("");
    if (summary.archive.snapshotId) lines.push(`- snapshotId: ${String(summary.archive.snapshotId)}`);
    if (summary.archive.archiveStep && typeof summary.archive.archiveStep === "object") {
      lines.push(`- archiveStep: status=${String(summary.archive.archiveStep.status || "")} ok=${String(!!summary.archive.archiveStep.ok)}`);
    }
    if (summary.archive.verify && typeof summary.archive.verify === "object") {
      lines.push(`- verify: status=${String(summary.archive.verify.status || "")} ok=${String(!!summary.archive.verify.ok)}`);
      if (Array.isArray(summary.archive.verify.missingRequiredFiles) && summary.archive.verify.missingRequiredFiles.length > 0) {
        lines.push(`- missingRequiredFiles: ${summary.archive.verify.missingRequiredFiles.join(",")}`);
      }
    }
  }

  if (Array.isArray(summary.actionHints) && summary.actionHints.length > 0) {
    lines.push("");
    lines.push("## Action Hints");
    lines.push("");
    for (const hint of summary.actionHints) lines.push(`- ${hint}`);
  }

  return `${lines.join("\n")}\n`;
}

async function writeRehearsalOutputs({ files, report, summaryOut, summaryFormat, summaryJsonCompatOut = "" }) {
  const summary = toSummary(report);
  report.standardized = summary.standardized;
  report.summaryFailureCodes = summary.summaryFailureCodes;
  const md = toMd(report);
  const json = JSON.stringify(report, null, 2) + "\n";
  const summaryJsonBody = JSON.stringify(summary, null, 2) + "\n";
  await fs.writeFile(files.rehearsalMd, md, "utf8");
  await fs.writeFile(files.rehearsalJson, json, "utf8");
  if (summaryOut) {
    await fs.mkdir(path.dirname(summaryOut), { recursive: true });
    const summaryBody = summaryFormat === "md" ? toSummaryMd(summary) : summaryJsonBody;
    await fs.writeFile(summaryOut, summaryBody, "utf8");
  }
  if (summaryJsonCompatOut) {
    const sameAsPrimary = summaryOut && path.resolve(summaryOut) === path.resolve(summaryJsonCompatOut);
    if (!sameAsPrimary) {
      await fs.mkdir(path.dirname(summaryJsonCompatOut), { recursive: true });
      await fs.writeFile(summaryJsonCompatOut, summaryJsonBody, "utf8");
    }
  }
  return { md, json };
}

async function main() {
  function parseJsonSafe(input) {
    const raw = String(input || "").trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const flags = parseFlags(process.argv.slice(2));
  const root = flags.root ? path.resolve(flags.root) : process.cwd();
  const outDir = flags["out-dir"] ? path.resolve(root, String(flags["out-dir"])) : path.join(root, "artifacts");
  const format = String(flags.format || "md").toLowerCase();
  const skipHealth = flags["skip-health"] === "true";
  const allowDirty = flags["allow-dirty"] === "true";
  const skipTests = flags["skip-tests"] === "true";
  const archive = flags.archive === "true";
  const archiveVerify = archive && flags["archive-verify"] === "true";
  const summaryFormatFlag = String(flags["summary-format"] || "").trim().toLowerCase();
  const archiveSnapshotId = String(flags["archive-snapshot-id"] || flags["snapshot-id"] || "").trim();
  const archiveRequirePreset = String(flags["archive-require-preset"] || "").trim();
  const archiveRequireFiles = String(flags["archive-require-files"] || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (archiveVerify && archiveRequirePreset && archiveRequireFiles.length > 0) {
    throw new Error("cannot combine --archive-require-files with --archive-require-preset");
  }
  const effectiveArchiveRequirePreset = archiveVerify
    ? archiveRequirePreset || (archiveRequireFiles.length === 0 ? "rehearsal-archive-verify" : "")
    : "";
  const effectiveArchiveRequireFiles = archiveVerify && !effectiveArchiveRequirePreset ? archiveRequireFiles : [];
  const archiveRetentionDays = Math.max(1, Number(flags["archive-retention-days"] || flags["retention-days"] || 30));
  const archiveMaxSnapshotsPerVersion = Math.max(
    1,
    Number(flags["archive-max-snapshots-per-version"] || flags["max-snapshots-per-version"] || 20)
  );
  const summaryOut = flags["summary-out"]
    ? path.resolve(root, String(flags["summary-out"]))
    : archive
      ? path.join(outDir, summaryFormatFlag === "md" ? "release-summary.md" : "release-summary.json")
      : "";
  const summaryJsonCompatOut = archive ? path.join(outDir, "release-summary.json") : "";
  const summaryOutLower = String(summaryOut || "").toLowerCase();
  const summaryOutExtFormat = summaryOutLower.endsWith(".md")
    ? "md"
    : summaryOutLower.endsWith(".json")
      ? "json"
      : "";
  const inferredSummaryFormat = summaryOutExtFormat || "json";
  const summaryFormat = summaryFormatFlag || inferredSummaryFormat;
  const healthTimeoutMs = Math.max(1000, Number(flags["health-timeout-ms"] || 15000));
  const healthGithubRetries = Math.max(0, Number(flags["health-github-retries"] || 2));
  const healthGithubRetryDelayMs = Math.max(0, Number(flags["health-github-retry-delay-ms"] || 1000));

  if (![
    "md",
    "json"
  ].includes(format)) throw new Error("format must be md|json");
  if (![
    "md",
    "json"
  ].includes(summaryFormat)) throw new Error("summary-format must be md|json");
  if (summaryOut && summaryFormatFlag && summaryOutExtFormat && summaryOutExtFormat !== summaryFormatFlag) {
    throw new Error(
      `summary-format (${summaryFormatFlag}) conflicts with summary-out extension (${summaryOutExtFormat}); keep them consistent`
    );
  }

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
    rehearsalJson: path.join(outDir, "release-rehearsal.json"),
    ...(archive ? { archiveJson: path.join(outDir, "release-archive.json") } : {}),
    ...(archiveVerify ? { archiveVerifyJson: path.join(outDir, "release-archive-verify.json") } : {})
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

  const options = {
    skipHealth,
    allowDirty,
    skipTests,
    archive,
    summaryOut,
    summaryJsonCompatOut,
    summaryFormat,
    healthTimeoutMs,
    healthGithubRetries,
    healthGithubRetryDelayMs,
    ...(archive
      ? {
          archiveSnapshotId,
          archiveVerify,
          archiveRequirePreset: effectiveArchiveRequirePreset,
          archiveRequireFiles: effectiveArchiveRequireFiles,
          archiveRetentionDays,
          archiveMaxSnapshotsPerVersion
        }
      : {})
  };

  let report = buildReport({ root, outDir, version, tag, repo, options, steps, files });
  await writeRehearsalOutputs({ files, report, summaryOut, summaryFormat, summaryJsonCompatOut });

  if (archive) {
    const archiveArgs = [
      "scripts/release-archive.js",
      "--root",
      root,
      "--format",
      "json",
      "--version",
      version,
      "--tag",
      tag,
      "--artifacts-dir",
      outDir,
      "--retention-days",
      String(archiveRetentionDays),
      "--max-snapshots-per-version",
      String(archiveMaxSnapshotsPerVersion)
    ];
    if (archiveSnapshotId) archiveArgs.push("--snapshot-id", archiveSnapshotId);

    const archiveStep = await execStep({
      name: "release-archive",
      cmd: "node",
      args: archiveArgs,
      cwd: root
    });
    steps.push(archiveStep);

    if (files.archiveJson) {
      let archiveJson = "";
      if (archiveStep.status === "pass" && String(archiveStep.out || "").trim()) {
        archiveJson = `${String(archiveStep.out || "").trim()}\n`;
      } else if (String(archiveStep.out || "").trim()) {
        archiveJson = `${String(archiveStep.out || "").trim()}\n`;
      } else {
        archiveJson =
          JSON.stringify(
            {
              schema: 1,
              ok: false,
              reason: "release-archive failed",
              error: String(archiveStep.error || "").trim()
            },
            null,
            2
          ) + "\n";
      }
      await fs.writeFile(files.archiveJson, archiveJson, "utf8");
    }

    if (archiveVerify) {
      const archiveOut = parseJsonSafe(archiveStep.out);
      const verifySnapshotId = String(archiveOut?.snapshotId || archiveSnapshotId || "").trim();
      const archiveVerifyStep = await execStep({
        name: "release-archive-verify",
        cmd: "node",
        args: [
          "scripts/release-archive-find.js",
          "--root",
          root,
          "--artifacts-dir",
          outDir,
          "--version",
          version,
          "--format",
          "json",
          ...(effectiveArchiveRequirePreset
            ? ["--require-preset", effectiveArchiveRequirePreset]
            : ["--require-files", effectiveArchiveRequireFiles.join(",")]),
          ...(verifySnapshotId ? ["--snapshot-id", verifySnapshotId] : [])
        ],
        cwd: root,
        skipReason: archiveStep.status === "pass" ? "" : "release-archive failed"
      });
      steps.push(archiveVerifyStep);

      if (files.archiveVerifyJson) {
        let verifyJson = "";
        if (archiveVerifyStep.status === "pass" && String(archiveVerifyStep.out || "").trim()) {
          verifyJson = `${String(archiveVerifyStep.out || "").trim()}\n`;
        } else if (archiveVerifyStep.status === "skipped") {
          verifyJson = JSON.stringify({ schema: 1, ok: false, skipped: true, reason: archiveVerifyStep.reason }, null, 2) + "\n";
        } else if (String(archiveVerifyStep.out || "").trim()) {
          verifyJson = `${String(archiveVerifyStep.out || "").trim()}\n`;
        } else {
          verifyJson =
            JSON.stringify(
              {
                schema: 1,
                ok: false,
                reason: "release-archive-verify failed",
                error: String(archiveVerifyStep.error || "").trim()
              },
              null,
              2
            ) + "\n";
        }
        await fs.writeFile(files.archiveVerifyJson, verifyJson, "utf8");
      }
    }

    report = buildReport({ root, outDir, version, tag, repo, options, steps, files });
    await writeRehearsalOutputs({ files, report, summaryOut, summaryFormat, summaryJsonCompatOut });
  }

  process.stdout.write(format === "json" ? `${JSON.stringify(report, null, 2)}\n` : toMd(report));
  if (!report.ok) process.exitCode = 1;
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e) + "\n");
  process.exitCode = 1;
});
