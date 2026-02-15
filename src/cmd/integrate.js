import { resolveRoot } from "../lib/paths.js";
import { applyIntegrationToConfigFile, getDefaultConfigPath, renderIntegration } from "../core/integrate.js";

function help() {
  return [
    "Usage:",
    "  rmemo integrate list",
    "  rmemo integrate <tool> [--format md|json] [--allow-write] [--mode node-bin|rmemo|npx]",
    "  rmemo integrate <tool> --apply [--config <path>] [--name <id>] [--allow-write] [--mode node-bin|rmemo|npx]",
    "  rmemo integrate <tool> --print-config-path",
    "",
    "Notes:",
    "- Outputs a paste-ready snippet for MCP server configuration.",
    "- Uses node + an absolute rmemo bin path by default (avoids global PATH/version issues).",
    "- --apply will merge into an existing JSON file and create a .bak.TIMESTAMP backup when changing it.",
    "",
    "Examples:",
    "  rmemo integrate antigravity",
    "  rmemo integrate antigravity --format json",
    "  rmemo integrate antigravity --allow-write",
    "  rmemo integrate claude-desktop --print-config-path",
    "  rmemo integrate claude-desktop --apply",
    "  rmemo integrate claude-desktop --apply --config /path/to/claude_desktop_config.json",
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
  const mode = String(flags.mode || "node-bin").toLowerCase();
  const name = flags.name ? String(flags.name).trim() : "rmemo";
  const pkg = flags.pkg ? String(flags.pkg).trim() : "@xiaofandegeng/rmemo";

  if (flags["print-config-path"]) {
    const p = getDefaultConfigPath(tool);
    process.stdout.write((p || "") + "\n");
    return;
  }

  if (flags.apply) {
    const configPath = flags.config ? String(flags.config) : undefined;
    const r = await applyIntegrationToConfigFile({ tool, root, allowWrite, mode, pkg, name, configPath });
    process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    return;
  }

  const out = renderIntegration({ tool, root, allowWrite, format, mode, pkg, name });
  process.stdout.write(out.text);
}
