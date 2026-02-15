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
    "  --allow-refresh          Allow generating handoff/pr on request (?refresh=1)",
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
  const allowShutdown = !!flags["allow-shutdown"];
  const cors = !!flags.cors;

  if (Number.isNaN(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid --port: ${flags.port}`);
  }

  if (flags.help) {
    process.stdout.write(help() + "\n");
    return;
  }

  const r = await startServe(root, { host, port, token, allowRefresh, allowShutdown, cors });

  process.stdout.write(`Listening: ${r.baseUrl}\n`);
  process.stdout.write(`Root: ${root}\n`);
  process.stdout.write(`Auth: ${token ? "token required" : "none (localhost only recommended)"}\n`);
  process.stdout.write(`Endpoints:\n`);
  process.stdout.write(`- GET /health\n`);
  process.stdout.write(`- GET /status?format=json|md\n`);
  process.stdout.write(`- GET /context\n`);
  process.stdout.write(`- GET /rules, /rules.json, /todos\n`);
  process.stdout.write(`- GET /handoff, /pr\n`);
  process.stdout.write(`- GET /journal, /journal/YYYY-MM-DD.md\n`);
  process.stdout.write(`- GET /search?q=... (mode=keyword|semantic)\n`);
  process.stdout.write(`- GET /focus?q=... (mode=semantic|keyword)\n`);
  if (allowRefresh) process.stdout.write(`- GET /handoff?refresh=1, /pr?refresh=1\n`);
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
