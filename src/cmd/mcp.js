import { resolveRoot } from "../lib/paths.js";
import { startMcpServer } from "../core/mcp.js";

function help() {
  return [
    "Usage:",
    "  rmemo mcp [--root <path>] [--log-level info|debug]",
    "",
    "Notes:",
    "- MCP server runs over stdio (do not print to stdout).",
    "- Logs go to stderr.",
    ""
  ].join("\n");
}

export async function cmdMcp({ flags }) {
  if (flags.help) {
    process.stderr.write(help() + "\n");
    return;
  }

  const root = resolveRoot(flags);
  const logLevel = flags["log-level"] ? String(flags["log-level"]) : "info";

  await startMcpServer({ root, logLevel });
}

