import path from "node:path";
import fs from "node:fs/promises";
import { scanRepo } from "./scan.js";
import { generateFocus } from "./focus.js";
import { fileExists, readJson, writeJson } from "../lib/io.js";
import {
  wsFocusIndexPath,
  wsFocusReportPath,
  wsFocusReportsDir,
  wsFocusReportsIndexPath,
  wsFocusSnapshotPath,
  wsFocusSnapshotsDir
} from "../lib/paths.js";

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

function makeReportId() {
  const iso = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  const rand = Math.random().toString(36).slice(2, 8);
  return `rpt-${iso}-${rand}`;
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

async function readWsFocusReportsIndex(root) {
  const p = wsFocusReportsIndexPath(root);
  if (!(await fileExists(p))) return { schema: 1, updatedAt: null, reports: [] };
  try {
    const j = await readJson(p);
    const list = Array.isArray(j?.reports) ? j.reports : [];
    return { schema: 1, updatedAt: j?.updatedAt || null, reports: list };
  } catch {
    return { schema: 1, updatedAt: null, reports: [] };
  }
}

async function pickLatestTwoSnapshotIds(root) {
  const index = await readWsFocusIndex(root);
  const a = index.snapshots[0]?.id || "";
  const b = index.snapshots[1]?.id || "";
  if (!a || !b) return null;
  return { fromId: b, toId: a };
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

function summarizeChange(c) {
  const prev = c?.previous || null;
  const cur = c?.current || null;
  const delta = Number(c?.deltaHits || 0);
  if (!prev && cur) return "added";
  if (prev && !cur) return "removed";
  if (prev && cur && prev.ok && !cur.ok) return "regressed:error";
  if (prev && cur && !prev.ok && cur.ok) return "recovered";
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "unchanged";
}

function scoreChange(c) {
  const t = summarizeChange(c);
  if (t === "regressed:error") return 100;
  if (t === "added") return 40;
  if (t === "removed") return 30;
  const delta = Math.abs(Number(c?.deltaHits || 0));
  return Math.min(80, delta * 10);
}

function markdownFromReport(r, { maxItems = 50 } = {}) {
  const lines = [];
  lines.push("# Workspace Focus Drift Report\n");
  lines.push(`Generated: ${r.generatedAt}\n`);
  lines.push(`From: ${r.from.id} (${r.from.createdAt})`);
  lines.push(`To: ${r.to.id} (${r.to.createdAt})\n`);
  lines.push(`Query: "${r.query || ""}"`);
  lines.push(`Mode: ${r.mode || ""}\n`);
  lines.push("## Summary\n");
  lines.push(`- changedCount: ${r.summary.changedCount}`);
  lines.push(`- increased: ${r.summary.increased}`);
  lines.push(`- decreased: ${r.summary.decreased}`);
  lines.push(`- regressedErrors: ${r.summary.regressedErrors}`);
  lines.push(`- recovered: ${r.summary.recovered}`);
  lines.push(`- added: ${r.summary.added}`);
  lines.push(`- removed: ${r.summary.removed}\n`);
  lines.push("## Top Drift\n");
  const top = Array.isArray(r.topChanges) ? r.topChanges.slice(0, Math.max(1, Number(maxItems || 50))) : [];
  if (!top.length) {
    lines.push("- (no drift)\n");
    return lines.join("\n");
  }
  for (const c of top) {
    lines.push(`- ${c.dir}: ${c.changeType} prev=${c.previous?.hits ?? "-"} -> cur=${c.current?.hits ?? "-"} (delta=${c.deltaHits}, score=${c.impactScore})`);
  }
  lines.push("");
  return lines.join("\n");
}

function reportSummaryForHistory(report) {
  return {
    changedCount: Number(report?.summary?.changedCount || 0),
    increased: Number(report?.summary?.increased || 0),
    decreased: Number(report?.summary?.decreased || 0),
    regressedErrors: Number(report?.summary?.regressedErrors || 0),
    recovered: Number(report?.summary?.recovered || 0),
    added: Number(report?.summary?.added || 0),
    removed: Number(report?.summary?.removed || 0)
  };
}

export async function generateWorkspaceFocusReport(root, { fromId = "", toId = "", maxItems = 50 } = {}) {
  let from = String(fromId || "").trim();
  let to = String(toId || "").trim();
  if (!from || !to) {
    const pair = await pickLatestTwoSnapshotIds(root);
    if (!pair) throw new Error("need_at_least_two_snapshots");
    from = pair.fromId;
    to = pair.toId;
  }
  const cmp = await compareWorkspaceFocusSnapshots(root, { fromId: from, toId: to });
  const raw = Array.isArray(cmp?.diff?.changes) ? cmp.diff.changes : [];
  const norm = raw.map((c) => {
    const changeType = summarizeChange(c);
    return {
      ...c,
      changeType,
      impactScore: scoreChange(c)
    };
  });
  const ranked = norm
    .slice()
    .sort((a, b) => Number(b.impactScore || 0) - Number(a.impactScore || 0) || Math.abs(Number(b.deltaHits || 0)) - Math.abs(Number(a.deltaHits || 0)));
  const summary = {
    changedCount: norm.length,
    increased: norm.filter((x) => x.changeType === "up").length,
    decreased: norm.filter((x) => x.changeType === "down").length,
    regressedErrors: norm.filter((x) => x.changeType === "regressed:error").length,
    recovered: norm.filter((x) => x.changeType === "recovered").length,
    added: norm.filter((x) => x.changeType === "added").length,
    removed: norm.filter((x) => x.changeType === "removed").length
  };
  const report = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    query: cmp?.to?.q || "",
    mode: cmp?.to?.mode || "",
    from: cmp.from,
    to: cmp.to,
    summary,
    topChanges: ranked.slice(0, Math.max(1, Number(maxItems || 50))),
    changes: norm
  };
  return {
    json: report,
    markdown: markdownFromReport(report, { maxItems })
  };
}

export async function saveWorkspaceFocusReport(root, report, { tag = "" } = {}) {
  const id = makeReportId();
  const p = wsFocusReportPath(root, id);
  const doc = {
    schema: 1,
    id,
    createdAt: new Date().toISOString(),
    tag: String(tag || "").trim() || null,
    report
  };
  await fs.mkdir(wsFocusReportsDir(root), { recursive: true });
  await writeJson(p, doc);

  const index = await readWsFocusReportsIndex(root);
  index.reports.unshift({
    id,
    createdAt: doc.createdAt,
    tag: doc.tag,
    fromId: String(report?.from?.id || ""),
    toId: String(report?.to?.id || ""),
    query: String(report?.query || ""),
    mode: String(report?.mode || ""),
    summary: reportSummaryForHistory(report)
  });
  index.reports = index.reports.slice(0, 200);
  index.updatedAt = new Date().toISOString();
  await writeJson(wsFocusReportsIndexPath(root), index);
  return { id, path: p, report: doc };
}

export async function listWorkspaceFocusReports(root, { limit = 20 } = {}) {
  const index = await readWsFocusReportsIndex(root);
  const lim = Math.min(200, Math.max(1, Number(limit || 20)));
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    reports: index.reports.slice(0, lim)
  };
}

export async function getWorkspaceFocusReport(root, id) {
  const rid = String(id || "").trim();
  if (!rid) throw new Error("Missing report id");
  const p = wsFocusReportPath(root, rid);
  if (!(await fileExists(p))) throw new Error("report_not_found");
  const doc = await readJson(p);
  const report = doc?.report || {};
  return {
    schema: 1,
    id: doc?.id || rid,
    createdAt: doc?.createdAt || null,
    tag: doc?.tag || null,
    report
  };
}
