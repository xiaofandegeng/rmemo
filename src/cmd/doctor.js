import { resolveRoot } from "../lib/paths.js";
import { buildDoctorReport } from "../core/doctor.js";

function help() {
  return [
    "Usage:",
    "  rmemo doctor [--root <path>]",
    "",
    "What it does:",
    "- Prints environment + repo diagnostics to help debug installs and integrations (MCP, hooks, sync).",
    "",
    "Examples:",
    "  rmemo doctor",
    "  rmemo doctor --root .",
    ""
  ].join("\n");
}

export async function cmdDoctor({ flags }) {
  if (flags.help) {
    process.stdout.write(help() + "\n");
    return;
  }

  const root = resolveRoot(flags);
  const out = await buildDoctorReport({ root });
  process.stdout.write(out + "\n");
}

