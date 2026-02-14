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
        if (k.startsWith("no-") || k === "help" || k === "force") {
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
  rmemo hook install         Install a git pre-commit hook that runs \`rmemo check\`
  rmemo start                Scan + generate context + print status (daily entrypoint)
  rmemo done                 Append end-of-day notes to journal (supports stdin) and optionally update todos
  rmemo todo add <text>      Add a todo item under "## Next"
  rmemo todo block <text>    Add a blocker under "## Blockers"
  rmemo todo ls              Print parsed todos (Next/Blockers)
  rmemo context              Generate .repo-memory/context.md
  rmemo print                Print context.md to stdout (generate first if missing)

Options:
  --root <path>              Repo root (default: cwd)
  --format <md|json>         Output format for status (default: md)
  --mode <brief|full>        Output detail level for status/start (default: full)
  --next <text>              Append a bullet to .repo-memory/todos.md under "## Next"
  --blocker <text>           Append a bullet to .repo-memory/todos.md under "## Blockers"
  --force                    Overwrite existing git hook (creates backup)
  --max-files <n>            Max files to analyze (default: 4000)
  --snip-lines <n>           Max lines per snippet (default: 120)
  --recent-days <n>          Include recent journal entries (default: 7)
  --no-git                   Don't use git for scanning (fallback to filesystem walk)
`;
  process.stdout.write(help.trimStart());
}
