import path from "node:path";
import { ensureDir, fileExists, readJson, writeJson } from "../lib/io.js";
import { resumeIndexPath, resumeSnapshotPath, resumeSnapshotsDir } from "../lib/paths.js";

function nowIso() {
  return new Date().toISOString();
}

function makeId() {
  return `resume_${Date.now()}`;
}

function emptyIndex() {
  return {
    schema: 1,
    updatedAt: nowIso(),
    snapshots: []
  };
}

async function readIndex(root) {
  const p = resumeIndexPath(root);
  if (!(await fileExists(p))) return emptyIndex();
  try {
    const j = await readJson(p);
    const snapshots = Array.isArray(j?.snapshots) ? j.snapshots : [];
    return {
      schema: 1,
      updatedAt: String(j?.updatedAt || nowIso()),
      snapshots
    };
  } catch {
    return emptyIndex();
  }
}

function uniqSorted(arr) {
  return Array.from(new Set(arr.map((x) => String(x)))).sort((a, b) => a.localeCompare(b));
}

function diffList(nextList = [], prevList = []) {
  const next = new Set((Array.isArray(nextList) ? nextList : []).map((x) => String(x)));
  const prev = new Set((Array.isArray(prevList) ? prevList : []).map((x) => String(x)));
  const added = [];
  const removed = [];
  for (const x of next) {
    if (!prev.has(x)) added.push(x);
  }
  for (const x of prev) {
    if (!next.has(x)) removed.push(x);
  }
  return { added: uniqSorted(added), removed: uniqSorted(removed) };
}

export async function saveResumeDigestSnapshot(root, digest, { tag = "", source = "manual" } = {}) {
  const id = makeId();
  const createdAt = nowIso();
  const snapshot = {
    schema: 1,
    id,
    createdAt,
    source: String(source || "manual"),
    tag: String(tag || "").trim() || null,
    digest
  };
  const file = resumeSnapshotPath(root, id);
  await ensureDir(resumeSnapshotsDir(root));
  await writeJson(file, snapshot);

  const idx = await readIndex(root);
  idx.snapshots.unshift({
    id,
    createdAt,
    source: snapshot.source,
    tag: snapshot.tag,
    summary: digest?.summary || { nextCount: 0, blockerCount: 0, timelineCount: 0 },
    activeSessionId: digest?.sessions?.active?.id || null,
    latestSessionId: digest?.sessions?.latest?.id || null
  });
  idx.snapshots = idx.snapshots.slice(0, 500);
  idx.updatedAt = nowIso();
  await writeJson(resumeIndexPath(root), idx);

  return {
    schema: 1,
    saved: {
      id,
      path: file,
      tag: snapshot.tag,
      source: snapshot.source
    },
    snapshot
  };
}

export async function listResumeDigestSnapshots(root, { limit = 20 } = {}) {
  const lim = Math.max(1, Math.min(200, Number(limit || 20)));
  const idx = await readIndex(root);
  return {
    schema: 1,
    root,
    updatedAt: idx.updatedAt,
    total: idx.snapshots.length,
    snapshots: idx.snapshots.slice(0, lim)
  };
}

export async function getResumeDigestSnapshot(root, id) {
  const sid = String(id || "").trim();
  if (!sid) throw new Error("missing_resume_snapshot_id");
  const p = resumeSnapshotPath(root, sid);
  if (!(await fileExists(p))) throw new Error(`resume_snapshot_not_found:${sid}`);
  const snapshot = await readJson(p);
  return {
    schema: 1,
    root,
    path: p,
    snapshot
  };
}

