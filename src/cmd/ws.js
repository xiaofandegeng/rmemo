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
    "",
    "Notes:",
    "- Workspaces are detected from repo scan (manifest.subprojects).",
    "- <n> refers to the index printed by `rmemo ws ls`.",
    "- For batch: `--only` is a comma-separated list of subproject dirs (e.g. apps/admin-web,apps/miniapp).",
    "- For batch embed: use `--check` to audit (non-zero if any workspace is out of date)."
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
  for (const r of results) {
    const status = r.ok ? "OK" : "ERR";
    const out = [r.outMd, r.outJson].filter(Boolean).map((x) => `\`${x}\``).join(" ");
    lines.push(`- ${status} ${r.dir}${out ? ` -> ${out}` : ""}${r.error ? ` (${r.error})` : ""}`);
  }
  lines.push("");
  return lines.join("\n").trimEnd() + "\n";
}

function renderBatchJson({ root, cmd, results }) {
  return JSON.stringify({ schema: 1, root, generatedAt: new Date().toISOString(), cmd, results }, null, 2) + "\n";
}

async function runBatch({ root, preferGit, maxFiles, snipLines, recentDays, cmd, base, format, maxChanges, onlyDirs, check }) {
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
    if (!cmd) {
      process.stderr.write("Missing batch command.\n\n");
      process.stderr.write(wsHelp() + "\n");
      process.exitCode = 2;
      return;
    }
    const r = await runBatch({ root, preferGit, maxFiles, snipLines, recentDays, cmd, base, format, maxChanges, onlyDirs, check });
    process.stdout.write(r.output);
    if (cmd === "embed" && check) {
      const anyBad = Array.isArray(r.results) && r.results.some((x) => !x.ok);
      if (anyBad) process.exitCode = 2;
    }
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
    default:
      process.stderr.write(`Unknown subcommand: ws ${sub}\n\n`);
      process.stderr.write(wsHelp() + "\n");
      process.exitCode = 2;
  }
}
