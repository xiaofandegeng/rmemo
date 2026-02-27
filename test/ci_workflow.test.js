import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readCiWorkflow() {
  return fs.readFile(path.resolve(".github/workflows/ci.yml"), "utf8");
}

test("ci workflow generates release-ready artifacts in fast mode", async () => {
  const workflow = await readCiWorkflow();
  assert.match(workflow, /RELEASE_READY_STEP_TIMEOUT_MS:\s*"120000"/);
  assert.match(workflow, /release-ready\.js --format md --skip-tests --allow-dirty --step-timeout-ms "\$\{RELEASE_READY_STEP_TIMEOUT_MS\}" --out artifacts\/release-ready\.md/);
  assert.match(workflow, /release-ready\.js --format json --skip-tests --allow-dirty --step-timeout-ms "\$\{RELEASE_READY_STEP_TIMEOUT_MS\}" --out artifacts\/release-ready\.json/);
});
