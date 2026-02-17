import path from "node:path";
import fs from "node:fs/promises";
import { resolveRoot } from "../lib/paths.js";
import { scanRepo } from "../core/scan.js";
import { cmdStart } from "./start.js";
import { cmdStatus } from "./status.js";
import { cmdHandoff } from "./handoff.js";
import { cmdPr } from "./pr.js";
import { cmdSync } from "./sync.js";
import { cmdEmbed } from "./embed.js";
import { generateFocus } from "../core/focus.js";
import {
  batchWorkspaceFocus,
  compareWorkspaceFocusSnapshots,
  compareWorkspaceFocusWithLatest,
  getWorkspaceFocusReport,
  generateWorkspaceFocusReport,
  listWorkspaceFocusReports,
  listWorkspaceFocusSnapshots,
  saveWorkspaceFocusReport,
  saveWorkspaceFocusSnapshot
} from "../core/workspaces.js";
import { ensureRepoMemory } from "../core/memory.js";
import { wsSummaryPath } from "../lib/paths.js";
import { generateHandoff } from "../core/handoff.js";
import { generatePr } from "../core/pr.js";
import { syncAiInstructions } from "../core/sync.js";
import { refreshRepoMemory } from "../core/watch.js";
import { embedAuto } from "../core/embed_auto.js";

function isNumberLike(s) {
  return /^[0-9]+$/.test(String(s || ""));
}

function splitList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function wsHelp() {
  return [
    "Usage:",
    "  rmemo ws ls",
    "  rmemo ws batch <start|status|handoff|pr|sync|embed> [--only <dirs>] [--format <md|json>]",
    "  rmemo ws start <n|dir>",
    "  rmemo ws status <n|dir>",
    "  rmemo ws handoff <n|dir>",
    "  rmemo ws pr <n|dir> [--base <ref>]",
    "  rmemo ws sync <n|dir> [--targets ...]",
    "  rmemo ws embed <n|dir> <auto|build|search> [...args]",
    "  rmemo ws focus <n|dir> <query> [--mode semantic|keyword] [--format md|json]",
    "  rmemo ws batch focus <query> [--mode semantic|keyword] [--format md|json]",
    "  rmemo ws focus-history list [--limit <n>]",
    "  rmemo ws focus-history compare <fromId> <toId>",
    "  rmemo ws focus-history report [<fromId> <toId>] [--format md|json] [--save-report] [--report-tag <name>]",
    "  rmemo ws report-history list [--limit <n>]",
    "  rmemo ws report-history show <reportId> [--format md|json]",
    "",
    "Notes:",
    "- Workspaces are detected from repo scan (manifest.subprojects).",
    "- <n> refers to the index printed by `rmemo ws ls`.",
    "- For batch: `--only` is a comma-separated list of subproject dirs (e.g. apps/admin-web,apps/miniapp).",
    "- For batch embed: use `--check` to audit (non-zero if any workspace is out of date).",
    "- For batch focus: use `--save` to write snapshot; `--compare-latest` to compare with latest saved snapshot.",
    "- Use `ws focus-history list|compare|report` to inspect workspace focus trend.",
    "- Use `ws report-history list|show` to inspect saved drift reports."
  ].join("\n");
}

function renderWsList(manifest) {
  const sps = Array.isArray(manifest?.subprojects) ? manifest.subprojects : [];
  const lines = [];
  lines.push("# Workspaces\n");
  lines.push(`Root: ${manifest?.root || ""}\n`);
  lines.push(`Generated: ${manifest?.generatedAt || new Date().toISOString()}\n`);
  if (!sps.length) {
    lines.push("No subprojects detected.\n");
    lines.push("Tip: run `rmemo scan --format md` to inspect heuristics.\n");
    return lines.join("\n").trimEnd() + "\n";
  }
  for (let i = 0; i < sps.length; i++) {
    const sp = sps[i];
    const reasons = Array.isArray(sp.reasons) && sp.reasons.length ? ` (${sp.reasons.join(", ")})` : "";
    lines.push(`${i + 1}. ${sp.dir}${reasons}`);
  }
  lines.push("");
  return lines.join("\n").trimEnd() + "\n";
}

function pickWorkspace(manifest, pick) {
  const sps = Array.isArray(manifest?.subprojects) ? manifest.subprojects : [];
  if (!sps.length) return null;
  const p = String(pick || "").trim();
  if (!p) return null;
  if (isNumberLike(p)) {
    const idx = Number(p) - 1;
    if (idx >= 0 && idx < sps.length) return sps[idx];
    return null;
  }
  return sps.find((x) => x.dir === p) || null;
}

