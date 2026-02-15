import { resolveRoot } from "../lib/paths.js";
import { watchRepo } from "../core/watch.js";
import { cmdStatus } from "./status.js";

function printEvent(e) {
  const head = `[${e.at}]`;
  if (e.type === "start") {
    process.stdout.write(
      `${head} watch start usingGit=${e.usingGit ? "yes" : "no"} intervalMs=${e.intervalMs} sync=${e.sync} embed=${e.embed ? "yes" : "no"}\n`
    );
    return;
  }
  if (e.type === "refresh:start") {
    process.stdout.write(`${head} refresh start (${e.reason})\n`);
    return;
  }
  if (e.type === "refresh:ok") {
    process.stdout.write(`${head} refresh ok (${e.reason})\n`);
    return;
  }
  if (e.type === "refresh:err") {
    process.stderr.write(`${head} refresh error (${e.reason}): ${e.error}\n`);
    return;
  }
  if (e.type === "stop") {
    process.stdout.write(`${head} watch stop (${e.reason})\n`);
    return;
  }
}

export async function cmdWatch({ flags }) {
  const root = resolveRoot(flags);
  const preferGit = flags["no-git"] ? false : true;
  const maxFiles = Number(flags["max-files"] || 4000);
  const snipLines = Number(flags["snip-lines"] || 120);
  const recentDays = Number(flags["recent-days"] || 7);
  const intervalMs = Number(flags.interval || flags["interval-ms"] || 2000);
  const once = !!flags.once;
  const sync = flags["no-sync"] ? false : true;
  const embed = !!flags.embed;
  const mode = String(flags.mode || "brief").toLowerCase();

  await watchRepo(root, {
    preferGit,
    maxFiles,
    snipLines,
    recentDays,
    intervalMs,
    once,
    sync,
    embed,
    onEvent: async (e) => {
      printEvent(e);
      if (e.type === "refresh:ok") {
        process.stdout.write("\n");
        await cmdStatus({ flags: { ...flags, format: "md", mode } });
        process.stdout.write("\n");
      }
    }
  });
}
