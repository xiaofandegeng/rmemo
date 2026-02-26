import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawn } from "node:child_process";

function runNode(args, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString("utf8")));
    p.stderr.on("data", (d) => (err += d.toString("utf8")));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

test("regression-matrix json includes standardized summary block", async () => {
  const r = await runNode([path.resolve("scripts/regression-matrix.js"), "--format", "json"], {
    cwd: path.resolve("."),
    env: { ...process.env }
  });

  assert.notEqual(String(r.out || "").trim(), "", r.err || r.out);
  const report = JSON.parse(r.out);
  assert.equal(typeof report.ok, "boolean");
  assert.equal(typeof report.strict, "boolean");
  assert.ok(report.standardized && typeof report.standardized === "object");
  assert.equal(report.standardized.status, report.ok ? "pass" : "fail");
  assert.equal(report.standardized.resultCode, report.ok ? "REGRESSION_MATRIX_OK" : "REGRESSION_MATRIX_FAIL");
  assert.equal(typeof report.standardized.checkStatuses, "object");
  assert.equal(Array.isArray(report.standardized.failureCodes), true);
  assert.equal(Array.isArray(report.standardized.failures), true);
});