async function writeWsSummary(root, text) {
  await ensureRepoMemory(root);
  const p = wsSummaryPath(root);
  await fs.writeFile(p, text, "utf8");
  return p;
}

function renderBatchMd({ root, cmd, results }) {
  const lines = [];
  lines.push("# Workspace Batch\n");
  lines.push(`Root: ${root}\n`);
  lines.push(`Generated: ${new Date().toISOString()}\n`);
  lines.push(`Command: ${cmd}\n`);
  lines.push("");
  if (cmd === "focus") {
    lines.push("## Focus Summary\n");
    for (const r of results) {
      const status = r.ok ? "OK" : "ERR";
      if (!r.ok) {
        lines.push(`- ${status} ${r.dir}${r.error ? ` (${r.error})` : ""}`);
        continue;
      }
      const head = `- ${status} ${r.dir}: hits=${Number(r.hits || 0)} mode=${r.mode || "-"}`;
      const top = r.top || null;
      if (!top) {
        lines.push(head);
        continue;
      }
      const loc =
        top.startLine !== null && top.startLine !== undefined
          ? `${top.file}:${top.startLine}-${top.endLine ?? top.startLine}`
          : `${top.file}:${top.line ?? "?"}`;
      const score = top.score !== null && top.score !== undefined ? ` score=${top.score}` : "";
      lines.push(`${head} top=${loc}${score}`);
    }
    lines.push("");
    return lines.join("\n").trimEnd() + "\n";
  }

  for (const r of results) {
    const status = r.ok ? "OK" : "ERR";
    const out = [r.outMd, r.outJson].filter(Boolean).map((x) => `\`${x}\``).join(" ");
    lines.push(`- ${status} ${r.dir}${out ? ` -> ${out}` : ""}${r.error ? ` (${r.error})` : ""}`);
  }
  lines.push("");
  return lines.join("\n").trimEnd() + "\n";
}

function renderBatchJson({ root, cmd, results, extra = null }) {
  return JSON.stringify({ schema: 1, root, generatedAt: new Date().toISOString(), cmd, results, ...(extra || {}) }, null, 2) + "\n";
}

