import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { applyIntegrationToConfigFile, getRmemoBinPath, renderIntegration } from "../src/core/integrate.js";

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

test("integrate --apply merges into mcpServers schema (claude-desktop style)", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-int-ap-"));
  const cfg = path.join(root, "claude.json");
  await fs.writeFile(cfg, JSON.stringify({ mcpServers: { existing: { command: "echo", args: ["hi"] } } }, null, 2), "utf8");

  const r = await applyIntegrationToConfigFile({ tool: "claude-desktop", root, configPath: cfg, name: "rmemo" });
  assert.equal(r.ok, true);
  assert.equal(r.changed, true);
  assert.ok(r.backupPath);

  const after = JSON.parse(await fs.readFile(cfg, "utf8"));
  assert.ok(after.mcpServers.existing);
  assert.ok(after.mcpServers.rmemo);
  assert.equal(after.mcpServers.rmemo.command, "node");
  assert.ok(after.mcpServers.rmemo.args.includes("mcp"));
});

test("integrate --apply merges into flat schema (antigravity/cursor style)", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-int-ap2-"));
  const cfg = path.join(root, "raw.json");
  await fs.writeFile(cfg, JSON.stringify({ local_postgres: { command: "uvx", args: ["postgres-mcp"] } }, null, 2), "utf8");

  const r = await applyIntegrationToConfigFile({ tool: "antigravity", root, configPath: cfg, name: "rmemo" });
  assert.equal(r.ok, true);

  const after = JSON.parse(await fs.readFile(cfg, "utf8"));
  assert.ok(after.local_postgres);
  assert.ok(after.rmemo);
  assert.equal(after.rmemo.command, "node");
});
