import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("verify:release-rehearsal-archive-verify script relies on rehearsal defaults", async () => {
  const pkgRaw = await fs.readFile(path.resolve("package.json"), "utf8");
  const pkg = JSON.parse(pkgRaw);
  const command = pkg?.scripts?.["verify:release-rehearsal-archive-verify"];

  assert.equal(typeof command, "string");
  assert.match(command, /--archive-verify/);
  assert.ok(
    !command.includes("--archive-require-files"),
    "script should rely on release-rehearsal default required files to avoid drift"
  );
});
