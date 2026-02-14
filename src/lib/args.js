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
          k === "remove-config"
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
  --format <md|json>         Output format for status/scan/check (default: md)
  --mode <brief|full>        Output detail level for status/start (default: full)
  --template <id>            For init: apply a built-in template (see: rmemo template ls)
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
  --recent-days <n>          Include recent journal entries (default: 7)
  --no-git                   Don't use git for scanning (fallback to filesystem walk)
`;
  process.stdout.write(help.trimStart());
}
