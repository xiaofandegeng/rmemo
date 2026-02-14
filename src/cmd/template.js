import { resolveRoot } from "../lib/paths.js";
import path from "node:path";
import { applyTemplate, listTemplates } from "../core/templates.js";

export async function cmdTemplate({ rest, flags }) {
  const root = resolveRoot(flags);
  const sub = rest[0];
  const force = !!flags.force;

  if (!sub || sub === "help") {
    process.stdout.write(
      [
        "Usage:",
        "  rmemo template ls",
        "  rmemo template apply <id> [--force]",
        ""
      ].join("\n") + "\n"
    );
    return;
  }

  if (sub === "ls") {
    const items = await listTemplates();
    for (const id of items) process.stdout.write(id + "\n");
    return;
  }

  if (sub === "apply") {
    const id = rest[1];
    if (!id) throw new Error("Missing template id. Usage: rmemo template apply <id>");
    const res = await applyTemplate(root, id, { force });
    for (const bak of res.backups) process.stdout.write(`Backed up: ${bak}\n`);
    for (const abs of res.targets) process.stdout.write(`Wrote: ${path.relative(process.cwd(), abs)}\n`);
    process.stdout.write(`Applied template: ${res.id}\n`);
    return;
  }

  throw new Error(`Unknown subcommand: template ${sub}`);
}
