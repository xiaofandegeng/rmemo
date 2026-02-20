import path from "node:path";
import fs from "node:fs/promises";
import { scanRepo } from "./scan.js";
import { generateFocus } from "./focus.js";
import { addTodoBlocker, addTodoNext } from "./todos.js";
import { appendJournalEntry } from "./journal.js";
import { readJson, writeJson, ensureDir, fileExists, readJsonSafe } from "../lib/io.js";
import {
  wsFocusAlertsActionPath,
  wsFocusAlertsActionsDir,
  wsFocusAlertsActionsIndexPath,
  wsFocusAlertsBoardPath,
  wsFocusAlertsBoardsDir,
  wsFocusAlertsBoardsIndexPath,
  wsFocusAlertsBoardsPulseAppliedPath,
  wsFocusAlertsBoardsPulsePath,
  wsFocusAlertsActionJobsDir,
  wsFocusAlertsActionJobsIndexPath,
  wsFocusAlertsActionJobPath,
  wsFocusAlertsConfigPath,
  wsFocusAlertsHistoryPath,
  wsFocusDir,
  wsFocusIndexPath,
  wsFocusReportPath,
  wsFocusReportsDir,
  wsFocusReportsIndexPath,
  wsFocusSnapshotPath,
  wsFocusSnapshotsDir,
  configPath
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

function normalizeTrendKey(query, mode) {
  return `${String(mode || "").trim()}::${String(query || "").trim()}`;
}

function splitTrendKey(key) {
  const s = String(key || "");
  const i = s.indexOf("::");
  if (i < 0) return { mode: "", query: s };
  return { mode: s.slice(0, i), query: s.slice(i + 2) };
}

const DEFAULT_ALERTS_CONFIG = {
  schema: 1,
  enabled: true,
  minReports: 2,
  maxRegressedErrors: 0,
  maxAvgChangedCount: 8,
  maxChangedCount: 20,
  autoGovernanceEnabled: false,
  autoGovernanceCooldownMs: 3_600_000,
  lastAutoGovernanceAt: null
};

function normalizeAlertsConfig(raw) {
  const x = raw && typeof raw === "object" ? raw : {};
  return {
    schema: 1,
    enabled: x.enabled !== undefined ? !!x.enabled : DEFAULT_ALERTS_CONFIG.enabled,
    minReports: Math.max(1, Number(x.minReports ?? DEFAULT_ALERTS_CONFIG.minReports)),
    maxRegressedErrors: Math.max(0, Number(x.maxRegressedErrors ?? DEFAULT_ALERTS_CONFIG.maxRegressedErrors)),
    maxAvgChangedCount: Math.max(0, Number(x.maxAvgChangedCount ?? DEFAULT_ALERTS_CONFIG.maxAvgChangedCount)),
    maxChangedCount: Math.max(0, Number(x.maxChangedCount ?? DEFAULT_ALERTS_CONFIG.maxChangedCount)),
    autoGovernanceEnabled: x.autoGovernanceEnabled !== undefined ? !!x.autoGovernanceEnabled : DEFAULT_ALERTS_CONFIG.autoGovernanceEnabled,
    autoGovernanceCooldownMs: Math.max(0, Number(x.autoGovernanceCooldownMs ?? DEFAULT_ALERTS_CONFIG.autoGovernanceCooldownMs)),
    lastAutoGovernanceAt: x.lastAutoGovernanceAt ? String(x.lastAutoGovernanceAt) : null
  };
}

function toTrendPoint(x) {
  return {
    id: String(x?.id || ""),
    createdAt: x?.createdAt || null,
    fromId: String(x?.fromId || ""),
    toId: String(x?.toId || ""),
    changedCount: Number(x?.summary?.changedCount || 0),
    regressedErrors: Number(x?.summary?.regressedErrors || 0),
    increased: Number(x?.summary?.increased || 0),
    decreased: Number(x?.summary?.decreased || 0),
    recovered: Number(x?.summary?.recovered || 0),
    added: Number(x?.summary?.added || 0),
    removed: Number(x?.summary?.removed || 0),
    tag: x?.tag || null
  };
}

function buildGroupSummary(points) {
  const n = points.length || 1;
  const sumChanged = points.reduce((s, p) => s + Number(p.changedCount || 0), 0);
  return {
    reports: points.length,
    avgChangedCount: Number((sumChanged / n).toFixed(2)),
    maxChangedCount: points.reduce((m, p) => Math.max(m, Number(p.changedCount || 0)), 0),
    maxRegressedErrors: points.reduce((m, p) => Math.max(m, Number(p.regressedErrors || 0)), 0),
    latest: points[points.length - 1] || null
  };
}

export async function listWorkspaceFocusTrends(root, { limitReports = 200, limitGroups = 20 } = {}) {
  const index = await readWsFocusReportsIndex(root);
  const reports = (Array.isArray(index.reports) ? index.reports : []).slice(0, Math.min(200, Math.max(1, Number(limitReports || 200))));
  const groups = new Map();
  for (const r of reports) {
    const query = String(r?.query || "");
    const mode = String(r?.mode || "");
    const key = normalizeTrendKey(query, mode);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const out = [];
  for (const [key, arr] of groups.entries()) {
    const points = arr
      .slice()
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
      .map(toTrendPoint);
    const meta = splitTrendKey(key);
    out.push({
      key,
      query: meta.query,
      mode: meta.mode,
      summary: buildGroupSummary(points),
      series: points
    });
  }

  out.sort(
    (a, b) =>
      Number(b.summary?.reports || 0) - Number(a.summary?.reports || 0) ||
      Number((b.summary?.latest && b.summary.latest.createdAt) ? Date.parse(b.summary.latest.createdAt) : 0) -
      Number((a.summary?.latest && a.summary.latest.createdAt) ? Date.parse(a.summary.latest.createdAt) : 0)
  );

  const trimmed = out.slice(0, Math.min(50, Math.max(1, Number(limitGroups || 20))));
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    summary: {
      totalReports: reports.length,
      totalGroups: out.length
    },
    groups: trimmed
  };
}

export async function getWorkspaceFocusTrend(root, { key = "", limit = 100 } = {}) {
  const trendKey = String(key || "").trim();
  if (!trendKey) throw new Error("Missing trend key");
  const all = await listWorkspaceFocusTrends(root, { limitReports: 200, limitGroups: 50 });
  const g = (Array.isArray(all.groups) ? all.groups : []).find((x) => x.key === trendKey);
  if (!g) throw new Error("trend_not_found");
  const lim = Math.min(200, Math.max(1, Number(limit || 100)));
  const series = (Array.isArray(g.series) ? g.series : []).slice(-lim);
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    key: g.key,
    query: g.query,
    mode: g.mode,
    summary: buildGroupSummary(series),
    series
  };
}

export async function getWorkspaceFocusAlertsConfig(root) {
  const p = wsFocusAlertsConfigPath(root);
  if (!(await fileExists(p))) return { ...DEFAULT_ALERTS_CONFIG };
  try {
    const j = await readJson(p);
    return normalizeAlertsConfig(j);
  } catch {
    return { ...DEFAULT_ALERTS_CONFIG };
  }
}

