import path from "node:path";
import { fileExists, readJson, readText, writeJson } from "../lib/io.js";

const CONTRACT_SCHEMA = 1;
const SNAPSHOT_DIR = "contracts";

function uniqSorted(items) {
  return Array.from(new Set(items)).sort((a, b) => a.localeCompare(b));
}

function diffItems(current, expected) {
  const cur = new Set(current);
  const exp = new Set(expected);
  const added = [];
  const removed = [];
  for (const v of cur) {
    if (!exp.has(v)) added.push(v);
  }
  for (const v of exp) {
    if (!cur.has(v)) removed.push(v);
  }
  return {
    added: added.sort((a, b) => a.localeCompare(b)),
    removed: removed.sort((a, b) => a.localeCompare(b))
  };
}

function formatRoute(method, route) {
  return `${String(method).toUpperCase()} ${String(route)}`;
}

export async function collectCliContract(root) {
  const p = path.join(root, "bin", "rmemo.js");
  const s = await readText(p);
  const out = [];
  const re = /case\s+"([^"]+)":/g;
  let m;
  while ((m = re.exec(s))) {
    const name = String(m[1]).trim();
    if (!name || name === "help") continue;
    out.push(name);
  }
  return uniqSorted(out);
}

export async function collectHttpContract(root) {
  const p = path.join(root, "src", "core", "serve.js");
  const s = await readText(p);
  const out = [];

  const eqRe = /req\.method\s*===\s*"([A-Z]+)"\s*&&\s*url\.pathname\s*===\s*"([^"]+)"/g;
  let m;
  while ((m = eqRe.exec(s))) out.push(formatRoute(m[1], m[2]));

  const startsRe = /req\.method\s*===\s*"([A-Z]+)"\s*&&\s*url\.pathname\.startsWith\("([^"]+)"\)/g;
  while ((m = startsRe.exec(s))) out.push(formatRoute(m[1], `${m[2]}*`));

  for (const line of s.split("\n")) {
    if (!line.includes("url.pathname.match(")) continue;
    const mm = line.match(/req\.method\s*===\s*"([A-Z]+)".*url\.pathname\.match\((\/.*\/[a-z]*)\)/);
    if (!mm) continue;
    out.push(formatRoute(mm[1], `regex:${mm[2]}`));
  }

  return uniqSorted(out);
}

export async function collectMcpContract(root) {
  const p = path.join(root, "src", "core", "mcp.js");
  const s = await readText(p);
  const out = [];
  const re = /tool\("([^"]+)"/g;
  let m;
  while ((m = re.exec(s))) out.push(String(m[1]));
  return uniqSorted(out);
}

function snapshotsFor(root) {
  const dir = path.join(root, SNAPSHOT_DIR);
  return {
    cli: path.join(dir, "cli.json"),
    http: path.join(dir, "http.json"),
    mcp: path.join(dir, "mcp.json")
  };
}

async function readSnapshotItems(p) {
  if (!(await fileExists(p))) return null;
  const j = await readJson(p);
  if (!j || typeof j !== "object") return [];
  const items = Array.isArray(j.items) ? j.items.map((x) => String(x)) : [];
  return uniqSorted(items);
}

function buildSnapshotBody(kind, items) {
  return {
    schema: CONTRACT_SCHEMA,
    kind,
    items: uniqSorted(items),
    generatedAt: new Date().toISOString()
  };
}

