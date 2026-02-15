import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fileExists, readJson, writeJson } from "../lib/io.js";

function ensureAbs(p) {
  return path.isAbsolute(p) ? p : path.resolve(p);
}

export function getRmemoBinPath() {
  // Resolve to this package's `bin/rmemo.js` regardless of global PATH.
  // This avoids "old rmemo" issues when an outdated global install shadows the newer CLI.
  return ensureAbs(fileURLToPath(new URL("../../bin/rmemo.js", import.meta.url)));
}

export function buildMcpServerConfig({
  root,
  mode = "node-bin",
  allowWrite = false,
  pkg = "@xiaofandegeng/rmemo",
  name = "rmemo"
} = {}) {
  const repoRoot = root ? ensureAbs(root) : process.cwd();
  const baseArgs = ["mcp", "--root", repoRoot];
  if (allowWrite) baseArgs.push("--allow-write");

  if (mode === "rmemo") {
    // Only safe if `rmemo` in PATH is the correct/newer version.
    return { command: "rmemo", args: baseArgs, env: {} };
  }

  if (mode === "npx") {
    return {
      command: "npx",
      args: ["-y", String(pkg), ...baseArgs],
      env: {}
    };
  }

  // Default: call node with an absolute script path.
  // Works in environments where PATH is restricted (e.g. GUI apps).
  return { command: "node", args: [getRmemoBinPath(), ...baseArgs], env: {} };
}

export function getSupportedIntegrations() {
  return ["antigravity", "cursor", "cline", "claude-desktop"];
}

export function getDefaultConfigPath(tool) {
  const t = String(tool || "").toLowerCase().trim();
  if (t === "claude-desktop") {
    if (process.platform === "darwin") {
      return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
    }
    if (process.platform === "linux") {
      return path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
    }
    // Windows: %APPDATA%\Claude\claude_desktop_config.json (printed only; we don't build it here).
    return null;
  }
  // Other clients typically manage config internally or via UI; no stable filesystem path.
  return null;
}

function toolSchema(tool) {
  const t = String(tool || "").toLowerCase().trim();
  if (t === "antigravity") return { kind: "flat", label: "Antigravity" };
  if (t === "cursor") return { kind: "flat", label: "Cursor" };
  if (t === "cline") return { kind: "mcpServers", label: "Cline" };
  if (t === "claude-desktop") return { kind: "mcpServers", label: "Claude Desktop" };
  return null;
}

function buildConfigObject({ tool, root, allowWrite, format, mode, pkg, name } = {}) {
  const schema = toolSchema(tool);
  if (!schema) {
    const err = new Error(`Unknown integration target: ${tool}`);
    err.code = "RMEMO_BAD_INTEGRATION";
    throw err;
  }

  const cfg = buildMcpServerConfig({ root, mode, allowWrite, pkg, name });
  if (schema.kind === "mcpServers") return { mcpServers: { [name]: cfg } };
  return { [name]: cfg };
}

function nowStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${y}${m}${day}_${hh}${mm}${ss}`;
}

export async function applyIntegrationToConfigFile({
  tool,
  root,
  allowWrite = false,
  mode = "node-bin",
  pkg = "@xiaofandegeng/rmemo",
  name = "rmemo",
  configPath
} = {}) {
  const schema = toolSchema(tool);
  if (!schema) {
    const err = new Error(`Unknown integration target: ${tool}`);
    err.code = "RMEMO_BAD_INTEGRATION";
    throw err;
  }

  const target = configPath || getDefaultConfigPath(tool);
  if (!target) {
    const err = new Error(`Missing --config for ${tool} (no default path known on this OS)`);
    err.code = "RMEMO_MISSING_CONFIG_PATH";
    throw err;
  }

  const abs = ensureAbs(target);
  const existed = await fileExists(abs);
  const before = existed ? await readJson(abs) : {};

  const serverSpec = buildMcpServerConfig({ root, mode, allowWrite, pkg, name });
  const after = JSON.parse(JSON.stringify(before || {}));

  if (schema.kind === "mcpServers") {
    if (!after.mcpServers || typeof after.mcpServers !== "object") after.mcpServers = {};
    after.mcpServers[name] = serverSpec;
  } else {
    after[name] = serverSpec;
  }

  const changed = JSON.stringify(before) !== JSON.stringify(after);
  let backupPath = null;
  if (existed && changed) {
    backupPath = `${abs}.bak.${nowStamp()}`;
    await fs.copyFile(abs, backupPath);
  }

  if (changed) await writeJson(abs, after);
  return { ok: true, tool: String(tool), path: abs, changed, backupPath };
}

export function renderIntegration({
  tool,
  root,
  allowWrite = false,
  format = "md",
  mode = "node-bin",
  pkg = "@xiaofandegeng/rmemo",
  name = "rmemo"
} = {}) {
  const t = String(tool || "").toLowerCase().trim();
  if (!t || t === "list") {
    const lines = [];
    lines.push("Supported integration targets:");
    for (const x of getSupportedIntegrations()) lines.push(`- ${x}`);
    lines.push("");
    return { format: "md", text: lines.join("\n") };
  }

  const schema = toolSchema(t);
  if (!schema) {
    const err = new Error(`Unknown integration target: ${tool}`);
    err.code = "RMEMO_BAD_INTEGRATION";
    throw err;
  }

  const obj = buildConfigObject({ tool: t, root, allowWrite, format, mode, pkg, name });

  const fmt = String(format || "md").toLowerCase();
  if (fmt === "json") {
    return { format: "json", text: JSON.stringify(obj, null, 2) + "\n" };
  }

  const lines = [];
  lines.push(`# ${schema.label} MCP config snippet`);
  lines.push("");
  if (schema.kind === "flat") {
    lines.push(`Paste this into ${schema.label} raw config JSON (top-level object):`);
  } else {
    lines.push(`Paste this into a JSON file that contains a top-level "mcpServers" object (merge if it already exists).`);
  }
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(obj, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("Notes:");
  lines.push("- This uses `node` + an absolute `bin/rmemo.js` path to avoid PATH/version conflicts.");
  lines.push(
    `- If you want write tools, re-run with: \`rmemo integrate ${t} --allow-write\` and start rmemo with \`mcp --allow-write\` only when needed.`
  );
  lines.push("");
  return { format: "md", text: lines.join("\n") };
}