export async function setWorkspaceFocusAlertsConfig(root, patch = {}) {
  const cur = await getWorkspaceFocusAlertsConfig(root);
  const next = normalizeAlertsConfig({ ...cur, ...(patch || {}) });
  await fs.mkdir(wsFocusDir(root), { recursive: true });
  await writeJson(wsFocusAlertsConfigPath(root), next);
  return next;
}

function computeAlertLevel({ regressedErrors, avgChangedCount, maxChangedCount }, cfg) {
  const overReg = regressedErrors > cfg.maxRegressedErrors;
  const overMax = maxChangedCount > cfg.maxChangedCount;
  const overAvg = avgChangedCount > cfg.maxAvgChangedCount;
  if (overReg || overMax) return "high";
  if (overAvg) return "medium";
  return "none";
}

export async function evaluateWorkspaceFocusAlerts(root, { limitGroups = 20, limitReports = 200, key = "" } = {}) {
  const cfg = await getWorkspaceFocusAlertsConfig(root);
  const trends = await listWorkspaceFocusTrends(root, { limitGroups, limitReports });
  const groups = Array.isArray(trends.groups) ? trends.groups : [];
  const picked = key ? groups.filter((g) => g.key === key) : groups;
  const alerts = [];
  for (const g of picked) {
    const reports = Number(g?.summary?.reports || 0);
    if (reports < cfg.minReports) continue;
    const avgChangedCount = Number(g?.summary?.avgChangedCount || 0);
    const regressedErrors = Number(g?.summary?.maxRegressedErrors || 0);
    const maxChangedCount = Number(g?.summary?.maxChangedCount || 0);
    const level = computeAlertLevel({ regressedErrors, avgChangedCount, maxChangedCount }, cfg);
    if (level === "none") continue;
    const reasons = [];
    if (regressedErrors > cfg.maxRegressedErrors) reasons.push(`maxRegressedErrors ${regressedErrors} > ${cfg.maxRegressedErrors}`);
    if (maxChangedCount > cfg.maxChangedCount) reasons.push(`maxChangedCount ${maxChangedCount} > ${cfg.maxChangedCount}`);
    if (avgChangedCount > cfg.maxAvgChangedCount) reasons.push(`avgChangedCount ${avgChangedCount} > ${cfg.maxAvgChangedCount}`);
    alerts.push({
      key: g.key,
      query: g.query,
      mode: g.mode,
      level,
      reports,
      avgChangedCount,
      maxChangedCount,
      regressedErrors,
      reasons,
      latest: g.summary?.latest || null
    });
  }
  alerts.sort((a, b) => (a.level === b.level ? b.regressedErrors - a.regressedErrors : a.level === "high" ? -1 : 1));
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    config: cfg,
    summary: {
      totalGroups: groups.length,
      checkedGroups: picked.length,
      alertCount: alerts.length,
      high: alerts.filter((x) => x.level === "high").length,
      medium: alerts.filter((x) => x.level === "medium").length
    },
    alerts
  };
}

async function readWorkspaceFocusAlertsHistory(root) {
  const p = wsFocusAlertsHistoryPath(root);
  if (!(await fileExists(p))) return { schema: 1, updatedAt: null, incidents: [] };
  try {
    const j = await readJson(p);
    const incidents = Array.isArray(j?.incidents) ? j.incidents : [];
    return { schema: 1, updatedAt: j?.updatedAt || null, incidents };
  } catch {
    return { schema: 1, updatedAt: null, incidents: [] };
  }
}

function makeAlertsIncidentId() {
  const iso = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  const rand = Math.random().toString(36).slice(2, 8);
  return `alrt-${iso}-${rand}`;
}

function simplifyAlert(a) {
  return {
    key: String(a?.key || ""),
    query: String(a?.query || ""),
    mode: String(a?.mode || ""),
    level: String(a?.level || "medium"),
    reports: Number(a?.reports || 0),
    avgChangedCount: Number(a?.avgChangedCount || 0),
    maxChangedCount: Number(a?.maxChangedCount || 0),
    regressedErrors: Number(a?.regressedErrors || 0),
    reasons: Array.isArray(a?.reasons) ? a.reasons.map((x) => String(x)) : [],
    latest: a?.latest || null
  };
}

export async function appendWorkspaceFocusAlertIncident(root, { alerts, autoGovernance = null, source = "unknown", key = "" } = {}) {
  const out = alerts || {};
  const incident = {
    schema: 1,
    id: makeAlertsIncidentId(),
    createdAt: new Date().toISOString(),
    root,
    source: String(source || "unknown"),
    key: String(key || ""),
    summary: out?.summary || null,
    config: out?.config || null,
    alerts: (Array.isArray(out?.alerts) ? out.alerts : []).map(simplifyAlert),
    autoGovernance: autoGovernance || null
  };
  const history = await readWorkspaceFocusAlertsHistory(root);
  history.incidents.unshift(incident);
  history.incidents = history.incidents.slice(0, 500);
  history.updatedAt = new Date().toISOString();
  await fs.mkdir(wsFocusDir(root), { recursive: true });
  await writeJson(wsFocusAlertsHistoryPath(root), history);
  return incident;
}

function incidentMatches(incident, { key = "", level = "" } = {}) {
  const trendKey = String(key || "").trim();
  const lv = String(level || "").trim().toLowerCase();
  if (trendKey) {
    const hit = (Array.isArray(incident?.alerts) ? incident.alerts : []).some((a) => String(a?.key || "") === trendKey);
    if (!hit) return false;
  }
  if (lv) {
    const hit = (Array.isArray(incident?.alerts) ? incident.alerts : []).some((a) => String(a?.level || "").toLowerCase() === lv);
    if (!hit) return false;
  }
  return true;
}

export async function listWorkspaceFocusAlertIncidents(root, { limit = 20, key = "", level = "" } = {}) {
  const history = await readWorkspaceFocusAlertsHistory(root);
  const lim = Math.min(500, Math.max(1, Number(limit || 20)));
  const incidents = history.incidents.filter((x) => incidentMatches(x, { key, level })).slice(0, lim);
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    summary: {
      total: history.incidents.length,
      returned: incidents.length
    },
    incidents
  };
}

function summarizeRcaWindow(items) {
  const reasonCount = new Map();
  const levelCount = { high: 0, medium: 0 };
  const keyCount = new Map();
  let maxRegressed = 0;
  let maxChanged = 0;
  for (const inc of items) {
    for (const a of Array.isArray(inc?.alerts) ? inc.alerts : []) {
      const lv = String(a?.level || "");
      if (lv === "high") levelCount.high += 1;
      else if (lv === "medium") levelCount.medium += 1;
      maxRegressed = Math.max(maxRegressed, Number(a?.regressedErrors || 0));
      maxChanged = Math.max(maxChanged, Number(a?.maxChangedCount || 0));
      const key = String(a?.key || "");
      if (key) keyCount.set(key, (keyCount.get(key) || 0) + 1);
      for (const r of Array.isArray(a?.reasons) ? a.reasons : []) {
        const s = String(r || "");
        if (!s) continue;
        reasonCount.set(s, (reasonCount.get(s) || 0) + 1);
      }
    }
  }
  const topReasons = Array.from(reasonCount.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 5);
  const hotKeys = Array.from(keyCount.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, 5);
  return { levelCount, topReasons, hotKeys, maxRegressed, maxChanged };
}