export async function compareResumeDigestSnapshots(root, { fromId, toId } = {}) {
  const from = await getResumeDigestSnapshot(root, fromId);
  const to = await getResumeDigestSnapshot(root, toId);
  const fromDigest = from.snapshot?.digest || {};
  const toDigest = to.snapshot?.digest || {};

  const nextDiff = diffList(toDigest.next, fromDigest.next);
  const blockersDiff = diffList(toDigest.blockers, fromDigest.blockers);

  const timelineFrom = Number(fromDigest?.summary?.timelineCount || 0);
  const timelineTo = Number(toDigest?.summary?.timelineCount || 0);
  const sessionFrom = fromDigest?.sessions?.active?.id || fromDigest?.sessions?.latest?.id || null;
  const sessionTo = toDigest?.sessions?.active?.id || toDigest?.sessions?.latest?.id || null;

  return {
    schema: 1,
    root,
    from: {
      id: from.snapshot.id,
      createdAt: from.snapshot.createdAt,
      tag: from.snapshot.tag || null
    },
    to: {
      id: to.snapshot.id,
      createdAt: to.snapshot.createdAt,
      tag: to.snapshot.tag || null
    },
    summary: {
      nextAdded: nextDiff.added.length,
      nextRemoved: nextDiff.removed.length,
      blockersAdded: blockersDiff.added.length,
      blockersRemoved: blockersDiff.removed.length,
      timelineDelta: timelineTo - timelineFrom,
      activeSessionChanged: sessionFrom !== sessionTo
    },
    diff: {
      next: nextDiff,
      blockers: blockersDiff,
      timeline: {
        fromCount: timelineFrom,
        toCount: timelineTo,
        delta: timelineTo - timelineFrom
      },
      sessions: {
        from: sessionFrom,
        to: sessionTo
      }
    }
  };
}

export function formatResumeHistoryListMarkdown(out) {
  const lines = [];
  lines.push("# Resume History");
  lines.push("");
  lines.push(`- total: ${out.total}`);
  lines.push(`- updatedAt: ${out.updatedAt}`);
  lines.push("");
  if (!out.snapshots.length) {
    lines.push("- (empty)");
    lines.push("");
    return lines.join("\n");
  }
  for (const s of out.snapshots) {
    lines.push(
      `- ${s.id} | ${s.createdAt} | tag=${s.tag || "-"} | next=${s.summary?.nextCount || 0} blockers=${s.summary?.blockerCount || 0} timeline=${s.summary?.timelineCount || 0}`
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function formatResumeHistoryCompareMarkdown(out) {
  const lines = [];
  lines.push("# Resume History Compare");
  lines.push("");
  lines.push(`- from: ${out.from.id} (${out.from.createdAt})`);
  lines.push(`- to: ${out.to.id} (${out.to.createdAt})`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- nextAdded: ${out.summary.nextAdded}`);
  lines.push(`- nextRemoved: ${out.summary.nextRemoved}`);
  lines.push(`- blockersAdded: ${out.summary.blockersAdded}`);
  lines.push(`- blockersRemoved: ${out.summary.blockersRemoved}`);
  lines.push(`- timelineDelta: ${out.summary.timelineDelta}`);
  lines.push(`- activeSessionChanged: ${out.summary.activeSessionChanged ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Next Added");
  lines.push("");
  if (out.diff.next.added.length) lines.push(...out.diff.next.added.map((x) => `- ${x}`));
  else lines.push("- (none)");
  lines.push("");
  lines.push("## Next Removed");
  lines.push("");
  if (out.diff.next.removed.length) lines.push(...out.diff.next.removed.map((x) => `- ${x}`));
  else lines.push("- (none)");
  lines.push("");
  lines.push("## Blockers Added");
  lines.push("");
  if (out.diff.blockers.added.length) lines.push(...out.diff.blockers.added.map((x) => `- ${x}`));
  else lines.push("- (none)");
  lines.push("");
  lines.push("## Blockers Removed");
  lines.push("");
  if (out.diff.blockers.removed.length) lines.push(...out.diff.blockers.removed.map((x) => `- ${x}`));
  else lines.push("- (none)");
  lines.push("");
  return lines.join("\n");
}

export function formatResumeHistorySnapshotMarkdown(out) {
  const s = out.snapshot;
  const lines = [];
  lines.push("# Resume Snapshot");
  lines.push("");
  lines.push(`- id: ${s.id}`);
  lines.push(`- createdAt: ${s.createdAt}`);
  lines.push(`- source: ${s.source || "-"}`);
  lines.push(`- tag: ${s.tag || "-"}`);
  lines.push(`- path: ${path.relative(process.cwd(), out.path)}`);
  lines.push("");
  return lines.join("\n");
}
