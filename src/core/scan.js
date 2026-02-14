import fs from "node:fs/promises";
import path from "node:path";
import { hasGit, isGitRepo, listGitFiles } from "../lib/git.js";
import { walkFiles } from "../lib/walk.js";
import { readText } from "../lib/io.js";

function extOf(p) {
  const base = path.posix.basename(p);
  if (base.startsWith(".") && !base.includes(".")) return base; // ".env" style
  const idx = base.lastIndexOf(".");
  return idx === -1 ? "" : base.slice(idx + 1).toLowerCase();
}

function detectFromPackageJson(pkg) {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const depNames = new Set(Object.keys(deps));

  const frameworks = [];
  if (depNames.has("vue")) frameworks.push("vue");
  if (depNames.has("react")) frameworks.push("react");
  if (depNames.has("next")) frameworks.push("nextjs");
  if (depNames.has("nuxt")) frameworks.push("nuxt");
  if (depNames.has("uni-app") || depNames.has("@dcloudio/uni-app")) frameworks.push("uni-app");
  if (depNames.has("@tarojs/taro")) frameworks.push("taro");
  if (depNames.has("vite")) frameworks.push("vite");

  const pkgManager = pkg.packageManager || null;
  const workspaces = pkg.workspaces || null;

  return { frameworks, pkgManager, workspaces, scripts: pkg.scripts || {} };
}

function detectMonorepoSignals(files) {
  const set = new Set(files);
  const signals = [];
  if (set.has("pnpm-workspace.yaml")) signals.push("pnpm-workspace");
  if (set.has("lerna.json")) signals.push("lerna");
  if (set.has("turbo.json")) signals.push("turborepo");
  if (set.has("nx.json")) signals.push("nx");
  if (set.has("rush.json")) signals.push("rush");
  if (set.has("workspace.json")) signals.push("workspace.json");
  return signals;
}

function detectDocsRoots(files) {
  const roots = new Set();
  for (const f of files) {
    if (f.startsWith("docs/")) roots.add("docs");
    if (f.startsWith("doc/")) roots.add("doc");
    if (f.startsWith("documentation/")) roots.add("documentation");
  }
  return Array.from(roots).sort();
}

function detectApiContracts(files) {
  const out = [];
  for (const f of files) {
    const base = path.posix.basename(f).toLowerCase();
    if (base === "openapi.yaml" || base === "openapi.yml" || base === "swagger.yaml" || base === "swagger.yml") out.push(f);
    if (base === "openapi.json" || base === "swagger.json") out.push(f);
  }
  return Array.from(new Set(out)).slice(0, 30);
}

function detectSubprojectCandidates(files) {
  // Heuristic: subproject roots are dirs containing common manifest/config files.
  // Keep it generic and cheap: only look at shallow depths.
  const candidates = new Map(); // dir -> { reasons: Set<string>, files: Set<string> }
  const add = (dir, reason, file) => {
    if (!dir || dir === ".") return;
    const cur = candidates.get(dir) || { reasons: new Set(), files: new Set() };
    cur.reasons.add(reason);
    if (file) cur.files.add(file);
    candidates.set(dir, cur);
  };

  for (const f of files) {
    const parts = f.split("/");
    if (parts.length < 2) continue;
    const dir = parts.slice(0, -1).join("/");
    const base = parts[parts.length - 1];

    // Depth cap: avoid too deep noise
    if (parts.length > 4) continue;

    if (base === "package.json") add(dir, "package.json", f);
    if (base === "pom.xml") add(dir, "pom.xml", f);
    if (base === "go.mod") add(dir, "go.mod", f);
    if (base === "Cargo.toml") add(dir, "Cargo.toml", f);
    if (base === "composer.json") add(dir, "composer.json", f);
    if (base === "pyproject.toml" || base === "requirements.txt") add(dir, "python", f);

    // Miniapp-ish hints (generic, not tied to one vendor)
    if (base === "project.config.json") add(dir, "miniapp:project.config.json", f);
    if (base === "app.json" && dir.includes("mini")) add(dir, "miniapp:app.json", f);
  }

  // Prefer top-level-ish subprojects: unique dirs not nested inside another candidate.
  const dirs = Array.from(candidates.keys()).sort((a, b) => a.length - b.length);
  const filtered = [];
  for (const d of dirs) {
    if (filtered.some((x) => d.startsWith(x + "/"))) continue;
    filtered.push(d);
  }

  return filtered.slice(0, 30).map((dir) => {
    const meta = candidates.get(dir);
    return {
      dir,
      reasons: Array.from(meta.reasons).sort(),
      hintFiles: Array.from(meta.files).sort().slice(0, 10)
    };
  });
}