export async function runContractCheck({ root, update = false, failOn = "breaking" }) {
  failOn = String(failOn).toLowerCase();
  if (!["breaking", "any", "none"].includes(failOn)) {
    throw new Error("failOn must be one of: breaking|any|none");
  }
  const snaps = snapshotsFor(root);
  const generated = {
    cli: await collectCliContract(root),
    http: await collectHttpContract(root),
    mcp: await collectMcpContract(root)
  };

  const details = {};
  let driftCount = 0;
  let additiveCount = 0;
  let breakingCount = 0;

  for (const kind of ["cli", "http", "mcp"]) {
    const expected = await readSnapshotItems(snaps[kind]);
    const current = generated[kind];
    if (update) {
      await writeJson(snaps[kind], buildSnapshotBody(kind, current));
      details[kind] = {
        ok: true,
        missingSnapshot: false,
        updatedSnapshot: true,
        added: [],
        removed: [],
        currentCount: current.length,
        additiveCount: 0,
        breakingCount: 0
      };
      continue;
    }
    if (!expected) {
      driftCount += 1;
      breakingCount += 1;
      details[kind] = {
        ok: false,
        missingSnapshot: true,
        updatedSnapshot: false,
        added: [],
        removed: [],
        currentCount: current.length,
        additiveCount: 0,
        breakingCount: 1
      };
      continue;
    }
    const diff = diffItems(current, expected);
    const same = diff.added.length === 0 && diff.removed.length === 0;
    const kindAdditive = diff.added.length;
    const kindBreaking = diff.removed.length;
    driftCount += kindAdditive + kindBreaking;
    additiveCount += kindAdditive;
    breakingCount += kindBreaking;
    details[kind] = {
      ok: same,
      missingSnapshot: false,
      updatedSnapshot: false,
      added: diff.added,
      removed: diff.removed,
      currentCount: current.length,
      snapshotCount: expected.length,
      additiveCount: kindAdditive,
      breakingCount: kindBreaking
    };
  }

  const hasDrift = driftCount > 0;
  const hasBreaking = breakingCount > 0;
  const ok = update || (failOn === "none" ? true : failOn === "any" ? !hasDrift : !hasBreaking);

  return {
    schema: CONTRACT_SCHEMA,
    root,
    snapshotDir: path.relative(root, path.join(root, SNAPSHOT_DIR)) || SNAPSHOT_DIR,
    update,
    failOn,
    ok,
    hasDrift,
    hasBreaking,
    driftCount,
    additiveCount,
    breakingCount,
    details
  };
}

export function formatContractCheckMarkdown(result) {
  const lines = [];
  lines.push("# rmemo contract check");
  lines.push("");
  lines.push(`- root: ${result.root}`);
  lines.push(`- snapshotDir: ${result.snapshotDir}`);
  lines.push(`- mode: ${result.update ? "update" : "check"}`);
  lines.push(`- failOn: ${result.failOn}`);
  lines.push(`- result: ${result.ok ? "OK" : "FAIL"}`);
  if (!result.update) {
    lines.push(`- hasDrift: ${result.hasDrift ? "yes" : "no"}`);
    lines.push(`- hasBreaking: ${result.hasBreaking ? "yes" : "no"}`);
    lines.push(`- additiveCount: ${result.additiveCount}`);
    lines.push(`- breakingCount: ${result.breakingCount}`);
  }
  for (const kind of ["cli", "http", "mcp"]) {
    const d = result.details[kind];
    lines.push("");
    lines.push(`## ${kind}`);
    if (d.missingSnapshot) {
      lines.push("- snapshot: missing");
      lines.push(`- currentCount: ${d.currentCount}`);
      continue;
    }
    lines.push(`- snapshot: ${d.updatedSnapshot ? "updated" : "found"}`);
    lines.push(`- status: ${d.ok ? "OK" : "DIFF"}`);
    lines.push(`- additiveCount: ${d.additiveCount}`);
    lines.push(`- breakingCount: ${d.breakingCount}`);
    lines.push(`- currentCount: ${d.currentCount}`);
    if (!d.updatedSnapshot) lines.push(`- snapshotCount: ${d.snapshotCount}`);
    if (d.added.length) {
      lines.push("- added:");
      for (const x of d.added) lines.push(`  - ${x}`);
    }
    if (d.removed.length) {
      lines.push("- removed:");
      for (const x of d.removed) lines.push(`  - ${x}`);
    }
  }
  return lines.join("\n");
}
