import { resolveRoot } from "../lib/paths.js";
import { renderIntegration } from "../core/integrate.js";

function help() {
  return [
    "Usage:",
    "  rmemo integrate list",
    "  rmemo integrate antigravity [--format md|json] [--allow-write]",
    "",
    "Notes:",
    "- Outputs a paste-ready snippet for MCP server configuration.",
    "- Uses node + an absolute rmemo bin path by default (avoids global PATH/version issues).",
    "",
    "Examples:",
    "  rmemo integrate antigravity",
    "  rmemo integrate antigravity --format json",
    "  rmemo integrate antigravity --allow-write",
    ""
  ].join("\n");
}

export async function cmdIntegrate({ rest, flags }) {
  if (flags.help) {
    process.stdout.write(help() + "\n");
    return;
  }

  const tool = rest[0] || "list";
  const root = resolveRoot(flags);
  const allowWrite = !!flags["allow-write"];
  const format = String(flags.format || "md").toLowerCase();

  const out = renderIntegration({ tool, root, allowWrite, format });
  process.stdout.write(out.text);
}

