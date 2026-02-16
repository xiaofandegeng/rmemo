import { resolveRoot } from "../lib/paths.js";
import { startServe } from "../core/serve.js";

function help() {
  return [
    "Usage:",
    "  rmemo serve [--host 127.0.0.1] [--port 7357] [--token <token>]",
    "",
    "Options:",
    "  --host <host>            Bind host (default: 127.0.0.1)",
    "  --port <n>               Bind port (default: 7357; use 0 for random)",
    "  --token <token>          Require token for all endpoints (recommended)",
    "  --watch                 Start background refresh loop and stream SSE events",
    "  --watch-interval <ms>    Watch interval (default: 2000)",
    "  --watch-no-sync          For --watch: do not run rmemo sync",
    "  --watch-embed            For --watch: also run embed auto",
    "  --allow-refresh          Allow generating handoff/pr on request (?refresh=1)",
    "  --allow-write            Allow write actions (todos/log/sync/embed) over HTTP (token required)",
    "  --allow-shutdown         Allow POST /shutdown (token required if set)",
    "  --cors                   Add permissive CORS headers (*), for local tools",
    ""
  ].join("\n");
}

export async function cmdServe({ flags }) {
  const root = resolveRoot(flags);
  const host = flags.host ? String(flags.host) : "127.0.0.1";
  const port = flags.port !== undefined ? Number(flags.port) : 7357;
  const token = (flags.token ? String(flags.token) : process.env.RMEMO_TOKEN || "").trim();
  const allowRefresh = !!flags["allow-refresh"];
  const allowWrite = !!flags["allow-write"];
  const allowShutdown = !!flags["allow-shutdown"];
  const cors = !!flags.cors;
  const watch = !!flags.watch;
  const watchIntervalMs = flags["watch-interval"] !== undefined ? Number(flags["watch-interval"]) : 2000;
  const watchSync = flags["watch-no-sync"] ? false : true;
  const watchEmbed = !!flags["watch-embed"];

  if (Number.isNaN(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid --port: ${flags.port}`);
  }
  if (Number.isNaN(watchIntervalMs) || watchIntervalMs < 200) {
    throw new Error(`Invalid --watch-interval: ${flags["watch-interval"]}`);
  }

  if (flags.help) {
    process.stdout.write(help() + "\n");
    return;
  }

  const r = await startServe(root, {
    host,
    port,
    token,
    watch,
    watchIntervalMs,
    watchSync,
    watchEmbed,
    allowRefresh,
    allowWrite,
    allowShutdown,
    cors
  });

  process.stdout.write(`Listening: ${r.baseUrl}\n`);
  process.stdout.write(`Root: ${root}\n`);
  process.stdout.write(`Auth: ${token ? "token required" : "none (localhost only recommended)"}\n`);
  process.stdout.write(`Watch: ${watch ? `on (interval=${watchIntervalMs}ms sync=${watchSync ? "yes" : "no"} embed=${watchEmbed ? "yes" : "no"})` : "off"}\n`);
  process.stdout.write(`Endpoints:\n`);
  process.stdout.write(`- GET /health\n`);
  process.stdout.write(`- GET /ui\n`);
  process.stdout.write(`- GET /events (SSE)\n`);
  process.stdout.write(`- GET /events/export?format=json|md&limit=200\n`);
  process.stdout.write(`- GET /diagnostics/export?format=json|md\n`);
  process.stdout.write(`- GET /embed/status?format=json|md\n`);
  process.stdout.write(`- GET /embed/plan?format=json|md&provider=mock&parallelism=4\n`);
  process.stdout.write(`- GET /embed/jobs, /embed/jobs/:id, /embed/jobs/config\n`);
  process.stdout.write(`- GET /watch\n`);
  process.stdout.write(`- GET /status?format=json|md\n`);
  process.stdout.write(`- GET /context\n`);
  process.stdout.write(`- GET /rules, /rules.json, /todos\n`);
  process.stdout.write(`- GET /handoff, /pr\n`);
  process.stdout.write(`- GET /journal, /journal/YYYY-MM-DD.md\n`);
  process.stdout.write(`- GET /search?q=... (mode=keyword|semantic)\n`);
  process.stdout.write(`- GET /focus?q=... (mode=semantic|keyword)\n`);
  process.stdout.write(`- GET /ws/list?only=apps/a,apps/b\n`);
  process.stdout.write(`- GET /ws/focus?q=... (mode=semantic|keyword&only=...)\n`);
  if (allowRefresh) process.stdout.write(`- GET /handoff?refresh=1, /pr?refresh=1\n`);
  if (allowWrite) {
    process.stdout.write(`- POST /refresh {sync?,embed?}\n`);
    process.stdout.write(`- POST /watch/start {intervalMs?,sync?,embed?}\n`);
    process.stdout.write(`- POST /watch/stop\n`);
    process.stdout.write(`- POST /todos/next {text}\n`);
    process.stdout.write(`- POST /todos/blockers {text}\n`);
    process.stdout.write(`- POST /todos/next/done {index}\n`);
    process.stdout.write(`- POST /todos/blockers/unblock {index}\n`);
    process.stdout.write(`- POST /log {text,kind?}\n`);
    process.stdout.write(`- POST /sync\n`);
    process.stdout.write(`- POST /embed/auto\n`);
    process.stdout.write(`- POST /embed/build {force?,useConfig?,provider?,model?,dim?,parallelism?,batchDelayMs?,kinds?...}\n`);
    process.stdout.write(`- POST /embed/jobs {provider?,model?,dim?,parallelism?,batchDelayMs?,priority?,maxRetries?,retryDelayMs?,...}\n`);
    process.stdout.write(`- POST /embed/jobs/config {maxConcurrent}\n`);
    process.stdout.write(`- POST /embed/jobs/:id/cancel\n`);
  }
  if (allowShutdown) process.stdout.write(`- POST /shutdown\n`);

  const shutdown = async () => {
    await r.close();
    process.exitCode = 0;
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  // Keep process alive.
  await new Promise(() => {});
}
