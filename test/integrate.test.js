import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { renderIntegration, getRmemoBinPath } from "../src/core/integrate.js";

test("integrate antigravity outputs a paste-ready json snippet", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-int-"));
  const r = renderIntegration({ tool: "antigravity", root, format: "json" });
  assert.equal(r.format, "json");
  const j = JSON.parse(r.text);
  assert.ok(j.rmemo);
  assert.equal(j.rmemo.command, "node");
  assert.ok(Array.isArray(j.rmemo.args));
  assert.equal(j.rmemo.args[0], getRmemoBinPath());
  assert.ok(j.rmemo.args.includes("mcp"));
  assert.ok(j.rmemo.args.includes("--root"));
  assert.ok(j.rmemo.args.includes(root));
});

