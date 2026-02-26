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

test("verify:release-archive-find-presets script lists built-in presets", async () => {
  const pkgRaw = await fs.readFile(path.resolve("package.json"), "utf8");
  const pkg = JSON.parse(pkgRaw);
  const command = pkg?.scripts?.["verify:release-archive-find-presets"];

  assert.equal(typeof command, "string");
  assert.match(command, /release-archive-find\.js/);
  assert.match(command, /--list-require-presets/);
});

test("verify:release-rehearsal-preflight script enables preflight mode", async () => {
  const pkgRaw = await fs.readFile(path.resolve("package.json"), "utf8");
  const pkg = JSON.parse(pkgRaw);
  const command = pkg?.scripts?.["verify:release-rehearsal-preflight"];

  assert.equal(typeof command, "string");
  assert.match(command, /release-rehearsal\.js/);
  assert.match(command, /--preflight/);
});

test("verify:release-rehearsal-bundle script enables archive verify bundle", async () => {
  const pkgRaw = await fs.readFile(path.resolve("package.json"), "utf8");
  const pkg = JSON.parse(pkgRaw);
  const command = pkg?.scripts?.["verify:release-rehearsal-bundle"];

  assert.equal(typeof command, "string");
  assert.match(command, /release-rehearsal\.js/);
  assert.match(command, /--bundle\s+rehearsal-archive-verify/);
  assert.match(command, /--version\s+current/);
});
