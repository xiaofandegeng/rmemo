import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readReleaseWorkflow() {
  return fs.readFile(path.resolve(".github/workflows/release-please.yml"), "utf8");
}

test("release workflow keeps release-ready audit exports compatible with dirty artifacts dir", async () => {
  const workflow = await readReleaseWorkflow();
  assert.match(workflow, /release-ready\.js --format md --skip-tests --allow-dirty --step-timeout-ms/);
  assert.match(workflow, /release-ready\.js --format json --skip-tests --allow-dirty --step-timeout-ms/);
});

test("release workflow includes post-publish install smoke test from registry package", async () => {
  const workflow = await readReleaseWorkflow();
  assert.match(workflow, /name:\s+Post-publish install smoke test/);
  assert.match(workflow, /npx -y "\$PKG@\$V" --help/);
  assert.match(workflow, /npx -y "\$PKG@\$V" --root "\$TMP_DIR" init/);
  assert.match(workflow, /npx -y "\$PKG@\$V" --root "\$TMP_DIR" status --format json/);
});
