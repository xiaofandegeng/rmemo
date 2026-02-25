import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { listResumeDigestSnapshots, pruneResumeDigestSnapshots, saveResumeDigestSnapshot } from "../src/core/resume_history.js";
import { resumeIndexPath, resumeSnapshotPath } from "../src/lib/paths.js";

function makeDigest(label) {
  return {
    schema: 1,
    summary: { nextCount: 1, blockerCount: 0, timelineCount: 0 },
    next: [label],
    blockers: [],
    timeline: [],
    sessions: {}
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("pruneResumeDigestSnapshots keeps latest N and tolerates missing files", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-resume-history-"));
  await saveResumeDigestSnapshot(tmp, makeDigest("one"), { source: "test" });
  await sleep(2);
  await saveResumeDigestSnapshot(tmp, makeDigest("two"), { source: "test" });
  await sleep(2);
  await saveResumeDigestSnapshot(tmp, makeDigest("three"), { source: "test" });

  const before = await listResumeDigestSnapshots(tmp, { limit: 10 });
  assert.equal(before.total, 3);
  const oldestId = before.snapshots[2].id;

  // Simulate a stale index entry pointing to a missing/corrupt snapshot file.
  await fs.unlink(resumeSnapshotPath(tmp, oldestId));

  const out = await pruneResumeDigestSnapshots(tmp, { keep: 2, olderThanDays: 0 });
  assert.equal(out.schema, 1);
  assert.equal(out.before, 3);
  assert.equal(out.after, 2);
  assert.equal(out.pruned, 1);
  assert.deepEqual(out.deletedIds, [oldestId]);

  const after = await listResumeDigestSnapshots(tmp, { limit: 10 });
  assert.equal(after.total, 2);
  assert.ok(after.snapshots.every((x) => x.id !== oldestId));
});

test("pruneResumeDigestSnapshots prunes snapshots older than N days", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rmemo-resume-history-days-"));
  await saveResumeDigestSnapshot(tmp, makeDigest("newer"), { source: "test" });
  await sleep(2);
  await saveResumeDigestSnapshot(tmp, makeDigest("newest"), { source: "test" });

  const indexFile = resumeIndexPath(tmp);
  const idx = JSON.parse(await fs.readFile(indexFile, "utf8"));
  const oldId = idx.snapshots[0].id;
  idx.snapshots[0].createdAt = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
  await fs.writeFile(indexFile, JSON.stringify(idx, null, 2) + "\n", "utf8");

  const out = await pruneResumeDigestSnapshots(tmp, { keep: 100, olderThanDays: 30 });
  assert.equal(out.schema, 1);
  assert.equal(out.pruned, 1);
  assert.deepEqual(out.deletedIds, [oldId]);

  const after = await listResumeDigestSnapshots(tmp, { limit: 10 });
  assert.equal(after.total, 1);
  assert.ok(after.snapshots.every((x) => x.id !== oldId));
});