function buildRcaRecommendations(stats, anchor) {
  const out = [];
  if (stats.levelCount.high >= 2) out.push("Multiple high alerts appeared in sequence; freeze risky changes and prioritize regression tests.");
  if (stats.maxRegressed > 0) out.push("Regressed errors were detected; add targeted regression tests and track follow-ups in rules/todos.");
  if (stats.maxChanged > 20) out.push("Changed-count volatility is high; split large batches into smaller module-level changes and monitor trends.");
  if (anchor?.autoGovernance?.triggered) out.push("Auto-governance was triggered; review governance policy and thresholds in the next iteration.");
  if (!out.length) out.push("Current risk is mostly medium-level drift; keep monitoring and preserve periodic trend snapshots.");
  return out;
}

function markdownFromRca(rca) {
  const lines = [];
  lines.push("# Workspace Alerts RCA");
  lines.push("");
  lines.push(`- generatedAt: ${rca.generatedAt}`);
  lines.push(`- incidentId: ${rca.anchor?.id || "-"}`);
  lines.push(`- keyFilter: ${rca.keyFilter || "(none)"}`);
  lines.push(`- windowSize: ${rca.window?.length || 0}`);
  lines.push("");
  lines.push("## Window Summary");
  lines.push(`- high: ${rca.stats?.levelCount?.high ?? 0}`);
  lines.push(`- medium: ${rca.stats?.levelCount?.medium ?? 0}`);
  lines.push(`- maxRegressedErrors: ${rca.stats?.maxRegressed ?? 0}`);
  lines.push(`- maxChangedCount: ${rca.stats?.maxChanged ?? 0}`);
  lines.push("");
  lines.push("## Top Reasons");
  if (!rca.stats?.topReasons?.length) lines.push("- (none)");
  else for (const r of rca.stats.topReasons) lines.push(`- ${r.reason} (${r.count})`);
  lines.push("");
  lines.push("## Hot Trend Keys");
  if (!rca.stats?.hotKeys?.length) lines.push("- (none)");
  else for (const k of rca.stats.hotKeys) lines.push(`- ${k.key} (${k.count})`);
  lines.push("");
  lines.push("## Recommendations");
  for (const x of rca.recommendations || []) lines.push(`- ${x}`);
  lines.push("");
  return lines.join("\n") + "\n";
}

export async function generateWorkspaceFocusAlertsRca(root, { incidentId = "", key = "", limit = 20 } = {}) {
  const history = await readWorkspaceFocusAlertsHistory(root);
  const filtered = history.incidents.filter((x) => incidentMatches(x, { key }));
  if (!filtered.length) throw new Error("alerts_history_empty");
  const byId = String(incidentId || "").trim();
  const anchor = byId ? filtered.find((x) => x.id === byId) : filtered[0];
  if (!anchor) throw new Error("incident_not_found");
  const lim = Math.min(200, Math.max(1, Number(limit || 20)));
  const anchorIdx = filtered.findIndex((x) => x.id === anchor.id);
  const window = filtered.slice(anchorIdx, anchorIdx + lim);
  const stats = summarizeRcaWindow(window);
  const rca = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    keyFilter: String(key || ""),
    anchor,
    window,
    stats,
    recommendations: buildRcaRecommendations(stats, anchor)
  };
  return {
    json: rca,
    markdown: markdownFromRca(rca)
  };
}

function makeAlertsActionId() {
  const iso = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  const rand = Math.random().toString(36).slice(2, 8);
  return `act-${iso}-${rand}`;
}

function toActionTask(text, { kind = "next", source = "rca" } = {}) {
  return {
    id: `task-${Math.random().toString(36).slice(2, 10)}`,
    kind: String(kind || "next"),
    text: String(text || "").trim(),
    source: String(source || "rca")
  };
}

function buildAlertsActionPlanFromRca(rca) {
  const tasks = [];
  const recommendations = Array.isArray(rca?.recommendations) ? rca.recommendations : [];
  for (const rec of recommendations) {
    if (rec) tasks.push(toActionTask(rec, { kind: "next", source: "recommendation" }));
  }
  const topReasons = Array.isArray(rca?.stats?.topReasons) ? rca.stats.topReasons : [];
  for (const r of topReasons.slice(0, 3)) {
    tasks.push(toActionTask(`Investigate alert reason: ${r.reason} (frequency ${r.count}).`, { kind: "next", source: "reason" }));
  }
  if ((rca?.stats?.maxRegressed ?? 0) > 0) {
    tasks.push(toActionTask("Add/refresh regression tests for the recently regressed workspace flows.", { kind: "next", source: "regression" }));
  }
  if ((rca?.stats?.levelCount?.high ?? 0) > 0) {
    tasks.push(toActionTask("Temporarily block high-risk refactors until high alerts drop below threshold.", { kind: "blocker", source: "high_alert" }));
  }
  const dedup = new Set();
  const uniq = [];
  for (const t of tasks) {
    const key = `${t.kind}::${t.text}`;
    if (!t.text || dedup.has(key)) continue;
    dedup.add(key);
    uniq.push(t);
  }
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root: rca?.root || "",
    rcaAnchor: rca?.anchor ? { id: rca.anchor.id, createdAt: rca.anchor.createdAt, key: rca.anchor.key || "" } : null,
    summary: {
      totalTasks: uniq.length,
      nextCount: uniq.filter((x) => x.kind === "next").length,
      blockerCount: uniq.filter((x) => x.kind === "blocker").length
    },
    tasks: uniq
  };
}

function markdownFromAlertsActionPlan(plan) {
  const lines = [];
  lines.push("# Workspace Alerts Action Plan");
  lines.push("");
  lines.push(`- generatedAt: ${plan.generatedAt}`);
  lines.push(`- anchorIncident: ${plan.rcaAnchor?.id || "-"}`);
  lines.push(`- tasks: ${plan.summary?.totalTasks || 0}`);
  lines.push("");
  lines.push("## Next");
  const next = (plan.tasks || []).filter((x) => x.kind === "next");
  if (!next.length) lines.push("- (none)");
  else for (const t of next) lines.push(`- ${t.text}`);
  lines.push("");
  lines.push("## Blockers");
  const blockers = (plan.tasks || []).filter((x) => x.kind === "blocker");
  if (!blockers.length) lines.push("- (none)");
  else for (const t of blockers) lines.push(`- ${t.text}`);
  lines.push("");
  return lines.join("\n") + "\n";
}

async function readWorkspaceFocusAlertsActionsIndex(root) {
  const p = wsFocusAlertsActionsIndexPath(root);
  if (!(await fileExists(p))) return { schema: 1, updatedAt: null, actions: [] };
  try {
    const j = await readJson(p);
    return {
      schema: 1,
      updatedAt: j?.updatedAt || null,
      actions: Array.isArray(j?.actions) ? j.actions : []
    };
  } catch {
    return { schema: 1, updatedAt: null, actions: [] };
  }
}

export async function generateWorkspaceFocusAlertsActionPlan(root, { incidentId = "", key = "", limit = 20 } = {}) {
  const rca = await generateWorkspaceFocusAlertsRca(root, { incidentId, key, limit });
  const plan = buildAlertsActionPlanFromRca(rca.json);
  return {
    json: plan,
    markdown: markdownFromAlertsActionPlan(plan)
  };
}

