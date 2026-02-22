#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs/promises";
import { extractReleaseNotesFromChangelog, buildReleaseNotesMarkdown } from "../src/core/release_notes.js";

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > 0) {
      flags[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const k = a.slice(2);
    const n = argv[i + 1];
    if (n && !n.startsWith("-")) {
      flags[k] = n;
      i++;
    } else {
      flags[k] = "true";
    }
  }
  return flags;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const root = flags.root ? path.resolve(flags.root) : process.cwd();
  const outFile = flags.out ? path.resolve(root, flags.out) : null;
  let version = String(flags.version || "").trim();
  if (!version) {
    const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    version = String(pkg.version || "").trim();
  }
  if (!version) throw new Error("version is required (--version or package.json version)");

  const changelog = await fs.readFile(path.join(root, "CHANGELOG.md"), "utf8");
  const section = extractReleaseNotesFromChangelog(changelog, version);
  const out = buildReleaseNotesMarkdown({ version, changelogSection: section });

  if (outFile) {
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, out, "utf8");
  }

  process.stdout.write(out);
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e?.message || e) + "\n");
  process.exitCode = 1;
});
