import { resolveRoot } from "../lib/paths.js";
import { readStdinText } from "../lib/stdin.js";
import { appendSessionNote, endSession, getActiveSession, listSessions, showSession, startSession } from "../core/session.js";

function help() {
  return [
    "Usage:",
    "  rmemo session start [--title <text>]",
    "  rmemo session note <text>              (or pipe stdin)",
    "  rmemo session end",
    "  rmemo session ls",
    "  rmemo session show <id>",
    ""
  ].join("\n");
}

export async function cmdSession({ rest, flags }) {
  const sub = rest[0];
  const root = resolveRoot(flags);
  const title = flags.title ? String(flags.title) : "";

  if (!sub || sub === "help") {
    process.stdout.write(help() + "\n");
    return;
  }

  if (sub === "start") {
    const r = await startSession(root, { title });
    process.stdout.write(`Session started: ${r.id}\n`);
    process.stdout.write(`Notes: ${r.notes}\n`);
    return;
  }

  if (sub === "note") {
    const textArg = rest.slice(1).join(" ").trim();
    const stdin = await readStdinText();
    const text = textArg || stdin;
    if (!text.trim()) throw new Error("Missing note text. Usage: rmemo session note <text> (or pipe stdin)");
    const r = await appendSessionNote(root, text);
    process.stdout.write(`Session note appended: ${r.id}\n`);
    return;
  }

  if (sub === "end") {
    const preferGit = flags["no-git"] ? false : true;
    const maxFiles = Number(flags["max-files"] || 4000);
    const snipLines = Number(flags["snip-lines"] || 120);
    const recentDays = Number(flags["recent-days"] || 3);
    const since = flags.since ? String(flags.since) : "";
    const staged = !!flags.staged;
    const maxChanges = Number(flags["max-changes"] || 200);
    const format = String(flags.format || "md").toLowerCase();

    const r = await endSession(root, { preferGit, maxFiles, snipLines, recentDays, since, staged, maxChanges, format });
    process.stdout.write(`Session ended: ${r.id}\n`);
    process.stdout.write(`Handoff: ${r.handoff}\n`);
    return;
  }

  if (sub === "ls") {
    const active = await getActiveSession(root);
    const ids = await listSessions(root);
    for (const id of ids) process.stdout.write(`${id}${active?.id === id ? "\t(active)" : ""}\n`);
    return;
  }

  if (sub === "show") {
    const id = rest[1];
    if (!id) throw new Error("Missing session id. Usage: rmemo session show <id>");
    const r = await showSession(root, id);
    if (!r) {
      process.stderr.write(`Unknown session id: ${id}\n`);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(`# Session ${id}\n\n`);
    if (r.meta?.startedAt) process.stdout.write(`Started: ${r.meta.startedAt}\n`);
    if (r.meta?.endedAt) process.stdout.write(`Ended: ${r.meta.endedAt}\n`);
    if (r.meta?.title) process.stdout.write(`Title: ${r.meta.title}\n`);
    process.stdout.write(`\nPaths:\n`);
    process.stdout.write(`- meta: ${r.paths.meta}\n`);
    process.stdout.write(`- notes: ${r.paths.notes}\n`);
    process.stdout.write(`- handoff: ${r.paths.handoff}\n`);
    return;
  }

  throw new Error(`Unknown subcommand: session ${sub}\n\n${help()}`);
}