export async function saveWorkspaceFocusAlertsActionPlan(root, plan, { tag = "" } = {}) {
  const id = makeAlertsActionId();
  const doc = {
    schema: 1,
    id,
    createdAt: new Date().toISOString(),
    tag: String(tag || "").trim() || null,
    plan
  };
  await fs.mkdir(wsFocusAlertsActionsDir(root), { recursive: true });
  await writeJson(wsFocusAlertsActionPath(root, id), doc);
  const index = await readWorkspaceFocusAlertsActionsIndex(root);
  index.actions.unshift({
    id,
    createdAt: doc.createdAt,
    tag: doc.tag,
    anchorIncidentId: String(plan?.rcaAnchor?.id || ""),
    summary: {
      totalTasks: Number(plan?.summary?.totalTasks || 0),
      nextCount: Number(plan?.summary?.nextCount || 0),
      blockerCount: Number(plan?.summary?.blockerCount || 0)
    }
  });
  index.actions = index.actions.slice(0, 300);
  index.updatedAt = new Date().toISOString();
  await writeJson(wsFocusAlertsActionsIndexPath(root), index);
  return { id, path: wsFocusAlertsActionPath(root, id), action: doc };
}

export async function listWorkspaceFocusAlertsActions(root, { limit = 20 } = {}) {
  const lim = Math.min(300, Math.max(1, Number(limit || 20)));
  const index = await readWorkspaceFocusAlertsActionsIndex(root);
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    actions: index.actions.slice(0, lim)
  };
}

export async function getWorkspaceFocusAlertsAction(root, id) {
  const aid = String(id || "").trim();
  if (!aid) throw new Error("Missing action id");
  const p = wsFocusAlertsActionPath(root, aid);
  if (!(await fileExists(p))) throw new Error("action_not_found");
  const doc = await readJson(p);
  return {
    schema: 1,
    id: doc?.id || aid,
    createdAt: doc?.createdAt || null,
    tag: doc?.tag || null,
    plan: doc?.plan || null
  };
}

export async function applyWorkspaceFocusAlertsActionPlan(root, { id = "", includeBlockers = false, noLog = false, maxTasks = 20 } = {}) {
  const doc = await getWorkspaceFocusAlertsAction(root, id);
  const tasks = Array.isArray(doc?.plan?.tasks) ? doc.plan.tasks : [];
  const limit = Math.min(200, Math.max(1, Number(maxTasks || 20)));
  const picked = tasks.slice(0, limit);
  const applied = { next: [], blockers: [] };
  for (const t of picked) {
    if (t.kind === "blocker") {
      if (!includeBlockers) continue;
      // eslint-disable-next-line no-await-in-loop
      await addTodoBlocker(root, t.text);
      applied.blockers.push(t.text);
    } else {
      // eslint-disable-next-line no-await-in-loop
      await addTodoNext(root, t.text);
      applied.next.push(t.text);
    }
  }
  let journalPath = null;
  if (!noLog) {
    const lines = [];
    lines.push(`Applied workspace alerts action plan: ${doc.id}`);
    lines.push(`Tasks appended: next=${applied.next.length}, blockers=${applied.blockers.length}`);
    if (doc.plan?.rcaAnchor?.id) lines.push(`Anchor incident: ${doc.plan.rcaAnchor.id}`);
    if (applied.next.length) lines.push(`Next: ${applied.next.join(" | ")}`);
    if (applied.blockers.length) lines.push(`Blockers: ${applied.blockers.join(" | ")}`);
    journalPath = await appendJournalEntry(root, { kind: "WS Alerts Plan", text: lines.join("\n") });
  }
  return {
    schema: 1,
    appliedAt: new Date().toISOString(),
    root,
    actionId: doc.id,
    includeBlockers: !!includeBlockers,
    noLog: !!noLog,
    applied,
    journalPath
  };
}

const ACTION_BOARD_STATUSES = new Set(["todo", "doing", "done", "blocked"]);

function makeAlertsBoardId() {
  const iso = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  const rand = Math.random().toString(36).slice(2, 8);
  return `brd-${iso}-${rand}`;
}

function normalizeBoardStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (!ACTION_BOARD_STATUSES.has(s)) throw new Error("invalid_board_status");
  return s;
}

function boardSummary(items) {
  const out = { total: items.length, todo: 0, doing: 0, done: 0, blocked: 0 };
  for (const i of items) {
    const s = String(i?.status || "");
    if (s && out[s] !== undefined) out[s] += 1;
  }
  return out;
}

function boardPriority(a) {
  const s = String(a?.status || "todo");
  if (s === "blocked") return 0;
  if (s === "doing") return 1;
  if (s === "todo") return 2;
  if (s === "done") return 3;
  return 9;
}

function toBoardItem(task, idx) {
  return {
    id: `item-${String(task?.id || idx + 1)}`,
    taskId: String(task?.id || ""),
    kind: String(task?.kind || "next"),
    text: String(task?.text || ""),
    source: String(task?.source || "plan"),
    status: "todo",
    note: "",
    updatedAt: null
  };
}

async function readWorkspaceFocusAlertsBoardsIndex(root) {
  const p = wsFocusAlertsBoardsIndexPath(root);
  if (!(await fileExists(p))) return { schema: 1, updatedAt: null, boards: [] };
  try {
    const j = await readJson(p);
    return {
      schema: 1,
      updatedAt: j?.updatedAt || null,
      boards: Array.isArray(j?.boards) ? j.boards : []
    };
  } catch {
    return { schema: 1, updatedAt: null, boards: [] };
  }
}

export async function createWorkspaceFocusAlertsBoard(root, { actionId = "", title = "" } = {}) {
  const aid = String(actionId || "").trim();
  if (!aid) throw new Error("Missing action id");
  const action = await getWorkspaceFocusAlertsAction(root, aid);
  const tasks = Array.isArray(action?.plan?.tasks) ? action.plan.tasks : [];
  const items = tasks.map((t, idx) => toBoardItem(t, idx));
  const id = makeAlertsBoardId();
  const now = new Date().toISOString();
  const board = {
    schema: 1,
    id,
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    closeReason: "",
    root,
    title: String(title || "").trim() || `Action Board ${aid}`,
    actionId: aid,
    rcaAnchor: action?.plan?.rcaAnchor || null,
    summary: boardSummary(items),
    items
  };
  await fs.mkdir(wsFocusAlertsBoardsDir(root), { recursive: true });
  await writeJson(wsFocusAlertsBoardPath(root, id), board);
  const index = await readWorkspaceFocusAlertsBoardsIndex(root);
  index.boards.unshift({
    id,
    createdAt: now,
    updatedAt: now,
    title: board.title,
    actionId: aid,
    summary: board.summary
  });
  index.boards = index.boards.slice(0, 300);
  index.updatedAt = now;
  await writeJson(wsFocusAlertsBoardsIndexPath(root), index);
  return { id, path: wsFocusAlertsBoardPath(root, id), board };
}

export async function listWorkspaceFocusAlertsBoards(root, { limit = 20 } = {}) {
  const lim = Math.min(300, Math.max(1, Number(limit || 20)));
  const index = await readWorkspaceFocusAlertsBoardsIndex(root);
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    boards: index.boards.slice(0, lim)
  };
}

export async function getWorkspaceFocusAlertsBoard(root, id) {
  const bid = String(id || "").trim();
  if (!bid) throw new Error("Missing board id");
  const p = wsFocusAlertsBoardPath(root, bid);
  if (!(await fileExists(p))) throw new Error("board_not_found");
  return readJson(p);
}

