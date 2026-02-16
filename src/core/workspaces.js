import path from "node:path";
import fs from "node:fs/promises";
import { scanRepo } from "./scan.js";
import { generateFocus } from "./focus.js";
import { fileExists, readJson, writeJson } from "../lib/io.js";
import { wsFocusIndexPath, wsFocusSnapshotPath, wsFocusSnapshotsDir } from "../lib/paths.js";

function splitList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x || "").trim()).filter(Boolean);
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function listWorkspaces(root, { preferGit = true, maxFiles = 4000, onlyDirs = [] } = {}) {
  const { manifest } = await scanRepo(root, { preferGit, maxFiles });
  const all = Array.isArray(manifest?.subprojects) ? manifest.subprojects : [];
  const pick = splitList(onlyDirs);
  const subprojects = pick.length ? all.filter((x) => pick.includes(x.dir)) : all;
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    total: subprojects.length,
    subprojects: subprojects.map((sp, i) => ({
      index: i + 1,
      dir: sp.dir,
      reasons: Array.isArray(sp.reasons) ? sp.reasons : []
    }))
  };
}

export async function batchWorkspaceFocus(
  root,
  {
    q,
    mode = "semantic",
    k = 8,
    minScore = 0.15,
    maxHits = 50,
    recentDays = 14,
    includeStatus = false,
    preferGit = true,
    maxFiles = 4000,
    onlyDirs = []
  } = {}
) {
  const query = String(q || "").trim();
  if (!query) throw new Error("Missing q");

  const ws = await listWorkspaces(root, { preferGit, maxFiles, onlyDirs });
  const results = [];
  for (const sp of ws.subprojects) {
    const wsRoot = path.resolve(root, sp.dir);
    try {
      // eslint-disable-next-line no-await-in-loop
      const out = await generateFocus(wsRoot, {
        q: query,
        mode: String(mode || "semantic").toLowerCase(),
        format: "json",
        k: Number(k || 8),
        minScore: Number(minScore || 0.15),
        maxHits: Number(maxHits || 50),
        recentDays: Number(recentDays || 14),
        includeStatus: !!includeStatus
      });
      const hits = Array.isArray(out?.json?.search?.hits) ? out.json.search.hits : [];
      const top = hits[0] || null;
      results.push({
        dir: sp.dir,
        ok: true,
        mode: String(out?.json?.search?.mode || mode || "semantic"),
        hits: hits.length,
        top: top
          ? {
              file: top.file,
              score: top.score ?? null,
              line: top.line ?? null,
              startLine: top.startLine ?? null,
              endLine: top.endLine ?? null,
              text: String(top.text || "").slice(0, 200)
            }
          : null
      });
    } catch (e) {
      results.push({
        dir: sp.dir,
        ok: false,
        error: e?.message || String(e),
        hits: 0,
        top: null
      });
    }
  }

  const okCount = results.filter((x) => x.ok).length;
  const nonEmptyCount = results.filter((x) => x.ok && Number(x.hits || 0) > 0).length;
  const ranked = results
    .filter((x) => x.ok)
    .sort((a, b) => Number(b.hits || 0) - Number(a.hits || 0) || String(a.dir).localeCompare(String(b.dir)));
  const best = ranked[0] || null;

  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    q: query,
    mode: String(mode || "semantic").toLowerCase(),
    summary: {
      total: ws.subprojects.length,
      ok: okCount,
      nonEmpty: nonEmptyCount,
      best: best ? { dir: best.dir, hits: best.hits } : null
    },
    results
  };
}

