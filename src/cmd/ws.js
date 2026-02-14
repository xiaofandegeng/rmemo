import path from "node:path";
import { resolveRoot } from "../lib/paths.js";
import { scanRepo } from "../core/scan.js";
import { cmdStart } from "./start.js";
import { cmdStatus } from "./status.js";
import { cmdHandoff } from "./handoff.js";
import { cmdPr } from "./pr.js";
import { cmdSync } from "./sync.js";

function isNumberLike(s) {
  return /^[0-9]+$/.test(String(s || ""));
}

function wsHelp() {
  return [
    "Usage:",
    "  rmemo ws ls",
    "  rmemo ws start <n|dir>",
    "  rmemo ws status <n|dir>",
    "  rmemo ws handoff <n|dir>",
    "  rmemo ws pr <n|dir> [--base <ref>]",
    "  rmemo ws sync <n|dir> [--targets ...]",
    "",
    "Notes:",
    "- Workspaces are detected from repo scan (manifest.subprojects).",
    "- <n> refers to the index printed by `rmemo ws ls`."
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

export async function cmdWs({ rest, flags }) {
  const sub = rest[0];
  const root = resolveRoot(flags);
  const preferGit = flags["no-git"] ? false : true;
  const maxFiles = Number(flags["max-files"] || 4000);

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
    default:
      process.stderr.write(`Unknown subcommand: ws ${sub}\n\n`);
      process.stderr.write(wsHelp() + "\n");
      process.exitCode = 2;
  }
}