async function touchWorkspaceFocusAlertsBoardIndex(root, board) {
  const index = await readWorkspaceFocusAlertsBoardsIndex(root);
  const at = new Date().toISOString();
  const meta = {
    id: board.id,
    createdAt: board.createdAt || at,
    updatedAt: at,
    title: board.title || "",
    actionId: board.actionId || "",
    summary: board.summary || { total: 0, todo: 0, doing: 0, done: 0, blocked: 0 }
  };
  const rest = index.boards.filter((x) => x.id !== board.id);
  index.boards = [meta, ...rest].slice(0, 300);
  index.updatedAt = at;
  await writeJson(wsFocusAlertsBoardsIndexPath(root), index);
}

export async function updateWorkspaceFocusAlertsBoardItem(root, { boardId = "", itemId = "", status = "", note = "" } = {}) {
  const bid = String(boardId || "").trim();
  const iid = String(itemId || "").trim();
  if (!bid) throw new Error("Missing board id");
  if (!iid) throw new Error("Missing item id");
  const nextStatus = normalizeBoardStatus(status);
  const board = await getWorkspaceFocusAlertsBoard(root, bid);
  if (board?.closedAt) throw new Error("board_closed");
  const items = Array.isArray(board?.items) ? board.items : [];
  const idx = items.findIndex((x) => x.id === iid);
  if (idx < 0) throw new Error("board_item_not_found");
  const now = new Date().toISOString();
  items[idx] = {
    ...items[idx],
    status: nextStatus,
    note: String(note || "").trim(),
    updatedAt: now
  };
  board.items = items;
  board.updatedAt = now;
  board.summary = boardSummary(items);
  await writeJson(wsFocusAlertsBoardPath(root, bid), board);
  await touchWorkspaceFocusAlertsBoardIndex(root, board);
  return {
    schema: 1,
    updatedAt: now,
    boardId: bid,
    item: items[idx],
    summary: board.summary
  };
}

export async function generateWorkspaceFocusAlertsBoardReport(root, { boardId = "", maxItems = 20 } = {}) {
  const bid = String(boardId || "").trim();
  if (!bid) throw new Error("Missing board id");
  const board = await getWorkspaceFocusAlertsBoard(root, bid);
  const items = Array.isArray(board?.items) ? board.items : [];
  const summary = board.summary || boardSummary(items);
  const lim = Math.min(200, Math.max(1, Number(maxItems || 20)));
  const pending = items
    .filter((x) => x.status !== "done")
    .sort((a, b) => boardPriority(a) - boardPriority(b) || String(a.id).localeCompare(String(b.id)))
    .slice(0, lim)
    .map((x) => ({ id: x.id, status: x.status, kind: x.kind, text: x.text, note: x.note || "" }));
  const done = items
    .filter((x) => x.status === "done")
    .slice(0, lim)
    .map((x) => ({ id: x.id, kind: x.kind, text: x.text }));
  const percent = summary.total > 0 ? Number(((summary.done / summary.total) * 100).toFixed(1)) : 0;
  const json = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    board: {
      id: board.id,
      title: board.title || "",
      actionId: board.actionId || "",
      createdAt: board.createdAt || null,
      updatedAt: board.updatedAt || null,
      closedAt: board.closedAt || null,
      closeReason: board.closeReason || "",
      summary,
      progressPercent: percent
    },
    pending,
    completedPreview: done
  };
  const lines = [];
  lines.push(`# Workspace Alerts Board Report ${board.id}`);
  lines.push("");
  lines.push(`- title: ${board.title || "-"}`);
  lines.push(`- actionId: ${board.actionId || "-"}`);
  lines.push(`- createdAt: ${board.createdAt || "-"}`);
  lines.push(`- updatedAt: ${board.updatedAt || "-"}`);
  lines.push(`- closedAt: ${board.closedAt || "-"}`);
  lines.push(`- progress: ${summary.done}/${summary.total} (${percent}%)`);
  lines.push(`- status: todo=${summary.todo} doing=${summary.doing} blocked=${summary.blocked} done=${summary.done}`);
  if (board.closeReason) lines.push(`- closeReason: ${board.closeReason}`);
  lines.push("");
  lines.push("## Pending (priority)");
  if (!pending.length) lines.push("- (none)");
  else for (const p of pending) lines.push(`- ${p.id} [${p.status}] [${p.kind}] ${p.text}${p.note ? ` (note: ${p.note})` : ""}`);
  lines.push("");
  lines.push("## Done (preview)");
  if (!done.length) lines.push("- (none)");
  else for (const d of done) lines.push(`- ${d.id} [${d.kind}] ${d.text}`);
  lines.push("");
  return { json, markdown: lines.join("\n") };
}

export async function closeWorkspaceFocusAlertsBoard(root, { boardId = "", reason = "", force = false, noLog = false } = {}) {
  const bid = String(boardId || "").trim();
  if (!bid) throw new Error("Missing board id");
  const board = await getWorkspaceFocusAlertsBoard(root, bid);
  if (board?.closedAt) return { schema: 1, boardId: bid, alreadyClosed: true, closedAt: board.closedAt, closeReason: board.closeReason || "" };
  const items = Array.isArray(board?.items) ? board.items : [];
  const summary = board.summary || boardSummary(items);
  const openCount = Number(summary.todo || 0) + Number(summary.doing || 0) + Number(summary.blocked || 0);
  if (openCount > 0 && !force) throw new Error("board_not_ready_to_close");
  const now = new Date().toISOString();
  board.closedAt = now;
  board.closeReason = String(reason || "").trim();
  board.updatedAt = now;
  board.summary = summary;
  await writeJson(wsFocusAlertsBoardPath(root, bid), board);
  await touchWorkspaceFocusAlertsBoardIndex(root, board);
  let journalPath = null;
  if (!noLog) {
    const lines = [];
    lines.push(`Closed workspace alerts board: ${bid}`);
    lines.push(`Action: ${board.actionId || "-"}`);
    lines.push(`Progress: done=${summary.done}/${summary.total}`);
    lines.push(`Open at close: todo=${summary.todo} doing=${summary.doing} blocked=${summary.blocked}`);
    if (board.closeReason) lines.push(`Reason: ${board.closeReason}`);
    journalPath = await appendJournalEntry(root, { kind: "WS Alerts Board", text: lines.join("\n") });
  }
  return {
    schema: 1,
    boardId: bid,
    closedAt: now,
    closeReason: board.closeReason || "",
    forced: !!force,
    noLog: !!noLog,
    summary: board.summary,
    journalPath
  };
}

function hoursSince(ts, nowMs) {
  const t = Date.parse(String(ts || ""));
  if (!Number.isFinite(t) || t <= 0) return null;
  return (nowMs - t) / 3600000;
}

function pulseLevelForItem(item, ageHours, thresholds) {
  if (item.status === "done") return null;
  const th = Number(thresholds?.[item.status] || 0);
  if (th <= 0) return null;
  if (ageHours === null || ageHours < th) return null;
  if (ageHours >= th * 2) return "critical";
  return "warn";
}