async function safeJson(absPath) {
  try {
    const s = await readText(absPath);
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function pickTopLevelDirs(files) {
  const counts = new Map();
  for (const f of files) {
    const parts = f.split("/");
    const top = parts[0] || "";
    if (!top || top.startsWith(".")) continue;
    counts.set(top, (counts.get(top) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, fileCount]) => ({ name, fileCount }));
}

function detectRepoType(files) {
  const set = new Set(files);
  const hints = [];
  if (set.has("pom.xml") || [...set].some((p) => p.endsWith("build.gradle") || p.endsWith("build.gradle.kts"))) hints.push("jvm");
  if (set.has("go.mod")) hints.push("go");
  if (set.has("package.json")) hints.push("node");
  if (set.has("Cargo.toml")) hints.push("rust");
  if (set.has("composer.json")) hints.push("php");
  if (set.has("requirements.txt") || set.has("pyproject.toml")) hints.push("python");
  return hints;
}

function detectLockfiles(files) {
  const set = new Set(files);
  const locks = [];
  if (set.has("pnpm-lock.yaml")) locks.push("pnpm-lock.yaml");
  if (set.has("package-lock.json")) locks.push("package-lock.json");
  if (set.has("yarn.lock")) locks.push("yarn.lock");
  if (set.has("bun.lockb")) locks.push("bun.lockb");
  return locks;
}

function pickKeyFiles(files) {
  const wanted = [
    "README.md",
    "README.zh-CN.md",
    "README.zh.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "openapi.yaml",
    "openapi.yml",
    "swagger.yaml",
    "swagger.yml",
    "docker-compose.yml",
    "docker-compose.yaml",
    ".env.example",
    ".env.sample"
  ];
  const set = new Set(files);
  const hits = wanted.filter((p) => set.has(p));

  // plus: .github workflows
  for (const f of files) {
    if (f.startsWith(".github/workflows/") && (f.endsWith(".yml") || f.endsWith(".yaml"))) hits.push(f);
  }
  return Array.from(new Set(hits)).slice(0, 50);
}

function summarizeExtensions(files) {
  const counts = new Map();
  for (const f of files) {
    const ext = extOf(f);
    if (!ext) continue;
    counts.set(ext, (counts.get(ext) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([ext, count]) => ({ ext, count }));
}

export async function scanRepo(root, { maxFiles = 4000, preferGit = true } = {}) {
  let files = [];
  const gitOk = preferGit && (await hasGit()) && (await isGitRepo(root));

  if (gitOk) {
    files = await listGitFiles(root);
  } else {
    files = await walkFiles(root, { maxFiles });
  }

  if (files.length > maxFiles) files = files.slice(0, maxFiles);

  const repoHints = detectRepoType(files);
  const monorepoSignals = detectMonorepoSignals(files);
  const lockfiles = detectLockfiles(files);
  const keyFiles = pickKeyFiles(files);
  const docsRoots = detectDocsRoots(files);
  const apiContracts = detectApiContracts(files);
  const subprojects = detectSubprojectCandidates(files);
  const topDirs = pickTopLevelDirs(files);
  const topExts = summarizeExtensions(files);

  const pkgAbs = path.join(root, "package.json");
  const pkg = await safeJson(pkgAbs);
  const pkgInfo = pkg ? detectFromPackageJson(pkg) : null;
  const monorepo = {
    signals: monorepoSignals,
    rootWorkspaces: pkgInfo?.workspaces || null
  };

  const manifest = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    root,
    usingGit: gitOk,
    fileCount: files.length,
    repoHints,
    monorepo,
    lockfiles,
    topDirs,
    topExts,
    keyFiles,
    docsRoots,
    apiContracts,
    subprojects,
    packageJson: pkg
      ? {
          name: pkg.name || null,
          private: !!pkg.private,
          scripts: pkgInfo?.scripts || {},
          frameworks: pkgInfo?.frameworks || [],
          packageManager: pkgInfo?.pkgManager || null,
          workspaces: pkgInfo?.workspaces || null
        }
      : null
  };

  // Index is for fast context generation without re-walking every time.
  const index = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    files
  };

  // Rough repo title
  let title = null;
  if (pkg?.name) title = pkg.name;
  if (!title) title = path.basename(root);
  manifest.title = title;

  // Try read repo README short summary
  const readme = keyFiles.find((p) => /^README(\..+)?\.md$/i.test(p));
  if (readme) {
    try {
      const s = await readText(path.join(root, readme), 64_000);
      manifest.readmeHead = s.split("\n").slice(0, 40).join("\n");
    } catch {
      // ignore
    }
  }

  return { manifest, index };
}