function makeSnapshotId() {
  const iso = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${iso}-${rand}`;
}

async function readWsFocusIndex(root) {
  const p = wsFocusIndexPath(root);
  if (!(await fileExists(p))) return { schema: 1, updatedAt: null, snapshots: [] };
  try {
    const j = await readJson(p);
    const list = Array.isArray(j?.snapshots) ? j.snapshots : [];
    return { schema: 1, updatedAt: j?.updatedAt || null, snapshots: list };
  } catch {
    return { schema: 1, updatedAt: null, snapshots: [] };
  }
}

function reportSummaryForIndex(report) {
  return {
    total: Number(report?.summary?.total || 0),
    ok: Number(report?.summary?.ok || 0),
    nonEmpty: Number(report?.summary?.nonEmpty || 0),
    best: report?.summary?.best || null
  };
}

function compareFocusReports(prev, next) {
  const a = Array.isArray(prev?.results) ? prev.results : [];
  const b = Array.isArray(next?.results) ? next.results : [];
  const mapA = new Map(a.map((x) => [String(x.dir || ""), x]));
  const mapB = new Map(b.map((x) => [String(x.dir || ""), x]));
  const dirs = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort();
  const changes = [];
  for (const dir of dirs) {
    const pa = mapA.get(dir) || null;
    const pb = mapB.get(dir) || null;
    const hitsA = Number(pa?.hits || 0);
    const hitsB = Number(pb?.hits || 0);
    const okA = !!pa?.ok;
    const okB = !!pb?.ok;
    const delta = hitsB - hitsA;
    if (!pa || !pb || delta !== 0 || okA !== okB) {
      changes.push({
        dir,
        previous: pa ? { ok: okA, hits: hitsA } : null,
        current: pb ? { ok: okB, hits: hitsB } : null,
        deltaHits: delta
      });
    }
  }
  const prevSummary = reportSummaryForIndex(prev);
  const nextSummary = reportSummaryForIndex(next);
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    previousSummary: prevSummary,
    currentSummary: nextSummary,
    summaryDelta: {
      total: nextSummary.total - prevSummary.total,
      ok: nextSummary.ok - prevSummary.ok,
      nonEmpty: nextSummary.nonEmpty - prevSummary.nonEmpty
    },
    changedCount: changes.length,
    changes
  };
}

export async function saveWorkspaceFocusSnapshot(root, report, { tag = "" } = {}) {
  const id = makeSnapshotId();
  const p = wsFocusSnapshotPath(root, id);
  const snapshot = {
    schema: 1,
    id,
    createdAt: new Date().toISOString(),
    tag: String(tag || "").trim() || null,
    report
  };
  await fs.mkdir(wsFocusSnapshotsDir(root), { recursive: true });
  await writeJson(p, snapshot);

  const index = await readWsFocusIndex(root);
  index.snapshots.unshift({
    id,
    createdAt: snapshot.createdAt,
    tag: snapshot.tag,
    q: String(report?.q || ""),
    mode: String(report?.mode || "semantic"),
    summary: reportSummaryForIndex(report)
  });
  index.snapshots = index.snapshots.slice(0, 200);
  index.updatedAt = new Date().toISOString();
  await writeJson(wsFocusIndexPath(root), index);
  return { id, path: p, snapshot };
}

export async function listWorkspaceFocusSnapshots(root, { limit = 20 } = {}) {
  const index = await readWsFocusIndex(root);
  const lim = Math.min(200, Math.max(1, Number(limit || 20)));
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    snapshots: index.snapshots.slice(0, lim)
  };
}

export async function getWorkspaceFocusSnapshot(root, id) {
  const sid = String(id || "").trim();
  if (!sid) throw new Error("Missing snapshot id");
  const p = wsFocusSnapshotPath(root, sid);
  if (!(await fileExists(p))) throw new Error("snapshot_not_found");
  return readJson(p);
}

export async function compareWorkspaceFocusSnapshots(root, { fromId, toId } = {}) {
  const from = await getWorkspaceFocusSnapshot(root, fromId);
  const to = await getWorkspaceFocusSnapshot(root, toId);
  return {
    schema: 1,
    root,
    from: { id: from.id, createdAt: from.createdAt, tag: from.tag, q: from.report?.q || "", mode: from.report?.mode || "" },
    to: { id: to.id, createdAt: to.createdAt, tag: to.tag, q: to.report?.q || "", mode: to.report?.mode || "" },
    diff: compareFocusReports(from.report || {}, to.report || {})
  };
}

export async function compareWorkspaceFocusWithLatest(root, report) {
  const index = await readWsFocusIndex(root);
  const latest = index.snapshots[0] || null;
  if (!latest?.id) return null;
  const prev = await getWorkspaceFocusSnapshot(root, latest.id);
  return {
    schema: 1,
    from: { id: prev.id, createdAt: prev.createdAt, tag: prev.tag, q: prev.report?.q || "", mode: prev.report?.mode || "" },
    to: { id: null, createdAt: new Date().toISOString(), tag: null, q: report?.q || "", mode: report?.mode || "" },
    diff: compareFocusReports(prev.report || {}, report || {})
  };
}
