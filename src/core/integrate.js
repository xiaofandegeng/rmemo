import path from "node:path";
import { fileURLToPath } from "node:url";

function ensureAbs(p) {
  return path.isAbsolute(p) ? p : path.resolve(p);
}

export function getRmemoBinPath() {
  // Resolve to this package's `bin/rmemo.js` regardless of global PATH.
  // This avoids "old rmemo" issues when an outdated global install shadows the newer CLI.
  return ensureAbs(fileURLToPath(new URL("../../bin/rmemo.js", import.meta.url)));
}

export function buildMcpServerConfig({ root, mode = "node-bin", allowWrite = false } = {}) {
  const repoRoot = root ? ensureAbs(root) : process.cwd();
  const args = [getRmemoBinPath(), "mcp", "--root", repoRoot];
  if (allowWrite) args.push("--allow-write");

  if (mode === "rmemo") {
    // Only safe if `rmemo` in PATH is the correct/newer version.
    const rArgs = ["mcp", "--root", repoRoot];
    if (allowWrite) rArgs.push("--allow-write");
    return { command: "rmemo", args: rArgs };
  }

  // Default: call node with an absolute script path.
  // Works in environments where PATH is restricted (e.g. GUI apps).
  return { command: "node", args };
}

export function renderIntegration({ tool, root, allowWrite = false, format = "md" } = {}) {
  const t = String(tool || "").toLowerCase().trim();
  if (!t || t === "list") {
    return { format: "md", text: ["Supported integration targets:", "- antigravity", ""].join("\n") };
  }
  if (t !== "antigravity") {
    const err = new Error(`Unknown integration target: ${tool}`);
    err.code = "RMEMO_BAD_INTEGRATION";
    throw err;
  }

  // Antigravity raw config uses a flat map of MCP servers (no `mcpServers` wrapper).
  // Return a snippet object you can paste into that JSON.
  const cfg = buildMcpServerConfig({ root, mode: "node-bin", allowWrite });
  const obj = { rmemo: cfg };

  const fmt = String(format || "md").toLowerCase();
  if (fmt === "json") {
    return { format: "json", text: JSON.stringify(obj, null, 2) + "\n" };
  }

  const lines = [];
  lines.push(`# Antigravity MCP config snippet`);
  lines.push("");
  lines.push(`Paste this into Antigravity "View raw config" JSON (top-level object):`);
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(obj, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("Notes:");
  lines.push("- This uses `node` + an absolute `bin/rmemo.js` path to avoid PATH/version conflicts.");
  lines.push("- If you want write tools, re-run with: `rmemo integrate antigravity --allow-write` and start rmemo with `mcp --allow-write` only when needed.");
  lines.push("");
  return { format: "md", text: lines.join("\n") };
}

