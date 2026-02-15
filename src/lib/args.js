export function parseArgs(argv) {
  const flags = {};
  const rest = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === "--") {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const k = a.slice(2);
        // Common boolean flag convention: `--no-foo` means a boolean toggle.
        // Do not accidentally consume the next positional arg as its value.
        if (
          k.startsWith("no-") ||
          k === "help" ||
          k === "force" ||
          k === "staged" ||
          k === "check" ||
          k === "dry-run" ||
          k === "dryrun" ||
          k === "no-hooks" ||
          k === "uninstall" ||
          k === "remove-config" ||
          k === "once" ||
          k === "auto" ||
          k === "allow-refresh" ||
          k === "allow-shutdown" ||
          k === "allow-write" ||
          k === "cors" ||
          k === "embed" ||
          k === "no-status"
        ) {
          flags[k] = true;
          continue;
        }
        const next = argv[i + 1];
        if (next && !next.startsWith("-")) {
          flags[k] = next;
          i++;
        } else {
          flags[k] = true;
        }
      }
      continue;
    }
    if (a.startsWith("-") && a.length > 1) {
      const k = a.slice(1);
      flags[k] = true;
      continue;
    }
    rest.push(a);
  }

  const cmd = rest.shift();
  return { cmd, rest, flags };
}

export function printHelp() {
  const help = `
rmemo - repo memory + dev journal CLI

Usage:
  rmemo init                 Initialize .repo-memory/ and run a scan
  rmemo scan                 Scan repo and update manifest/index
  rmemo log <text>           Append a note to today's journal
  rmemo status               Print a paste-ready status summary (rules/todos/journal)
  rmemo check                Enforce .repo-memory/rules.json (for CI / hooks)
  rmemo sync                 Generate AI tool instruction files from .repo-memory/
  rmemo setup                One-time repo setup: config + git hooks (check + sync)
  rmemo handoff              Generate a single AI handoff markdown (status + journal + git summary)
  rmemo pr                   Generate a PR-ready markdown summary (commits/files + brief status)
  rmemo watch                Watch repo changes and auto-refresh context/sync (long-running)
  rmemo ws                   Monorepo helper: list and run commands in detected subprojects
  rmemo profile              Profiles: apply team defaults (rules + config) for common repo types
  rmemo session              Sessions: start -> note -> end for AI-ready handoff snapshots
  rmemo serve                Repo memory HTTP API (local-first, read-only by default)
  rmemo mcp                  MCP server over stdio (tools: status/context/handoff/pr/rules/todos/search)
  rmemo embed                Build embeddings index and run semantic search (local-first)
  rmemo focus                Generate a paste-ready "focus pack" for a question (status + relevant hits)
  rmemo integrate            Generate paste-ready integration snippets (e.g. Antigravity MCP config)
  rmemo doctor               Diagnose environment + integration issues
  rmemo hook install         Install a git pre-commit hook that runs \`rmemo check\`
  rmemo start                Scan + generate context + print status (daily entrypoint)
  rmemo done                 Append end-of-day notes to journal (supports stdin) and optionally update todos
  rmemo todo add <text>      Add a todo item under "## Next"
  rmemo todo block <text>    Add a blocker under "## Blockers"
  rmemo todo done <n>        Remove the nth item from "## Next"
  rmemo todo unblock <n>     Remove the nth item from "## Blockers"
  rmemo todo ls              Print parsed todos (Next/Blockers)
  rmemo template ls          List built-in templates
  rmemo template apply <id>  Apply a template into .repo-memory/
  rmemo context              Generate .repo-memory/context.md
  rmemo print                Print context.md to stdout (generate first if missing)

Options:
  --root <path>              Repo root (default: cwd)
  --format <md|json>         Output format for status/scan/check/setup --check (default: md)
  --mode <brief|full>        Output detail level for status/start (default: full)
  --template <id>            For init: apply a built-in template (see: rmemo template ls)
  --profile <id>             For init: apply a profile (see: rmemo profile ls)
  --auto                     For init: detect and apply a recommended profile
  --targets <list>           For sync: comma-separated targets (agents,copilot,cursor,cline,claude)
  --check                    For sync: exit non-zero if generated files are out of date
  --dry-run                  For sync: show what would be written without changing files
  --hooks <list>             For setup: comma-separated git hooks (default: pre-commit,post-commit,post-merge,post-checkout)
  --no-hooks                 For setup: do not install any hooks
  --check                    For setup: exit non-zero if hooks/config are missing or out of date
  --uninstall                For setup: remove rmemo-managed hooks (safe; won't touch custom hooks)
  --remove-config            For setup --uninstall: also remove .repo-memory/config.json (backs up first)
  --next <text>              Append a bullet to .repo-memory/todos.md under "## Next"
  --blocker <text>           Append a bullet to .repo-memory/todos.md under "## Blockers"
  --staged                   For check: only validate staged (git index) files
  --force                    Overwrite existing files/hooks when installing (creates backups)
  --max-files <n>            Max files to analyze (default: 4000)
  --snip-lines <n>           Max lines per snippet (default: 120)
  --recent-days <n>          Include recent journal entries (default: 7; for handoff default: 3)
  --since <ref>              For handoff: show git summary since <ref>..HEAD
  --base <ref>               For pr: base branch/ref (default: origin default branch, else main/master)
  --no-refresh               For pr: do not refresh scan/context before generating output
  --max-changes <n>          For handoff/pr: max commits/files to include (default: 200)
  --interval <ms>            For watch: poll interval (default: 2000)
  --once                     For watch: run at most one refresh tick and exit (test/script friendly)
  --no-sync                  For watch: do not run rmemo sync on refresh
  --only <list>              For ws batch: comma-separated subproject dirs to include
  --no-git                   Don't use git for scanning (fallback to filesystem walk)
  --provider <mock|openai>   For embed build: embeddings provider (default: mock)
  --model <id>               For embed build: embeddings model id (openai)
  --api-key <key>            For embed build: override API key (openai)
  --dim <n>                  For embed build: vector dim (mock only; default: 128)
  --kinds <list>             For embed build: comma-separated kinds (rules,todos,context,journal,sessions,handoff,pr)
  --min-score <n>            For embed search: minimum cosine similarity (default: 0.15)
  --k <n>                    For embed search: top-k hits (default: 8)
`;
  process.stdout.write(help.trimStart());
}