async function runBatch({
  root,
  preferGit,
  maxFiles,
  snipLines,
  recentDays,
  cmd,
  base,
  format,
  maxChanges,
  onlyDirs,
  check,
  query,
  focusMode,
  k,
  minScore,
  maxHits,
  includeStatus
}) {
  if (cmd === "focus") {
    const report = await batchWorkspaceFocus(root, {
      q: query,
      mode: focusMode,
      k,
      minScore,
      maxHits,
      recentDays,
      includeStatus,
      preferGit,
      maxFiles,
      onlyDirs
    });
    const output = format === "json" ? renderBatchJson({ root, cmd, results: report.results }) : renderBatchMd({ root, cmd, results: report.results });
    const summaryPath = await writeWsSummary(root, format === "json" ? renderBatchMd({ root, cmd, results: report.results }) : output);
    return { output, summaryPath, results: report.results, report };
  }

  const { manifest } = await scanRepo(root, { maxFiles, preferGit });
  const spsAll = Array.isArray(manifest?.subprojects) ? manifest.subprojects : [];
  const sps = onlyDirs && onlyDirs.length ? spsAll.filter((x) => onlyDirs.includes(x.dir)) : spsAll;

  if (!sps.length) {
    const msg = "No subprojects detected.";
    if (format === "json") return { output: renderBatchJson({ root, cmd, results: [] }), summaryPath: null, empty: true, message: msg };
    const md = `# Workspace Batch\n\n${msg}\n`;
    return { output: md, summaryPath: null, empty: true, message: msg };
  }

  const results = [];
  for (const sp of sps) {
    const wsRoot = path.resolve(root, sp.dir);
    try {
      if (cmd === "handoff") {
        // eslint-disable-next-line no-await-in-loop
        const r = await generateHandoff(wsRoot, { preferGit, maxFiles, snipLines, recentDays, since: "", staged: false, maxChanges, format });
        results.push({ dir: sp.dir, ok: true, outMd: r.out, outJson: r.outJson || null });
      } else if (cmd === "pr") {
        // eslint-disable-next-line no-await-in-loop
        const r = await generatePr(wsRoot, { preferGit, maxFiles, snipLines, recentDays, base, staged: false, refresh: true, maxChanges, format });
        results.push({ dir: sp.dir, ok: true, outMd: r.out, outJson: r.outJson || null });
      } else if (cmd === "sync") {
        // eslint-disable-next-line no-await-in-loop
        await syncAiInstructions({ root: wsRoot });
        results.push({ dir: sp.dir, ok: true, outMd: null, outJson: null });
      } else if (cmd === "start") {
        // eslint-disable-next-line no-await-in-loop
        await refreshRepoMemory(wsRoot, { preferGit, maxFiles, snipLines, recentDays, sync: true });
        results.push({ dir: sp.dir, ok: true, outMd: null, outJson: null });
      } else if (cmd === "embed") {
        // eslint-disable-next-line no-await-in-loop
        const r = await embedAuto(wsRoot, { checkOnly: !!check });
        if (!r.ok) {
          results.push({ dir: sp.dir, ok: false, error: r.reason ? String(r.reason) : "out_of_date", outMd: null, outJson: null });
        } else {
          results.push({ dir: sp.dir, ok: true, outMd: null, outJson: null, note: r.skipped ? `skipped:${r.reason}` : "rebuilt" });
        }
      } else if (cmd === "focus") {
        // eslint-disable-next-line no-await-in-loop
        const r = await generateFocus(wsRoot, {
          q: query,
          mode: focusMode,
          format: "json",
          k,
          minScore,
          maxHits,
          recentDays,
          includeStatus
        });
        const hits = Array.isArray(r?.json?.search?.hits) ? r.json.search.hits : [];
        const top = hits[0] || null;
        results.push({
          dir: sp.dir,
          ok: true,
          mode: String(r?.json?.search?.mode || focusMode || "semantic"),
          hits: hits.length,
          top: top
            ? {
                file: top.file,
                text: String(top.text || "").slice(0, 160),
                score: top.score ?? null,
                line: top.line ?? null,
                startLine: top.startLine ?? null,
                endLine: top.endLine ?? null
              }
            : null
        });
      } else if (cmd === "status") {
        // No file output; treat as ok and let user run per-workspace if needed.
        results.push({ dir: sp.dir, ok: true, outMd: null, outJson: null, note: "use ws status <n|dir> for output" });
      } else {
        results.push({ dir: sp.dir, ok: false, error: `unsupported batch cmd: ${cmd}` });
      }
    } catch (err) {
      results.push({ dir: sp.dir, ok: false, error: err?.message || String(err), outMd: null, outJson: null });
    }
  }

  const output = format === "json" ? renderBatchJson({ root, cmd, results }) : renderBatchMd({ root, cmd, results });
  const summaryPath = await writeWsSummary(root, format === "json" ? renderBatchMd({ root, cmd, results }) : output);
  return { output, summaryPath, results };
}

