#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs/promises";
import { analyzeChangelog } from "../src/core/changelog.js";

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

function toMd(report) {
  const lines = [];
  lines.push("# CHANGELOG lint");
  lines.push("");
  lines.push(`- headingCount: ${report.headingCount}`);
  lines.push(`- duplicateVersions: ${report.duplicates.length}`);
  lines.push(`- nonNormalizedHeadings: ${report.nonNormalized.length}`);
  lines.push(`- result: ${report.ok ? "OK" : "FAIL"}`);
  if (report.standardized?.resultCode) lines.push(`- resultCode: ${report.standardized.resultCode}`);
  if (Array.isArray(report.standardized?.failureCodes) && report.standardized.failureCodes.length > 0) {
    lines.push(`- failureCodes: ${report.standardized.failureCodes.join(",")}`);
  }
  if (report.duplicates.length) {
    lines.push("");
    lines.push("## Duplicate Versions");
    for (const d of report.duplicates) lines.push(`- ${d.version}: lines ${d.lines.join(", ")}`);
  }
  if (report.nonNormalized.length) {
    lines.push("");
    lines.push("## Non-normalized Headings");
    for (const n of report.nonNormalized) lines.push(`- line ${n.line}: [${n.version}] (avoid v-prefix)`);
  }
  return lines.join("\n") + "\n";
}

function buildStandardized(report) {
  const failures = [];
  if (Array.isArray(report.duplicates) && report.duplicates.length > 0) {
    failures.push({
      check: "duplicates",
      code: "CHANGELOG_DUPLICATE_VERSION",
      message: `found ${report.duplicates.length} duplicate version heading group(s)`,
      retryable: false
    });
  }
  if (Array.isArray(report.nonNormalized) && report.nonNormalized.length > 0) {
    failures.push({
      check: "nonNormalized",
      code: "CHANGELOG_NON_NORMALIZED_HEADING",
      message: `found ${report.nonNormalized.length} non-normalized heading(s)`,
      retryable: false
    });
  }
  const checkStatuses = {
    duplicates: failures.some((x) => x.check === "duplicates") ? "fail" : "pass",
    nonNormalized: failures.some((x) => x.check === "nonNormalized") ? "fail" : "pass"
  };
  const checkEntries = Object.entries(checkStatuses);
  return {
    schema: 1,
    status: report.ok ? "pass" : "fail",
    resultCode: report.ok ? "CHANGELOG_LINT_OK" : "CHANGELOG_LINT_FAIL",
    summary: {
      totalChecks: checkEntries.length,
      passCount: checkEntries.filter(([, status]) => status === "pass").length,
      failCount: checkEntries.filter(([, status]) => status === "fail").length
    },
    checkStatuses,
    failureCodes: failures.map((failure) => failure.code),
    failures
  };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const root = flags.root ? path.resolve(flags.root) : process.cwd();
  const format = String(flags.format || "md").toLowerCase();
  if (!["md", "json"].includes(format)) throw new Error("format must be md|json");
  const file = path.join(root, "CHANGELOG.md");
  const content = await fs.readFile(file, "utf8");
  const report = analyzeChangelog(content);
  report.standardized = buildStandardized(report);

  if (format === "json") process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  else process.stdout.write(toMd(report));

  if (!report.ok) process.exitCode = 1;
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e) + "\n");
  process.exitCode = 1;
});
