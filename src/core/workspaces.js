import path from "node:path";
import { scanRepo } from "./scan.js";
import { generateFocus } from "./focus.js";

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
