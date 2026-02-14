import { resolveRoot } from "../lib/paths.js";
import { applyProfile, checkProfile, describeProfile, getAppliedProfileId, listProfiles } from "../core/profiles.js";

function help() {
  return [
    "Usage:",
    "  rmemo profile ls",
    "  rmemo profile describe <id>",
    "  rmemo profile apply <id> [--force]",
    "  rmemo profile check [<id>] [--format json]",
    "  rmemo profile upgrade [<id>]",
    ""
  ].join("\n");
}

export async function cmdProfile({ rest, flags }) {
  const sub = rest[0];
  const root = resolveRoot(flags);
  const force = !!flags.force;
  const format = flags.format ? String(flags.format) : "";

  if (!sub || sub === "help") {
    process.stdout.write(help() + "\n");
    return;
  }

  if (sub === "ls") {
    const items = await listProfiles();
    for (const p of items) process.stdout.write(`${p.id}\t${p.title}\n`);
    return;
  }

  if (sub === "describe") {
    const id = rest[1];
    if (!id) throw new Error("Missing profile id. Usage: rmemo profile describe <id>");
    const p = await describeProfile(id);
    if (!p) {
      process.stderr.write(`Unknown profile id: ${id}\n`);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(`# Profile: ${p.id}\n\n`);
    process.stdout.write(`Title: ${p.title}\n\n`);
    process.stdout.write(`Description: ${p.description}\n\n`);
    process.stdout.write(`Template: ${p.templateId || "(none)"}\n\n`);
    process.stdout.write("Defaults:\n");
    process.stdout.write("```json\n" + JSON.stringify(p.defaults || {}, null, 2) + "\n```\n");
    return;
  }

  if (sub === "apply") {
    const id = rest[1];
    if (!id) throw new Error("Missing profile id. Usage: rmemo profile apply <id>");
    const r = await applyProfile(root, id, { force });
    process.stdout.write(`Applied profile: ${r.id}\n`);
    process.stdout.write(`Config: ${r.config}\n`);
    return;
  }

  if (sub === "check") {
    const id = rest[1] || (await getAppliedProfileId(root));
    if (!id) throw new Error("Missing profile id. Usage: rmemo profile check [<id>]");
    const r = await checkProfile(root, id);
    if (format === "json") {
      process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    } else {
      process.stdout.write(`Profile: ${r.profile.id}\n`);
      process.stdout.write(`OK: ${r.ok ? "yes" : "no"}\n`);
      for (const f of r.files || []) process.stdout.write(`- file ${f.status}: ${f.path}\n`);
      for (const d of r.config || []) process.stdout.write(`- config diff: ${d.path}\n`);
    }
    if (!r.ok) process.exitCode = 1;
    return;
  }

  if (sub === "upgrade") {
    const id = rest[1] || (await getAppliedProfileId(root));
    if (!id) throw new Error("Missing profile id. Usage: rmemo profile upgrade [<id>]");
    const r = await applyProfile(root, id, { force: true });
    process.stdout.write(`Upgraded profile: ${r.id}\n`);
    if (r.template?.backups?.length) {
      process.stdout.write("Backups:\n");
      for (const b of r.template.backups) process.stdout.write(`- ${b}\n`);
    }
    return;
  }

  throw new Error(`Unknown subcommand: profile ${sub}\n\n${help()}`);
}
