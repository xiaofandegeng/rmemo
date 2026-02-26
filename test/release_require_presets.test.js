import test from "node:test";
import assert from "node:assert/strict";
import { getRequirePresetFiles, listRequirePresets } from "../scripts/release-require-presets.js";

test("release require presets expose rehearsal archive verify baseline", () => {
  const files = getRequirePresetFiles("rehearsal-archive-verify");
  assert.deepEqual(files, [
    "release-ready.json",
    "release-health.json",
    "release-rehearsal.json",
    "release-summary.json"
  ]);
});

test("release require presets list contains rehearsal archive verify preset", () => {
  const presets = listRequirePresets();
  const target = presets.find((preset) => preset.name === "rehearsal-archive-verify");
  assert.ok(target);
  assert.deepEqual(target.files, [
    "release-ready.json",
    "release-health.json",
    "release-rehearsal.json",
    "release-summary.json"
  ]);
});

test("release require presets return null for unknown preset", () => {
  assert.equal(getRequirePresetFiles("unknown"), null);
});