export async function cmdWs({ rest, flags }) {
  const sub = rest[0];
  const root = resolveRoot(flags);
  const preferGit = flags["no-git"] ? false : true;
  const maxFiles = Number(flags["max-files"] || 4000);
  const snipLines = Number(flags["snip-lines"] || 120);
  const recentDays = Number(flags["recent-days"] || 3);
  const format = String(flags.format || "md").toLowerCase();
  const maxChanges = Number(flags["max-changes"] || 200);
  const onlyDirs = splitList(flags.only || "");
  const base = flags.base ? String(flags.base) : "";
  const check = !!flags.check;
  const focusMode = String(flags.mode || "semantic").toLowerCase();
  const k = flags.k !== undefined ? Number(flags.k) : 8;
  const minScore = flags["min-score"] !== undefined ? Number(flags["min-score"]) : 0.15;
  const maxHits = flags["max-hits"] !== undefined ? Number(flags["max-hits"]) : 50;
  const includeStatus = flags["no-status"] ? false : true;
  const saveFocusSnapshot = !!flags.save;
  const compareLatest = !!flags["compare-latest"];
  const snapshotTag = flags.tag ? String(flags.tag) : "";
  const saveReport = !!flags["save-report"];
  const reportTag = flags["report-tag"] ? String(flags["report-tag"]) : "";

  if (!sub || sub === "help") {
    process.stdout.write(wsHelp() + "\n");
    return;
  }

  // Always scan at repo root to detect subprojects.
  const { manifest } = await scanRepo(root, { maxFiles, preferGit });

  if (sub === "ls") {
    process.stdout.write(renderWsList(manifest));
    return;
  }

  if (sub === "batch") {
    const cmd = String(rest[1] || "").trim();
    const query = String(rest.slice(2).join(" ") || "").trim();
    if (!cmd) {
      process.stderr.write("Missing batch command.\n\n");
      process.stderr.write(wsHelp() + "\n");
      process.exitCode = 2;
      return;
    }
    if (cmd === "focus" && !query) {
      process.stderr.write("Missing query for `ws batch focus`.\n\n");
      process.stderr.write(wsHelp() + "\n");
      process.exitCode = 2;
      return;
    }
    const r = await runBatch({
      root,
      preferGit,
      maxFiles,
      snipLines,
      recentDays,
      cmd,
      base,
      format,
      maxChanges,
      onlyDirs,
      check,
      query,
      focusMode,
      k,
      minScore,
      maxHits,
      includeStatus
    });
    if (cmd === "focus" && r.report) {
      let snapshot = null;
      let comparison = null;
      if (compareLatest) comparison = await compareWorkspaceFocusWithLatest(root, r.report);
      if (saveFocusSnapshot) {
        snapshot = await saveWorkspaceFocusSnapshot(root, r.report, { tag: snapshotTag });
      }
      if (format === "json") {
        process.stdout.write(renderBatchJson({
          root,
          cmd,
          results: r.results,
          extra: {
            report: r.report,
            snapshot: snapshot ? { id: snapshot.id, path: snapshot.path, tag: snapshot.snapshot?.tag || null } : null,
            comparison: comparison || null
          }
        }));
      } else {
        process.stdout.write(r.output);
        const lines = [];
        if (snapshot) lines.push(`Snapshot: ${snapshot.id}`);
        if (comparison) lines.push(`Comparison changedCount: ${comparison?.diff?.changedCount ?? 0}`);
        if (lines.length) process.stdout.write(lines.join("\n") + "\n");
      }
      return;
    }
    process.stdout.write(r.output);
    if (cmd === "embed" && check) {
      const anyBad = Array.isArray(r.results) && r.results.some((x) => !x.ok);
      if (anyBad) process.exitCode = 2;
    }
    return;
  }

  if (sub === "focus-history") {
    const op = String(rest[1] || "list").trim();
    if (op === "list") {
      const limit = Number(flags.limit || 20);
      const out = await listWorkspaceFocusSnapshots(root, { limit });
      if (format === "json") {
        process.stdout.write(JSON.stringify(out, null, 2) + "\n");
      } else {
        const lines = [];
        lines.push("# Workspace Focus Snapshots\n");
        lines.push(`Root: ${root}\n`);
        if (!out.snapshots.length) {
          lines.push("No snapshots.\n");
        } else {
          for (const s of out.snapshots) {
            lines.push(`- ${s.id} q="${s.q}" mode=${s.mode} nonEmpty=${s.summary?.nonEmpty ?? 0}${s.tag ? ` tag=${s.tag}` : ""}`);
          }
          lines.push("");
        }
        process.stdout.write(lines.join("\n"));
      }
      return;
    }
    if (op === "compare") {
      const fromId = String(rest[2] || "").trim();
      const toId = String(rest[3] || "").trim();
      if (!fromId || !toId) {
        process.stderr.write("Usage: rmemo ws focus-history compare <fromId> <toId>\n");
        process.exitCode = 2;
        return;
      }
      const out = await compareWorkspaceFocusSnapshots(root, { fromId, toId });
      if (format === "json") {
        process.stdout.write(JSON.stringify(out, null, 2) + "\n");
      } else {
        const lines = [];
        lines.push("# Workspace Focus Compare\n");
        lines.push(`From: ${out.from.id}`);
        lines.push(`To: ${out.to.id}`);
        lines.push(`Changed: ${out.diff.changedCount}`);
        lines.push("");
        for (const c of out.diff.changes.slice(0, 100)) {
          lines.push(`- ${c.dir}: ${c.previous?.hits ?? "-"} -> ${c.current?.hits ?? "-"} (delta=${c.deltaHits})`);
        }
        lines.push("");
        process.stdout.write(lines.join("\n"));
      }
      return;
    }
    if (op === "report") {
      const fromId = String(rest[2] || "").trim();
      const toId = String(rest[3] || "").trim();
      const maxItems = Number(flags["max-items"] || 50);
      const r = await generateWorkspaceFocusReport(root, { fromId, toId, maxItems });
      const saved = saveReport ? await saveWorkspaceFocusReport(root, r.json, { tag: reportTag }) : null;
      if (format === "json") {
        process.stdout.write(JSON.stringify({ ...r.json, savedReport: saved ? { id: saved.id, path: saved.path, tag: saved.report?.tag || null } : null }, null, 2) + "\n");
      } else {
        process.stdout.write(r.markdown);
        if (saved) process.stdout.write(`Saved report: ${saved.id}\n`);
      }
      return;
    }
    process.stderr.write(`Unknown subcommand: ws focus-history ${op}\n\n`);
    process.stderr.write(wsHelp() + "\n");
    process.exitCode = 2;
    return;
  }

  if (sub === "report-history") {
    const op = String(rest[1] || "list").trim();
    if (op === "list") {
      const limit = Number(flags.limit || 20);
      const out = await listWorkspaceFocusReports(root, { limit });
      if (format === "json") {
        process.stdout.write(JSON.stringify(out, null, 2) + "\n");
      } else {
        const lines = [];
        lines.push("# Workspace Focus Reports\n");
        lines.push(`Root: ${root}\n`);
        if (!out.reports.length) {
          lines.push("No saved reports.\n");
        } else {
          for (const r of out.reports) {
            lines.push(`- ${r.id} from=${r.fromId} to=${r.toId} changed=${r.summary?.changedCount ?? 0}${r.tag ? ` tag=${r.tag}` : ""}`);
          }
          lines.push("");
        }
        process.stdout.write(lines.join("\n"));
      }
      return;
    }
    if (op === "show") {
      const reportId = String(rest[2] || "").trim();
      if (!reportId) {
        process.stderr.write("Usage: rmemo ws report-history show <reportId>\n");
        process.exitCode = 2;
        return;
      }
      const out = await getWorkspaceFocusReport(root, reportId);
      if (format === "json") {
        process.stdout.write(JSON.stringify(out, null, 2) + "\n");
      } else {
        process.stdout.write([
          `# Workspace Focus Report ${out.id}\n`,
          `Created: ${out.createdAt || "-"}`,
          `Tag: ${out.tag || "-"}`,
          `\n## Summary\n`,
          `- changedCount: ${out.report?.summary?.changedCount ?? 0}`,
          `- increased: ${out.report?.summary?.increased ?? 0}`,
          `- decreased: ${out.report?.summary?.decreased ?? 0}`,
          `- regressedErrors: ${out.report?.summary?.regressedErrors ?? 0}`,
          ""
        ].join("\n"));
      }
      return;
    }
    process.stderr.write(`Unknown subcommand: ws report-history ${op}\n\n`);
    process.stderr.write(wsHelp() + "\n");
    process.exitCode = 2;
    return;
  }

  const pick = rest[1];
  const sp = pickWorkspace(manifest, pick);
  if (!sp) {
    process.stderr.write(`Workspace not found: ${pick || "(missing)"}\n\n`);
    process.stderr.write(renderWsList(manifest));
    process.exitCode = 2;
    return;
  }

  const wsRoot = path.resolve(root, sp.dir);
  const nextFlags = { ...flags, root: wsRoot };

  switch (sub) {
    case "start":
      await cmdStart({ flags: nextFlags });
      return;
    case "status":
      await cmdStatus({ flags: nextFlags });
      return;
    case "handoff":
      await cmdHandoff({ flags: nextFlags });
      return;
    case "pr":
      await cmdPr({ flags: nextFlags });
      return;
    case "sync":
      await cmdSync({ flags: nextFlags });
      return;
    case "embed": {
      const embedRest = rest.slice(2); // ["auto"|"build"|"search", ...]
      if (!embedRest.length) {
        process.stderr.write("Missing embed subcommand.\n\n");
        process.stderr.write(wsHelp() + "\n");
        process.exitCode = 2;
        return;
      }
      await cmdEmbed({ rest: embedRest, flags: nextFlags });
      return;
    }
    case "focus": {
      const q = String(rest.slice(2).join(" ") || "").trim();
      if (!q) {
        process.stderr.write("Missing query for `ws focus`.\n\n");
        process.stderr.write(wsHelp() + "\n");
        process.exitCode = 2;
        return;
      }
      const r = await generateFocus(wsRoot, { q, mode: focusMode, format, k, minScore, maxHits, recentDays, includeStatus });
      if (format === "json") process.stdout.write(JSON.stringify(r.json, null, 2) + "\n");
      else process.stdout.write(r.markdown);
      return;
    }
    default:
      process.stderr.write(`Unknown subcommand: ws ${sub}\n\n`);
      process.stderr.write(wsHelp() + "\n");
      process.exitCode = 2;
  }
}
