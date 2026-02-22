import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { runContractCheck } from "../src/core/contract.js";

function runNode(args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString("utf8")));
    p.stderr.on("data", (d) => (err += d.toString("utf8")));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

async function seedContractFixture(root) {
  await fs.mkdir(path.join(root, "bin"), { recursive: true });
  await fs.mkdir(path.join(root, "src", "core"), { recursive: true });
  await fs.writeFile(
    path.join(root, "bin", "rmemo.js"),
    [
      "switch (cmd) {",
      '  case "init": break;',
      '  case "scan": break;',
      '  case "contract": break;',
      '  case "help": break;',
      "}"
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(root, "src", "core", "serve.js"),
    [
      'if (req.method === "GET" && url.pathname === "/health") {}',
      'if (req.method === "POST" && url.pathname.startsWith("/todos/")) {}',
      'const m = req.method === "GET" ? url.pathname.match(/^\\/items\\/([^/]+)$/) : null;'
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(root, "src", "core", "mcp.js"),
    ['tool("rmemo_status", "", {});', 'tool("rmemo_context", "", {});'].join("\n"),
    "utf8"
  );
}

test("runContractCheck can update and detect drift", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-contract-"));
  await seedContractFixture(tmp);

  const updated = await runContractCheck({ root: tmp, update: true });
  assert.equal(updated.ok, true);

  const stable = await runContractCheck({ root: tmp, update: false });
  assert.equal(stable.ok, true);

  await fs.writeFile(
    path.join(tmp, "src", "core", "mcp.js"),
    ['tool("rmemo_status", "", {});', 'tool("rmemo_context", "", {});', 'tool("rmemo_new_tool", "", {});'].join("\n"),
    "utf8"
  );

  const drift = await runContractCheck({ root: tmp, update: false });
  assert.equal(drift.ok, true);
  assert.equal(drift.hasDrift, true);
  assert.equal(drift.hasBreaking, false);
  assert.deepEqual(drift.details.mcp.added, ["rmemo_new_tool"]);

  await fs.writeFile(
    path.join(tmp, "src", "core", "mcp.js"),
    ['tool("rmemo_context", "", {});', 'tool("rmemo_new_tool", "", {});'].join("\n"),
    "utf8"
  );
  const breaking = await runContractCheck({ root: tmp, update: false });
  assert.equal(breaking.ok, false);
  assert.equal(breaking.hasBreaking, true);
  assert.deepEqual(breaking.details.mcp.removed, ["rmemo_status"]);
});

test("rmemo contract check CLI returns non-zero on contract drift", async () => {
  const rmemoBin = path.resolve("bin/rmemo.js");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-contract-cli-"));
  await seedContractFixture(tmp);

  {
    const r = await runNode([rmemoBin, "--root", tmp, "contract", "check", "--update", "--format", "json"]);
    assert.equal(r.code, 0, r.err || r.out);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, true);
  }

  await fs.writeFile(
    path.join(tmp, "bin", "rmemo.js"),
    [
      "switch (cmd) {",
      '  case "init": break;',
      '  case "scan": break;',
      '  case "contract": break;',
      '  case "watch": break;',
      '  case "help": break;',
      "}"
    ].join("\n"),
    "utf8"
  );

  {
    const r = await runNode([rmemoBin, "--root", tmp, "contract", "check", "--format", "json"]);
    assert.equal(r.code, 0, r.err || r.out);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, true);
    assert.equal(j.hasDrift, true);
    assert.equal(j.hasBreaking, false);
    assert.deepEqual(j.details.cli.added, ["watch"]);
  }

  {
    const r = await runNode([rmemoBin, "--root", tmp, "contract", "check", "--format", "json", "--fail-on", "any"]);
    assert.equal(r.code, 1, r.err || r.out);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, false);
    assert.equal(j.hasDrift, true);
    assert.equal(j.hasBreaking, false);
    assert.deepEqual(j.details.cli.added, ["watch"]);
  }
});
