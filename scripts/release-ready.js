#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";

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

function run(cmd, args, cwd) {
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

async function check(name, cmd, args, cwd, validate) {
  const t0 = Date.now();
  try {
    const r = await run(cmd, args, cwd);
    const customErr = validate ? validate(r) : null;
    if (r.code !== 0 || customErr) {
      return { name, ok: false, durationMs: Date.now() - t0, code: r.code, error: customErr || r.err || r.out };
    }
    return { name, ok: true, durationMs: Date.now() - t0, code: r.code };
  } catch (e) {
    return { name, ok: false, durationMs: Date.now() - t0, code: -1, error: String(e?.message || e) };
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

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const root = flags.root ? path.resolve(flags.root) : process.cwd();
  const format = String(flags.format || "md").toLowerCase();
  const allowDirty = flags["allow-dirty"] === "true";
  const skipTests = flags["skip-tests"] === "true";
  if (!["md", "json"].includes(format)) throw new Error("format must be md|json");

  const checks = [];
  checks.push(
    await check("git-clean", "git", ["status", "--short"], root, (r) => {
      if (allowDirty) return null;
      return String(r.out || "").trim() ? "working tree is not clean" : null;
    })
  );
  if (skipTests) {
    checks.push({ name: "node-test", status: "skipped", durationMs: 0, reason: "skip-tests=true" });
  } else {
    const t = await check("node-test", "node", ["--test"], root);
    checks.push(t);
  }
  checks.push(await check("pack-dry", "npm", ["run", "pack:dry"], root));
  checks.push(await check("contract-check", "node", ["bin/rmemo.js", "contract", "check", "--format", "json"], root));
  checks.push(await check("regression-matrix", "npm", ["run", "verify:matrix"], root));

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
    options: { allowDirty, skipTests },
    checks: normalized,
    summary,
    ok: summary.fail === 0
  };

  if (format === "json") process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  else process.stdout.write(toMd(report) + "\n");

  if (!report.ok) process.exitCode = 1;
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e) + "\n");
  process.exitCode = 1;
});
