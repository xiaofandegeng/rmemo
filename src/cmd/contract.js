import { resolveRoot } from "../lib/paths.js";
import { formatContractCheckMarkdown, runContractCheck } from "../core/contract.js";
import { exitWithError } from "../lib/io.js";

function help() {
  return [
    "Usage:",
    "  rmemo contract check [--root <path>] [--format md|json] [--update] [--fail-on breaking|any|none]",
    "",
    "What it does:",
    "- Collects current CLI/HTTP/MCP contracts from source and compares against contracts/*.json snapshots.",
    "- Use --update to rewrite snapshots from current code (intended for intentional contract updates).",
    "",
    "Examples:",
    "  rmemo contract check",
    "  rmemo contract check --format json",
    "  rmemo contract check --fail-on any",
    "  rmemo contract check --update",
    ""
  ].join("\n");
}

export async function cmdContract({ rest, flags }) {
  if (flags.help) {
    process.stdout.write(help() + "\n");
    return;
  }

  const sub = rest[0] || "check";
  if (sub !== "check") {
    exitWithError(`Unknown contract subcommand: ${sub}\n\n${help()}`);
    return;
  }

  const format = flags.format ? String(flags.format).toLowerCase() : "md";
  if (format !== "md" && format !== "json") {
    exitWithError("format must be md|json");
    return;
  }

  const failOn = flags["fail-on"] ? String(flags["fail-on"]).toLowerCase() : "breaking";
  if (!["breaking", "any", "none"].includes(failOn)) {
    exitWithError("fail-on must be one of: breaking|any|none");
    return;
  }

  const root = resolveRoot(flags);
  const result = await runContractCheck({ root, update: !!flags.update, failOn });
  if (format === "json") {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(formatContractCheckMarkdown(result).trimEnd() + "\n");
  }

  if (!result.ok) process.exitCode = 1;
}
