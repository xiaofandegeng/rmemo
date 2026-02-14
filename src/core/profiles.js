import { fileURLToPath } from "node:url";
import { readJson, readText, writeJson } from "../lib/io.js";
import { configPath } from "../lib/paths.js";
import { applyTemplate } from "./templates.js";
import { ensureRepoMemory } from "./memory.js";
import { rulesJsonPath, rulesPath, todosPath } from "../lib/paths.js";

function profilesIndexPath() {
  // src/core/profiles.js -> ../../profiles/index.json
  return fileURLToPath(new URL("../../profiles/index.json", import.meta.url));
}

export async function listProfiles() {
  const idx = await readJson(profilesIndexPath());
  const items = Array.isArray(idx?.profiles) ? idx.profiles : [];
  return items
    .map((p) => ({ id: p.id, title: p.title, description: p.description, templateId: p.templateId || "" }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function getProfile(id) {
  const idx = await readJson(profilesIndexPath());
  const items = Array.isArray(idx?.profiles) ? idx.profiles : [];
  return items.find((p) => p.id === id) || null;
}

function deepMerge(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return b;
  if (a && typeof a === "object" && b && typeof b === "object") {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = deepMerge(a[k], v);
    return out;
  }
  return b;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();
    if (ak.length !== bk.length) return false;
    for (let i = 0; i < ak.length; i++) {
      if (ak[i] !== bk[i]) return false;
      if (!deepEqual(a[ak[i]], b[bk[i]])) return false;
    }
    return true;
  }
  return false;
}

function flattenLeaves(obj, prefix = []) {
  const out = [];
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    out.push({ path: prefix.join("."), value: obj });
    return out;
  }
  for (const [k, v] of Object.entries(obj)) out.push(...flattenLeaves(v, [...prefix, k]));
  return out;
}

function getAtPath(obj, dotPath) {
  const parts = dotPath ? dotPath.split(".") : [];
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

export async function getAppliedProfileId(root) {
  try {
    const cfg = await readJson(configPath(root));
    return cfg?.profile?.id ? String(cfg.profile.id) : "";
  } catch {
    return "";
  }
}

export async function applyProfile(root, id, { force = false } = {}) {
  const p = await getProfile(id);
  if (!p) {
    const items = await listProfiles();
    throw new Error(`Unknown profile id: ${id}\nAvailable:\n- ${items.map((x) => x.id).join("\n- ")}`);
  }

  // Apply template (if any) first, then fill missing files with defaults.
  // This avoids overwriting default rules/todos that `ensureRepoMemory()` would create.
  let tpl = null;
  if (p.templateId) tpl = await applyTemplate(root, p.templateId, { force });
  await ensureRepoMemory(root);

  // Merge defaults into config.json (profile wins).
  let cfg = null;
  try {
    cfg = await readJson(configPath(root));
  } catch {
    cfg = { schema: 1 };
  }
  const merged = deepMerge(cfg, p.defaults || {});
  merged.schema = 1;
  merged.profile = { ...(merged.profile || {}), id: p.id, appliedAt: new Date().toISOString() };
  await writeJson(configPath(root), merged);

  return { id: p.id, templateId: p.templateId || "", config: configPath(root), template: tpl };
}

export async function describeProfile(id) {
  const p = await getProfile(id);
  if (!p) return null;
  return p;
}

export function recommendProfileFromManifest(manifest) {
  const files = [];
  if (Array.isArray(manifest?.keyFiles)) files.push(...manifest.keyFiles);
  if (Array.isArray(manifest?.apiContracts)) files.push(...manifest.apiContracts);
  const subprojects = Array.isArray(manifest?.subprojects) ? manifest.subprojects : [];

  const hasMiniappSignal =
    files.some((f) => String(f).toLowerCase().endsWith("project.config.json")) ||
    subprojects.some((sp) => Array.isArray(sp.reasons) && sp.reasons.some((r) => String(r).startsWith("miniapp:")));

  if (hasMiniappSignal) return "miniapp";

  const frameworks = manifest?.packageJson?.frameworks || [];
  if (Array.isArray(frameworks) && frameworks.includes("vue")) return "web-admin-vue";

  return "generic";
}

async function readTemplateText(templateId, rel) {
  const p = fileURLToPath(new URL(`../../templates/${templateId}/${rel}`, import.meta.url));
  return await readText(p, 2_000_000);
}

export async function checkProfile(root, id) {
  const p = await getProfile(id);
  if (!p) {
    const items = await listProfiles();
    throw new Error(`Unknown profile id: ${id}\nAvailable:\n- ${items.map((x) => x.id).join("\n- ")}`);
  }

  const fileChecks = [];
  if (p.templateId) {
    const expected = {
      [rulesPath(root)]: await readTemplateText(p.templateId, "rules.md"),
      [rulesJsonPath(root)]: await readTemplateText(p.templateId, "rules.json"),
      [todosPath(root)]: await readTemplateText(p.templateId, "todos.md")
    };

    for (const [abs, exp] of Object.entries(expected)) {
      let act = null;
      try {
        act = await readText(abs, 2_000_000);
      } catch {
        fileChecks.push({ path: abs, status: "missing" });
        continue;
      }
      fileChecks.push({ path: abs, status: act === exp ? "same" : "different" });
    }
  }

  let cfg = null;
  try {
    cfg = await readJson(configPath(root));
  } catch {
    cfg = { schema: 1 };
  }

  const configDiffs = [];
  const leaves = flattenLeaves(p.defaults || {});
  for (const leaf of leaves) {
    const actual = getAtPath(cfg, leaf.path);
    if (!deepEqual(actual, leaf.value)) {
      configDiffs.push({ path: leaf.path, expected: leaf.value, actual });
    }
  }

  const ok = fileChecks.every((x) => x.status === "same") && configDiffs.length === 0;

  return {
    schema: 1,
    profile: { id: p.id, templateId: p.templateId || "" },
    ok,
    files: fileChecks,
    config: configDiffs
  };
}
