import test from "node:test";
import assert from "node:assert/strict";
import { deriveReleaseAssetNames } from "../scripts/release-asset-names.js";

test("deriveReleaseAssetNames returns scoped and preferred names for scoped package", () => {
  const names = deriveReleaseAssetNames({ packageName: "@xiaofandegeng/rmemo", version: "1.2.3" });
  assert.equal(names.packageBaseName, "rmemo");
  assert.equal(names.scopedPackFile, "xiaofandegeng-rmemo-1.2.3.tgz");
  assert.equal(names.expectedAsset, "rmemo-1.2.3.tgz");
});

test("deriveReleaseAssetNames keeps unscoped package names consistent", () => {
  const names = deriveReleaseAssetNames({ packageName: "rmemo", version: "1.2.3" });
  assert.equal(names.packageBaseName, "rmemo");
  assert.equal(names.scopedPackFile, "rmemo-1.2.3.tgz");
  assert.equal(names.expectedAsset, "rmemo-1.2.3.tgz");
});

test("deriveReleaseAssetNames rejects empty inputs", () => {
  assert.throws(() => deriveReleaseAssetNames({ packageName: "", version: "1.2.3" }), /packageName is required/);
  assert.throws(() => deriveReleaseAssetNames({ packageName: "@x/rmemo", version: "" }), /version is required/);
});
