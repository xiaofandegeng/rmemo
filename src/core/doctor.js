import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fileExists, readJson } from "../lib/io.js";
import { configPath } from "../lib/paths.js";
import { getRmemoBinPath } from "./integrate.js";

function safeExec(cmd, args) {
  try {
    return String(execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).trim();
  } catch (e) {
    return "";
  }
}

async function readPkgVersion() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(here, "../../package.json");
    if (!(await fileExists(pkgPath))) return null;
    const pkg = await readJson(pkgPath);
    return pkg?.version ? String(pkg.version) : null;
  } catch {
    return null;
  }
}

export async function buildDoctorReport({ root } = {}) {
  const repoRoot = root ? path.resolve(root) : process.cwd();
  const pkgVersion = await readPkgVersion();

  const whichRmemo = safeExec("bash", ["-lc", "command -v rmemo || true"]);
  const rmemoHelp = safeExec("bash", ["-lc", "rmemo help 2>/dev/null | head -n 5 || true"]);
  const npmRegistry = safeExec("bash", ["-lc", "npm config get registry 2>/dev/null || true"]);

  let cfg = null;
  try {
    if (await fileExists(configPath(repoRoot))) cfg = await readJson(configPath(repoRoot));
  } catch {
    cfg = { parseError: true };
  }

  const lines = [];
  lines.push("# rmemo doctor");
  lines.push("");
  lines.push(`- repoRoot: ${repoRoot}`);
  if (pkgVersion) lines.push(`- rmemo(package): v${pkgVersion}`);
  lines.push(`- node: ${process.version} (${process.execPath})`);
  lines.push(`- platform: ${process.platform} ${process.arch}`);
  lines.push(`- home: ${os.homedir()}`);
  lines.push("");
  lines.push("## Binary resolution");
  lines.push(`- current bin: ${process.argv[1] || "(unknown)"}`);
  lines.push(`- package bin/rmemo.js: ${getRmemoBinPath()}`);
  lines.push(`- which rmemo: ${whichRmemo || "(not found)"}`);
  if (rmemoHelp) lines.push(`- rmemo help (first lines): ${rmemoHelp.replace(/\n/g, " | ")}`);
  lines.push("");
  lines.push("## npm");
  lines.push(`- registry: ${npmRegistry || "(unknown)"}`);
  lines.push("");
  lines.push("## repo config");
  if (cfg) lines.push(`- .repo-memory/config.json: ${cfg.parseError ? "parse error" : "present"}`);
  else lines.push("- .repo-memory/config.json: missing");
  if (cfg?.sync?.targets) lines.push(`- sync.targets: ${Array.isArray(cfg.sync.targets) ? cfg.sync.targets.join(", ") : String(cfg.sync.targets)}`);
  if (cfg?.embed) lines.push(`- embed: ${JSON.stringify(cfg.embed)}`);
  lines.push("");
  lines.push("## Quick fixes");
  lines.push("- Antigravity MCP snippet: `rmemo integrate antigravity`");
  lines.push("- If `rmemo mcp` is unknown, your global `rmemo` is outdated; use the snippet above or update the install.");
  lines.push("");
  return lines.join("\n");
}

