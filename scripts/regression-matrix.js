#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import http from "node:http";
import { spawn } from "node:child_process";

function nowMs() {
  return Date.now();
}

function spawnNode(args, opts = {}) {
  const p = spawn(process.execPath, args, { stdio: ["pipe", "pipe", "pipe"], ...opts });
  let out = "";
  let err = "";
  p.stdout.on("data", (d) => (out += d.toString("utf8")));
  p.stderr.on("data", (d) => (err += d.toString("utf8")));
  return { p, getOut: () => out, getErr: () => err };
}

async function runNode(args, opts = {}) {
  const { p, getOut, getErr } = spawnNode(args, { cwd: opts.cwd });
  if (opts.stdin) p.stdin.end(opts.stdin, "utf8");
  else p.stdin.end();
  return new Promise((resolve, reject) => {
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, out: getOut(), err: getErr() }));
  });
}

async function httpGet(url, headers = {}, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers, timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode || 0, body, headers: res.headers }));
    });
    req.on("timeout", () => {
      req.destroy(new Error(`timeout after ${timeoutMs}ms`));
    });
    req.on("error", reject);
  });
}

async function waitFor(fn, timeoutMs = 6000, intervalMs = 80) {
  const start = nowMs();
  while (true) {
    const v = await fn();
    if (v) return v;
    if (nowMs() - start > timeoutMs) throw new Error("timeout waiting for condition");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function parsePortFromListening(out) {
  const m = String(out).match(/Listening:\s+http:\/\/[^:]+:(\d+)/);
  return m ? Number(m[1]) : null;
}

function pass(name, durationMs, meta = {}) {
  return { name, status: "pass", durationMs, ...meta };
}

function fail(name, durationMs, error, meta = {}) {
  return { name, status: "fail", durationMs, error: String(error || "unknown error"), ...meta };
}

function skipped(name, durationMs, reason, meta = {}) {
  return { name, status: "skipped", durationMs, reason: String(reason), ...meta };
}

async function checkCli(bin, root) {
  const t0 = nowMs();
  try {
    const init = await runNode([bin, "--root", root, "--no-git", "init"]);
    if (init.code !== 0) throw new Error(`init failed: ${init.err || init.out}`);
    const st = await runNode([bin, "--root", root, "--format", "json", "status"]);
    if (st.code !== 0) throw new Error(`status failed: ${st.err || st.out}`);
    const j = JSON.parse(st.out);
    if (!j || typeof j !== "object") throw new Error("status json invalid");
    return pass("cli", nowMs() - t0, { checks: ["init", "status --format json"] });
  } catch (e) {
    return fail("cli", nowMs() - t0, e);
  }
}

async function checkApiUi(bin, root) {
  const t0 = nowMs();
  const token = "matrix-token";
  const proc = spawnNode([bin, "--root", root, "--no-git", "serve", "--host", "127.0.0.1", "--port", "0", "--token", token]);
  try {
    const base = await waitFor(async () => {
      const out = proc.getOut();
      const port = parsePortFromListening(out);
      if (!port) {
        const err = proc.getErr();
        if (/EPERM|EACCES|listen/i.test(err)) {
          throw new Error(`serve unavailable in environment: ${err.trim()}`);
        }
        if (proc.p.exitCode !== null && proc.p.exitCode !== 0) {
          throw new Error(`serve exited early: ${err || out}`);
        }
        return null;
      }
      return `http://127.0.0.1:${port}`;
    });
    const health = await httpGet(`${base}/health`, { "x-rmemo-token": token });
    if (health.status !== 200) throw new Error(`/health returned ${health.status}`);
    const status = await httpGet(`${base}/status?format=json`, { "x-rmemo-token": token });
    if (status.status !== 200) throw new Error(`/status returned ${status.status}`);
    const ui = await httpGet(`${base}/ui`);
    if (ui.status !== 200) throw new Error(`/ui returned ${ui.status}`);
    if (!ui.body.includes("rmemo")) throw new Error("/ui body missing marker");
    return pass("api-ui", nowMs() - t0, { checks: ["/health", "/status?format=json", "/ui"] });
  } catch (e) {
    const msg = String(e?.message || e);
    if (/serve unavailable in environment|EPERM|EACCES|listen/i.test(msg)) {
      return skipped("api-ui", nowMs() - t0, msg);
    }
    return fail("api-ui", nowMs() - t0, e);
  } finally {
    try {
      proc.p.kill("SIGTERM");
    } catch {}
  }
}

function parseJsonLines(s) {
  return String(s || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function checkMcp(bin, root) {
  const t0 = nowMs();
  const mcp = spawnNode([bin, "--root", root, "--no-git", "mcp"]);
  try {
    mcp.p.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "matrix", version: "1.0.0" } }
      }) + "\n"
    );
    mcp.p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
    mcp.p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
    await waitFor(async () => {
      const lines = parseJsonLines(mcp.getOut());
      return lines.some((x) => x?.id === 2) ? true : null;
    }, 5000, 50);
    const lines = parseJsonLines(mcp.getOut());
    const toolResp = lines.find((x) => x?.id === 2);
    const tools = toolResp?.result?.tools || [];
    const names = tools.map((x) => x?.name).filter(Boolean);
    if (!names.includes("rmemo_status")) throw new Error("mcp tools missing rmemo_status");
    return pass("mcp", nowMs() - t0, { toolCount: names.length });
  } catch (e) {
    return fail("mcp", nowMs() - t0, e);
  } finally {
    try {
      mcp.p.stdin.end();
    } catch {}
    try {
      mcp.p.kill("SIGTERM");
    } catch {}
  }
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# rmemo Regression Matrix");
  lines.push("");
  lines.push(`- root: ${report.root}`);
  lines.push(`- generatedAt: ${report.generatedAt}`);
  lines.push(`- summary: pass=${report.summary.pass} fail=${report.summary.fail} skipped=${report.summary.skipped}`);
  lines.push("");
  for (const r of report.results) {
    lines.push(`## ${r.name}`);
    lines.push(`- status: ${r.status}`);
    lines.push(`- durationMs: ${r.durationMs}`);
    if (r.reason) lines.push(`- reason: ${r.reason}`);
    if (r.error) lines.push(`- error: ${r.error}`);
    if (Array.isArray(r.checks) && r.checks.length) lines.push(`- checks: ${r.checks.join(", ")}`);
    if (typeof r.toolCount === "number") lines.push(`- toolCount: ${r.toolCount}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

async function main() {
  const argv = process.argv.slice(2);
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

  const root = flags.root ? path.resolve(flags.root) : process.cwd();
  const format = (flags.format || "md").toLowerCase();
  const strict = flags.strict === "true";
  if (!["md", "json"].includes(format)) throw new Error("format must be md|json");

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-matrix-"));
  await fs.writeFile(path.join(tmp, "README.md"), "# matrix\n", "utf8");
  await fs.writeFile(path.join(tmp, "package.json"), JSON.stringify({ name: "matrix", private: true }, null, 2) + "\n", "utf8");

  const bin = path.join(root, "bin", "rmemo.js");
  const results = [];
  results.push(await checkCli(bin, tmp));
  results.push(await checkApiUi(bin, tmp));
  results.push(await checkMcp(bin, tmp));

  const summary = {
    pass: results.filter((x) => x.status === "pass").length,
    fail: results.filter((x) => x.status === "fail").length,
    skipped: results.filter((x) => x.status === "skipped").length
  };

  const report = {
    schema: 1,
    root,
    generatedAt: new Date().toISOString(),
    strict,
    summary,
    results
  };

  if (format === "json") process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  else process.stdout.write(toMarkdown(report));

  if (summary.fail > 0 || (strict && summary.skipped > 0)) process.exitCode = 1;
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e) + "\n");
  process.exitCode = 1;
});