async function appendWorkspaceFocusAlertsBoardsPulse(root, pulse, { source = "ws-alert-board-pulse" } = {}) {
  const p = wsFocusAlertsBoardsPulsePath(root);
  let doc = { schema: 1, updatedAt: null, incidents: [] };
  if (await fileExists(p)) {
    try {
      const j = await readJson(p);
      doc = {
        schema: 1,
        updatedAt: j?.updatedAt || null,
        incidents: Array.isArray(j?.incidents) ? j.incidents : []
      };
    } catch {
      // ignore malformed history and reset
    }
  }
  const now = new Date().toISOString();
  const incident = {
    id: `bpl-${now.replace(/[-:]/g, "").replace(/\..+$/, "Z")}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    source: String(source || "ws-alert-board-pulse"),
    summary: pulse.summary || null,
    top: (pulse.overdueItems || []).slice(0, 20)
  };
  doc.incidents.unshift(incident);
  doc.incidents = doc.incidents.slice(0, 500);
  doc.updatedAt = now;
  await writeJson(p, doc);
  return incident;
}

export async function listWorkspaceFocusAlertsBoardsPulseHistory(root, { limit = 20 } = {}) {
  const lim = Math.min(300, Math.max(1, Number(limit || 20)));
  const p = wsFocusAlertsBoardsPulsePath(root);
  if (!(await fileExists(p))) {
    return { schema: 1, generatedAt: new Date().toISOString(), root, incidents: [] };
  }
  try {
    const j = await readJson(p);
    return {
      schema: 1,
      generatedAt: new Date().toISOString(),
      root,
      incidents: Array.isArray(j?.incidents) ? j.incidents.slice(0, lim) : []
    };
  } catch {
    return { schema: 1, generatedAt: new Date().toISOString(), root, incidents: [] };
  }
}

export const WS_ALERTS_BOARD_PULSE_POLICIES = {
  strict: { todoHours: 12, doingHours: 6, blockedHours: 2, dedupeWindowHours: 24 },
  balanced: { todoHours: 24, doingHours: 12, blockedHours: 6, dedupeWindowHours: 72 },
  relaxed: { todoHours: 72, doingHours: 48, blockedHours: 24, dedupeWindowHours: 168 }
};

export async function getWorkspaceFocusAlertsBoardPolicy(root) {
  let doc = { wsAlerts: {} };
  const p = configPath(root);
  if (await fileExists(p)) {
    try {
      doc = await readJson(p);
      doc.wsAlerts = doc.wsAlerts || {};
    } catch {
      // Ignore
    }
  }
  return {
    boardPulsePolicy: doc.wsAlerts.boardPulsePolicy || "balanced",
    boardPulseDedupePolicy: doc.wsAlerts.boardPulseDedupePolicy || "balanced"
  };
}

export async function setWorkspaceFocusAlertsBoardPolicy(root, patch) {
  let doc = { wsAlerts: {} };
  const p = configPath(root);
  if (await fileExists(p)) {
    try {
      doc = await readJson(p);
      doc.wsAlerts = doc.wsAlerts || {};
    } catch {
      // Ignore
    }
  }
  if (patch.boardPulsePolicy) doc.wsAlerts.boardPulsePolicy = patch.boardPulsePolicy;
  if (patch.boardPulseDedupePolicy) doc.wsAlerts.boardPulseDedupePolicy = patch.boardPulseDedupePolicy;
  await writeJson(p, doc);
  return {
    boardPulsePolicy: doc.wsAlerts.boardPulsePolicy,
    boardPulseDedupePolicy: doc.wsAlerts.boardPulseDedupePolicy
  };
}

export async function evaluateWorkspaceFocusAlertsBoardsPulse(
  root,
  {
    limitBoards = 50,
    todoHours,
    doingHours,
    blockedHours,
    policy,
    save = false,
    source = "ws-alert-board-pulse"
  } = {}
) {
  const boardsOut = await listWorkspaceFocusAlertsBoards(root, { limit: limitBoards });
  const nowMs = Date.now();

  let resolvedPolicyName = policy;
  if (!resolvedPolicyName || !WS_ALERTS_BOARD_PULSE_POLICIES[resolvedPolicyName]) {
    const pConfig = await getWorkspaceFocusAlertsBoardPolicy(root);
    resolvedPolicyName = pConfig.boardPulsePolicy;
  }
  const tpl = WS_ALERTS_BOARD_PULSE_POLICIES[resolvedPolicyName] || WS_ALERTS_BOARD_PULSE_POLICIES.balanced;

  const thresholds = {
    todo: Math.max(1, Number(todoHours ?? tpl.todoHours)),
    doing: Math.max(1, Number(doingHours ?? tpl.doingHours)),
    blocked: Math.max(1, Number(blockedHours ?? tpl.blockedHours))
  };
  const overdueItems = [];
  const openBoards = [];

  for (const meta of boardsOut.boards) {
    // eslint-disable-next-line no-await-in-loop
    const board = await getWorkspaceFocusAlertsBoard(root, meta.id);
    if (board?.closedAt) continue;
    const items = Array.isArray(board?.items) ? board.items : [];
    const boardOverdue = [];
    for (const item of items) {
      if (item.status === "done") continue;
      const anchor = item.updatedAt || board.updatedAt || board.createdAt;
      const ageHoursRaw = hoursSince(anchor, nowMs);
      const ageHours = ageHoursRaw === null ? null : Number(ageHoursRaw.toFixed(1));
      const level = pulseLevelForItem(item, ageHoursRaw, thresholds);
      if (!level) continue;
      const row = {
        boardId: board.id,
        boardTitle: board.title || "",
        actionId: board.actionId || "",
        itemId: item.id,
        status: item.status,
        kind: item.kind,
        text: item.text,
        note: item.note || "",
        ageHours,
        thresholdHours: thresholds[item.status] || null,
        level
      };
      overdueItems.push(row);
      boardOverdue.push(row);
    }
    openBoards.push({
      id: board.id,
      title: board.title || "",
      actionId: board.actionId || "",
      summary: board.summary || boardSummary(items),
      overdueCount: boardOverdue.length
    });
  }

  overdueItems.sort((a, b) => {
    const lv = (x) => (x.level === "critical" ? 0 : 1);
    return lv(a) - lv(b) || Number(b.ageHours || 0) - Number(a.ageHours || 0);
  });
  openBoards.sort((a, b) => Number(b.overdueCount || 0) - Number(a.overdueCount || 0));

  const summary = {
    openBoards: openBoards.length,
    boardsWithOverdue: openBoards.filter((x) => x.overdueCount > 0).length,
    overdueItems: overdueItems.length,
    criticalItems: overdueItems.filter((x) => x.level === "critical").length,
    warnItems: overdueItems.filter((x) => x.level === "warn").length,
    thresholds
  };
  const out = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    summary,
    boards: openBoards.slice(0, 100),
    overdueItems: overdueItems.slice(0, 300)
  };

  let incident = null;
  if (save) incident = await appendWorkspaceFocusAlertsBoardsPulse(root, out, { source });
  return { ...out, incident };
}

export async function generateWorkspaceFocusAlertsBoardsPulsePlan(
  root,
  { limitBoards = 50, todoHours, doingHours, blockedHours, policy, limitItems = 20, includeWarn = false } = {}
) {
  const pulse = await evaluateWorkspaceFocusAlertsBoardsPulse(root, { limitBoards, todoHours, doingHours, blockedHours, policy, save: false });
  const lim = Math.min(200, Math.max(1, Number(limitItems || 20)));
  const candidates = (pulse.overdueItems || []).filter((x) => includeWarn || x.level === "critical").slice(0, lim);
  const tasks = candidates.map((x) => {
    const item = `${x.boardId}/${x.itemId}`;
    const age = x.ageHours !== null && x.ageHours !== undefined ? `${x.ageHours}h` : "?";
    if (x.status === "blocked") {
      return {
        kind: "blocker",
        boardId: x.boardId,
        itemId: x.itemId,
        level: x.level,
        text: `Escalate blocked task ${item}: ${x.text} (age ${age}, threshold ${x.thresholdHours}h)`
      };
    }
    return {
      kind: "next",
      boardId: x.boardId,
      itemId: x.itemId,
      level: x.level,
      text: `Drive overdue ${x.status} task ${item}: ${x.text} (age ${age}, threshold ${x.thresholdHours}h)`
    };
  });
  const json = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    policy: { limitBoards, todoHours: pulse.summary.thresholds.todo, doingHours: pulse.summary.thresholds.doing, blockedHours: pulse.summary.thresholds.blocked, policy, limitItems: lim, includeWarn: !!includeWarn },
    pulseSummary: pulse.summary || null,
    taskSummary: {
      total: tasks.length,
      next: tasks.filter((t) => t.kind === "next").length,
      blocker: tasks.filter((t) => t.kind === "blocker").length
    },
    tasks
  };
  const lines = [];
  lines.push("# Workspace Alerts Board Pulse Plan");
  lines.push("");
  lines.push(`- candidates: ${json.taskSummary.total}`);
  lines.push(`- next: ${json.taskSummary.next}, blocker: ${json.taskSummary.blocker}`);
  lines.push(`- includeWarn: ${json.policy.includeWarn ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Tasks");
  if (!tasks.length) lines.push("- (none)");
  else for (const t of tasks) lines.push(`- [${t.kind}] [${t.level}] ${t.text}`);
  lines.push("");
  return { json, markdown: lines.join("\n") };
}

async function readWorkspaceFocusAlertsBoardsPulseApplied(root) {
  const p = wsFocusAlertsBoardsPulseAppliedPath(root);
  if (!(await fileExists(p))) return { schema: 1, updatedAt: null, appliedKeys: {} };
  try {
    const j = await readJson(p);
    return {
      schema: 1,
      updatedAt: j?.updatedAt || null,
      appliedKeys: j?.appliedKeys || {}
    };
  } catch {
    return { schema: 1, updatedAt: null, appliedKeys: {} };
  }
}

async function writeWorkspaceFocusAlertsBoardsPulseApplied(root, newKeys, windowHours) {
  const doc = await readWorkspaceFocusAlertsBoardsPulseApplied(root);
  const now = new Date().toISOString();
  const nowMs = Date.parse(now);
  const merged = { ...doc.appliedKeys, ...newKeys };

  if (windowHours > 0) {
    for (const [k, ts] of Object.entries(merged)) {
      const tms = Date.parse(ts);
      if (Number.isFinite(tms) && (nowMs - tms) / 3600000 > windowHours) {
        delete merged[k];
      }
    }
  }

  doc.appliedKeys = merged;
  doc.updatedAt = now;
  await writeJson(wsFocusAlertsBoardsPulseAppliedPath(root), doc);
}

export async function applyWorkspaceFocusAlertsBoardsPulsePlan(
  root,
  {
    limitBoards = 50,
    todoHours,
    doingHours,
    blockedHours,
    policy,
    limitItems = 20,
    includeWarn = false,
    noLog = false,
    dedupe = true,
    dedupeWindowHours,
    dryRun = false
  } = {}
) {
  let resolvedDedupePolicyName = policy;
  if (!resolvedDedupePolicyName || !WS_ALERTS_BOARD_PULSE_POLICIES[resolvedDedupePolicyName]) {
    const pConfig = await getWorkspaceFocusAlertsBoardPolicy(root);
    resolvedDedupePolicyName = pConfig.boardPulseDedupePolicy;
  }
  const tpl = WS_ALERTS_BOARD_PULSE_POLICIES[resolvedDedupePolicyName] || WS_ALERTS_BOARD_PULSE_POLICIES.balanced;
  const resolvedDedupeWindowHours = Math.max(1, Number(dedupeWindowHours ?? tpl.dedupeWindowHours));

  const plan = await generateWorkspaceFocusAlertsBoardsPulsePlan(root, {
    limitBoards,
    todoHours,
    doingHours,
    blockedHours,
    policy,
    limitItems,
    includeWarn
  });
  const tasks = Array.isArray(plan?.json?.tasks) ? plan.json.tasks : [];

  const appliedDoc = dedupe ? await readWorkspaceFocusAlertsBoardsPulseApplied(root) : { appliedKeys: {} };
  const appliedKeys = appliedDoc.appliedKeys || {};
  const newKeys = {};
  const currentMs = Date.now();

  const candidates = [];
  let skippedDuplicateCount = 0;

  for (const t of tasks) {
    if (dedupe) {
      const key = `${t.boardId}:${t.itemId}:${t.kind}`;
      const prevTs = appliedKeys[key];
      if (prevTs) {
        const prevMs = Date.parse(prevTs);
        if (Number.isFinite(prevMs) && (currentMs - prevMs) / 3600000 <= resolvedDedupeWindowHours) {
          skippedDuplicateCount++;
          continue;
        }
      }
      newKeys[key] = new Date().toISOString();
    }
    candidates.push(t);
  }

  const applied = { next: [], blocker: [] };

  if (!dryRun) {
    for (const t of candidates) {
      if (t.kind === "blocker") {
        // eslint-disable-next-line no-await-in-loop
        await addTodoBlocker(root, t.text);
        applied.blocker.push(t.text);
      } else {
        // eslint-disable-next-line no-await-in-loop
        await addTodoNext(root, t.text);
        applied.next.push(t.text);
      }
    }
  }

  let journalPath = null;
  if (!noLog && !dryRun) {
    const lines = [];
    lines.push("Applied workspace alerts board pulse plan");
    lines.push(`Tasks appended: next=${applied.next.length}, blocker=${applied.blocker.length} (skipped duplicate: ${skippedDuplicateCount})`);
    if (applied.next.length) lines.push(`Next: ${applied.next.join(" | ")}`);
    if (applied.blocker.length) lines.push(`Blockers: ${applied.blocker.join(" | ")}`);
    journalPath = await appendJournalEntry(root, { kind: "WS Alerts Pulse", text: lines.join("\n") });
  }

  if (dedupe && Object.keys(newKeys).length > 0 && !dryRun) {
    await writeWorkspaceFocusAlertsBoardsPulseApplied(root, newKeys, resolvedDedupeWindowHours);
  }

  return {
    schema: 1,
    appliedAt: new Date().toISOString(),
    root,
    policy: { ...plan.json.policy, dedupe: !!dedupe, dedupeWindowHours: resolvedDedupeWindowHours, dryRun: !!dryRun },
    taskSummary: {
      proposedCount: tasks.length,
      appendedCount: applied.next.length + applied.blocker.length,
      skippedDuplicateCount
    },
    applied,
    noLog: !!noLog,
    dryRun: !!dryRun,
    journalPath
  };
}

// ------------------------------------------------------------------
// v0.38.0 Action Jobs (Execution Orchestration)
// ------------------------------------------------------------------

function generateJobId() {
  return "job_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
}

export async function enqueueWorkspaceFocusAlertsActionJob(root, { actionId, priority = "normal", batchSize = 10, retryPolicy = "standard", events } = {}) {
  const actionsDir = wsFocusAlertsActionsDir(root);
  const actionPath = path.join(actionsDir, `${actionId}.json`);
  if (!(await fileExists(actionPath))) {
    throw new Error(`Action plan not found: ${actionId}`);
  }

  const actionData = await readJson(actionPath);
  const tasks = Array.isArray(actionData?.plan?.tasks) ? actionData.plan.tasks : [];

  const job = {
    schema: 1,
    id: generateJobId(),
    actionId,
    status: "queued",
    config: {
      priority,
      batchSize: Number(batchSize),
      retryPolicy
    },
    state: {
      processedCount: 0,
      successCount: 0,
      errorCount: 0,
      errors: [],
      resumeToken: 0
    },
    tasks, // Copy the tasks so the job is isolated from action updates
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const jobPath = wsFocusAlertsActionJobPath(root, job.id);
  await fs.mkdir(wsFocusAlertsActionJobsDir(root), { recursive: true });
  await writeJson(jobPath, job);

  // Update index
  const indexPath = wsFocusAlertsActionJobsIndexPath(root);
  let index = { schema: 1, jobs: [] };
  if (await fileExists(indexPath)) {
    index = await readJson(indexPath);
    if (!Array.isArray(index.jobs)) index.jobs = [];
  }
  index.jobs.push({
    id: job.id,
    actionId: job.actionId,
    status: job.status,
    createdAt: job.createdAt
  });
  await writeJson(indexPath, index);

  // Background execution
  processWorkspaceFocusAlertsActionJob(root, job.id, { events }).catch((err) => {
    console.error(`Action Job ${job.id} background execution failed:`, err);
  });

  return job;
}

export async function listWorkspaceFocusAlertsActionJobs(root, { limit = 20 } = {}) {
  const indexPath = wsFocusAlertsActionJobsIndexPath(root);
  if (!(await fileExists(indexPath))) {
    return { schema: 1, jobs: [] };
  }
  const index = await readJsonSafe(indexPath);
  let jobs = Array.isArray(index.jobs) ? index.jobs : [];

  // Sort by newest first
  jobs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  if (limit > 0) {
    jobs = jobs.slice(0, limit);
  }

  return { schema: 1, limit, jobs };
}

export async function getWorkspaceFocusAlertsActionJob(root, jobId) {
  const jobPath = wsFocusAlertsActionJobPath(root, jobId);
  if (!(await fileExists(jobPath))) {
    throw new Error(`Action job not found: ${jobId}`);
  }
  return await readJsonSafe(jobPath);
}

async function updateActionJobStatus(root, jobId, newStatus) {
  const jobPath = wsFocusAlertsActionJobPath(root, jobId);
  if (!(await fileExists(jobPath))) {
    throw new Error(`Action job not found: ${jobId}`);
  }

  const job = await readJsonSafe(jobPath);
  job.status = newStatus;
  job.updatedAt = new Date().toISOString();
  await writeJson(jobPath, job);

  // Update index
  const indexPath = wsFocusAlertsActionJobsIndexPath(root);
  if (await fileExists(indexPath)) {
    const index = await readJsonSafe(indexPath);
    const mapped = index.jobs?.find(j => j.id === jobId);
    if (mapped) {
      mapped.status = newStatus;
      await writeJson(indexPath, index);
    }
  }

  return job;
}

export async function pauseWorkspaceFocusAlertsActionJob(root, jobId, { events } = {}) {
  const job = await updateActionJobStatus(root, jobId, "paused");
  events?.emit?.({ type: "ws:alerts:action-job:status", jobId, status: "paused" });
  return job;
}

export async function resumeWorkspaceFocusAlertsActionJob(root, jobId, { events } = {}) {
  const job = await updateActionJobStatus(root, jobId, "running");
  events?.emit?.({ type: "ws:alerts:action-job:status", jobId, status: "running" });

  // Kick off background execution again
  processWorkspaceFocusAlertsActionJob(root, job.id, { events }).catch((err) => {
    console.error(`Action Job ${job.id} resume execution failed:`, err);
  });

  return job;
}

export async function cancelWorkspaceFocusAlertsActionJob(root, jobId, { events } = {}) {
  const job = await updateActionJobStatus(root, jobId, "canceled");
  events?.emit?.({ type: "ws:alerts:action-job:status", jobId, status: "canceled" });
  return job;
}

export async function processWorkspaceFocusAlertsActionJob(root, jobId, { events } = {}) {
  let job = await getWorkspaceFocusAlertsActionJob(root, jobId);
  if (job.status !== "running" && job.status !== "queued") {
    return job; // Already paused, canceled, or finished
  }

  // Mark running if queued
  if (job.status === "queued") {
    job = await updateActionJobStatus(root, jobId, "running");
    events?.emit?.({ type: "ws:alerts:action-job:status", jobId, status: "running" });
  }
  if (!job.state.startedAt) {
    job.state.startedAt = new Date().toISOString();
    await writeJson(wsFocusAlertsActionJobPath(root, jobId), job);
  }

  const batchSize = job.config.batchSize || 10;

  while (job.state.resumeToken < job.tasks.length) {
    // Re-read job state to check if it was paused or canceled externally (e.g. via UI/MCP)
    const freshJob = await getWorkspaceFocusAlertsActionJob(root, jobId);
    if (freshJob.status !== "running") {
      events?.emit?.({ type: "ws:alerts:action-job:status", jobId, status: freshJob.status });
      return freshJob; // Halted externally
    }
    job.status = freshJob.status;

    const batch = job.tasks.slice(job.state.resumeToken, job.state.resumeToken + batchSize);

    // Process batch (analogous to how applyWorkspaceFocusAlertsBoardsPulsePlan does it)
    for (const t of batch) {
      try {
        if (t.kind === "blocker") {
          await addTodoBlocker(root, t.text);
        } else {
          await addTodoNext(root, t.text);
        }
        job.state.successCount++;
      } catch (err) {
        job.state.errorCount++;
        job.state.errors.push({
          taskId: t.id,
          message: err.message,
          time: new Date().toISOString()
        });
      }
      job.state.processedCount++;
      job.state.resumeToken++;
    }

    // Persist batch progress
    job.updatedAt = new Date().toISOString();
    await writeJson(wsFocusAlertsActionJobPath(root, jobId), job);

    events?.emit?.({
      type: "ws:alerts:action-job:progress",
      jobId,
      processedCount: job.state.processedCount,
      total: job.tasks.length,
      successCount: job.state.successCount,
      errorCount: job.state.errorCount
    });

    // Optional delay between batches to reduce load can be added here if retryPolicy dictates
  }

  // Finished all tasks
  job.status = job.state.errorCount === 0 ? "succeeded" : "failed";
  job.state.completedAt = new Date().toISOString();
  job.updatedAt = new Date().toISOString();
  await writeJson(wsFocusAlertsActionJobPath(root, jobId), job);

  // Update index
  await updateActionJobStatus(root, jobId, job.status);
  events?.emit?.({ type: "ws:alerts:action-job:status", jobId, status: job.status });

  return job;
}
