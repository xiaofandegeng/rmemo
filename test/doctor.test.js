import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { buildDoctorReport } from "../src/core/doctor.js";

test("doctor report includes key sections", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-doc-"));
  const out = await buildDoctorReport({ root });
  assert.ok(out.includes("# rmemo doctor"));
  assert.ok(out.includes("## Binary resolution"));
  assert.ok(out.includes("package bin/rmemo.js:"));
  assert.ok(out.includes("Antigravity MCP snippet:"));
});

